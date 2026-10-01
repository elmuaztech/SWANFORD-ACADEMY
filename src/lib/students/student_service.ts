import { Gender, StudentStatus, RoleCode, Prisma, EnrollmentType, EnrollmentStatus } from '@prisma/client';
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
  profilePhotoId: z.string().uuid().optional().nullable(),
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
  profilePhotoId: z.string().uuid().optional().nullable(),
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
  profilePhotoId?: string | null;
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
        profilePhotoId: validated.profilePhotoId || null,
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
    profilePhotoId: student.profilePhotoId,
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
        programmeEnrollments: {
          where: { enrollmentStatus: 'ACTIVE' },
          select: {
            programme: { select: { code: true } },
            schoolClass: { select: { id: true, name: true } },
          },
        },
        guardianLinks: {
          where: { status: 'ACTIVE' },
          select: {
            guardian: {
              select: { firstName: true, lastName: true, phonePrimary: true },
            },
          },
        },
        // Notice: NO medicalNotes, bloodGroup, genotype, allergies, or emergency contacts projected here!
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
      skip: offset,
    }),
  ]);

  const mappedStudents = students.map((s) => {
    const primaryEnrollment = s.programmeEnrollments?.find((pe) => pe.programme.code !== 'TAHFEEZ');
    const tahfeezEnrollment = s.programmeEnrollments?.find((pe) => pe.programme.code === 'TAHFEEZ');
    return {
      ...s,
      status: s.currentStatus,
      middleName: s.otherNames,
      primaryClass: primaryEnrollment ? primaryEnrollment.schoolClass : null,
      tahfeezClass: tahfeezEnrollment ? tahfeezEnrollment.schoolClass : null,
      guardians: (s.guardianLinks || []).map((gl) => ({
        guardian: gl.guardian,
      })),
    };
  });

  return {
    total,
    limit,
    offset,
    students: mappedStudents,
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

export const UpdateStudentDossierSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').trim().optional(),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').trim().optional(),
  otherNames: z.string().trim().nullable().optional(),
  preferredName: z.string().trim().nullable().optional(),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: z.coerce.date().refine((d) => d < new Date(), {
    message: 'Date of birth must be in the past',
  }).optional(),
  currentStatus: z.nativeEnum(StudentStatus).optional(),
  bloodGroup: z.string().trim().nullable().optional(),
  genotype: z.string().trim().nullable().optional(),
  medicalNotes: z.string().trim().nullable().optional(),
  allergies: z.string().trim().nullable().optional(),
  medicalConditions: z.string().trim().nullable().optional(),
  emergencyContactName: z.string().trim().nullable().optional(),
  emergencyContactPhone: z.string().trim().nullable().optional(),
  emergencyContactRelationship: z.string().trim().nullable().optional(),
  primaryClassId: z.string().uuid().nullable().optional(),
  tahfeezClassId: z.string().uuid().nullable().optional(),
});

export type UpdateStudentDossierInput = z.infer<typeof UpdateStudentDossierSchema>;

/**
 * Retrieves full comprehensive student dossier for administrative management.
 * Guarantees all relation arrays (guardians, programmeEnrollments, attendanceRecords, invoices)
 * and resolved classes are populated, preventing frontend undefined errors.
 */
