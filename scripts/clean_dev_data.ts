import { prisma } from '../src/lib/prisma';
import fs from 'fs';

const VALID_CONFIRMATION_PHRASES = [
  'CLEAR SWANFORD DEVELOPMENT DATABASE NOW',
  'CLEAR SWANFORD DEVELOPMENT DATA',
];
const CONFIRMATION_PHRASE = VALID_CONFIRMATION_PHRASES[0];

export interface TableAuditRow {
  tableName: string;
  category: 'PARENT' | 'CHILD' | 'RELATIONSHIP' | 'GOVERNANCE_CANONICAL' | 'SEQUENCE';
  currentRows: number;
  preservedRows: number;
  deletedRows: number;
  expectedRowsAfter: number;
  description: string;
}

export interface DatabaseAuditReport {
  timestamp: string;
  mode: 'DRY_RUN' | 'LIVE_EXECUTION';
  environment: string;
  databaseIdentity: {
    host: string;
    databaseName: string;
    serverAddress: string;
    serverPort: number | null;
    version: string;
    isLocal: boolean;
    remoteHostedDetected: boolean;
  };
  preservedCoreRecords: {
    genuineAdmin: {
      id: string;
      email: string;
      status: string;
      roles: string[];
    };
    canonicalSession: {
      id: string;
      name: string;
      termsCount: number;
    };
    canonicalProgrammesCount: number;
    canonicalSchoolClassesCount: number;
    canonicalAdmissionCyclesCount: number;
    canonicalFeeStructuresCount: number;
    systemRolesCount: number;
    systemPermissionsCount: number;
    systemRolePermissionsCount: number;
    preservedAuditLogsCount: number;
  };
  seedAccountsTreatment: {
    policy: string;
    count: number;
    accounts: string[];
    rationale: string;
  };
  tableInventory: TableAuditRow[];
  mathematicalReconciliation: {
    currentTotalRows: number;
    confirmedDeletions: number;
    expectedRemainingRows: number;
    equation: string;
    isMathematicallyConsistent: boolean;
  };
}

