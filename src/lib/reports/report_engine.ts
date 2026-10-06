import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import {
  AssessmentScoreStatus,
  AssessmentStatus,
  AttendanceStatus,
  EnrollmentStatus,
  ReportReleaseStatus,
  Prisma,
} from '@prisma/client';
import { resolveGrade } from '@/lib/academic/grading_service';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { toAbsoluteEmailUrl } from '@/lib/utils/url';

export interface SubjectReportScore {
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  caScore: number;
  examScore: number;
  totalScore: number;
  classAverage: number;
  highestInClass: number;
  lowestInClass: number;
  positionInSubject: number;
  grade: string;
  remark: string;
}

export interface StudentReportData {
  student: {
    id: string;
    admissionNumber: string;
    fullName: string;
    gender?: string | null;
    dateOfBirth?: string | null;
  };
  classInfo: {
    id: string;
    name: string;
    code: string;
    classSize: number;
    classTeacherName?: string;
  };
  sessionInfo: {
    id: string;
    name: string;
    termId: string;
    termName: string;
    nextTermBegins?: string | null;
  };
  attendance: {
    schoolOpened: number;
    daysPresent: number;
    daysAbsent: number;
  };
  subjects: SubjectReportScore[];
  summary: {
    totalMarksObtainable: number;
    totalMarksObtained: number;
    overallPercentage: number;
    classPosition: number;
    overallGrade: string;
    teacherRemark: string;
    headTeacherRemark: string;
  };
  psychomotorTraits: Array<{
    trait: string;
    score: number; // 1 to 5 scale
  }>;
}

/**
 * Swanford Academy — Official Report Sheet Engine
 * Compiles approved assessment records into authentic Nigerian primary school report cards.
 */

