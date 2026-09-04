import { RelationshipType, RelationshipStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';

/**
 * Swanford Academy — Guardian-Student Relationship Service
 * Master Specification Reference: Sections 7, 8
 *
 * Core Invariants:
 * - At most ONE active relationship per (guardianId, studentId) pair.
 * - Historical lineage: revocation marks status = REVOKED, records revokedAt/reason;
 *   re-linking restores status = ACTIVE with audit trail without losing history.
 * - Exactly ONE primary contact per student enforced transactionally:
 *   atomic demotion of old primary and promotion of new primary.
 * - When primary relationship is revoked, primary status is automatically transferred
 *   to another active guardian if one exists.
 */

export const CreateRelationshipSchema = z.object({
  guardianId: z.string().uuid(),
  studentId: z.string().uuid(),
  relationshipType: z.nativeEnum(RelationshipType),
  isPrimaryContact: z.boolean().default(false),
  canPickup: z.boolean().default(true),
  receivesInvoices: z.boolean().default(true),
});

export type CreateRelationshipInput = z.input<typeof CreateRelationshipSchema>;

/**
 * Links a guardian to a student or restores a previously revoked relationship.
 * Enforces atomic primary contact rules.
 */
export async function linkGuardianToStudent(
  actor: SafeUser,
  input: CreateRelationshipInput,
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE);
  const validated = CreateRelationshipSchema.parse(input);
  const dbClient = externalTx || prisma;

  // 1. Verify student and guardian exist
  const [student, guardian] = await Promise.all([
    dbClient.student.findUnique({ where: { id: validated.studentId } }),
    dbClient.guardian.findUnique({ where: { id: validated.guardianId } }),
  ]);

  if (!student) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }
  if (!guardian) {
    throw new AuthorizationError('Guardian not found.', 404, 'GUARDIAN_NOT_FOUND');
  }

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    // 2. Check existing active primary contacts for this student
    const currentPrimary = await tx.guardianStudentRelationship.findFirst({
      where: {
        studentId: validated.studentId,
        status: RelationshipStatus.ACTIVE,
        isPrimaryContact: true,
      },
    });

    // If student has no active primary contact, this relationship becomes primary by default
    const shouldBePrimary = validated.isPrimaryContact || !currentPrimary;

    // 3. If this will be primary and there's an existing different primary, demote the old one atomically
    if (shouldBePrimary && currentPrimary && currentPrimary.guardianId !== validated.guardianId) {
      await tx.guardianStudentRelationship.update({
        where: { id: currentPrimary.id },
        data: { isPrimaryContact: false },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'PRIMARY_CONTACT_DEMOTED',
          entityType: 'guardian_student_relationship',
          entityId: currentPrimary.id,
          newValues: {
            guardianId: currentPrimary.guardianId,
            studentId: validated.studentId,
            isPrimaryContact: false,
          },
        },
      });
    }

    // 4. Check if a relationship record already exists between this guardian and student
    const existingRelationship = await tx.guardianStudentRelationship.findUnique({
      where: {
        guardianId_studentId: {
          guardianId: validated.guardianId,
          studentId: validated.studentId,
        },
      },
    });

    if (existingRelationship) {
      if (existingRelationship.status === RelationshipStatus.ACTIVE) {
        throw new AuthorizationError(
          'An active relationship already exists between this guardian and student.',
          400,
          'ACTIVE_RELATIONSHIP_EXISTS'
        );
      }

      // RESTORE legitimate previously revoked relationship
      const restored = await tx.guardianStudentRelationship.update({
        where: { id: existingRelationship.id },
        data: {
          relationshipType: validated.relationshipType,
          status: RelationshipStatus.ACTIVE,
          isPrimaryContact: shouldBePrimary,
          canPickup: validated.canPickup,
          receivesInvoices: validated.receivesInvoices,
          startDate: new Date(),
          endDate: null,
          revokedAt: null,
          revokedReason: null,
        },
        include: { guardian: true, student: true },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'RELATIONSHIP_RESTORED',
          entityType: 'guardian_student_relationship',
          entityId: restored.id,
          oldValues: {
            status: RelationshipStatus.REVOKED,
            revokedAt: existingRelationship.revokedAt,
          },
          newValues: {
            status: RelationshipStatus.ACTIVE,
            relationshipType: restored.relationshipType,
            isPrimaryContact: restored.isPrimaryContact,
          },
        },
      });

      return restored;
    }

    // 5. Create new active relationship
    const created = await tx.guardianStudentRelationship.create({
      data: {
        guardianId: validated.guardianId,
        studentId: validated.studentId,
        relationshipType: validated.relationshipType,
        isPrimaryContact: shouldBePrimary,
        canPickup: validated.canPickup,
        receivesInvoices: validated.receivesInvoices,
        status: RelationshipStatus.ACTIVE,
        startDate: new Date(),
      },
      include: { guardian: true, student: true },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'RELATIONSHIP_CREATED',
        entityType: 'guardian_student_relationship',
        entityId: created.id,
        newValues: {
          guardianId: created.guardianId,
          studentId: created.studentId,
          relationshipType: created.relationshipType,
          isPrimaryContact: created.isPrimaryContact,
        },
      },
    });

    return created;
  };

  const result = externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);

  return result;
}

