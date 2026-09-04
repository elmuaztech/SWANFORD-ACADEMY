import { Gender, StudentStatus, RoleCode, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError, getUserRoles, getUserPermissions } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { assertParentOwnsStudent, assertTeacherStudentScope } from '@/lib/auth/scopes';
import { reserveAdmissionNumberBlock } from './admission_number';
import { detectPotentialStudentDuplicates } from './duplicate_detection';

/**
 * Swanford Academy — Student Profile Management Service
 * Master Specification Reference: Sections 7, 8, 10
 *
 * Core Invariants:
 * - Admission number is permanent, server-generated, and immutable.
 * - Programme membership is NEVER placed directly on Student (managed via StudentProgrammeEnrollment).
 * - Field-level sensitive data visibility: medical notes, genotype, and blood group are strictly protected.
 * - Generic student list queries NEVER project medical or emergency fields.
 * - Student lifecycle status is completely decoupled from programme enrollment status.
 */

export const CreateStudentSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').trim(),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').trim(),
  otherNames: z.string().trim().optional(),
  preferredName: z.string().trim().optional(),
  gender: z.nativeEnum(Gender),
  dateOfBirth: z.coerce.date().refine((d) => d < new Date(), {
    message: 'Date of birth must be in the past',
  }),
  admissionDate: z.coerce.date().optional(),
  // Sensitive medical and emergency fields
  bloodGroup: z.string().trim().optional(),
  genotype: z.string().trim().optional(),
  medicalNotes: z.string().trim().optional(),
  allergies: z.string().trim().optional(),
  medicalConditions: z.string().trim().optional(),
  emergencyContactName: z.string().trim().optional(),
  emergencyContactPhone: z.string().trim().optional(),
  emergencyContactRelationship: z.string().trim().optional(),
});

export const UpdateStudentSchema = z.object({
  firstName: z.string().min(2).trim().optional(),
  lastName: z.string().min(2).trim().optional(),
  otherNames: z.string().trim().nullable().optional(),
  preferredName: z.string().trim().nullable().optional(),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: z.coerce.date().refine((d) => d < new Date(), {
    message: 'Date of birth must be in the past',
  }).optional(),
  admissionDate: z.coerce.date().optional(),
  // Sensitive medical and emergency fields
  bloodGroup: z.string().trim().nullable().optional(),
  genotype: z.string().trim().nullable().optional(),
  medicalNotes: z.string().trim().nullable().optional(),
  allergies: z.string().trim().nullable().optional(),
  medicalConditions: z.string().trim().nullable().optional(),
  emergencyContactName: z.string().trim().nullable().optional(),
  emergencyContactPhone: z.string().trim().nullable().optional(),
  emergencyContactRelationship: z.string().trim().nullable().optional(),
});

export type CreateStudentInput = z.input<typeof CreateStudentSchema>;
export type UpdateStudentInput = z.input<typeof UpdateStudentSchema>;

export interface StudentDemographicView {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  preferredName: string | null;
  gender: Gender;
  dateOfBirth: Date;
  admissionDate: Date;
  currentStatus: StudentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentSensitiveDetails {
  bloodGroup?: string | null;
  genotype?: string | null;
  medicalNotes?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
}

export type StudentDetailedView = StudentDemographicView & StudentSensitiveDetails;

/**
 * Creates a new student profile with server-generated admission number and duplicate warnings.
 */
export async function createStudent(
  actor: SafeUser,
  input: CreateStudentInput,
  year: number = new Date().getFullYear(),
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.STUDENT_CREATE);
  const validated = CreateStudentSchema.parse(input);

  // If sensitive medical notes or clinical conditions are supplied, verify medical edit authority
  const hasMedicalFields = Boolean(
    validated.bloodGroup ||
    validated.genotype ||
    validated.medicalNotes ||
    validated.allergies ||
    validated.medicalConditions
  );

  if (hasMedicalFields) {
    await requirePermission(actor, PermissionCode.STUDENT_MEDICAL_EDIT);
  }

