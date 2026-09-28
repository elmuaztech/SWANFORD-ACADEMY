import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  RoleCode,
  UserStatus,
  Gender,
  StudentStatus,
  TeacherStatus,
  AttendanceStatus,
  ProgrammeCode,
  TermCode,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAdminDashboardMetrics,
  correctStudentAttendance,
  listAdminTeachers,
  assignTeacherScope,
  removeTeacherScope,
} from "@/lib/admin/admin_service";
import { hashPassword } from "@/lib/auth/password";
import { sanitizeUser, SafeUser } from "@/lib/auth/service";

describe("Integration Tests: Work Package C - Admin Portal Operations", () => {
  let adminUser: SafeUser;
  let teacherUser: SafeUser;
  let teacher: { id: string; staffIdNumber: string };
  let academicSession: { id: string; name: string };
  let academicTerm: { id: string; name: string };
  let programme: { id: string; name: string; code: string };
  let schoolClass: { id: string; name: string };
  let student: { id: string; admissionNumber: string };
  let attendanceRecord: { id: string; status: AttendanceStatus };

  beforeAll(async () => {
    // 1. Roles
    const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
    if (!adminRole || !teacherRole) throw new Error("Roles missing in seed.");

    // 2. Admin Actor
    const passHash = await hashPassword("Admin@Swanford2026!");
    const rawAdmin = await prisma.user.create({
      data: {
        email: `admin.ops.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: adminRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    adminUser = sanitizeUser(rawAdmin);

    // 3. Teacher Actor & Profile
    const rawTeacher = await prisma.user.create({
      data: {
        email: `teacher.ops.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    teacherUser = sanitizeUser(rawTeacher);

    teacher = await prisma.teacher.create({
      data: {
        userId: teacherUser.id,
        staffIdNumber: `STF-${Date.now().toString().slice(-4)}`,
        firstName: "Fatima",
        lastName: "Bello",
        status: TeacherStatus.ACTIVE,
      },
    });

    // 4. Academic Structure
    academicSession = await prisma.academicSession.create({
      data: {
        name: `2026/2027 Admin Test Session ${Date.now()}`,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
        isCurrent: false,
      },
    });

    academicTerm = await prisma.academicTerm.create({
      data: {
        academicSessionId: academicSession.id,
        termCode: TermCode.FIRST,
        name: "Term 1 Admin Test",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
        isCurrent: false,
      },
    });

    const existingProg = await prisma.programme.findUnique({
      where: { code: ProgrammeCode.PRIMARY },
    });

    if (existingProg) {
      programme = existingProg;
    } else {
      programme = await prisma.programme.create({
        data: {
          code: ProgrammeCode.PRIMARY,
          name: "Primary Administration Test",
          isMainAcademic: true,
        },
      });
    }

    schoolClass = await prisma.schoolClass.create({
      data: {
        code: `CLS-${Date.now().toString().slice(-4)}`,
        name: "Class 1A Ops",
        programmeId: programme.id,
      },
    });

    // 5. Student
    student = await prisma.student.create({
      data: {
        admissionNumber: `ADM-${Date.now().toString().slice(-5)}`,
        firstName: "Zainab",
        lastName: "Aliyu",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2018-05-15"),
        currentStatus: StudentStatus.ACTIVE,
      },
    });

    // 6. Attendance Record
    attendanceRecord = await prisma.attendanceRecord.create({
      data: {
        date: new Date("2026-09-09"),
        status: AttendanceStatus.ABSENT,
        studentId: student.id,
        programmeId: programme.id,
        schoolClassId: schoolClass.id,
        academicSessionId: academicSession.id,
        academicTermId: academicTerm.id,
        recordedByTeacherId: teacher.id,
        remarks: "Reported absent initially",
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.auditLog.deleteMany({ where: { userId: { in: [adminUser.id, teacherUser.id] } } });
    await prisma.attendanceRecord.deleteMany({ where: { studentId: student.id } });
    await prisma.student.deleteMany({ where: { id: student.id } });
    await prisma.teacherScope.deleteMany({ where: { teacherId: teacher.id } });
    await prisma.teacher.deleteMany({ where: { id: teacher.id } });
    await prisma.schoolClass.deleteMany({ where: { id: schoolClass.id } });
    await prisma.academicTerm.deleteMany({ where: { id: academicTerm.id } });
    await prisma.academicSession.deleteMany({ where: { id: academicSession.id } });
    await prisma.academicSession.updateMany({
      where: { name: '2026/2027' },
      data: { isCurrent: true, status: 'ACTIVE' },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: [adminUser.id, teacherUser.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, teacherUser.id] } } });
  });

  it("retrieves real admin dashboard metrics without placeholders", async () => {
    const metrics = await getAdminDashboardMetrics(adminUser);

    expect(metrics).toBeDefined();
    expect(metrics.counts).toBeDefined();
    expect(typeof metrics.counts.students).toBe("number");
    expect(typeof metrics.counts.guardians).toBe("number");
    expect(typeof metrics.counts.pendingApplications).toBe("number");
    expect(metrics.counts.students).toBeGreaterThanOrEqual(1);

    expect(metrics.todayAttendance).toBeDefined();
    expect(typeof metrics.todayAttendance.total).toBe("number");
    expect(Array.isArray(metrics.recentPayments)).toBe(true);
  });

  it("corrects attendance and logs an immutable audit log entry", async () => {
    const correctionResult = await correctStudentAttendance(adminUser, {
      recordId: attendanceRecord.id,
      newStatus: AttendanceStatus.PRESENT,
      reason: "Parent submitted medical certificate confirming presence after morning clinic",
      remarks: "Updated by school administrator",
    });

    expect(correctionResult.status).toBe(AttendanceStatus.PRESENT);
    expect(correctionResult.remarks).toBe("Updated by school administrator");

    // Verify DB update
    const updated = await prisma.attendanceRecord.findUnique({
      where: { id: attendanceRecord.id },
    });
    expect(updated?.status).toBe(AttendanceStatus.PRESENT);

    // Verify Audit Log
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "ATTENDANCE_CORRECTED",
        entityId: attendanceRecord.id,
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(adminUser.id);
    expect(JSON.stringify(audit?.newValues)).toContain("medical certificate");
  });

  it("manages teacher scopes (assignment and revocation)", async () => {
    // 1. Assign scope
    const scope = await assignTeacherScope(adminUser, {
      teacherId: teacher.id,
      academicSessionId: academicSession.id,
      programmeId: programme.id,
      schoolClassId: schoolClass.id,
      isClassTeacher: true,
    });

    expect(scope).toBeDefined();
    expect(scope.isClassTeacher).toBe(true);
    expect(scope.programmeId).toBe(programme.id);

    // 2. Query roster with scopes
    const { teachers: teachersList } = await listAdminTeachers(adminUser);
    const foundTeacher = teachersList.find((t) => t.id === teacher.id);
    expect(foundTeacher).toBeDefined();
    expect(foundTeacher?.scopes.length).toBeGreaterThanOrEqual(1);

    // 3. Revoke scope
    const removed = await removeTeacherScope(adminUser, scope.id);
    expect(removed.id).toBe(scope.id);

    const postRemoval = await prisma.teacherScope.findUnique({
      where: { id: scope.id },
    });
    expect(postRemoval).toBeNull();
  });
});
