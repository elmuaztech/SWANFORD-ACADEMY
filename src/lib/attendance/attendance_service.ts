import { AttendanceStatus, EnrollmentStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { assertTeacherScope } from '@/lib/auth/scopes';
import { LAGOS_TIMEZONE } from '@/lib/config/timezone';

export interface RecordAttendanceItem {
  studentId: string;
  status: AttendanceStatus;
  remarks?: string | null;
}

export interface RecordAttendanceInput {
  programmeId: string;
  schoolClassId: string;
  academicSessionId?: string;
  academicTermId?: string;
  date: string | Date;
  items: RecordAttendanceItem[];
}

export interface AttendanceSummary {
  totalDays: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendancePercentage: number;
}

/**
 * Normalizes a date input to a strict midnight UTC Date object representing
 * the calendar day in Africa/Lagos timezone.
 */
export function normalizeAttendanceDate(input: string | Date): { date: Date; dateString: string } {
  let dateObj: Date;
  if (typeof input === 'string') {
    // If format is YYYY-MM-DD
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      return { date: utcDate, dateString: `${match[1]}-${match[2]}-${match[3]}` };
    }
    dateObj = new Date(input);
  } else {
    dateObj = input;
  }

  if (isNaN(dateObj.getTime())) {
    throw new AuthorizationError('Invalid date format provided for attendance.', 400, 'INVALID_DATE');
  }

  // Format into Africa/Lagos YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: LAGOS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateString = formatter.format(dateObj); // "YYYY-MM-DD"
  const [y, m, d] = dateString.split('-').map((v) => parseInt(v, 10));
  const utcDate = new Date(Date.UTC(y, m - 1, d));

  return { date: utcDate, dateString };
}

/**
 * Swanford Academy — Authoritative Daily Attendance Service
 * Master Specification Reference: Sections 3, 8, 9, 13
 */
export async function recordDailyAttendance(
  actor: SafeUser | string,
  input: RecordAttendanceInput
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;

  // 1. Authorize: Actor must have ATTENDANCE_RECORD permission
  await requirePermission(actorUserId, PermissionCode.ATTENDANCE_RECORD);

  // 2. Resolve Teacher profile
  const teacher = await prisma.teacher.findUnique({
    where: { userId: actorUserId },
  });

  if (!teacher) {
    throw new AuthorizationError(
      'Access denied: Authenticated user does not have a linked teacher profile.',
      403,
      'TEACHER_PROFILE_MISSING'
    );
  }

  // 3. Resolve Academic Session & Term
  let sessionId = input.academicSessionId;
  let termId = input.academicTermId;

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

  if (!termId) {
    const activeTerm = await prisma.academicTerm.findFirst({
      where: { academicSessionId: sessionId, isCurrent: true },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!activeTerm) {
      throw new AuthorizationError('No active academic term found for this session.', 400, 'NO_ACTIVE_TERM');
    }
    termId = activeTerm.id;
  }

  // 4. Verify that Academic Term belongs to the Academic Session
  const term = await prisma.academicTerm.findUnique({
    where: { id: termId },
  });

  if (!term || term.academicSessionId !== sessionId) {
    throw new AuthorizationError(
      'Academic term does not belong to the requested academic session.',
      400,
      'TERM_SESSION_MISMATCH'
    );
  }

  // 5. Date validation against term bounds and Lagos timezone
  const { date: normalizedDate, dateString } = normalizeAttendanceDate(input.date);

  const termStart = new Date(term.startDate);
  const termEnd = new Date(term.endDate);
  termStart.setUTCHours(0, 0, 0, 0);
  termEnd.setUTCHours(23, 59, 59, 999);

  if (normalizedDate < termStart || normalizedDate > termEnd) {
    throw new AuthorizationError(
      `Attendance date (${dateString}) does not fall within the academic term window (${term.startDate.toISOString().slice(0, 10)} to ${term.endDate.toISOString().slice(0, 10)}).`,
      400,
      'DATE_OUTSIDE_TERM'
    );
  }

  // 6. Enforce TeacherScope (programme + class + session)
  await assertTeacherScope(actorUserId, {
    programmeId: input.programmeId,
    schoolClassId: input.schoolClassId,
    academicSessionId: sessionId,
  });

  if (!input.items || input.items.length === 0) {
    throw new AuthorizationError('No attendance items provided.', 400, 'EMPTY_ATTENDANCE_ITEMS');
  }

  const studentIds = input.items.map((i) => i.studentId);

  // 7. Validate that all students have an ACTIVE enrollment in requested programme, class, session, and term
  const activeEnrollments = await prisma.studentProgrammeEnrollment.findMany({
    where: {
      studentId: { in: studentIds },
      programmeId: input.programmeId,
      schoolClassId: input.schoolClassId,
      academicSessionId: sessionId,
      academicTermId: termId,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
    select: { studentId: true },
  });

  const activeEnrolledStudentIdSet = new Set(activeEnrollments.map((e) => e.studentId));

  for (const item of input.items) {
    if (!activeEnrolledStudentIdSet.has(item.studentId)) {
      throw new AuthorizationError(
        `Student ${item.studentId} is not actively enrolled in the requested programme and class for this term.`,
        400,
        'STUDENT_NOT_ENROLLED'
      );
    }
  }

  // 8. Transactional persistence with atomic AuditLog
  const recordedCount = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const item of input.items) {
      await tx.attendanceRecord.upsert({
        where: {
          studentId_programmeId_schoolClassId_date: {
            studentId: item.studentId,
            programmeId: input.programmeId,
            schoolClassId: input.schoolClassId,
            date: normalizedDate,
          },
        },
        create: {
          studentId: item.studentId,
          programmeId: input.programmeId,
          schoolClassId: input.schoolClassId,
          academicSessionId: sessionId,
          academicTermId: termId,
          date: normalizedDate,
          status: item.status,
          remarks: item.remarks || null,
          recordedByTeacherId: teacher.id,
          recordedAt: new Date(),
        },
        update: {
          status: item.status,
          remarks: item.remarks || null,
          recordedByTeacherId: teacher.id,
          recordedAt: new Date(),
        },
      });
      count++;
    }

    // Atomic Audit Log
    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ATTENDANCE_REGISTER_RECORDED',
        entityType: 'AttendanceRegister',
        entityId: `${input.schoolClassId}_${input.programmeId}_${dateString}`,
        newValues: {
          programmeId: input.programmeId,
          schoolClassId: input.schoolClassId,
          academicSessionId: sessionId,
          academicTermId: termId,
          date: dateString,
          studentCount: count,
          recordedByTeacherId: teacher.id,
        },
      },
    });

    return count;
  });

  return {
    success: true,
    date: dateString,
    recordsCount: recordedCount,
  };
}