  // Duplicate detection (WARNING ONLY)
  const duplicateCheck = await detectPotentialStudentDuplicates(
    {
      firstName: validated.firstName,
      lastName: validated.lastName,
      dateOfBirth: validated.dateOfBirth,
    },
    externalTx || prisma
  );

  // Reserve unique, concurrency-safe admission number
  const [admissionNumber] = await reserveAdmissionNumberBlock(1, year, externalTx || prisma);

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    const created = await tx.student.create({
      data: {
        admissionNumber,
        firstName: validated.firstName,
        lastName: validated.lastName,
        otherNames: validated.otherNames || null,
        preferredName: validated.preferredName || null,
        gender: validated.gender,
        dateOfBirth: validated.dateOfBirth,
        admissionDate: validated.admissionDate || new Date(),
        currentStatus: StudentStatus.ACTIVE,
        bloodGroup: validated.bloodGroup || null,
        genotype: validated.genotype || null,
        medicalNotes: validated.medicalNotes || null,
        allergies: validated.allergies || null,
        medicalConditions: validated.medicalConditions || null,
        emergencyContactName: validated.emergencyContactName || null,
        emergencyContactPhone: validated.emergencyContactPhone || null,
        emergencyContactRelationship: validated.emergencyContactRelationship || null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'STUDENT_CREATE',
        entityType: 'student',
        entityId: created.id,
        newValues: {
          admissionNumber: created.admissionNumber,
          name: `${created.firstName} ${created.lastName}`,
          status: created.currentStatus,
        },
      },
    });

    return created;
  };

  const student = externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);

  return {
    student,
    duplicateWarnings: duplicateCheck.warnings,
  };
}

/**
 * Updates an existing student. Admission number is strictly immutable.
 */
export async function updateStudent(
  actor: SafeUser,
  studentId: string,
  input: UpdateStudentInput
) {
  await requirePermission(actor, PermissionCode.STUDENT_EDIT);
  const validated = UpdateStudentSchema.parse(input);

  const existing = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!existing) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }

  const hasMedicalUpdate = Boolean(
    validated.bloodGroup !== undefined ||
    validated.genotype !== undefined ||
    validated.medicalNotes !== undefined ||
    validated.allergies !== undefined ||
    validated.medicalConditions !== undefined
  );

  if (hasMedicalUpdate) {
    await requirePermission(actor, PermissionCode.STUDENT_MEDICAL_EDIT);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.student.update({
      where: { id: studentId },
      data: {
        ...(validated.firstName && { firstName: validated.firstName }),
        ...(validated.lastName && { lastName: validated.lastName }),
        ...(validated.otherNames !== undefined && { otherNames: validated.otherNames }),
        ...(validated.preferredName !== undefined && { preferredName: validated.preferredName }),
        ...(validated.gender && { gender: validated.gender }),
        ...(validated.dateOfBirth && { dateOfBirth: validated.dateOfBirth }),
        ...(validated.admissionDate && { admissionDate: validated.admissionDate }),
        ...(validated.bloodGroup !== undefined && { bloodGroup: validated.bloodGroup }),
        ...(validated.genotype !== undefined && { genotype: validated.genotype }),
        ...(validated.medicalNotes !== undefined && { medicalNotes: validated.medicalNotes }),
        ...(validated.allergies !== undefined && { allergies: validated.allergies }),
        ...(validated.medicalConditions !== undefined && { medicalConditions: validated.medicalConditions }),
        ...(validated.emergencyContactName !== undefined && { emergencyContactName: validated.emergencyContactName }),
        ...(validated.emergencyContactPhone !== undefined && { emergencyContactPhone: validated.emergencyContactPhone }),
        ...(validated.emergencyContactRelationship !== undefined && { emergencyContactRelationship: validated.emergencyContactRelationship }),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'STUDENT_UPDATE',
        entityType: 'student',
        entityId: studentId,
        oldValues: {
          firstName: existing.firstName,
          lastName: existing.lastName,
          currentStatus: existing.currentStatus,
        },
        newValues: {
          firstName: res.firstName,
          lastName: res.lastName,
          currentStatus: res.currentStatus,
        },
      },
    });

    return res;
  });

  return updated;
}

