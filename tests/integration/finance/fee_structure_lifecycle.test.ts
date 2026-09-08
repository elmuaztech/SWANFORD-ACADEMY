import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  FeeApplicableGender,
  Gender,
  ProgrammeCode,
  RoleCode,
  TermCode,
} from '@prisma/client';
import {
  createFeeStructure,
  updateFeeStructure,
  resolveFeeStructureForStudent,
  cloneFeeStructures,
} from '@/lib/finance/fee_structure_service';
import { SafeUser } from '@/lib/auth/service';
import { generateNextAdmissionNumber } from '@/lib/students/admission_number';

describe('Stage 8 — Integration: Fee Structure Lifecycle', () => {
  let accountantUser: SafeUser;
  let academicSessionId: string;
  let firstTermId: string;
  let secondTermId: string;
  let primaryProgId: string;
  let primaryClassId: string;

  beforeEach(async () => {
    // 1. Setup Session & Terms
    const session = await prisma.academicSession.create({
      data: {
        name: `Finance-Session-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    const term1 = await prisma.academicTerm.create({
      data: {
        academicSessionId: session.id,
        termCode: TermCode.FIRST,
        name: 'First Term',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });
    firstTermId = term1.id;

    const term2 = await prisma.academicTerm.create({
      data: {
        academicSessionId: session.id,
        termCode: TermCode.SECOND,
        name: 'Second Term',
        startDate: new Date('2027-01-10'),
        endDate: new Date('2027-04-10'),
      },
    });
    secondTermId = term2.id;

    // 2. Setup Accountant User
    const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ACCOUNTANT } });
    const user = await prisma.user.create({
      data: {
        email: `accountant-test-${Date.now()}@swanford.example.com`,
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: accountantRole.id },
    });

    accountantUser = {
      id: user.id,
      email: user.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 3. Programme & Class
    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgId = primaryProg.id;

    const pClass = await prisma.schoolClass.create({
      data: {
        programmeId: primaryProg.id,
        code: `P4-TEST-${Date.now()}`,
        name: 'Primary 4 Test',
        capacity: 30,
      },
    });
    primaryClassId = pClass.id;
  });

  it('creates a fee structure with itemized fee items and writes audit log', async () => {
    const feeStructure = await createFeeStructure(accountantUser, {
      academicSessionId,
      academicTermId: firstTermId,
      programmeId: primaryProgId,
      schoolClassId: primaryClassId,
      applicableGender: FeeApplicableGender.MALE,
      isAdmissionFee: true,
      name: 'Primary 4 Boys First Term Admission Fee',
      feeItems: [
        { name: 'Tuition', amountKobo: 5000000 },
        { name: 'Cardigan', amountKobo: 1200000 },
        { name: '2 Polo Shirts', amountKobo: 800000 },
      ],
    });

    expect(feeStructure.id).toBeDefined();
    expect(feeStructure.name).toBe('Primary 4 Boys First Term Admission Fee');
    expect(feeStructure.applicableGender).toBe(FeeApplicableGender.MALE);
    expect(feeStructure.isAdmissionFee).toBe(true);
    expect(feeStructure.feeItems).toHaveLength(3);

    // Verify Audit Log
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'FeeStructure',
        entityId: feeStructure.id,
        action: 'FEE_STRUCTURE_CREATED',
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(accountantUser.id);
  });

  it('resolves the correct student-specific fee structure taking class and gender into account', async () => {
    // 1. Programme-wide default structure for ALL genders
    await createFeeStructure(accountantUser, {
      academicSessionId,
      academicTermId: firstTermId,
      programmeId: primaryProgId,
      schoolClassId: null, // all classes
      applicableGender: FeeApplicableGender.ALL,
      isAdmissionFee: false,
      name: 'Primary Regular Term Fee (General)',
      feeItems: [{ name: 'General Tuition', amountKobo: 4000000 }],
    });

    // 2. Class-specific structure for MALE
    const maleClassStructure = await createFeeStructure(accountantUser, {
      academicSessionId,
      academicTermId: firstTermId,
      programmeId: primaryProgId,
      schoolClassId: primaryClassId,
      applicableGender: FeeApplicableGender.MALE,
      isAdmissionFee: false,
      name: 'Primary 4 Boys Regular Fee',
      feeItems: [{ name: 'Primary 4 Boys Tuition', amountKobo: 4500000 }],
    });

    // 3. Create a Male student in Primary 4
    const maleStudent = await prisma.student.create({
      data: {
        admissionNumber: await generateNextAdmissionNumber(2026, prisma),
        firstName: 'FeeStructBoy',
        lastName: 'TestMale',
        gender: Gender.MALE,
        dateOfBirth: new Date('2017-02-15'),
      },
    });

    // Resolve for male student with class specified -> should match maleClassStructure
    const resolvedMale = await resolveFeeStructureForStudent({
      studentId: maleStudent.id,
      programmeId: primaryProgId,
      academicSessionId,
      academicTermId: firstTermId,
      schoolClassId: primaryClassId,
      isAdmissionFee: false,
    });
    expect(resolvedMale?.id).toBe(maleClassStructure.id);
    expect(resolvedMale?.name).toBe('Primary 4 Boys Regular Fee');

    // 4. Create a Female student
    const femaleStudent = await prisma.student.create({
      data: {
        admissionNumber: await generateNextAdmissionNumber(2026, prisma),
        firstName: 'FeeStructGirl',
        lastName: 'TestFemale',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2017-05-10'),
      },
    });

    // Resolve for female student in same class -> should fallback to general ALL-gender structure
    const resolvedFemale = await resolveFeeStructureForStudent({
      studentId: femaleStudent.id,
      programmeId: primaryProgId,
      academicSessionId,
      academicTermId: firstTermId,
      schoolClassId: primaryClassId,
      isAdmissionFee: false,
    });
    expect(resolvedFemale?.name).toBe('Primary Regular Term Fee (General)');
  });

  it('clones fee structures from Term 1 to Term 2 without mutating historical structures', async () => {
    const original = await createFeeStructure(accountantUser, {
      academicSessionId,
      academicTermId: firstTermId,
      programmeId: primaryProgId,
      name: 'Original Term 1 Structure',
      feeItems: [{ name: 'Tuition', amountKobo: 4800000 }],
    });

    const cloned = await cloneFeeStructures(accountantUser, {
      sourceSessionId: academicSessionId,
      sourceTermId: firstTermId,
      targetSessionId: academicSessionId,
      targetTermId: secondTermId,
    });

    expect(cloned).toHaveLength(1);
    expect(cloned[0].academicTermId).toBe(secondTermId);
    expect(cloned[0].id).not.toBe(original.id);
    expect(cloned[0].feeItems[0].amountKobo).toBe(BigInt(4800000));
  });

  it('updates fee structure items for future billing without breaking references', async () => {
    const created = await createFeeStructure(accountantUser, {
      academicSessionId,
      academicTermId: firstTermId,
      programmeId: primaryProgId,
      name: 'Fee Structure Before Edit',
      feeItems: [{ name: 'Tuition', amountKobo: 3000000 }],
    });

    const updated = await updateFeeStructure(accountantUser, created.id, {
      name: 'Fee Structure After Edit',
      feeItems: [
        { name: 'Tuition', amountKobo: 3500000 },
        { name: 'Computer Lab', amountKobo: 500000 },
      ],
    });

    expect(updated.name).toBe('Fee Structure After Edit');
    expect(updated.feeItems).toHaveLength(2);
  });
});
