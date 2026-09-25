import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  AdmissionCycleStatus,
  Gender,
  InvoiceStatus,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import {
  createDraftApplication,
  submitApplication,
  confirmApplicationPayment,
  reviewProgrammeSelection,
} from '@/lib/admissions/application_service';
import { createAdmissionCycle } from '@/lib/admissions/cycle_service';
import { matriculateApplication } from '@/lib/admissions/matriculation_service';
import { createFeeStructure } from '@/lib/finance/fee_structure_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 8 — Integration: Admission Matriculation & School Fee Invoicing (Amendment 3)', () => {
  let adminUser: SafeUser;
  let cycleId: string;
  let primaryProgId: string;
  let primaryClassId: string;

  beforeEach(async () => {
    // 1. Session & First Term
    const session = await prisma.academicSession.create({
      data: {
        name: `Adm-Inv-Session-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });

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

    // 2. Super Admin
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `adm-admin-${Date.now()}@swanford.example.com`,
        passwordHash: 'dummy',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });

    adminUser = {
      id: user.id,
      email: user.email,
      phoneNumber: null,
      status: 'ACTIVE',
      roles: [RoleCode.SUPER_ADMIN],
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 3. Programme & Class
    const prog = await prisma.programme.findUniqueOrThrow({ where: { code: ProgrammeCode.PRIMARY } });
    primaryProgId = prog.id;

    const pClass = await prisma.schoolClass.create({
      data: {
        programmeId: prog.id,
        code: `ADM-CLS-${Date.now()}`,
        name: 'Primary 1 Admission Test',
        capacity: 30,
      },
    });
    primaryClassId = pClass.id;

    // 4. Admission Cycle
    const cycle = await createAdmissionCycle(adminUser, {
      academicSessionId: session.id,
      name: '2026/2027 Entrance Intake',
      code: `CYC-ADM-${Date.now()}`,
      startDate: new Date('2026-01-01'),
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      status: AdmissionCycleStatus.OPEN,
    });
    cycleId = cycle.id;

    // 5. Configure Admission School Fee Structure for Primary (Tuition: ₦80,000, Uniform: ₦15,000)
    await createFeeStructure(adminUser, {
      academicSessionId: session.id,
      academicTermId: term.id,
      programmeId: prog.id,
      schoolClassId: pClass.id,
      isAdmissionFee: true,
      name: 'Primary 1 New Intake School Fee',
      feeItems: [
        { name: 'First Term Tuition', amountKobo: 8000000 },
        { name: 'New Student Uniform & Bag', amountKobo: 1500000 },
      ],
    });
  });

  it('ENFORCES AMENDMENT 3: Keeps ₦5,000 application fee separate and automatically creates initial school fee invoice upon matriculation', async () => {
    // 1. Create and submit admission application (requires ₦5,000 form fee)
    const draft = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Mustapha',
      applicantLastName: 'Gwandu',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2019-04-10'),
      guardianFirstName: 'Gwandu',
      guardianLastName: 'Ali',
      guardianEmail: `gwandu-${Date.now()}@example.com`,
      guardianPhone: '+2348034445566',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId, targetClassId: primaryClassId }],
    });

    const submitted = await submitApplication(draft.id);

    // 2. Pay ₦5,000 application fee
    await confirmApplicationPayment(adminUser, submitted.id, {
      paymentReference: `PAY-APP-FORM-${Date.now()}`,
      amountPaidKobo: BigInt(500000),
    });

    // 3. Approve application programme selection
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: submitted.id },
      include: { programmeSelections: true },
    });
    await reviewProgrammeSelection(adminUser, app.programmeSelections[0].id, {
      decision: 'APPROVED',
      decisionNotes: 'Passed entrance assessment',
    });

    // 4. Matriculate application into student
    const result = await matriculateApplication(adminUser, {
      applicationId: app.id,
    });

    expect(result.student).toBeDefined();
    expect(result.invoices).toBeDefined();
    expect(result.invoices).toHaveLength(1);

    const initialInvoice = result.invoices[0];
    expect(initialInvoice.status).toBe(InvoiceStatus.ISSUED);
    expect(initialInvoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);

    // Verify ₦5,000 application fee is NOT duplicated on the school fee invoice!
    // Total should be strictly ₦80,000 + ₦15,000 = ₦95,000 (9,500,000 Kobo)
    expect(initialInvoice.totalAmountKobo).toBe(BigInt(9500000));
    expect(initialInvoice.amountPaidKobo).toBe(BigInt(0));
    expect(initialInvoice.outstandingBalanceKobo).toBe(BigInt(9500000));

    // Verify invoice items do not include application form fee
    const itemDescriptions = initialInvoice.items.map((i: { description: string }) => i.description);
    expect(itemDescriptions).toContain('First Term Tuition');
    expect(itemDescriptions).toContain('New Student Uniform & Bag');
    expect(itemDescriptions.some((d: string) => d.toLowerCase().includes('application form'))).toBe(false);

    // 5. Calling matriculation again is strictly blocked (cannot duplicate invoice or enrollment)
    await expect(
      matriculateApplication(adminUser, {
        applicationId: app.id,
      })
    ).rejects.toThrow(/already been matriculated/i);
  });
});
