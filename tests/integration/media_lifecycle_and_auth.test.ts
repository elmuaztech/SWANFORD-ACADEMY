import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import {
  RoleCode,
  Gender,
  StudentStatus,
  RelationshipType,
  ProgrammeCode,
  EnrollmentType,
  ApplicationStatus,
  ApplicationPaymentStatus,
} from '@prisma/client';
import { SafeUser } from '@/lib/auth/service';
import {
  uploadAndStoreProfilePhoto,
  getAuthorizedMedia,
  replaceProfilePhoto,
  transferApplicationPhotoToStudent,
  updateStudentPhotoByTeacher,
} from '@/lib/media/media_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { mediaFileExists } from '@/lib/media/storage';

describe('Integration Tests: Media Lifecycle, Authorization & Resource Efficiency', () => {
  let adminUser: SafeUser;
  let parentUserA: SafeUser;
  let parentUserB: SafeUser;
  let teacherUserA: SafeUser;
  let teacherUserB: SafeUser;

  let studentAId: string;
  let studentBId: string;
  let programmePrimaryId: string;
  let programmeTahfeezId: string;
  let class1AId: string;
  let class1BId: string;
  let academicSessionId: string;

  // Helper to generate test JPEG image buffer
  const createSampleImage = async (color = { r: 91, g: 6, b: 18 }): Promise<Buffer> => {
    return sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: color,
      },
    })
      .jpeg()
      .toBuffer();
  };

  beforeEach(async () => {
    const timestamp = Date.now();

    // 1. Academic Session & Term
    const session = await prisma.academicSession.create({
      data: {
        name: `Media-Sess-${timestamp}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    const term = await prisma.academicTerm.create({
      data: {
        academicSessionId: session.id,
        termCode: 'FIRST',
        name: 'First Term',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });

    // 2. Programmes
    const primary = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    programmePrimaryId = primary.id;

    const tahfeez = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.TAHFEEZ },
    });
    programmeTahfeezId = tahfeez.id;

    // 3. Classes
    const class1A = await prisma.schoolClass.create({
      data: {
        programmeId: programmePrimaryId,
        code: `CLS-1A-${timestamp}`,
        name: `Class 1A-${timestamp}`,
        capacity: 30,
      },
    });
    class1AId = class1A.id;

    const class1B = await prisma.schoolClass.create({
      data: {
        programmeId: programmePrimaryId,
        code: `CLS-1B-${timestamp}`,
        name: `Class 1B-${timestamp}`,
        capacity: 30,
      },
    });
    class1BId = class1B.id;

    // 4. Students
    const studentA = await prisma.student.create({
      data: {
        admissionNumber: `SA-A-${timestamp}`,
        firstName: 'Zainab',
        lastName: 'Bello',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2017-05-10'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    studentAId = studentA.id;

    const studentB = await prisma.student.create({
      data: {
        admissionNumber: `SA-B-${timestamp}`,
        firstName: 'Faruk',
        lastName: 'Umar',
        gender: Gender.MALE,
        dateOfBirth: new Date('2017-08-20'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    studentBId = studentB.id;

    // Enroll studentA in Primary Class 1A
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: studentAId,
        programmeId: programmePrimaryId,
        schoolClassId: class1AId,
        academicSessionId,
        academicTermId: term.id,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: EnrollmentType.MAIN_ACADEMIC,
      },
    });

    // Enroll studentB in Primary Class 1B
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: studentBId,
        programmeId: programmePrimaryId,
        schoolClassId: class1BId,
        academicSessionId,
        academicTermId: term.id,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: EnrollmentType.MAIN_ACADEMIC,
      },
    });

    // 5. Users and Profiles
    // Admin User
    const adminDb = await prisma.user.create({
      data: {
        email: `admin-${timestamp}@swanford.test`,
        passwordHash: 'hashed',
        userRoles: {
          create: {
            role: { connect: { code: RoleCode.ADMIN } },
          },
        },
      },
      include: { userRoles: { include: { role: true } } },
    });
    adminUser = {
      id: adminDb.id,
      email: adminDb.email,
      roles: [RoleCode.ADMIN],
      profilePhotoId: null,
    } as SafeUser;

    // Parent User A (Linked to Student A)
    const parentDbA = await prisma.user.create({
      data: {
        email: `parentA-${timestamp}@swanford.test`,
        passwordHash: 'hashed',
        userRoles: {
          create: {
            role: { connect: { code: RoleCode.PARENT } },
          },
        },
      },
    });
    const guardianA = await prisma.guardian.create({
      data: {
        userId: parentDbA.id,
        firstName: 'Aliyu',
        lastName: 'Bello',
        email: parentDbA.email,
        phonePrimary: '08011111111',
      },
    });
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: guardianA.id,
        studentId: studentAId,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
      },
    });
    parentUserA = {
      id: parentDbA.id,
      email: parentDbA.email,
      roles: [RoleCode.PARENT],
      profilePhotoId: null,
    } as SafeUser;

    // Parent User B (Linked to Student B)
    const parentDbB = await prisma.user.create({
      data: {
        email: `parentB-${timestamp}@swanford.test`,
        passwordHash: 'hashed',
        userRoles: {
          create: {
            role: { connect: { code: RoleCode.PARENT } },
          },
        },
      },
    });
    const guardianB = await prisma.guardian.create({
      data: {
        userId: parentDbB.id,
        firstName: 'Usman',
        lastName: 'Umar',
        email: parentDbB.email,
        phonePrimary: '08022222222',
      },
    });
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: guardianB.id,
        studentId: studentBId,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
      },
    });
    parentUserB = {
      id: parentDbB.id,
      email: parentDbB.email,
      roles: [RoleCode.PARENT],
      profilePhotoId: null,
    } as SafeUser;

    // Teacher User A (Scoped strictly to Class 1A in Primary)
    const teacherDbA = await prisma.user.create({
      data: {
        email: `teacherA-${timestamp}@swanford.test`,
        passwordHash: 'hashed',
        userRoles: {
          create: {
            role: { connect: { code: RoleCode.TEACHER } },
          },
        },
      },
    });
    const teacherProfileA = await prisma.teacher.create({
      data: {
        userId: teacherDbA.id,
        firstName: 'Khadija',
        lastName: 'Suleiman',
        staffIdNumber: `STAFF-A-${timestamp}`,
      },
    });
    await prisma.teacherScope.create({
      data: {
        teacherId: teacherProfileA.id,
        academicSessionId,
        programmeId: programmePrimaryId,
        schoolClassId: class1AId,
      },
    });
    teacherUserA = {
      id: teacherDbA.id,
      email: teacherDbA.email,
      roles: [RoleCode.TEACHER],
      profilePhotoId: null,
    } as SafeUser;

    // Teacher User B (Scoped strictly to Tahfeez, NOT Primary)
    const teacherDbB = await prisma.user.create({
      data: {
        email: `teacherB-${timestamp}@swanford.test`,
        passwordHash: 'hashed',
        userRoles: {
          create: {
            role: { connect: { code: RoleCode.TEACHER } },
          },
        },
      },
    });
    const teacherProfileB = await prisma.teacher.create({
      data: {
        userId: teacherDbB.id,
        firstName: 'Ahmad',
        lastName: 'Gwandu',
        staffIdNumber: `STAFF-B-${timestamp}`,
      },
    });
    await prisma.teacherScope.create({
      data: {
        teacherId: teacherProfileB.id,
        academicSessionId,
        programmeId: programmeTahfeezId,
      },
    });
    teacherUserB = {
      id: teacherDbB.id,
      email: teacherDbB.email,
      roles: [RoleCode.TEACHER],
      profilePhotoId: null,
    } as SafeUser;
  });

  afterEach(async () => {
    // Cleanup generated media and DB records safely
  });

  describe('Self-Service Profile Photo Authorization', () => {
    it('allows a parent to upload and update their own profile photo', async () => {
      const sample = await createSampleImage({ r: 50, g: 100, b: 150 });
      const asset = await uploadAndStoreProfilePhoto({
        buffer: sample,
        uploadedById: parentUserA.id,
      });

      await replaceProfilePhoto({ type: 'USER', id: parentUserA.id }, asset.id, parentUserA);

      const updated = await prisma.user.findUnique({
        where: { id: parentUserA.id },
        select: { profilePhotoId: true },
      });
      expect(updated?.profilePhotoId).toBe(asset.id);
    });

    it('rejects a parent attempting to change another parent profile photo', async () => {
      const sample = await createSampleImage();
      const asset = await uploadAndStoreProfilePhoto({
        buffer: sample,
        uploadedById: parentUserA.id,
      });

      await expect(
        replaceProfilePhoto({ type: 'USER', id: parentUserB.id }, asset.id, parentUserA)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('Teacher Scoped Student Photo Authorization', () => {
    it('allows teacher to update student photo when student is inside TeacherScope', async () => {
      const sample = await createSampleImage({ r: 80, g: 120, b: 80 });

      const asset = await updateStudentPhotoByTeacher(teacherUserA, studentAId, sample, {
        programmeId: programmePrimaryId,
        schoolClassId: class1AId,
        academicSessionId,
      });

      expect(asset).toBeDefined();
      const student = await prisma.student.findUnique({
        where: { id: studentAId },
        select: { profilePhotoId: true },
      });
      expect(student?.profilePhotoId).toBe(asset.id);
    });

    it('rejects teacher attempting to update student in another class outside TeacherScope', async () => {
      const sample = await createSampleImage();

      // Teacher A is scoped to Class 1A; studentB is in Class 1B
      await expect(
        updateStudentPhotoByTeacher(teacherUserA, studentBId, sample, {
          programmeId: programmePrimaryId,
          schoolClassId: class1BId,
          academicSessionId,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it('rejects teacher attempting to update student in another programme outside TeacherScope', async () => {
      const sample = await createSampleImage();

      // Teacher B is scoped to Tahfeez; studentA is in Primary
      await expect(
        updateStudentPhotoByTeacher(teacherUserB, studentAId, sample, {
          programmeId: programmePrimaryId,
          schoolClassId: class1AId,
          academicSessionId,
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('Media Access IDOR Prevention', () => {
    it('rejects unauthenticated media asset access', async () => {
      const sample = await createSampleImage();
      const asset = await uploadAndStoreProfilePhoto({ buffer: sample });

      await expect(getAuthorizedMedia(asset.id, null)).rejects.toThrow(AuthorizationError);
    });

    it('allows parent to view own linked child photo, but rejects access to unlinked child', async () => {
      const sample = await createSampleImage();
      const asset = await uploadAndStoreProfilePhoto({ buffer: sample });
      await prisma.student.update({
        where: { id: studentAId },
        data: { profilePhotoId: asset.id },
      });

      // Parent A (linked to studentA) can retrieve the photo
      const authorized = await getAuthorizedMedia(asset.id, parentUserA);
      expect(authorized.buffer).toBeDefined();
      expect(authorized.asset.id).toBe(asset.id);

      // Parent B (linked to studentB, NOT studentA) is rejected
      await expect(getAuthorizedMedia(asset.id, parentUserB)).rejects.toThrow(AuthorizationError);
    });

    it('allows Admin to view any student photo within school authority', async () => {
      const sample = await createSampleImage();
      const asset = await uploadAndStoreProfilePhoto({ buffer: sample });
      await prisma.student.update({
        where: { id: studentAId },
        data: { profilePhotoId: asset.id },
      });

      const result = await getAuthorizedMedia(asset.id, adminUser);
      expect(result.buffer).toBeDefined();
    });
  });

  describe('Admission to Student Photo Transfer & Binary Reuse', () => {
    it('transfers application photo to student record upon admission without duplicate binary copies', async () => {
      const sample = await createSampleImage({ r: 10, g: 80, b: 150 });
      const asset = await uploadAndStoreProfilePhoto({ buffer: sample });

      // Create an admission cycle
      const cycle = await prisma.admissionCycle.create({
        data: {
          academicSessionId,
          code: `CYCLE-${Date.now()}`,
          name: `Cycle-${Date.now()}`,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      });

      // Create application with profilePhotoId attached
      const app = await prisma.application.create({
        data: {
          applicationNumber: `APP-${Date.now()}`,
          academicSessionId,
          admissionCycleId: cycle.id,
          applicantFirstName: 'Mustapha',
          applicantLastName: 'Bello',
          applicantGender: Gender.MALE,
          applicantDob: new Date('2018-01-01'),
          guardianFirstName: 'Aliyu',
          guardianLastName: 'Bello',
          guardianEmail: 'aliyu.bello@example.com',
          guardianPhone: '08033333333',
          guardianRelationship: RelationshipType.FATHER,
          profilePhotoId: asset.id,
          status: ApplicationStatus.APPROVED,
          paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
        },
      });

      // Transfer application photo to new student
      await transferApplicationPhotoToStudent(app.id, studentAId);

      const student = await prisma.student.findUnique({
        where: { id: studentAId },
        select: { profilePhotoId: true },
      });

      // Both Application and Student now reference the EXACT SAME single asset
      expect(student?.profilePhotoId).toBe(asset.id);

      // Verify that no duplicate asset record was created
      const totalAssetsWithSameKey = await prisma.mediaAsset.count({
        where: { storageKey: asset.storageKey },
      });
      expect(totalAssetsWithSameKey).toBe(1);
    });
  });

  describe('Photo Replacement & Reference-Safe Cleanup', () => {
    it('safely cleans up unreferenced media file and DB record when photo is replaced', async () => {
      const sample1 = await createSampleImage({ r: 10, g: 20, b: 30 });
      const oldAsset = await uploadAndStoreProfilePhoto({
        buffer: sample1,
        uploadedById: parentUserA.id,
      });

      // Set old asset on user
      await replaceProfilePhoto({ type: 'USER', id: parentUserA.id }, oldAsset.id, parentUserA);
      expect(await mediaFileExists(oldAsset.storageKey)).toBe(true);

      // Replace with new asset
      const sample2 = await createSampleImage({ r: 40, g: 50, b: 60 });
      const newAsset = await uploadAndStoreProfilePhoto({
        buffer: sample2,
        uploadedById: parentUserA.id,
      });

      await replaceProfilePhoto({ type: 'USER', id: parentUserA.id }, newAsset.id, parentUserA);

      // Old asset had zero remaining references -> safely cleaned from disk & DB
      const oldAssetDb = await prisma.mediaAsset.findUnique({ where: { id: oldAsset.id } });
      expect(oldAssetDb).toBeNull();
      expect(await mediaFileExists(oldAsset.storageKey)).toBe(false);

      // New asset is active
      expect(await mediaFileExists(newAsset.storageKey)).toBe(true);
    });

    it('does NOT delete a media file if it is still referenced by another record', async () => {
      const sample = await createSampleImage({ r: 70, g: 80, b: 90 });
      const sharedAsset = await uploadAndStoreProfilePhoto({
        buffer: sample,
        uploadedById: parentUserA.id,
      });

      // Attach asset to studentA AND studentB
      await prisma.student.update({
        where: { id: studentAId },
        data: { profilePhotoId: sharedAsset.id },
      });
      await prisma.student.update({
        where: { id: studentBId },
        data: { profilePhotoId: sharedAsset.id },
      });

      // Student A replaces photo with a new one
      const sample2 = await createSampleImage({ r: 100, g: 110, b: 120 });
      const newAsset = await uploadAndStoreProfilePhoto({
        buffer: sample2,
        uploadedById: parentUserA.id,
      });

      await replaceProfilePhoto({ type: 'STUDENT', id: studentAId }, newAsset.id, adminUser);

      // sharedAsset is still referenced by studentB -> must NOT be deleted!
      const remainingAssetDb = await prisma.mediaAsset.findUnique({
        where: { id: sharedAsset.id },
      });
      expect(remainingAssetDb).not.toBeNull();
      expect(await mediaFileExists(sharedAsset.storageKey)).toBe(true);
    });
  });
});