/**
 * Revokes a relationship, preserving full historical data.
 * If the revoked relationship was the primary contact, atomically promotes another active guardian.
 */
export async function revokeRelationship(
  actor: SafeUser,
  relationshipId: string,
  reason?: string
) {
  await requirePermission(actor, PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE);

  const existing = await prisma.guardianStudentRelationship.findUnique({
    where: { id: relationshipId },
  });

  if (!existing) {
    throw new AuthorizationError('Relationship not found.', 404, 'RELATIONSHIP_NOT_FOUND');
  }

  if (existing.status === RelationshipStatus.REVOKED) {
    return existing;
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();

    // 1. Revoke the relationship
    const revoked = await tx.guardianStudentRelationship.update({
      where: { id: relationshipId },
      data: {
        status: RelationshipStatus.REVOKED,
        isPrimaryContact: false,
        endDate: now,
        revokedAt: now,
        revokedReason: reason || null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'RELATIONSHIP_REVOKED',
        entityType: 'guardian_student_relationship',
        entityId: relationshipId,
        oldValues: { status: RelationshipStatus.ACTIVE, isPrimaryContact: existing.isPrimaryContact },
        newValues: { status: RelationshipStatus.REVOKED, reason: reason || null },
      },
    });

    // 2. If this was the primary contact, atomically reassign to another active guardian if one exists
    if (existing.isPrimaryContact) {
      const remainingActive = await tx.guardianStudentRelationship.findFirst({
        where: {
          studentId: existing.studentId,
          status: RelationshipStatus.ACTIVE,
          id: { not: relationshipId },
        },
        orderBy: [{ createdAt: 'asc' }],
      });

      if (remainingActive) {
        await tx.guardianStudentRelationship.update({
          where: { id: remainingActive.id },
          data: { isPrimaryContact: true },
        });

        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'PRIMARY_CONTACT_AUTO_REASSIGNED',
            entityType: 'guardian_student_relationship',
            entityId: remainingActive.id,
            newValues: {
              promotedRelationshipId: remainingActive.id,
              studentId: existing.studentId,
              isPrimaryContact: true,
            },
          },
        });
      }
    }

    return revoked;
  });

  return result;
}

/**
 * Atomically reassigns the primary contact for a student.
 */
export async function setPrimaryContact(
  actor: SafeUser,
  studentId: string,
  targetGuardianId: string
) {
  await requirePermission(actor, PermissionCode.GUARDIAN_RELATIONSHIP_MANAGE);

  const target = await prisma.guardianStudentRelationship.findUnique({
    where: {
      guardianId_studentId: {
        guardianId: targetGuardianId,
        studentId,
      },
    },
  });

  if (!target || target.status !== RelationshipStatus.ACTIVE) {
    throw new AuthorizationError(
      'Target relationship does not exist or is not active.',
      400,
      'INVALID_PRIMARY_TARGET'
    );
  }

  if (target.isPrimaryContact) {
    return target;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Demote current primary
    await tx.guardianStudentRelationship.updateMany({
      where: {
        studentId,
        isPrimaryContact: true,
      },
      data: {
        isPrimaryContact: false,
      },
    });

    // Promote new primary
    const promoted = await tx.guardianStudentRelationship.update({
      where: { id: target.id },
      data: { isPrimaryContact: true },
      include: { guardian: true, student: true },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PRIMARY_CONTACT_CHANGED',
        entityType: 'guardian_student_relationship',
        entityId: promoted.id,
        newValues: {
          studentId,
          primaryGuardianId: targetGuardianId,
        },
      },
    });

    return promoted;
  });

  return result;
}

/**
 * Retrieves all guardians linked to a student (active and historical).
 */
export async function getStudentGuardians(
  actor: SafeUser,
  studentId: string,
  options?: { includeRevoked?: boolean }
) {
  const roles = await getUserRoles(actor.id);
  const isParent = roles.includes('PARENT');
  if (isParent) {
    // Must be authorized for this student
    const hasActiveLink = await prisma.guardianStudentRelationship.findFirst({
      where: {
        studentId,
        guardian: { userId: actor.id },
        status: RelationshipStatus.ACTIVE,
      },
    });
    if (!hasActiveLink) {
      throw new AuthorizationError('Access denied: You are not a linked guardian for this student.', 403, 'UNAUTHORIZED');
    }
  } else {
    await requirePermission(actor, PermissionCode.GUARDIAN_VIEW);
  }

  const relationships = await prisma.guardianStudentRelationship.findMany({
    where: {
      studentId,
      ...(!options?.includeRevoked && { status: RelationshipStatus.ACTIVE }),
    },
    include: {
      guardian: {
        select: {
          id: true,
          title: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          email: true,
          phonePrimary: true,
          phoneSecondary: true,
          residentialAddress: true,
          occupation: true,
          userId: true,
        },
      },
    },
    orderBy: [
      { isPrimaryContact: 'desc' },
      { createdAt: 'asc' },
    ],
  });

  return relationships;
}
