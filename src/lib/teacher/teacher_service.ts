import { EnrollmentStatus, AssessmentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthorizationError, requirePermission, hasPermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { assertTeacherScope } from '@/lib/auth/scopes';
import { normalizeAttendanceDate } from '@/lib/attendance/attendance_service';

/**
 * Swanford Academy — Teacher Portal Domain Service
 * Master Specification Reference: Sections 8, 14, 16, 18
 */

export interface TeacherClassSummary {
  schoolClassId: string;
  className: string;
  classCode: string;
  arm: string | null;
  programmeId: string;
  programmeName: string;
  programmeCode: string;
  isFormTeacher: boolean;
  subjectId?: string | null;
  subjectName?: string | null;
  studentCount: number;
}

/**
 * Loads teacher profile, active session, and assigned scopes.
 */
export async function getTeacherProfile(userId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          status: true,
          profilePhotoId: true,
        },
      },
      scopes: {
        include: {
          programme: true,
          schoolClass: true,
          subject: true,
          academicSession: true,
        },
      },
    },
  });

  if (!teacher) {
    throw new AuthorizationError(
      'Access denied: Authenticated user does not have a linked teacher profile.',
      403,
      'TEACHER_PROFILE_MISSING'
    );
  }

  const activeSession = await prisma.academicSession.findFirst({
    where: { isCurrent: true },
    include: {
      terms: {
        where: { isCurrent: true },
      },
    },
  });

  return {
    teacher,
    activeSession,
    activeTerm: activeSession?.terms[0] || null,
  };
}

/**
 * Retrieves all assigned classes and student counts for a teacher.
 * Zero assigned classes returns an empty array with 0 students.
 */
export async function getTeacherClasses(userId: string, targetSessionId?: string): Promise<TeacherClassSummary[]> {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      scopes: {
        include: {
          programme: true,
          schoolClass: true,
          subject: true,
        },
      },
    },
  });

  if (!teacher) {
    return [];
  }

  // Determine target session
  let sessionId = targetSessionId;
  if (!sessionId) {
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!activeSession) return [];
    sessionId = activeSession.id;
  }

  // Filter teacher scopes matching this session
  const relevantScopes = teacher.scopes.filter((s) => s.academicSessionId === sessionId);
  if (relevantScopes.length === 0) {
    return [];
  }

  const classMap = new Map<string, TeacherClassSummary>();

  for (const scope of relevantScopes) {
    if (scope.schoolClassId && scope.schoolClass) {
      // Specific assigned class
      const key = `${scope.schoolClassId}_${scope.programmeId}_${scope.subjectId || 'ALL'}`;
      if (!classMap.has(key)) {
        const studentCount = await prisma.studentProgrammeEnrollment.count({
          where: {
            programmeId: scope.programmeId,
            schoolClassId: scope.schoolClassId,
            academicSessionId: sessionId,
            enrollmentStatus: EnrollmentStatus.ACTIVE,
          },
        });

        classMap.set(key, {
          schoolClassId: scope.schoolClassId,
          className: scope.schoolClass.name,
          classCode: scope.schoolClass.code,
          arm: scope.schoolClass.arm,
          programmeId: scope.programmeId,
          programmeName: scope.programme.name,
          programmeCode: scope.programme.code,
          isFormTeacher: scope.isFormTeacher,
          subjectId: scope.subjectId,
          subjectName: scope.subject?.name || null,
          studentCount,
        });
      }
    } else if (!scope.schoolClassId) {
      // Programme-wide scope: load all classes in this programme
      const classes = await prisma.schoolClass.findMany({
        where: { programmeId: scope.programmeId, isActive: true },
      });

      for (const cls of classes) {
        const key = `${cls.id}_${scope.programmeId}_${scope.subjectId || 'ALL'}`;
        if (!classMap.has(key)) {
          const studentCount = await prisma.studentProgrammeEnrollment.count({
            where: {
              programmeId: scope.programmeId,
              schoolClassId: cls.id,
              academicSessionId: sessionId,
              enrollmentStatus: EnrollmentStatus.ACTIVE,
            },
          });

          classMap.set(key, {
            schoolClassId: cls.id,
            className: cls.name,
            classCode: cls.code,
            arm: cls.arm,
            programmeId: scope.programmeId,
            programmeName: scope.programme.name,
            programmeCode: scope.programme.code,
            isFormTeacher: scope.isFormTeacher,
            subjectId: scope.subjectId,
            subjectName: scope.subject?.name || null,
            studentCount,
          });
        }
      }
    }
  }

  return Array.from(classMap.values());
}

/**
 * Retrieves the student roster for an assigned class.
 * Enforces medical privacy: sensitive medical fields are completely omitted
 * unless the user has explicit STUDENT_MEDICAL_VIEW permission.
 */
export async function getTeacherClassRoster(
  userId: string,
  classId: string,
  programmeId: string,
  targetSessionId?: string
) {
  await requirePermission(userId, PermissionCode.STUDENT_VIEW);

  // Determine active session
  let sessionId = targetSessionId;
  if (!sessionId) {
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!activeSession) {
      throw new AuthorizationError('No active academic session found.', 400, 'NO_ACTIVE_SESSION');
    }
    sessionId = activeSession.id;
  }

  // Assert TeacherScope
  await assertTeacherScope(userId, {
    programmeId,
    schoolClassId: classId,
    academicSessionId: sessionId,
  });

  // Check if teacher has medical view permission
  const canViewMedical = await hasPermission(userId, PermissionCode.STUDENT_MEDICAL_VIEW);

  const enrollments = await prisma.studentProgrammeEnrollment.findMany({
    where: {
      programmeId,
      schoolClassId: classId,
      academicSessionId: sessionId,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          preferredName: true,
          gender: true,
          dateOfBirth: true,
          profilePhotoId: true,
          // Operational emergency contact info
          emergencyContactName: true,
          emergencyContactPhone: true,
          emergencyContactRelationship: true,
          // Medical info strictly conditionally included
          bloodGroup: canViewMedical,
          genotype: canViewMedical,
          medicalNotes: canViewMedical,
          allergies: canViewMedical,
          medicalConditions: canViewMedical,
        },
      },
    },
    orderBy: [
      { student: { lastName: 'asc' } },
      { student: { firstName: 'asc' } },
    ],
  });

  return enrollments.map((e) => e.student);
}

/**
 * Retrieves teacher dashboard metrics and quick actions.
 */
export async function getTeacherDashboardSummary(userId: string) {
  const profile = await getTeacherProfile(userId);
  const classes = await getTeacherClasses(userId);

  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);

  // Pending assessment submissions (DRAFT assessments created by this teacher)
  const draftAssessmentsCount = await prisma.assessment.count({
    where: {
      createdById: userId,
      status: AssessmentStatus.DRAFT,
    },
  });

  const submittedAssessmentsCount = await prisma.assessment.count({
    where: {
      createdById: userId,
      status: AssessmentStatus.SUBMITTED,
    },
  });

  // Today's attendance status in Lagos timezone
  const { date: todayDate } = normalizeAttendanceDate(new Date());

  const recordedAttendanceCountToday = await prisma.attendanceRecord.count({
    where: {
      recordedByTeacherId: profile.teacher.id,
      date: todayDate,
    },
  });

  return {
    teacher: profile.teacher,
    activeSession: profile.activeSession,
    activeTerm: profile.activeTerm,
    classesCount: classes.length,
    totalStudents,
    draftAssessmentsCount,
    submittedAssessmentsCount,
    hasRecordedAttendanceToday: recordedAttendanceCountToday > 0,
    classes,
  };
}
