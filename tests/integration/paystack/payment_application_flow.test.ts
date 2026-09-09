import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  AdmissionCycleStatus,
  ApplicationPaymentStatus,
  ApplicationStatus,
  Gender,
  GatewayProvider,
  GatewayTransactionStatus,
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
import { generatePaystackReference } from '@/lib/paystack/reference';
import { processVerifiedTransaction } from '@/lib/paystack/service';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError } from '@/lib/auth/authorization';

describe('Stage 9 — Integration: Application Fee Payment Flow & Snapshot Validation', () => {
  let adminUser: SafeUser;
  let academicSessionId: string;
  let cycleId: string;
  let primaryProgId: string;
  let applicationId: string;
  let expectedAmountKobo: bigint;

  beforeEach(async () => {
    // 1. Session & Term
    const session = await prisma.academicSession.create({
      data: {
        name: `App-Pay-Session-${Date.now()}-${Math.random()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    await prisma.academicTerm.create({
      data: {
        academicSessionId: session.id,
        termCode: TermCode.FIRST,
        name: 'First Term',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });

    // 2. Admin User
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `pay-admin-${Date.now()}-${Math.random()}@example.com`,
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

    // 3. Admission Cycle
    const cycle = await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-PAY-${Date.now()}`,
      name: 'Paystack Application Cycle',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: AdmissionCycleStatus.OPEN,
    });
    cycleId = cycle.id;

    // 4. Draft & Submitted Application (Snapshotting ApplicationChargeItems)
    const draft = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Fatima',
      applicantLastName: 'Bello',
      applicantGender: Gender.FEMALE,
      applicantDob: new Date('2019-03-20'),
      guardianFirstName: 'Amina',
      guardianLastName: 'Bello',
      guardianEmail: `amina.bello-${Date.now()}@example.com`,
      guardianPhone: '+2348033344455',
      guardianRelationship: RelationshipType.MOTHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    const submitted = await submitApplication(draft.id);
    applicationId = submitted.id;
    expectedAmountKobo = submitted.totalAmountKobo;
  });

  it('successfully confirms application fee when 3-way amounts match', async () => {
    // 1. Create secure payment session
    await createPaymentSession({
      targetType: PaymentTargetType.APPLICATION_FEE,
      applicationId,
      payerEmail: 'amina.bello@example.com',
      expectedAmountKobo,
    });

    // 2. Generate reference and persist pending transaction
    const reference = generatePaystackReference(PaymentTargetType.APPLICATION_FEE, applicationId);
    await prisma.paymentTransaction.create({
      data: {
        gatewayReference: reference,
        gatewayProvider: GatewayProvider.PAYSTACK,
        status: GatewayTransactionStatus.PENDING,
        amountKobo: expectedAmountKobo,
        currency: 'NGN',
        applicationId,
      },
    });

    // 3. Process verified transaction from Paystack
    const result = await processVerifiedTransaction(reference, {
      id: 11223344,
      reference,
      amount: Number(expectedAmountKobo),
      currency: 'NGN',
      status: 'success',
      paid_at: new Date().toISOString(),
      channel: 'card',
      customer: { email: 'amina.bello@example.com' },
      fees: 7500, // ₦75 Paystack fee
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(GatewayTransactionStatus.SUCCESS);
    expect(result.alreadyProcessed).toBeUndefined();

    // Verify application state advanced
    const updatedApp = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
    });

    expect(updatedApp.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_CONFIRMED);
    expect(updatedApp.status).toBe(ApplicationStatus.UNDER_REVIEW);
    expect(updatedApp.amountPaidKobo).toBe(expectedAmountKobo);
    expect(updatedApp.paymentReference).toBe(reference);

    // Verify idempotency on second identical call
    const repeatResult = await processVerifiedTransaction(reference, {
      id: 11223344,
      reference,
      amount: Number(expectedAmountKobo),
      currency: 'NGN',
      status: 'success',
    });

    expect(repeatResult.success).toBe(true);
    expect(repeatResult.alreadyProcessed).toBe(true);
  });

  it('rejects payment if gateway amount does not match immutable fee snapshot', async () => {
    const reference = generatePaystackReference(PaymentTargetType.APPLICATION_FEE, applicationId);
    await prisma.paymentTransaction.create({
      data: {
        gatewayReference: reference,
        gatewayProvider: GatewayProvider.PAYSTACK,
        status: GatewayTransactionStatus.PENDING,
        amountKobo: expectedAmountKobo,
        currency: 'NGN',
        applicationId,
      },
    });

    // Gateway reports payment of ₦1,000 instead of authoritative snapshot ₦5,000
    await expect(
      processVerifiedTransaction(reference, {
        id: 999999,
        reference,
        amount: 100000, // ₦1,000
        currency: 'NGN',
        status: 'success',
      })
    ).rejects.toThrow(AuthorizationError);

    const appAfter = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(appAfter.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_PENDING);
  });

  it('records abandoned status and keeps application unpaid without throwing', async () => {
    const reference = generatePaystackReference(PaymentTargetType.APPLICATION_FEE, applicationId);
    await prisma.paymentTransaction.create({
      data: {
        gatewayReference: reference,
        gatewayProvider: GatewayProvider.PAYSTACK,
        status: GatewayTransactionStatus.PENDING,
        amountKobo: expectedAmountKobo,
        currency: 'NGN',
        applicationId,
      },
    });

    const result = await processVerifiedTransaction(reference, {
      id: 888888,
      reference,
      amount: Number(expectedAmountKobo),
      currency: 'NGN',
      status: 'abandoned',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(GatewayTransactionStatus.ABANDONED);

    const tx = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { gatewayReference: reference },
    });
    expect(tx.status).toBe(GatewayTransactionStatus.ABANDONED);

    const app = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(app.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_PENDING);
  });
});