export async function getAdminStudentDossier(actor: SafeUser, studentId: string) {
  const roles = await getUserRoles(actor.id);
  const permissions = await getUserPermissions(actor.id);
  const isSuperAdmin = roles.includes(RoleCode.SUPER_ADMIN);
  const isAdmin = roles.includes(RoleCode.ADMIN);
  const isAccountant = roles.includes(RoleCode.ACCOUNTANT);

  if (!isSuperAdmin && !isAdmin && !isAccountant) {
    await requirePermission(actor, PermissionCode.STUDENT_VIEW);
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      guardianLinks: {
        where: { status: 'ACTIVE' },
        include: {
          guardian: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phonePrimary: true,
              email: true,
              residentialAddress: true,
            },
          },
        },
      },
      programmeEnrollments: {
        where: { enrollmentStatus: 'ACTIVE' },
        include: {
          programme: { select: { id: true, name: true, code: true } },
          schoolClass: { select: { id: true, name: true, code: true } },
        },
      },
      attendanceRecords: {
        take: 30,
        orderBy: { date: 'desc' },
        include: {
          schoolClass: { select: { id: true, name: true } },
        },
      },
      invoices: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmountKobo: true,
          amountPaidKobo: true,
          status: true,
        },
      },
    },
  });

  if (!student) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }

  // Derive primaryClass (main academic) and tahfeezClass
  const primaryEnrollment = student.programmeEnrollments.find(
    (pe) => pe.programme.code !== 'TAHFEEZ'
  );
  const tahfeezEnrollment = student.programmeEnrollments.find(
    (pe) => pe.programme.code === 'TAHFEEZ'
  );

  const primaryClass = primaryEnrollment
    ? { id: primaryEnrollment.schoolClass.id, name: primaryEnrollment.schoolClass.name }
    : null;

  const tahfeezClass = tahfeezEnrollment
    ? { id: tahfeezEnrollment.schoolClass.id, name: tahfeezEnrollment.schoolClass.name }
    : null;

  // Format guardians
  const guardians = (student.guardianLinks || []).map((gl) => ({
    id: gl.id,
    relationshipType: gl.relationshipType,
    isPrimaryPayer: gl.receivesInvoices || gl.isPrimaryContact,
    isEmergencyContact: gl.isPrimaryContact,
    guardian: {
      id: gl.guardian.id,
      firstName: gl.guardian.firstName,
      lastName: gl.guardian.lastName,
      phonePrimary: gl.guardian.phonePrimary || '',
      email: gl.guardian.email || null,
      residentialAddress: gl.guardian.residentialAddress || null,
    },
  }));

  // Format programme enrollments
  const programmeEnrollments = (student.programmeEnrollments || []).map((pe) => ({
    id: pe.id,
    programme: { id: pe.programme.id, name: pe.programme.name, code: pe.programme.code },
    schoolClass: { id: pe.schoolClass.id, name: pe.schoolClass.name },
    status: pe.enrollmentStatus,
  }));

  // Format attendance records
  const attendanceRecords = (student.attendanceRecords || []).map((ar) => ({
    id: ar.id,
    date: ar.date.toISOString(),
    status: ar.status,
    remarks: ar.remarks,
    schoolClass: { name: ar.schoolClass.name },
  }));

  // Format invoices
  const invoices = (student.invoices || []).map((inv) => {
    const total = BigInt(inv.totalAmountKobo);
    const paid = BigInt(inv.amountPaidKobo);
    const balance = total > paid ? total - paid : BigInt(0);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmountKobo: total.toString(),
      amountPaidKobo: paid.toString(),
      outstandingBalanceKobo: balance.toString(),
      status: inv.status,
    };
  });

  // Sensitive medical projection
  const canViewMedical = isSuperAdmin || permissions.has(PermissionCode.STUDENT_MEDICAL_VIEW);

  return {
    id: student.id,
    admissionNumber: student.admissionNumber,
    firstName: student.firstName,
    lastName: student.lastName,
    otherNames: student.otherNames,
    middleName: student.otherNames,
    preferredName: student.preferredName,
    gender: student.gender,
    dob: student.dateOfBirth.toISOString(),
    dateOfBirth: student.dateOfBirth.toISOString(),
    admissionDate: student.admissionDate.toISOString(),
    status: student.currentStatus,
    currentStatus: student.currentStatus,
    profilePhotoId: student.profilePhotoId,
    primaryClass,
    tahfeezClass,
    guardians,
    programmeEnrollments,
    attendanceRecords,
    invoices,
    assessmentScores: [],
    reportReleases: [],
    // Sensitive data
    bloodGroup: canViewMedical ? student.bloodGroup : null,
    genotype: canViewMedical ? student.genotype : null,
    medicalNotes: canViewMedical ? student.medicalNotes : null,
    allergies: canViewMedical ? student.allergies : null,
    medicalConditions: canViewMedical ? student.medicalConditions : null,
    emergencyContactName: student.emergencyContactName,
    emergencyContactPhone: student.emergencyContactPhone,
    emergencyContactRelationship: student.emergencyContactRelationship,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
  };
}

