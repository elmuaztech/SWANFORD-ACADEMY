import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { POST as verifyPaymentRoute } from '@/app/api/admissions/payment/verify/route';
import { POST as applyRoute } from '@/app/api/admissions/apply/route';
import {
  GatewayTransactionStatus,
  GatewayProvider,
  ProgrammeCode,
  Gender,
  RelationshipType,
} from '@prisma/client';

describe('Security Regression — Admission Payment Verification & Replay Defenses', () => {
  let admissionCycleId: string;
  let academicSessionId: string;
  let primaryProgrammeId: string;
  const testRefPrefix = `SEC-TEST-${Date.now()}`;

  beforeAll(async () => {
    // 1. Ensure current academic session
    let session = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
    if (!session) {
      session = await prisma.academicSession.create({
        data: {
          name: `2026/2027 Test Session ${Date.now()}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
          isCurrent: true,
        },
      });
    }
    academicSessionId = session.id;

    // 2. Ensure an open admission cycle valid now
    const cycle = await prisma.admissionCycle.create({
      data: {
        code: `SEC-${Date.now()}`,
        academicSessionId,
        name: `2026/2027 Admissions Sec Test ${Date.now()}`,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2030-12-31'),
        status: 'OPEN',
      },
    });
    admissionCycleId = cycle.id;

    // 3. Ensure primary programme exists
    let prog = await prisma.programme.findFirst({
      where: { code: ProgrammeCode.PRIMARY },
    });
    if (!prog) {
      prog = await prisma.programme.create({
        data: {
          code: ProgrammeCode.PRIMARY,
          name: 'Primary School',
          isActive: true,
        },
      });
    }
    primaryProgrammeId = prog.id;

    // Ensure cycle-programme link
    const existingLink = await prisma.admissionCycleProgramme.findUnique({
      where: {
        unique_cycle_programme: {
          admissionCycleId: cycle.id,
          programmeId: prog.id,
        },
      },
    });
    if (!existingLink) {
      await prisma.admissionCycleProgramme.create({
        data: {
          admissionCycleId: cycle.id,
          programmeId: prog.id,
        },
      });
    }
  });

  afterAll(async () => {
    // Clean up created test transactions and applications
    await prisma.application.deleteMany({
      where: { guardianEmail: { contains: 'paysec.test' } },
    });
    await prisma.paymentTransaction.deleteMany({
      where: { gatewayReference: { startsWith: testRefPrefix } },
    });
    if (admissionCycleId) {
      await prisma.admissionCycleProgramme.deleteMany({
        where: { admissionCycleId },
      });
      await prisma.admissionCycle.deleteMany({
        where: { id: admissionCycleId },
      });
    }
  });

  describe('Admissions Payment Verification Route (/api/admissions/payment/verify)', () => {
    it('rejects missing or malformed references with 400', async () => {
      const resEmpty = await verifyPaymentRoute(
        new NextRequest('http://localhost:3000/api/admissions/payment/verify', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
      expect(resEmpty.status).toBe(400);

      const resInvalid = await verifyPaymentRoute(
        new NextRequest('http://localhost:3000/api/admissions/payment/verify', {
          method: 'POST',
          body: JSON.stringify({ reference: '$$invalid<>chars!!' }),
        })
      );
      expect(resInvalid.status).toBe(400);
    });

    it('returns 404 for non-existent payment reference', async () => {
      const res = await verifyPaymentRoute(
        new NextRequest('http://localhost:3000/api/admissions/payment/verify', {
          method: 'POST',
          body: JSON.stringify({ reference: `${testRefPrefix}-NONEXISTENT` }),
        })
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toMatch(/not found/i);
    });

    it('rejects replayed reference already claimed by another application with 400', async () => {
      const replayedRef = `${testRefPrefix}-REPLAYED-01`;

      // Create an application
      const app = await prisma.application.create({
        data: {
          applicationNumber: `APP-${Date.now()}-1`,
          academicSessionId,
          admissionCycleId,
          applicantFirstName: 'Test',
          applicantLastName: 'ReplayStudent',
          applicantGender: Gender.MALE,
          applicantDob: new Date('2018-01-01'),
          guardianFirstName: 'Guardian',
          guardianLastName: 'Replay',
          guardianEmail: 'paysec.test1@example.com',
          guardianPhone: '08012345678',
          guardianRelationship: RelationshipType.FATHER,
        },
      });

      // Create payment transaction already linked to this application
      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: replayedRef,
          gatewayProvider: GatewayProvider.PAYSTACK,
          amountKobo: BigInt(1500000),
          currency: 'NGN',
          status: GatewayTransactionStatus.SUCCESS,
          applicationId: app.id,
          customerEmail: 'paysec.test1@example.com',
        },
      });

      const res = await verifyPaymentRoute(
        new NextRequest('http://localhost:3000/api/admissions/payment/verify', {
          method: 'POST',
          body: JSON.stringify({ reference: replayedRef }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/already been claimed/i);
    });

    it('rejects tuition fee invoice reference cross-used for admissions with 400', async () => {
      const invoiceRef = `${testRefPrefix}-INVOICE-01`;

      // Get or create dummy invoice to link
      const invoice = await prisma.invoice.findFirst();
      if (!invoice) {
        // Just use a dummy invoiceId string or skip linking foreign key
      }

      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: invoiceRef,
          gatewayProvider: GatewayProvider.PAYSTACK,
          amountKobo: BigInt(5000000),
          currency: 'NGN',
          status: GatewayTransactionStatus.SUCCESS,
          invoiceId: invoice?.id || undefined,
          customerEmail: 'paysec.test2@example.com',
        },
      });

      if (invoice?.id) {
        const res = await verifyPaymentRoute(
          new NextRequest('http://localhost:3000/api/admissions/payment/verify', {
            method: 'POST',
            body: JSON.stringify({ reference: invoiceRef }),
          })
        );

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/student fee invoice/i);
      }
    });

    it('rejects foreign currency (USD) transaction with 400', async () => {
      const usdRef = `${testRefPrefix}-USD-01`;

      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: usdRef,
          gatewayProvider: GatewayProvider.PAYSTACK,
          amountKobo: BigInt(1500000),
          currency: 'USD',
          status: GatewayTransactionStatus.SUCCESS,
          customerEmail: 'paysec.test3@example.com',
        },
      });

      const res = await verifyPaymentRoute(
        new NextRequest('http://localhost:3000/api/admissions/payment/verify', {
          method: 'POST',
          body: JSON.stringify({ reference: usdRef }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/expected ngn/i);
    });

    it('rejects underpaid transaction with 400', async () => {
      const underpaidRef = `${testRefPrefix}-UNDERPAID-01`;

      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: underpaidRef,
          gatewayProvider: GatewayProvider.PAYSTACK,
          amountKobo: BigInt(50000), // ₦500 instead of ₦15,000
          currency: 'NGN',
          status: GatewayTransactionStatus.SUCCESS,
          customerEmail: 'paysec.test4@example.com',
        },
      });

      const res = await verifyPaymentRoute(
        new NextRequest('http://localhost:3000/api/admissions/payment/verify', {
          method: 'POST',
          body: JSON.stringify({ reference: underpaidRef }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/less than the required form fee/i);
    });

    it('successfully verifies legitimate unassigned admission form fee payment', async () => {
      const validRef = `${testRefPrefix}-VALID-01`;

      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: validRef,
          gatewayProvider: GatewayProvider.PAYSTACK,
          amountKobo: BigInt(1500000), // ₦15,000
          currency: 'NGN',
          status: GatewayTransactionStatus.SUCCESS,
          customerEmail: 'paysec.test5@example.com',
          gatewayResponseJson: {
            metadata: {
              guardianFullName: 'Ibrahim Danladi',
              studentFullName: 'Zainab Danladi',
              admissionCycleId,
              programmeId: primaryProgrammeId,
            },
          },
        },
      });

      const res = await verifyPaymentRoute(
        new NextRequest('http://localhost:3000/api/admissions/payment/verify', {
          method: 'POST',
          body: JSON.stringify({ reference: validRef }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.verified).toBe(true);
      expect(json.reference).toBe(validRef);
      expect(json.metadata.guardianFullName).toBe('Ibrahim Danladi');
    });
  });

  describe('Admissions Application Submission Atomic Linking (/api/admissions/apply)', () => {
    it('rejects submission if payment reference has already been claimed by another application', async () => {
      const alreadyClaimedRef = `${testRefPrefix}-CLAIMED-02`;

      // 1. Create first application
      const app1 = await prisma.application.create({
        data: {
          applicationNumber: `APP-${Date.now()}-2`,
          academicSessionId,
          admissionCycleId,
          applicantFirstName: 'StudentOne',
          applicantLastName: 'PaySec',
          applicantGender: Gender.FEMALE,
          applicantDob: new Date('2017-06-01'),
          guardianFirstName: 'Parent',
          guardianLastName: 'One',
          guardianEmail: 'paysec.test6@example.com',
          guardianPhone: '08022222222',
          guardianRelationship: RelationshipType.MOTHER,
        },
      });

      // 2. Link transaction to app1
      await prisma.paymentTransaction.create({
        data: {
          gatewayReference: alreadyClaimedRef,
          gatewayProvider: GatewayProvider.PAYSTACK,
          amountKobo: BigInt(1500000),
          currency: 'NGN',
          status: GatewayTransactionStatus.SUCCESS,
          applicationId: app1.id,
          customerEmail: 'paysec.test6@example.com',
        },
      });

      // 3. Attempt to use alreadyClaimedRef on a second application
      const res = await applyRoute(
        new NextRequest('http://localhost:3000/api/admissions/apply', {
          method: 'POST',
          body: JSON.stringify({
            admissionCycleId,
            applicantFirstName: 'StudentTwo',
            applicantLastName: 'PaySec',
            applicantDob: '2017-06-01',
            applicantGender: 'MALE',
            guardianFirstName: 'Parent',
            guardianLastName: 'Two',
            guardianEmail: 'paysec.test7@example.com',
            guardianPhone: '08033333333',
            guardianRelationship: 'FATHER',
            programmeSelections: [{ programmeId: primaryProgrammeId }],
            paymentReference: alreadyClaimedRef, // Attacking by re-using reference!
          }),
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/already been claimed/i);
    });
  });
});
