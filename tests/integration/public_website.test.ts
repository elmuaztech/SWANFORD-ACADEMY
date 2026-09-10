import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as getPublicFees } from '@/app/api/public/fees/route';
import { GET as getAdmissionOptions } from '@/app/api/public/admission-options/route';
import { POST as submitApplication } from '@/app/api/admissions/apply/route';
import { POST as checkAdmissionStatus } from '@/app/api/admissions/status/route';
import { POST as initPaymentSession } from '@/app/api/payments/session/route';
import { NextRequest } from 'next/server';
import { Gender, RelationshipType } from '@prisma/client';
import { checkRateLimit } from '@/lib/security/rate_limiter';

describe('Integration Tests: Work Package D — Public Website & Admissions Experience', () => {
  let openCycleId: string;
  let primaryProgId: string;
  let tahfeezProgId: string;

  beforeAll(async () => {
    // 1. Ensure active admission cycle exists
    const cycle = await prisma.admissionCycle.findFirst({
      where: { status: 'OPEN' },
    });
    if (!cycle) throw new Error('No open admission cycle found in test environment.');
    openCycleId = cycle.id;

    // 2. Fetch programmes
    const progs = await prisma.programme.findMany({
      where: { isActive: true },
    });
    const primary = progs.find((p) => p.code === 'PRIMARY') || progs[0];
    const tahfeez = progs.find((p) => p.code === 'TAHFEEZ') || progs[1] || progs[0];

    primaryProgId = primary.id;
    tahfeezProgId = tahfeez.id;
  });

  describe('1. Public Dynamic Fee Schedule & Options', () => {
    it('retrieves active session fee structures and dynamic application form fee without authentication', async () => {
      const response = await getPublicFees();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('formFeeKobo');
      expect(data).toHaveProperty('bankDetails');
      expect(data.bankDetails.bankName).toBe('Jaiz Bank');
      expect(data.bankDetails.accountNumber).toBe('0012031162');
      expect(Array.isArray(data.feeStructures)).toBe(true);
    });

    it('retrieves open admission cycles and active programmes for the public wizard', async () => {
      const response = await getAdmissionOptions();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data.cycles)).toBe(true);
      expect(data.cycles.length).toBeGreaterThan(0);
      expect(Array.isArray(data.programmes)).toBe(true);
      expect(data.programmes.length).toBeGreaterThan(0);
      expect(data).toHaveProperty('formFeeKobo');
    });
  });

  describe('2. Public Multi-Programme Admission Application Flow', () => {
    it('successfully submits a valid multi-programme application (Primary + Tahfeez)', async () => {
      const uniqueSuffix = Date.now();
      const payload = {
        admissionCycleId: openCycleId,
        applicantFirstName: 'Zainab',
        applicantLastName: `Bello-${uniqueSuffix}`,
        applicantOtherNames: 'Maryam',
        applicantGender: Gender.FEMALE,
        applicantDob: '2020-04-15',
        profilePhotoId: null,

        guardianFirstName: 'Alhaji Bello',
        guardianLastName: `Danbatta-${uniqueSuffix}`,
        guardianEmail: `guardian.${uniqueSuffix}@swanford.test`,
        guardianPhone: `0803${Math.floor(1000000 + Math.random() * 9000000)}`,
        guardianRelationship: RelationshipType.FATHER,

        programmeSelections: [
          { programmeId: primaryProgId },
          { programmeId: tahfeezProgId },
        ],
      };

      const req = new NextRequest('http://localhost:3000/api/admissions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await submitApplication(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.applicationNumber).toMatch(/^APP-\d{4}-\d{4,5}$/);
      expect(data.applicationId).toBeDefined();

      // Verify DB record has both programme selections
      const appRecord = await prisma.application.findUnique({
        where: { id: data.applicationId },
        include: { programmeSelections: true },
      });
      expect(appRecord).toBeDefined();
      expect(appRecord?.programmeSelections.length).toBe(2);
    });

    it('rejects application with missing mandatory fields', async () => {
      const payload = {
        admissionCycleId: openCycleId,
        applicantFirstName: '', // missing
        applicantLastName: 'Test',
      };

      const req = new NextRequest('http://localhost:3000/api/admissions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await submitApplication(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('3. Public Status Tracker Security & Dual Verification', () => {
    it('verifies application status when both Application Number and Guardian Email match', async () => {
      // 1. Create a test application
      const uniqueSuffix = Date.now();
      const guardianEmail = `status.test.${uniqueSuffix}@swanford.test`;
      const guardianPhone = `0803${Math.floor(1000000 + Math.random() * 9000000)}`;

      const payload = {
        admissionCycleId: openCycleId,
        applicantFirstName: 'Mustapha',
        applicantLastName: `Aliyu-${uniqueSuffix}`,
        applicantGender: Gender.MALE,
        applicantDob: '2019-08-10',

        guardianFirstName: 'Aliyu',
        guardianLastName: `Mustapha-${uniqueSuffix}`,
        guardianEmail,
        guardianPhone,
        guardianRelationship: RelationshipType.FATHER,

        programmeSelections: [{ programmeId: primaryProgId }],
      };

      const submitReq = new NextRequest('http://localhost:3000/api/admissions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const submitRes = await submitApplication(submitReq);
      const submitData = await submitRes.json();
      const appNumber = submitData.applicationNumber;

      // 2. Query status using email
      const statusReq = new NextRequest('http://localhost:3000/api/admissions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationNumber: appNumber,
          contactVerification: guardianEmail,
        }),
      });

      const statusRes = await checkAdmissionStatus(statusReq);
      expect(statusRes.status).toBe(200);

      const statusData = await statusRes.json();
      expect(statusData.success).toBe(true);
      expect(statusData.applicationNumber).toBe(appNumber);
      expect(statusData.applicantName).toBe('Mustapha');
      expect(statusData.statusLabel).toBe('Draft Application');
      expect(statusData.paymentStatusLabel).toBe('Payment Pending');

      // Security check: no private guardian contact details or internal IDs leaked
      expect(statusData.id).toBeUndefined();
      expect(statusData.guardianEmail).toBeUndefined();
      expect(statusData.guardianPhone).toBeUndefined();
    });

    it('verifies application status when Application Number and Guardian Phone match', async () => {
      const uniqueSuffix = Date.now();
      const guardianEmail = `phone.test.${uniqueSuffix}@swanford.test`;
      const guardianPhone = `0804${Math.floor(1000000 + Math.random() * 9000000)}`;

      const payload = {
        admissionCycleId: openCycleId,
        applicantFirstName: 'Amina',
        applicantLastName: `Suleiman-${uniqueSuffix}`,
        applicantGender: Gender.FEMALE,
        applicantDob: '2021-02-20',

        guardianFirstName: 'Suleiman',
        guardianLastName: `Ahmad-${uniqueSuffix}`,
        guardianEmail,
        guardianPhone,
        guardianRelationship: RelationshipType.FATHER,

        programmeSelections: [{ programmeId: primaryProgId }],
      };

      const submitReq = new NextRequest('http://localhost:3000/api/admissions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const submitRes = await submitApplication(submitReq);
      const submitData = await submitRes.json();
      const appNumber = submitData.applicationNumber;

      // Query status using phone number
      const statusReq = new NextRequest('http://localhost:3000/api/admissions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationNumber: appNumber,
          contactVerification: guardianPhone,
        }),
      });

      const statusRes = await checkAdmissionStatus(statusReq);
      expect(statusRes.status).toBe(200);
      const statusData = await statusRes.json();
      expect(statusData.applicationNumber).toBe(appNumber);
    });

    it('returns generic 404 on contact mismatch to prevent applicant enumeration', async () => {
      const statusReq = new NextRequest('http://localhost:3000/api/admissions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationNumber: 'SWN/2026/99999',
          contactVerification: 'wrong.email@unknown.com',
        }),
      });

      const statusRes = await checkAdmissionStatus(statusReq);
      expect(statusRes.status).toBe(404);

      const data = await statusRes.json();
      expect(data.error).toBe('No matching application found with the provided details');
    });
  });

  describe('4. Security & Rate Limiting Controls', () => {
    it('enforces rate limiter correctly when request limit is reached', () => {
      const testKey = `test_limit_${Date.now()}`;
      // Max 3 requests
      const r1 = checkRateLimit(testKey, { windowMs: 10000, maxRequests: 3 });
      expect(r1.allowed).toBe(true);

      const r2 = checkRateLimit(testKey, { windowMs: 10000, maxRequests: 3 });
      expect(r2.allowed).toBe(true);

      const r3 = checkRateLimit(testKey, { windowMs: 10000, maxRequests: 3 });
      expect(r3.allowed).toBe(true);

      // 4th request must be rejected
      const r4 = checkRateLimit(testKey, { windowMs: 10000, maxRequests: 3 });
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
    });

    it('initializes secure payment session for application fee without trusting client amounts', async () => {
      const uniqueSuffix = Date.now();
      const payload = {
        admissionCycleId: openCycleId,
        applicantFirstName: 'Farouk',
        applicantLastName: `Umar-${uniqueSuffix}`,
        applicantGender: Gender.MALE,
        applicantDob: '2020-09-01',

        guardianFirstName: 'Umar',
        guardianLastName: `Farouk-${uniqueSuffix}`,
        guardianEmail: `pay.test.${uniqueSuffix}@swanford.test`,
        guardianPhone: `0805${Math.floor(1000000 + Math.random() * 9000000)}`,
        guardianRelationship: RelationshipType.FATHER,

        programmeSelections: [{ programmeId: primaryProgId }],
      };

      const submitReq = new NextRequest('http://localhost:3000/api/admissions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const submitRes = await submitApplication(submitReq);
      const submitData = await submitRes.json();
      const appId = submitData.applicationId;

      // Initialize payment session
      const sessionReq = new NextRequest('http://localhost:3000/api/payments/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'APPLICATION_FEE',
          targetId: appId,
        }),
      });

      const sessionRes = await initPaymentSession(sessionReq);
      expect(sessionRes.status).toBe(200);

      const sessionData = await sessionRes.json();
      expect(sessionData.token).toBeDefined();
      expect(sessionData.expectedAmountKobo).toBe('500000'); // Authoritative ₦5,000 form fee from SystemConfig
      expect(sessionData.payerEmail).toBe(`pay.test.${uniqueSuffix}@swanford.test`);
    });
  });
});