/**
 * Super Admin exclusive: Updates a student's dossier and class assignments.
 */
export async function updateStudentAdminDossier(
  actor: SafeUser,
  studentId: string,
  input: UpdateStudentDossierInput
) {
  const roles = await getUserRoles(actor.id);
  const isSuperAdmin = roles.includes(RoleCode.SUPER_ADMIN);
  if (!isSuperAdmin) {
    throw new AuthorizationError(
      'Access denied: Only Super Administrators have authority to modify student dossiers.',
      403,
      'SUPER_ADMIN_REQUIRED'
    );
  }

  const validated = UpdateStudentDossierSchema.parse(input);

  const existing = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      programmeEnrollments: {
        where: { enrollmentStatus: 'ACTIVE' },
        include: { programme: true, schoolClass: true },
      },
    },
  });

  if (!existing) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Update Student Table
    const updated = await tx.student.update({
      where: { id: studentId },
      data: {
        ...(validated.firstName && { firstName: validated.firstName }),
        ...(validated.lastName && { lastName: validated.lastName }),
        ...(validated.otherNames !== undefined && { otherNames: validated.otherNames }),
        ...(validated.preferredName !== undefined && { preferredName: validated.preferredName }),
        ...(validated.gender && { gender: validated.gender }),
        ...(validated.dateOfBirth && { dateOfBirth: validated.dateOfBirth }),
        ...(validated.currentStatus && { currentStatus: validated.currentStatus }),
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

    // 2. Handle Primary Class Assignment
    if (validated.primaryClassId !== undefined && validated.primaryClassId !== null) {
      const targetClass = await tx.schoolClass.findUnique({
        where: { id: validated.primaryClassId },
        include: { programme: true },
      });

      if (targetClass) {
        const activePrimaryEnrollment = existing.programmeEnrollments.find(
          (pe) => pe.programme.code !== 'TAHFEEZ'
        );

        if (activePrimaryEnrollment) {
          if (activePrimaryEnrollment.schoolClassId !== targetClass.id) {
            await tx.studentProgrammeEnrollment.update({
              where: { id: activePrimaryEnrollment.id },
              data: {
                schoolClassId: targetClass.id,
                programmeId: targetClass.programmeId,
              },
            });
          }
        } else {
          const currentSession = await tx.academicSession.findFirst({
            where: { isCurrent: true },
            include: { terms: { where: { isCurrent: true }, take: 1 } },
          });

          if (currentSession && currentSession.terms[0]) {
            await tx.studentProgrammeEnrollment.create({
              data: {
                studentId,
                programmeId: targetClass.programmeId,
                schoolClassId: targetClass.id,
                academicSessionId: currentSession.id,
                academicTermId: currentSession.terms[0].id,
                enrollmentType: EnrollmentType.MAIN_ACADEMIC,
                enrollmentStatus: EnrollmentStatus.ACTIVE,
              },
            });
          }
        }
      }
    }

    // 3. Handle Tahfeez Class Assignment
    if (validated.tahfeezClassId !== undefined) {
      const activeTahfeezEnrollment = existing.programmeEnrollments.find(
        (pe) => pe.programme.code === 'TAHFEEZ'
      );

      if (validated.tahfeezClassId) {
        const targetTahfeezClass = await tx.schoolClass.findUnique({
          where: { id: validated.tahfeezClassId },
          include: { programme: true },
        });

        if (targetTahfeezClass) {
          if (activeTahfeezEnrollment) {
            if (activeTahfeezEnrollment.schoolClassId !== targetTahfeezClass.id) {
              await tx.studentProgrammeEnrollment.update({
                where: { id: activeTahfeezEnrollment.id },
                data: { schoolClassId: targetTahfeezClass.id },
              });
            }
          } else {
            const currentSession = await tx.academicSession.findFirst({
              where: { isCurrent: true },
              include: { terms: { where: { isCurrent: true }, take: 1 } },
            });
            if (currentSession && currentSession.terms[0]) {
              await tx.studentProgrammeEnrollment.create({
                data: {
                  studentId,
                  programmeId: targetTahfeezClass.programmeId,
                  schoolClassId: targetTahfeezClass.id,
                  academicSessionId: currentSession.id,
                  academicTermId: currentSession.terms[0].id,
                  enrollmentType: EnrollmentType.ADDITIONAL_PROGRAMME,
                  enrollmentStatus: EnrollmentStatus.ACTIVE,
                },
              });
            }
          }
        }
      } else if (validated.tahfeezClassId === null && activeTahfeezEnrollment) {
        await tx.studentProgrammeEnrollment.update({
          where: { id: activeTahfeezEnrollment.id },
          data: { enrollmentStatus: EnrollmentStatus.WITHDRAWN },
        });
      }
    }

    // 4. Audit Log
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
          firstName: updated.firstName,
          lastName: updated.lastName,
          currentStatus: updated.currentStatus,
        },
      },
    });

    return updated;
  });
}

