import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  Gender,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import { createInvoice } from '@/lib/finance/invoice_service';
import {
  recordManualPayment,
  reversePayment,
} from '@/lib/finance/payment_service';
import { SafeUser } from '@/lib/auth/service';
import { generateNextAdmissionNumber } from '@/lib/students/admission_number';

describe('Stage 8 — Integration: Reconciliation, Idempotency & Immutable Reversal', () => {
  let accountantUser: SafeUser;
  let academicSessionId: string;
  let academicTermId: string;
  let primaryProgId: string;
  let studentId: string;
  let guardianId: string;
  let invoiceId: string;

  beforeEach(async () => {
    // 1. Roles & Users
    const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ACCOUNTANT } });

    const createTestUser = async (email: string, roleId: string): Promise<SafeUser> => {
      const u = await prisma.user.create({
        data: {
          email,
          passwordHash: 'dummy',
          status: 'ACTIVE',
        },
      });
      await prisma.userRole.create({ data: { userId: u.id, roleId } });
      return {
        id: u.id,
        email: u.email,
        phoneNumber: null,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        createdAt: new Date(),
      };
    };

    accountantUser = await createTestUser(`acc-${Date.now()}-${Math.random()}@swanford.example.com`, accountantRole.id);

    // 2. Session & Term
    const session = await prisma.academicSession.create({
      data: {
        name: `Recon-Session-${Date.now()}`,
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
    academicTermId = term.id;

    // 3. Programme & Student
    const prog = await prisma.programme.findUniqueOrThrow({ where: { code: ProgrammeCode.PRIMARY } });
    primaryProgId = prog.id;

    const student = await prisma.student.create({
      data: {
        admissionNumber: await generateNextAdmissionNumber(2026, prisma),
        firstName: 'Farida',
        lastName: 'Ahmed',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2018-01-05'),
      },
    });
    studentId = student.id;

    const guardian = await prisma.guardian.create({
      data: {
        firstName: 'Ahmed',
        lastName: 'Gusau',
        email: `guardian-recon-${Date.now()}@example.com`,
        phonePrimary: '+2348035556677',
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

    const invoice = await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId,
      academicTermId,
      programmeId: primaryProgId,
      dueDate: new Date('2026-09-30'),
      items: [{ description: 'Term 1 Tuition', unitAmountKobo: 8000000 }],
    });
    invoiceId = invoice.id;
  });

  it('guarantees payment recording idempotency via idempotencyKey', async () => {
    const idempotencyKey = `idem-key-${Date.now()}`;

    // First attempt
    const res1 = await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 3000000,
      paymentMethod: PaymentMethod.POS,
      idempotencyKey,
      autoConfirm: true,
    });

    // Duplicate attempt with same idempotencyKey
    const res2 = await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 3000000,
      paymentMethod: PaymentMethod.POS,
      idempotencyKey,
      autoConfirm: true,
    });

    // Should return the exact same payment record
    expect(res1.payment.id).toBe(res2.payment.id);
    expect(res1.payment.paymentReference).toBe(res2.payment.paymentReference);

    // Invoice should only be credited once (₦30,000, not ₦60,000)
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.amountPaidKobo).toBe(BigInt(3000000));
    expect(invoice.outstandingBalanceKobo).toBe(BigInt(5000000));
  });

  it('rejects duplicate bank reference for manual bank transfers', async () => {
    const bankRef = `JAIZ/TRF/${Date.now()}`;

    await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 2000000,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      bankReference: bankRef,
    });

    // Submitting another payment with identical bank reference must be rejected
    await expect(
      recordManualPayment(accountantUser, {
        invoiceId,
        amountKobo: 2000000,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        bankReference: bankRef,
      })
    ).rejects.toThrow(/payment with bank reference .* has already been recorded/i);
  });

  it('ENFORCES AMENDMENT 2: Preserves immutable financial history during payment reversal', async () => {
    // 1. Record and confirm payment of ₦50,000
    const paymentResult = await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 5000000,
      paymentMethod: PaymentMethod.CASH,
      autoConfirm: true,
      notes: 'Initial cash payment',
    });

    const paymentId = paymentResult.payment.id;
    const receiptId = paymentResult.receipt!.id;

    // Verify initial invoice state
    let invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.amountPaidKobo).toBe(BigInt(5000000));
    expect(invoice.outstandingBalanceKobo).toBe(BigInt(3000000));
    expect(invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // 2. Perform payment reversal (e.g. bounce or accounting error)
    const reversedPayment = await reversePayment(
      accountantUser,
      paymentId,
      'Erroneously credited to wrong student invoice'
    );

    // Verify Payment row was NOT deleted: preserved with REVERSED status and audit stamps
    expect(reversedPayment.status).toBe(PaymentStatus.REVERSED);
    expect(reversedPayment.reversedAt).toBeDefined();
    expect(reversedPayment.reversalReason).toBe('Erroneously credited to wrong student invoice');
    expect(reversedPayment.reversedByUserId).toBe(accountantUser.id);

    // Verify Receipt was NOT deleted: preserved and marked isVoided = true
    const voidedReceipt = await prisma.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(voidedReceipt.isVoided).toBe(true);
    expect(voidedReceipt.voidedAt).toBeDefined();
    expect(voidedReceipt.voidReason).toBe('Erroneously credited to wrong student invoice');

    // Verify Allocations were NOT destructively deleted: preserved for historical ledger audit
    const allocations = await prisma.paymentAllocation.findMany({ where: { paymentId } });
    expect(allocations.length).toBeGreaterThanOrEqual(1);

    // Verify Invoice balance was authoritatively recalculated from remaining confirmed payments (now ₦0)
    invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.amountPaidKobo).toBe(BigInt(0));
    expect(invoice.outstandingBalanceKobo).toBe(BigInt(8000000));
    expect(invoice.status).toBe(InvoiceStatus.ISSUED);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'Payment',
        entityId: paymentId,
        action: 'PAYMENT_REVERSED',
      },
    });
    expect(audit).toBeDefined();
  });
});
