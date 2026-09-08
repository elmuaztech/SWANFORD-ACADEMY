import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  EnrollmentStatus,
  EnrollmentType,
  Gender,
  InvoiceStatus,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import {
  createInvoice,
  generateBatchTermInvoices,
  cancelInvoice,
} from '@/lib/finance/invoice_service';
import { createFeeStructure } from '@/lib/finance/fee_structure_service';
import { SafeUser } from '@/lib/auth/service';
import { generateNextAdmissionNumber } from '@/lib/students/admission_number';

describe('Stage 8 — Integration: Invoice Lifecycle & Frozen Snapshots', () => {
  let accountantUser: SafeUser;
  let academicSessionId: string;
  let termId: string;
  let primaryProgId: string;
  let primaryClassId: string;
  let studentId: string;
  let guardianId: string;

  beforeEach(async () => {
    // 1. Session & Term
    const session = await prisma.academicSession.create({
      data: {
        name: `Inv-Session-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    const term = await prisma.academicTerm.create({
      data: {
        academicSessionId: session.id,
        termCode: TermCode.FIRST,
        name: 'First Term',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });
    termId = term.id;

    // 2. Accountant
    const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ACCOUNTANT } });
    const user = await prisma.user.create({
      data: {
        email: `inv-accountant-${Date.now()}@swanford.example.com`,
        passwordHash: 'dummy',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: accountantRole.id },
    });

    accountantUser = {
      id: user.id,
      email: user.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 3. Programme & Class
    const prog = await prisma.programme.findUniqueOrThrow({ where: { code: ProgrammeCode.PRIMARY } });
    primaryProgId = prog.id;

    const pClass = await prisma.schoolClass.create({
      data: {
        programmeId: prog.id,
        code: `INV-P1-${Date.now()}`,
        name: 'Primary 1 Test',
      },
    });
    primaryClassId = pClass.id;

    // 4. Student & Guardian
    const student = await prisma.student.create({
      data: {
        admissionNumber: await generateNextAdmissionNumber(2026, prisma),
        firstName: 'InvoiceStudent',
        lastName: 'Umar',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2018-03-20'),
      },
    });
    studentId = student.id;

    const guardian = await prisma.guardian.create({
      data: {
        firstName: 'Umar',
        lastName: 'Faruk',
        email: `guardian-${Date.now()}@example.com`,
        phonePrimary: '+2348031112233',
      },
    });
    guardianId = guardian.id;

    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: guardian.id,
        studentId: student.id,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
        receivesInvoices: true,
      },
    });
  });

  it('issues an invoice with frozen item snapshots and sequential INV-YYYY-NNNNN number', async () => {
    const invoice = await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      dueDate: new Date('2026-09-30'),
      items: [
        { description: 'Term 1 Tuition', unitAmountKobo: 6000000, quantity: 1 },
        { description: 'School Uniform Set', unitAmountKobo: 1500000, quantity: 2 },
      ],
    });

    expect(invoice.id).toBeDefined();
    // Verify invoice number format INV-YYYY-NNNNN (5 digits)
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(invoice.status).toBe(InvoiceStatus.ISSUED);

    // Verify authoritative recalculation: 6,000,000 + (1,500,000 * 2) = 9,000,000
    expect(invoice.totalAmountKobo).toBe(BigInt(9000000));
    expect(invoice.amountPaidKobo).toBe(BigInt(0));
    expect(invoice.outstandingBalanceKobo).toBe(BigInt(9000000));

    // Verify snapshot items
    expect(invoice.items).toHaveLength(2);
    expect(invoice.items[0].description).toBe('Term 1 Tuition');
    expect(invoice.items[0].totalAmountKobo).toBe(BigInt(6000000));
    expect(invoice.items[1].description).toBe('School Uniform Set');
    expect(invoice.items[1].totalAmountKobo).toBe(BigInt(3000000));
  });

  it('strictly rejects issuing a duplicate invoice for the same student, programme, and term', async () => {
    await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      dueDate: new Date('2026-09-30'),
      items: [{ description: 'Tuition', unitAmountKobo: 5000000, quantity: 1 }],
    });

    await expect(
      createInvoice(accountantUser, {
        studentId,
        guardianId,
        academicSessionId,
        academicTermId: termId,
        programmeId: primaryProgId,
        dueDate: new Date('2026-09-30'),
        items: [{ description: 'Second Attempt Tuition', unitAmountKobo: 5000000, quantity: 1 }],
      })
    ).rejects.toThrow(/Invoice .* has already been issued/i);
  });

  it('runs batch invoice generation idempotently skipping already-invoiced students', async () => {
    // 1. Setup active fee structure for Primary
    await createFeeStructure(accountantUser, {
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      schoolClassId: primaryClassId,
      name: 'Primary 1 Batch Fee',
      feeItems: [{ name: 'Tuition', amountKobo: 5500000 }],
    });

    // 2. Enroll student in class
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId,
        programmeId: primaryProgId,
        schoolClassId: primaryClassId,
        academicSessionId,
        academicTermId: termId,
        enrollmentType: EnrollmentType.MAIN_ACADEMIC,
        enrollmentStatus: EnrollmentStatus.ACTIVE,
      },
    });

    // 3. First batch run: creates 1 invoice
    const run1 = await generateBatchTermInvoices(accountantUser, {
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      schoolClassId: primaryClassId,
      dueDate: new Date('2026-09-30'),
    });

    expect(run1.createdCount).toBe(1);
    expect(run1.skippedExistingCount).toBe(0);

    // 4. Second batch run: should idempotently skip existing invoice
    const run2 = await generateBatchTermInvoices(accountantUser, {
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      schoolClassId: primaryClassId,
      dueDate: new Date('2026-09-30'),
    });

    expect(run2.createdCount).toBe(0);
    expect(run2.skippedExistingCount).toBe(1);
  });

  it('cancels an unpaid invoice and records cancellation audit log', async () => {
    const invoice = await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      dueDate: new Date('2026-09-30'),
      items: [{ description: 'Erroneous Billing', unitAmountKobo: 5000000 }],
    });

    const cancelled = await cancelInvoice(
      accountantUser,
      invoice.id,
      'Issued with incorrect fee structure'
    );

    expect(cancelled.status).toBe(InvoiceStatus.CANCELLED);
    expect(cancelled.outstandingBalanceKobo).toBe(BigInt(0));

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'Invoice',
        entityId: invoice.id,
        action: 'INVOICE_CANCELLED',
      },
    });
    expect(audit).toBeDefined();
  });
});
