import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  AdmissionCycleStatus,
  ApplicationPaymentStatus,
  ApplicationStatus,
  Gender,
  GatewayProvider,
  GatewayTransactionStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTargetType,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import {
  createDraftApplication,
  submitApplication,
} from '@/lib/admissions/application_service';
import { createAdmissionCycle } from '@/lib/admissions/cycle_service';
import { createPaymentSession } from '@/lib/paystack/session';
import { generatePaymentReference } from '@/lib/paystack/reference';
import { processVerifiedTransaction } from '@/lib/paystack/service';
import { ingestWebhookEvent, WebhookVerificationError } from '@/lib/paystack/webhook';
import { validateEnv, getEnv } from '@/lib/env';
import { SafeUser } from '@/lib/auth/service';
import { reversePayment } from '@/lib/finance/payment_service';

describe('Payment Gateway Security, Webhook Verification & Failure Recovery Suite', () => {
  let adminUser: SafeUser;
  let academicSessionId: string;
  let termId: string;
  let cycleId: string;
  let primaryProgId: string;
  const env = getEnv();
  const secretKey = env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY;

  function signPayload(body: string, key = secretKey): string {
    return crypto
      .createHmac('sha512', key)
      .update(body)
      .digest('hex');
  }

  beforeEach(async () => {
    // 1. Session & Term
    const session = await prisma.academicSession.create({
      data: {
        name: `Sec-Session-${Date.now()}-${Math.random()}`,
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

    // 2. Admin User
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `sec-admin-${Date.now()}-${Math.random()}@example.com`,
        passwordHash: 'dummy',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });
    adminUser = {
      id: user.id,
      email: user.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgId = primaryProg.id;

    const cycle = await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-SEC-${Date.now()}`,
      name: 'Security Test Cycle',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: AdmissionCycleStatus.OPEN,
    });
    cycleId = cycle.id;
  });

  // ---------------------------------------------------------------------------
  // 1. ENVIRONMENT ISOLATION & TEST MODE SAFEGUARDS
  // ---------------------------------------------------------------------------
  describe('1. Test vs Live Environment Safeguards', () => {
    it('strictly forbids live Paystack secret keys in development/test environments', () => {
      expect(() => {
        validateEnv({
          ...process.env,
          NODE_ENV: 'test',
          PAYSTACK_SECRET_KEY: ['sk', 'live', 'dummy_safeguard_sample'].join('_'),
          PAYSTACK_PUBLIC_KEY: ['pk', 'live', 'dummy_safeguard_sample'].join('_'),
        });
      }).toThrow(/Live Paystack secret key.*strictly prohibited/i);
    });

    it('strictly forbids live Paystack public keys in development/test environments', () => {
      expect(() => {
        validateEnv({
          ...process.env,
          NODE_ENV: 'development',
          PAYSTACK_SECRET_KEY: ['sk', 'test', 'dummy_safeguard_sample'].join('_'),
          PAYSTACK_PUBLIC_KEY: ['pk', 'live', 'dummy_safeguard_sample'].join('_'),
        });
      }).toThrow(/Live Paystack public key.*strictly prohibited/i);
    });

    it('rejects mismatched key pairs (e.g. live secret with test public key)', () => {
      expect(() => {
        validateEnv({
          ...process.env,
          NODE_ENV: 'production',
          PAYSTACK_SECRET_KEY: ['sk', 'live', 'dummy_safeguard_sample'].join('_'),
          PAYSTACK_PUBLIC_KEY: ['pk', 'test', 'dummy_safeguard_sample'].join('_'),
        });
      }).toThrow(/Mismatched Paystack keys/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. COMMON PAYMENT FAILURE & RECOVERY SCENARIOS
  // ---------------------------------------------------------------------------
  describe('2. Payment Failure & Recovery Invariants', () => {
    it('Scenario 1: preserves application as DRAFT with UNPAID status if user closes browser during form filling', async () => {
      const draft = await createDraftApplication({
        admissionCycleId: cycleId,
        applicantFirstName: 'Zainab',
        applicantLastName: 'Usman',
        applicantGender: Gender.FEMALE,
        applicantDob: new Date('2019-05-10'),
        guardianFirstName: 'Usman',
        guardianLastName: 'Ali',
        guardianEmail: `usman.ali-${Date.now()}@example.com`,
        guardianPhone: '+2348022233344',
        guardianRelationship: RelationshipType.FATHER,
        programmeSelections: [{ programmeId: primaryProgId }],
      });

      expect(draft.status).toBe(ApplicationStatus.DRAFT);
      expect(draft.paymentStatus).toBe(ApplicationPaymentStatus.UNPAID);
      expect(draft.paymentReference).toBeNull();

      // Zero payment transactions created for draft
      const txs = await prisma.paymentTransaction.findMany({ where: { applicationId: draft.id } });
      expect(txs.length).toBe(0);
    });

    it('Scenario 2: user closes browser after initiating checkout — transaction remains INITIALIZED and recoverable', async () => {
      const draft = await createDraftApplication({
        admissionCycleId: cycleId,
        applicantFirstName: 'Ibrahim',
        applicantLastName: 'Musa',
        applicantGender: Gender.MALE,
        applicantDob: new Date('2018-07-15'),
        guardianFirstName: 'Musa',
        guardianLastName: 'Suleiman',
        guardianEmail: `musa.suleiman-${Date.now()}@example.com`,
        guardianPhone: '+2348099988877',
        guardianRelationship: RelationshipType.FATHER,
        programmeSelections: [{ programmeId: primaryProgId }],
      });
      const submitted = await submitApplication(draft.id);

      const ref = generatePaymentReference('APP', submitted.applicationNumber);
      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: ref,
          gatewayProvider: GatewayProvider.PAYSTACK,
          applicationId: submitted.id,
          amountKobo: submitted.totalAmountKobo,
          currency: 'NGN',
          status: GatewayTransactionStatus.INITIALIZED,
        },
      });

      // Transaction is stored safely in INITIALIZED state
      const tx = await prisma.paymentTransaction.findUniqueOrThrow({
        where: { gatewayReference: ref },
      });
      expect(tx.status).toBe(GatewayTransactionStatus.INITIALIZED);
      expect(tx.applicationId).toBe(submitted.id);
    });

    it('Scenario 3 & 4: recovers and confirms payment when internet drops after authorization or success redirect fails', async () => {
      const draft = await createDraftApplication({
        admissionCycleId: cycleId,
        applicantFirstName: 'Maryam',
        applicantLastName: 'Garba',
        applicantGender: Gender.FEMALE,
        applicantDob: new Date('2019-11-20'),
        guardianFirstName: 'Garba',
        guardianLastName: 'Ahmed',
        guardianEmail: `garba.ahmed-${Date.now()}@example.com`,
        guardianPhone: '+2348077766655',
        guardianRelationship: RelationshipType.FATHER,
        programmeSelections: [{ programmeId: primaryProgId }],
      });
      const submitted = await submitApplication(draft.id);

      const ref = generatePaymentReference('APP', submitted.applicationNumber);
      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: ref,
          gatewayProvider: GatewayProvider.PAYSTACK,
          applicationId: submitted.id,
          amountKobo: submitted.totalAmountKobo,
          currency: 'NGN',
          status: GatewayTransactionStatus.INITIALIZED,
        },
      });

      // Webhook arrives asynchronously while browser is offline
      const webhookPayload = JSON.stringify({
        event: 'charge.success',
        id: Math.floor(Math.random() * 1000000),
        data: {
          id: 99881122,
          reference: ref,
          amount: Number(submitted.totalAmountKobo),
          currency: 'NGN',
          status: 'success',
          paid_at: new Date().toISOString(),
          customer: { email: submitted.guardianEmail },
        },
      });

      const signature = signPayload(webhookPayload);
      const ingestResult = await ingestWebhookEvent(webhookPayload, signature);
      expect(ingestResult.received).toBe(true);

      // Process the verified webhook event
      const processResult = await processVerifiedTransaction(ref, {
        id: 99881122,
        reference: ref,
        amount: Number(submitted.totalAmountKobo),
        currency: 'NGN',
        status: 'success',
        paid_at: new Date().toISOString(),
        customer: { email: submitted.guardianEmail },
      });

      expect(processResult.success).toBe(true);
      expect(processResult.status).toBe(GatewayTransactionStatus.SUCCESS);

      // Verify application state is confirmed in database
      const confirmedApp = await prisma.application.findUniqueOrThrow({
        where: { id: submitted.id },
      });
      expect(confirmedApp.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_CONFIRMED);
      expect(confirmedApp.status).toBe(ApplicationStatus.UNDER_REVIEW);
    });

    it('Scenario 5: handles delayed or ongoing gateway confirmation gracefully without marking success prematurely', async () => {
      const draft = await createDraftApplication({
        admissionCycleId: cycleId,
        applicantFirstName: 'Kabir',
        applicantLastName: 'Balarabe',
        applicantGender: Gender.MALE,
        applicantDob: new Date('2020-01-10'),
        guardianFirstName: 'Balarabe',
        guardianLastName: 'Kabir',
        guardianEmail: `balarabe-${Date.now()}@example.com`,
        guardianPhone: '+2348011122233',
        guardianRelationship: RelationshipType.FATHER,
        programmeSelections: [{ programmeId: primaryProgId }],
      });
      const submitted = await submitApplication(draft.id);

      const ref = generatePaymentReference('APP', submitted.applicationNumber);
      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: ref,
          gatewayProvider: GatewayProvider.PAYSTACK,
          applicationId: submitted.id,
          amountKobo: submitted.totalAmountKobo,
          currency: 'NGN',
          status: GatewayTransactionStatus.INITIALIZED,
        },
      });

      // Gateway reports ongoing/processing
      const result = await processVerifiedTransaction(ref, {
        id: 554433,
        reference: ref,
        amount: Number(submitted.totalAmountKobo),
        currency: 'NGN',
        status: 'ongoing',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(GatewayTransactionStatus.ONGOING);

      // Application remains not confirmed
      const app = await prisma.application.findUniqueOrThrow({ where: { id: submitted.id } });
      expect(app.paymentStatus).not.toBe(ApplicationPaymentStatus.PAYMENT_CONFIRMED);
    });

    it('Scenario 8: rejects duplicate webhook replays idempotently', async () => {
      const ref = `SWN-DUP-${Date.now()}`;
      const payload = JSON.stringify({
        event: 'charge.success',
        id: 776655,
        data: {
          reference: ref,
          amount: 500000,
          currency: 'NGN',
          status: 'success',
        },
      });
      const signature = signPayload(payload);

      const first = await ingestWebhookEvent(payload, signature);
      expect(first.duplicate).toBe(false);

      const second = await ingestWebhookEvent(payload, signature);
      expect(second.duplicate).toBe(true);
      expect(second.eventId).toBe(first.eventId);
    });

    it('Scenario 9: prevents attacker from altering charge amount in the browser (server 3-way check)', async () => {
      const draft = await createDraftApplication({
        admissionCycleId: cycleId,
        applicantFirstName: 'Amina',
        applicantLastName: 'Lawal',
        applicantGender: Gender.FEMALE,
        applicantDob: new Date('2019-08-14'),
        guardianFirstName: 'Lawal',
        guardianLastName: 'Ali',
        guardianEmail: `lawal.ali-${Date.now()}@example.com`,
        guardianPhone: '+2348055544433',
        guardianRelationship: RelationshipType.FATHER,
        programmeSelections: [{ programmeId: primaryProgId }],
      });
      const submitted = await submitApplication(draft.id);

      const ref = generatePaymentReference('APP', submitted.applicationNumber);
      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: ref,
          gatewayProvider: GatewayProvider.PAYSTACK,
          applicationId: submitted.id,
          amountKobo: submitted.totalAmountKobo, // ₦5,000 (500000 kobo)
          currency: 'NGN',
          status: GatewayTransactionStatus.INITIALIZED,
        },
      });

      // Attacker managed to pay only ₦100 (10000 kobo) at gateway
      await expect(
        processVerifiedTransaction(ref, {
          id: 123999,
          reference: ref,
          amount: 10000, // Underpayment
          currency: 'NGN',
          status: 'success',
        })
      ).rejects.toThrow(/Amount mismatch/i);

      // Application must remain not confirmed
      const app = await prisma.application.findUniqueOrThrow({ where: { id: submitted.id } });
      expect(app.paymentStatus).not.toBe(ApplicationPaymentStatus.PAYMENT_CONFIRMED);
    });

    it('Scenario 11: rejects webhooks with invalid HMAC signatures', async () => {
      const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'SWN-FORGED' } });
      const badSignature = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      await expect(ingestWebhookEvent(payload, badSignature)).rejects.toThrow(WebhookVerificationError);
    });

    it('Scenario 13: strictly forbids paying an already-paid invoice', async () => {
      // Create student & guardian
      const student = await prisma.student.create({
        data: {
          admissionNumber: `SWN-STU-${Date.now()}`,
          firstName: 'Halima',
          lastName: 'Sani',
          gender: Gender.FEMALE,
          dateOfBirth: new Date('2018-04-12'),
        },
      });

      const guardian = await prisma.guardian.create({
        data: {
          firstName: 'Sani',
          lastName: 'Musa',
          email: `sani.musa-${Date.now()}@example.com`,
          phonePrimary: '+2348011223344',
        },
      });

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-TEST-${Date.now()}`,
          studentId: student.id,
          guardianId: guardian.id,
          academicSessionId,
          academicTermId: termId,
          programmeId: primaryProgId,
          totalAmountKobo: BigInt(11000000), // ₦110,000
          amountPaidKobo: BigInt(11000000),
          outstandingBalanceKobo: BigInt(0),
          status: InvoiceStatus.PAID,
          dueDate: new Date(),
        },
      });

      // Session creation for paid invoice must be rejected
      const session = await createPaymentSession({
        targetType: PaymentTargetType.INVOICE,
        invoiceId: invoice.id,
        payerEmail: guardian.email!,
        expectedAmountKobo: BigInt(11000000),
      });

      // Attempting to initialize invoice payment throws INVOICE_ALREADY_PAID
      const { initializeInvoicePayment } = await import('@/lib/paystack/service');
      await expect(
        initializeInvoicePayment({
          sessionToken: session.token,
          callbackUrl: 'http://localhost:3000/callback',
        })
      ).rejects.toThrow(/Invoice has already been paid in full|INVOICE_ALREADY_PAID/i);
    });

    it('Scenario 14: marks transaction FAILED when gateway fails and permits clean retry', async () => {
      const draft = await createDraftApplication({
        admissionCycleId: cycleId,
        applicantFirstName: 'Umar',
        applicantLastName: 'Faruk',
        applicantGender: Gender.MALE,
        applicantDob: new Date('2019-02-18'),
        guardianFirstName: 'Faruk',
        guardianLastName: 'Umar',
        guardianEmail: `faruk.umar-${Date.now()}@example.com`,
        guardianPhone: '+2348088877766',
        guardianRelationship: RelationshipType.FATHER,
        programmeSelections: [{ programmeId: primaryProgId }],
      });
      const submitted = await submitApplication(draft.id);

      const ref1 = generatePaymentReference('APP', submitted.applicationNumber);
      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: ref1,
          gatewayProvider: GatewayProvider.PAYSTACK,
          applicationId: submitted.id,
          amountKobo: submitted.totalAmountKobo,
          currency: 'NGN',
          status: GatewayTransactionStatus.INITIALIZED,
        },
      });

      // Gateway reports failure
      const failResult = await processVerifiedTransaction(ref1, {
        id: 110011,
        reference: ref1,
        amount: Number(submitted.totalAmountKobo),
        currency: 'NGN',
        status: 'failed',
      });

      expect(failResult.success).toBe(false);
      expect(failResult.status).toBe(GatewayTransactionStatus.FAILED);

      const tx1 = await prisma.paymentTransaction.findUniqueOrThrow({
        where: { gatewayReference: ref1 },
      });
      expect(tx1.status).toBe(GatewayTransactionStatus.FAILED);

      // User retries with a new payment reference
      const ref2 = generatePaymentReference('APP', `${submitted.applicationNumber}-2`);
      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: ref2,
          gatewayProvider: GatewayProvider.PAYSTACK,
          applicationId: submitted.id,
          amountKobo: submitted.totalAmountKobo,
          currency: 'NGN',
          status: GatewayTransactionStatus.INITIALIZED,
        },
      });

      // Second attempt succeeds
      const successResult = await processVerifiedTransaction(ref2, {
        id: 110022,
        reference: ref2,
        amount: Number(submitted.totalAmountKobo),
        currency: 'NGN',
        status: 'success',
      });

      expect(successResult.success).toBe(true);
      expect(successResult.status).toBe(GatewayTransactionStatus.SUCCESS);

      // Verify application confirmed
      const finalApp = await prisma.application.findUniqueOrThrow({ where: { id: submitted.id } });
      expect(finalApp.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_CONFIRMED);
    });

    it('Scenario 15: adjusts invoice balance and marks payment REVERSED on refund/reversal', async () => {
      const student = await prisma.student.create({
        data: {
          admissionNumber: `SWN-REV-${Date.now()}`,
          firstName: 'Aisha',
          lastName: 'Bello',
          gender: Gender.FEMALE,
          dateOfBirth: new Date('2018-09-09'),
        },
      });

      const guardian = await prisma.guardian.create({
        data: {
          firstName: 'Bello',
          lastName: 'Aisha',
          email: `bello.aisha-${Date.now()}@example.com`,
          phonePrimary: '+2348033221100',
        },
      });

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-REV-${Date.now()}`,
          studentId: student.id,
          guardianId: guardian.id,
          academicSessionId,
          academicTermId: termId,
          programmeId: primaryProgId,
          totalAmountKobo: BigInt(11000000), // ₦110,000
          amountPaidKobo: BigInt(11000000),
          outstandingBalanceKobo: BigInt(0),
          status: InvoiceStatus.PAID,
          dueDate: new Date(),
        },
      });

      // Create confirmed payment
      const payment = await prisma.payment.create({
        data: {
          paymentReference: `PAY-REV-${Date.now()}`,
          invoiceId: invoice.id,
          studentId: student.id,
          payerGuardianId: guardian.id,
          amountKobo: BigInt(11000000),
          paymentMethod: PaymentMethod.PAYSTACK,
          status: PaymentStatus.CONFIRMED,
        },
      });

      await prisma.receipt.create({
        data: {
          receiptNumber: `REC-REV-${Date.now()}`,
          paymentId: payment.id,
          invoiceId: invoice.id,
          issuedToName: 'Bello Aisha',
          amountKobo: BigInt(11000000),
        },
      });

      // Execute reversal
      const reversed = await reversePayment(
        adminUser,
        payment.id,
        'Authorized gateway chargeback refund'
      );

      expect(reversed.status).toBe(PaymentStatus.REVERSED);

      // Verify invoice outstanding balance is restored to ₦110,000
      const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(updatedInvoice.status).toBe(InvoiceStatus.ISSUED);
      expect(updatedInvoice.outstandingBalanceKobo).toBe(BigInt(11000000));
      expect(updatedInvoice.amountPaidKobo).toBe(BigInt(0));
    });
  });
});
