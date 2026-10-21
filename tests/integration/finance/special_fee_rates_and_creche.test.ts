import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { RoleCode, InvoiceStatus, ProgrammeAvailabilityStatus } from '@prisma/client';
import { assignSpecialFeeRates, listSpecialFeeRates, toggleSpecialFeeRateStatus } from '@/lib/finance/special_rate_service';
import { createInvoice, generateBatchTermInvoices } from '@/lib/finance/invoice_service';
import { SafeUser, sanitizeUser } from '@/lib/auth/service';

describe('Special Grandfathered Fee Rates and Creche Monthly Billing', () => {
  let adminUser: SafeUser;
  let testSession: any;
  let testTerm: any;
  let primaryProg: any;
  let crecheProg: any;
  let testStudent: any;
  let testGuardian: any;

  beforeAll(async () => {
    // 1. Get or create admin user
    const dbAdmin = await prisma.user.findFirst({
      where: { userRoles: { some: { role: { code: RoleCode.ADMIN } } } },
      include: { userRoles: { include: { role: true } } },
    });

    if (!dbAdmin) throw new Error('No admin user found in database');
    adminUser = {
      ...sanitizeUser(dbAdmin),
      roles: dbAdmin.userRoles.map((r) => r.role.code),
    };

    // 2. Resolve session, term, programmes
    testSession = await prisma.academicSession.findFirst({ where: { isCurrent: true } })
      || await prisma.academicSession.findFirst();
    if (!testSession) throw new Error('No academic session found');

    testTerm = await prisma.academicTerm.findFirst({
      where: { academicSessionId: testSession.id },
    }) || await prisma.academicTerm.findFirst();
    if (!testTerm) throw new Error('No academic term found');

    primaryProg = await prisma.programme.findFirst({ where: { code: 'PRIMARY' } });
    crecheProg = await prisma.programme.findFirst({ where: { code: 'CRECHE' } });

    // 3. Create test student & guardian with linked relationship
    const uniqueSuffix = Date.now().toString().slice(-6);
    testGuardian = await prisma.guardian.create({
      data: {
        firstName: 'SpecialRate',
        lastName: `Parent_${uniqueSuffix}`,
        email: `specialrate.parent.${uniqueSuffix}@swanford.test`,
        phonePrimary: `+234803${uniqueSuffix}`,
      },
    });

    testStudent = await prisma.student.create({
      data: {
        admissionNumber: `SPEC-${uniqueSuffix}`,
        firstName: 'Legacy',
        lastName: `Student_${uniqueSuffix}`,
        gender: 'MALE',
        dateOfBirth: new Date('2018-05-10'),
      },
    });

    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: testGuardian.id,
        studentId: testStudent.id,
        relationshipType: 'FATHER',
        receivesInvoices: true,
        isPrimaryContact: true,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    if (testStudent) {
      await prisma.invoiceItem.deleteMany({
        where: { invoice: { studentId: testStudent.id } },
      });
      await prisma.invoice.deleteMany({
        where: { studentId: testStudent.id },
      });
      await prisma.studentSpecialFeeRate.deleteMany({
        where: { studentId: testStudent.id },
      });
      await prisma.guardianStudentRelationship.deleteMany({
        where: { studentId: testStudent.id },
      });
      await prisma.student.delete({
        where: { id: testStudent.id },
      });
    }
    if (testGuardian) {
      await prisma.guardian.delete({
        where: { id: testGuardian.id },
      });
    }
  });

  it('assigns an approved special/grandfathered fee rate to an old student', async () => {
    const assigned = await assignSpecialFeeRates(adminUser, {
      studentIds: [testStudent.id],
      programmeId: primaryProg.id,
      academicSessionId: testSession.id,
      customAmountNaira: '35000', // ₦35,000 legacy rate
      notes: 'Grandfathered 2024 intake rate',
    });

    expect(assigned).toHaveLength(1);
    expect(assigned[0].studentId).toBe(testStudent.id);
    expect(assigned[0].customAmountKobo).toBe(BigInt(3500000));
    expect(assigned[0].isActive).toBe(true);

    const rates = await listSpecialFeeRates(adminUser, {
      studentId: testStudent.id,
      isActive: true,
    });
    expect(rates).toHaveLength(1);
    expect(rates[0].notes).toBe('Grandfathered 2024 intake rate');
  });

  it('automatically applies the approved special rate when issuing an invoice', async () => {
    const invoice = await createInvoice(adminUser, {
      studentId: testStudent.id,
      programmeId: primaryProg.id,
      academicSessionId: testSession.id,
      academicTermId: testTerm.id,
      dueDate: new Date(Date.now() + 14 * 86400000),
    });

    expect(invoice.isSpecialRate).toBe(true);
    expect(invoice.totalAmountKobo).toBe(BigInt(3500000)); // ₦35,000
    expect(invoice.outstandingBalanceKobo).toBe(BigInt(3500000));
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].description).toContain('Approved Special Rate Tuition');
    expect(invoice.items[0].unitAmountKobo).toBe(BigInt(3500000));
  });

  it('enforces duplicate prevention for the same student and term', async () => {
    await expect(
      createInvoice(adminUser, {
        studentId: testStudent.id,
        programmeId: primaryProg.id,
        academicSessionId: testSession.id,
        academicTermId: testTerm.id,
        dueDate: new Date(Date.now() + 14 * 86400000),
      })
    ).rejects.toThrow(/already been issued/i);
  });

  it('supports monthly Creche fee billing with duplicate prevention per month', async () => {
    // Generate October (month 10) Creche invoice
    const octoberInvoice = await createInvoice(adminUser, {
      studentId: testStudent.id,
      programmeId: crecheProg.id,
      academicSessionId: testSession.id,
      academicTermId: testTerm.id,
      billingMonth: 10,
      billingPeriodName: 'October 2026',
      dueDate: new Date(Date.now() + 14 * 86400000),
    });

    expect(octoberInvoice.billingMonth).toBe(10);
    expect(octoberInvoice.billingPeriodName).toBe('October 2026');
    expect(octoberInvoice.totalAmountKobo).toBe(BigInt(1000000)); // ₦10,000
    expect(octoberInvoice.items[0].description).toContain('Creche');

    // Trying to bill October again fails (duplicate prevention)
    await expect(
      createInvoice(adminUser, {
        studentId: testStudent.id,
        programmeId: crecheProg.id,
        academicSessionId: testSession.id,
        academicTermId: testTerm.id,
        billingMonth: 10,
        billingPeriodName: 'October 2026',
        dueDate: new Date(Date.now() + 14 * 86400000),
      })
    ).rejects.toThrow(/already been issued/i);

    // Billing November (month 11) succeeds
    const novemberInvoice = await createInvoice(adminUser, {
      studentId: testStudent.id,
      programmeId: crecheProg.id,
      academicSessionId: testSession.id,
      academicTermId: testTerm.id,
      billingMonth: 11,
      billingPeriodName: 'November 2026',
      dueDate: new Date(Date.now() + 14 * 86400000),
    });

    expect(novemberInvoice.billingMonth).toBe(11);
    expect(novemberInvoice.billingPeriodName).toBe('November 2026');
    expect(novemberInvoice.totalAmountKobo).toBe(BigInt(1000000));
  });
});
