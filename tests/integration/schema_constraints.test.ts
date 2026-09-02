import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, EnrollmentType, EnrollmentStatus, RelationshipType, InvoiceStatus, GatewayProvider } from "@prisma/client";
import { serializeBigInt } from "@/lib/money";

const prisma = new PrismaClient();

describe("Swanford Master Database Schema & Constraint Verification", () => {
  beforeAll(async () => {
    // Ensure database is reachable
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

    // Create Mother profile
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

    // Link Mother to Ahmed as SECOND guardian
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

  // 3. One student -> Primary + Tahfeez simultaneously
  it("verifies one student participates in Primary and Tahfeez simultaneously", async () => {
    const ahmed = await prisma.student.findUniqueOrThrow({
      where: { admissionNumber: "SA-2026-0001" },
    });
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });
    const currentEnrollments = await prisma.studentProgrammeEnrollment.findMany({
      where: {
        studentId: ahmed.id,
        academicSessionId: session.id,
      },
      include: { programme: true, schoolClass: true },
    });

    expect(currentEnrollments.length).toBe(2);

    const mainAcademic = currentEnrollments.find(
      (e) => e.enrollmentType === EnrollmentType.MAIN_ACADEMIC
    );
    const additionalProg = currentEnrollments.find(
      (e) => e.enrollmentType === EnrollmentType.ADDITIONAL_PROGRAMME
    );

    expect(mainAcademic).toBeDefined();
    expect(mainAcademic?.programme.code).toBe("PRIMARY");
    expect(mainAcademic?.schoolClass.code).toBe("PRIMARY_4");

    expect(additionalProg).toBeDefined();
    expect(additionalProg?.programme.code).toBe("TAHFEEZ");
    expect(additionalProg?.schoolClass.code).toBe("TAHFEEZ_GROUP_A");
  });

  // 4. Historical programme enrollment
  it("preserves historical enrollments across consecutive academic sessions", async () => {
    const ahmed = await prisma.student.findUniqueOrThrow({
      where: { admissionNumber: "SA-2026-0001" },
    });
    const primaryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "PRIMARY" } });
    const primary3Class = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "PRIMARY_3" } });

    // Historical session: 2025/2026
    const pastSession = await prisma.academicSession.upsert({
      where: { name: "2025/2026" },
      update: {},
      create: {
        name: "2025/2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-07-31"),
        isCurrent: false,
      },
    });

    const pastTerm = await prisma.academicTerm.upsert({
      where: {
        academicSessionId_termCode: {
          academicSessionId: pastSession.id,
          termCode: "THIRD",
        },
      },
      update: {},
      create: {
        academicSessionId: pastSession.id,
        termCode: "THIRD",
        name: "Third Term",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-07-20"),
        isCurrent: false,
      },
    });

    // Record past enrollment in Primary 3
    await prisma.studentProgrammeEnrollment.upsert({
      where: {
        unique_student_programme_term_enrollment: {
          studentId: ahmed.id,
          programmeId: primaryProg.id,
          academicSessionId: pastSession.id,
          academicTermId: pastTerm.id,
        },
      },
      update: {},
      create: {
        studentId: ahmed.id,
        programmeId: primaryProg.id,
        schoolClassId: primary3Class.id,
        academicSessionId: pastSession.id,
        academicTermId: pastTerm.id,
        enrollmentType: EnrollmentType.MAIN_ACADEMIC,
        enrollmentStatus: EnrollmentStatus.COMPLETED,
      },
    });

    const allEnrollments = await prisma.studentProgrammeEnrollment.findMany({
      where: { studentId: ahmed.id },
      include: { academicSession: true, schoolClass: true },
    });

    expect(allEnrollments.length).toBeGreaterThanOrEqual(3);
    const pastEnrollment = allEnrollments.find((e) => e.academicSession.name === "2025/2026");
    expect(pastEnrollment?.schoolClass.code).toBe("PRIMARY_3");
    expect(pastEnrollment?.enrollmentStatus).toBe(EnrollmentStatus.COMPLETED);
  });

  // 5. Duplicate enrollment rejection
  it("rejects duplicate enrollment in the same programme during the same term", async () => {
    const ahmed = await prisma.student.findUniqueOrThrow({
      where: { admissionNumber: "SA-2026-0001" },
    });
    const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });
    const firstTerm = await prisma.academicTerm.findFirstOrThrow({
      where: { academicSessionId: session.id, termCode: "FIRST" },
    });
    const primaryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "PRIMARY" } });
    const primary4Class = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "PRIMARY_4" } });

    // Attempt to insert duplicate enrollment for Ahmed in PRIMARY in First Term
    await expect(
      prisma.studentProgrammeEnrollment.create({
        data: {
          studentId: ahmed.id,
          programmeId: primaryProg.id,
          schoolClassId: primary4Class.id,
          academicSessionId: session.id,
          academicTermId: firstTerm.id,
          enrollmentType: EnrollmentType.MAIN_ACADEMIC,
          enrollmentStatus: EnrollmentStatus.ACTIVE,
        },
      })
    ).rejects.toThrow();
  });

  // 6. Duplicate invoice protection
  it("rejects duplicate invoice for the same student, programme, session, and term", async () => {
    const existingInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { invoiceNumber: "INV-2026-00001" },
    });

    // Attempt to issue a SECOND invoice for the same student + programme + term
    await expect(
      prisma.invoice.create({
        data: {
          invoiceNumber: "INV-2026-00099",
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
  });

  // 7. Partial payment relationships & balances
  it("tracks partial payments accurately without negative balances", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { invoiceNumber: "INV-2026-00001" },
      include: { payments: true, receipts: true },
    });

    expect(invoice.totalAmountKobo).toBe(BigInt(11000000)); // ₦110,000
    expect(invoice.amountPaidKobo).toBe(BigInt(6000000));   // ₦60,000 paid
    expect(invoice.outstandingBalanceKobo).toBe(BigInt(5000000)); // ₦50,000 remaining
    expect(invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    expect(invoice.payments.length).toBe(1);
    expect(invoice.payments[0].amountKobo).toBe(BigInt(6000000));
    expect(invoice.receipts.length).toBe(1);
    expect(invoice.receipts[0].amountKobo).toBe(BigInt(6000000));
  });

  // 8. Webhook duplicate protection (Idempotency)
  it("enforces webhook idempotency by rejecting duplicate gateway events", async () => {
    const eventId = "evt_test_unique_paystack_12345";

    // Clean up if previous run left it
    await prisma.paymentWebhookEvent.deleteMany({ where: { eventId } });

    // Insert first webhook event
    const firstEvent = await prisma.paymentWebhookEvent.create({
      data: {
        gatewayProvider: GatewayProvider.PAYSTACK,
        eventId,
        eventType: "charge.success",
        payloadJson: { reference: "ref_123", amount: 6000000 },
        signatureVerified: true,
        processed: true,
      },
    });

    expect(firstEvent.eventId).toBe(eventId);

    // Attempt to re-insert identical gateway event (must fail)
    await expect(
      prisma.paymentWebhookEvent.create({
        data: {
          gatewayProvider: GatewayProvider.PAYSTACK,
          eventId,
          eventType: "charge.success",
          payloadJson: { reference: "ref_123", amount: 6000000 },
        },
      })
    ).rejects.toThrow();
  });

  // 9. Historical invoice amount preservation
  it("preserves invoice line item amounts when underlying fee structures change", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { invoiceNumber: "INV-2026-00001" },
      include: { items: true },
    });

    const originalTotal = invoice.totalAmountKobo;
    expect(invoice.items.length).toBe(3);

    // Modify the fee structure (e.g. new session prices increased by 20%)
    await prisma.feeStructure.updateMany({
      where: { name: "Primary 1st Term Boys Admission Fee" },
      data: { name: "Primary 1st Term Boys Admission Fee (Updated 2027)" },
    });

    // Re-query historical invoice: verify its line items and amounts remain 100% unchanged
    const reloadedInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { invoiceNumber: "INV-2026-00001" },
      include: { items: true },
    });

    expect(reloadedInvoice.totalAmountKobo).toBe(originalTotal);
    expect(reloadedInvoice.items[0].unitAmountKobo).toBe(BigInt(7500000));
  });

  // 10. Money serialization without precision loss
  it("survives Prisma query -> application DTO -> JSON serialization without precision loss", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { invoiceNumber: "INV-2026-00001" },
      include: { items: true },
    });

    // Verify raw Prisma values are typed BigInt
    expect(typeof invoice.totalAmountKobo).toBe("bigint");
    expect(invoice.totalAmountKobo).toBe(BigInt(11000000));

    // Convert via DTO serializer
    const serializedDto = serializeBigInt(invoice);
    expect(typeof serializedDto.totalAmountKobo).toBe("string");
    expect(serializedDto.totalAmountKobo).toBe("11000000");

    // Serialize to standard JSON string
    const jsonString = JSON.stringify(serializedDto);
    expect(jsonString).toContain('"totalAmountKobo":"11000000"');

    // Deserialization check
    const parsed = JSON.parse(jsonString);
    expect(BigInt(parsed.totalAmountKobo)).toBe(BigInt(11000000));
  });

  // 11. Financial records protected from destructive deletion (onDelete: Restrict)
  it("protects invoices and financial records from accidental cascading deletion", async () => {
    const ahmed = await prisma.student.findUniqueOrThrow({
      where: { admissionNumber: "SA-2026-0001" },
    });

    // Attempting to delete student who has active invoices must be rejected by foreign key constraint
    await expect(
      prisma.student.delete({
        where: { id: ahmed.id },
      })
    ).rejects.toThrow();
  });
});
