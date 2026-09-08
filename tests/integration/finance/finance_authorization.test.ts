import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  Gender,
  PaymentMethod,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import { createFeeStructure } from '@/lib/finance/fee_structure_service';
import { createInvoice, getInvoiceById } from '@/lib/finance/invoice_service';
import { recordManualPayment } from '@/lib/finance/payment_service';
import { getFeeCollectionSummary } from '@/lib/finance/report_service';
import { SafeUser } from '@/lib/auth/service';
import { generateNextAdmissionNumber } from '@/lib/students/admission_number';

describe('Stage 8 — Integration: Finance Authorization Boundaries & Scopes', () => {
  let accountantUser: SafeUser;
  let adminUser: SafeUser;
  let teacherUser: SafeUser;
  let parentUser: SafeUser;
  let unrelatedParentUser: SafeUser;

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
        name: `Auth-Fin-Session-${Date.now()}`,
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

    // 2. Roles
    const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ACCOUNTANT } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.PARENT } });

    // Helper to create user with role
    const createUser = async (email: string, roleId: string): Promise<SafeUser> => {
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

    accountantUser = await createUser(`acc-${Date.now()}@swanford.example.com`, accountantRole.id);
    adminUser = await createUser(`adm-${Date.now()}@swanford.example.com`, adminRole.id);
    teacherUser = await createUser(`tch-${Date.now()}@swanford.example.com`, teacherRole.id);
    parentUser = await createUser(`prt-${Date.now()}@swanford.example.com`, parentRole.id);
    unrelatedParentUser = await createUser(`unprt-${Date.now()}@swanford.example.com`, parentRole.id);

    // 3. Programme & Student
    const prog = await prisma.programme.findUniqueOrThrow({ where: { code: ProgrammeCode.PRIMARY } });
    primaryProgId = prog.id;

    const student = await prisma.student.create({
      data: {
        admissionNumber: await generateNextAdmissionNumber(2026, prisma),
        firstName: 'Hauwa',
        lastName: 'Suleiman',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2018-06-01'),
      },
    });
    studentId = student.id;

    const guardian = await prisma.guardian.create({
      data: {
        userId: parentUser.id,
        firstName: 'Suleiman',
        lastName: 'Danbatta',
        email: parentUser.email,
        phonePrimary: '+2348032223344',
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

    // Unrelated guardian (for unrelatedParentUser)
    await prisma.guardian.create({
      data: {
        userId: unrelatedParentUser.id,
        firstName: 'Unrelated',
        lastName: 'Parent',
        email: unrelatedParentUser.email,
        phonePrimary: '+2348031119900',
      },
    });

    // Issue invoice for Hauwa
    const invoice = await createInvoice(accountantUser, {
      studentId,
      guardianId,
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      dueDate: new Date('2026-09-30'),
      items: [{ description: 'Primary Tuition', unitAmountKobo: 7500000 }],
    });
    invoiceId = invoice.id;
  });

  it('allows Accountant to manage fee structures, issue invoices, record payments, and view reports', async () => {
    // 1. Fee structure creation
    const fs = await createFeeStructure(accountantUser, {
      academicSessionId,
      academicTermId: termId,
      programmeId: primaryProgId,
      name: 'Accountant Fee Structure',
      feeItems: [{ name: 'Tuition', amountKobo: 7500000 }],
    });
    expect(fs.id).toBeDefined();

    // 2. Payment recording
    const paymentResult = await recordManualPayment(accountantUser, {
      invoiceId,
      amountKobo: 2500000,
      paymentMethod: PaymentMethod.POS,
      autoConfirm: true,
    });
    expect(paymentResult.payment.status).toBe('CONFIRMED');

    // 3. Reporting view
    const summary = await getFeeCollectionSummary(accountantUser, {
      academicSessionId,
    });
    expect(summary.totalInvoicedKobo).toBeGreaterThan(BigInt(0));
  });

  it('allows Admin to view invoices and reports, but DENIES modifying ledger (create fee structure, issue invoice, record payment)', async () => {
    // Admin can view invoice
    const inv = await getInvoiceById(adminUser, invoiceId);
    expect(inv.id).toBe(invoiceId);

    // Admin can view financial report
    const summary = await getFeeCollectionSummary(adminUser, { academicSessionId });
    expect(summary).toBeDefined();

    // Admin CANNOT create fee structures
    await expect(
      createFeeStructure(adminUser, {
        academicSessionId,
        academicTermId: termId,
        programmeId: primaryProgId,
        name: 'Admin Structure',
        feeItems: [{ name: 'Tuition', amountKobo: 5000000 }],
      })
    ).rejects.toThrow(/Access denied/i);

    // Admin CANNOT record payments
    await expect(
      recordManualPayment(adminUser, {
        invoiceId,
        amountKobo: 1000000,
        paymentMethod: PaymentMethod.CASH,
      })
    ).rejects.toThrow(/Access denied/i);
  });

  it('DENIES Teacher from all financial operations', async () => {
    await expect(
      getInvoiceById(teacherUser, invoiceId)
    ).rejects.toThrow(/Not authorized/i);

    await expect(
      recordManualPayment(teacherUser, {
        invoiceId,
        amountKobo: 1000000,
        paymentMethod: PaymentMethod.CASH,
      })
    ).rejects.toThrow(/Access denied/i);

    await expect(
      getFeeCollectionSummary(teacherUser, { academicSessionId })
    ).rejects.toThrow(/Access denied/i);
  });

  it('ALLOWS Parent to view own child invoice, but DENIES unrelated parent (Child Scope Isolation)', async () => {
    // Linked parent CAN view invoice
    const ownInvoice = await getInvoiceById(parentUser, invoiceId);
    expect(ownInvoice.id).toBe(invoiceId);

    // Unrelated parent CANNOT view invoice
    await expect(
      getInvoiceById(unrelatedParentUser, invoiceId)
    ).rejects.toThrow(/Access denied: You can only view invoices belonging to your linked children/i);
  });
});
