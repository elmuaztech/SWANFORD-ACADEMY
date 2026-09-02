import { PrismaClient, EnrollmentType, EnrollmentStatus, Gender, RelationshipType, PaymentMethod, PaymentStatus, InvoiceStatus } from "@prisma/client";

/**
 * Swanford Academy - Development & QA Mock Seed
 *
 * CRITICAL SAFETY INVARIANT:
 * This script MUST NEVER execute in a production environment.
 * It seeds realistic demonstration entities for developer testing:
 * - Multi-child parent (Muhammad Sani)
 * - Dual-programme enrolled student (Ahmed: Primary 4 + Tahfeez)
 * - Sibling (Fatima: Nursery 2)
 * - Sample invoices & payment ledger entries
 */
export async function seedDevelopmentMocks(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL SAFETY VIOLATION: seedDevelopmentMocks called in PRODUCTION environment!");
  }

  console.log("-> Seeding Development Demonstration Mocks...");

  // 1. Find Academic Session, Term, and Classes
  const session = await prisma.academicSession.findUniqueOrThrow({ where: { name: "2026/2027" } });
  const firstTerm = await prisma.academicTerm.findFirstOrThrow({
    where: { academicSessionId: session.id, termCode: "FIRST" },
  });

  const primaryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "PRIMARY" } });
  const nurseryProg = await prisma.programme.findUniqueOrThrow({ where: { code: "NURSERY" } });
  const tahfeezProg = await prisma.programme.findUniqueOrThrow({ where: { code: "TAHFEEZ" } });

  const primary4Class = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "PRIMARY_4" } });
  const nursery2Class = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "NURSERY_2" } });
  const tahfeezClass = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "TAHFEEZ_GROUP_A" } });

  // 2. Multi-Child Parent User & Guardian Profile
  const parentUser = await prisma.user.upsert({
    where: { email: "muhammad.sani.parent@swanford.example.com" },
    update: {},
    create: {
      email: "muhammad.sani.parent@swanford.example.com",
      phoneNumber: "+2348030001122",
      passwordHash: "$2a$12$e8Yk1H6qGqG.g1lq3YpE.e8Oq1q6y6kGqG.g1lq3YpE.e8Oq1q6y6",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: "PARENT" } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: parentUser.id, roleId: parentRole.id } },
    update: {},
    create: { userId: parentUser.id, roleId: parentRole.id },
  });

  const guardian = await prisma.guardian.upsert({
    where: { email: "muhammad.sani.parent@swanford.example.com" },
    update: {},
    create: {
      userId: parentUser.id,
      title: "Alhaji",
      firstName: "Muhammad",
      lastName: "Sani",
      email: "muhammad.sani.parent@swanford.example.com",
      phonePrimary: "+2348030001122",
      residentialAddress: "14 Ahmadu Bello Way, Dutse",
      occupation: "Civil Servant",
      isVerified: true,
      verifiedAt: new Date(),
    },
  });

  // 3. Child 1: Ahmed Sani (Enrolled in Primary 4 AND Tahfeez)
  const ahmed = await prisma.student.upsert({
    where: { admissionNumber: "SA-2026-0001" },
    update: {},
    create: {
      admissionNumber: "SA-2026-0001",
      firstName: "Ahmed",
      lastName: "Sani",
      gender: Gender.MALE,
      dateOfBirth: new Date("2016-04-12"),
      currentStatus: "ACTIVE",
    },
  });

  // Link Guardian to Ahmed
  await prisma.guardianStudentRelationship.upsert({
    where: { guardianId_studentId: { guardianId: guardian.id, studentId: ahmed.id } },
    update: {},
    create: {
      guardianId: guardian.id,
      studentId: ahmed.id,
      relationshipType: RelationshipType.FATHER,
      isPrimaryContact: true,
      receivesInvoices: true,
    },
  });

  // Ahmed's Main Academic Enrollment: Primary 4
  await prisma.studentProgrammeEnrollment.upsert({
    where: {
      unique_student_programme_term_enrollment: {
        studentId: ahmed.id,
        programmeId: primaryProg.id,
        academicSessionId: session.id,
        academicTermId: firstTerm.id,
      },
    },
    update: {},
    create: {
      studentId: ahmed.id,
      programmeId: primaryProg.id,
      schoolClassId: primary4Class.id,
      academicSessionId: session.id,
      academicTermId: firstTerm.id,
      enrollmentType: EnrollmentType.MAIN_ACADEMIC,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
  });

  // Ahmed's Additional Programme Enrollment: Tahfeez
  await prisma.studentProgrammeEnrollment.upsert({
    where: {
      unique_student_programme_term_enrollment: {
        studentId: ahmed.id,
        programmeId: tahfeezProg.id,
        academicSessionId: session.id,
        academicTermId: firstTerm.id,
      },
    },
    update: {},
    create: {
      studentId: ahmed.id,
      programmeId: tahfeezProg.id,
      schoolClassId: tahfeezClass.id,
      academicSessionId: session.id,
      academicTermId: firstTerm.id,
      enrollmentType: EnrollmentType.ADDITIONAL_PROGRAMME,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
  });

  // 4. Child 2: Fatima Sani (Enrolled in Nursery 2)
  const fatima = await prisma.student.upsert({
    where: { admissionNumber: "SA-2026-0002" },
    update: {},
    create: {
      admissionNumber: "SA-2026-0002",
      firstName: "Fatima",
      lastName: "Sani",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2021-08-20"),
      currentStatus: "ACTIVE",
    },
  });

  // Link Guardian to Fatima (Proving 1 Parent -> Multiple Children)
  await prisma.guardianStudentRelationship.upsert({
    where: { guardianId_studentId: { guardianId: guardian.id, studentId: fatima.id } },
    update: {},
    create: {
      guardianId: guardian.id,
      studentId: fatima.id,
      relationshipType: RelationshipType.FATHER,
      isPrimaryContact: true,
      receivesInvoices: true,
    },
  });

  // Fatima's Enrollment: Nursery 2
  await prisma.studentProgrammeEnrollment.upsert({
    where: {
      unique_student_programme_term_enrollment: {
        studentId: fatima.id,
        programmeId: nurseryProg.id,
        academicSessionId: session.id,
        academicTermId: firstTerm.id,
      },
    },
    update: {},
    create: {
      studentId: fatima.id,
      programmeId: nurseryProg.id,
      schoolClassId: nursery2Class.id,
      academicSessionId: session.id,
      academicTermId: firstTerm.id,
      enrollmentType: EnrollmentType.MAIN_ACADEMIC,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
  });

  // 5. Sample Financial Invoices for Ahmed
  // Primary 4 School Fee Invoice: ₦110,000 (11000000 kobo)
  const primaryInvoice = await prisma.invoice.upsert({
    where: { invoiceNumber: "INV-2026-00001" },
    update: {},
    create: {
      invoiceNumber: "INV-2026-00001",
      studentId: ahmed.id,
      guardianId: guardian.id,
      academicSessionId: session.id,
      academicTermId: firstTerm.id,
      programmeId: primaryProg.id,
      totalAmountKobo: BigInt(11000000),
      amountPaidKobo: BigInt(6000000),
      outstandingBalanceKobo: BigInt(5000000),
      status: InvoiceStatus.PARTIALLY_PAID,
      dueDate: new Date("2026-09-30"),
      items: {
        create: [
          { description: "Tuition & Learning Materials", unitAmountKobo: BigInt(7500000), quantity: 1, totalAmountKobo: BigInt(7500000) },
          { description: "Primary Uniform & Sportswear", unitAmountKobo: BigInt(2500000), quantity: 1, totalAmountKobo: BigInt(2500000) },
          { description: "Medical & Exam Levy", unitAmountKobo: BigInt(1000000), quantity: 1, totalAmountKobo: BigInt(1000000) },
        ],
      },
    },
  });

  // Tahfeez Fee Invoice: ₦18,000 (1800000 kobo)
  await prisma.invoice.upsert({
    where: { invoiceNumber: "INV-2026-00002" },
    update: {},
    create: {
      invoiceNumber: "INV-2026-00002",
      studentId: ahmed.id,
      guardianId: guardian.id,
      academicSessionId: session.id,
      academicTermId: firstTerm.id,
      programmeId: tahfeezProg.id,
      totalAmountKobo: BigInt(1800000),
      amountPaidKobo: BigInt(0),
      outstandingBalanceKobo: BigInt(1800000),
      status: InvoiceStatus.ISSUED,
      dueDate: new Date("2026-09-30"),
      items: {
        create: [
          { description: "Tahfeez Programme Instruction", unitAmountKobo: BigInt(1000000), quantity: 1, totalAmountKobo: BigInt(1000000) },
          { description: "Tahfeez Study Materials & Robe", unitAmountKobo: BigInt(800000), quantity: 1, totalAmountKobo: BigInt(800000) },
        ],
      },
    },
  });

  // Partial Payment on Ahmed's Primary Invoice: ₦60,000 (6000000 kobo)
  const payment = await prisma.payment.upsert({
    where: { paymentReference: "PAY-2026-00001" },
    update: {},
    create: {
      paymentReference: "PAY-2026-00001",
      invoiceId: primaryInvoice.id,
      studentId: ahmed.id,
      payerGuardianId: guardian.id,
      amountKobo: BigInt(6000000),
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      status: PaymentStatus.CONFIRMED,
      notes: "Direct bank transfer payment for 1st Term installment",
    },
  });

  // Issue Official Receipt
  await prisma.receipt.upsert({
    where: { receiptNumber: "REC-2026-00001" },
    update: {},
    create: {
      receiptNumber: "REC-2026-00001",
      paymentId: payment.id,
      invoiceId: primaryInvoice.id,
      issuedToName: "Alhaji Muhammad Sani",
      amountKobo: BigInt(6000000),
    },
  });

  console.log("✔ Development Demonstration Mocks Seeded Successfully.");
}
