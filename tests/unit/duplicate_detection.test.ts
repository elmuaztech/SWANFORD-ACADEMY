import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { detectPotentialStudentDuplicates } from '@/lib/students/duplicate_detection';
import { Gender, StudentStatus } from '@prisma/client';

describe('Stage 6 — Unit: Student Duplicate Detection', () => {
  const testDob = new Date('2015-05-14');

  beforeEach(async () => {
    // Clean up any test students matching test admission numbers
    const existing = await prisma.student.findMany({
      where: {
        admissionNumber: { startsWith: 'TEST-D' },
      },
      select: { id: true },
    });
    const ids = existing.map((s) => s.id);
    if (ids.length > 0) {
      await prisma.guardianStudentRelationship.deleteMany({
        where: { studentId: { in: ids } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: ids } },
      });
    }
  });

  it('detects potential duplicate when firstName, lastName, and DOB match exactly (case-insensitive)', async () => {
    // Seed existing student
    const existing = await prisma.student.create({
      data: {
        admissionNumber: `TEST-DUP-${Date.now()}`,
        firstName: 'Amina',
        lastName: 'Bello',
        gender: Gender.FEMALE,
        dateOfBirth: testDob,
        currentStatus: StudentStatus.ACTIVE,
      },
    });

    const result = await detectPotentialStudentDuplicates({
      firstName: '  amina  ',
      lastName: 'BELLO',
      dateOfBirth: new Date('2015-05-14T08:00:00Z'),
    });

    expect(result.hasPotentialDuplicates).toBe(true);
    expect(result.matchedStudents.length).toBe(1);
    expect(result.matchedStudents[0].id).toBe(existing.id);
    expect(result.matchedStudents[0].admissionNumber).toBe(existing.admissionNumber);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('Potential duplicate match');

    // Clean up
    await prisma.student.delete({ where: { id: existing.id } });
  });

  it('does not warn when names match but date of birth is different', async () => {
    const existing = await prisma.student.create({
      data: {
        admissionNumber: `TEST-DIFF-DOB-${Date.now()}`,
        firstName: 'Amina',
        lastName: 'Bello',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2014-01-01'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });

    const result = await detectPotentialStudentDuplicates({
      firstName: 'Amina',
      lastName: 'Bello',
      dateOfBirth: new Date('2015-05-14'),
    });

    expect(result.hasPotentialDuplicates).toBe(false);
    expect(result.matchedStudents.length).toBe(0);
    expect(result.warnings.length).toBe(0);

    // Clean up
    await prisma.student.delete({ where: { id: existing.id } });
  });

  it('does not warn when DOB matches but lastName is different', async () => {
    const existing = await prisma.student.create({
      data: {
        admissionNumber: `TEST-DIFF-NAME-${Date.now()}`,
        firstName: 'Amina',
        lastName: 'Suleiman',
        gender: Gender.FEMALE,
        dateOfBirth: testDob,
        currentStatus: StudentStatus.ACTIVE,
      },
    });

    const result = await detectPotentialStudentDuplicates({
      firstName: 'Amina',
      lastName: 'Bello',
      dateOfBirth: testDob,
    });

    expect(result.hasPotentialDuplicates).toBe(false);
    expect(result.matchedStudents.length).toBe(0);

    // Clean up
    await prisma.student.delete({ where: { id: existing.id } });
  });
});
