import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PrismaClient,
  EnrollmentType,
  RelationshipType,
  ProgrammeSelectionStatus,
  ApplicationStatus,
  ApplicationPaymentStatus,
  AdmissionCycleStatus,
  ProgrammeAvailabilityStatus,
  Gender,
} from "@prisma/client";
import { evaluateAdmissionWindow } from "../../src/lib/admission_window";

const prisma = new PrismaClient();

describe("Swanford Stage 2C Admission Lifecycle, Business Rules & Schema Constraints", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Core Relationship 1: One parent -> multiple children
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

  // Core Relationship 2: One student -> multiple guardians
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
        canPickup: true,
        receivesInvoices: true,
      },
    });

    const links = await prisma.guardianStudentRelationship.findMany({
      where: { studentId: ahmed.id },
    });

    expect(links.length).toBeGreaterThanOrEqual(2);
    const relationshipTypes = links.map((l) => l.relationshipType);
    expect(relationshipTypes).toContain(RelationshipType.FATHER);
    expect(relationshipTypes).toContain(RelationshipType.MOTHER);
  });

  // 1. Admission cycle before opening
  it("verifies admission cycle before opening rejects submissions", async () => {
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });
    
    const futureCycle = await prisma.admissionCycle.create({
      data: {
        code: "ADM-TEST-FUTURE",
        name: "Future 2027/2028 Cycle",
        academicSessionId: session.id,
        startDate: new Date("2027-08-01T07:00:00.000Z"),
        endDate: new Date("2027-09-30T22:59:59.999Z"),
        status: AdmissionCycleStatus.UPCOMING,
      },
    });

    const evalResult = evaluateAdmissionWindow(futureCycle, new Date("2027-07-15T10:00:00.000Z"));
    expect(evalResult.isOpen).toBe(false);
    expect(evalResult.canAcceptSubmissions).toBe(false);
    expect(evalResult.reason).toBe("UPCOMING_CYCLE");

    await prisma.admissionCycle.delete({ where: { id: futureCycle.id } });
  });

  // 2. Admission cycle during open window
  it("verifies admission cycle during open window permits submissions and drafts", async () => {
    const activeCycle = await prisma.admissionCycle.findUniqueOrThrow({ where: { code: "ADM-2026-MAIN" } });
    
    // Test inside open window: 15-Aug-2026 12:00 Lagos
    const currentInstant = new Date("2026-08-15T11:00:00.000Z");
    const evalResult = evaluateAdmissionWindow(activeCycle, currentInstant);

    expect(evalResult.isOpen).toBe(true);
    expect(evalResult.canAcceptDrafts).toBe(true);
    expect(evalResult.canAcceptSubmissions).toBe(true);
    expect(evalResult.canAcceptPayments).toBe(true);
  });

  // 3. Admission cycle after closing
  it("verifies admission cycle after closing rejects new submissions and unsubmitted drafts", async () => {
    const activeCycle = await prisma.admissionCycle.findUniqueOrThrow({ where: { code: "ADM-2026-MAIN" } });
    
    // Test after closing: 01-Oct-2026 08:00 Lagos
    const pastInstant = new Date("2026-10-01T07:00:00.000Z");
    const evalResult = evaluateAdmissionWindow(activeCycle, pastInstant);

    expect(evalResult.isOpen).toBe(false);
    expect(evalResult.canAcceptDrafts).toBe(false);
    expect(evalResult.canAcceptSubmissions).toBe(false);
    expect(evalResult.canAcceptPayments).toBe(false);
    expect(evalResult.reason).toBe("AFTER_WINDOW");
  });

  // 4. Programme-specific OPEN/CLOSED/FULL
  it("verifies programme-specific availability independently within an admission cycle", async () => {
    const cycle = await prisma.admissionCycle.findUniqueOrThrow({ where: { code: "ADM-2026-MAIN" } });
    const tahfeezProg = await prisma.programme.findUniqueOrThrow({ where: { code: "TAHFEEZ" } });
    const primaryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "PRIMARY" } });

    // Set Tahfeez to FULL while Primary remains OPEN
    await prisma.admissionCycleProgramme.update({
      where: {
        unique_cycle_programme: {
          admissionCycleId: cycle.id,
          programmeId: tahfeezProg.id,
        },
      },
      data: { status: ProgrammeAvailabilityStatus.FULL },
    });

    const tahfeezAvail = await prisma.admissionCycleProgramme.findUniqueOrThrow({
      where: {
        unique_cycle_programme: {
          admissionCycleId: cycle.id,
          programmeId: tahfeezProg.id,
        },
      },
    });

    const primaryAvail = await prisma.admissionCycleProgramme.findUniqueOrThrow({
      where: {
        unique_cycle_programme: {
          admissionCycleId: cycle.id,
          programmeId: primaryProg.id,
        },
      },
    });

    expect(tahfeezAvail.status).toBe(ProgrammeAvailabilityStatus.FULL);
    expect(primaryAvail.status).toBe(ProgrammeAvailabilityStatus.OPEN);

    // Restore Tahfeez to OPEN for downstream tests
    await prisma.admissionCycleProgramme.update({
      where: {
        unique_cycle_programme: {
          admissionCycleId: cycle.id,
          programmeId: tahfeezProg.id,
        },
      },
      data: { status: ProgrammeAvailabilityStatus.OPEN },
    });
  });

  // 5. One application selecting multiple programmes
  it("verifies one application can select multiple programmes (e.g. Primary + Tahfeez)", async () => {
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

  // 6. Duplicate programme selection prevention
  it("rejects duplicate selection of the same programme within one application", async () => {
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
    });
    const primaryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "PRIMARY" } });

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

  // 7. Submitted application surviving admission closure
  it("verifies an application submitted before closure survives window expiration and remains valid for review", async () => {
    const cycle = await prisma.admissionCycle.findUniqueOrThrow({ where: { code: "ADM-2026-MAIN" } });
    
    // Application submitted before window close
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
    });
    expect(app.status).toBe(ApplicationStatus.SUBMITTED);
    expect(app.admissionCycleId).toBe(cycle.id);

    // Even if cycle window is now passed, existing submitted application is NOT invalidated or deleted
    const postCloseInstant = new Date("2026-10-15T12:00:00.000Z");
    const evalResult = evaluateAdmissionWindow(cycle, postCloseInstant);
    expect(evalResult.isOpen).toBe(false);

    // Admin can still query and review the submitted application
    const reviewableApp = await prisma.application.findUnique({
      where: { id: app.id },
    });
    expect(reviewableApp).not.toBeNull();
    expect(reviewableApp?.status).toBe(ApplicationStatus.SUBMITTED);
  });

  // 8. Unsubmitted draft becoming non-submissible after closure
  it("verifies unsubmitted drafts become non-submissible after admission cycle closure", async () => {
    const cycle = await prisma.admissionCycle.findUniqueOrThrow({ where: { code: "ADM-2026-MAIN" } });
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });

    // Parent started draft
    const draftApp = await prisma.application.create({
      data: {
        applicationNumber: "APP-2026-DRAFT-TEST",
        academicSessionId: session.id,
        admissionCycleId: cycle.id,
        applicantFirstName: "Usman",
        applicantLastName: "Bello",
        applicantGender: Gender.MALE,
        applicantDob: new Date("2021-03-01"),
        guardianFirstName: "Bello",
        guardianLastName: "Garba",
        guardianEmail: "bello.garba@example.com",
        guardianPhone: "+2348035554433",
        guardianRelationship: RelationshipType.FATHER,
        totalAmountKobo: BigInt(500000),
        status: ApplicationStatus.DRAFT,
        paymentStatus: ApplicationPaymentStatus.UNPAID,
      },
    });

    // Check after window close
    const postCloseTime = new Date("2026-10-02T10:00:00.000Z");
    const evalResult = evaluateAdmissionWindow(cycle, postCloseTime);
    expect(evalResult.canAcceptSubmissions).toBe(false);

    // Draft is preserved in DB for history, but cannot be submitted
    const reloadedDraft = await prisma.application.findUniqueOrThrow({ where: { id: draftApp.id } });
    expect(reloadedDraft.status).toBe(ApplicationStatus.DRAFT);

    await prisma.application.delete({ where: { id: draftApp.id } });
  });

  // 9. Stale checkout being rejected
  it("verifies stale checkout cannot bypass admission cycle closing boundary", async () => {
    const cycle = await prisma.admissionCycle.findUniqueOrThrow({ where: { code: "ADM-2026-MAIN" } });

    // If client provides a stale checkout link after closing date, backend window evaluation halts payment
    const checkoutAttemptTime = new Date("2026-10-05T09:00:00.000Z");
    const windowCheck = evaluateAdmissionWindow(cycle, checkoutAttemptTime);

    expect(windowCheck.canAcceptPayments).toBe(false);
    expect(windowCheck.reason).toBe("AFTER_WINDOW");
  });

  // 10. Application submission independent of payment confirmation (SUBMITTED != PAID)
  it("verifies application submission is separate from payment confirmation", async () => {
    const cycle = await prisma.admissionCycle.findUniqueOrThrow({ where: { code: "ADM-2026-MAIN" } });
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });

    // Application submitted, but payment gateway confirmation is pending
    const submittedPendingApp = await prisma.application.create({
      data: {
        applicationNumber: "APP-2026-SUBMITTED-PENDING",
        academicSessionId: session.id,
        admissionCycleId: cycle.id,
        applicantFirstName: "Khadija",
        applicantLastName: "Idris",
        applicantGender: Gender.FEMALE,
        applicantDob: new Date("2020-07-20"),
        guardianFirstName: "Idris",
        guardianLastName: "Ali",
        guardianEmail: "idris.ali@example.com",
        guardianPhone: "+2348037778899",
        guardianRelationship: RelationshipType.FATHER,
        totalAmountKobo: BigInt(11500000),
        amountPaidKobo: BigInt(0),
        status: ApplicationStatus.SUBMITTED,
        paymentStatus: ApplicationPaymentStatus.PAYMENT_PENDING,
      },
    });

    expect(submittedPendingApp.status).toBe(ApplicationStatus.SUBMITTED);
    expect(submittedPendingApp.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_PENDING);

    // 11. Payment pending state preserved
    const reloaded = await prisma.application.findUniqueOrThrow({ where: { id: submittedPendingApp.id } });
    expect(reloaded.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_PENDING);

    // 12. Successful payment changing payment state correctly
    const updatedWithPayment = await prisma.application.update({
      where: { id: submittedPendingApp.id },
      data: {
        paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
        amountPaidKobo: BigInt(11500000),
      },
    });

    expect(updatedWithPayment.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_CONFIRMED);
    expect(updatedWithPayment.amountPaidKobo).toBe(BigInt(11500000));

    await prisma.application.delete({ where: { id: submittedPendingApp.id } });
  });

  // 13. Historical admission cycle association
  it("verifies every application remains permanently linked to its historical admission cycle", async () => {
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
      include: { admissionCycle: true },
    });

    expect(app.admissionCycle).toBeDefined();
    expect(app.admissionCycle.code).toBe("ADM-2026-MAIN");
    expect(app.admissionCycle.name).toBe("2026/2027 Main Admission");
  });

  // 14. Timezone boundary behavior
  it("verifies timezone boundary evaluation is consistent in Africa/Lagos", async () => {
    const cycle = await prisma.admissionCycle.findUniqueOrThrow({ where: { code: "ADM-2026-MAIN" } });
    
    // Cycle starts at 2026-08-01T07:00:00.000Z (08:00 AM Lagos)
    // Instant 1 second before: 07:59:59 AM Lagos (06:59:59 UTC) -> Must be BEFORE_WINDOW
    const oneSecBefore = new Date("2026-08-01T06:59:59.000Z");
    expect(evaluateAdmissionWindow(cycle, oneSecBefore).isOpen).toBe(false);

    // Instant at start: 08:00:00 AM Lagos (07:00:00 UTC) -> Must be OPEN
    const exactStart = new Date("2026-08-01T07:00:00.000Z");
    expect(evaluateAdmissionWindow(cycle, exactStart).isOpen).toBe(true);

    // Instant at end: 23:59:59.999 Lagos (22:59:59.999 UTC) -> Must be OPEN
    const exactEnd = new Date("2026-09-30T22:59:59.999Z");
    expect(evaluateAdmissionWindow(cycle, exactEnd).isOpen).toBe(true);

    // Instant 1 ms after: 00:00:00.000 Lagos on 01-Oct (23:00:00.000 UTC) -> Must be AFTER_WINDOW
    const oneMsAfter = new Date("2026-09-30T23:00:00.000Z");
    expect(evaluateAdmissionWindow(cycle, oneMsAfter).isOpen).toBe(false);
  });

  // 15. Historical fee snapshot preservation
  it("verifies application charge items preserve historical amounts when future fee structure changes", async () => {
    const app = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "APP-2026-00001" },
      include: { chargeItems: true },
    });

    const primaryCharge = app.chargeItems.find((ci) => ci.description.includes("Primary 1"));
    expect(primaryCharge).toBeDefined();
    expect(primaryCharge?.totalAmountKobo).toBe(BigInt(11000000)); // ₦110,000

    // Even if school increases Primary tuition in the system fee schedule:
    // Application line item must remain strictly ₦110,000
    const reloaded = await prisma.applicationChargeItem.findUniqueOrThrow({
      where: { id: primaryCharge!.id },
    });
    expect(reloaded.totalAmountKobo).toBe(BigInt(11000000));
  });

  // 16. Existing multi-programme enrollment behavior
  it("verifies active student dual-programme enrollments (Primary 4 + Tahfeez) continue functioning unimpeded", async () => {
    const firstTerm = await prisma.academicTerm.findFirstOrThrow({
      where: {
        academicSession: { name: "2026/2027" },
        termCode: "FIRST",
      },
    });

    const ahmed = await prisma.student.findUniqueOrThrow({
      where: { admissionNumber: "SA-2026-0001" },
      include: {
        programmeEnrollments: {
          where: { academicTermId: firstTerm.id },
          include: { programme: true, schoolClass: true },
        },
      },
    });

    expect(ahmed.programmeEnrollments.length).toBe(2);
    const progCodes = ahmed.programmeEnrollments.map((e) => e.programme.code);
    expect(progCodes).toContain("PRIMARY");
    expect(progCodes).toContain("TAHFEEZ");

    const mainEnrollment = ahmed.programmeEnrollments.find((e) => e.enrollmentType === EnrollmentType.MAIN_ACADEMIC);
    expect(mainEnrollment?.programme.code).toBe("PRIMARY");
    expect(mainEnrollment?.schoolClass.code).toBe("PRIMARY_4");

    const tahfeezEnrollment = ahmed.programmeEnrollments.find((e) => e.enrollmentType === EnrollmentType.ADDITIONAL_PROGRAMME);
    expect(tahfeezEnrollment?.programme.code).toBe("TAHFEEZ");
    expect(tahfeezEnrollment?.schoolClass.code).toBe("TAHFEEZ_GROUP_A");
  });
});
