import {
  TeacherStatus,
  TeacherAssignmentStatus,
  TeacherAssignmentAction,
  StaffDocumentType,
  StaffDocumentStatus,
  ProbationRating,
  ProbationRecommendation,
  UserStatus,
  NotificationChannel,
  NotificationCategory,
  RoleCode,
  Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError, requirePermission, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { processPendingNotifications } from '@/lib/notifications/worker';
import { toAbsoluteEmailUrl } from '@/lib/utils/url';

export interface ProbationRatingsInput {
  excellence: ProbationRating;
  integrity: ProbationRating;
  discipline: ProbationRating;
  respect: ProbationRating;
  responsibility: ProbationRating;
  goodCharacter: ProbationRating;
}

export interface SaveProbationInput {
  teacherId: string;
  monthNumber: number; // 1, 2, 3, or 4
  position: string;
  department?: string;
  dateOfEmployment: Date;
  probationStartDate: Date;
  probationEndDate: Date;
  ratings: ProbationRatingsInput;
  comments?: string;
  strengths?: string;
  areasForImprovement?: string;
  targets?: string;
  recommendation: ProbationRecommendation;
  isFinal?: boolean;
  finalRecommendation?: string;
  assessorSignature?: string;
  staffSignature?: string;
}

// -----------------------------------------------------------------------------
// 1. STAFF LIFECYCLE & STATUS MANAGEMENT
// -----------------------------------------------------------------------------

const INACTIVE_OR_DEPARTED_STATUSES: TeacherStatus[] = [
  TeacherStatus.RESIGNED,
  TeacherStatus.DISMISSED,
  TeacherStatus.DECEASED,
  TeacherStatus.RETIRED,
  TeacherStatus.FORMER_STAFF,
  TeacherStatus.INACTIVE,
  TeacherStatus.TERMINATED,
  TeacherStatus.SUSPENDED,
];

export async function updateStaffStatus(
  actor: SafeUser,
  input: {
    teacherId: string;
    status: TeacherStatus;
    reason?: string;
  }
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const teacher = await prisma.teacher.findUnique({
    where: { id: input.teacherId },
    include: { user: true, scopes: true },
  });

  if (!teacher) {
    throw new AuthorizationError('Staff member not found.', 404, 'TEACHER_NOT_FOUND');
  }

  const oldStatus = teacher.status;
  const newStatus = input.status;
  const isDepartingOrSuspended = INACTIVE_OR_DEPARTED_STATUSES.includes(newStatus);

  return prisma.$transaction(async (tx) => {
    // 1. Update teacher status
    const updatedTeacher = await tx.teacher.update({
      where: { id: input.teacherId },
      data: { status: newStatus },
    });

    // 2. If staff is departing or suspended, end active class assignments safely
    if (isDepartingOrSuspended) {
      await tx.teacherScope.updateMany({
        where: {
          teacherId: input.teacherId,
          status: TeacherAssignmentStatus.ACTIVE,
        },
        data: {
          status: TeacherAssignmentStatus.ENDED,
          endDate: new Date(),
          reason: input.reason || `Status transitioned to ${newStatus}`,
        },
      });

      // 3. Suspend or deactivate user login
      const targetUserStatus =
        newStatus === TeacherStatus.SUSPENDED
          ? UserStatus.SUSPENDED
          : UserStatus.DEACTIVATED;

      await tx.user.update({
        where: { id: teacher.userId },
        data: { status: targetUserStatus },
      });

      // 4. Invalidate all active web sessions immediately
      await tx.session.updateMany({
        where: { userId: teacher.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (newStatus === TeacherStatus.ACTIVE || newStatus === TeacherStatus.CONFIRMED) {
      // If reactivated or confirmed, make sure user account is active
      await tx.user.update({
        where: { id: teacher.userId },
        data: { status: UserStatus.ACTIVE },
      });
    }

    // 5. Immutable Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'STAFF_STATUS_UPDATED',
        entityType: 'Teacher',
        entityId: input.teacherId,
        oldValues: { status: oldStatus },
        newValues: { status: newStatus, reason: input.reason || null },
      },
    });

    return updatedTeacher;
  });
}

// -----------------------------------------------------------------------------
// 2. TEACHER REASSIGNMENT, TRANSFER & ATOMIC SWITCH
// -----------------------------------------------------------------------------

/**
 * Reassigns an existing class from Teacher A to Teacher B.
 * Preserves all students, attendance, assessments, and historical score authorship.
 */
export async function reassignTeacherClass(
  actor: SafeUser,
  input: {
    fromTeacherId: string;
    toTeacherId: string;
    schoolClassId: string;
    academicSessionId: string;
    programmeId: string;
    subjectId?: string | null;
    reason?: string;
  }
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  if (input.fromTeacherId === input.toTeacherId) {
    throw new AuthorizationError('New teacher must be different from current teacher.', 400, 'INVALID_REASSIGNMENT');
  }

  const [fromTeacher, toTeacher, schoolClass, session] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: input.fromTeacherId } }),
    prisma.teacher.findUnique({ where: { id: input.toTeacherId } }),
    prisma.schoolClass.findUnique({ where: { id: input.schoolClassId } }),
    prisma.academicSession.findUnique({ where: { id: input.academicSessionId } }),
  ]);

  if (!fromTeacher || !toTeacher) {
    throw new AuthorizationError('Specified teachers could not be found.', 404, 'TEACHER_NOT_FOUND');
  }
  if (!schoolClass || !session) {
    throw new AuthorizationError('Class or Academic Session not found.', 404, 'RESOURCE_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // 1. End active scope for Teacher A
    await tx.teacherScope.updateMany({
      where: {
        teacherId: input.fromTeacherId,
        schoolClassId: input.schoolClassId,
        academicSessionId: input.academicSessionId,
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        status: TeacherAssignmentStatus.ACTIVE,
      },
      data: {
        status: TeacherAssignmentStatus.ENDED,
        endDate: now,
        reason: input.reason || `Reassigned to ${toTeacher.firstName} ${toTeacher.lastName}`,
      },
    });

    // 2. Create active scope for Teacher B
    const newScope = await tx.teacherScope.create({
      data: {
        teacherId: input.toTeacherId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId || null,
        isFormTeacher: false,
        status: TeacherAssignmentStatus.ACTIVE,
        startDate: now,
        reason: input.reason || `Reassigned from ${fromTeacher.firstName} ${fromTeacher.lastName}`,
        assignedByUserId: actor.id,
      },
    });

    // 3. Record Assignment History for Teacher A
    await tx.teacherAssignmentHistory.create({
      data: {
        teacherId: input.fromTeacherId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId || null,
        previousClassId: input.schoolClassId,
        newClassId: null,
        action: TeacherAssignmentAction.REASSIGNED,
        reason: input.reason || `Reassigned to ${toTeacher.firstName} ${toTeacher.lastName}`,
        performedByUserId: actor.id,
      },
    });

    // 4. Record Assignment History for Teacher B
    await tx.teacherAssignmentHistory.create({
      data: {
        teacherId: input.toTeacherId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId || null,
        previousClassId: null,
        newClassId: input.schoolClassId,
        action: TeacherAssignmentAction.ASSIGNED,
        reason: input.reason || `Assigned to replace ${fromTeacher.firstName} ${fromTeacher.lastName}`,
        performedByUserId: actor.id,
      },
    });

    // 5. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'TEACHER_CLASS_REASSIGNED',
        entityType: 'SchoolClass',
        entityId: input.schoolClassId,
        oldValues: {
          teacherId: input.fromTeacherId,
          teacherName: `${fromTeacher.firstName} ${fromTeacher.lastName}`,
        },
        newValues: {
          teacherId: input.toTeacherId,
          teacherName: `${toTeacher.firstName} ${toTeacher.lastName}`,
          reason: input.reason || null,
        },
      },
    });

    return newScope;
  });
}

