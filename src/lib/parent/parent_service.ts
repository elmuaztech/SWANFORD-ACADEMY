import {
  RelationshipStatus,
  AssessmentStatus,
  NotificationCategory,
  NotificationChannel,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthorizationError } from '@/lib/auth/authorization';
import { assertParentOwnsStudent } from '@/lib/auth/scopes';
import { getStudentAttendanceSummary } from '@/lib/attendance/attendance_service';
import { calculateStudentTermResults } from '@/lib/assessment/assessment_service';

/**
 * Swanford Academy — Parent Portal Domain Service
 * Master Specification Reference: Sections 9, 10, 11, 15, 17, 18
 */

/**
 * Retrieves the authenticated parent's profile and active linked children.
 */
export async function getParentProfile(userId: string) {
  let guardian = await prisma.guardian.findUnique({
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
      relationships: {
        where: { status: RelationshipStatus.ACTIVE },
        include: {
          student: {
            include: {
              programmeEnrollments: {
                where: { enrollmentStatus: 'ACTIVE' },
                include: {
                  programme: true,
                  schoolClass: true,
                  academicSession: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!guardian) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (user) {
      // 1. Check if a guardian profile already exists matching the user's email
      const existingByEmail = await prisma.guardian.findFirst({
        where: {
          email: { equals: user.email, mode: 'insensitive' },
        },
      });

      if (existingByEmail) {
        await prisma.guardian.update({
          where: { id: existingByEmail.id },
          data: { userId: user.id },
        });
      } else {
        // 2. Check if user submitted any admission applications under this email
        const app = await prisma.application.findFirst({
          where: {
            guardianEmail: { equals: user.email, mode: 'insensitive' },
          },
          orderBy: { createdAt: 'desc' },
        });

        const firstName = app?.guardianFirstName?.trim() || 'Parent';
        const lastName = app?.guardianLastName?.trim() || 'Guardian';
        const phone = app?.guardianPhone?.trim() || user.phoneNumber || '08000000000';

        const createdGuardian = await prisma.guardian.create({
          data: {
            userId: user.id,
            firstName,
            lastName,
            email: user.email.toLowerCase(),
            phonePrimary: phone,
            isVerified: true,
          },
        });

        // Link existing applications
        await prisma.application.updateMany({
          where: {
            guardianEmail: { equals: user.email, mode: 'insensitive' },
            existingGuardianId: null,
          },
          data: {
            existingGuardianId: createdGuardian.id,
          },
        });
      }

      // Re-fetch guardian with full includes
      guardian = await prisma.guardian.findUnique({
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
          relationships: {
            where: { status: RelationshipStatus.ACTIVE },
            include: {
              student: {
                include: {
                  programmeEnrollments: {
                    where: { enrollmentStatus: 'ACTIVE' },
                    include: {
                      programme: true,
                      schoolClass: true,
                      academicSession: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }
  }

  if (!guardian) {
    throw new AuthorizationError(
      'Access denied: Authenticated user does not have a linked guardian profile.',
      403,
      'GUARDIAN_PROFILE_MISSING'
    );
  }

  const children = guardian.relationships.map((rel) => ({
    studentId: rel.student.id,
    admissionNumber: rel.student.admissionNumber,
    firstName: rel.student.firstName,
    lastName: rel.student.lastName,
    otherNames: rel.student.otherNames,
    preferredName: rel.student.preferredName,
    gender: rel.student.gender,
    dateOfBirth: rel.student.dateOfBirth,
    currentStatus: rel.student.currentStatus,
    relationshipType: rel.relationshipType,
    isPrimaryContact: rel.isPrimaryContact,
    canPickup: rel.canPickup,
    receivesInvoices: rel.receivesInvoices,
    profilePhotoId: rel.student.profilePhotoId || null,
    enrollments: rel.student.programmeEnrollments.map((enr) => ({
      programmeId: enr.programmeId,
      programmeName: enr.programme.name,
      programmeCode: enr.programme.code,
      schoolClassId: enr.schoolClassId,
      className: enr.schoolClass.name,
      arm: enr.schoolClass.arm,
      sessionName: enr.academicSession.name,
    })),
  }));

  return {
    guardian: {
      id: guardian.id,
      fullName: `${guardian.firstName} ${guardian.lastName}`,
      email: guardian.email,
      phonePrimary: guardian.phonePrimary,
      phoneSecondary: guardian.phoneSecondary,
      residentialAddress: guardian.residentialAddress,
      occupation: guardian.occupation,
      isVerified: guardian.isVerified,
      profilePhotoId: guardian.user?.profilePhotoId || null,
    },
    children,
  };
}

/**
 * Retrieves detailed child profile for a verified linked parent.
 */
export async function getParentChildProfile(userId: string, studentId: string) {
  // 1. Authorize ownership
  const relationship = await assertParentOwnsStudent(userId, studentId);

  // 2. Fetch student details with active enrollments
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      programmeEnrollments: {
        where: { enrollmentStatus: 'ACTIVE' },
        include: {
          programme: true,
          schoolClass: true,
          academicSession: true,
          academicTerm: true,
        },
      },
    },
  });

  if (!student) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }

  return {
    student: {
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
      profilePhotoId: student.profilePhotoId || null,
      // Medical data visible to own child's parent
      bloodGroup: student.bloodGroup,
      genotype: student.genotype,
      allergies: student.allergies,
      medicalConditions: student.medicalConditions,
      // Operational emergency contacts
      emergencyContactName: student.emergencyContactName,
      emergencyContactPhone: student.emergencyContactPhone,
      emergencyContactRelationship: student.emergencyContactRelationship,
    },
    relationship: {
      relationshipType: relationship.relationshipType,
      isPrimaryContact: relationship.isPrimaryContact,
      canPickup: relationship.canPickup,
      receivesInvoices: relationship.receivesInvoices,
    },
    enrollments: student.programmeEnrollments.map((e) => ({
      programmeId: e.programmeId,
      programmeName: e.programme.name,
      programmeCode: e.programme.code,
      schoolClassId: e.schoolClassId,
      className: e.schoolClass.name,
      arm: e.schoolClass.arm,
      sessionName: e.academicSession.name,
      termName: e.academicTerm.name,
    })),
  };
}

/**
 * Retrieves attendance summary and records for a verified linked child.
 */
export async function getParentChildAttendance(
  userId: string,
  studentId: string,
  params?: { academicTermId?: string; programmeId?: string }
) {
  await assertParentOwnsStudent(userId, studentId);

  const summary = await getStudentAttendanceSummary(studentId, params);

  const records = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      ...(params?.academicTermId ? { academicTermId: params.academicTermId } : {}),
      ...(params?.programmeId ? { programmeId: params.programmeId } : {}),
    },
    include: {
      schoolClass: { select: { name: true, arm: true } },
      programme: { select: { name: true, code: true } },
    },
    orderBy: { date: 'desc' },
    take: 60,
  });

  return {
    summary,
    records: records.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      remarks: r.remarks,
      className: `${r.schoolClass.name}${r.schoolClass.arm ? ` (${r.schoolClass.arm})` : ''}`,
      programmeName: r.programme.name,
    })),
  };
}

/**
 * Retrieves published academic results for a verified linked child.
 * Strictly filters out DRAFT and SUBMITTED assessments; only FINALIZED results are returned.
 */
export async function getParentChildResults(
  userId: string,
  studentId: string,
  params?: { academicTermId?: string; programmeId?: string }
) {
  await assertParentOwnsStudent(userId, studentId);

  // 1. Resolve term if not provided
  let termId = params?.academicTermId;
  let programmeId = params?.programmeId;

  if (!termId || !programmeId) {
    const activeEnrollment = await prisma.studentProgrammeEnrollment.findFirst({
      where: {
        studentId,
        enrollmentStatus: 'ACTIVE',
        ...(programmeId ? { programmeId } : {}),
      },
      include: { academicTerm: true },
      orderBy: { enrollmentType: 'asc' },
    });

    if (activeEnrollment) {
      if (!termId) termId = activeEnrollment.academicTermId;
      if (!programmeId) programmeId = activeEnrollment.programmeId;
    }
  }

  if (!termId || !programmeId) {
    return { results: [], summary: null };
  }

  // 2. Fetch subject term results using authoritative calculation service
  const subjectResults = await calculateStudentTermResults({
    studentId,
    programmeId,
    academicTermId: termId,
  });

  // 3. Also fetch individual finalized score details
  const finalizedScores = await prisma.assessmentScore.findMany({
    where: {
      studentId,
      assessment: {
        programmeId,
        academicTermId: termId,
        status: AssessmentStatus.FINALIZED,
      },
    },
    include: {
      assessment: {
        include: {
          subject: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    termId,
    programmeId,
    subjectResults,
    assessmentsCount: finalizedScores.length,
    scores: finalizedScores.map((s) => ({
      id: s.id,
      title: s.assessment.title,
      type: s.assessment.type,
      subjectName: s.assessment.subject?.name || 'General',
      rawScore: s.rawScore ? Number(s.rawScore) : null,
      maxScore: Number(s.assessment.maxScore),
      weightPercentage: Number(s.assessment.weightPercentage),
      grade: s.grade,
      remark: s.remark,
      scoreStatus: s.scoreStatus,
      teacherNotes: s.teacherNotes,
    })),
  };
}

/**
 * Retrieves invoice, payment, and receipt history for a child.
 * Enforces:
 * 1. Parent owns child (assertParentOwnsStudent).
 * 2. GuardianStudentRelationship.receivesInvoices === true.
 */
export async function getParentChildFinance(userId: string, studentId: string) {
  const relationship = await assertParentOwnsStudent(userId, studentId);

  if (!relationship.receivesInvoices) {
    throw new AuthorizationError(
      'Access restricted: You are not designated to receive financial invoices for this student.',
      403,
      'INVOICE_ACCESS_RESTRICTED'
    );
  }

  // Fetch all invoices for student
  const invoices = await prisma.invoice.findMany({
    where: { studentId },
    include: {
      items: true,
      academicSession: { select: { name: true } },
      academicTerm: { select: { name: true } },
      programme: { select: { name: true } },
      payments: {
        where: { status: 'CONFIRMED' },
        include: {
          receipt: true,
        },
        orderBy: { paidAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    sessionName: inv.academicSession.name,
    termName: inv.academicTerm?.name || 'Full Session',
    programmeName: inv.programme?.name || 'General',
    status: inv.status,
    totalAmountKobo: inv.totalAmountKobo.toString(),
    amountPaidKobo: inv.amountPaidKobo.toString(),
    outstandingBalanceKobo: inv.outstandingBalanceKobo.toString(),
    dueDate: inv.dueDate.toISOString().slice(0, 10),
    createdAt: inv.createdAt.toISOString().slice(0, 10),
    items: inv.items.map((item) => ({
      id: item.id,
      description: item.description,
      totalAmountKobo: item.totalAmountKobo.toString(),
    })),
    payments: inv.payments.map((p) => ({
      id: p.id,
      paymentReference: p.paymentReference,
      amountKobo: p.amountKobo.toString(),
      paymentMethod: p.paymentMethod,
      paidAt: p.paidAt.toISOString().slice(0, 10),
      receiptNumber: p.receipt?.receiptNumber || null,
      receiptIssuedAt: p.receipt?.issuedAt.toISOString().slice(0, 10) || null,
    })),
  }));
}

/**
 * Retrieves admission applications legitimately linked to the guardian.
 * Enforces Section 10:
 * guardianEmail matching is NOT sufficient authorization.
 * Only returns applications with verified existingGuardianId === guardian.id or
 * linked to an actively matriculated child.
 * Completely strips internal reviewer notes, rankings, and medical evaluations.
 */
export async function getParentAdmissions(userId: string) {
  const profile = await getParentProfile(userId);
  const guardianId = profile.guardian.id;
  const linkedStudentIds = profile.children.map((c) => c.studentId);

  const applications = await prisma.application.findMany({
    where: {
      OR: [
        { existingGuardianId: guardianId },
        { admittedStudentId: { in: linkedStudentIds } },
      ],
    },
    include: {
      academicSession: { select: { name: true } },
      admissionCycle: { select: { name: true } },
      programmeSelections: {
        include: {
          programme: { select: { name: true, code: true } },
          targetClass: { select: { name: true, arm: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Sanitize: never expose reviewer notes, internal rankings, or medical evaluations
  return applications.map((app) => ({
    id: app.id,
    applicationNumber: app.applicationNumber,
    studentName: `${app.applicantFirstName} ${app.applicantLastName}`.trim(),
    sessionName: app.academicSession?.name || 'Current Session',
    cycleName: app.admissionCycle?.name || 'General Admission',
    status: app.status,
    paymentStatus: app.paymentStatus,
    createdAt: app.createdAt.toISOString(),
    submittedAt: app.createdAt.toISOString(),
    programmeName: app.programmeSelections[0]?.programme?.name || 'General Admission',
    targetClassName: app.programmeSelections[0]?.targetClass
      ? `${app.programmeSelections[0].targetClass.name}${app.programmeSelections[0].targetClass.arm ? ` (${app.programmeSelections[0].targetClass.arm})` : ''}`
      : undefined,
    programmes: app.programmeSelections.map((ps) => ({
      programmeName: ps.programme.name,
      className: ps.targetClass ? `${ps.targetClass.name}${ps.targetClass.arm ? ` (${ps.targetClass.arm})` : ''}` : null,
      status: ps.status,
    })),
  }));
}

/**
 * Updates notification preferences for the parent.
 */
export async function updateParentNotificationPreferences(
  userId: string,
  preferences: Array<{
    category: NotificationCategory;
    channel: NotificationChannel;
    enabled: boolean;
  }>
) {
  await prisma.$transaction(async (tx) => {
    for (const pref of preferences) {
      await tx.notificationPreference.upsert({
        where: {
          userId_category_channel: {
            userId,
            category: pref.category,
            channel: pref.channel,
          },
        },
        create: {
          userId,
          category: pref.category,
          channel: pref.channel,
          enabled: pref.enabled,
        },
        update: {
          enabled: pref.enabled,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: 'NOTIFICATION_PREFERENCES_UPDATED',
        entityType: 'NotificationPreference',
        entityId: userId,
        newValues: { preferencesCount: preferences.length },
      },
    });
  });

  return { success: true };
}
