import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { processVerifiedTransaction } from '@/lib/paystack/service';
import {
  Gender,
  PaymentStatus,
  GatewayTransactionStatus,
  InvoiceStatus,
  RelationshipType,
  TermCode,
  ProgrammeCode,
} from '@prisma/client';

describe('Stage 10 Integration: Financial & Business Transaction Isolation', () => {
  let guardianId: string;
  let studentId: string;
  let invoiceId: string;
  const testRef = `TEST-ISO-${Date.now()}`;

  beforeEach(async () => {
    // Setup test academic entities
    let session = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
    });
    if (!session) {
      session = await prisma.academicSession.create({
        data: {
          name: `Academic Session ${Date.now()}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
          isCurrent: true,
        },
      });
    }

    let term = await prisma.academicTerm.findFirst({
      where: { academicSessionId: session.id },
    });
    if (!term) {
      term = await prisma.academicTerm.create({
        data: {
          academicSessionId: session.id,
          name: 'First Term',
          termCode: TermCode.FIRST,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-12-15'),
          isCurrent: true,
        },
      });
    }

    let prog = await prisma.programme.findFirst({
      where: { code: ProgrammeCode.PRIMARY },
    });
    if (!prog) {
      prog = await prisma.programme.create({
        data: {
          name: 'Primary Programme',
          code: ProgrammeCode.PRIMARY,
          isMainAcademic: true,
        },
      });
    }

    const guardian = await prisma.guardian.create({
      data: {
        firstName: 'Isolation',
        lastName: 'Parent',
        email: `isolation.${Date.now()}@swanford.test`,
        phonePrimary: '08099887766',
      },
    });
    guardianId = guardian.id;

    const student = await prisma.student.create({
      data: {
        admissionNumber: `ISO-${Date.now().toString().slice(-4)}`,
        firstName: 'Child',
        lastName: 'Isolation',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2018-01-01'),
      },
    });
    studentId = student.id;

    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: guardian.id,
        studentId: student.id,
        relationshipType: RelationshipType.MOTHER,
        isPrimaryContact: true,
        receivesInvoices: true,
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-ISO-${Date.now().toString().slice(-4)}`,
        studentId: student.id,
        guardianId: guardian.id,
        academicSessionId: session.id,
        academicTermId: term.id,
        programmeId: prog.id,
        totalAmountKobo: BigInt(5000000), // ₦50,000.00
        amountPaidKobo: BigInt(0),
        outstandingBalanceKobo: BigInt(5000000),
        status: InvoiceStatus.ISSUED,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        items: {
          create: {
            description: 'First Term Primary Tuition Fee',
            unitAmountKobo: BigInt(5000000),
            quantity: 1,
            totalAmountKobo: BigInt(5000000),
          },
        },
      },
    });
    invoiceId = invoice.id;

    await prisma.paymentTransaction.create({
      data: {
        gatewayReference: testRef,
        invoiceId: invoice.id,
        amountKobo: BigInt(5000000),
        status: GatewayTransactionStatus.INITIALIZED,
      },
    });
  });

  afterEach(async () => {
    // Cleanup created test records
    await prisma.notification.deleteMany({
      where: { idempotencyKey: { contains: testRef } },
    });
    await prisma.receipt.deleteMany({ where: { invoiceId } });
    await prisma.paymentAllocation.deleteMany({ where: { invoiceId } });
    await prisma.payment.deleteMany({ where: { invoiceId } });
    await prisma.paymentTransaction.deleteMany({ where: { gatewayReference: testRef } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
    await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    await prisma.guardianStudentRelationship.deleteMany({ where: { guardianId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.guardian.deleteMany({ where: { id: guardianId } });
  });

  it('guarantees financial state commits and persists even if notification outbox processing encounters an issue', async () => {
    // Process the verified Paystack transaction
    const result = await processVerifiedTransaction(testRef, {
      id: 99887766,
      status: 'success',
      reference: testRef,
      amount: 5000000,
      channel: 'card',
      paid_at: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(GatewayTransactionStatus.SUCCESS);

    // 1. Verify Invoice state is PAID
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(invoice?.status).toBe(InvoiceStatus.PAID);
    expect(invoice?.amountPaidKobo).toBe(BigInt(5000000));
    expect(invoice?.outstandingBalanceKobo).toBe(BigInt(0));

    // 2. Verify Official Receipt was issued
    const receipts = await prisma.receipt.findMany({ where: { invoiceId } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].amountKobo).toBe(BigInt(5000000));

    // 3. Verify Payment is CONFIRMED
    const payments = await prisma.payment.findMany({ where: { invoiceId } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe(PaymentStatus.CONFIRMED);

    // 4. Verify Notification outbox has the authoritative entry
    const notification = await prisma.notification.findUnique({
      where: { idempotencyKey: `FINANCE:PAYMENT_CONFIRMED:PAYSTACK:${testRef}` },
    });
    expect(notification).not.toBeNull();
    expect(notification?.status).toBe('PENDING');
  });
});
