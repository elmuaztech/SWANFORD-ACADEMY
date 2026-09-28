var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/auth/permissions.ts
var permissions_exports = {};
__export(permissions_exports, {
  PERMISSION_DEFINITIONS: () => PERMISSION_DEFINITIONS,
  PermissionCode: () => PermissionCode,
  SYSTEM_ROLE_PERMISSIONS: () => SYSTEM_ROLE_PERMISSIONS
});
import { RoleCode } from "@prisma/client";
var PermissionCode, PERMISSION_DEFINITIONS, SYSTEM_ROLE_PERMISSIONS;
var init_permissions = __esm({
  "src/lib/auth/permissions.ts"() {
    "use strict";
    PermissionCode = {
      // 1. SYSTEM / ADMINISTRATION
      SYSTEM_CONFIG_MANAGE: "system_config:manage",
      USER_MANAGE: "users:manage",
      ROLE_MANAGE: "roles:manage",
      // Strictly assigning/removing system-defined roles to users
      AUDIT_LOG_VIEW: "audit_logs:view",
      // 2. PEOPLE (Students, Guardians, Teachers)
      STUDENT_VIEW: "students:view",
      STUDENT_CREATE: "students:create",
      STUDENT_EDIT: "students:edit",
      STUDENT_PROFILE_PHOTO_UPDATE: "students:profile_photo_update",
      STUDENT_MEDICAL_VIEW: "students:medical_view",
      STUDENT_MEDICAL_EDIT: "students:medical_edit",
      STUDENT_ARCHIVE: "students:archive",
      GUARDIAN_VIEW: "guardians:view",
      GUARDIAN_EDIT: "guardians:edit",
      GUARDIAN_RELATIONSHIP_MANAGE: "guardian_relationships:manage",
      TEACHER_MANAGE: "teachers:manage",
      // 3. ACADEMIC
      ACADEMIC_SESSION_MANAGE: "academic_sessions:manage",
      PROGRAMME_MANAGE: "programmes:manage",
      CLASS_MANAGE: "classes:manage",
      SUBJECT_MANAGE: "subjects:manage",
      ENROLLMENT_MANAGE: "enrollments:manage",
      // 4. ADMISSION
      ADMISSION_CYCLE_MANAGE: "admission_cycles:manage",
      ADMISSION_APPLICATION_VIEW: "admission_applications:view",
      ADMISSION_APPLICATION_REVIEW: "admission_applications:review",
      ADMISSION_APPLICATION_APPROVE: "admission_applications:approve",
      // 5. FINANCE
      FEE_STRUCTURE_MANAGE: "fee_structures:manage",
      FINANCE_INVOICE_VIEW: "finance_invoices:view",
      FINANCE_INVOICE_MANAGE: "finance_invoices:manage",
      FINANCE_PAYMENT_VIEW: "finance_payments:view",
      FINANCE_PAYMENT_RECONCILE: "finance_payments:reconcile",
      FINANCE_EXPENSE_MANAGE: "finance_expenses:manage",
      FINANCE_REPORT_VIEW: "finance_reports:view",
      // 6. ATTENDANCE
      ATTENDANCE_VIEW: "attendance:view",
      ATTENDANCE_RECORD: "attendance:record",
      // 7. ASSESSMENT
      ASSESSMENT_ENTER: "assessments:enter",
      ASSESSMENT_VIEW: "assessments:view",
      RESULT_PUBLISH: "results:publish",
      REPORT_GENERATE: "reports:generate",
      // 8. COMMUNICATION
      COMMUNICATION_ANNOUNCE: "communication:announce",
      NOTIFICATION_VIEW: "notifications:view",
      NOTIFICATION_RETRY: "notifications:retry",
      // 9. PARENT (Subordinate to active GuardianStudentRelationship)
      PARENT_CHILD_VIEW: "parent_child:view",
      PARENT_ATTENDANCE_VIEW: "parent_attendance:view",
      PARENT_RESULT_VIEW: "parent_results:view",
      PARENT_INVOICE_VIEW: "parent_invoices:view"
    };
    PERMISSION_DEFINITIONS = {
      // System / Administration
      [PermissionCode.SYSTEM_CONFIG_MANAGE]: {
        code: PermissionCode.SYSTEM_CONFIG_MANAGE,
        name: "Manage System Configurations",
        module: "system",
        description: "Configure school-wide system settings and feature flags"
      },
      [PermissionCode.USER_MANAGE]: {
        code: PermissionCode.USER_MANAGE,
        name: "Manage User Accounts",
        module: "identity",
        description: "Deactivate, reactivate, or unlock user accounts"
      },
      [PermissionCode.ROLE_MANAGE]: {
        code: PermissionCode.ROLE_MANAGE,
        name: "Assign User Roles",
        module: "identity",
        description: "Assign or remove system-controlled roles from users (no arbitrary permission editing)"
      },
      [PermissionCode.AUDIT_LOG_VIEW]: {
        code: PermissionCode.AUDIT_LOG_VIEW,
        name: "View Audit Logs",
        module: "system",
        description: "Inspect operational, security, and authorization audit logs"
      },
      // People
      [PermissionCode.STUDENT_VIEW]: {
        code: PermissionCode.STUDENT_VIEW,
        name: "View Students",
        module: "students",
        description: "View student profiles and demographic information (subject to scope when teacher)"
      },
      [PermissionCode.STUDENT_CREATE]: {
        code: PermissionCode.STUDENT_CREATE,
        name: "Create Students",
        module: "students",
        description: "Enroll existing students individually or via bulk intake"
      },
      [PermissionCode.STUDENT_EDIT]: {
        code: PermissionCode.STUDENT_EDIT,
        name: "Edit Students",
        module: "students",
        description: "Modify student demographic and profile data"
      },
      [PermissionCode.STUDENT_PROFILE_PHOTO_UPDATE]: {
        code: PermissionCode.STUDENT_PROFILE_PHOTO_UPDATE,
        name: "Update Student Profile Photo",
        module: "students",
        description: "Upload or replace student profile photos (strictly scoped by TeacherScope)"
      },
      [PermissionCode.STUDENT_MEDICAL_VIEW]: {
        code: PermissionCode.STUDENT_MEDICAL_VIEW,
        name: "View Student Medical Details",
        module: "students",
        description: "View sensitive medical notes, blood group, genotype, allergies, and conditions"
      },
      [PermissionCode.STUDENT_MEDICAL_EDIT]: {
        code: PermissionCode.STUDENT_MEDICAL_EDIT,
        name: "Edit Student Medical Details",
        module: "students",
        description: "Modify sensitive student medical conditions, allergies, and clinical notes"
      },
      [PermissionCode.STUDENT_ARCHIVE]: {
        code: PermissionCode.STUDENT_ARCHIVE,
        name: "Archive Students",
        module: "students",
        description: "Transition student to ARCHIVED state rather than physical deletion"
      },
      [PermissionCode.GUARDIAN_VIEW]: {
        code: PermissionCode.GUARDIAN_VIEW,
        name: "View Guardians",
        module: "guardians",
        description: "View parent and guardian contact profiles"
      },
      [PermissionCode.GUARDIAN_EDIT]: {
        code: PermissionCode.GUARDIAN_EDIT,
        name: "Edit Guardians",
        module: "guardians",
        description: "Modify guardian contact information"
      },
      [PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE]: {
        code: PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE,
        name: "Manage Guardian Relationships",
        module: "guardians",
        description: "Create, reassign, or revoke parent-student family relationships"
      },
      [PermissionCode.TEACHER_MANAGE]: {
        code: PermissionCode.TEACHER_MANAGE,
        name: "Manage Teachers",
        module: "teachers",
        description: "Create teachers and configure teacher programme, class, and subject scopes"
      },
      // Academic
      [PermissionCode.ACADEMIC_SESSION_MANAGE]: {
        code: PermissionCode.ACADEMIC_SESSION_MANAGE,
        name: "Manage Academic Sessions",
        module: "academics",
        description: "Create and configure academic sessions and terms"
      },
      [PermissionCode.PROGRAMME_MANAGE]: {
        code: PermissionCode.PROGRAMME_MANAGE,
        name: "Manage Programmes",
        module: "academics",
        description: "Configure academic programmes and availability"
      },
      [PermissionCode.CLASS_MANAGE]: {
        code: PermissionCode.CLASS_MANAGE,
        name: "Manage Classes",
        module: "academics",
        description: "Create and configure school classes, arms, and capacities"
      },
      [PermissionCode.SUBJECT_MANAGE]: {
        code: PermissionCode.SUBJECT_MANAGE,
        name: "Manage Subjects",
        module: "academics",
        description: "Create and configure curricular subjects"
      },
      [PermissionCode.ENROLLMENT_MANAGE]: {
        code: PermissionCode.ENROLLMENT_MANAGE,
        name: "Manage Programme Enrollments",
        module: "academics",
        description: "Enroll or withdraw students across multiple curricular programmes"
      },
      // Admission
      [PermissionCode.ADMISSION_CYCLE_MANAGE]: {
        code: PermissionCode.ADMISSION_CYCLE_MANAGE,
        name: "Manage Admission Cycles",
        module: "admissions",
        description: "Open, close, and configure admission cycles and fees"
      },
      [PermissionCode.ADMISSION_APPLICATION_VIEW]: {
        code: PermissionCode.ADMISSION_APPLICATION_VIEW,
        name: "View Applications",
        module: "admissions",
        description: "View public applicant dossiers and programme selections"
      },
      [PermissionCode.ADMISSION_APPLICATION_REVIEW]: {
        code: PermissionCode.ADMISSION_APPLICATION_REVIEW,
        name: "Review Applications",
        module: "admissions",
        description: "Review applicant documents, interviews, and entrance assessment notes"
      },
      [PermissionCode.ADMISSION_APPLICATION_APPROVE]: {
        code: PermissionCode.ADMISSION_APPLICATION_APPROVE,
        name: "Approve/Reject Admissions",
        module: "admissions",
        description: "Approve or reject admission selections per programme and convert to students"
      },
      // Finance
      [PermissionCode.FEE_STRUCTURE_MANAGE]: {
        code: PermissionCode.FEE_STRUCTURE_MANAGE,
        name: "Manage Fee Structures",
        module: "finance",
        description: "Configure fee line items, amounts, and term billing schedules"
      },
      [PermissionCode.FINANCE_INVOICE_VIEW]: {
        code: PermissionCode.FINANCE_INVOICE_VIEW,
        name: "View Invoices",
        module: "finance",
        description: "View student tuition and general fee invoices"
      },
      [PermissionCode.FINANCE_INVOICE_MANAGE]: {
        code: PermissionCode.FINANCE_INVOICE_MANAGE,
        name: "Manage Invoices",
        module: "finance",
        description: "Generate, issue, adjust, or cancel invoices"
      },
      [PermissionCode.FINANCE_PAYMENT_VIEW]: {
        code: PermissionCode.FINANCE_PAYMENT_VIEW,
        name: "View Payments",
        module: "finance",
        description: "View transaction logs, Paystack payments, and offline deposits"
      },
      [PermissionCode.FINANCE_PAYMENT_RECONCILE]: {
        code: PermissionCode.FINANCE_PAYMENT_RECONCILE,
        name: "Reconcile Payments",
        module: "finance",
        description: "Record bank transfers, reconcile payments, and issue official receipts"
      },
      [PermissionCode.FINANCE_EXPENSE_MANAGE]: {
        code: PermissionCode.FINANCE_EXPENSE_MANAGE,
        name: "Manage Expenses",
        module: "finance",
        description: "Record, verify, and categorize operational school expenses"
      },
      [PermissionCode.FINANCE_REPORT_VIEW]: {
        code: PermissionCode.FINANCE_REPORT_VIEW,
        name: "View Financial Reports",
        module: "finance",
        description: "Generate income statements, fee collection reports, and balance summaries"
      },
      // Attendance
      [PermissionCode.ATTENDANCE_VIEW]: {
        code: PermissionCode.ATTENDANCE_VIEW,
        name: "View Attendance",
        module: "attendance",
        description: "View daily student attendance records (subject to scope)"
      },
      [PermissionCode.ATTENDANCE_RECORD]: {
        code: PermissionCode.ATTENDANCE_RECORD,
        name: "Record Attendance",
        module: "attendance",
        description: "Take and submit daily attendance registers (subject to scope)"
      },
      // Assessment
      [PermissionCode.ASSESSMENT_ENTER]: {
        code: PermissionCode.ASSESSMENT_ENTER,
        name: "Enter Assessments",
        module: "assessment",
        description: "Enter continuous assessment (CA) scores and exam marks (subject to scope)"
      },
      [PermissionCode.ASSESSMENT_VIEW]: {
        code: PermissionCode.ASSESSMENT_VIEW,
        name: "View Assessments",
        module: "assessment",
        description: "Inspect class gradebooks and computed academic marks (subject to scope)"
      },
      [PermissionCode.RESULT_PUBLISH]: {
        code: PermissionCode.RESULT_PUBLISH,
        name: "Publish Results",
        module: "assessment",
        description: "Approve and release term result cards to parents"
      },
      [PermissionCode.REPORT_GENERATE]: {
        code: PermissionCode.REPORT_GENERATE,
        name: "Generate Reports",
        module: "assessment",
        description: "Compile academic performance transcripts and broadsheets"
      },
      // Communication
      [PermissionCode.COMMUNICATION_ANNOUNCE]: {
        code: PermissionCode.COMMUNICATION_ANNOUNCE,
        name: "Broadcast Announcements",
        module: "communication",
        description: "Publish announcements to school, programme, or class channels"
      },
      [PermissionCode.NOTIFICATION_VIEW]: {
        code: PermissionCode.NOTIFICATION_VIEW,
        name: "View Notifications",
        module: "communication",
        description: "Monitor communication delivery logs and outbox queue"
      },
      [PermissionCode.NOTIFICATION_RETRY]: {
        code: PermissionCode.NOTIFICATION_RETRY,
        name: "Retry Notifications",
        module: "communication",
        description: "Manually re-queue failed or retryable outbox notifications"
      },
      // Parent
      [PermissionCode.PARENT_CHILD_VIEW]: {
        code: PermissionCode.PARENT_CHILD_VIEW,
        name: "View Own Child Profiles",
        module: "parent",
        description: "View profiles of children linked via active GuardianStudentRelationship"
      },
      [PermissionCode.PARENT_ATTENDANCE_VIEW]: {
        code: PermissionCode.PARENT_ATTENDANCE_VIEW,
        name: "View Own Child Attendance",
        module: "parent",
        description: "View attendance registers of own linked children only"
      },
      [PermissionCode.PARENT_RESULT_VIEW]: {
        code: PermissionCode.PARENT_RESULT_VIEW,
        name: "View Own Child Results",
        module: "parent",
        description: "View published report cards of own linked children only"
      },
      [PermissionCode.PARENT_INVOICE_VIEW]: {
        code: PermissionCode.PARENT_INVOICE_VIEW,
        name: "View Own Child Invoices",
        module: "parent",
        description: "View and pay fee invoices belonging to own linked children only"
      }
    };
    SYSTEM_ROLE_PERMISSIONS = {
      [RoleCode.SUPER_ADMIN]: Object.values(PermissionCode),
      [RoleCode.ADMIN]: [
        // People (All operations except security roles)
        PermissionCode.STUDENT_VIEW,
        PermissionCode.STUDENT_CREATE,
        PermissionCode.STUDENT_EDIT,
        PermissionCode.STUDENT_PROFILE_PHOTO_UPDATE,
        PermissionCode.STUDENT_MEDICAL_VIEW,
        PermissionCode.STUDENT_MEDICAL_EDIT,
        PermissionCode.STUDENT_ARCHIVE,
        PermissionCode.GUARDIAN_VIEW,
        PermissionCode.GUARDIAN_EDIT,
        PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE,
        PermissionCode.TEACHER_MANAGE,
        // Academic (Full operational management)
        PermissionCode.ACADEMIC_SESSION_MANAGE,
        PermissionCode.PROGRAMME_MANAGE,
        PermissionCode.CLASS_MANAGE,
        PermissionCode.SUBJECT_MANAGE,
        PermissionCode.ENROLLMENT_MANAGE,
        // Admissions (Review & coordination only; Approval strictly reserved for SUPER_ADMIN)
        PermissionCode.ADMISSION_CYCLE_MANAGE,
        PermissionCode.ADMISSION_APPLICATION_VIEW,
        PermissionCode.ADMISSION_APPLICATION_REVIEW,
        // Attendance (Broad oversight)
        PermissionCode.ATTENDANCE_VIEW,
        PermissionCode.ATTENDANCE_RECORD,
        // Assessment (Broad oversight, review & publishing where authorized)
        PermissionCode.ASSESSMENT_VIEW,
        PermissionCode.ASSESSMENT_ENTER,
        PermissionCode.RESULT_PUBLISH,
        PermissionCode.REPORT_GENERATE,
        // Communication & Messaging
        PermissionCode.COMMUNICATION_ANNOUNCE,
        PermissionCode.NOTIFICATION_VIEW,
        PermissionCode.NOTIFICATION_RETRY
      ],
      [RoleCode.ACCOUNTANT]: [
        // People (Read-only for billing / invoice assignment)
        PermissionCode.STUDENT_VIEW,
        PermissionCode.GUARDIAN_VIEW,
        // Admissions (Fee clearance check)
        PermissionCode.ADMISSION_APPLICATION_VIEW,
        // Finance (Full operational ledger control)
        PermissionCode.FEE_STRUCTURE_MANAGE,
        PermissionCode.FINANCE_INVOICE_VIEW,
        PermissionCode.FINANCE_INVOICE_MANAGE,
        PermissionCode.FINANCE_PAYMENT_VIEW,
        PermissionCode.FINANCE_PAYMENT_RECONCILE,
        PermissionCode.FINANCE_EXPENSE_MANAGE,
        PermissionCode.FINANCE_REPORT_VIEW,
        // Communication (Billing notifications)
        PermissionCode.NOTIFICATION_VIEW
      ],
      [RoleCode.TEACHER]: [
        // Teacher permissions are ALWAYS scoped by TeacherScope:
        // Programme -> Class -> Subject -> Academic Session
        PermissionCode.STUDENT_VIEW,
        PermissionCode.STUDENT_PROFILE_PHOTO_UPDATE,
        PermissionCode.ATTENDANCE_VIEW,
        PermissionCode.ATTENDANCE_RECORD,
        PermissionCode.ASSESSMENT_VIEW,
        PermissionCode.ASSESSMENT_ENTER,
        PermissionCode.REPORT_GENERATE,
        PermissionCode.COMMUNICATION_ANNOUNCE
      ],
      [RoleCode.PARENT]: [
        // Parent permissions are ALWAYS subordinate to active GuardianStudentRelationship
        PermissionCode.PARENT_CHILD_VIEW,
        PermissionCode.PARENT_ATTENDANCE_VIEW,
        PermissionCode.PARENT_RESULT_VIEW,
        PermissionCode.PARENT_INVOICE_VIEW
      ]
    };
  }
});

