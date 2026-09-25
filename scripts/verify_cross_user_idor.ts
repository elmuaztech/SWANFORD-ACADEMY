import { prisma } from '../src/lib/prisma';
import { RoleCode, UserStatus, Gender, StudentStatus, RelationshipType } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { loginUser } from '../src/lib/auth/service';
import { NextRequest } from 'next/server';
import { GET as getChildAttendance } from '../src/app/api/parent/children/[id]/attendance/route';
import { GET as getChildFinance } from '../src/app/api/parent/children/[id]/finance/route';
import { GET as getTeacherClassStudents } from '../src/app/api/teacher/classes/[id]/students/route';

async function main() {
  console.log('=================================================================');
  console.log('SWANFORD ACADEMY — LIVE CROSS-USER IDOR & SCOPE VERIFICATION');
  console.log('=================================================================');

  const runId = Date.now();
  const parentAEmail = `parenta.live.${runId}@swanford.test`;
  const parentBEmail = `parentb.live.${runId}@swanford.test`;
  const teacherEmail = `teacher.live.${runId}@swanford.test`;
  const sharedPassword = 'SecurePassword2026!';
  const hashedPassword = await hashPassword(sharedPassword);

  const parentRole = await prisma.role.findUnique({ where: { code: RoleCode.PARENT } });
  const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
  const activeSession = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
  const activeTerm = await prisma.academicTerm.findFirst({ where: { isCurrent: true } });
  const primaryProg = await prisma.programme.findFirst({ where: { code: 'PRIMARY' as any } }) || await prisma.programme.findFirst();
  const allClasses = await prisma.schoolClass.findMany({ take: 2 });
  const assignedClass = allClasses[0];
  const unassignedClass = allClasses[1];

  let childAId = '';
  let childBId = '';
  let parentASessionToken = '';
  let teacherSessionToken = '';

  try {
    // 1. Create Parent A & Child A
    const uA = await prisma.user.create({
      data: {
        email: parentAEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });
    const gA = await prisma.guardian.create({
      data: { userId: uA.id, firstName: 'Amina', lastName: 'Bello', email: parentAEmail },
    });
    const cA = await prisma.student.create({
      data: {
        admissionNumber: `SA-IDOR-A-${runId}`,
        firstName: 'ChildA',
        lastName: 'Bello',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2017-01-01'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    childAId = cA.id;
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: gA.id,
        studentId: cA.id,
        relationshipType: RelationshipType.MOTHER,
        isPrimaryContact: true,
        receivesInvoices: true,
        status: 'ACTIVE',
      },
    });

    // 2. Create Parent B & Child B
    const uB = await prisma.user.create({
      data: {
        email: parentBEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });
    const gB = await prisma.guardian.create({
      data: { userId: uB.id, firstName: 'Usman', lastName: 'Umar', email: parentBEmail },
    });
    const cB = await prisma.student.create({
      data: {
        admissionNumber: `SA-IDOR-B-${runId}`,
        firstName: 'ChildB',
        lastName: 'Umar',
        gender: Gender.MALE,
        dateOfBirth: new Date('2016-02-02'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    childBId = cB.id;
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: gB.id,
        studentId: cB.id,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
        receivesInvoices: true,
        status: 'ACTIVE',
      },
    });

    // 3. Create Teacher with scope assigned only to assignedClass
    const uT = await prisma.user.create({
      data: {
        email: teacherEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole!.id } },
      },
    });
    const tProfile = await prisma.teacher.create({
      data: {
        userId: uT.id,
        staffIdNumber: `STAFF-IDOR-${runId}`,
        firstName: 'Zainab',
        lastName: 'Ibrahim',
      },
    });
    await prisma.teacherScope.create({
      data: {
        teacherId: tProfile.id,
        programmeId: primaryProg!.id,
        schoolClassId: assignedClass.id,
        academicSessionId: activeSession!.id,
      },
    });

    // 4. Authenticate users to generate real PostgreSQL sessions
    const loginA = await loginUser({ email: parentAEmail, password: sharedPassword });
    parentASessionToken = loginA.sessionToken;

    const loginT = await loginUser({ email: teacherEmail, password: sharedPassword });
    teacherSessionToken = loginT.sessionToken;

    console.log('✓ Successfully created real test entities and authenticated sessions in PostgreSQL:');
    console.log(`  Parent A: ${parentAEmail} (Child A ID: ${childAId})`);
    console.log(`  Parent B: ${parentBEmail} (Child B ID: ${childBId})`);
    console.log(`  Teacher:  ${teacherEmail} (Assigned Class: ${assignedClass.name}, Unassigned: ${unassignedClass.name})`);
    console.log('');

    // TEST 1: Parent A requests Child B Attendance (IDOR Attempt)
    console.log('[TEST 1] Parent A requesting Child B Attendance Records (Cross-User IDOR)...');
    const req1 = new NextRequest(`http://localhost:3000/api/parent/children/${childBId}/attendance`, {
      headers: { authorization: `Bearer ${parentASessionToken}` },
    });
    const res1 = await getChildAttendance(req1, { params: Promise.resolve({ id: childBId }) });
    const data1 = await res1.json();
    console.log(`  Response Status: ${res1.status} (Expected: 403)`);
    console.log(`  Response Code:   ${data1.code}`);
    console.log(`  Response Error:  ${data1.error}`);
    if (res1.status !== 403 || data1.code !== 'STUDENT_ACCESS_DENIED') {
      throw new Error('TEST 1 FAILED: IDOR vulnerability detected!');
    }
    console.log('  -> RESULT: PASS (Cross-child attendance access strictly denied).\n');

    // TEST 2: Parent A requests Child B Finance Records (IDOR Attempt)
    console.log('[TEST 2] Parent A requesting Child B Financial Invoices (Cross-User IDOR)...');
    const req2 = new NextRequest(`http://localhost:3000/api/parent/children/${childBId}/finance`, {
      headers: { authorization: `Bearer ${parentASessionToken}` },
    });
    const res2 = await getChildFinance(req2, { params: Promise.resolve({ id: childBId }) });
    const data2 = await res2.json();
    console.log(`  Response Status: ${res2.status} (Expected: 403)`);
    console.log(`  Response Code:   ${data2.code}`);
    console.log(`  Response Error:  ${data2.error}`);
    if (res2.status !== 403 || data2.code !== 'STUDENT_ACCESS_DENIED') {
      throw new Error('TEST 2 FAILED: Financial IDOR vulnerability detected!');
    }
    console.log('  -> RESULT: PASS (Cross-child financial access strictly denied).\n');

    // TEST 3: Parent A requests Child A Attendance (Legitimate Access)
    console.log('[TEST 3] Parent A requesting own Child A Attendance Records (Legitimate Access)...');
    const req3 = new NextRequest(`http://localhost:3000/api/parent/children/${childAId}/attendance`, {
      headers: { authorization: `Bearer ${parentASessionToken}` },
    });
    const res3 = await getChildAttendance(req3, { params: Promise.resolve({ id: childAId }) });
    console.log(`  Response Status: ${res3.status} (Expected: 200)`);
    if (res3.status !== 200) {
      throw new Error('TEST 3 FAILED: Legitimate parent attendance access was rejected!');
    }
    console.log('  -> RESULT: PASS (Legitimate child attendance access granted).\n');

    // TEST 4: Teacher requests Unassigned Class Students (Scope Escalation Attempt)
    console.log('[TEST 4] Teacher requesting Unassigned Class Students (Out-of-Scope Attempt)...');
    const req4 = new NextRequest(
      `http://localhost:3000/api/teacher/classes/${unassignedClass.id}/students?programmeId=${primaryProg!.id}`,
      { headers: { authorization: `Bearer ${teacherSessionToken}` } }
    );
    const res4 = await getTeacherClassStudents(req4, { params: Promise.resolve({ id: unassignedClass.id }) });
    const data4 = await res4.json();
    console.log(`  Response Status: ${res4.status} (Expected: 403)`);
    console.log(`  Response Code:   ${data4.code}`);
    console.log(`  Response Error:  ${data4.error}`);
    if (res4.status !== 403 || data4.code !== 'SCOPE_UNAUTHORIZED') {
      throw new Error('TEST 4 FAILED: Out-of-scope class access was not blocked!');
    }
    console.log('  -> RESULT: PASS (Out-of-scope classroom access strictly denied).\n');

    // TEST 5: Teacher requests Assigned Class Students (Legitimate Scope Access)
    console.log('[TEST 5] Teacher requesting Assigned Class Students (In-Scope Access)...');
    const req5 = new NextRequest(
      `http://localhost:3000/api/teacher/classes/${assignedClass.id}/students?programmeId=${primaryProg!.id}`,
      { headers: { authorization: `Bearer ${teacherSessionToken}` } }
    );
    const res5 = await getTeacherClassStudents(req5, { params: Promise.resolve({ id: assignedClass.id }) });
    console.log(`  Response Status: ${res5.status} (Expected: 200)`);
    if (res5.status !== 200) {
      throw new Error('TEST 5 FAILED: Legitimate in-scope classroom access was rejected!');
    }
    console.log('  -> RESULT: PASS (In-scope classroom access granted).\n');

  } finally {
    // Clean up only the records created in this test run
    console.log('Cleaning up temporary test records from PostgreSQL...');
    await prisma.guardianStudentRelationship.deleteMany({
      where: { studentId: { in: [childAId, childBId].filter(Boolean) } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [childAId, childBId].filter(Boolean) } },
    });
    await prisma.guardian.deleteMany({
      where: { email: { in: [parentAEmail, parentBEmail] } },
    });
    await prisma.teacherScope.deleteMany({
      where: { teacher: { user: { email: teacherEmail } } },
    });
    await prisma.teacher.deleteMany({
      where: { user: { email: teacherEmail } },
    });
    await prisma.session.deleteMany({
      where: { user: { email: { in: [parentAEmail, parentBEmail, teacherEmail] } } },
    });
    await prisma.userRole.deleteMany({
      where: { user: { email: { in: [parentAEmail, parentBEmail, teacherEmail] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [parentAEmail, parentBEmail, teacherEmail] } },
    });
    console.log('✔ Cleanup completed successfully.\n');
  }
}

main().finally(() => prisma.$disconnect());
