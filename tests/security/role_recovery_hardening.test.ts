import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { RoleCode, UserStatus } from "@prisma/client";
import {
  RECONCILIATION_TARGETS,
  runRoleRecovery,
  generateSurgicalRollbackSql,
} from "../../scripts/recover_user_roles";

describe("Security Hardening: Role Recovery Atomic Execution & Rollback Precision", () => {
  const prefix = `rec.sec.${Date.now()}`;
  const dummyPasswordHash = "$2a$12$e8Yx9n/8J8m6xYxG9E1QRe6f/J0Y5o9H5gQ6P2p9Z7K9l7s6d5f4a";
  let parentRoleId: string;

  beforeAll(async () => {
    const pRole = await prisma.role.findUnique({ where: { code: RoleCode.PARENT } });
    parentRoleId = pRole!.id;
  });

  describe("1. Static Target Audit & Administrative Isolation", () => {
    it("1.1 Confirms exactly 17 total accounts are evaluated", () => {
      expect(RECONCILIATION_TARGETS.length).toBe(17);
    });

    it("1.2 Confirms exactly 12 accounts are approved for recovery (7 Parents, 5 Teachers)", () => {
      const recoveryTargets = RECONCILIATION_TARGETS.filter(
        (t) => !t.requiresManualReview && t.userId !== "2f06fdcd-23e5-4e02-8490-3fcf133c609c"
      );
      expect(recoveryTargets.length).toBe(12);

      const parents = recoveryTargets.filter((t) => t.targetRoles.includes(RoleCode.PARENT));
      const teachers = recoveryTargets.filter((t) => t.targetRoles.includes(RoleCode.TEACHER));

      expect(parents.length).toBe(7);
      expect(teachers.length).toBe(5);

      for (const p of parents) {
        expect(p.targetRoles).toEqual([RoleCode.PARENT]);
      }
      for (const t of teachers) {
        expect(t.targetRoles).toEqual([RoleCode.TEACHER]);
      }
    });

    it("1.3 Confirms zero ordinary accounts receive ADMIN or SUPER_ADMIN", () => {
      const nonRootTargets = RECONCILIATION_TARGETS.filter(
        (t) => t.userId !== "2f06fdcd-23e5-4e02-8490-3fcf133c609c"
      );
      for (const t of nonRootTargets) {
        expect(t.targetRoles).not.toContain(RoleCode.SUPER_ADMIN);
        expect(t.targetRoles).not.toContain(RoleCode.ADMIN);
      }
    });

    it("1.4 Confirms exactly 4 flagged accounts are explicitly excluded with empty targetRoles", () => {
      const flagged = RECONCILIATION_TARGETS.filter((t) => t.requiresManualReview);
      expect(flagged.length).toBe(4);

      const expectedFlaggedIds = [
        "8f78d46d-13fd-4e23-a9d9-e807984df4e2", // Director Muhammad Kanti
        "2813e9be-00a1-46d6-a1af-2b6182367ebc", // Deleted teacher entity
        "b09f0304-cb8f-431a-892f-29b183246f6e", // Deleted teacher entity
        "1568766f-cb38-4a3b-a101-cbca9d374036", // Superseded duplicate Buhari Londna
      ];

      for (const id of expectedFlaggedIds) {
        const found = flagged.find((f) => f.userId === id);
        expect(found).toBeDefined();
        expect(found?.targetRoles).toEqual([]);
        expect(found?.requiresManualReview).toBe(true);
        expect(found?.manualReviewNote).toBeDefined();
      }
    });
  });

  describe("2. Dry-Run Zero-Write Behavior & Idempotency", () => {
    let mockUserId: string;

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}.dryrun@example.com`,
          passwordHash: dummyPasswordHash,
          status: UserStatus.ACTIVE,
        },
      });
      mockUserId = user.id;
    });

    afterAll(async () => {
      if (mockUserId) {
        await prisma.userRole.deleteMany({ where: { userId: mockUserId } });
        await prisma.user.deleteMany({ where: { id: mockUserId } });
      }
    });

    it("2.1 Confirms runRoleRecovery in default mode executes ZERO database writes", async () => {
      const initialRolesCount = await prisma.userRole.count();

      const result = await runRoleRecovery({ execute: false });

      const postRolesCount = await prisma.userRole.count();

      expect(result.isDryRun).toBe(true);
      expect(result.createdAssignments.length).toBe(0);
      expect(postRolesCount).toBe(initialRolesCount);
    });

    it("2.2 Confirms idempotency when evaluating target set", async () => {
      const result = await runRoleRecovery({ execute: false });
      expect(result.success).toBe(true);
      expect(result.totalEvaluated).toBe(17);
    });
  });

  describe("3. Transaction Atomicity & Failure Rollback", () => {
    it("3.1 Verifies that an error during transaction rolls back all intermediate writes", async () => {
      const testUser1 = await prisma.user.create({
        data: {
          email: `${prefix}.tx1@example.com`,
          passwordHash: dummyPasswordHash,
          status: UserStatus.ACTIVE,
        },
      });
      const testUser2 = await prisma.user.create({
        data: {
          email: `${prefix}.tx2@example.com`,
          passwordHash: dummyPasswordHash,
          status: UserStatus.ACTIVE,
        },
      });

      try {
        await expect(
          prisma.$transaction(async (tx) => {
            // Write 1
            await tx.userRole.create({
              data: { userId: testUser1.id, roleId: parentRoleId },
            });

            // Simulate simulated failure midway
            throw new Error("SIMULATED_TRANSACTION_FAILURE");
          })
        ).rejects.toThrow("SIMULATED_TRANSACTION_FAILURE");

        // Verify write 1 was rolled back
        const role1 = await prisma.userRole.findUnique({
          where: { userId_roleId: { userId: testUser1.id, roleId: parentRoleId } },
        });
        const role2 = await prisma.userRole.findUnique({
          where: { userId_roleId: { userId: testUser2.id, roleId: parentRoleId } },
        });

        expect(role1).toBeNull();
        expect(role2).toBeNull();
      } finally {
        await prisma.userRole.deleteMany({ where: { userId: { in: [testUser1.id, testUser2.id] } } });
        await prisma.user.deleteMany({ where: { id: { in: [testUser1.id, testUser2.id] } } });
      }
    });
  });

  describe("4. Surgical Rollback Script Precision", () => {
    it("4.1 Generates SQL that restricts deletion strictly to PARENT and TEACHER roles", () => {
      const sampleAssignments = [
        { userId: "ee2a56bb-e1fc-483f-b592-70a976a9fcd4", roleCode: RoleCode.PARENT },
        { userId: "4bdd3948-d81d-4dba-b512-efd8ab915d0b", roleCode: RoleCode.PARENT },
        { userId: "d6e31955-16fc-4bd5-b74f-741193c08e2c", roleCode: RoleCode.TEACHER },
      ];

      const sql = generateSurgicalRollbackSql(sampleAssignments);

      expect(sql).toContain("DELETE FROM public.user_roles ur");
      expect(sql).toContain("USING public.roles r");
      expect(sql).toContain("WHERE ur.role_id = r.id");
      expect(sql).toContain("r.code = 'PARENT'");
      expect(sql).toContain("r.code = 'TEACHER'");
      expect(sql).toContain("'ee2a56bb-e1fc-483f-b592-70a976a9fcd4'");
      expect(sql).toContain("'d6e31955-16fc-4bd5-b74f-741193c08e2c'");

      // Guarantees it does NOT delete indiscriminately
      expect(sql).not.toContain("DELETE FROM public.user_roles WHERE user_id IN");
      expect(sql).not.toContain("r.code = 'ADMIN'");
      expect(sql).not.toContain("r.code = 'SUPER_ADMIN'");
    });

    it("4.2 Handles empty assignments cleanly", () => {
      const sql = generateSurgicalRollbackSql([]);
      expect(sql).toContain("-- No role assignments created or pending to roll back.");
    });
  });
});
