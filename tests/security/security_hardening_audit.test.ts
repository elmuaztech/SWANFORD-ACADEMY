import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loginUser, SafeUser } from '@/lib/auth/service';
import { hashPassword } from '@/lib/auth/password';
import { generateSecureNumericOtp, hashToken } from '@/lib/auth/tokens';
import {
  createPaymentSession,
  verifyPaymentSessionToken,
  markPaymentSessionUsed,
} from '@/lib/paystack/session';
import { processVerifiedTransaction } from '@/lib/paystack/service';
import { generatePaystackReference } from '@/lib/paystack/reference';
import { verifyCronAuthorization } from '@/lib/security/cron_auth';
import { checkRateLimit, clearRateLimit } from '@/lib/security/rate_limiter';
import {
  RoleCode,
  UserStatus,
  PaymentTargetType,
  GatewayProvider,
  GatewayTransactionStatus,
  InvoiceStatus,
  ReconciliationStatus,
  Gender,
  RelationshipType,
  ProgrammeCode,
  StudentStatus,
  TermCode,
} from '@prisma/client';
import { createInvoice } from '@/lib/finance/invoice_service';

describe('Security Hardening & Production Audit Regression Test Suite', { timeout: 25000 }, () => {
  const testParentEmail = 'security.audit.parent@example.com';
  const testPassword = 'Password123!';
  let guardianId: string;
  let studentId: string;
  let invoiceId: string;

  beforeAll(async () => {
    // Clean up any stale audit users
    await prisma.user.deleteMany({ where: { email: testParentEmail } });

    // Create session, term, programme
    let session = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
    if (!session) {
      session = await prisma.academicSession.create({
        data: {
          name: '2026/2027 Session',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
          isCurrent: true,
        },
      });
    }

    let term = await prisma.academicTerm.findFirst({ where: { isCurrent: true } });
    if (!term) {
      term = await prisma.academicTerm.create({
        data: {
          academicSessionId: session.id,
          termCode: TermCode.FIRST,
          name: 'First Term',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-12-15'),
          isCurrent: true,
        },
      });
    }

    let programme = await prisma.programme.findFirst({ where: { code: ProgrammeCode.PRIMARY } });
    if (!programme) {
      programme = await prisma.programme.create({
        data: {
          code: ProgrammeCode.PRIMARY,
          name: 'Primary School',
          isActive: true,
        },
      });
    }

    // Create verified parent user
    const passwordHash = await hashPassword(testPassword);
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.PARENT } });

    const user = await prisma.user.create({
      data: {
        email: testParentEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: {
            roleId: parentRole.id,
          },
        },
        guardianProfile: {
          create: {
            firstName: 'Audit',
            lastName: 'Parent',
            email: testParentEmail,
            phonePrimary: '+2348099887766',
          },
        },
      },
      include: {
        guardianProfile: true,
        userRoles: { include: { role: true } },
      },
    });

    await loginUser({ email: testParentEmail, password: testPassword });
    guardianId = user.guardianProfile!.id;

    // Create student
    const student = await prisma.student.create({
      data: {
        admissionNumber: `SEC-AUD-${Date.now().toString().slice(-5)}`,
        firstName: 'Audit',
        lastName: 'Child',
        gender: Gender.MALE,
        dateOfBirth: new Date('2018-05-15'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    studentId = student.id;

    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId,
        studentId,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
        receivesInvoices: true,
      },
    });

    // Create authorized accountant user for invoice issuance
    const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ACCOUNTANT } });
    const accUser = await prisma.user.create({
      data: {
        email: `audit-acc-${Date.now()}@swanford.example.com`,
        passwordHash: 'dummy',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({ data: { userId: accUser.id, roleId: accountantRole.id } });
    const accountantUser: SafeUser = {
      id: accUser.id,
      email: accUser.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      roles: [RoleCode.ACCOUNTANT],
    };

    // Create an invoice of ₦50,000 (5,000,000 Kobo)
    const invoice = await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId: session.id,
      academicTermId: term.id,
      programmeId: programme.id,
      dueDate: new Date('2026-12-31'),
      items: [
        { description: 'Tuition Fee', unitAmountKobo: 5000000 },
      ],
    });
    invoiceId = invoice.id;
  });

  afterAll(async () => {
    if (invoiceId) {
      await prisma.paymentAllocation.deleteMany({ where: { invoiceId } }).catch(() => {});
      await prisma.receipt.deleteMany({ where: { invoiceId } }).catch(() => {});
      await prisma.paymentTransaction.deleteMany({ where: { invoiceId } }).catch(() => {});
      await prisma.payment.deleteMany({ where: { invoiceId } }).catch(() => {});
      await prisma.invoiceItem.deleteMany({ where: { invoiceId } }).catch(() => {});
      await prisma.invoice.deleteMany({ where: { id: invoiceId } }).catch(() => {});
    }
    if (studentId) {
      await prisma.guardianStudentRelationship.deleteMany({ where: { studentId } }).catch(() => {});
      await prisma.studentProgrammeEnrollment.deleteMany({ where: { studentId } }).catch(() => {});
      await prisma.student.deleteMany({ where: { id: studentId } }).catch(() => {});
    }
    if (guardianId) {
      await prisma.guardian.deleteMany({ where: { id: guardianId } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: testParentEmail } }).catch(() => {});
  });

  // ---------------------------------------------------------------------------
  // 1. PUBLIC ARCHIVE & DOWNLOAD ROUTE CONTAINMENT
  // ---------------------------------------------------------------------------
  it('strictly ensures public source-code ZIP archives and download routes are removed', () => {
    const publicDir = path.join(process.cwd(), 'public');
    const zip1 = path.join(publicDir, 'SWANFORD_ACADEMY.zip');
    const zip2 = path.join(publicDir, 'SWANFORD_ACADEMY_SOURCE.zip');
    const downloadRoute = path.join(process.cwd(), 'src', 'app', 'api', 'download', 'route.ts');
    const downloadPage = path.join(process.cwd(), 'src', 'app', 'download', 'page.tsx');

    expect(fs.existsSync(zip1)).toBe(false);
    expect(fs.existsSync(zip2)).toBe(false);
    expect(fs.existsSync(downloadRoute)).toBe(false);
    expect(fs.existsSync(downloadPage)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 2. PAYMENT SESSION REPLAY PROTECTION
  // ---------------------------------------------------------------------------
  it('enforces single-use payment session tokens and rejects replay attacks', async () => {
    const session = await createPaymentSession({
      targetType: PaymentTargetType.INVOICE,
      invoiceId,
      payerEmail: testParentEmail,
      expectedAmountKobo: BigInt(5000000),
    });

    // 1. Initial verification succeeds
    const verified = await verifyPaymentSessionToken({
      token: session.token,
      targetType: PaymentTargetType.INVOICE,
      targetId: invoiceId,
    });
    expect(verified.targetType).toBe(PaymentTargetType.INVOICE);
    expect(verified.invoiceId).toBe(invoiceId);

    // 2. Atomically consume token
    await markPaymentSessionUsed(session.session.id);

    // 3. Second verification (replay) MUST be rejected
    await expect(
      verifyPaymentSessionToken({
        token: session.token,
        targetType: PaymentTargetType.INVOICE,
        targetId: invoiceId,
      })
    ).rejects.toThrow(/already been used/i);
  });

  // ---------------------------------------------------------------------------
  // 3. OVERPAYMENT FINANCIAL RECONCILIATION
  // ---------------------------------------------------------------------------
  it('safely handles overpayment: settles invoice to PAID and flags discrepancy without losing funds', async () => {
    const overpaymentKobo = BigInt(7500000); // ₦75,000 on ₦50,000 invoice
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

    const result = await processVerifiedTransaction(reference, {
      id: 99882233,
      reference,
      amount: Number(overpaymentKobo),
      currency: 'NGN',
      status: 'success',
      paid_at: new Date().toISOString(),
      channel: 'card',
      customer: { email: testParentEmail },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(GatewayTransactionStatus.SUCCESS);

    // Invoice is fully settled to PAID, balance is 0
    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(updatedInvoice.status).toBe(InvoiceStatus.PAID);
    expect(updatedInvoice.outstandingBalanceKobo).toBe(BigInt(0));

    // Payment transaction is flagged with DISCREPANCY for manual reconciliation
    const txRecord = await prisma.paymentTransaction.findUnique({
      where: { gatewayReference: reference },
    });
    expect(txRecord?.reconciliationStatus).toBe(ReconciliationStatus.DISCREPANCY);

    // Payment record preserves the full amount and records the overpayment
    const payment = await prisma.payment.findFirst({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
    expect(payment?.amountKobo).toBe(overpaymentKobo);
    expect(payment?.notes).toContain('[OVERPAYMENT:');
  });

  // ---------------------------------------------------------------------------
  // 4. TIMING ATTACK NORMALIZATION ON LOGIN
  // ---------------------------------------------------------------------------
  it('normalizes login response timing for non-existent emails via dummy bcrypt verification', async () => {
    // Non-existent email must execute bcrypt dummy hash and throw generic error
    const startTime = Date.now();
    await expect(
      loginUser({ email: 'nonexistent.user.audit@example.com', password: 'AnyPassword123' })
    ).rejects.toThrow('Invalid email or password');
    const elapsedMs = Date.now() - startTime;

    // A bcrypt 12-round check typically takes ~100ms to 400ms on modern CPUs.
    // If it were returning instantly (0-10ms), it would indicate timing leakage.
    expect(elapsedMs).toBeGreaterThan(50);
  });

  // ---------------------------------------------------------------------------
  // 5. LOGIN BRUTE-FORCE RATE LIMITING
  // ---------------------------------------------------------------------------
  it('enforces IP rate limiting on login attempts', () => {
    const testIp = '198.51.100.42';
    clearRateLimit(`login_ip:${testIp}`);

    // Fill up allowance (20 requests)
    for (let i = 0; i < 20; i++) {
      const res = checkRateLimit(`login_ip:${testIp}`, { windowMs: 60000, maxRequests: 20 });
      expect(res.allowed).toBe(true);
    }

    // 21st attempt must be blocked
    const blocked = checkRateLimit(`login_ip:${testIp}`, { windowMs: 60000, maxRequests: 20 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    clearRateLimit(`login_ip:${testIp}`);
  });

  // ---------------------------------------------------------------------------
  // 6. 6-DIGIT OTP SECURITY POLICY
  // ---------------------------------------------------------------------------
  it('enforces 6-digit cryptographic OTP generation with leading-zero preservation', () => {
    for (let i = 0; i < 20; i++) {
      const { rawOtp, otpHash } = generateSecureNumericOtp();
      expect(rawOtp).toMatch(/^\d{6}$/);
      expect(rawOtp.length).toBe(6);
      expect(otpHash).toHaveLength(64); // SHA-256 hash
      expect(hashToken(rawOtp)).toBe(otpHash);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. CRON TIMING-SAFE AUTHENTICATION & FAIL-CLOSED PROTECTION
  // ---------------------------------------------------------------------------
  it('enforces timing-safe, fail-closed authorization on cron endpoints', () => {
    const originalSecret = process.env.CRON_SECRET;

    try {
      // 1. Fails closed if CRON_SECRET is missing
      delete process.env.CRON_SECRET;
      const reqNoSecret = new NextRequest('http://localhost/api/cron/paystack-worker', {
        headers: { authorization: 'Bearer test' },
      });
      const authNoSecret = verifyCronAuthorization(reqNoSecret);
      expect(authNoSecret.authorized).toBe(false);
      expect(authNoSecret.response?.status).toBe(500);

      // 2. Fails closed if CRON_SECRET is too short (< 16 chars)
      process.env.CRON_SECRET = 'short';
      const reqShort = new NextRequest('http://localhost/api/cron/paystack-worker', {
        headers: { authorization: 'Bearer short' },
      });
      const authShort = verifyCronAuthorization(reqShort);
      expect(authShort.authorized).toBe(false);
      expect(authShort.response?.status).toBe(500);

      // 3. Rejects missing Authorization header
      const validSecret = 'test_cron_secret_high_entropy_12345';
      process.env.CRON_SECRET = validSecret;

      const reqNoHeader = new NextRequest('http://localhost/api/cron/paystack-worker');
      const authNoHeader = verifyCronAuthorization(reqNoHeader);
      expect(authNoHeader.authorized).toBe(false);
      expect(authNoHeader.response?.status).toBe(401);

      // 4. Rejects mismatched token using timingSafeEqual
      const reqWrongToken = new NextRequest('http://localhost/api/cron/paystack-worker', {
        headers: { authorization: 'Bearer wrong_cron_secret_67890' },
      });
      const authWrongToken = verifyCronAuthorization(reqWrongToken);
      expect(authWrongToken.authorized).toBe(false);
      expect(authWrongToken.response?.status).toBe(401);

      // 5. Accepts correct Bearer token
      const reqValid = new NextRequest('http://localhost/api/cron/paystack-worker', {
        headers: { authorization: `Bearer ${validSecret}` },
      });
      const authValid = verifyCronAuthorization(reqValid);
      expect(authValid.authorized).toBe(true);
    } finally {
      process.env.CRON_SECRET = originalSecret;
    }
  });
});