/**
 * Retrieves a single student profile with role-based sensitive data projection.
 */
export async function getStudentById(
  actor: SafeUser,
  studentId: string,
  options?: {
    academicSessionId?: string;
    programmeId?: string;
  }
): Promise<StudentDetailedView> {
  const roles = await getUserRoles(actor.id);
  const permissions = await getUserPermissions(actor.id);
  const isSuperAdmin = roles.includes(RoleCode.SUPER_ADMIN);
  const isAdmin = roles.includes(RoleCode.ADMIN);
  const isTeacher = roles.includes(RoleCode.TEACHER);
  const isParent = roles.includes(RoleCode.PARENT);
  const isAccountant = roles.includes(RoleCode.ACCOUNTANT);

  // Authorization check
  if (isParent) {
    await assertParentOwnsStudent(actor, studentId);
  } else if (isTeacher && !isAdmin && !isSuperAdmin) {
    if (!options?.programmeId) {
      // Find an active programme enrollment to evaluate scope
      const enrollment = await prisma.studentProgrammeEnrollment.findFirst({
        where: {
          studentId,
          enrollmentStatus: 'ACTIVE',
        },
        select: {
          programmeId: true,
          schoolClassId: true,
          academicSessionId: true,
        },
      });

      if (!enrollment) {
        throw new AuthorizationError(
          'Access denied: Student is not actively enrolled in any programme within teacher scope.',
          403,
          'STUDENT_ENROLLMENT_NOT_FOUND'
        );
      }

      await assertTeacherStudentScope(actor, {
        studentId,
        programmeId: enrollment.programmeId,
        schoolClassId: enrollment.schoolClassId,
        academicSessionId: options?.academicSessionId || enrollment.academicSessionId,
      });
    } else {
      await assertTeacherStudentScope(actor, {
        studentId,
        programmeId: options.programmeId,
        academicSessionId: options?.academicSessionId,
      });
    }
  } else if (isAccountant || isAdmin || isSuperAdmin) {
    await requirePermission(actor, PermissionCode.STUDENT_VIEW);
  } else {
    throw new AuthorizationError('Access denied: Unauthorized to view students.', 403, 'UNAUTHORIZED');
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!student) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }

  // Base demographic projection (safe for all authorized viewers)
  const baseView: StudentDemographicView = {
    id: student.id,
    admissionNumber: student.admissionNumber,
    firstName: student.firstName,
    lastName: student.lastName,
    otherNames: student.otherNames,
    preferredName: student.preferredName,
    gender: student.gender,
    dateOfBirth: student.dateOfBirth,
    admissionDate: student.admissionDate,
    currentStatus: student.currentStatus,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };

  // Field-level sensitive data visibility projection (Amendment 3)
  const sensitiveView: StudentSensitiveDetails = {};

  if (isSuperAdmin || (isAdmin && permissions.has(PermissionCode.STUDENT_MEDICAL_VIEW))) {
    // SuperAdmin and Medical Admin see everything
    sensitiveView.bloodGroup = student.bloodGroup;
    sensitiveView.genotype = student.genotype;
    sensitiveView.medicalNotes = student.medicalNotes;
    sensitiveView.allergies = student.allergies;
    sensitiveView.medicalConditions = student.medicalConditions;
    sensitiveView.emergencyContactName = student.emergencyContactName;
    sensitiveView.emergencyContactPhone = student.emergencyContactPhone;
    sensitiveView.emergencyContactRelationship = student.emergencyContactRelationship;
  } else if (isParent) {
    // Owning parent sees medical profile and emergency contacts, but not clinic internal notes
    sensitiveView.bloodGroup = student.bloodGroup;
    sensitiveView.genotype = student.genotype;
    sensitiveView.allergies = student.allergies;
    sensitiveView.medicalConditions = student.medicalConditions;
    sensitiveView.emergencyContactName = student.emergencyContactName;
    sensitiveView.emergencyContactPhone = student.emergencyContactPhone;
    sensitiveView.emergencyContactRelationship = student.emergencyContactRelationship;
  } else if (isTeacher) {
    // Teacher sees classroom safety data (allergies, emergency contacts) but NOT blood group, genotype, or private medical notes
    sensitiveView.allergies = student.allergies;
    sensitiveView.medicalConditions = student.medicalConditions;
    sensitiveView.emergencyContactName = student.emergencyContactName;
    sensitiveView.emergencyContactPhone = student.emergencyContactPhone;
    sensitiveView.emergencyContactRelationship = student.emergencyContactRelationship;
  }

  return {
    ...baseView,
    ...sensitiveView,
  };
}