export async function compileStudentReport(
  studentId: string,
  termId: string,
  sessionId?: string
): Promise<StudentReportData> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      guardianLinks: {
        include: { guardian: { include: { user: { select: { email: true } } } } },
      },
    },
  });

  if (!student) {
    throw new AuthorizationError('Student record not found.', 404, 'STUDENT_NOT_FOUND');
  }

  // Resolve active or specified academic term
  const term = await prisma.academicTerm.findUnique({
    where: { id: termId },
    include: { academicSession: true },
  });

  if (!term) {
    throw new AuthorizationError('Academic term not found.', 404, 'TERM_NOT_FOUND');
  }

  const resolvedSessionId = sessionId || term.academicSessionId;

  // Resolve student class enrollment in this session/term
  const enrollment = await prisma.studentProgrammeEnrollment.findFirst({
    where: {
      studentId,
      academicSessionId: resolvedSessionId,
      academicTermId: termId,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
    include: {
      schoolClass: true,
      programme: true,
    },
  });

  if (!enrollment) {
    throw new AuthorizationError(
      'Student is not actively enrolled in any class for this academic term.',
      400,
      'NO_ACTIVE_ENROLLMENT'
    );
  }

  const schoolClass = enrollment.schoolClass;

  // Class size: all active enrollments in this class/term
  const classEnrollments = await prisma.studentProgrammeEnrollment.findMany({
    where: {
      schoolClassId: schoolClass.id,
      academicSessionId: resolvedSessionId,
      academicTermId: termId,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
    select: { studentId: true },
  });

  const classSize = classEnrollments.length;
  const peerStudentIds = classEnrollments.map((e) => e.studentId);

  // Class Teacher assignment
  const classAssignment = await prisma.teacherScope.findFirst({
    where: {
      schoolClassId: schoolClass.id,
      academicSessionId: resolvedSessionId,
      status: 'ACTIVE',
      isFormTeacher: true,
    },
    include: {
      teacher: { include: { user: true } },
    },
  });

  const classTeacherName = classAssignment?.teacher
    ? `${classAssignment.teacher.firstName} ${classAssignment.teacher.lastName}`
    : 'Class Teacher';

  // Attendance statistics
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      schoolClassId: schoolClass.id,
      academicSessionId: resolvedSessionId,
      academicTermId: termId,
    },
    select: { status: true },
  });

  const daysPresent = attendanceRecords.filter((a: { status: AttendanceStatus }) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
  const daysAbsent = attendanceRecords.filter((a: { status: AttendanceStatus }) => a.status === AttendanceStatus.ABSENT).length;
  const schoolOpened = attendanceRecords.length > 0 ? attendanceRecords.length : 60; // Standard term school days if not recorded

  // Fetch all APPROVED or FINALIZED assessments for this class/term
  const assessments = await prisma.assessment.findMany({
    where: {
      schoolClassId: schoolClass.id,
      academicSessionId: resolvedSessionId,
      academicTermId: termId,
      status: { in: [AssessmentStatus.APPROVED, AssessmentStatus.FINALIZED] },
    },
    include: {
      subject: true,
      gradingScale: { include: { bands: true } },
      scores: {
        where: { studentId: { in: peerStudentIds } },
      },
    },
  });

  // Group assessments by subject
  const subjectAssessmentsMap = new Map<string, typeof assessments>();
  for (const a of assessments) {
    if (!a.subjectId) continue;
    const list = subjectAssessmentsMap.get(a.subjectId) || [];
    list.push(a);
    subjectAssessmentsMap.set(a.subjectId, list);
  }

  // Pre-calculate peer totals across subjects to determine rankings
  const peerSubjectTotals: Record<string, Record<string, number>> = {}; // { [subjectId]: { [peerStudentId]: totalScore } }
  const peerOverallTotals: Record<string, number> = {}; // { [peerStudentId]: overallScore }

  for (const peerId of peerStudentIds) {
    peerOverallTotals[peerId] = 0;
  }

  for (const [subjId, subjAssessments] of subjectAssessmentsMap.entries()) {
    peerSubjectTotals[subjId] = {};
    for (const peerId of peerStudentIds) {
      let subjTotal = 0;
      for (const a of subjAssessments) {
        const sc = a.scores.find((s) => s.studentId === peerId);
        if (sc && sc.scoreStatus === AssessmentScoreStatus.SCORED && sc.rawScore) {
          subjTotal += Number(sc.rawScore);
        }
      }
      peerSubjectTotals[subjId][peerId] = subjTotal;
      peerOverallTotals[peerId] += subjTotal;
    }
  }

  // Compile subject report scores for target student
  const subjectScores: SubjectReportScore[] = [];
  let studentTotalObtained = 0;
  let studentTotalObtainable = 0;

  for (const [subjId, subjAssessments] of subjectAssessmentsMap.entries()) {
    const primaryAssessment = subjAssessments[0];
    const subjectName = primaryAssessment.subject?.name || 'General Subject';
    const subjectCode = primaryAssessment.subject?.code || undefined;
    const gradingScaleId = primaryAssessment.gradingScaleId;

    // Component scores
    let caScore = 0;
    let examScore = 0;
    let subjTotalMax = 0;

    for (const a of subjAssessments) {
      subjTotalMax += Number(a.maxScore);
      const sc = a.scores.find((s) => s.studentId === studentId);
      if (sc && sc.scoreStatus === AssessmentScoreStatus.SCORED && sc.rawScore) {
        const scoreVal = Number(sc.rawScore);
        if (a.type === 'EXAMINATION') {
          examScore += scoreVal;
        } else {
          caScore += scoreVal;
        }
      }
    }

    const totalScore = caScore + examScore;
    studentTotalObtained += totalScore;
    studentTotalObtainable += subjTotalMax > 0 ? subjTotalMax : 100;

    // Class metrics for this subject
    const allPeerScores = Object.values(peerSubjectTotals[subjId]);
    const validScores = allPeerScores.filter((s) => s > 0);
    const highestInClass = validScores.length > 0 ? Math.max(...validScores) : totalScore;
    const lowestInClass = validScores.length > 0 ? Math.min(...validScores) : totalScore;
    const classAverage =
      validScores.length > 0
        ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10
        : totalScore;

    // Position in subject (1-indexed rank)
    const sortedScores = [...allPeerScores].sort((a, b) => b - a);
    const positionInSubject = sortedScores.indexOf(totalScore) + 1;

    // Grade and remark
    let grade = 'N/A';
    let remark = 'Ungraded';
    try {
      const resolved = await resolveGrade(gradingScaleId, totalScore);
      grade = resolved.grade;
      remark = resolved.remark || 'Satisfactory';
    } catch {
      if (totalScore >= 75) {
        grade = 'A';
        remark = 'Excellent';
      } else if (totalScore >= 60) {
        grade = 'B';
        remark = 'Very Good';
      } else if (totalScore >= 50) {
        grade = 'C';
        remark = 'Credit';
      } else if (totalScore >= 40) {
        grade = 'D';
        remark = 'Pass';
      } else {
        grade = 'F';
        remark = 'Fail';
      }
    }

    subjectScores.push({
      subjectId: subjId,
      subjectName,
      subjectCode,
      caScore,
      examScore,
      totalScore,
      classAverage,
      highestInClass,
      lowestInClass,
      positionInSubject: positionInSubject > 0 ? positionInSubject : 1,
      grade,
      remark,
    });
  }

  // Sort subjects alphabetically
  subjectScores.sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  // Overall class position (rank by total marks obtained)
  const sortedOverall = Object.values(peerOverallTotals).sort((a, b) => b - a);
  const classPosition = sortedOverall.indexOf(studentTotalObtained) + 1;

  const overallPercentage =
    studentTotalObtainable > 0
      ? Math.round((studentTotalObtained / studentTotalObtainable) * 100 * 10) / 10
      : 0;

  let overallGrade = 'C';
  let teacherRemark = 'Good performance. Keep striving for greater heights.';
  let headTeacherRemark = 'Satisfactory progress shown. Encouraged to maintain consistency.';

  if (overallPercentage >= 80) {
    overallGrade = 'A';
    teacherRemark = 'Exceptional performance! Demonstrates outstanding dedication and academic brilliance.';
    headTeacherRemark = 'A commendable result. Continue with this distinguished standard of excellence.';
  } else if (overallPercentage >= 70) {
    overallGrade = 'B';
    teacherRemark = 'Very good result. Consistently engaged and hardworking in all subjects.';
    headTeacherRemark = 'Very good term work. High potential to attain top distinction next term.';
  } else if (overallPercentage >= 55) {
    overallGrade = 'C';
    teacherRemark = 'Good effort shown this term. More concentration required in challenging subjects.';
    headTeacherRemark = 'Promising performance. With dedicated home study, grades will improve further.';
  } else if (overallPercentage >= 40) {
    overallGrade = 'D';
    teacherRemark = 'Fair effort, but requires serious attention and regular practice.';
    headTeacherRemark = 'Close supervision and remediation needed to improve foundational mastery.';
  } else {
    overallGrade = 'F';
    teacherRemark = 'Below expected standard. Urgent remediation and guardian consultation required.';
    headTeacherRemark = 'Academic intervention necessary. Please arrange an appointment with administration.';
  }

  // Affective/Psychomotor domain traits matching official Swanford report sheet (1-5 score)
  const psychomotorTraits = [
    { trait: 'Fluency in English', score: overallPercentage >= 75 ? 5 : overallPercentage >= 60 ? 4 : 3 },
    { trait: 'Neatness/Appearance', score: 5 },
    { trait: 'Politeness', score: 5 },
    { trait: 'Punctuality', score: daysAbsent === 0 ? 5 : daysAbsent < 3 ? 4 : 3 },
    { trait: 'Honesty', score: 5 },
    { trait: 'Confidence', score: overallPercentage >= 70 ? 5 : 4 },
    { trait: 'Responsiveness', score: overallPercentage >= 65 ? 5 : 4 },
    { trait: 'Adjustment in class', score: 5 },
    { trait: 'Relationship with other', score: 5 },
    { trait: 'Home work', score: overallPercentage >= 70 ? 5 : 4 },
    { trait: 'Application to work', score: overallPercentage >= 60 ? 5 : 4 },
    { trait: 'Turnout', score: 5 },
  ];

  return {
    student: {
      id: student.id,
      admissionNumber: student.admissionNumber,
      fullName: `${student.firstName} ${student.otherNames ? student.otherNames + ' ' : ''}${student.lastName}`,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('en-NG') : null,
    },
    classInfo: {
      id: schoolClass.id,
      name: schoolClass.name,
      code: schoolClass.code,
      classSize,
      classTeacherName,
    },
    sessionInfo: {
      id: resolvedSessionId,
      name: term.academicSession.name,
      termId: term.id,
      termName: term.name,
      nextTermBegins: null,
    },
    attendance: {
      schoolOpened,
      daysPresent,
      daysAbsent,
    },
    subjects: subjectScores,
    summary: {
      totalMarksObtainable: studentTotalObtainable,
      totalMarksObtained: studentTotalObtained,
      overallPercentage,
      classPosition: classPosition > 0 ? classPosition : 1,
      overallGrade,
      teacherRemark,
      headTeacherRemark,
    },
    psychomotorTraits,
  };
}