/**
 * Transfers a teacher from Class A to Class B.
 */
export async function transferTeacherClass(
  actor: SafeUser,
  input: {
    teacherId: string;
    fromClassId: string;
    toClassId: string;
    programmeId: string;
    academicSessionId: string;
    subjectId?: string | null;
    reason?: string;
  }
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  if (input.fromClassId === input.toClassId) {
    throw new AuthorizationError('Destination class must be different from source class.', 400, 'INVALID_TRANSFER');
  }

  const [teacher, fromClass, toClass] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: input.teacherId } }),
    prisma.schoolClass.findUnique({ where: { id: input.fromClassId } }),
    prisma.schoolClass.findUnique({ where: { id: input.toClassId } }),
  ]);

  if (!teacher || !fromClass || !toClass) {
    throw new AuthorizationError('Teacher or classes not found.', 404, 'RESOURCE_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // 1. End old assignment
    await tx.teacherScope.updateMany({
      where: {
        teacherId: input.teacherId,
        schoolClassId: input.fromClassId,
        academicSessionId: input.academicSessionId,
        status: TeacherAssignmentStatus.ACTIVE,
      },
      data: {
        status: TeacherAssignmentStatus.TRANSFERRED,
        endDate: now,
        reason: input.reason || `Transferred to ${toClass.name}`,
      },
    });

    // 2. Create new assignment
    const newScope = await tx.teacherScope.create({
      data: {
        teacherId: input.teacherId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.toClassId,
        subjectId: input.subjectId || null,
        status: TeacherAssignmentStatus.ACTIVE,
        startDate: now,
        reason: input.reason || `Transferred from ${fromClass.name}`,
        assignedByUserId: actor.id,
      },
    });

    // 3. Record Assignment History
    await tx.teacherAssignmentHistory.create({
      data: {
        teacherId: input.teacherId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.toClassId,
        subjectId: input.subjectId || null,
        previousClassId: input.fromClassId,
        newClassId: input.toClassId,
        action: TeacherAssignmentAction.TRANSFERRED,
        reason: input.reason || `Transferred from ${fromClass.name} to ${toClass.name}`,
        performedByUserId: actor.id,
      },
    });

    // 4. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'TEACHER_TRANSFERRED',
        entityType: 'Teacher',
        entityId: input.teacherId,
        oldValues: { classId: input.fromClassId, className: fromClass.name },
        newValues: { classId: input.toClassId, className: toClass.name, reason: input.reason || null },
      },
    });

    return newScope;
  });
}

