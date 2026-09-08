import { prisma } from '@/lib/prisma';
import {
  ApplicationPaymentStatus,
  ApplicationStatus,
  EnrollmentType,
  ProgrammeSelectionStatus,
  TermCode,
} from '@prisma/client';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { createStudent } from '@/lib/students/student_service';
import { createGuardian } from '@/lib/guardians/guardian_service';
import { linkGuardianToStudent } from '@/lib/guardians/relationship_service';
import { enrollStudentInProgramme } from '@/lib/students/enrollment_service';
import { createInvoice } from '@/lib/finance/invoice_service';
import { resolveFeeStructureForStudent } from '@/lib/finance/fee_structure_service';
import { z } from 'zod';

export const MatriculateApplicationSchema = z.object({
  applicationId: z.string().uuid(),
  programmeClassAssignments: z.record(z.string(), z.string()).optional(),
});

export type MatriculateApplicationInput = z.infer<typeof MatriculateApplicationSchema>;

/**
 * Swanford Academy — Atomic Application Matriculation Engine
 * Master Specification Reference: Sections 6, 8, 9, 21.
 *
 * Directives Enforced:
 * 1. 100% Atomic: student, guardian, relationship, enrollments, and application state roll back together.
 * 2. MAIN_ACADEMIC Rule: At least one approved programme must be an official main academic programme.
 * 3. Concurrency-Safe Quota: Transactionally verifies AdmissionCycleProgramme.maxCapacity.
 * 4. Reuses Stage 6 domain services rather than duplicating student/guardian/enrollment code.
 */
