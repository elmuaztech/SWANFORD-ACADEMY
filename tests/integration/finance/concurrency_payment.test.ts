import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  Gender,
  PaymentMethod,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import { createInvoice } from '@/lib/finance/invoice_service';
import { recordManualPayment } from '@/lib/finance/payment_service';
import { SafeUser } from '@/lib/auth/service';
import { generateNextAdmissionNumber } from '@/lib/students/admission_number';

describe('Stage 8 — Integration: Concurrency-Safe Payment Allocation (Amendment 4)', () => {
  let accountantUser: SafeUser;
  let academicSessionId: string;
  let termId: string;
  let primaryProgId: string;
  let studentId: string;
  let guardianId: string;
  let invoiceId: string;

  beforeEach(async () => {
    // 1. Session & Term
    const session = await prisma.academicSession.create({
      data: {
        name: `Conc-Session-${Date.now()}`,
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
        email: `conc-acc-${Date.now()}@swanford.example.com`,
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

    // 3. Programme & Student
    const prog = await prisma.programme.findUniqueOrThrow({ where: { code: ProgrammeCode.PRIMARY } });
    primaryProgId = prog.id;

    const student = await prisma.student.create({
      data: {
        admissionNumber: await generateNextAdmissionNumber(2026, prisma),
        firstName: 'Kabir',
        lastName: 'Dikko',
        gender: Gender.MALE,
        dateOfBirth: new Date('2017-11-22'),
      },
    });
    studentId = student.id;

    const guardian = await prisma.guardian.create({
      data: {
        firstName: 'Dikko',
        lastName: 'Radda',
        email: `guardian-conc-${Date.now()}@example.com`,
        phonePrimary: '+2348037778899',
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

    // 4. Issue invoice with ₦50,000 total balance (5,000,000 Kobo)
    const invoice = await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      dueDate: new Date('2026-09-30'),
      items: [{ description: 'Tuition Fee', unitAmountKobo: 5000000 }],
    });
    invoiceId = invoice.id;
  });

  it('ENFORCES AMENDMENT 4: Parallel simultaneous payment attempts never over-allocate an invoice balance', async () => {
    // Two simultaneous requests attempt to pay ₦40,000 each (4,000,000 Kobo) against a ₦50,000 balance.
    // Combined total would be ₦80,000 (overpaying by ₦30,000).
    // Concurrency locking (SELECT FOR UPDATE) guarantees exactly one succeeds and the other is rejected!
    const [p1, p2] = await Promise.allSettled([
      recordManualPayment(accountantUser, {
        invoiceId,
        amountKobo: 4000000,
        paymentMethod: PaymentMethod.POS,
        autoConfirm: true,
      }),
      recordManualPayment(accountantUser, {
        invoiceId,
        amountKobo: 4000000,
        paymentMethod: PaymentMethod.CASH,
        autoConfirm: true,
      }),
    ]);

    const fulfilled = [p1, p2].filter((r) => r.status === 'fulfilled');
    const rejected = [p1, p2].filter((r) => r.status === 'rejected');

    // Exactly one transaction must succeed, and exactly one must fail
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Verify rejection reason is overpayment / exceeded balance
    if (rejected[0].status === 'rejected') {
      expect((rejected[0].reason as Error).message).toMatch(/exceeds outstanding balance/i);
    }

    // Verify final authoritative invoice state in database: total paid must be strictly ₦40,000
    const finalInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(finalInvoice.amountPaidKobo).toBe(BigInt(4000000));
    expect(finalInvoice.outstandingBalanceKobo).toBe(BigInt(1000000)); // Exactly ₦10,000 remaining
    expect(finalInvoice.amountPaidKobo <= finalInvoice.totalAmountKobo).toBe(true);

    // Verify total recorded confirmed payment rows equals 1
    const payments = await prisma.payment.findMany({
      where: { invoiceId, status: 'CONFIRMED' },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0].amountKobo).toBe(BigInt(4000000));
  });
});