/**
 * Transactional atomic switch of two teachers between their classes:
 * Teacher A (Class A) <-> Teacher B (Class B).
 * Either both switch successfully or neither does.
 */
export async function switchTeachers(
  actor: SafeUser,
  input: {
    teacherAId: string;
    classAId: string;
    teacherBId: string;
    classBId: string;
    programmeId: string;
    academicSessionId: string;
    reason?: string;
  }
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  if (input.teacherAId === input.teacherBId || input.classAId === input.classBId) {
    throw new AuthorizationError('Switch requires two distinct teachers and two distinct classes.', 400, 'INVALID_SWITCH');
  }

  const [teacherA, teacherB, classA, classB] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: input.teacherAId } }),
    prisma.teacher.findUnique({ where: { id: input.teacherBId } }),
    prisma.schoolClass.findUnique({ where: { id: input.classAId } }),
    prisma.schoolClass.findUnique({ where: { id: input.classBId } }),
  ]);

  if (!teacherA || !teacherB || !classA || !classB) {
    throw new AuthorizationError('Teachers or classes not found.', 404, 'RESOURCE_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // End active assignment for Teacher A in Class A
    await tx.teacherScope.updateMany({
      where: {
        teacherId: input.teacherAId,
        schoolClassId: input.classAId,
        academicSessionId: input.academicSessionId,
        status: TeacherAssignmentStatus.ACTIVE,
      },
      data: {
        status: TeacherAssignmentStatus.ENDED,
        endDate: now,
        reason: input.reason || `Switched with ${teacherB.firstName} ${teacherB.lastName}`,
      },
    });

    // End active assignment for Teacher B in Class B
    await tx.teacherScope.updateMany({
      where: {
        teacherId: input.teacherBId,
        schoolClassId: input.classBId,
        academicSessionId: input.academicSessionId,
        status: TeacherAssignmentStatus.ACTIVE,
      },
      data: {
        status: TeacherAssignmentStatus.ENDED,
        endDate: now,
        reason: input.reason || `Switched with ${teacherA.firstName} ${teacherA.lastName}`,
      },
    });

    // Assign Teacher A to Class B
    const scopeA = await tx.teacherScope.create({
      data: {
        teacherId: input.teacherAId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.classBId,
        status: TeacherAssignmentStatus.ACTIVE,
        startDate: now,
        reason: input.reason || `Switched to ${classB.name}`,
        assignedByUserId: actor.id,
      },
    });

    // Assign Teacher B to Class A
    const scopeB = await tx.teacherScope.create({
      data: {
        teacherId: input.teacherBId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.classAId,
        status: TeacherAssignmentStatus.ACTIVE,
        startDate: now,
        reason: input.reason || `Switched to ${classA.name}`,
        assignedByUserId: actor.id,
      },
    });

    // History records
    await tx.teacherAssignmentHistory.create({
      data: {
        teacherId: input.teacherAId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.classBId,
        previousClassId: input.classAId,
        newClassId: input.classBId,
        action: TeacherAssignmentAction.SWITCHED,
        reason: input.reason || `Switched with ${teacherB.firstName} ${teacherB.lastName}`,
        performedByUserId: actor.id,
      },
    });

    await tx.teacherAssignmentHistory.create({
      data: {
        teacherId: input.teacherBId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.classAId,
        previousClassId: input.classBId,
        newClassId: input.classAId,
        action: TeacherAssignmentAction.SWITCHED,
        reason: input.reason || `Switched with ${teacherA.firstName} ${teacherA.lastName}`,
        performedByUserId: actor.id,
      },
    });

    // Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'TEACHERS_SWITCHED',
        entityType: 'Teacher',
        entityId: input.teacherAId,
        newValues: {
          teacherA: `${teacherA.firstName} ${teacherA.lastName} -> ${classB.name}`,
          teacherB: `${teacherB.firstName} ${teacherB.lastName} -> ${classA.name}`,
          reason: input.reason || null,
        },
      },
    });

    return { scopeA, scopeB };
  });
}

