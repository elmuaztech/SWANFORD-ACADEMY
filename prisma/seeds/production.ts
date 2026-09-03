import {
  PrismaClient,
  RoleCode,
  ProgrammeCode,
  TermCode,
  FeeApplicableGender,
  ConfigCategory,
  AdmissionCycleStatus,
  ProgrammeAvailabilityStatus,
  AcademicTermStatus,
} from "@prisma/client";

/**
 * Swanford Academy - Production Foundation Seed
 * Master Specification Reference: Sections 2, 5, 6, 18, 25
 *
 * PRODUCTION ZERO-STATE INVARIANT:
 * Seeds ONLY structural constants, roles, permissions, curricular programmes,
 * classes, subjects, academic session/terms, fee schedules, system configurations,
 * and exactly ONE initial Super Admin identity.
 *
 * Zero students, zero parents, zero mock invoices, zero payments.
 */
export async function seedProductionFoundation(prisma: PrismaClient) {
  console.log("-> Seeding Production Foundation Architecture...");

  // 1. System Roles
  const rolesData = [
    { code: RoleCode.SUPER_ADMIN, name: "Super Administrator", description: "Full operational administration and governance", isSystem: true },
    { code: RoleCode.ADMIN, name: "School Administrator", description: "Academic administration and admissions management", isSystem: true },
    { code: RoleCode.ACCOUNTANT, name: "Accountant", description: "Fees, payments, invoices, expenses, and financial reporting", isSystem: true },
    { code: RoleCode.TEACHER, name: "Teacher", description: "Academic instruction, attendance, and assessment within scope", isSystem: true },
    { code: RoleCode.PARENT, name: "Parent / Guardian", description: "Parent portal access for linked children", isSystem: true },
  ];

  const rolesMap = new Map<string, string>();
  for (const r of rolesData) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: r,
    });
    rolesMap.set(r.code, role.id);
  }

  // 2. Canonical System Permissions & Role-Permission Mappings
  const { PERMISSION_DEFINITIONS, SYSTEM_ROLE_PERMISSIONS } = await import(
    "../../src/lib/auth/permissions"
  );

  const permMap = new Map<string, string>();
  for (const p of Object.values(PERMISSION_DEFINITIONS)) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module, description: p.description },
      create: {
        code: p.code,
        name: p.name,
        module: p.module,
        description: p.description,
      },
    });
    permMap.set(p.code, perm.id);
  }

  // Seed system-controlled role-permission mappings for all 5 roles
  for (const [roleCode, permCodes] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
    const roleId = rolesMap.get(roleCode);
    if (!roleId) continue;

    for (const permCode of permCodes) {
      const permId = permMap.get(permCode);
      if (!permId) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId: permId,
          },
        },
        update: {},
        create: {
          roleId,
          permissionId: permId,
        },
      });
    }
  }

  // 3. Programmes (Including Tahfeez as a standalone programme)
  const programmesData = [
    { code: ProgrammeCode.CRECHE, name: "Creche", isMainAcademic: true, displayOrder: 1 },
    { code: ProgrammeCode.PRE_SCHOLARS, name: "Pre-Scholars", isMainAcademic: true, displayOrder: 2 },
    { code: ProgrammeCode.PRE_NURSERY, name: "Pre-Nursery", isMainAcademic: true, displayOrder: 3 },
    { code: ProgrammeCode.NURSERY, name: "Nursery", isMainAcademic: true, displayOrder: 4 },
    { code: ProgrammeCode.PRIMARY, name: "Primary", isMainAcademic: true, displayOrder: 5 },
    { code: ProgrammeCode.TAHFEEZ, name: "Tahfeez (Standalone Programme)", isMainAcademic: false, displayOrder: 6 },
  ];

  const programmesMap = new Map<string, string>();
  for (const prog of programmesData) {
    const p = await prisma.programme.upsert({
      where: { code: prog.code },
      update: { name: prog.name, isMainAcademic: prog.isMainAcademic, displayOrder: prog.displayOrder },
      create: prog,
    });
    programmesMap.set(prog.code, p.id);
  }

  // 4. School Classes
  const classesData = [
    { code: "CRECHE_1", name: "Creche", programmeCode: ProgrammeCode.CRECHE },
    { code: "PRE_SCHOLARS_1", name: "Pre-Scholars", programmeCode: ProgrammeCode.PRE_SCHOLARS },
    { code: "PRE_NURSERY_1", name: "Pre-Nursery", programmeCode: ProgrammeCode.PRE_NURSERY },
    { code: "NURSERY_1", name: "Nursery 1", programmeCode: ProgrammeCode.NURSERY },
    { code: "NURSERY_2", name: "Nursery 2", programmeCode: ProgrammeCode.NURSERY },
    { code: "PRIMARY_1", name: "Primary 1", programmeCode: ProgrammeCode.PRIMARY },
    { code: "PRIMARY_2", name: "Primary 2", programmeCode: ProgrammeCode.PRIMARY },
    { code: "PRIMARY_3", name: "Primary 3", programmeCode: ProgrammeCode.PRIMARY },
    { code: "PRIMARY_4", name: "Primary 4", programmeCode: ProgrammeCode.PRIMARY },
    { code: "PRIMARY_5", name: "Primary 5", programmeCode: ProgrammeCode.PRIMARY },
    { code: "PRIMARY_6", name: "Primary 6", programmeCode: ProgrammeCode.PRIMARY },
    { code: "TAHFEEZ_GROUP_A", name: "Tahfeez Group A", programmeCode: ProgrammeCode.TAHFEEZ },
  ];

  for (const c of classesData) {
    const programmeId = programmesMap.get(c.programmeCode)!;
    await prisma.schoolClass.upsert({
      where: { code: c.code },
      update: { name: c.name, programmeId },
      create: {
        code: c.code,
        name: c.name,
        programmeId,
      },
    });
  }

  // 5. Academic Session & Terms
  const session = await prisma.academicSession.upsert({
    where: { name: "2026/2027" },
    update: { isCurrent: true, status: "ACTIVE" },
    create: {
      name: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      status: "ACTIVE",
      isCurrent: true,
    },
  });

  const termsData: {
    termCode: TermCode;
    name: string;
    isCurrent: boolean;
    status: AcademicTermStatus;
    startDate: Date;
    endDate: Date;
  }[] = [
    { termCode: TermCode.FIRST, name: "First Term", isCurrent: true, status: AcademicTermStatus.ACTIVE, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
    { termCode: TermCode.SECOND, name: "Second Term", isCurrent: false, status: AcademicTermStatus.UPCOMING, startDate: new Date("2027-01-10"), endDate: new Date("2027-04-10") },
    { termCode: TermCode.THIRD, name: "Third Term", isCurrent: false, status: AcademicTermStatus.UPCOMING, startDate: new Date("2027-05-02"), endDate: new Date("2027-07-25") },
  ];

  const termsMap = new Map<TermCode, string>();
  for (const t of termsData) {
    const term = await prisma.academicTerm.upsert({
      where: {
        academicSessionId_termCode: {
          academicSessionId: session.id,
          termCode: t.termCode,
        },
      },
      update: { name: t.name, isCurrent: t.isCurrent, status: t.status },
      create: {
        academicSessionId: session.id,
        termCode: t.termCode,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        status: t.status,
        isCurrent: t.isCurrent,
      },
    });
    termsMap.set(t.termCode, term.id);
  }

  // 6. Admission Cycle & Programme Availabilities (2026/2027 Main Intake)
  const admissionCycle = await prisma.admissionCycle.upsert({
    where: { code: "ADM-2026-MAIN" },
    update: {
      status: AdmissionCycleStatus.OPEN,
    },
    create: {
      code: "ADM-2026-MAIN",
      name: "2026/2027 Main Admission",
      academicSessionId: session.id,
      startDate: new Date("2026-08-01T07:00:00.000Z"), // 08:00 AM Africa/Lagos
      endDate: new Date("2026-09-30T22:59:59.999Z"),   // 23:59:59 Africa/Lagos
      status: AdmissionCycleStatus.OPEN,
      description: "Main admission window for 2026/2027 academic session.",
    },
  });

  for (const [, progId] of programmesMap.entries()) {
    await prisma.admissionCycleProgramme.upsert({
      where: {
        unique_cycle_programme: {
          admissionCycleId: admissionCycle.id,
          programmeId: progId,
        },
      },
      update: {
        status: ProgrammeAvailabilityStatus.OPEN,
      },
      create: {
        admissionCycleId: admissionCycle.id,
        programmeId: progId,
        status: ProgrammeAvailabilityStatus.OPEN,
        maxCapacity: 60,
      },
    });
  }

  // 7. System Configurations & School Profile
  const configsData = [
    { key: "school.name", value: "Swanford Academy", category: ConfigCategory.GENERAL },
    { key: "school.subtitle", value: "Nursery, Primary & Tahfeez School", category: ConfigCategory.GENERAL },
    { key: "school.motto", value: "Illuminating the Path to Success", category: ConfigCategory.GENERAL },
    { key: "school.mission", value: "To nurture academically sound, morally upright, and Quran-conscious global citizens.", category: ConfigCategory.GENERAL },
    { key: "school.vision", value: "To be the premier citadel of blended academic excellence and authentic Islamic values in Northern Nigeria.", category: ConfigCategory.GENERAL },
    { key: "school.address", value: "PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE", category: ConfigCategory.GENERAL },
    { key: "school.phone_primary", value: "08030000001", category: ConfigCategory.GENERAL },
    { key: "school.email", value: "info@swanfordacademy.edu.ng", category: ConfigCategory.GENERAL },
    { key: "school.proprietor", value: "Alhaji Muhammad Sani", category: ConfigCategory.GENERAL },
    { key: "school.timezone", value: "Africa/Lagos", category: ConfigCategory.GENERAL },
    { key: "school.primary_color", value: "#1E3A8A", category: ConfigCategory.GENERAL },
    { key: "school.secondary_color", value: "#F59E0B", category: ConfigCategory.GENERAL },
    { key: "admissions.form_fee_kobo", value: "500000", category: ConfigCategory.ADMISSIONS },
    { key: "finance.bank_name", value: "Jaiz Bank", category: ConfigCategory.FINANCE },
    { key: "finance.account_number", value: "0012031162", category: ConfigCategory.FINANCE },
    { key: "finance.account_name", value: "Swanford Academy", category: ConfigCategory.FINANCE },
  ];

  for (const cfg of configsData) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value, category: cfg.category },
      create: cfg,
    });
  }

  // 8. Standard Reference Grading Scales & Bands
  const primaryProgId = programmesMap.get(ProgrammeCode.PRIMARY)!;
  const tahfeezProgId = programmesMap.get(ProgrammeCode.TAHFEEZ)!;

  await prisma.gradingScale.upsert({
    where: { code: "PRIMARY_STANDARD_2026" },
    update: {},
    create: {
      code: "PRIMARY_STANDARD_2026",
      name: "Primary Standard Grading Scale",
      programmeId: primaryProgId,
      passMark: 40.00,
      maxScore: 100.00,
      description: "Standard British/Nigerian Primary Continuous Assessment & Exam Scale",
      bands: {
        create: [
          { grade: "A", minScore: 70.00, maxScore: 100.00, points: 5.0, remark: "Distinction", isPass: true, displayOrder: 1 },
          { grade: "B", minScore: 60.00, maxScore: 69.99, points: 4.0, remark: "Very Good", isPass: true, displayOrder: 2 },
          { grade: "C", minScore: 50.00, maxScore: 59.99, points: 3.0, remark: "Credit", isPass: true, displayOrder: 3 },
          { grade: "D", minScore: 40.00, maxScore: 49.99, points: 2.0, remark: "Pass", isPass: true, displayOrder: 4 },
          { grade: "F", minScore: 0.00, maxScore: 39.99, points: 0.0, remark: "Fail", isPass: false, displayOrder: 5 },
        ],
      },
    },
  });

  await prisma.gradingScale.upsert({
    where: { code: "TAHFEEZ_STANDARD_2026" },
    update: {},
    create: {
      code: "TAHFEEZ_STANDARD_2026",
      name: "Tahfeez Quran Memorization Scale",
      programmeId: tahfeezProgId,
      passMark: 50.00,
      maxScore: 100.00,
      description: "Classical Tahfeez Hifz and Tajweed Assessment Scale",
      bands: {
        create: [
          { grade: "Mumtaz", minScore: 85.00, maxScore: 100.00, points: 5.0, remark: "Excellent (Mumtaz)", isPass: true, displayOrder: 1 },
          { grade: "Jayyid Jiddan", minScore: 70.00, maxScore: 84.99, points: 4.0, remark: "Very Good (Jayyid Jiddan)", isPass: true, displayOrder: 2 },
          { grade: "Jayyid", minScore: 50.00, maxScore: 69.99, points: 3.0, remark: "Good (Jayyid)", isPass: true, displayOrder: 3 },
          { grade: "Maqbul", minScore: 40.00, maxScore: 49.99, points: 2.0, remark: "Pass (Maqbul)", isPass: false, displayOrder: 4 },
          { grade: "Rasib", minScore: 0.00, maxScore: 39.99, points: 0.0, remark: "Fail (Rasib)", isPass: false, displayOrder: 5 },
        ],
      },
    },
  });

  // 9. Initial Fee Structures & Fee Items
  const firstTermId = termsMap.get(TermCode.FIRST)!;

  // Primary 1st Term Boys: ₦110,000 (11000000 kobo)
  await prisma.feeStructure.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      academicSessionId: session.id,
      academicTermId: firstTermId,
      programmeId: primaryProgId,
      applicableGender: FeeApplicableGender.MALE,
      isAdmissionFee: true,
      name: "Primary 1st Term Boys Admission Fee",
      feeItems: {
        create: [
          { name: "Tuition & Stationery", amountKobo: BigInt(7500000) },
          { name: "Uniform, Cardigan & 2 Polos", amountKobo: BigInt(2500000) },
          { name: "Medical & Exam Fees", amountKobo: BigInt(1000000) },
        ],
      },
    },
  });

  // Tahfeez 1st Term Admission: ₦18,000 (1800000 kobo)
  await prisma.feeStructure.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      academicSessionId: session.id,
      academicTermId: firstTermId,
      programmeId: tahfeezProgId,
      applicableGender: FeeApplicableGender.ALL,
      isAdmissionFee: true,
      name: "Tahfeez 1st Term Admission Fee",
      feeItems: {
        create: [
          { name: "Tahfeez Tuition", amountKobo: BigInt(1000000) },
          { name: "Uniform & Books", amountKobo: BigInt(800000) },
        ],
      },
    },
  });

  // 8. Super Admin Initial User Account
  const superAdminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL || "superadmin@swanfordacademy.edu.ng";
  const superAdminPasswordHash = "$2a$12$e8Yk1H6qGqG.g1lq3YpE.e8Oq1q6y6kGqG.g1lq3YpE.e8Oq1q6y6"; // standard Argon2/bcrypt placeholder

  const superAdminUser = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      passwordHash: superAdminPasswordHash,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  const superAdminRoleId = rolesMap.get(RoleCode.SUPER_ADMIN)!;
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdminUser.id,
        roleId: superAdminRoleId,
      },
    },
    update: {},
    create: {
      userId: superAdminUser.id,
      roleId: superAdminRoleId,
    },
  });

  console.log("✔ Production Foundation Seed Completed Successfully.");
}