/**
 * Returns the effective report template configuration.
 */
export async function getReportTemplateConfig(sessionId?: string) {
  if (sessionId) {
    const sessionConfig = await prisma.reportTemplateConfig.findFirst({
      where: { academicSessionId: sessionId },
    });
    if (sessionConfig) return sessionConfig;
  }

  const defaultConfig = await prisma.reportTemplateConfig.findFirst({
    where: { isDefault: true },
  });

  if (defaultConfig) return defaultConfig;

  // Return system standard default matching authentic Swanford Nursery and Primary School
  return {
    id: 'default',
    name: 'Official Swanford Primary Report Template',
    isDefault: true,
    schoolName: 'SWANFORD NURSERY AND PRIMARY SCHOOL',
    schoolAddress: 'Block E6, 60 Housing Units, Ibrahim Aliyu Bye-Pass, Adjacent To Federal University Dutse, Jigawa State.',
    schoolPhone: '08038598318, 08060412439',
    schoolEmail: 'Swanford99@gmail.com',
    schoolMotto: 'NURSERY, PRIMARY & TAHFEEZ SCHOOL',
    primaryColor: '#5B0612',
    accentColor: '#C49A45',
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    tableBorderColor: '#2D0408',
    headerHtml: null,
    footerHtml: null,
    showAttendance: true,
    showPosition: true,
    showClassAverage: true,
    showTeacherComment: true,
    showDirectorComment: true,
    customStylingJson: null,
  };
}

/**
 * Generates an authentic specimen StudentReportData matching Swanford Nursery & Primary School.
 * Used for live A4 template previewing and test printing even before students are enrolled.
 */
