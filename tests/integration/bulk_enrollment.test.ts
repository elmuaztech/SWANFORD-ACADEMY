import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  executeBulkStudentEnrollment,
  BulkStudentRowInput,
} from '@/lib/students/bulk_enrollment';
import { ImportBatchStatus, ImportRowStatus, UserStatus } from '@prisma/client';

describe('Bulk Student Enrollment Integration Tests', () => {
  let academicSessionId: string;
  let academicTermId: string;
  let primaryClassId: string;
  let primaryProgrammeId: string;
  let tahfeezProgrammeId: string;

  beforeAll(async () => {
    // 1. Ensure active academic session exists
    let session = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
    });
    if (!session) {
      session = await prisma.academicSession.create({
        data: {
          name: '2026/2027 Test Session',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
          isCurrent: true,
        },
      });
    }
    academicSessionId = session.id;

    // 2. Ensure academic term exists
    let term = await prisma.academicTerm.findFirst({
      where: { academicSessionId: session.id },
    });
    if (!term) {
      term = await prisma.academicTerm.create({
        data: {
          academicSessionId: session.id,
          name: 'First Term',
          termCode: 'FIRST',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-12-18'),
          isCurrent: true,
        },
      });
    }
    academicTermId = term.id;

    // 3. Ensure Primary programme and school class exist
    let priProg = await prisma.programme.findUnique({
      where: { code: 'PRIMARY' },
    });
    if (!priProg) {
      priProg = await prisma.programme.create({
        data: {
          code: 'PRIMARY',
          name: 'Primary Education',
          isMainAcademic: true,
        },
      });
    }
    primaryProgrammeId = priProg.id;

    let tahProg = await prisma.programme.findUnique({
      where: { code: 'TAHFEEZ' },
    });
    if (!tahProg) {
      tahProg = await prisma.programme.create({
        data: {
          code: 'TAHFEEZ',
          name: 'Tahfeez Programme',
          isMainAcademic: false,
        },
      });
    }
    tahfeezProgrammeId = tahProg.id;

    let schoolClass = await prisma.schoolClass.findFirst({
      where: { programmeId: priProg.id },
    });
    if (!schoolClass) {
      schoolClass = await prisma.schoolClass.create({
        data: {
          programmeId: priProg.id,
          code: 'PRI_4_TEST',
          name: 'Primary 4 Test',
          capacity: 30,
        },
      });
    }
    primaryClassId = schoolClass.id;

    // Clean up test guardian & students from prior runs for test idempotency
    const testGuardian = await prisma.guardian.findUnique({
      where: { email: 'muhammad.sani@example.com' },
      select: { id: true, userId: true },
    });
    if (testGuardian) {
      await prisma.guardianStudentRelationship.deleteMany({
        where: { guardianId: testGuardian.id },
      });
      await prisma.guardian.delete({ where: { id: testGuardian.id } });
      if (testGuardian.userId) {
        await prisma.user.delete({ where: { id: testGuardian.userId } });
      }
    }
  });

  afterAll(async () => {
    // Clean up created test students, guardians, and batches
    await prisma.studentImportRow.deleteMany({});
    await prisma.studentImportBatch.deleteMany({});
  });

  it('successfully enrolls students with multi-programme support and creates outbox invitations', async () => {
    const rows: BulkStudentRowInput[] = [
      {
        rowNumber: 1,
        firstName: 'Ahmed',
        lastName: 'Sani',
        gender: 'MALE',
        dateOfBirth: '2015-04-12',
        schoolClassId: primaryClassId,
        programmeIds: [primaryProgrammeId, tahfeezProgrammeId], // Multi-programme!
        guardianFirstName: 'Muhammad',
        guardianLastName: 'Sani',
        guardianEmail: 'muhammad.sani@example.com',
        guardianPhone: '08031234567',
        relationshipType: 'FATHER',
      },
    ];

    const result = await executeBulkStudentEnrollment({
      academicSessionId,
      academicTermId,
      sourceType: 'MANUAL_BULK_ENTRY',
      rows,
    });

    expect(result.status).toBe(ImportBatchStatus.COMPLETED);
    expect(result.totalSuccessful).toBe(1);
    expect(result.totalFailed).toBe(0);

    const studentId = result.successfulStudents[0].studentId;

    // Verify student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        programmeEnrollments: true,
        guardianLinks: { include: { guardian: true } },
      },
    });

    expect(student).toBeDefined();
    expect(student?.admissionNumber).toMatch(/^SA-\d{4}-\d{4}$/);

    // Verify 2 programme enrollments exist (Primary + Tahfeez)
    expect(student?.programmeEnrollments).toHaveLength(2);

    // Verify guardian created and linked
    expect(student?.guardianLinks).toHaveLength(1);
    const guardian = student?.guardianLinks[0].guardian;
    expect(guardian?.email).toBe('muhammad.sani@example.com');
    expect(guardian?.userId).toBeDefined();

    // Verify parent User created in PENDING_VERIFICATION state
    const user = await prisma.user.findUnique({
      where: { id: guardian!.userId! },
      include: { emailVerifications: true },
    });
    expect(user?.status).toBe(UserStatus.PENDING_VERIFICATION);
    expect(user?.emailVerifications).toHaveLength(1);
    expect(user?.emailVerifications[0].tokenType).toBe('ACCOUNT_ACTIVATION');

    // Verify Outbox Notification was created
    const notification = await prisma.notification.findFirst({
      where: { recipientEmail: 'muhammad.sani@example.com' },
    });
    expect(notification).toBeDefined();
    expect(['PENDING', 'PROCESSING', 'SENT']).toContain(notification?.status);
    expect(notification?.templateName).toBe('PARENT_WELCOME_ACTIVATION');
  });

  it('re-uses existing guardian identity for siblings sharing the same parent email', async () => {
    const siblingRows: BulkStudentRowInput[] = [
      {
        rowNumber: 1,
        firstName: 'Aisha',
        lastName: 'Sani', // Sibling of Ahmed
        gender: 'FEMALE',
        dateOfBirth: '2017-08-19',
        schoolClassId: primaryClassId,
        programmeIds: [primaryProgrammeId],
        guardianFirstName: 'Muhammad',
        guardianLastName: 'Sani',
        guardianEmail: 'muhammad.sani@example.com', // SAME EMAIL
        guardianPhone: '08031234567',
        relationshipType: 'FATHER',
      },
    ];

    const result = await executeBulkStudentEnrollment({
      academicSessionId,
      academicTermId,
      rows: siblingRows,
    });

    expect(result.status).toBe(ImportBatchStatus.COMPLETED);

    // Verify both siblings link to the SAME Guardian record
    const guardians = await prisma.guardian.findMany({
      where: { email: 'muhammad.sani@example.com' },
      include: { relationships: true },
    });

    expect(guardians).toHaveLength(1); // EXACTLY ONE GUARDIAN RECORD
    expect(guardians[0].relationships).toHaveLength(2); // Links to Ahmed and Aisha!
  });

  it('handles parents without email: creates student and guardian without blocking', async () => {
    const rowNoEmail: BulkStudentRowInput[] = [
      {
        rowNumber: 1,
        firstName: 'Fatima',
        lastName: 'Umar',
        gender: 'FEMALE',
        dateOfBirth: '2018-02-21',
        schoolClassId: primaryClassId,
        programmeIds: [primaryProgrammeId],
        guardianFirstName: 'Umar',
        guardianLastName: 'Musa',
        guardianPhone: '08099887766', // No email provided
        relationshipType: 'FATHER',
      },
    ];

    const result = await executeBulkStudentEnrollment({
      academicSessionId,
      academicTermId,
      rows: rowNoEmail,
    });

    expect(result.status).toBe(ImportBatchStatus.COMPLETED);
    const studentId = result.successfulStudents[0].studentId;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { guardianLinks: { include: { guardian: true } } },
    });

    expect(student?.guardianLinks[0].guardian.email).toBeNull();
    expect(student?.guardianLinks[0].guardian.userId).toBeNull(); // No user created yet
  });

  it('isolates row failures: invalid rows fail and log errors while valid rows succeed', async () => {
    const mixedRows: BulkStudentRowInput[] = [
      {
        rowNumber: 1,
        firstName: 'Valid',
        lastName: 'Child',
        gender: 'MALE',
        dateOfBirth: '2016-01-01',
        schoolClassId: primaryClassId,
        programmeIds: [primaryProgrammeId],
        guardianFirstName: 'Valid',
        guardianLastName: 'Parent',
        guardianPhone: '08011112222',
      },
      {
        rowNumber: 2,
        firstName: 'Invalid',
        lastName: 'Child',
        gender: 'FEMALE',
        dateOfBirth: 'invalid-date-format', // FATAL ROW VALIDATION ERROR
        schoolClassId: primaryClassId,
        programmeIds: [primaryProgrammeId],
        guardianFirstName: 'Parent',
        guardianLastName: 'Two',
        guardianPhone: '08033334444',
      },
    ];

    const result = await executeBulkStudentEnrollment({
      academicSessionId,
      academicTermId,
      rows: mixedRows,
    });

    expect(result.status).toBe(ImportBatchStatus.PARTIALLY_COMPLETED);
    expect(result.totalSubmitted).toBe(2);
    expect(result.totalSuccessful).toBe(1);
    expect(result.totalFailed).toBe(1);

    expect(result.failedRows).toHaveLength(1);
    expect(result.failedRows[0].rowNumber).toBe(2);
    expect(result.failedRows[0].errorMessage).toContain('Invalid date of birth format');

    // Verify row 1 student exists
    const validStudentId = result.successfulStudents[0].studentId;
    const validStudent = await prisma.student.findUnique({ where: { id: validStudentId } });
    expect(validStudent).toBeDefined();

    // Verify StudentImportRow records
    const importRows = await prisma.studentImportRow.findMany({
      where: { batchId: result.batchId },
      orderBy: { rowNumber: 'asc' },
    });

    expect(importRows).toHaveLength(2);
    expect(importRows[0].status).toBe(ImportRowStatus.SUCCESS);
    expect(importRows[0].studentId).toBe(validStudentId);
    expect(importRows[1].status).toBe(ImportRowStatus.FAILED);
    expect(importRows[1].studentId).toBeNull();
  });

  it('supports finding batch metadata from student ID via StudentImportRow', async () => {
    // Query a student created in earlier test
    const row = await prisma.studentImportRow.findFirst({
      where: { studentId: { not: null } },
      include: { batch: true },
    });

    expect(row).toBeDefined();
    expect(row?.batch).toBeDefined();
    expect(row?.batch.batchNumber).toMatch(/^BATCH-\d{4}-\d{5}$/);
  });
});
