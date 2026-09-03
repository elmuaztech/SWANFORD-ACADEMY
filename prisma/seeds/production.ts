import {
  PrismaClient,
  RoleCode,
  ProgrammeCode,
  TermCode,
  FeeApplicableGender,
  ConfigCategory,
  AdmissionCycleStatus,
  ProgrammeAvailabilityStatus,
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

  // 2. Core System Permissions
  const permissionsData = [
    { code: "users:manage", name: "Manage Users", module: "identity" },
    { code: "roles:assign", name: "Assign Roles", module: "identity" },
    { code: "students:view", name: "View Students", module: "students" },
    { code: "students:manage", name: "Manage Students", module: "students" },
    { code: "guardians:manage", name: "Manage Guardians", module: "guardians" },
    { code: "academics:enroll", name: "Enroll Students in Programmes", module: "academics" },
    { code: "attendance:record", name: "Record Attendance", module: "academics" },
    { code: "assessments:grade", name: "Submit Grades & Assessments", module: "academics" },
    { code: "admissions:review", name: "Review Applications", module: "admissions" },
    { code: "admissions:approve", name: "Approve/Reject Admissions", module: "admissions" },
    { code: "invoices:create", name: "Create & Issue Invoices", module: "finance" },
    { code: "invoices:cancel", name: "Cancel Invoices", module: "finance" },
    { code: "payments:record", name: "Record Ledger Payments", module: "finance" },
    { code: "expenses:record", name: "Record School Expenses", module: "finance" },
    { code: "finance:reports", name: "View Financial Reports", module: "finance" },
    { code: "settings:manage", name: "Manage System Settings", module: "settings" },
    { code: "audit:view", name: "View System Audit Logs", module: "audit" },
  ];

  for (const p of permissionsData) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module },
      create: p,
    });

    // Assign all permissions to SUPER_ADMIN
    const superAdminRoleId = rolesMap.get(RoleCode.SUPER_ADMIN);
    if (superAdminRoleId) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRoleId,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: superAdminRoleId,
          permissionId: perm.id,
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
    update: { isCurrent: true },
    create: {
      name: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      isCurrent: true,
    },
  });

  const termsData = [
    { termCode: TermCode.FIRST, name: "First Term", isCurrent: true, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
    { termCode: TermCode.SECOND, name: "Second Term", isCurrent: false, startDate: new Date("2027-01-10"), endDate: new Date("2027-04-10") },
    { termCode: TermCode.THIRD, name: "Third Term", isCurrent: false, startDate: new Date("2027-05-02"), endDate: new Date("2027-07-25") },
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
      update: { name: t.name, isCurrent: t.isCurrent },
      create: {
        academicSessionId: session.id,
        termCode: t.termCode,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
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

  // 7. System Configurations
  const configsData = [
    { key: "school.name", value: "Swanford Academy", category: ConfigCategory.GENERAL },
    { key: "school.subtitle", value: "Nursery, Primary & Tahfeez School", category: ConfigCategory.GENERAL },
    { key: "school.motto", value: "Illuminating the Path to Success", category: ConfigCategory.GENERAL },
    { key: "school.address", value: "PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE", category: ConfigCategory.GENERAL },
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

  // 7. Initial Fee Structures & Fee Items
  const firstTermId = termsMap.get(TermCode.FIRST)!;
  const primaryProgId = programmesMap.get(ProgrammeCode.PRIMARY)!;
  const tahfeezProgId = programmesMap.get(ProgrammeCode.TAHFEEZ)!;

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