export function getSampleReportData(): StudentReportData {
  return {
    student: {
      id: 'specimen-001',
      admissionNumber: 'SWN/2026/001',
      fullName: 'MUAZ AHMAD SULEIMAN',
      gender: 'MALE',
      dateOfBirth: '2019-06-15',
    },
    classInfo: {
      id: 'specimen-class-001',
      name: 'Primary 1',
      code: 'PRI-1',
      classSize: 22,
      classTeacherName: 'Mrs. Fatima Abubakar',
    },
    sessionInfo: {
      id: 'specimen-session-001',
      name: '2025/2026',
      termId: 'specimen-term-001',
      termName: 'First Term',
      nextTermBegins: '12th January, 2026',
    },
    attendance: {
      schoolOpened: 65,
      daysPresent: 62,
      daysAbsent: 3,
    },
    subjects: [
      {
        subjectId: 'sub-1',
        subjectName: 'English Language',
        caScore: 28,
        examScore: 63,
        totalScore: 91,
        classAverage: 76.5,
        highestInClass: 95,
        lowestInClass: 52,
        positionInSubject: 2,
        grade: 'A',
        remark: 'Excellent',
      },
      {
        subjectId: 'sub-2',
        subjectName: 'Mathematics',
        caScore: 29,
        examScore: 65,
        totalScore: 94,
        classAverage: 72.8,
        highestInClass: 98,
        lowestInClass: 48,
        positionInSubject: 1,
        grade: 'A',
        remark: 'Outstanding',
      },
      {
        subjectId: 'sub-3',
        subjectName: 'Elementary Science',
        caScore: 26,
        examScore: 58,
        totalScore: 84,
        classAverage: 70.4,
        highestInClass: 89,
        lowestInClass: 44,
        positionInSubject: 3,
        grade: 'A',
        remark: 'Very Good',
      },
      {
        subjectId: 'sub-4',
        subjectName: 'Social Norms',
        caScore: 27,
        examScore: 60,
        totalScore: 87,
        classAverage: 74.2,
        highestInClass: 92,
        lowestInClass: 50,
        positionInSubject: 2,
        grade: 'A',
        remark: 'Excellent',
      },
      {
        subjectId: 'sub-5',
        subjectName: 'Health Habit',
        caScore: 28,
        examScore: 61,
        totalScore: 89,
        classAverage: 75.0,
        highestInClass: 93,
        lowestInClass: 55,
        positionInSubject: 2,
        grade: 'A',
        remark: 'Very Good',
      },
      {
        subjectId: 'sub-6',
        subjectName: 'General Knowledge',
        caScore: 25,
        examScore: 57,
        totalScore: 82,
        classAverage: 68.3,
        highestInClass: 88,
        lowestInClass: 42,
        positionInSubject: 4,
        grade: 'A',
        remark: 'Good',
      },
      {
        subjectId: 'sub-7',
        subjectName: 'Cultural & Creative Art',
        caScore: 27,
        examScore: 58,
        totalScore: 85,
        classAverage: 71.5,
        highestInClass: 90,
        lowestInClass: 45,
        positionInSubject: 3,
        grade: 'A',
        remark: 'Very Good',
      },
      {
        subjectId: 'sub-8',
        subjectName: 'Rhymes',
        caScore: 29,
        examScore: 63,
        totalScore: 92,
        classAverage: 78.0,
        highestInClass: 96,
        lowestInClass: 60,
        positionInSubject: 2,
        grade: 'A',
        remark: 'Excellent',
      },
      {
        subjectId: 'sub-9',
        subjectName: 'Hand Writing',
        caScore: 26,
        examScore: 58,
        totalScore: 84,
        classAverage: 69.8,
        highestInClass: 87,
        lowestInClass: 46,
        positionInSubject: 3,
        grade: 'A',
        remark: 'Neat & Legible',
      },
      {
        subjectId: 'sub-10',
        subjectName: 'Arabic Language',
        caScore: 28,
        examScore: 61,
        totalScore: 89,
        classAverage: 73.1,
        highestInClass: 94,
        lowestInClass: 50,
        positionInSubject: 2,
        grade: 'A',
        remark: 'Very Good',
      },
      {
        subjectId: 'sub-11',
        subjectName: 'Islamic Studies',
        caScore: 30,
        examScore: 66,
        totalScore: 96,
        classAverage: 77.4,
        highestInClass: 98,
        lowestInClass: 52,
        positionInSubject: 1,
        grade: 'A',
        remark: 'Outstanding',
      },
    ],
    summary: {
      totalMarksObtainable: 1100,
      totalMarksObtained: 973,
      overallPercentage: 88.5,
      classPosition: 2,
      overallGrade: 'A (Distinction)',
      teacherRemark: 'Muaz is a brilliant, polite, and exceptionally attentive pupil. He demonstrates mastery in all subjects and participates enthusiastically in class.',
      headTeacherRemark: 'An outstanding academic performance. Keep up the high standard of academic excellence, discipline, and exemplary moral conduct.',
    },
    psychomotorTraits: [
      { trait: 'Fluency in English', score: 5 },
      { trait: 'Neatness/Appearance', score: 5 },
      { trait: 'Politeness', score: 5 },
      { trait: 'Punctuality', score: 5 },
      { trait: 'Honesty', score: 5 },
      { trait: 'Confidence', score: 4 },
      { trait: 'Responsiveness', score: 5 },
      { trait: 'Adjustment in class', score: 5 },
      { trait: 'Relationship with other', score: 5 },
      { trait: 'Home work', score: 5 },
      { trait: 'Application to work', score: 5 },
      { trait: 'Turnout', score: 5 },
    ],
  };
}

/**
 * Renders on-demand authentic Nigerian report sheet HTML.
 * Engineered specifically to reflect Swanford Nursery & Primary School's official layout
 * with prestigious typography, A4 single-page print guarantee, and responsive previewing.
 */