// -----------------------------------------------------------------------------
// 3. FOUR-MONTH PROBATION SYSTEM
// -----------------------------------------------------------------------------

export async function saveProbationAssessment(
  actor: SafeUser,
  input: SaveProbationInput
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  if (input.monthNumber < 1 || input.monthNumber > 4) {
    throw new AuthorizationError('Month number must be between 1 and 4 for the 4-month probation cycle.', 400, 'INVALID_MONTH');
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: input.teacherId },
    include: { user: true },
  });

  if (!teacher) {
    throw new AuthorizationError('Teacher record not found.', 404, 'TEACHER_NOT_FOUND');
  }

  const assessorName = actor.firstName && actor.lastName
    ? `${actor.firstName} ${actor.lastName}`
    : 'Super Administrator';

  const record = await prisma.staffProbationRecord.upsert({
    where: {
      teacherId_monthNumber: {
        teacherId: input.teacherId,
        monthNumber: input.monthNumber,
      },
    },
    create: {
      teacherId: input.teacherId,
      monthNumber: input.monthNumber,
      position: input.position,
      department: input.department || null,
      dateOfEmployment: input.dateOfEmployment,
      probationStartDate: input.probationStartDate,
      probationEndDate: input.probationEndDate,
      assessorName,
      assessorUserId: actor.id,
      ratingsJson: input.ratings as unknown as Prisma.InputJsonValue,
      comments: input.comments || null,
      strengths: input.strengths || null,
      areasForImprovement: input.areasForImprovement || null,
      targets: input.targets || null,
      recommendation: input.recommendation,
      isFinal: !!input.isFinal,
      finalRecommendation: input.finalRecommendation || null,
      assessorSignature: input.assessorSignature || assessorName,
      staffSignature: input.staffSignature || null,
      signedAt: new Date(),
    },
    update: {
      position: input.position,
      department: input.department || null,
      dateOfEmployment: input.dateOfEmployment,
      probationStartDate: input.probationStartDate,
      probationEndDate: input.probationEndDate,
      assessorName,
      assessorUserId: actor.id,
      ratingsJson: input.ratings as unknown as Prisma.InputJsonValue,
      comments: input.comments || null,
      strengths: input.strengths || null,
      areasForImprovement: input.areasForImprovement || null,
      targets: input.targets || null,
      recommendation: input.recommendation,
      isFinal: !!input.isFinal,
      finalRecommendation: input.finalRecommendation || null,
      assessorSignature: input.assessorSignature || assessorName,
      staffSignature: input.staffSignature || null,
      signedAt: new Date(),
    },
  });

  // If final and confirmed, update teacher status to CONFIRMED
  if (input.isFinal && input.recommendation === ProbationRecommendation.CONFIRM_APPOINTMENT) {
    await prisma.teacher.update({
      where: { id: input.teacherId },
      data: { status: TeacherStatus.CONFIRMED },
    });
  }

  // Audit Log
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'STAFF_PROBATION_EVALUATED',
      entityType: 'StaffProbationRecord',
      entityId: record.id,
      newValues: {
        teacherId: input.teacherId,
        monthNumber: input.monthNumber,
        recommendation: input.recommendation,
        isFinal: input.isFinal,
      },
    },
  });

  return record;
}

