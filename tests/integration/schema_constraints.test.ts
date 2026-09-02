import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PrismaClient,
  EnrollmentType,
  EnrollmentStatus,
  RelationshipType,
  ProgrammeSelectionStatus,
  ApplicationStatus,
  Gender,
} from "@prisma/client";

const prisma = new PrismaClient();

describe("Swanford Master Database Schema, Constraints & Multi-Programme Application Verification", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 1. One parent -> multiple children
  it("verifies one parent can be linked to multiple children", async () => {
    const guardian = await prisma.guardian.findFirstOrThrow({
      where: { email: "muhammad.sani.parent@swanford.example.com" },
      include: {
        relationships: {
          include: { student: true },
        },
      },
    });

    expect(guardian.relationships.length).toBeGreaterThanOrEqual(2);
    const studentNames = guardian.relationships.map((r) => r.student.firstName);
    expect(studentNames).toContain("Ahmed");
    expect(studentNames).toContain("Fatima");
  });

  // 2. One student -> multiple guardians
  it("verifies one student can have multiple guardians (e.g. Father & Mother)", async () => {
    const ahmed = await prisma.student.findUniqueOrThrow({
      where: { admissionNumber: "SA-2026-0001" },
    });

    const motherGuardian = await prisma.guardian.upsert({
      where: { email: "aisha.sani.mother@swanford.example.com" },
      update: {},
      create: {
        title: "Hajiya",
        firstName: "Aisha",
        lastName: "Sani",
        email: "aisha.sani.mother@swanford.example.com",
        phonePrimary: "+2348030009988",
        residentialAddress: "14 Ahmadu Bello Way, Dutse",
        isVerified: true,
      },
    });

    await prisma.guardianStudentRelationship.upsert({
      where: {
        guardianId_studentId: {
          guardianId: motherGuardian.id,
          studentId: ahmed.id,
        },
      },
      update: {},
      create: {
        guardianId: motherGuardian.id,
        studentId: ahmed.id,
        relationshipType: RelationshipType.MOTHER,
        isPrimaryContact: false,
        receivesInvoices: true,
      },
    });

    const links = await prisma.guardianStudentRelationship.findMany({
      where: { studentId: ahmed.id },
      include: { guardian: true },
    });

    expect(links.length).toBeGreaterThanOrEqual(2);
    const relationshipTypes = links.map((l) => l.relationshipType);
    expect(relationshipTypes).toContain(RelationshipType.FATHER);
    expect(relationshipTypes).toContain(RelationshipType.MOTHER);
  });

  // 3. One application can select multiple programmes
  it("verifies one application can select multiple programmes for the same child", async () => {
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
      include: {
        programmeSelections: {
          include: { programme: true, targetClass: true },
        },
      },
    });

    expect(app.programmeSelections.length).toBe(2);
    const progCodes = app.programmeSelections.map((s) => s.programme.code);
    expect(progCodes).toContain("PRIMARY");
    expect(progCodes).toContain("TAHFEEZ");
  });

  // 4. Duplicate programme selection is rejected
  it("rejects duplicate selection of the same programme within one application", async () => {
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
    });
    const primaryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "PRIMARY" } });

    // Attempting to add Primary a second time to the same application must fail
    await expect(
      prisma.applicationProgrammeSelection.create({
        data: {
          applicationId: app.id,
          programmeId: primaryProg.id,
          status: ProgrammeSelectionStatus.PENDING,
        },
      })
    ).rejects.toThrow();
  });

  // 5. One application can contain 3+ programmes
  it("verifies an application can cleanly hold 3 or more distinct programmes", async () => {
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });
    const crecheProg = await prisma.programme.findUniqueOrThrow({ where: { code: "CRECHE" } });
    const nurseryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "NURSERY" } });
    const tahfeezProg = await prisma.programme.findUniqueOrThrow({ where: { code: "TAHFEEZ" } });

    const multiApp = await prisma.application.create({
      data: {
        applicationNumber: "APP-2026-TEST-3PROG",
        academicSessionId: session.id,
        applicantFirstName: "Zainab",
        applicantLastName: "Aliyu",
        applicantGender: Gender.FEMALE,
        applicantDob: new Date("2022-05-10"),
        guardianFirstName: "Aliyu",
        guardianLastName: "Usman",
        guardianEmail: "aliyu.usman@example.com",
        guardianPhone: "+2348031112233",
        guardianRelationship: RelationshipType.FATHER,
        totalAmountKobo: BigInt(15500000),
        status: ApplicationStatus.SUBMITTED,
        programmeSelections: {
          create: [
            { programmeId: crecheProg.id, status: ProgrammeSelectionStatus.PENDING },
            { programmeId: nurseryProg.id, status: ProgrammeSelectionStatus.PENDING },
            { programmeId: tahfeezProg.id, status: ProgrammeSelectionStatus.PENDING },
          ],
        },
      },
      include: { programmeSelections: true },
    });

    expect(multiApp.programmeSelections.length).toBe(3);

    // Clean up test app
    await prisma.application.delete({ where: { id: multiApp.id } });
  });

  // 6. Different target classes stored per selection
  it("stores specific target classes for each distinct programme selection", async () => {
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
      include: {
        programmeSelections: {
          include: { programme: true, targetClass: true },
        },
      },
    });

    const primarySel = app.programmeSelections.find((s) => s.programme.code === "PRIMARY");
    const tahfeezSel = app.programmeSelections.find((s) => s.programme.code === "TAHFEEZ");

    expect(primarySel?.targetClass?.code).toBe("PRIMARY_1");
    expect(tahfeezSel?.targetClass?.code).toBe("TAHFEEZ_GROUP_A");
  });

  // 7. Each programme selection can have an independent approval status
  it("allows independent approval decisions per programme selection", async () => {
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });
    const primaryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "PRIMARY" } });
    const tahfeezProg = await prisma.programme.findUniqueOrThrow({ where: { code: "TAHFEEZ" } });

    const testApp = await prisma.application.create({
      data: {
        applicationNumber: "APP-2026-DECISION-TEST",
        academicSessionId: session.id,
        applicantFirstName: "Umar",
        applicantLastName: "Bello",
        applicantGender: Gender.MALE,
        applicantDob: new Date("2018-03-22"),
        guardianFirstName: "Bello",
        guardianLastName: "Kano",
        guardianEmail: "bello.kano@example.com",
        guardianPhone: "+2348039998877",
        guardianRelationship: RelationshipType.FATHER,
        status: ApplicationStatus.PARTIALLY_APPROVED,
        programmeSelections: {
          create: [
            {
              programmeId: primaryProg.id,
              status: ProgrammeSelectionStatus.APPROVED,
              decisionNotes: "Admitted into Primary 3 based on entrance exam.",
            },
            {
              programmeId: tahfeezProg.id,
              status: ProgrammeSelectionStatus.REJECTED,
              decisionNotes: "Tahfeez morning cohort currently at full capacity.",
            },
          ],
        },
      },
      include: { programmeSelections: true },
    });

    const approvedSel = testApp.programmeSelections.find(
      (s) => s.status === ProgrammeSelectionStatus.APPROVED
    );
    const rejectedSel = testApp.programmeSelections.find(
      (s) => s.status === ProgrammeSelectionStatus.REJECTED
    );

    expect(approvedSel).toBeDefined();
    expect(rejectedSel).toBeDefined();
    expect(approvedSel?.decisionNotes).toContain("Primary 3");
    expect(rejectedSel?.decisionNotes).toContain("capacity");

    // Clean up
    await prisma.application.delete({ where: { id: testApp.id } });
  });

  // 8 & 9. Partial approval creates ONLY approved student enrollments
  it("converts only approved programme selections into student enrollments", async () => {
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });
    const firstTerm = await prisma.academicTerm.findFirstOrThrow({
      where: { academicSessionId: session.id, termCode: "FIRST" },
    });
    const primaryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "PRIMARY" } });
    const tahfeezProg = await prisma.programme.findUniqueOrThrow({ where: { code: "TAHFEEZ" } });
    const primary2Class = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "PRIMARY_2" } });

    // Step A: Create Application with Primary (APPROVED) and Tahfeez (REJECTED)
    const app = await prisma.application.create({
      data: {
        applicationNumber: "APP-2026-PARTIAL-ENROLL",
        academicSessionId: session.id,
        applicantFirstName: "Mustapha",
        applicantLastName: "Garba",
        applicantGender: Gender.MALE,
        applicantDob: new Date("2019-06-15"),
        guardianFirstName: "Garba",
        guardianLastName: "Lawal",
        guardianEmail: "garba.lawal@example.com",
        guardianPhone: "+2348037776655",
        guardianRelationship: RelationshipType.FATHER,
        status: ApplicationStatus.PARTIALLY_APPROVED,
        programmeSelections: {
          create: [
            {
              programmeId: primaryProg.id,
              targetClassId: primary2Class.id,
              status: ProgrammeSelectionStatus.APPROVED,
            },
            {
              programmeId: tahfeezProg.id,
              status: ProgrammeSelectionStatus.REJECTED,
              decisionNotes: "Applicant does not meet prerequisite age for Tahfeez.",
            },
          ],
        },
      },
      include: { programmeSelections: true },
    });

    // Step B: Simulate atomic approval conversion transaction
    const student = await prisma.$transaction(async (tx) => {
      // 1. Create Student (Exactly ONE student)
      const newStudent = await tx.student.create({
        data: {
          admissionNumber: "SA-2026-0099",
          firstName: app.applicantFirstName,
          lastName: app.applicantLastName,
          gender: app.applicantGender,
          dateOfBirth: app.applicantDob,
          currentStatus: "ACTIVE",
        },
      });

      // 2. Link application to student
      await tx.application.update({
        where: { id: app.id },
        data: { admittedStudentId: newStudent.id, status: ApplicationStatus.ENROLLED },
      });

      // 3. Create enrollments ONLY for APPROVED selections
      const approvedSelections = app.programmeSelections.filter(
        (s) => s.status === ProgrammeSelectionStatus.APPROVED
      );

      for (const sel of approvedSelections) {
        await tx.studentProgrammeEnrollment.create({
          data: {
            studentId: newStudent.id,
            programmeId: sel.programmeId,
            schoolClassId: sel.targetClassId!,
            academicSessionId: session.id,
            academicTermId: firstTerm.id,
            enrollmentType: EnrollmentType.MAIN_ACADEMIC,
            enrollmentStatus: EnrollmentStatus.ACTIVE,
          },
        });
      }

      return newStudent;
    });

    // Step C: Verify Student has ONLY Primary enrollment, ZERO Tahfeez enrollment
    const studentEnrollments = await prisma.studentProgrammeEnrollment.findMany({
      where: { studentId: student.id },
      include: { programme: true },
    });

    expect(studentEnrollments.length).toBe(1);
    expect(studentEnrollments[0].programme.code).toBe("PRIMARY");

    // Clean up created entities
    await prisma.studentProgrammeEnrollment.deleteMany({ where: { studentId: student.id } });
    await prisma.student.delete({ where: { id: student.id } });
    await prisma.application.delete({ where: { id: app.id } });
  });

  // 10. One checkout represents charges for multiple programmes + form fee
  it("preserves itemized charge breakdown for multiple programmes and form fee under one checkout", async () => {
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
      include: { chargeItems: true },
    });

    expect(app.totalAmountKobo).toBe(BigInt(13300000)); // ₦133,000 total
    expect(app.chargeItems.length).toBe(3);

    const formFeeItem = app.chargeItems.find((c) => c.chargeType === "APPLICATION_FORM_FEE");
    const primaryFeeItem = app.chargeItems.find(
      (c) => c.chargeType === "PROGRAMME_TUITION" && c.description.includes("Primary")
    );
    const tahfeezFeeItem = app.chargeItems.find(
      (c) => c.chargeType === "PROGRAMME_TUITION" && c.description.includes("Tahfeez")
    );

    expect(formFeeItem).toBeDefined();
    expect(formFeeItem?.totalAmountKobo).toBe(BigInt(500000)); // ₦5,000 form fee separately identifiable
    expect(primaryFeeItem?.totalAmountKobo).toBe(BigInt(11000000)); // ₦110,000
    expect(tahfeezFeeItem?.totalAmountKobo).toBe(BigInt(1800000)); // ₦18,000

    const computedSum = app.chargeItems.reduce((acc, curr) => acc + curr.totalAmountKobo, BigInt(0));
    expect(computedSum).toBe(app.totalAmountKobo);
  });

  // 11. Historical application charges cannot silently change
  it("protects historical application line item amounts when future fee schedules change", async () => {
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
      include: { chargeItems: true },
    });

    const originalAppTotal = app.totalAmountKobo;
    const formFeeOriginal = app.chargeItems.find((c) => c.chargeType === "APPLICATION_FORM_FEE")?.totalAmountKobo;

    // Simulate system fee change (e.g. form fee increased to ₦10,000 in system config)
    await prisma.systemConfig.updateMany({
      where: { key: "admissions.form_fee_kobo" },
      data: { value: "1000000" },
    });

    // Re-query historical application: ensure historical line item and total remain unchanged
    const reloadedApp = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
      include: { chargeItems: true },
    });

    expect(reloadedApp.totalAmountKobo).toBe(originalAppTotal);
    const formFeeReloaded = reloadedApp.chargeItems.find((c) => c.chargeType === "APPLICATION_FORM_FEE")?.totalAmountKobo;
    expect(formFeeReloaded).toBe(formFeeOriginal);

    // Restore config
    await prisma.systemConfig.updateMany({
      where: { key: "admissions.form_fee_kobo" },
      data: { value: "500000" },
    });
  });

  // 12. Existing student multi-programme enrollment & invoice uniqueness continue working
  it("confirms existing student dual enrollment and invoice uniqueness continue functioning flawlessly", async () => {
    const ahmed = await prisma.student.findUniqueOrThrow({
      where: { admissionNumber: "SA-2026-0001" },
    });
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });

    // Ahmed's concurrent enrollments in Primary and Tahfeez
    const enrollments = await prisma.studentProgrammeEnrollment.findMany({
      where: { studentId: ahmed.id, academicSessionId: session.id },
      include: { programme: true },
    });

    expect(enrollments.length).toBe(2);
    const progCodes = enrollments.map((e) => e.programme.code);
    expect(progCodes).toContain("PRIMARY");
    expect(progCodes).toContain("TAHFEEZ");

    // Invoice uniqueness constraint validation
    const existingInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { invoiceNumber: "INV-2026-00001" },
    });

    await expect(
      prisma.invoice.create({
        data: {
          invoiceNumber: "INV-2026-TEST-DUP",
          studentId: existingInvoice.studentId,
          guardianId: existingInvoice.guardianId,
          academicSessionId: existingInvoice.academicSessionId,
          academicTermId: existingInvoice.academicTermId,
          programmeId: existingInvoice.programmeId,
          totalAmountKobo: BigInt(11000000),
          outstandingBalanceKobo: BigInt(11000000),
          dueDate: new Date("2026-09-30"),
        },
      })
    ).rejects.toThrow();

    // Invoices and financial records protected from destructive deletion
    await expect(
      prisma.student.delete({
        where: { id: ahmed.id },
      })
    ).rejects.toThrow();
  });
});