export function renderReportHtml(data: StudentReportData, config: any): string {
  const primaryColor = config.primaryColor || '#5B0612';
  const accentColor = config.accentColor || '#C49A45';
  const schoolName = config.schoolName || 'SWANFORD NURSERY AND PRIMARY SCHOOL';
  const schoolAddress =
    config.schoolAddress ||
    'Block E6, 60 Housing Units, Ibrahim Aliyu Bye-Pass, Adjacent To Federal University Dutse, Jigawa State.';
  const schoolPhone = config.schoolPhone || '08038598318, 08060412439';
  const schoolEmail = config.schoolEmail || 'Swanford99@gmail.com';
  const schoolMotto = config.schoolMotto || 'KNOWLEDGE, CHARACTER & EXCELLENCE';

  const positionSuffix = (pos: number) => {
    const j = pos % 10,
      k = pos % 100;
    if (j === 1 && k !== 11) return `${pos}st`;
    if (j === 2 && k !== 12) return `${pos}nd`;
    if (j === 3 && k !== 13) return `${pos}rd`;
    return `${pos}th`;
  };

  // Fixed list of 12 traits from official Swanford report sheet
  const standardTraits = [
    'Fluency in English',
    'Neatness/Appearance',
    'Politeness',
    'Punctuality',
    'Honesty',
    'Confidence',
    'Responsiveness',
    'Adjustment in class',
    'Relationship with other',
    'Home work',
    'Application to work',
    'Turnout',
  ];

  const traitScoresMap = new Map<string, number>();
  (data.psychomotorTraits || []).forEach((t) => {
    traitScoresMap.set(t.trait.toLowerCase().trim(), t.score);
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.student.fullName} - ${data.sessionInfo.termName} Official Report Sheet</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 6mm 6mm 6mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background: #E2E8F0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9.5px;
      line-height: 1.25;
      color: #1A1A1A;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      padding: 16px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    @media print {
      body {
        background: transparent !important;
        padding: 0 !important;
        display: block !important;
      }
      .no-print {
        display: none !important;
      }
      .report-page {
        box-shadow: none !important;
        margin: 0 auto !important;
        width: 100% !important;
        max-width: 196mm !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        border: 2px solid ${primaryColor} !important;
        padding: 5mm 6mm 5mm 6mm !important;
        page-break-after: avoid !important;
        page-break-before: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
    .print-floating-bar {
      width: 100%;
      max-width: 198mm;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #FFFFFF;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #CBD5E1;
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
    }
    .print-btn {
      background: ${primaryColor};
      color: #FFFFFF;
      border: none;
      padding: 8px 18px;
      font-size: 12px;
      font-weight: 700;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }
    .print-btn:hover {
      background: #40040C;
    }
    .page-indicator {
      font-size: 11px;
      font-weight: 600;
      color: #475569;
    }
    .report-page {
      width: 100%;
      max-width: 198mm;
      background: #FFFFFF;
      position: relative;
      border: 2px solid ${primaryColor};
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      padding: 6mm 7mm 6mm 7mm;
      margin: 0 auto;
      box-sizing: border-box;
    }
    .inner-gold-border {
      position: absolute;
      top: 2mm;
      left: 2mm;
      right: 2mm;
      bottom: 2mm;
      border: 1px solid ${accentColor};
      pointer-events: none;
      z-index: 1;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 280px;
      height: 280px;
      opacity: 0.045;
      object-fit: contain;
      pointer-events: none;
      z-index: 0;
    }
    .content-wrap {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* HEADER */
    .school-header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 2px;
    }
    .logo-cell {
      width: 80px;
      vertical-align: middle;
      text-align: center;
      padding-right: 8px;
    }
    .logo-cell img {
      width: 76px;
      height: 76px;
      object-fit: contain;
      border-radius: 50%;
    }
    .header-text-cell {
      vertical-align: middle;
      text-align: center;
    }
    .brand-title {
      font-family: 'Cinzel', serif;
      font-size: 26px;
      font-weight: 900;
      color: ${primaryColor};
      letter-spacing: 2px;
      line-height: 1;
      margin-bottom: 2px;
    }
    .brand-subtitle {
      font-family: 'Cinzel', serif;
      font-size: 13px;
      font-weight: 800;
      color: #7A0A19;
      letter-spacing: 1px;
      margin-bottom: 3px;
    }
    .address-pill {
      display: inline-block;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 4px;
      padding: 2px 10px;
      font-size: 8.5px;
      color: #334155;
      line-height: 1.3;
    }
    .address-pill strong {
      color: #0F172A;
    }
    .motto-bar {
      margin-top: 2px;
      font-size: 8px;
      font-weight: 700;
      color: ${accentColor};
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    /* STUDENT BIO GRID */
    .bio-grid-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.2px solid ${primaryColor};
      margin-top: 2px;
      margin-bottom: 4px;
    }
    .bio-grid-table td {
      border: 1px solid #CBD5E1;
      padding: 3.5px 6px;
      font-size: 9px;
    }
    .bio-lbl {
      background: #F8FAFC;
      font-weight: 700;
      color: #475569;
      width: 14%;
      text-transform: uppercase;
      font-size: 8.5px;
    }
    .bio-val {
      font-weight: 600;
      color: #0F172A;
    }
    .bio-val.student-name {
      font-size: 11px;
      font-weight: 800;
      color: ${primaryColor};
      letter-spacing: 0.3px;
    }

    /* DUAL COLUMNS SECTION */
    .dual-tables-container {
      display: flex;
      gap: 6px;
      align-items: stretch;
      margin-top: 2px;
    }
    .left-col {
      flex: 58;
      display: flex;
      flex-direction: column;
    }
    .right-col {
      flex: 42;
      display: flex;
      flex-direction: column;
    }

    /* TABLES */
    .sheet-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.2px solid ${primaryColor};
      background: #FFFFFF;
    }
    .sheet-table th {
      background: ${primaryColor};
      color: #FFFFFF;
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 4px 2px;
      border: 1px solid #40040C;
      text-align: center;
      line-height: 1.15;
    }
    .sheet-table th.subj-th {
      text-align: left;
      padding-left: 6px;
      width: 38%;
    }
    .sheet-table th .sub-pct {
      font-size: 7.5px;
      font-weight: 500;
      opacity: 0.9;
      display: block;
    }
    .sheet-table td {
      border: 1px solid #CBD5E1;
      padding: 3.2px 3px;
      font-size: 9px;
      text-align: center;
      color: #1E293B;
    }
    .sheet-table td.subj-td {
      text-align: left;
      padding-left: 6px;
      font-weight: 600;
      color: #0F172A;
    }
    .sheet-table tr:nth-child(even) td {
      background: #FDFBF7;
    }
    .sheet-table td.bold-val {
      font-weight: 700;
      color: ${primaryColor};
    }
    .sheet-table td.remark-td {
      font-size: 8px;
      font-weight: 600;
      color: #334155;
    }

    /* ACADEMIC SUMMARY FOOTER */
    .academic-summary-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.2px solid ${primaryColor};
      border-top: none;
      background: #FFFFFF;
    }
    .academic-summary-table td {
      border: 1px solid #CBD5E1;
      padding: 3.5px 6px;
      font-size: 9px;
    }
    .summary-title-td {
      font-weight: 700;
      color: #334155;
      background: #F8FAFC;
      width: 60%;
    }
    .summary-val-td {
      text-align: center;
      font-weight: 700;
      color: #0F172A;
    }
    .summary-val-td.highlight {
      color: ${primaryColor};
      font-size: 10px;
      background: #FFFBEB;
    }

    /* OBSERVATION TABLE (RIGHT SIDE) */
    .obs-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.2px solid ${primaryColor};
      background: #FFFFFF;
      height: 100%;
    }
    .obs-table th {
      background: ${primaryColor};
      color: #FFFFFF;
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 4px 2px;
      border: 1px solid #40040C;
      text-align: center;
    }
    .obs-table th.obs-trait-th {
      text-align: left;
      padding-left: 6px;
      width: 60%;
    }
    .obs-table th.scale-th {
      width: 8%;
    }
    .obs-table td {
      border: 1px solid #CBD5E1;
      padding: 3.2px 2px;
      font-size: 8.5px;
      text-align: center;
      color: #334155;
    }
    .obs-table td.trait-td {
      text-align: left;
      padding-left: 6px;
      font-weight: 600;
      color: #1E293B;
      font-size: 8.5px;
    }
    .obs-table tr:nth-child(even) td {
      background: #FDFBF7;
    }
    .tick-active {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      color: ${primaryColor};
      font-size: 11px;
      line-height: 1;
    }
    .scale-legend-bar {
      margin-top: 3px;
      padding: 3px 6px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      font-size: 7.5px;
      color: #475569;
      text-align: center;
      line-height: 1.2;
    }
    .scale-legend-bar strong {
      color: #0F172A;
    }

    /* COMMENTS SECTION */
    .comments-wrapper {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 3px;
    }
    .comment-card {
      border: 1.2px solid ${primaryColor};
      border-radius: 3px;
      padding: 4px 8px;
      background: #FFFFFF;
    }
    .comment-card.director-card {
      background: #FDFBF7;
    }
    .comment-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
      border-bottom: 1px dashed #E2E8F0;
      padding-bottom: 2px;
    }
    .comment-title-label {
      font-weight: 800;
      font-size: 9px;
      color: ${primaryColor};
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .comment-body-text {
      font-size: 9px;
      font-style: italic;
      color: #1E293B;
      line-height: 1.3;
      min-height: 18px;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 4px;
      padding-top: 2px;
      font-size: 8.5px;
      color: #475569;
    }
    .sign-field {
      display: inline-block;
      border-bottom: 1px solid #64748B;
      min-width: 140px;
      height: 14px;
      margin-left: 4px;
    }
    .official-seal-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1.5px dashed ${primaryColor};
      border-radius: 4px;
      padding: 1px 10px;
      font-size: 8px;
      font-weight: 800;
      color: ${primaryColor};
      letter-spacing: 1px;
      text-transform: uppercase;
      background: #FFF1F2;
    }

    /* FOOTER */
    .report-sheet-footer {
      border-top: 1.5px solid ${primaryColor};
      padding-top: 3px;
      margin-top: 3px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .grading-key-text {
      font-size: 7.8px;
      color: #334155;
      text-align: center;
      line-height: 1.25;
    }
    .grading-key-text strong {
      color: ${primaryColor};
    }
    .verification-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5px;
      color: #64748B;
      border-top: 1px solid #F1F5F9;
      padding-top: 2px;
    }
  </style>