export async function getTeacherProbationRecords(
  actor: SafeUser,
  teacherId: string
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  return prisma.staffProbationRecord.findMany({
    where: { teacherId },
    orderBy: { monthNumber: 'asc' },
  });
}

// -----------------------------------------------------------------------------
// 4. OFFICIAL EMPLOYMENT & PROBATION DOCUMENTS
// -----------------------------------------------------------------------------

export function renderStaffDocumentTemplate(
  documentType: StaffDocumentType,
  data: {
    staffName: string;
    staffIdNumber: string;
    position: string;
    department?: string;
    dateOfEmployment: string;
    probationStartDate?: string;
    probationEndDate?: string;
    directorName?: string;
    dateIssued: string;
  }
): { title: string; content: string } {
  const schoolHeader = `
<div style="text-align: center; border-bottom: 2px solid #5B0612; padding-bottom: 12px; margin-bottom: 24px;">
  <h1 style="color: #5B0612; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">SWANFORD ACADEMY</h1>
  <p style="color: #78716C; margin: 4px 0; font-size: 13px;">Plot 212, Dr Nuhu Muhammadu Sanusi Way, Dutse, Jigawa State, Nigeria</p>
  <p style="color: #78716C; margin: 2px 0; font-size: 12px;">Tel: 09068897489, 08103807498 | Email: Swanford99@gmail.com</p>
  <p style="color: #C49A45; margin: 4px 0 0 0; font-size: 12px; font-weight: 700; text-transform: uppercase;">Motto: Excellence & Character</p>
</div>`;

  if (documentType === StaffDocumentType.PROBATION_APPOINTMENT_LETTER) {
    const title = 'TEMPORARY EMPLOYMENT / PROBATIONARY APPOINTMENT LETTER';
    const content = `
${schoolHeader}
<div style="font-family: 'Inter', sans-serif; line-height: 1.6; color: #1C1917; font-size: 13px;">
  <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
    <div>
      <p><strong>To:</strong> ${data.staffName}</p>
      <p><strong>Staff ID:</strong> ${data.staffIdNumber}</p>
      <p><strong>Position:</strong> ${data.position}</p>
      ${data.department ? `<p><strong>Department:</strong> ${data.department}</p>` : ''}
    </div>
    <div style="text-align: right;">
      <p><strong>Date:</strong> ${data.dateIssued}</p>
    </div>
  </div>

  <h3 style="color: #5B0612; text-align: center; text-transform: uppercase; margin: 20px 0; font-size: 15px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">
    OFFER OF TEMPORARY EMPLOYMENT & PROBATIONARY APPOINTMENT
  </h3>

  <p>Dear ${data.staffName},</p>

  <p>We are pleased to offer you temporary employment and a probationary appointment with <strong>Swanford Academy</strong> as <strong>${data.position}</strong> with effect from <strong>${data.dateOfEmployment}</strong>.</p>

  <h4 style="color: #5B0612; margin-top: 16px; margin-bottom: 6px;">1. Period of Probation</h4>
  <p>Your appointment is subject to a satisfactory probationary period of four (4) months, commencing on <strong>${data.probationStartDate || data.dateOfEmployment}</strong> and concluding on <strong>${data.probationEndDate || 'completion of four months'}</strong>. During this period, your professional conduct, classroom delivery, punctuality, and adherence to school core values will be evaluated monthly.</p>

  <h4 style="color: #5B0612; margin-top: 16px; margin-bottom: 6px;">2. Core Values & Code of Conduct</h4>
  <p>At Swanford Academy, our institutional culture rests upon six non-negotiable core values:</p>
  <ul>
    <li><strong>Excellence:</strong> Delivering rigorous, high-standard teaching and moral instruction.</li>
    <li><strong>Integrity:</strong> Honest assessment, transparent communication, and moral accountability.</li>
    <li><strong>Discipline:</strong> Punctuality, professional dress code, and classroom order.</li>
    <li><strong>Respect:</strong> Courteous and dignified interactions with students, parents, and fellow staff.</li>
    <li><strong>Responsibility:</strong> Diligent safeguarding of students and school property.</li>
    <li><strong>Good Character:</strong> Exemplifying Islamic etiquette and upright citizenship.</li>
  </ul>

  <h4 style="color: #5B0612; margin-top: 16px; margin-bottom: 6px;">3. Confirmation of Appointment</h4>
  <p>Upon the successful completion of the four-month probation and recommendation by the Management Assessment Committee, your appointment will be formally confirmed in writing. Should your performance or conduct fall below the required standard, Management reserves the right to extend your probation or terminate the appointment in accordance with school regulations.</p>

  <div style="margin-top: 40px; display: flex; justify-content: space-between; padding-top: 20px; border-top: 1px dashed #D1D5DB;">
    <div>
      <p style="margin-bottom: 40px;">___________________________</p>
      <p><strong>${data.directorName || 'School Director / Management'}</strong><br/>Swanford Academy</p>
    </div>
    <div>
      <p style="margin-bottom: 40px;">___________________________</p>
      <p><strong>Employee Acceptance Signature</strong><br/>Date: ____________________</p>
    </div>
  </div>
</div>`;
    return { title, content };
  }

  if (documentType === StaffDocumentType.CONFIRMATION_OF_APPOINTMENT_LETTER) {
    const title = 'CONFIRMATION OF APPOINTMENT LETTER';
    const content = `
${schoolHeader}
<div style="font-family: 'Inter', sans-serif; line-height: 1.6; color: #1C1917; font-size: 13px;">
  <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
    <div>
      <p><strong>To:</strong> ${data.staffName}</p>
      <p><strong>Staff ID:</strong> ${data.staffIdNumber}</p>
      <p><strong>Position:</strong> ${data.position}</p>
      ${data.department ? `<p><strong>Department:</strong> ${data.department}</p>` : ''}
    </div>
    <div style="text-align: right;">
      <p><strong>Date:</strong> ${data.dateIssued}</p>
    </div>
  </div>

  <h3 style="color: #5B0612; text-align: center; text-transform: uppercase; margin: 20px 0; font-size: 15px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">
    CONFIRMATION OF PERMANENT APPOINTMENT
  </h3>

  <p>Dear ${data.staffName},</p>

  <p>Following the successful completion of your four-month probationary period and subsequent recommendation by the School Assessment Board, the Management of <strong>Swanford Academy</strong> is pleased to inform you that your appointment as <strong>${data.position}</strong> has been <strong>CONFIRMED</strong>.</p>

  <p>During your probationary period, your dedication to educational excellence, moral integrity, and student advancement was duly noted. We trust you will continue to maintain these high professional standards and contribute positively to our institutional mission.</p>

  <p>All other terms and conditions governing staff employment at Swanford Academy remain operative as specified in the Staff Handbook.</p>

  <p>Congratulations on your confirmation.</p>

  <div style="margin-top: 50px;">
    <p style="margin-bottom: 40px;">___________________________</p>
    <p><strong>${data.directorName || 'Director of Administration'}</strong><br/>Swanford Academy, Dutse</p>
  </div>
</div>`;
    return { title, content };
  }

  // STAFF PROBATION ASSESSMENT FORM
  const title = 'STAFF PROBATION ASSESSMENT FORM';
  const content = `
${schoolHeader}
<div style="font-family: 'Inter', sans-serif; line-height: 1.6; color: #1C1917; font-size: 13px;">
  <h3 style="color: #5B0612; text-align: center; text-transform: uppercase; margin: 15px 0; font-size: 15px;">
    OFFICIAL STAFF PROBATION ASSESSMENT REPORT
  </h3>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
    <tr>
      <td style="border: 1px solid #D1D5DB; padding: 8px; background: #F9FAFB;"><strong>Staff Name:</strong></td>
      <td style="border: 1px solid #D1D5DB; padding: 8px;">${data.staffName}</td>
      <td style="border: 1px solid #D1D5DB; padding: 8px; background: #F9FAFB;"><strong>Staff ID:</strong></td>
      <td style="border: 1px solid #D1D5DB; padding: 8px;">${data.staffIdNumber}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #D1D5DB; padding: 8px; background: #F9FAFB;"><strong>Position:</strong></td>
      <td style="border: 1px solid #D1D5DB; padding: 8px;">${data.position}</td>
      <td style="border: 1px solid #D1D5DB; padding: 8px; background: #F9FAFB;"><strong>Date of Employment:</strong></td>
      <td style="border: 1px solid #D1D5DB; padding: 8px;">${data.dateOfEmployment}</td>
    </tr>
  </table>

  <p style="font-size: 12px; color: #4B5563;">Official rating scale: <strong>Excellent | Good | Satisfactory | Needs Improvement | Unsatisfactory</strong></p>
</div>`;
  return { title, content };
}