/**
 * Retrieves daily attendance register for a specific class, programme, and date.
 */
export async function getClassDailyAttendance(
  actor: SafeUser | string,
  params: {
    programmeId: string;
    schoolClassId: string;
    date: string | Date;
    academicSessionId?: string;
  }
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.ATTENDANCE_VIEW);

  // Teacher scope check
  await assertTeacherScope(actorUserId, {
    programmeId: params.programmeId,
    schoolClassId: params.schoolClassId,
    academicSessionId: params.academicSessionId,
  });

  const { date: normalizedDate, dateString } = normalizeAttendanceDate(params.date);

  // Determine session
  let sessionId = params.academicSessionId;
  if (!sessionId) {
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    sessionId = activeSession?.id;
  }

  // 1. Fetch active enrolled students
  const enrollments = await prisma.studentProgrammeEnrollment.findMany({
    where: {
      programmeId: params.programmeId,
      schoolClassId: params.schoolClassId,
      ...(sessionId ? { academicSessionId: sessionId } : {}),
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
          gender: true,
        },
      },
    },
    orderBy: [
      { student: { lastName: 'asc' } },
      { student: { firstName: 'asc' } },
    ],
  });

  // 2. Fetch existing records for this date
  const records = await prisma.attendanceRecord.findMany({
    where: {
      programmeId: params.programmeId,
      schoolClassId: params.schoolClassId,
      date: normalizedDate,
    },
  });

  const recordsMap = new Map(records.map((r) => [r.studentId, r]));

  const rosterWithAttendance = enrollments.map((e) => {
    const record = recordsMap.get(e.studentId);
    return {
      student: e.student,
      attendance: record
        ? {
            id: record.id,
            status: record.status,
            remarks: record.remarks,
            recordedAt: record.recordedAt,
          }
        : null,
    };
  });

  return {
    date: dateString,
    programmeId: params.programmeId,
    schoolClassId: params.schoolClassId,
    totalStudents: rosterWithAttendance.length,
    markedCount: records.length,
    roster: rosterWithAttendance,
  };
}

/**
 * Calculates term/session attendance metrics for a student.
 */
export async function getStudentAttendanceSummary(
  studentId: string,
  params?: {
    academicTermId?: string;
    academicSessionId?: string;
    programmeId?: string;
  }
): Promise<AttendanceSummary> {
  const where: Prisma.AttendanceRecordWhereInput = {
    studentId,
    ...(params?.academicTermId ? { academicTermId: params.academicTermId } : {}),
    ...(params?.academicSessionId ? { academicSessionId: params.academicSessionId } : {}),
    ...(params?.programmeId ? { programmeId: params.programmeId } : {}),
  };

  const records = await prisma.attendanceRecord.findMany({
    where,
    select: { status: true },
  });

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;

  for (const r of records) {
    if (r.status === AttendanceStatus.PRESENT) presentCount++;
    else if (r.status === AttendanceStatus.ABSENT) absentCount++;
    else if (r.status === AttendanceStatus.LATE) lateCount++;
    else if (r.status === AttendanceStatus.EXCUSED) excusedCount++;
  }

  const totalDays = records.length;
  // Standard Nigerian academic attendance rate: (Present + Late) / Total Days
  const attendancePercentage =
    totalDays > 0 ? Math.round(((presentCount + lateCount) / totalDays) * 100 * 10) / 10 : 100;

  return {
    totalDays,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    attendancePercentage,
  };
}