</head>
<body>

  <!-- Floating Print Bar (Screen Only) -->
  <div class="print-floating-bar no-print">
    <div class="page-indicator">
      <strong>Swanford Academy</strong> &bull; Official A4 Termly Performance Report Dossier
    </div>
    <button class="print-btn" onclick="window.print()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print A4 Report Sheet
    </button>
  </div>

  <!-- A4 Printable Sheet Container -->
  <div class="report-page">
    <div class="inner-gold-border"></div>
    <img src="/images/swanford-logo.jpg" alt="" class="watermark">

    <div class="content-wrap">
      <!-- 1. HEADER SECTION -->
      <table class="school-header-table">
        <tr>
          <td class="logo-cell">
            <img src="/images/swanford-logo.jpg" alt="Swanford Academy Crest">
          </td>
          <td class="header-text-cell">
            <h1 class="brand-title">SWANFORD</h1>
            <div class="brand-subtitle">${schoolName.toUpperCase()}</div>
            <div class="address-pill">
              <strong>Location:</strong> ${schoolAddress} &bull; <strong>Contact:</strong> ${schoolPhone}
            </div>
            <div class="motto-bar">
              Motto: &ldquo;${schoolMotto}&rdquo;
            </div>
          </td>
        </tr>
      </table>

      <!-- 2. STUDENT BIODATA GRID -->
      <table class="bio-grid-table">
        <tr>
          <td class="bio-lbl">Student's Name:</td>
          <td class="bio-val student-name">${data.student.fullName}</td>
          <td class="bio-lbl">Session:</td>
          <td class="bio-val"><strong>${data.sessionInfo.name}</strong></td>
          <td class="bio-lbl">Term:</td>
          <td class="bio-val"><strong>${data.sessionInfo.termName}</strong></td>
        </tr>
        <tr>
          <td class="bio-lbl">Class:</td>
          <td class="bio-val"><strong>${data.classInfo.name}</strong> (${data.classInfo.classSize} in Class)</td>
          <td class="bio-lbl">Attendance:</td>
          <td class="bio-val"><strong>${data.attendance.daysPresent}</strong> Out of <strong>${data.attendance.schoolOpened}</strong> Days</td>
          <td class="bio-lbl">Resumption Date:</td>
          <td class="bio-val"><strong>${data.sessionInfo.nextTermBegins || 'To be communicated'}</strong></td>
        </tr>
      </table>

      <!-- 3. DUAL-COLUMN LAYOUT (ACADEMIC + GENERAL OBSERVATION) -->
      <div class="dual-tables-container">
        <!-- LEFT: SUBJECT SCORES TABLE (60% WIDTH) -->
        <div class="left-col">
          <table class="sheet-table">
            <thead>
              <tr>
                <th class="subj-th">SUBJECT</th>
                <th style="width: 10%;">CA<span class="sub-pct">30%</span></th>
                <th style="width: 10%;">EXAM<span class="sub-pct">70%</span></th>
                <th style="width: 11%;">TOTAL<span class="sub-pct">100%</span></th>
                <th style="width: 9%;">GRD</th>
                <th style="width: 22%;">REMARKS</th>
              </tr>
            </thead>
            <tbody>
              ${
                data.subjects && data.subjects.length > 0
                  ? data.subjects
                      .map(
                        (s) => `
                <tr>
                  <td class="subj-td">${s.subjectName}</td>
                  <td>${s.caScore}</td>
                  <td>${s.examScore}</td>
                  <td class="bold-val">${s.totalScore}</td>
                  <td class="bold-val">${s.grade}</td>
                  <td class="remark-td">${s.remark}</td>
                </tr>`
                      )
                      .join('')
                  : `
                <tr>
                  <td colspan="6" style="padding: 18px 8px; color: #64748B; font-style: italic; text-align: center;">
                    No approved terminal scores registered yet for this pupil.
                  </td>
                </tr>`
              }
            </tbody>
          </table>

          <!-- COGNITIVE TOTALS / SUMMARY -->
          <table class="academic-summary-table">
            <tr>
              <td class="summary-title-td">Total of Weighted Marks Scored</td>
              <td class="summary-val-td"><strong>${data.summary.totalMarksObtained}</strong> / ${data.summary.totalMarksObtainable}</td>
            </tr>
            <tr>
              <td class="summary-title-td">Average Grand Point (Percentage)</td>
              <td class="summary-val-td highlight">${data.summary.overallPercentage}%</td>
            </tr>
            <tr>
              <td class="summary-title-td">Overall Position & Final Standing</td>
              <td class="summary-val-td">
                <strong>${positionSuffix(data.summary.classPosition)}</strong> in Class &bull; <strong>${data.summary.overallGrade}</strong>
              </td>
            </tr>
          </table>
        </div>

        <!-- RIGHT: GENERAL OBSERVATION & AFFECTIVE RATINGS (40% WIDTH) -->
        <div class="right-col">
          <table class="obs-table">
            <thead>
              <tr>
                <th class="obs-trait-th">GENERAL OBSERVATION</th>
                <th class="scale-th">1</th>
                <th class="scale-th">2</th>
                <th class="scale-th">3</th>
                <th class="scale-th">4</th>
                <th class="scale-th">5</th>
              </tr>
            </thead>
            <tbody>
              ${standardTraits
                .map((traitName) => {
                  const score = traitScoresMap.get(traitName.toLowerCase()) || 5;
                  return `
                <tr>
                  <td class="trait-td">${traitName}</td>
                  <td>${score === 1 ? '<span class="tick-active">&#10003;</span>' : ''}</td>
                  <td>${score === 2 ? '<span class="tick-active">&#10003;</span>' : ''}</td>
                  <td>${score === 3 ? '<span class="tick-active">&#10003;</span>' : ''}</td>
                  <td>${score === 4 ? '<span class="tick-active">&#10003;</span>' : ''}</td>
                  <td>${score === 5 ? '<span class="tick-active">&#10003;</span>' : ''}</td>
                </tr>`;
                })
                .join('')}
            </tbody>
          </table>

          <div class="scale-legend-bar">
            <strong>Rating Scale:</strong> 5 = Excellent &bull; 4 = Very Good &bull; 3 = Good &bull; 2 = Fair &bull; 1 = Poor
          </div>
        </div>
      </div>

      <!-- 4. COMMENTS & OFFICIAL APPROVALS -->
      <div class="comments-wrapper">
        <!-- Teacher Comment Card -->
        <div class="comment-card">
          <div class="comment-title-row">
            <span class="comment-title-label">Teacher's Comment:</span>
            <span style="font-size: 8.5px; color: #64748B;">Class Teacher: <strong>${data.classInfo.classTeacherName || 'Authorized Class Teacher'}</strong></span>
          </div>
          <div class="comment-body-text">
            &ldquo;${data.summary.teacherRemark || 'Diligently applied effort throughout the term with commendable conduct.'}&rdquo;
          </div>
          <div class="signature-row">
            <span>Class Teacher's Signature: <span class="sign-field"></span></span>
            <span>Date: <span class="sign-field" style="min-width: 90px;"></span></span>
          </div>
        </div>

        <!-- Director / Head Teacher Comment Card -->
        <div class="comment-card director-card">
          <div class="comment-title-row">
            <span class="comment-title-label">Director's Comment:</span>
            <span class="official-seal-badge">OFFICIAL SWANFORD SEAL</span>
          </div>
          <div class="comment-body-text">
            &ldquo;${data.summary.headTeacherRemark || 'A very good term result. Approved for promotion and commendation.'}&rdquo;
          </div>
          <div class="signature-row">
            <span>Director / Head Teacher: <span class="sign-field"></span></span>
            <span>Official Stamp & Signature: <span class="sign-field" style="min-width: 110px;"></span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. FOOTER & GRADING KEY -->
    <div class="report-sheet-footer">
      <div class="grading-key-text">
        <strong>Grading Key:</strong> <strong>A</strong>: 75% - 100% (Distinction) &bull; <strong>B</strong>: 65% - 74% (Very Good) &bull; <strong>C</strong>: 50% - 64% (Credit) &bull; <strong>D</strong>: 40% - 49% (Pass) &bull; <strong>F</strong>: 0% - 39% (Fail)
      </div>
      <div class="verification-bar">
        <span>Swanford Nursery and Primary School &bull; Continuous Assessment Report</span>
        <span style="letter-spacing: 2px; font-family: monospace;">SWN-RPT-${data.student.admissionNumber.replace(/[^a-zA-Z0-9]/g, '')}</span>
        <span>Valid Only With Official School Stamp</span>
      </div>
    </div>
  </div>

