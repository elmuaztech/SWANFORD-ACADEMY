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
  confirmOrReconcilePayment,
} from '@/lib/finance/payment_service';
import { SafeUser } from '@/lib/auth/service';
import { generateNextAdmissionNumber } from '@/lib/students/admission_number';

describe('Stage 8 — Integration: Payments, Allocations & Receipts', () => {
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
        name: `Pay-Session-${Date.now()}`,
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
        email: `pay-accountant-${Date.now()}@swanford.example.com`,
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

    // 3. Programme
    const prog = await prisma.programme.findUniqueOrThrow({ where: { code: ProgrammeCode.PRIMARY } });
    primaryProgId = prog.id;

    // 4. Student & Guardian
    const student = await prisma.student.create({
      data: {
        admissionNumber: `PAR-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        firstName: 'Aliyu',
        lastName: 'Sanusi',
        gender: Gender.MALE,
        dateOfBirth: new Date('2017-08-10'),
      },
    });
    studentId = student.id;

    const guardian = await prisma.guardian.create({
      data: {
        firstName: 'Sanusi',
        lastName: 'Lamido',
        email: `guardian-${Date.now()}@example.com`,
        phonePrimary: '+2348039998877',
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

    // 5. Issue Invoice for ₦100,000 (10,000,000 Kobo) with 2 line items
    const invoice = await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      dueDate: new Date('2026-09-30'),
      items: [
        { description: 'Tuition Fee', unitAmountKobo: 7000000, quantity: 1 },
        { description: 'Books & Materials', unitAmountKobo: 3000000, quantity: 1 },
      ],
    });
    invoiceId = invoice.id;
  });

  it('records cash payment as CONFIRMED and immediately issues official receipt', async () => {
    const result = await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 4000000, // ₦40,000 partial payment
      paymentMethod: PaymentMethod.CASH,
      notes: 'Cash received at bursary',
    });

    expect(result.payment.status).toBe(PaymentStatus.CONFIRMED);
    expect(result.payment.paymentReference).toMatch(/^PAY-\d{4}-\d{5}$/);

    // Verify official receipt was generated (Amendment 1)
    expect(result.receipt).toBeDefined();
    expect(result.receipt?.receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);
    expect(result.receipt?.amountKobo).toBe(BigInt(4000000));
    expect(result.receipt?.issuedToName).toBe('Sanusi Lamido');

    // Verify Invoice balance updated
    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(updatedInvoice.amountPaidKobo).toBe(BigInt(4000000));
    expect(updatedInvoice.outstandingBalanceKobo).toBe(BigInt(6000000));
    expect(updatedInvoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Verify PaymentAllocations exist
    const allocations = await prisma.paymentAllocation.findMany({
      where: { paymentId: result.payment.id },
    });
    expect(allocations.length).toBeGreaterThanOrEqual(1);
    const sumAlloc = allocations.reduce((acc, a) => acc + a.amountKobo, BigInt(0));
    expect(sumAlloc).toBe(BigInt(4000000));
  });

  it('ENFORCES AMENDMENT 1: Bank transfer defaults to PENDING_VERIFICATION and does NOT issue receipt until confirmed', async () => {
    // 1. Record pending bank transfer
    const dynamicBankRef = `TXN-BANK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const result = await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 5000000, // ₦50,000
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      bankReference: dynamicBankRef,
      bankName: 'First Bank',
      notes: 'Unverified mobile transfer alert',
    });

    expect(result.payment.status).toBe(PaymentStatus.PENDING_VERIFICATION);
    // Crucial Invariant: No receipt issued yet for unverified deposit!
    expect(result.receipt).toBeNull();

    // Invoice amountPaidKobo must not be credited until confirmed!
    const invoiceBeforeConfirm = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoiceBeforeConfirm.amountPaidKobo).toBe(BigInt(0));
    expect(invoiceBeforeConfirm.outstandingBalanceKobo).toBe(BigInt(10000000));

    // 2. Reconcile and confirm payment against bank statement
    const reconciled = await confirmOrReconcilePayment(accountantUser, {
      paymentId: result.payment.id,
      bankReference: dynamicBankRef,
      bankName: 'First Bank of Nigeria',
      notes: 'Verified on bank portal statement',
    });

    expect(reconciled.payment.status).toBe(PaymentStatus.CONFIRMED);
    expect(reconciled.payment.reconciledAt).toBeDefined();

    // Receipt issued upon confirmation!
    expect(reconciled.receipt).toBeDefined();
    expect(reconciled.receipt.receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);
    expect(reconciled.receipt.amountKobo).toBe(BigInt(5000000));

    // Invoice now reflects credited payment
    const invoiceAfterConfirm = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoiceAfterConfirm.amountPaidKobo).toBe(BigInt(5000000));
    expect(invoiceAfterConfirm.outstandingBalanceKobo).toBe(BigInt(5000000));
    expect(invoiceAfterConfirm.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it('completes full payment across multiple installments and marks invoice PAID', async () => {
    // Installment 1: ₦60,000
    await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 6000000,
      paymentMethod: PaymentMethod.POS,
      autoConfirm: true,
    });

    // Installment 2: ₦40,000 (completes full ₦100,000)
    const secondPayment = await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 4000000,
      paymentMethod: PaymentMethod.CASH,
      autoConfirm: true,
    });

    expect(secondPayment.receipt).toBeDefined();

    const finalInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(finalInvoice.amountPaidKobo).toBe(BigInt(10000000));
    expect(finalInvoice.outstandingBalanceKobo).toBe(BigInt(0));
    expect(finalInvoice.status).toBe(InvoiceStatus.PAID);
  });

  it('strictly rejects overpayment beyond outstanding balance', async () => {
    // Attempting to pay ₦100,001 on a ₦100,000 invoice
    await expect(
      recordManualPayment(accountantUser, {
        invoiceId,
        amountKobo: 10000100,
        paymentMethod: PaymentMethod.CASH,
      })
    ).rejects.toThrow(/Payment amount exceeds outstanding balance/i);

    // Make partial payment of ₦80,000
    await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 8000000,
      paymentMethod: PaymentMethod.CASH,
      autoConfirm: true,
    });

    // Outstanding balance is now ₦20,000. Attempting to pay ₦25,000 must fail
    await expect(
      recordManualPayment(accountantUser, {
        invoiceId,
        amountKobo: 2500000,
        paymentMethod: PaymentMethod.CASH,
      })
    ).rejects.toThrow(/Payment amount exceeds outstanding balance/i);
  });
});