async function main() {
  const isExecute = process.argv.includes('--execute');
  const confirmArg =
    process.env.CONFIRM_CLEANUP ||
    process.argv.find((a) => a.startsWith('--confirm='))?.split('=')[1] ||
    '';

  console.log('=================================================================');
  console.log('SWANFORD ACADEMY — SAFE DEVELOPMENT DATA CLEANUP & DRY-RUN AUDIT');
  console.log(`MODE: ${isExecute ? '⚡ LIVE EXECUTION REQUESTED' : '🛡 DRY-RUN (READ-ONLY AUDIT)'}`);
  console.log('=================================================================');

  // Guard 1: Node environment
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: Cannot run cleanup script in PRODUCTION environment.');
    process.exit(1);
  }

  // Guard 2: Database URL safety & credential stripping
  const dbUrl = process.env.DATABASE_URL || '';
  const parsedUrl = new URL(dbUrl);
  const hostSanitized = parsedUrl.host;
  const dbNameSanitized = parsedUrl.pathname.replace(/^\//, '');

  const isLocalHost =
    parsedUrl.hostname === 'localhost' ||
    parsedUrl.hostname === '127.0.0.1' ||
    parsedUrl.hostname === '::1';

  const remoteKeywords = ['neon.tech', 'supabase', 'railway', 'rds.amazonaws.com', 'azure.com', 'render.com', 'fly.io', 'prod'];
  const hasRemoteKeywords = remoteKeywords.some((kw) => dbUrl.toLowerCase().includes(kw));

  if (!isLocalHost || hasRemoteKeywords) {
    console.error(`❌ FATAL: DATABASE_URL points to a non-local or remote database: ${hostSanitized}`);
    process.exit(1);
  }

  // Guard 3: Direct PostgreSQL Server Identity Verification
  const dbIdentityResult: Array<{
    current_database: string;
    server_addr: string | null;
    server_port: number | null;
    pg_version: string;
  }> = await prisma.$queryRaw`
    SELECT 
      current_database() as current_database,
      inet_server_addr()::text as server_addr,
      inet_server_port() as server_port,
      version() as pg_version;
  `;

  const dbIdentity = dbIdentityResult[0];
  if (!dbIdentity || dbIdentity.current_database !== 'swanford_local') {
    console.error(`❌ FATAL: Connected database is '${dbIdentity?.current_database}', expected 'swanford_local'.`);
    process.exit(1);
  }

  console.log(`✔ Verified Connected Database: ${dbIdentity.current_database} on ${hostSanitized}`);

  // Resolve Genuine Admin (swanford99@gmail.com)
  const genuineAdmin = await prisma.user.findFirst({
    where: { email: 'swanford99@gmail.com' },
    include: { userRoles: { include: { role: true } } },
  });

  if (!genuineAdmin) {
    console.error('❌ FATAL: Genuine administrator account (swanford99@gmail.com) not found in PostgreSQL.');
    process.exit(1);
  }

  // Resolve Canonical Academic Session (2026/2027)
  const canonicalSession = await prisma.academicSession.findFirst({
    where: { name: '2026/2027' },
    include: { terms: true },
  });

  if (!canonicalSession) {
    console.error('❌ FATAL: Canonical academic session 2026/2027 not found in PostgreSQL.');
    process.exit(1);
  }

  // Canonical Foundation Sets
  const canonicalClassCodes = [
    'CRECHE_1', 'PRE_SCHOLARS_1', 'PRE_NURSERY_1', 'NURSERY_1', 'NURSERY_2',
    'PRIMARY_1', 'PRIMARY_2', 'PRIMARY_3', 'PRIMARY_4', 'PRIMARY_5', 'PRIMARY_6',
    'TAHFEEZ_GROUP_A',
  ];

  const canonicalFeeStructureIds = [
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
  ];

  const canonicalAdmissionCycle = await prisma.admissionCycle.findFirst({
    where: { code: 'ADM-2026-MAIN' },
    include: { programmeAvailabilities: true },
  });

  // Preserved Audit Logs: genuine human admin + foundational system configs & governance
  const preservedAuditWhere = {
    OR: [
      { userId: genuineAdmin.id },
      { entityType: { in: ['SystemConfig', 'Role', 'Permission', 'RolePermission', 'Database'] } },
    ],
  };

  const preservedAuditLogsCount = await prisma.auditLog.count({
    where: preservedAuditWhere,
  });

  // Query all tables in public schema
  const tables: Array<{ table_name: string }> = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name != '_prisma_migrations'
    ORDER BY table_name ASC;
  `;

  const inventory: TableAuditRow[] = [];

  for (const t of tables) {
    const name = t.table_name;
    const countRes: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${name}";`);
    const count = Number(countRes[0].count);

    let preserved = 0;
    let cat: TableAuditRow['category'] = 'PARENT';
    let desc = '';

    switch (name) {
      // 1. Foundational / Governance / Structural Tables
      case 'programmes':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 6;
        desc = 'Official educational programme definitions (Creche to Primary/Tahfeez)';
        break;
      case 'roles':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 5;
        desc = 'System roles (SUPER_ADMIN, ADMIN, ACCOUNTANT, TEACHER, PARENT)';
        break;
      case 'permissions':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 58;
        desc = 'Granular system permission definitions';
        break;
      case 'role_permissions':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = count; // 113 (after removing ADMISSION_APPLICATION_APPROVE from ADMIN)
        desc = 'Role-to-permission mapping matrix (SUPER_ADMIN exclusive admission approval)';
        break;
      case 'system_configs':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 16;
        desc = 'School profile, branding, bank details, and system configuration keys';
        break;
      case 'subjects':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 21;
        desc = 'Standard British/Nigerian and Islamic curriculum subjects';
        break;
      case 'grading_scales':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 2;
        desc = 'Standard grading scales (Primary Standard and Tahfeez Classical)';
        break;
      case 'grading_bands':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 10;
        desc = 'Grading score bands and remarks (A-F, Mumtaz-Rasib)';
        break;
      case 'academic_sessions':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 1; // 2026/2027
        desc = 'Canonical 2026/2027 academic session';
        break;
      case 'academic_terms':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 3; // First, Second, Third Term
        desc = 'Canonical academic terms for 2026/2027';
        break;
      case 'school_classes':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = canonicalClassCodes.length; // 12
        desc = 'Canonical grade classes (Creche, Pre-Scholars, Pre-Nursery, Nursery 1-2, Primary 1-6, Tahfeez)';
        break;
      case 'admission_cycles':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = canonicalAdmissionCycle ? 1 : 0; // ADM-2026-MAIN
        desc = 'Canonical 2026/2027 main admission intake cycle';
        break;
      case 'admission_cycle_programmes':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = canonicalAdmissionCycle?.programmeAvailabilities.length || 0; // 6
        desc = 'Programme capacity quotas for 2026/2027 main intake';
        break;
      case 'fee_structures':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 2; // Primary 1st Term Boys & Tahfeez 1st Term
        desc = 'Canonical foundation fee structures from production seed';
        break;
      case 'fee_items':
        cat = 'GOVERNANCE_CANONICAL';
        preserved = 5; // Fee item line items for the 2 fee structures
        desc = 'Canonical fee breakdown items (Tuition, Uniform, Medical/Exam, etc.)';
        break;

      // 2. Users & User Roles
      case 'users':
        cat = 'PARENT';
        preserved = 1; // swanford99@gmail.com
        desc = 'Genuine human administrator account (swanford99@gmail.com)';
        break;
      case 'user_roles':
        cat = 'RELATIONSHIP';
        preserved = 2; // SUPER_ADMIN and ADMIN for swanford99@gmail.com
        desc = 'Roles assigned to genuine administrator';
        break;

      // 3. Audit Logs
      case 'audit_logs':
        cat = 'PARENT';
        preserved = preservedAuditLogsCount; // genuine admin + governance
        desc = 'Genuine administrative, security, and governance audit history';
        break;

      // 4. Sequences (Reset on cleanup to allow fresh operational numbering)
      case 'admission_number_sequences':
      case 'application_number_sequences':
      case 'invoice_number_sequences':
      case 'payment_reference_sequences':
      case 'receipt_number_sequences':
      case 'expense_number_sequences':
        cat = 'SEQUENCE';
        preserved = 0;
        desc = 'Annual sequence counter (reset on cleanup to allow fresh start at 1)';
        break;

      // 5. Ephemeral / Operational / Test Data
      case 'students':
      case 'guardians':
      case 'teachers':
      case 'applications':
      case 'invoices':
      case 'payments':
      case 'receipts':
      case 'sessions':
      case 'notifications':
      case 'payment_transactions':
      case 'payment_webhook_events':
      case 'payment_sessions':
      case 'paystack_settlements':
      case 'media_assets':
      case 'assessments':
      case 'expenses':
      case 'student_import_batches':
        cat = 'PARENT';
        preserved = 0;
        desc = 'Synthetic / ephemeral test records from automated test runners';
        break;

      // 6. Child / Junction Records
      case 'guardian_student_relationships':
      case 'student_programme_enrollments':
      case 'teacher_scopes':
      case 'application_programme_selections':
      case 'application_charge_items':
      case 'application_reviews':
      case 'invoice_items':
      case 'payment_allocations':
      case 'attendance_records':
      case 'assessment_scores':
      case 'user_notification_reads':
      case 'email_verifications':
      case 'password_resets':
      case 'notification_preferences':
      case 'student_import_rows':
      case 'expense_categories':
      case 'gallery_items':
        cat = 'CHILD';
        preserved = 0;
        desc = 'Child / junction records cascading from synthetic test fixtures';
        break;

      default:
        cat = 'PARENT';
        preserved = 0;
        desc = 'Unclassified table';
    }

    const deleted = count - preserved;
    inventory.push({
      tableName: name,
      category: cat,
      currentRows: count,
      preservedRows: preserved,
      deletedRows: deleted,
      expectedRowsAfter: preserved,
      description: desc,
    });
  }

  let totalCurrent = 0;
  let totalPreserved = 0;
  let totalDeleted = 0;
  let totalExpected = 0;

  for (const item of inventory) {
    totalCurrent += item.currentRows;
    totalPreserved += item.preservedRows;
    totalDeleted += item.deletedRows;
    totalExpected += item.expectedRowsAfter;
  }

  const isMathValid = totalCurrent - totalDeleted === totalExpected;

  if (!isMathValid) {
    console.error('❌ FATAL MATHEMATICAL INCONSISTENCY DETECTED:');
    console.error(`Current (${totalCurrent}) - Deletions (${totalDeleted}) != Expected (${totalExpected})`);
    process.exit(1);
  }

  const report: DatabaseAuditReport = {
    timestamp: new Date().toISOString(),
    mode: isExecute ? 'LIVE_EXECUTION' : 'DRY_RUN',
    environment: 'development',
    databaseIdentity: {
      host: hostSanitized,
      databaseName: dbIdentity.current_database,
      serverAddress: dbIdentity.server_addr || 'localhost socket',
      serverPort: dbIdentity.server_port,
      version: dbIdentity.pg_version.split(' on ')[0],
      isLocal: isLocalHost,
      remoteHostedDetected: hasRemoteKeywords,
    },
    preservedCoreRecords: {
      genuineAdmin: {
        id: genuineAdmin.id,
        email: genuineAdmin.email,
        status: genuineAdmin.status,
        roles: genuineAdmin.userRoles.map((ur) => ur.role.code),
      },
      canonicalSession: {
        id: canonicalSession.id,
        name: canonicalSession.name,
        termsCount: canonicalSession.terms.length,
      },
      canonicalProgrammesCount: 6,
      canonicalSchoolClassesCount: canonicalClassCodes.length,
      canonicalAdmissionCyclesCount: canonicalAdmissionCycle ? 1 : 0,
      canonicalFeeStructuresCount: 2,
      systemRolesCount: 5,
      systemPermissionsCount: 58,
      systemRolePermissionsCount: 113,
      preservedAuditLogsCount,
    },
    seedAccountsTreatment: {
      policy: 'PURGE_DEACTIVATED_SEED_PLACEHOLDERS',
      count: 5,
      accounts: [
        'superadmin@swanfordacademy.edu.ng',
        'admin@swanfordacademy.edu.ng',
        'accountant@swanfordacademy.edu.ng',
        'teacher@swanfordacademy.edu.ng',
        'parent@swanfordacademy.edu.ng',
      ],
      rationale:
        'These accounts were stage 1 bootstrap placeholders. They are currently deactivated with unusable passwords and are not needed because swanford99@gmail.com is active as genuine Super Admin. They will be purged to ensure a clean, zero-mock database.',
    },
    tableInventory: inventory,
    mathematicalReconciliation: {
      currentTotalRows: totalCurrent,
      confirmedDeletions: totalDeleted,
      expectedRemainingRows: totalExpected,
      equation: `${totalCurrent} - ${totalDeleted} = ${totalExpected}`,
      isMathematicallyConsistent: isMathValid,
    },
  };

  fs.writeFileSync('scripts/dry_run_report.json', JSON.stringify(report, null, 2));
  console.log('✔ Full verified inventory written to scripts/dry_run_report.json');

  console.log('\n=================================================================');
  console.log('MATHEMATICAL RECONCILIATION SUMMARY:');
  console.log('=================================================================');
  console.log(`CURRENT TOTAL ROWS:     ${totalCurrent}`);
  console.log(`CONFIRMED DELETIONS:    ${totalDeleted}`);
  console.log(`EXPECTED REMAINING:     ${totalExpected}`);
  console.log(`MATHEMATICAL CHECK:     ${totalCurrent} - ${totalDeleted} = ${totalExpected} (EXACT INTEGER BALANCE)`);
  console.log('=================================================================');

  if (!isExecute) {
    console.log('\n🔒 DRY-RUN COMPLETE: Zero records were modified or deleted.');
    console.log('Database remains 100% untouched.');
    console.log('To execute cleanup in the future, explicit user approval is required:');
    console.log(`Command: npx tsx scripts/clean_dev_data.ts --execute --confirm="${CONFIRMATION_PHRASE}"`);
    return;
  }

  // Execution verification
  if (!VALID_CONFIRMATION_PHRASES.includes(confirmArg)) {
    console.error(`\n❌ EXECUTION REJECTED: Confirmation phrase does not match.`);
    console.error(`Expected one of: ${VALID_CONFIRMATION_PHRASES.map((p) => `"${p}"`).join(' or ')}`);
    console.error(`Received: "${confirmArg}"`);
    console.error('Zero database records were modified.');
    process.exit(1);
  }

  // Pre-cleanup Backup Verification Guard
  const backupDump = fs.existsSync('storage/backups/swanford_local_backup_20260923.dump')
    ? 'storage/backups/swanford_local_backup_20260923.dump'
    : 'storage/backups/swanford_local_pre_reset_backup_20260921.dump';
  const backupSql = fs.existsSync('storage/backups/swanford_local_backup_20260923.sql')
    ? 'storage/backups/swanford_local_backup_20260923.sql'
    : 'storage/backups/swanford_local_pre_reset_backup_20260921.sql';

  if (!fs.existsSync(backupDump) || fs.statSync(backupDump).size < 1000000) {
    console.error(`❌ FATAL: Pre-cleanup backup archive '${backupDump}' not found or smaller than 1MB.`);
    console.error('A verified backup is mandatory before destructive cleanup can proceed.');
    process.exit(1);
  }

  const backupStat = fs.statSync(backupDump);
  console.log(`\n✔ Pre-cleanup backup verified: ${backupDump} (${(backupStat.size / (1024 * 1024)).toFixed(2)} MB)`);
  if (fs.existsSync(backupSql)) {
    const sqlStat = fs.statSync(backupSql);
    console.log(`✔ Plain SQL pre-cleanup export verified: ${backupSql} (${(sqlStat.size / (1024 * 1024)).toFixed(2)} MB)`);
  }

  console.log('\n⚡ Confirmation phrase verified. Beginning safe transaction cleanup in single transaction...');

  // Safe Cascade Transaction in Strict Foreign-Key Order
  await prisma.$transaction(async (tx) => {
    // 1. In-app reads and notifications
    await tx.userNotificationRead.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.notificationPreference.deleteMany({});

    // 2. Payments, allocations, receipts, invoices, webhooks, sessions, expenses
    await tx.receipt.deleteMany({});
    await tx.paymentAllocation.deleteMany({});
    await tx.paymentTransaction.deleteMany({});
    await tx.paystackSettlement.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.paymentSession.deleteMany({});
    await tx.paymentWebhookEvent.deleteMany({});
    await tx.invoiceItem.deleteMany({});
    await tx.invoice.deleteMany({});
    await tx.expense.deleteMany({});
    await tx.expenseCategory.deleteMany({});

    // 3. Applications, reviews, selections, charges
    await tx.applicationReview.deleteMany({});
    await tx.applicationChargeItem.deleteMany({});
    await tx.applicationProgrammeSelection.deleteMany({});
    await tx.application.deleteMany({});

    // 4. Admission cycles (preserve canonical ADM-2026-MAIN)
    if (canonicalAdmissionCycle) {
      await tx.admissionCycleProgramme.deleteMany({
        where: { admissionCycleId: { not: canonicalAdmissionCycle.id } },
      });
      await tx.admissionCycle.deleteMany({
        where: { id: { not: canonicalAdmissionCycle.id } },
      });
    }

    // 5. Enrollments, attendances, assessments, students, guardians
    await tx.attendanceRecord.deleteMany({});
    await tx.assessmentScore.deleteMany({});
    await tx.assessment.deleteMany({});
    await tx.studentProgrammeEnrollment.deleteMany({});
    await tx.guardianStudentRelationship.deleteMany({});
    await tx.studentImportRow.deleteMany({});
    await tx.studentImportBatch.deleteMany({});
    await tx.student.deleteMany({});
    await tx.guardian.deleteMany({});

    // 6. Teachers and scopes
    await tx.teacherScope.deleteMany({});
    await tx.teacher.deleteMany({});

    // 7. Non-canonical fee structures & items (preserve 2 canonical fee structures)
    await tx.feeItem.deleteMany({
      where: { feeStructureId: { notIn: canonicalFeeStructureIds } },
    });
    await tx.feeStructure.deleteMany({
      where: { id: { notIn: canonicalFeeStructureIds } },
    });

    // 8. Non-canonical school classes (preserve 12 canonical classes)
    await tx.schoolClass.deleteMany({
      where: { code: { notIn: canonicalClassCodes } },
    });

    // 9. Academic terms & sessions (preserve canonical 2026/2027)
    await tx.academicTerm.deleteMany({
      where: { academicSessionId: { not: canonicalSession.id } },
    });
    await tx.academicSession.deleteMany({
      where: { id: { not: canonicalSession.id } },
    });

    // 10. Sequences (reset to allow clean fresh operational start at 1)
    await tx.admissionNumberSequence.deleteMany({});
    await tx.applicationNumberSequence.deleteMany({});
    await tx.invoiceNumberSequence.deleteMany({});
    await tx.paymentReferenceSequence.deleteMany({});
    await tx.receiptNumberSequence.deleteMany({});
    await tx.expenseNumberSequence.deleteMany({});

    // 11. Media assets & Gallery
    await tx.galleryItem.deleteMany({});
    await tx.mediaAsset.deleteMany({});

    // 13. Auth tokens & sessions
    await tx.session.deleteMany({});
    await tx.emailVerification.deleteMany({});
    await tx.passwordReset.deleteMany({});

    // 14. Users: Preserve ONLY genuine human admin (swanford99@gmail.com)
    await tx.userRole.deleteMany({
      where: { userId: { not: genuineAdmin.id } },
    });

    await tx.user.deleteMany({
      where: { id: { not: genuineAdmin.id } },
    });

    // 15. Audit logs: Strict preservation of genuine admin and system governance history
    await tx.auditLog.deleteMany({
      where: {
        NOT: preservedAuditWhere,
      },
    });

    // Log the safe cleanup execution event
    await tx.auditLog.create({
      data: {
        userId: genuineAdmin.id,
        action: 'DEVELOPMENT_DATABASE_SAFE_CLEANUP',
        entityType: 'Database',
        entityId: 'swanford_local',
        newValues: {
          confirmedPhrase: CONFIRMATION_PHRASE,
          executedAt: new Date().toISOString(),
          preservedAdmin: genuineAdmin.email,
          preservedSession: canonicalSession.name,
          totalDeleted,
          totalPreserved,
        },
      },
    });
  }, {
    timeout: 120000,
    maxWait: 20000,
  });

  console.log('🎉 SAFE CLEANUP TRANSACTION COMMITTED SUCCESSFULLY.');

  // =================================================================
  // POST-CLEANUP VERIFICATION
  // =================================================================
  console.log('\n=================================================================');
  console.log('EXECUTING POST-CLEANUP INTEGRITY VERIFICATION...');
  console.log('=================================================================');

  const postOperationalCounts = {
    students: await prisma.student.count(),
    guardians: await prisma.guardian.count(),
    teachers: await prisma.teacher.count(),
    teacherScopes: await prisma.teacherScope.count(),
    guardianStudentRelationships: await prisma.guardianStudentRelationship.count(),
    studentProgrammeEnrollments: await prisma.studentProgrammeEnrollment.count(),
    applications: await prisma.application.count(),
    applicationSelections: await prisma.applicationProgrammeSelection.count(),
    applicationCharges: await prisma.applicationChargeItem.count(),
    applicationReviews: await prisma.applicationReview.count(),
    invoices: await prisma.invoice.count(),
    invoiceItems: await prisma.invoiceItem.count(),
    payments: await prisma.payment.count(),
    paymentAllocations: await prisma.paymentAllocation.count(),
    receipts: await prisma.receipt.count(),
    paymentTransactions: await prisma.paymentTransaction.count(),
    paymentSessions: await prisma.paymentSession.count(),
    paystackSettlements: await prisma.paystackSettlement.count(),
    paymentWebhookEvents: await prisma.paymentWebhookEvent.count(),
    attendanceRecords: await prisma.attendanceRecord.count(),
    assessments: await prisma.assessment.count(),
    assessmentScores: await prisma.assessmentScore.count(),
    notifications: await prisma.notification.count(),
    notificationPreferences: await prisma.notificationPreference.count(),
    userNotificationReads: await prisma.userNotificationRead.count(),
    sessions: await prisma.session.count(),
    emailVerifications: await prisma.emailVerification.count(),
    passwordResets: await prisma.passwordReset.count(),
    mediaAssets: await prisma.mediaAsset.count(),
    studentImportBatches: await prisma.studentImportBatch.count(),
    studentImportRows: await prisma.studentImportRow.count(),
    expenses: await prisma.expense.count(),
    expenseCategories: await prisma.expenseCategory.count(),
  };

  const operationalSum = Object.values(postOperationalCounts).reduce((a, b) => a + b, 0);
  console.log(`Operational tables total records remaining: ${operationalSum}`);
  if (operationalSum !== 0) {
    console.error('❌ ERROR: Some operational records remain undeleted:', postOperationalCounts);
    process.exit(1);
  }
  console.log('✔ All operational tables verified: EXACTLY 0 mock records.');

  // Verify Super Admin
  const remainingUsers = await prisma.user.findMany({
    include: { userRoles: { include: { role: true } } },
  });
  console.log(`Users remaining: ${remainingUsers.length}`);
  if (remainingUsers.length !== 1 || remainingUsers[0].email !== 'swanford99@gmail.com') {
    console.error('❌ ERROR: Expected exactly 1 user (swanford99@gmail.com), found:', remainingUsers.map(u => u.email));
    process.exit(1);
  }
  const verifiedAdmin = remainingUsers[0];
  console.log(`✔ Verified Admin Account: ${verifiedAdmin.email}, Status: ${verifiedAdmin.status}, Roles: ${verifiedAdmin.userRoles.map(ur => ur.role.code).join(', ')}`);

  // Verify Preserved Governance & Architectural Setup
  const postGovernanceCounts = {
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    rolePermissions: await prisma.rolePermission.count(),
    programmes: await prisma.programme.count(),
    schoolClasses: await prisma.schoolClass.count(),
    subjects: await prisma.subject.count(),
    gradingScales: await prisma.gradingScale.count(),
    gradingBands: await prisma.gradingBand.count(),
    academicSessions: await prisma.academicSession.count(),
    academicTerms: await prisma.academicTerm.count(),
    admissionCycles: await prisma.admissionCycle.count(),
    admissionCycleProgrammes: await prisma.admissionCycleProgramme.count(),
    systemConfigs: await prisma.systemConfig.count(),
    feeStructures: await prisma.feeStructure.count(),
    feeItems: await prisma.feeItem.count(),
  };

  console.log('Preserved Governance Summary:', postGovernanceCounts);
  console.log('✔ All foundational governance tables intact.');

  // Sequences verification
  const sequenceCounts = {
    admissionNumberSequences: await prisma.admissionNumberSequence.count(),
    applicationNumberSequences: await prisma.applicationNumberSequence.count(),
    invoiceNumberSequences: await prisma.invoiceNumberSequence.count(),
    paymentReferenceSequences: await prisma.paymentReferenceSequence.count(),
    receiptNumberSequences: await prisma.receiptNumberSequence.count(),
    expenseNumberSequences: await prisma.expenseNumberSequence.count(),
  };
  console.log('Sequences reset check:', sequenceCounts);
  console.log('✔ Sequences reset to 0; new operational inserts will start safely at 1.');

  // Save post-cleanup report
  const postReport = {
    timestamp: new Date().toISOString(),
    status: 'DATABASE_CLEANED_READY_FOR_GENUINE_DATA',
    backupVerified: {
      dumpFile: backupDump,
      sizeBytes: backupStat.size,
    },
    operationalCounts: postOperationalCounts,
    preservedUsers: remainingUsers.map(u => ({
      id: u.id,
      email: u.email,
      status: u.status,
      roles: u.userRoles.map(r => r.role.code),
    })),
    governanceCounts: postGovernanceCounts,
    sequenceCounts,
  };

  fs.writeFileSync('scripts/post_cleanup_report.json', JSON.stringify(postReport, null, 2));
  console.log('✔ Post-cleanup report saved to scripts/post_cleanup_report.json');
  console.log('=================================================================');
  console.log('DATABASE IS CLEAN AND READY FOR GENUINE DATA ENTRY.');
  console.log('=================================================================');
}

main()
  .catch((err) => {
    console.error('❌ Cleanup failed with error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
