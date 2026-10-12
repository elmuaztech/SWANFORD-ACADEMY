import { PrismaClient, RoleCode } from "@prisma/client";

/**
 * Swanford Academy — Idempotent User Role Reconciliation Script
 * 
 * Safety Rules:
 * 1. Default execution is strictly DRY-RUN. Must pass `--execute` to write changes.
 * 2. Never deletes or truncates any records.
 * 3. Idempotent: Uses upsert on UserRole composite key (userId, roleId).
 * 4. Grounded in verified evidence: Audit logs, outbox notifications, and initial seeds.
 * 5. Ambiguous accounts (such as #2) are explicitly skipped and flagged for manual review.
 */

export interface RoleReconciliationTarget {
  userId: string;
  redactedEmail: string;
  evidenceSource: string;
  evidenceType: "AUDIT_LOG" | "OUTBOX_NOTIFICATION" | "SEED_RECORD" | "AMBIGUOUS";
  targetRoles: RoleCode[];
  requiresManualReview?: boolean;
  manualReviewNote?: string;
}

export const RECONCILIATION_TARGETS: RoleReconciliationTarget[] = [
  {
    userId: "2f06fdcd-23e5-4e02-8490-3fcf133c609c",
    redactedEmail: "sw***9@gmail.com",
    evidenceSource: "prisma/seeds/production.ts:380 (Root Super Admin)",
    evidenceType: "SEED_RECORD",
    targetRoles: [RoleCode.SUPER_ADMIN, RoleCode.ADMIN],
  },
  {
    userId: "8f78d46d-13fd-4e23-a9d9-e807984df4e2",
    redactedEmail: "mu***i@gmail.com",
    evidenceSource: "Director / Stakeholder Review (Dual Guardian Notification & Emergency Admin usage)",
    evidenceType: "AMBIGUOUS",
    targetRoles: [],
    requiresManualReview: true,
    manualReviewNote: "Account belongs to school director/proprietor Muhammad Kanti. Left unchanged pending explicit role confirmation.",
  },
  {
    userId: "ee2a56bb-e1fc-483f-b592-70a976a9fcd4",
    redactedEmail: "fa***3@gmail.com",
    evidenceSource: "Notification 0ff07c48-b91a-4998-8551-8719e0cfe7eb (Student Fatima Sabo SA-2026-0004)",
    evidenceType: "OUTBOX_NOTIFICATION",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "4bdd3948-d81d-4dba-b512-efd8ab915d0b",
    redactedEmail: "mo***5@gmail.com",
    evidenceSource: "Notification 42e4f17f-149b-4ff6-9db6-e63d3fb6aafe (Student Maryam Musa SA-2026-0006)",
    evidenceType: "OUTBOX_NOTIFICATION",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "30dbb142-189a-4964-8597-05c76425c3c9",
    redactedEmail: "us***0@gmail.com",
    evidenceSource: "Notification e60bb9e1-6705-4710-85f8-b39fae4ef8a5 (Student Bilkisu Muhammad SA-2026-0007)",
    evidenceType: "OUTBOX_NOTIFICATION",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "e7511b3a-e8d1-47eb-9993-846ffc77d82c",
    redactedEmail: "el***d@gmail.com",
    evidenceSource: "AuditLog e8d8620d & Notification 73240ea1 (Parent/Guardian) & Apps APP-2026-0001 to 0004",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "2813e9be-00a1-46d6-a1af-2b6182367ebc",
    redactedEmail: "ma***4@g.mail.com",
    evidenceSource: "Orphaned Entity Review: AuditLog e417856b references Teacher/ecc3e8c1 which was deleted from DB",
    evidenceType: "AMBIGUOUS",
    targetRoles: [],
    requiresManualReview: true,
    manualReviewNote: "Original teacher entity was deleted; 0 profiles exist in database. Must not restore role without active profile.",
  },
  {
    userId: "b09f0304-cb8f-431a-892f-29b183246f6e",
    redactedEmail: "fa***0@gmail.com",
    evidenceSource: "Orphaned Entity Review: AuditLog 3244a7f9 references Teacher/439d02af which was deleted from DB",
    evidenceType: "AMBIGUOUS",
    targetRoles: [],
    requiresManualReview: true,
    manualReviewNote: "Original teacher entity was deleted; 0 profiles exist in database. Must not restore role without active profile.",
  },
  {
    userId: "5c35a226-7edf-43a6-8548-06da1a8823f1",
    redactedEmail: "ru***s@gmail.com",
    evidenceSource: "AuditLog 8cbab83c (USER_CREATED_BY_ADMIN) & Notification 03f6c358 (Parent / Guardian)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "1568766f-cb38-4a3b-a101-cbca9d374036",
    redactedEmail: "bu***a@gmail.com",
    evidenceSource: "Conflicting Account Review: Superseded account for Buhari Londna; active teacher profile is buharialondna02",
    evidenceType: "AMBIGUOUS",
    targetRoles: [],
    requiresManualReview: true,
    manualReviewNote: "Superseded initial account; active teacher profile belongs to buharialondna02@gmail.com. Preserved unassigned to avoid account conflict.",
  },
  {
    userId: "d6e31955-16fc-4bd5-b74f-741193c08e2c",
    redactedEmail: "bu***2@gmail.com",
    evidenceSource: "Active 1-to-1 Teacher profile ad700a93 (ABUBAKAR BUHARI LONDNA) & AuditLog 6028081f",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "f68ccf88-5212-4d17-bdc4-04f3ed982c4a",
    redactedEmail: "id***0@gmail.com",
    evidenceSource: "Active 1-to-1 Teacher profile 4ac00df2 (Abdulbasit Idris) & Attendance register audit logs",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "0d3198fd-f2d9-47a1-b38f-01b3955a6c9e",
    redactedEmail: "za***m@gmail.com",
    evidenceSource: "Active 1-to-1 Teacher profile cca3ebf2 (Zainab Abukasim) & AuditLog 9e846ca0",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "8765402e-dc49-46a8-a07f-f975d5008613",
    redactedEmail: "ti***7@gmail.com",
    evidenceSource: "Active 1-to-1 Teacher profile 20019ce6 (Rafiu Titilope) & AuditLog 34150a87",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "ab21e309-657a-4d5b-9e21-4198cea94a8f",
    redactedEmail: "el***s@gmail.com",
    evidenceSource: "Approved application APP-2026-0006 & Outbox notification 43fec706 (PARENT_WELCOME_ACTIVATION)",
    evidenceType: "OUTBOX_NOTIFICATION",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "4a93b9eb-637f-49cf-a373-a2bb0cb24d7a",
    redactedEmail: "my***0@gmail.com",
    evidenceSource: "Approved application APP-2026-0005 & AuditLog c26d60cd (PARENT_PORTAL_ACCOUNT_PROVISIONED)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "d60b9027-d8ce-42e9-a0d5-860d6becd49f",
    redactedEmail: "el***s@gmail.com",
    evidenceSource: "Active 1-to-1 Teacher profile 9ac6356f (elmuaz elmuaz) & AuditLog 8dc4cab2",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
];

export async function runRoleRecovery(options: { execute?: boolean; prismaClient?: PrismaClient }) {
  const isExecute = options.execute === true;
  const prisma = options.prismaClient || new PrismaClient();

  console.log(`\n======================================================================`);
  console.log(`Swanford Academy — User Role Reconciliation Plan Execution`);
  console.log(`Mode: ${isExecute ? "EXECUTE (LIVE WRITES)" : "DRY-RUN (NO CHANGES APPLIED)"}`);
  console.log(`======================================================================\n`);

  // Cache existing roles by code
  const roles = await prisma.role.findMany();
  const roleMap = new Map<RoleCode, string>();
  for (const r of roles) {
    roleMap.set(r.code, r.id);
  }

  const report: Array<{
    userId: string;
    redactedEmail: string;
    beforeRoles: string[];
    targetRoles: string[];
    action: string;
    notes: string;
  }> = [];

  for (const target of RECONCILIATION_TARGETS) {
    const user = await prisma.user.findUnique({
      where: { id: target.userId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      report.push({
        userId: target.userId,
        redactedEmail: target.redactedEmail,
        beforeRoles: ["<USER_NOT_FOUND>"],
        targetRoles: target.targetRoles,
        action: "SKIPPED_NOT_FOUND",
        notes: "Account ID not found in database.",
      });
      continue;
    }

    const currentRoles = user.userRoles.map((ur) => ur.role.code);

    if (target.requiresManualReview) {
      report.push({
        userId: target.userId,
        redactedEmail: target.redactedEmail,
        beforeRoles: currentRoles,
        targetRoles: [],
        action: "FLAGGED_FOR_MANUAL_REVIEW",
        notes: target.manualReviewNote || "Ambiguous evidence. Kept unchanged.",
      });
      continue;
    }

    const rolesToAdd = target.targetRoles.filter((tr) => !currentRoles.includes(tr));

    if (rolesToAdd.length === 0) {
      report.push({
        userId: target.userId,
        redactedEmail: target.redactedEmail,
        beforeRoles: currentRoles,
        targetRoles: target.targetRoles,
        action: "ALREADY_CONSISTENT",
        notes: "All target roles already present.",
      });
      continue;
    }

    if (isExecute) {
      for (const roleCode of rolesToAdd) {
        const roleId = roleMap.get(roleCode);
        if (!roleId) {
          throw new Error(`Role with code ${roleCode} not found in database`);
        }
        await prisma.userRole.upsert({
          where: {
            userId_roleId: {
              userId: target.userId,
              roleId,
            },
          },
          update: {},
          create: {
            userId: target.userId,
            roleId,
          },
        });
      }
    }

    report.push({
      userId: target.userId,
      redactedEmail: target.redactedEmail,
      beforeRoles: currentRoles,
      targetRoles: target.targetRoles,
      action: isExecute ? "ROLES_ASSIGNED" : "WOULD_ASSIGN_ROLES",
      notes: `Adding [${rolesToAdd.join(", ")}] based on ${target.evidenceSource}`,
    });
  }

  console.table(
    report.map((r) => ({
      "Account ID": r.userId,
      "Redacted Email": r.redactedEmail,
      "Before Roles": r.beforeRoles.join(", ") || "(none)",
      "Target Roles": r.targetRoles.join(", ") || "(none)",
      Action: r.action,
      Notes: r.notes.substring(0, 60),
    }))
  );

  console.log(`\nReconciliation Summary:`);
  console.log(`- Total Accounts Evaluated: ${report.length}`);
  console.log(`- Already Consistent: ${report.filter((r) => r.action === "ALREADY_CONSISTENT").length}`);
  console.log(`- Flagged For Manual Review: ${report.filter((r) => r.action === "FLAGGED_FOR_MANUAL_REVIEW").length}`);
  console.log(`- Roles Reconciled/Pending: ${report.filter((r) => r.action.includes("ASSIGN")).length}`);

  return report;
}

// Direct invocation handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute");
  runRoleRecovery({ execute: isExecute })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Fatal error during role reconciliation:", err);
      process.exit(1);
    });
}