export async function generateStaffDocument(
  actor: SafeUser,
  input: {
    teacherId: string;
    documentType: StaffDocumentType;
  }
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const teacher = await prisma.teacher.findUnique({
    where: { id: input.teacherId },
    include: { user: true },
  });

  if (!teacher) {
    throw new AuthorizationError('Teacher not found.', 404, 'TEACHER_NOT_FOUND');
  }

  const staffName = `${teacher.firstName} ${teacher.lastName}`.trim();
  const dateIssued = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const employmentDate = teacher.dateOfEmployment
    ? teacher.dateOfEmployment.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : teacher.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const probStartDate = teacher.probationStartDate
    ? teacher.probationStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : employmentDate;

  const probEndDate = teacher.probationEndDate
    ? teacher.probationEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : undefined;

  const { title, content } = renderStaffDocumentTemplate(input.documentType, {
    staffName,
    staffIdNumber: teacher.staffIdNumber,
    position: teacher.position || 'Classroom Teacher',
    department: teacher.department || undefined,
    dateOfEmployment: employmentDate,
    probationStartDate: probStartDate,
    probationEndDate: probEndDate,
    directorName: 'School Management',
    dateIssued,
  });

  const doc = await prisma.staffDocument.create({
    data: {
      teacherId: input.teacherId,
      documentType: input.documentType,
      title,
      content,
      status: StaffDocumentStatus.DRAFT,
      issuedByUserId: actor.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'STAFF_DOCUMENT_GENERATED',
      entityType: 'StaffDocument',
      entityId: doc.id,
      newValues: {
        teacherId: input.teacherId,
        documentType: input.documentType,
        title,
      },
    },
  });

  return doc;
}