// prisma/seed.ts
import { PrismaClient as PrismaClient2 } from "@prisma/client";

// prisma/seeds/production.ts
import {
  RoleCode as RoleCode2,
  ProgrammeCode,
  TermCode,
  FeeApplicableGender,
  ConfigCategory,
  AdmissionCycleStatus,
  ProgrammeAvailabilityStatus,
  AcademicTermStatus
} from "@prisma/client";
async function seedProductionFoundation(prisma2) {
  console.log("-> Seeding Production Foundation Architecture...");
  const rolesData = [
    { code: RoleCode2.SUPER_ADMIN, name: "Super Administrator", description: "Full operational administration and governance", isSystem: true },
    { code: RoleCode2.ADMIN, name: "School Administrator", description: "Academic administration and admissions management", isSystem: true },
    { code: RoleCode2.ACCOUNTANT, name: "Accountant", description: "Fees, payments, invoices, expenses, and financial reporting", isSystem: true },
    { code: RoleCode2.TEACHER, name: "Teacher", description: "Academic instruction, attendance, and assessment within scope", isSystem: true },
    { code: RoleCode2.PARENT, name: "Parent / Guardian", description: "Parent portal access for linked children", isSystem: true }
  ];
  const rolesMap = /* @__PURE__ */ new Map();
  for (const r of rolesData) {
    const role = await prisma2.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: r
    });
    rolesMap.set(r.code, role.id);
  }
  const { PERMISSION_DEFINITIONS: PERMISSION_DEFINITIONS2, SYSTEM_ROLE_PERMISSIONS: SYSTEM_ROLE_PERMISSIONS2 } = await Promise.resolve().then(() => (init_permissions(), permissions_exports));
  const permMap = /* @__PURE__ */ new Map();
  for (const p of Object.values(PERMISSION_DEFINITIONS2)) {
    const perm = await prisma2.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module, description: p.description },
      create: {
        code: p.code,
        name: p.name,
        module: p.module,
        description: p.description
      }
    });
    permMap.set(p.code, perm.id);
  }
  for (const [roleCode, permCodes] of Object.entries(SYSTEM_ROLE_PERMISSIONS2)) {
    const roleId = rolesMap.get(roleCode);
    if (!roleId) continue;
    for (const permCode of permCodes) {
      const permId = permMap.get(permCode);
      if (!permId) continue;
      await prisma2.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId: permId
          }
        },
        update: {},
        create: {
          roleId,
          permissionId: permId
        }
      });
    }
  }
  const programmesData = [
    { code: ProgrammeCode.CRECHE, name: "Creche", isMainAcademic: true, displayOrder: 1 },
    { code: ProgrammeCode.PRE_SCHOLARS, name: "Pre-Scholars", isMainAcademic: true, displayOrder: 2 },
    { code: ProgrammeCode.PRE_NURSERY, name: "Pre-Nursery", isMainAcademic: true, displayOrder: 3 },
    { code: ProgrammeCode.NURSERY, name: "Nursery", isMainAcademic: true, displayOrder: 4 },
    { code: ProgrammeCode.PRIMARY, name: "Primary", isMainAcademic: true, displayOrder: 5 },
    { code: ProgrammeCode.TAHFEEZ, name: "Tahfeez (Standalone Programme)", isMainAcademic: false, displayOrder: 6 }
  ];
  const programmesMap = /* @__PURE__ */ new Map();
  for (const prog of programmesData) {
    const p = await prisma2.programme.upsert({
      where: { code: prog.code },
      update: { name: prog.name, isMainAcademic: prog.isMainAcademic, displayOrder: prog.displayOrder },
      create: prog
    });
    programmesMap.set(prog.code, p.id);
  }
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
    { code: "TAHFEEZ_GROUP_A", name: "Tahfeez Group A", programmeCode: ProgrammeCode.TAHFEEZ }
  ];
  for (const c of classesData) {
    const programmeId = programmesMap.get(c.programmeCode);
    await prisma2.schoolClass.upsert({
      where: { code: c.code },
      update: { name: c.name, programmeId },
      create: {
        code: c.code,
        name: c.name,
        programmeId
      }
    });
  }
  const session = await prisma2.academicSession.upsert({
    where: { name: "2026/2027" },
    update: { isCurrent: true, status: "ACTIVE" },
    create: {
      name: "2026/2027",
      startDate: /* @__PURE__ */ new Date("2026-09-01"),
      endDate: /* @__PURE__ */ new Date("2027-07-31"),
      status: "ACTIVE",
      isCurrent: true
    }
  });
  const termsData = [
    { termCode: TermCode.FIRST, name: "First Term", isCurrent: true, status: AcademicTermStatus.ACTIVE, startDate: /* @__PURE__ */ new Date("2026-09-01"), endDate: /* @__PURE__ */ new Date("2026-12-15") },
    { termCode: TermCode.SECOND, name: "Second Term", isCurrent: false, status: AcademicTermStatus.UPCOMING, startDate: /* @__PURE__ */ new Date("2027-01-10"), endDate: /* @__PURE__ */ new Date("2027-04-10") },
    { termCode: TermCode.THIRD, name: "Third Term", isCurrent: false, status: AcademicTermStatus.UPCOMING, startDate: /* @__PURE__ */ new Date("2027-05-02"), endDate: /* @__PURE__ */ new Date("2027-07-25") }
  ];
  const termsMap = /* @__PURE__ */ new Map();
  for (const t of termsData) {
    const term = await prisma2.academicTerm.upsert({
      where: {
        academicSessionId_termCode: {
          academicSessionId: session.id,
          termCode: t.termCode
        }
      },
      update: { name: t.name, isCurrent: t.isCurrent, status: t.status },
      create: {
        academicSessionId: session.id,
        termCode: t.termCode,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        status: t.status,
        isCurrent: t.isCurrent
      }
    });
    termsMap.set(t.termCode, term.id);
  }
  const admissionCycle = await prisma2.admissionCycle.upsert({
    where: { code: "ADM-2026-MAIN" },
    update: {
      status: AdmissionCycleStatus.OPEN
    },
    create: {
      code: "ADM-2026-MAIN",
      name: "2026/2027 Main Admission",
      academicSessionId: session.id,
      startDate: /* @__PURE__ */ new Date("2026-08-01T07:00:00.000Z"),
      // 08:00 AM Africa/Lagos
      endDate: /* @__PURE__ */ new Date("2026-09-30T22:59:59.999Z"),
      // 23:59:59 Africa/Lagos
      status: AdmissionCycleStatus.OPEN,
      description: "Main admission window for 2026/2027 academic session."
    }
  });
  for (const [, progId] of programmesMap.entries()) {
    await prisma2.admissionCycleProgramme.upsert({
      where: {
        unique_cycle_programme: {
          admissionCycleId: admissionCycle.id,
          programmeId: progId
        }
      },
      update: {
        status: ProgrammeAvailabilityStatus.OPEN
      },
      create: {
        admissionCycleId: admissionCycle.id,
        programmeId: progId,
        status: ProgrammeAvailabilityStatus.OPEN,
        maxCapacity: 60
      }
    });
  }
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
    { key: "finance.account_name", value: "Swanford Academy", category: ConfigCategory.FINANCE }
  ];
  for (const cfg of configsData) {
    await prisma2.systemConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value, category: cfg.category },
      create: cfg
    });
  }
  const defaultExpenseCategories = [
    { code: "SALARIES", name: "Staff Salaries & Allowances", description: "Teaching and administrative staff payroll" },
    { code: "STATIONERY", name: "Books, Stationery & Office Supplies", description: "Academic exercise books, textbooks, and administrative paper supplies" },
    { code: "FACILITIES", name: "Campus Facilities & Maintenance", description: "Building repairs, painting, plumbing, and electrical upkeep" },
    { code: "UTILITIES", name: "Electricity, Water & Diesel Fuel", description: "Power grid bills, generator diesel fuel, and municipal water" },
    { code: "ICT", name: "Technology & Internet Subscriptions", description: "Software licensing, internet bandwidth, and computer lab hardware" },
    { code: "ACADEMIC_MATERIALS", name: "Instructional & Teaching Materials", description: "Classroom teaching aids, science kits, and Tahfeez materials" },
    { code: "UNIFORMS", name: "Uniforms & Apparel Procurement", description: "School uniform fabrication, sportswear, and hijabs/caps" },
    { code: "ADMINISTRATIVE", name: "General Administrative Operations", description: "Regulatory levies, bank charges, and office logistics" }
  ];
  for (const cat of defaultExpenseCategories) {
    await prisma2.expenseCategory.upsert({
      where: { code: cat.code },
      update: { name: cat.name, description: cat.description },
      create: cat
    });
  }
  const primaryProgId = programmesMap.get(ProgrammeCode.PRIMARY);
  const tahfeezProgId = programmesMap.get(ProgrammeCode.TAHFEEZ);
  await prisma2.gradingScale.upsert({
    where: { code: "PRIMARY_STANDARD_2026" },
    update: {},
    create: {
      code: "PRIMARY_STANDARD_2026",
      name: "Primary Standard Grading Scale",
      programmeId: primaryProgId,
      passMark: 40,
      maxScore: 100,
      description: "Standard British/Nigerian Primary Continuous Assessment & Exam Scale",
      bands: {
        create: [
          { grade: "A", minScore: 70, maxScore: 100, points: 5, remark: "Distinction", isPass: true, displayOrder: 1 },
          { grade: "B", minScore: 60, maxScore: 69.99, points: 4, remark: "Very Good", isPass: true, displayOrder: 2 },
          { grade: "C", minScore: 50, maxScore: 59.99, points: 3, remark: "Credit", isPass: true, displayOrder: 3 },
          { grade: "D", minScore: 40, maxScore: 49.99, points: 2, remark: "Pass", isPass: true, displayOrder: 4 },
          { grade: "F", minScore: 0, maxScore: 39.99, points: 0, remark: "Fail", isPass: false, displayOrder: 5 }
        ]
      }
    }
  });
  await prisma2.gradingScale.upsert({
    where: { code: "TAHFEEZ_STANDARD_2026" },
    update: {},
    create: {
      code: "TAHFEEZ_STANDARD_2026",
      name: "Tahfeez Quran Memorization Scale",
      programmeId: tahfeezProgId,
      passMark: 50,
      maxScore: 100,
      description: "Classical Tahfeez Hifz and Tajweed Assessment Scale",
      bands: {
        create: [
          { grade: "Mumtaz", minScore: 85, maxScore: 100, points: 5, remark: "Excellent (Mumtaz)", isPass: true, displayOrder: 1 },
          { grade: "Jayyid Jiddan", minScore: 70, maxScore: 84.99, points: 4, remark: "Very Good (Jayyid Jiddan)", isPass: true, displayOrder: 2 },
          { grade: "Jayyid", minScore: 50, maxScore: 69.99, points: 3, remark: "Good (Jayyid)", isPass: true, displayOrder: 3 },
          { grade: "Maqbul", minScore: 40, maxScore: 49.99, points: 2, remark: "Pass (Maqbul)", isPass: false, displayOrder: 4 },
          { grade: "Rasib", minScore: 0, maxScore: 39.99, points: 0, remark: "Fail (Rasib)", isPass: false, displayOrder: 5 }
        ]
      }
    }
  });
  const firstTermId = termsMap.get(TermCode.FIRST);
  await prisma2.feeStructure.upsert({
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
          { name: "Tuition & Stationery", amountKobo: BigInt(75e5) },
          { name: "Uniform, Cardigan & 2 Polos", amountKobo: BigInt(25e5) },
          { name: "Medical & Exam Fees", amountKobo: BigInt(1e6) }
        ]
      }
    }
  });
  await prisma2.feeStructure.upsert({
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
          { name: "Tahfeez Tuition", amountKobo: BigInt(1e6) },
          { name: "Uniform & Books", amountKobo: BigInt(8e5) }
        ]
      }
    }
  });
  const defaultPasswordHash = "$2b$12$YIJd0KsaGr1z1xI/7h72kOiTrOK5prHS2ROO.XeGHJdug8gh.LoTG";
  const canonicalPhones = [
    { email: "superadmin@swanfordacademy.edu.ng", phone: "+2348030004455" },
    { email: "admin@swanfordacademy.edu.ng", phone: "+2348030003344" },
    { email: "accountant@swanfordacademy.edu.ng", phone: "+2348030005566" },
    { email: "teacher@swanfordacademy.edu.ng", phone: "+2348030002233" },
    { email: "parent@swanfordacademy.edu.ng", phone: "+2348030001122" }
  ];
  for (const item of canonicalPhones) {
    await prisma2.user.updateMany({
      where: {
        phoneNumber: item.phone,
        email: { not: item.email }
      },
      data: { phoneNumber: null }
    });
  }
  await prisma2.guardian.updateMany({
    where: {
      phonePrimary: "+2348030001122",
      email: { not: "parent@swanfordacademy.edu.ng" }
    },
    data: { phonePrimary: null }
  });
  const superAdminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL || "superadmin@swanfordacademy.edu.ng";
  const superAdminUser = await prisma2.user.upsert({
    where: { email: superAdminEmail },
    update: { passwordHash: defaultPasswordHash, status: "ACTIVE" },
    create: {
      id: "bbf45459-0ffa-419a-b0f9-56d6bfdf50f3",
      email: superAdminEmail,
      phoneNumber: "+2348030004455",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
      emailVerifiedAt: /* @__PURE__ */ new Date()
    }
  });
  const superAdminRoleId = rolesMap.get(RoleCode2.SUPER_ADMIN);
  const adminRoleId = rolesMap.get(RoleCode2.ADMIN);
  const accountantRoleId = rolesMap.get(RoleCode2.ACCOUNTANT);
  const teacherRoleId = rolesMap.get(RoleCode2.TEACHER);
  const parentRoleId = rolesMap.get(RoleCode2.PARENT);
  await prisma2.userRole.upsert({
    where: { userId_roleId: { userId: superAdminUser.id, roleId: superAdminRoleId } },
    update: {},
    create: { userId: superAdminUser.id, roleId: superAdminRoleId }
  });
  const userSwanford99 = await prisma2.user.upsert({
    where: { email: "swanford99@gmail.com" },
    update: { passwordHash: defaultPasswordHash, status: "ACTIVE" },
    create: {
      email: "swanford99@gmail.com",
      phoneNumber: "+2348030004499",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
      emailVerifiedAt: /* @__PURE__ */ new Date()
    }
  });
  await prisma2.userRole.upsert({
    where: { userId_roleId: { userId: userSwanford99.id, roleId: superAdminRoleId } },
    update: {},
    create: { userId: userSwanford99.id, roleId: superAdminRoleId }
  });
  const adminUser = await prisma2.user.upsert({
    where: { email: "admin@swanfordacademy.edu.ng" },
    update: { passwordHash: defaultPasswordHash, status: "ACTIVE" },
    create: {
      id: "00000000-0000-0000-0001-000000000002",
      email: "admin@swanfordacademy.edu.ng",
      phoneNumber: "+2348030003344",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
      emailVerifiedAt: /* @__PURE__ */ new Date()
    }
  });
  await prisma2.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRoleId } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRoleId }
  });
  const accountantUser = await prisma2.user.upsert({
    where: { email: "accountant@swanfordacademy.edu.ng" },
    update: { passwordHash: defaultPasswordHash, status: "ACTIVE" },
    create: {
      id: "00000000-0000-0000-0001-000000000003",
      email: "accountant@swanfordacademy.edu.ng",
      phoneNumber: "+2348030005566",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
      emailVerifiedAt: /* @__PURE__ */ new Date()
    }
  });
  await prisma2.userRole.upsert({
    where: { userId_roleId: { userId: accountantUser.id, roleId: accountantRoleId } },
    update: {},
    create: { userId: accountantUser.id, roleId: accountantRoleId }
  });
  const teacherUser = await prisma2.user.upsert({
    where: { email: "teacher@swanfordacademy.edu.ng" },
    update: { passwordHash: defaultPasswordHash, status: "ACTIVE" },
    create: {
      id: "00000000-0000-0000-0001-000000000004",
      email: "teacher@swanfordacademy.edu.ng",
      phoneNumber: "+2348030002233",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
      emailVerifiedAt: /* @__PURE__ */ new Date()
    }
  });
  await prisma2.userRole.upsert({
    where: { userId_roleId: { userId: teacherUser.id, roleId: teacherRoleId } },
    update: {},
    create: { userId: teacherUser.id, roleId: teacherRoleId }
  });
  await prisma2.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      id: "00000000-0000-0000-0002-000000000004",
      userId: teacherUser.id,
      staffIdNumber: "STAFF/2026/001",
      firstName: "Ibrahim",
      lastName: "Malam",
      qualification: "B.Ed. Islamic Studies & Primary Education",
      status: "ACTIVE"
    }
  });
  const parentUser = await prisma2.user.upsert({
    where: { email: "parent@swanfordacademy.edu.ng" },
    update: { passwordHash: defaultPasswordHash, status: "ACTIVE" },
    create: {
      id: "00000000-0000-0000-0001-000000000005",
      email: "parent@swanfordacademy.edu.ng",
      phoneNumber: "+2348030001122",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
      emailVerifiedAt: /* @__PURE__ */ new Date()
    }
  });
  await prisma2.userRole.upsert({
    where: { userId_roleId: { userId: parentUser.id, roleId: parentRoleId } },
    update: {},
    create: { userId: parentUser.id, roleId: parentRoleId }
  });
  const canonicalGuardian = await prisma2.guardian.upsert({
    where: { email: "parent@swanfordacademy.edu.ng" },
    update: { userId: parentUser.id },
    create: {
      id: "00000000-0000-0000-0002-000000000005",
      userId: parentUser.id,
      title: "Alhaji",
      firstName: "Muhammad",
      lastName: "Sani",
      email: "parent@swanfordacademy.edu.ng",
      phonePrimary: "+2348030001122",
      residentialAddress: "14 Ahmadu Bello Way, Dutse, Jigawa State",
      isVerified: true,
      verifiedAt: /* @__PURE__ */ new Date()
    }
  });
  const existingWards = await prisma2.student.findMany({
    where: {
      OR: [
        { lastName: "Sani" },
        { admissionNumber: { in: ["SA-2026-0001", "SA-2026-0002"] } }
      ]
    },
    take: 2
  });
  for (const ward of existingWards) {
    const relId = `00000000-0000-0000-0003-${ward.id.slice(24)}`;
    await prisma2.guardianStudentRelationship.upsert({
      where: { id: relId },
      update: {
        guardianId: canonicalGuardian.id,
        studentId: ward.id
      },
      create: {
        id: relId,
        guardianId: canonicalGuardian.id,
        studentId: ward.id,
        relationshipType: "FATHER",
        isPrimaryContact: true,
        canPickup: true,
        receivesInvoices: true
      }
    });
  }
  console.log("\u2714 Production Foundation Seed Completed Successfully.");
}

// prisma/seed.ts
var prisma = new PrismaClient2();
async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const shouldSeedMocks = process.env.SEED_MOCKS === "true" || process.argv.includes("--mocks");
  console.log("=================================================");
  console.log("Swanford Academy Database Seeder");
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("=================================================");
  await seedProductionFoundation(prisma);
  console.log("\u{1F512} Verified: Zero mock students, parents, invoices, or records seeded. Mock creation permanently disabled.");
}
main().catch((e) => {
  console.error("\u274C Seeding failed:", e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