/**
 * Lists students with filtering and pagination.
 * CRITICAL RULE: Generic list responses NEVER project medical or emergency fields.
 */
export async function listStudents(
  actor: SafeUser,
  options?: {
    search?: string;
    status?: StudentStatus;
    programmeId?: string;
    schoolClassId?: string;
    academicSessionId?: string;
    limit?: number;
    offset?: number;
  }
) {
  await requirePermission(actor, PermissionCode.STUDENT_VIEW);

  const limit = Math.min(options?.limit || 50, 100);
  const offset = options?.offset || 0;

  const whereClause: Record<string, unknown> = {};

  if (options?.status) {
    whereClause.currentStatus = options.status;
  }

  if (options?.search?.trim()) {
    const query = options.search.trim();
    whereClause.OR = [
      { firstName: { contains: query, mode: 'insensitive' } },
      { lastName: { contains: query, mode: 'insensitive' } },
      { admissionNumber: { contains: query, mode: 'insensitive' } },
    ];
  }

  if (options?.programmeId || options?.schoolClassId || options?.academicSessionId) {
    whereClause.programmeEnrollments = {
      some: {
        ...(options.programmeId && { programmeId: options.programmeId }),
        ...(options.schoolClassId && { schoolClassId: options.schoolClassId }),
        ...(options.academicSessionId && { academicSessionId: options.academicSessionId }),
        enrollmentStatus: 'ACTIVE',
      },
    };
  }

  const [total, students] = await Promise.all([
    prisma.student.count({ where: whereClause }),
    prisma.student.findMany({
      where: whereClause,
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        preferredName: true,
        gender: true,
        dateOfBirth: true,
        admissionDate: true,
        currentStatus: true,
        createdAt: true,
        updatedAt: true,
        // Notice: NO medicalNotes, bloodGroup, genotype, allergies, or emergency contacts projected here!
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    limit,
    offset,
    students,
  };
}

/**
 * Transitions a student's lifecycle status (ACTIVE, INACTIVE, WITHDRAWN, GRADUATED, ARCHIVED).
 * Completely separate from individual programme enrollment statuses.
 */
export async function transitionStudentStatus(
  actor: SafeUser,
  studentId: string,
  newStatus: StudentStatus,
  reason?: string
) {
  await requirePermission(actor, PermissionCode.STUDENT_EDIT);

  if (newStatus === StudentStatus.ARCHIVED) {
    await requirePermission(actor, PermissionCode.STUDENT_ARCHIVE);
  }

  const existing = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!existing) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }

  if (existing.currentStatus === newStatus) {
    return existing;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.student.update({
      where: { id: studentId },
      data: { currentStatus: newStatus },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'STUDENT_STATUS_TRANSITION',
        entityType: 'student',
        entityId: studentId,
        oldValues: { currentStatus: existing.currentStatus },
        newValues: { currentStatus: newStatus, reason: reason || null },
      },
    });

    return res;
  });

  return updated;
}