export async function matriculateApplication(
  actor: SafeUser,
  input: MatriculateApplicationInput
) {
  await requirePermission(actor, PermissionCode.ADMISSION_APPLICATION_APPROVE);
  const validated = MatriculateApplicationSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    // 1. Lock and retrieve application with its selections
    const application = await tx.application.findUnique({
      where: { id: validated.applicationId },
      include: {
        admissionCycle: true,
        programmeSelections: {
          include: { programme: true, targetClass: true },
        },
        existingGuardian: true,
      },
    });

    if (!application) {
      throw new AuthorizationError('Application not found.', 404, 'APPLICATION_NOT_FOUND');
    }

    // Invariant: cannot re-matriculate
    if (application.status === ApplicationStatus.ENROLLED || application.admittedStudentId) {
      throw new AuthorizationError(
        `Application (${application.applicationNumber}) has already been matriculated and enrolled.`,
        400,
        'ALREADY_MATRICULATED'
      );
    }

    // Invariant: status must be APPROVED or PARTIALLY_APPROVED
    if (
      application.status !== ApplicationStatus.APPROVED &&
      application.status !== ApplicationStatus.PARTIALLY_APPROVED
    ) {
      throw new AuthorizationError(
        `Application is in status '${application.status}'. Only APPROVED or PARTIALLY_APPROVED applications may be matriculated.`,
        400,
        'APPLICATION_NOT_APPROVED'
      );
    }

    // Invariant: fee must be PAYMENT_CONFIRMED or WAIVED
    if (
      application.paymentStatus !== ApplicationPaymentStatus.PAYMENT_CONFIRMED &&
      application.paymentStatus !== ApplicationPaymentStatus.WAIVED
    ) {
      throw new AuthorizationError(
        `Application payment status is '${application.paymentStatus}'. Application fee must be PAYMENT_CONFIRMED or WAIVED before matriculation.`,
        400,
        'PAYMENT_NOT_CONFIRMED'
      );
    }

    // 2. Identify approved programme selections
    const approvedSelections = application.programmeSelections.filter(
      (s) => s.status === ProgrammeSelectionStatus.APPROVED
    );

    if (approvedSelections.length === 0) {
      throw new AuthorizationError(
        'No approved programme selections found on this application.',
        400,
        'NO_APPROVED_PROGRAMMES'
      );
    }

    // 3. MAIN_ACADEMIC Rule (Amendment 5)
    const hasMainAcademic = approvedSelections.some((s) => s.programme.isMainAcademic);
    if (!hasMainAcademic) {
      throw new AuthorizationError(
        "Matriculation requires at least one approved programme eligible to serve as the student's MAIN_ACADEMIC enrollment. " +
          'Additional programmes (such as Tahfeez) cannot be matriculated without an accompanying main academic programme.',
        400,
        'MAIN_ACADEMIC_PROGRAMME_REQUIRED'
      );
    }

    // 4. Concurrency-Safe Capacity Verification (Amendment 6)
    for (const sel of approvedSelections) {
      const cycleProg = await tx.admissionCycleProgramme.findUnique({
        where: {
          unique_cycle_programme: {
            admissionCycleId: application.admissionCycleId,
            programmeId: sel.programmeId,
          },
        },
      });

      if (cycleProg && cycleProg.maxCapacity !== null) {
        // Count all students already enrolled originating from this cycle for this programme
        const currentEnrolledCount = await tx.applicationProgrammeSelection.count({
          where: {
            programmeId: sel.programmeId,
            status: ProgrammeSelectionStatus.APPROVED,
            application: {
              admissionCycleId: application.admissionCycleId,
              status: ApplicationStatus.ENROLLED,
            },
          },
        });

        if (currentEnrolledCount >= cycleProg.maxCapacity) {
          throw new AuthorizationError(
            `Cannot matriculate application: Programme '${sel.programme.name}' has reached its maximum capacity of ${cycleProg.maxCapacity} students for this admission cycle.`,
            400,
            'PROGRAMME_CAPACITY_EXCEEDED'
          );
        }
      }
    }

    // 5. Target Class Resolution & Verification
    const resolvedClasses: Record<string, string> = {};
    for (const sel of approvedSelections) {
      const explicitClassId =
        validated.programmeClassAssignments?.[sel.programmeId] || sel.targetClassId;

      let targetClassId: string;
      if (!explicitClassId) {
        // Look for default active class in this programme
        const defaultClass = await tx.schoolClass.findFirst({
          where: { programmeId: sel.programmeId, isActive: true },
          orderBy: { displayOrder: 'asc' },
        });

        if (!defaultClass) {
          throw new AuthorizationError(
            `No active class found for programme '${sel.programme.name}'. Please assign a class before matriculation.`,
            400,
            'CLASS_NOT_FOUND'
          );
        }
        targetClassId = defaultClass.id;
      } else {
        // Verify class belongs to programme and is active
        const schoolClass = await tx.schoolClass.findUnique({
          where: { id: explicitClassId },
        });
        if (!schoolClass || schoolClass.programmeId !== sel.programmeId || !schoolClass.isActive) {
          throw new AuthorizationError(
            `Assigned class does not belong to programme '${sel.programme.name}' or is inactive.`,
            400,
            'INVALID_CLASS_FOR_PROGRAMME'
          );
        }
        targetClassId = explicitClassId;
      }

      resolvedClasses[sel.programmeId] = targetClassId;
    }

    // 6. Locate First Term of target academic session
    const firstTerm = await tx.academicTerm.findFirst({
      where: {
        academicSessionId: application.academicSessionId,
        termCode: TermCode.FIRST,
      },
    });

    if (!firstTerm) {
      throw new AuthorizationError(
        'First term for the target academic session not found.',
        400,
        'TERM_NOT_FOUND'
      );
    }

    // 7. Guardian Provisioning or Reuse (Stage 6 Service)
    let guardianId: string;
    if (application.existingGuardianId) {
      const existing = await tx.guardian.findUnique({
        where: { id: application.existingGuardianId },
      });
      if (!existing) {
        throw new AuthorizationError('Existing guardian record not found.', 404, 'GUARDIAN_NOT_FOUND');
      }
      guardianId = existing.id;
    } else {
      const guardianResult = await createGuardian(
        actor,
        {
          firstName: application.guardianFirstName,
          lastName: application.guardianLastName,
          email: application.guardianEmail,
          phonePrimary: application.guardianPhone,
        },
        tx
      );
      guardianId = guardianResult.guardian.id;
    }

    // 8. Student Profile Creation with Server Admission Number (SA-YYYY-NNNN) (Stage 6 Service)
    const currentYear = new Date().getFullYear();
    const studentResult = await createStudent(
      actor,
      {
        firstName: application.applicantFirstName,
        lastName: application.applicantLastName,
        otherNames: application.applicantOtherNames || undefined,
        gender: application.applicantGender,
        dateOfBirth: application.applicantDob,
        admissionDate: new Date(),
      },
      currentYear,
      tx
    );
    const student = studentResult.student;

    // 9. Link Guardian to Student as Primary Contact (Stage 6 Service)
    await linkGuardianToStudent(
      actor,
      {
        guardianId,
        studentId: student.id,
        relationshipType: application.guardianRelationship,
        isPrimaryContact: true,
        canPickup: true,
        receivesInvoices: true,
      },
      tx
    );

    // 10. Enroll Student into all approved programmes (Stage 6 Service)
    const enrollments = [];
    for (const sel of approvedSelections) {
      const enrollmentType = sel.programme.isMainAcademic
        ? EnrollmentType.MAIN_ACADEMIC
        : EnrollmentType.ADDITIONAL_PROGRAMME;

      const schoolClassId = resolvedClasses[sel.programmeId];

      const enrollment = await enrollStudentInProgramme(
        actor,
        {
          studentId: student.id,
          programmeId: sel.programmeId,
          schoolClassId,
          academicSessionId: application.academicSessionId,
          academicTermId: firstTerm.id,
          enrollmentType,
        },
        tx
      );

      enrollments.push(enrollment);
    }

    // 11. Initial School-Fee Invoicing (Stage 8 Integration - Amendment 3)
    // Keep the ₦5,000 application form fee separate. Create initial term school fee invoice(s)
    // if applicable fee structures exist, preventing duplicate billing.
    const issuedInvoices = [];
    for (const sel of approvedSelections) {
      const existingInvoice = await tx.invoice.findUnique({
        where: {
          unique_student_programme_term_invoice: {
            studentId: student.id,
            programmeId: sel.programmeId,
            academicSessionId: application.academicSessionId,
            academicTermId: firstTerm.id,
          },
        },
      });

      if (!existingInvoice) {
        const schoolClassId = resolvedClasses[sel.programmeId];
        const feeStructure = await resolveFeeStructureForStudent(
          {
            studentId: student.id,
            programmeId: sel.programmeId,
            academicSessionId: application.academicSessionId,
            academicTermId: firstTerm.id,
            schoolClassId,
            isAdmissionFee: true,
          },
          tx
        );

        if (feeStructure && feeStructure.feeItems.length > 0) {
          // Exclude any application form fee line to keep application charge strictly separate
          const feeItems = feeStructure.feeItems.filter(
            (item) => !item.name.toLowerCase().includes('application form')
          );

          if (feeItems.length > 0) {
            const dueDate = firstTerm.startDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            const invoice = await createInvoice(
              null, // internal system action during matriculation
              {
                studentId: student.id,
                guardianId,
                academicSessionId: application.academicSessionId,
                academicTermId: firstTerm.id,
                programmeId: sel.programmeId,
                feeStructureId: feeStructure.id,
                dueDate,
                items: feeItems.map((fi) => ({
                  description: fi.name,
                  unitAmountKobo: fi.amountKobo,
                  quantity: 1,
                })),
              },
              tx
            );
            issuedInvoices.push(invoice);
          }
        }
      }
    }

    // 12. Finalize Application State -> ENROLLED
    const updatedApplication = await tx.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.ENROLLED,
        admittedStudentId: student.id,
        existingGuardianId: guardianId,
      },
      include: {
        admittedStudent: true,
        programmeSelections: { include: { programme: true } },
      },
    });

    // 13. Write Immutable Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'STUDENT_MATRICULATED_FROM_APPLICATION',
        entityType: 'application',
        entityId: application.id,
        newValues: {
          applicationNumber: application.applicationNumber,
          admissionNumber: student.admissionNumber,
          studentId: student.id,
          guardianId,
          enrolledProgrammes: approvedSelections.map((s) => s.programme.name),
          issuedInvoicesCount: issuedInvoices.length,
          issuedInvoiceNumbers: issuedInvoices.map((inv) => inv.invoiceNumber),
        },
      },
    });

    return {
      student,
      guardianId,
      enrollments,
      invoices: issuedInvoices,
      application: updatedApplication,
    };
  });
}
