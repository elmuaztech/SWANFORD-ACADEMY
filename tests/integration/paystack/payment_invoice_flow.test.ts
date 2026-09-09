import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  Gender,
  GatewayProvider,
  GatewayTransactionStatus,
  InvoiceStatus,
  PaymentTargetType,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import { createInvoice } from '@/lib/finance/invoice_service';
import { createPaymentSession } from '@/lib/paystack/session';
import { generatePaystackReference } from '@/lib/paystack/reference';
import { processVerifiedTransaction } from '@/lib/paystack/service';
import { SafeUser } from '@/lib/auth/service';
import { generateNextAdmissionNumber } from '@/lib/students/admission_number';
import { AuthorizationError } from '@/lib/auth/authorization';

describe('Stage 9 — Integration: Invoice Payment Flow, Allocation & Overpayment Prevention', () => {
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
        name: `Inv-Pay-Session-${Date.now()}-${Math.random()}`,
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
        email: `inv-acc-${Date.now()}-${Math.random()}@swanford.example.com`,
        passwordHash: 'dummy',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: accountantRole.id } });
    accountantUser = {
      id: user.id,
      email: user.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 3. Programme, Student, Guardian
    const prog = await prisma.programme.findUniqueOrThrow({ where: { code: ProgrammeCode.PRIMARY } });
    primaryProgId = prog.id;

    const student = await prisma.student.create({
      data: {
        admissionNumber: await generateNextAdmissionNumber(2026, prisma),
        firstName: 'Zainab',
        lastName: 'Umar',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2018-04-10'),
      },
    });
    studentId = student.id;

    const guardian = await prisma.guardian.create({
      data: {
        firstName: 'Umar',
        lastName: 'Farouk',
        email: `umar.farouk-${Date.now()}@example.com`,
        phonePrimary: '+2348099887766',
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

    // 4. Create Invoice: ₦100,000 (10,000,000 Kobo)
    const invoice = await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      dueDate: new Date('2026-10-31'),
      items: [
        { description: 'First Term Tuition', unitAmountKobo: 8000000 },
        { description: 'School Uniform', unitAmountKobo: 2000000 },
      ],
    });
    invoiceId = invoice.id;
  });

  it('supports partial payment, updating invoice to PARTIALLY_PAID with atomic receipt', async () => {
    const partialKobo = BigInt(4000000); // ₦40,000
    await createPaymentSession({
      targetType: PaymentTargetType.INVOICE,
      invoiceId,
      payerEmail: 'umar.farouk@example.com',
      expectedAmountKobo: partialKobo,
    });

    const reference = generatePaystackReference(PaymentTargetType.INVOICE, invoiceId);
    await prisma.paymentTransaction.create({
      data: {
        gatewayReference: reference,
        gatewayProvider: GatewayProvider.PAYSTACK,
        status: GatewayTransactionStatus.PENDING,
        amountKobo: partialKobo,
        currency: 'NGN',
        invoiceId,
      },
    });

    const result = await processVerifiedTransaction(reference, {
      id: 55443322,
      reference,
      amount: Number(partialKobo),
      currency: 'NGN',
      status: 'success',
      paid_at: new Date().toISOString(),
      channel: 'card',
      customer: { email: 'umar.farouk@example.com' },
      fees: 6000,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(GatewayTransactionStatus.SUCCESS);
    expect(result.schoolPaymentId).toBeDefined();
    expect(result.receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);

    // Verify invoice balances
    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });

    expect(updatedInvoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(updatedInvoice.amountPaidKobo).toBe(partialKobo);
    expect(updatedInvoice.outstandingBalanceKobo).toBe(BigInt(6000000)); // ₦60,000 remaining
  });

  it('supports exact balance payment, transitioning invoice to PAID', async () => {
    const fullKobo = BigInt(10000000); // ₦100,000
    await createPaymentSession({
      targetType: PaymentTargetType.INVOICE,
      invoiceId,
      payerEmail: 'umar.farouk@example.com',
      expectedAmountKobo: fullKobo,
    });

    const reference = generatePaystackReference(PaymentTargetType.INVOICE, invoiceId);
    await prisma.paymentTransaction.create({
      data: {
        gatewayReference: reference,
        gatewayProvider: GatewayProvider.PAYSTACK,
        status: GatewayTransactionStatus.PENDING,
        amountKobo: fullKobo,
        currency: 'NGN',
        invoiceId,
      },
    });

    const result = await processVerifiedTransaction(reference, {
      id: 77665544,
      reference,
      amount: Number(fullKobo),
      currency: 'NGN',
      status: 'success',
      paid_at: new Date().toISOString(),
      channel: 'bank_transfer',
      customer: { email: 'umar.farouk@example.com' },
    });

    expect(result.success).toBe(true);

    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });

    expect(updatedInvoice.status).toBe(InvoiceStatus.PAID);
    expect(updatedInvoice.amountPaidKobo).toBe(fullKobo);
    expect(updatedInvoice.outstandingBalanceKobo).toBe(BigInt(0));
  });

  it('strictly rejects overpayment attempts beyond outstanding balance', async () => {
    const overpaymentKobo = BigInt(15000000); // ₦150,000 against ₦100,000 invoice
    const reference = generatePaystackReference(PaymentTargetType.INVOICE, invoiceId);

    await prisma.paymentTransaction.create({
      data: {
        gatewayReference: reference,
        gatewayProvider: GatewayProvider.PAYSTACK,
        status: GatewayTransactionStatus.PENDING,
        amountKobo: overpaymentKobo,
        currency: 'NGN',
        invoiceId,
      },
    });

    await expect(
      processVerifiedTransaction(reference, {
        id: 998811,
        reference,
        amount: Number(overpaymentKobo),
        currency: 'NGN',
        status: 'success',
      })
    ).rejects.toThrow(AuthorizationError);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.status).toBe(InvoiceStatus.ISSUED);
    expect(invoice.amountPaidKobo).toBe(BigInt(0));
  });
});
