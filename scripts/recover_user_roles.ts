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
    evidenceSource: "Outbox notification PARENT_WELCOME_ACTIVATION vs Admin administrative actions",
    evidenceType: "AMBIGUOUS",
    targetRoles: [],
    requiresManualReview: true,
    manualReviewNote: "Account belongs to school director/proprietor Muhammad Kanti. Created during bulk enrollment with guardian notification, but acted as school administrative lead. Requires explicit stakeholder role determination.",
  },
  {
    userId: "ee2a56bb-e1fc-483f-b592-70a976a9fcd4",
    redactedEmail: "fa***3@gmail.com",
    evidenceSource: "Notification outbox 0ff07c48-6a58-4f95-92db-5cf65bca73e7 (PARENT_WELCOME_ACTIVATION)",
    evidenceType: "OUTBOX_NOTIFICATION",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "4bdd3948-d81d-4dba-b512-efd8ab915d0b",
    redactedEmail: "mo***5@gmail.com",
    evidenceSource: "Notification outbox 42e4f17f-149b-4ff6-9db6-e63d3fb6aafe (PARENT_WELCOME_ACTIVATION)",
    evidenceType: "OUTBOX_NOTIFICATION",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "30dbb142-189a-4964-8597-05c76425c3c9",
    redactedEmail: "us***0@gmail.com",
    evidenceSource: "Notification outbox e60bb9e1-6705-4710-85f8-b39fae4ef8a5 (PARENT_WELCOME_ACTIVATION)",
    evidenceType: "OUTBOX_NOTIFICATION",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "e7511b3a-e8d1-47eb-9993-846ffc77d82c",
    redactedEmail: "el***d@gmail.com",
    evidenceSource: "AuditLog e8d8620d-8527-4632-9c3f-91fb5e44a034 (USER_CREATED_BY_ADMIN roles: [PARENT])",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "2813e9be-00a1-46d6-a1af-2b6182367ebc",
    redactedEmail: "ma***4@g.mail.com",
    evidenceSource: "AuditLog e417856b-a25e-4c74-9b2f-a65c275fbdf9 (TEACHER_CREATED STF-2026-0001)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "b09f0304-cb8f-431a-892f-29b183246f6e",
    redactedEmail: "fa***0@gmail.com",
    evidenceSource: "AuditLog 3244a7f9-2c06-4443-85e7-2b31a3aaae4d (TEACHER_CREATED STF-2026-0002)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "5c35a226-7edf-43a6-8548-06da1a8823f1",
    redactedEmail: "ru***s@gmail.com",
    evidenceSource: "AuditLog 8cbab83c-fbe3-4c9b-8be2-8959d5dc012f (USER_CREATED_BY_ADMIN roles: [PARENT])",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "1568766f-cb38-4a3b-a101-cbca9d374036",
    redactedEmail: "bu***a@gmail.com",
    evidenceSource: "AuditLog f883f998-8be4-43b9-a9a3-5c8e31298c4d (TEACHER_CREATED STF-2026-0003)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "d6e31955-16fc-4bd5-b74f-741193c08e2c",
    redactedEmail: "bu***2@gmail.com",
    evidenceSource: "AuditLog 6028081f-ea15-442d-b103-6058097d627b (TEACHER_CREATED STF-2026-0001)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "f68ccf88-5212-4d17-bdc4-04f3ed982c4a",
    redactedEmail: "id***0@gmail.com",
    evidenceSource: "AuditLog 12ec0b79-5654-4f91-b3f7-920436d421d3 (TEACHER_CREATED STF-2026-0002)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "0d3198fd-f2d9-47a1-b38f-01b3955a6c9e",
    redactedEmail: "za***m@gmail.com",
    evidenceSource: "AuditLog 9e846ca0-671e-42ef-a845-f09c2560340b (TEACHER_CREATED STF-2026-0003)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "8765402e-dc49-46a8-a07f-f975d5008613",
    redactedEmail: "ti***7@gmail.com",
    evidenceSource: "AuditLog 34150a87-3c58-4099-a65c-66f91f344cb8 (TEACHER_CREATED STF-2026-0004)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.TEACHER],
  },
  {
    userId: "ab21e309-657a-4d5b-9e21-4198cea94a8f",
    redactedEmail: "el***s@gmail.com",
    evidenceSource: "Notification outbox 43fec706-e7e2-45e0-bdfd-9b578c772cb8 (PARENT_WELCOME_ACTIVATION)",
    evidenceType: "OUTBOX_NOTIFICATION",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "4a93b9eb-637f-49cf-a373-a2bb0cb24d7a",
    redactedEmail: "my***0@gmail.com",
    evidenceSource: "AuditLog c26d60cd-ee9f-43b6-9bb2-411a7238a32d (PARENT_PORTAL_ACCOUNT_PROVISIONED role: PARENT)",
    evidenceType: "AUDIT_LOG",
    targetRoles: [RoleCode.PARENT],
  },
  {
    userId: "d60b9027-d8ce-42e9-a0d5-860d6becd49f",
    redactedEmail: "el***s@gmail.com",
    evidenceSource: "AuditLog 8dc4cab2-e300-4e3d-82d2-28e673236e79 (USER_CREATED_BY_ADMIN roles: [TEACHER])",
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