/**
 * Super Admin exclusive: Permanently deletes a student record and all cascading associations.
 */
export async function deleteStudent(actor: SafeUser, studentId: string) {
  const roles = await getUserRoles(actor.id);
  const isSuperAdmin = roles.includes(RoleCode.SUPER_ADMIN);
  if (!isSuperAdmin) {
    throw new AuthorizationError(
      'Access denied: Only Super Administrators have authority to permanently delete student records.',
      403,
      'SUPER_ADMIN_REQUIRED'
    );
  }

  const existing = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, admissionNumber: true, firstName: true, lastName: true },
  });

  if (!existing) {
    throw new AuthorizationError('Student record not found.', 404, 'STUDENT_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Guardian relationships
    await tx.guardianStudentRelationship.deleteMany({ where: { studentId } });

    // 2. Programme enrollments
    await tx.studentProgrammeEnrollment.deleteMany({ where: { studentId } });

    // 3. Attendance records
    await tx.attendanceRecord.deleteMany({ where: { studentId } });

    // 4. Assessment scores
    await tx.assessmentScore.deleteMany({ where: { studentId } });

    // 5. Report releases
    await tx.reportRelease.deleteMany({ where: { studentId } });

    // 6. Student import rows
    await tx.studentImportRow.deleteMany({ where: { studentId } });

    // 7. Unlink admissions applications
    await tx.application.updateMany({
      where: { admittedStudentId: studentId },
      data: { admittedStudentId: null },
    });

    // 8. Delete invoices and payments safely
    await tx.paymentAllocation.deleteMany({
      where: { invoice: { studentId } },
    });
    const payments = await tx.payment.findMany({
      where: { studentId },
      select: { id: true },
    });
    const paymentIds = payments.map((p) => p.id);
    if (paymentIds.length > 0) {
      await tx.receipt.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await tx.paymentTransaction.deleteMany({ where: { schoolPaymentId: { in: paymentIds } } });
      await tx.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await tx.invoiceItem.deleteMany({ where: { invoice: { studentId } } });
    await tx.invoice.deleteMany({ where: { studentId } });

    // 9. Delete student
    const deleted = await tx.student.delete({ where: { id: studentId } });

    // 10. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'STUDENT_DELETE',
        entityType: 'student',
        entityId: studentId,
        oldValues: {
          admissionNumber: existing.admissionNumber,
          name: `${existing.firstName} ${existing.lastName}`,
        },
      },
    });

    return deleted;
  });
}
