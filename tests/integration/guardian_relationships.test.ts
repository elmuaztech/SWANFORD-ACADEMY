import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { Gender, StudentStatus, RoleCode, RelationshipType, RelationshipStatus } from '@prisma/client';
import { createGuardian, linkGuardianUserAccount } from '@/lib/guardians/guardian_service';
import {
  linkGuardianToStudent,
  revokeRelationship,
  setPrimaryContact,
  getStudentGuardians,
} from '@/lib/guardians/relationship_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 6 — Integration: Guardian Relationships, Multi-Child, and Primary Contact Transactional Rules', () => {
  let adminUser: SafeUser;
  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    // Setup Admin User with Super Admin role
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `rel-admin-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);
    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });

    adminUser = {
      id: user.id,
      email: user.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };
  });

  afterEach(async () => {
    for (const sid of createdStudentIds) {
      await prisma.guardianStudentRelationship.deleteMany({ where: { studentId: sid } });
      await prisma.student.deleteMany({ where: { id: sid } });
    }
    for (const gid of createdGuardianIds) {
      await prisma.guardianStudentRelationship.deleteMany({ where: { guardianId: gid } });
      await prisma.guardian.deleteMany({ where: { id: gid } });
    }
    for (const uid of createdUserIds) {
      await prisma.userRole.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
  });

  it('supports 1 guardian linked to multiple children', async () => {
    // 1. Create Guardian
    const { guardian } = await createGuardian(adminUser, {
      firstName: 'Alhaji',
      lastName: 'Dantata',
      email: `dantata-${Date.now()}@example.com`,
      phonePrimary: '+2348035550001',
    });
    createdGuardianIds.push(guardian.id);

    // 2. Create 2 Children
    const child1 = await prisma.student.create({
      data: {
        admissionNumber: `TEST-C1-${Date.now()}`,
        firstName: 'Hassan',
        lastName: 'Dantata',
        gender: Gender.MALE,
        dateOfBirth: new Date('2015-02-10'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    createdStudentIds.push(child1.id);

    const child2 = await prisma.student.create({
      data: {
        admissionNumber: `TEST-C2-${Date.now()}`,
        firstName: 'Hussaina',
        lastName: 'Dantata',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2015-02-10'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    createdStudentIds.push(child2.id);

    // 3. Link Guardian to both children
    const rel1 = await linkGuardianToStudent(adminUser, {
      guardianId: guardian.id,
      studentId: child1.id,
      relationshipType: RelationshipType.FATHER,
    });

    const rel2 = await linkGuardianToStudent(adminUser, {
      guardianId: guardian.id,
      studentId: child2.id,
      relationshipType: RelationshipType.FATHER,
    });

    expect(rel1.status).toBe(RelationshipStatus.ACTIVE);
    expect(rel2.status).toBe(RelationshipStatus.ACTIVE);
    expect(rel1.isPrimaryContact).toBe(true);
    expect(rel2.isPrimaryContact).toBe(true);
  });

  it('supports 1 child linked to multiple guardians with transactional primary contact demotion and promotion', async () => {
    const student = await prisma.student.create({
      data: {
        admissionNumber: `TEST-CHILD-${Date.now()}`,
        firstName: 'Aliyu',
        lastName: 'Sanusi',
        gender: Gender.MALE,
        dateOfBirth: new Date('2016-07-20'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    createdStudentIds.push(student.id);

    // Guardian 1: Father
    const { guardian: father } = await createGuardian(adminUser, {
      firstName: 'Sanusi',
      lastName: 'Lamido',
      email: `father-${Date.now()}@example.com`,
    });
    createdGuardianIds.push(father.id);

    // Guardian 2: Mother
    const { guardian: mother } = await createGuardian(adminUser, {
      firstName: 'Maryam',
      lastName: 'Sanusi',
      email: `mother-${Date.now()}@example.com`,
    });
    createdGuardianIds.push(mother.id);

    // Link Father (first guardian -> automatically primary)
    const relFather = await linkGuardianToStudent(adminUser, {
      guardianId: father.id,
      studentId: student.id,
      relationshipType: RelationshipType.FATHER,
      isPrimaryContact: false, // Will become true automatically since no primary exists
    });
    expect(relFather.isPrimaryContact).toBe(true);

    // Link Mother with isPrimaryContact: true -> atomically demotes Father!
    const relMother = await linkGuardianToStudent(adminUser, {
      guardianId: mother.id,
      studentId: student.id,
      relationshipType: RelationshipType.MOTHER,
      isPrimaryContact: true,
    });
    expect(relMother.isPrimaryContact).toBe(true);

    // Check Father's status in DB: isPrimaryContact must now be FALSE
    const refreshedFatherRel = await prisma.guardianStudentRelationship.findUniqueOrThrow({
      where: { id: relFather.id },
    });
    expect(refreshedFatherRel.isPrimaryContact).toBe(false);

    // Atomically set Father back to primary contact via setPrimaryContact
    await setPrimaryContact(adminUser, student.id, father.id);

    const guardiansList = await getStudentGuardians(adminUser, student.id);
    expect(guardiansList.length).toBe(2);
    expect(guardiansList[0].guardianId).toBe(father.id);
    expect(guardiansList[0].isPrimaryContact).toBe(true);
    expect(guardiansList[1].guardianId).toBe(mother.id);
    expect(guardiansList[1].isPrimaryContact).toBe(false);
  });

  it('revoking primary contact relationship automatically reassigns primary contact to another active guardian', async () => {
    const student = await prisma.student.create({
      data: {
        admissionNumber: `TEST-REASSIGN-${Date.now()}`,
        firstName: 'Jamila',
        lastName: 'Garki',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2017-09-09'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    createdStudentIds.push(student.id);

    const { guardian: g1 } = await createGuardian(adminUser, {
      firstName: 'Garba',
      lastName: 'Garki',
      email: `g1-${Date.now()}@example.com`,
    });
    createdGuardianIds.push(g1.id);

    const { guardian: g2 } = await createGuardian(adminUser, {
      firstName: 'Aisha',
      lastName: 'Garki',
      email: `g2-${Date.now()}@example.com`,
    });
    createdGuardianIds.push(g2.id);

    // Link G1 (Primary)
    const rel1 = await linkGuardianToStudent(adminUser, {
      guardianId: g1.id,
      studentId: student.id,
      relationshipType: RelationshipType.FATHER,
      isPrimaryContact: true,
    });

    // Link G2 (Non-primary)
    const rel2 = await linkGuardianToStudent(adminUser, {
      guardianId: g2.id,
      studentId: student.id,
      relationshipType: RelationshipType.MOTHER,
      isPrimaryContact: false,
    });

    expect(rel1.isPrimaryContact).toBe(true);
    expect(rel2.isPrimaryContact).toBe(false);

    // Revoke G1's relationship
    const revoked1 = await revokeRelationship(adminUser, rel1.id, 'Court custody order modification');
    expect(revoked1.status).toBe(RelationshipStatus.REVOKED);
    expect(revoked1.isPrimaryContact).toBe(false);

    // Verify G2 was automatically promoted to primary contact
    const refreshed2 = await prisma.guardianStudentRelationship.findUniqueOrThrow({
      where: { id: rel2.id },
    });
    expect(refreshed2.isPrimaryContact).toBe(true);
  });

  it('restores a revoked relationship without creating duplicate active relationships and preserves history', async () => {
    const student = await prisma.student.create({
      data: {
        admissionNumber: `TEST-RESTORE-${Date.now()}`,
        firstName: 'Nabil',
        lastName: 'Katsina',
        gender: Gender.MALE,
        dateOfBirth: new Date('2015-12-12'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    createdStudentIds.push(student.id);

    const { guardian } = await createGuardian(adminUser, {
      firstName: 'Katsina',
      lastName: 'Elder',
      email: `elder-${Date.now()}@example.com`,
    });
    createdGuardianIds.push(guardian.id);

    // 1. Initial link
    const rel = await linkGuardianToStudent(adminUser, {
      guardianId: guardian.id,
      studentId: student.id,
      relationshipType: RelationshipType.LEGAL_GUARDIAN,
    });
    expect(rel.status).toBe(RelationshipStatus.ACTIVE);

    // 2. Revoke
    await revokeRelationship(adminUser, rel.id, 'Temporary guardian leave');
    const inDbRevoked = await prisma.guardianStudentRelationship.findUniqueOrThrow({
      where: { id: rel.id },
    });
    expect(inDbRevoked.status).toBe(RelationshipStatus.REVOKED);
    expect(inDbRevoked.revokedReason).toBe('Temporary guardian leave');

    // 3. Relink / Restore
    const restored = await linkGuardianToStudent(adminUser, {
      guardianId: guardian.id,
      studentId: student.id,
      relationshipType: RelationshipType.LEGAL_GUARDIAN,
      isPrimaryContact: true,
    });

    expect(restored.id).toBe(rel.id); // Reused the existing relationship record!
    expect(restored.status).toBe(RelationshipStatus.ACTIVE);
    expect(restored.isPrimaryContact).toBe(true);
    expect(restored.revokedAt).toBeNull();
    expect(restored.revokedReason).toBeNull();

    // Verify total relationship records for this pair is still exactly 1
    const count = await prisma.guardianStudentRelationship.count({
      where: {
        guardianId: guardian.id,
        studentId: student.id,
      },
    });
    expect(count).toBe(1);
  });

  it('enforces 1-to-1 invariant when linking guardian to user account', async () => {
    const { guardian: g1 } = await createGuardian(adminUser, {
      firstName: 'Usman',
      lastName: 'Danfodio',
      email: `danfodio-${Date.now()}@example.com`,
    });
    createdGuardianIds.push(g1.id);

    const u1 = await prisma.user.create({
      data: {
        email: `u1-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(u1.id);

    // 1. Link G1 to U1
    const linked = await linkGuardianUserAccount(adminUser, g1.id, u1.id);
    expect(linked.userId).toBe(u1.id);

    // 2. Create G2 and attempt to link to U1 (must fail)
    const { guardian: g2 } = await createGuardian(adminUser, {
      firstName: 'Nana',
      lastName: 'Asmau',
      email: `asmau-${Date.now()}@example.com`,
    });
    createdGuardianIds.push(g2.id);

    await expect(
      linkGuardianUserAccount(adminUser, g2.id, u1.id)
    ).rejects.toThrow('already linked to another guardian profile');

    // 3. Create U2 and attempt to link to G1 (which is already linked to U1) (must fail)
    const u2 = await prisma.user.create({
      data: {
        email: `u2-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(u2.id);

    await expect(
      linkGuardianUserAccount(adminUser, g1.id, u2.id)
    ).rejects.toThrow('already linked to a different user account');
  });
});