export async function issueStaffDocument(
  actor: SafeUser,
  documentId: string
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const doc = await prisma.staffDocument.findUnique({
    where: { id: documentId },
    include: { teacher: { include: { user: true } } },
  });

  if (!doc) {
    throw new AuthorizationError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  const updatedDoc = await prisma.staffDocument.update({
    where: { id: documentId },
    data: {
      status: StaffDocumentStatus.ISSUED,
      issuedAt: new Date(),
      issuedByUserId: actor.id,
    },
  });

  // Notify teacher via email and portal notification
  if (doc.teacher?.user) {
    const teacherUser = doc.teacher.user;
    await enqueueNotification({
      idempotencyKey: `staff-doc-issued-${doc.id}`,
      recipientUserId: teacherUser.id,
      recipientEmail: teacherUser.email,
      channel: NotificationChannel.EMAIL,
      category: NotificationCategory.GENERAL,
      templateName: 'STAFF_DOCUMENT_ISSUED',
      subject: `Official Document Issued: ${doc.title}`,
      bodyText: `Dear ${doc.teacher.firstName}, an official employment document (${doc.title}) has been issued to you by School Management. Please log into your Teacher Portal to view and download it.`,
      htmlBody: `<p>Dear ${doc.teacher.firstName},</p><p>An official employment document (<strong>${doc.title}</strong>) has been issued to you by School Management.</p><p>Please log into your <a href="${toAbsoluteEmailUrl('/auth/login')}">Swanford Academy Teacher Portal</a> to view and download it under <strong>My Documents</strong>.</p>`,
    });

    processPendingNotifications().catch(() => {});
  }

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: 'STAFF_DOCUMENT_ISSUED',
      entityType: 'StaffDocument',
      entityId: documentId,
      newValues: {
        teacherId: doc.teacherId,
        title: doc.title,
        status: StaffDocumentStatus.ISSUED,
      },
    },
  });

  return updatedDoc;
}

export async function getTeacherIssuedDocuments(teacherUserId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId: teacherUserId },
  });

  if (!teacher) {
    return [];
  }

  return prisma.staffDocument.findMany({
    where: {
      teacherId: teacher.id,
      status: { in: [StaffDocumentStatus.ISSUED, StaffDocumentStatus.ACKNOWLEDGED] },
    },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      documentType: true,
      title: true,
      status: true,
      issuedAt: true,
      createdAt: true,
    },
  });
}

export async function getStaffDocumentContent(
  actor: SafeUser,
  documentId: string
) {
  const doc = await prisma.staffDocument.findUnique({
    where: { id: documentId },
    include: { teacher: true },
  });

  if (!doc) {
    throw new AuthorizationError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  // Access check: Super Admin/Admin or the Teacher themselves
  const roles = await getUserRoles(actor.id);
  const isSuperOrAdmin = roles.includes(RoleCode.SUPER_ADMIN) || roles.includes(RoleCode.ADMIN);
  const isOwner = doc.teacher?.userId === actor.id;

  if (!isSuperOrAdmin && !isOwner) {
    throw new AuthorizationError('Access denied: You are not authorized to view this document.', 403, 'FORBIDDEN');
  }

  return doc;
}