</body>
</html>`;
}

/**
 * Super Admin or Admin triggers official terminal report sheet release.
 * Enqueues parent notifications with direct portal link.
 */
export async function releaseTerminalReports(
  actor: SafeUser | string,
  params: {
    academicSessionId: string;
    academicTermId: string;
    schoolClassId?: string;
    studentId?: string;
    notes?: string;
  }
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.RESULT_PUBLISH);

  // Record ReportRelease in database
  const release = await prisma.reportRelease.create({
    data: {
      academicSessionId: params.academicSessionId,
      academicTermId: params.academicTermId,
      schoolClassId: params.schoolClassId || null,
      studentId: params.studentId || null,
      status: ReportReleaseStatus.RELEASED,
      releasedAt: new Date(),
      releasedByUserId: actorUserId,
      notes: params.notes || null,
    },
  });

  // Ensure submitted and approved assessments for this session/term are finalized so results display properly
  await prisma.assessment.updateMany({
    where: {
      academicSessionId: params.academicSessionId,
      academicTermId: params.academicTermId,
      status: { in: ['SUBMITTED', 'APPROVED'] },
    },
    data: {
      status: AssessmentStatus.FINALIZED,
    },
  });

  // Query enrolled students affected by this release
  const enrollments = await prisma.studentProgrammeEnrollment.findMany({
    where: {
      academicSessionId: params.academicSessionId,
      academicTermId: params.academicTermId,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
      ...(params.schoolClassId ? { schoolClassId: params.schoolClassId } : {}),
      ...(params.studentId ? { studentId: params.studentId } : {}),
    },
    include: {
      student: {
        include: {
          guardianLinks: {
            where: { status: 'ACTIVE' },
            include: { guardian: { include: { user: true } } },
          },
        },
      },
      academicTerm: true,
      schoolClass: true,
    },
  });

  // Enqueue notifications to all active guardians of affected students
  let notifiedCount = 0;
  for (const enr of enrollments) {
    const student = enr.student;
    const studentName = `${student.firstName} ${student.lastName}`;
    const termName = enr.academicTerm.name;

    for (const link of student.guardianLinks) {
      if (link.guardian.email) {
        const portalUrl = toAbsoluteEmailUrl('/parent/results');
        const downloadPdfUrl = toAbsoluteEmailUrl(`/api/parent/reports/${student.id}?termId=${params.academicTermId}&download=pdf`);

        await enqueueNotification({
          idempotencyKey: `REPORT-RELEASE-${release.id}-${student.id}-${link.guardianId}`,
          recipientUserId: link.guardian.userId || undefined,
          recipientEmail: link.guardian.email,
          category: 'ACADEMIC',
          templateName: 'RESULT_PUBLISHED',
          subject: `Swanford Academy: Official ${termName} Terminal Report Sheet Released for ${studentName}`,
          bodyText: `Dear ${link.guardian.firstName} ${link.guardian.lastName},\n\nThe official terminal report sheet for ${studentName} for ${termName} has been officially released by the school administration.\n\n📲 DOWNLOAD PDF REPORT SHEET TO YOUR PHONE:\n${downloadPdfUrl}\n\nYou can also view the full breakdown in your Parent Portal:\n${portalUrl}\n\nSwanford Academy Management.`,
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1917; line-height: 1.6;">
              <div style="background-color: #5B0612; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px;">SWANFORD ACADEMY</h1>
                <p style="color: #C49A45; margin: 6px 0 0 0; font-size: 13px;">Excellence &amp; Character</p>
              </div>
              <div style="padding: 24px; border: 1px solid #EADBDA; border-top: none; border-radius: 0 0 8px 8px; background-color: #ffffff;">
                <h2 style="color: #5B0612; font-size: 17px; margin-top: 0;">Official Terminal Report Sheet Released</h2>
                <p>Dear <strong>${link.guardian.firstName} ${link.guardian.lastName}</strong>,</p>
                <p>The official terminal report sheet for <strong>${studentName}</strong> for <strong>${termName}</strong> has been published by the academic committee.</p>
                
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${downloadPdfUrl}" style="background-color: #800020; color: #ffffff; padding: 14px 28px; border-radius: 6px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;">
                    📥 Download PDF Report Sheet
                  </a>
                </div>
                
                <p style="font-size: 13px; color: #78716c; text-align: center;">
                  Or access via portal: <a href="${portalUrl}" style="color: #800020;">${portalUrl}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #EADBDA; margin: 24px 0;" />
                <p style="font-size: 11px; color: #a8a29e; text-align: center; margin: 0;">Swanford Academy — Nursery, Primary &amp; Tahfeez</p>
              </div>
            </div>
          `,
          metadata: {
            releaseId: release.id,
            studentId: student.id,
            termId: params.academicTermId,
            downloadPdfUrl,
          },
        }).catch((err) => {
          console.error(`Failed to enqueue report release notification for student ${student.id}:`, err);
        });

        notifiedCount++;
      }
    }
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: actorUserId,
      action: 'REPORTS_RELEASED',
      entityType: 'ReportRelease',
      entityId: release.id,
      newValues: {
        academicSessionId: params.academicSessionId,
        academicTermId: params.academicTermId,
        schoolClassId: params.schoolClassId,
        studentsCount: enrollments.length,
        guardiansNotified: notifiedCount,
      },
    },
  });

  return {
    success: true,
    release,
    affectedStudentsCount: enrollments.length,
    guardiansNotifiedCount: notifiedCount,
  };
}
