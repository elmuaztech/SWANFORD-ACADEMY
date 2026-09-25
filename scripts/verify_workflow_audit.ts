import { prisma } from '../src/lib/prisma';
import {
  createDraftApplication,
  submitApplication,
  reviewProgrammeSelection,
} from '../src/lib/admissions/application_service';
import { createInvoice } from '../src/lib/finance/invoice_service';
import { processVerifiedTransaction } from '../src/lib/paystack/service';
import {
  Gender,
  RelationshipType,
  ApplicationStatus,
  ApplicationPaymentStatus,
  UserStatus,
  RoleCode,
  PaymentTargetType,
  GatewayTransactionStatus,
  GatewayProvider,
} from '@prisma/client';
import { SafeUser } from '../src/lib/auth/service';

async function runVerification() {
  console.log('====================================================');
  console.log('SWANFORD ACADEMY — COMPLETE WORKFLOW VERIFICATION');
  console.log('====================================================\n');

  const testTimestamp = Date.now();
  const testEmail = `parent-audit-${testTimestamp}@swanford.test`;
  const testPhone = `+23480${testTimestamp.toString().slice(-8)}`;

  // Locate genuine admin or first admin user for test actor
  const adminDbUser = await prisma.user.findFirst({
    where: { email: 'swanford99@gmail.com' },
    include: { userRoles: { include: { role: true } } },
  });

  if (!adminDbUser) {
    throw new Error('Designated administrator swanford99@gmail.com not found in database.');
  }

  const adminActor: SafeUser = {
    id: adminDbUser.id,
    email: adminDbUser.email,
    phoneNumber: adminDbUser.phoneNumber,
    status: adminDbUser.status,
    emailVerifiedAt: adminDbUser.emailVerifiedAt,
    lastLoginAt: adminDbUser.lastLoginAt,
    roles: adminDbUser.userRoles.map((r) => r.role.code),
    createdAt: adminDbUser.createdAt,
  };

  // Find canonical session & cycle
  const session = await prisma.academicSession.findFirst({
    where: { name: '2026/2027' },
    include: { terms: true },
  });
  if (!session) throw new Error('Canonical session 2026/2027 not found');

  const firstTerm = session.terms.find((t) => t.termCode === 'FIRST') || session.terms[0];
  if (!firstTerm) throw new Error('First term not found');

  const cycle = await prisma.admissionCycle.findFirst({
    where: { academicSessionId: session.id },
    include: { programmeAvailabilities: { include: { programme: true } } },
  });
  if (!cycle) throw new Error('Admission cycle not found for session 2026/2027');

  const openProgAvailability = cycle.programmeAvailabilities.find((p) => p.status === 'OPEN' && p.programme.isMainAcademic);
  if (!openProgAvailability) throw new Error('No open main academic programme found in cycle');
  const programmeId = openProgAvailability.programmeId;

  console.log('✔ Test prerequisites verified.');
  console.log(` - Admin Actor: ${adminActor.email}`);
  console.log(` - Academic Session: ${session.name}`);
  console.log(` - Programme: ${openProgAvailability.programme.name}\n`);

  // ---------------------------------------------------------------------------
  // TEST 1: New Admission Application & Invoicing Snapshot
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: New Admission Application Submission ---');
  const draft = await createDraftApplication({
    admissionCycleId: cycle.id,
    applicantFirstName: 'Zainab',
    applicantLastName: 'Balarabe',
    applicantGender: Gender.FEMALE,
    applicantDob: new Date('2019-05-15'),
    guardianFirstName: 'Balarabe',
    guardianLastName: 'Musa',
    guardianEmail: testEmail,
    guardianPhone: testPhone,
    guardianRelationship: RelationshipType.FATHER,
    programmeSelections: [{ programmeId }],
  });

  console.log(`✔ Draft application created: ${draft.applicationNumber} (Status: ${draft.status})`);

  const submitted = await submitApplication(draft.id);
  console.log(`✔ Application submitted: ${submitted.applicationNumber}`);
  console.log(` - Status: ${submitted.status} (Expected: SUBMITTED)`);
  console.log(` - Payment Status: ${submitted.paymentStatus} (Expected: PAYMENT_PENDING)`);
  console.log(` - Total Fee: ₦${(Number(submitted.totalAmountKobo) / 100).toLocaleString()}`);

  if (submitted.status !== ApplicationStatus.SUBMITTED) {
    throw new Error(`Expected status SUBMITTED, got ${submitted.status}`);
  }

  // Verify applicant email outbox entry
  const submissionEmail = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `ADMISSION:SUBMITTED:${submitted.id}:${submitted.applicationNumber}`,
      recipientEmail: testEmail,
    },
  });
  if (!submissionEmail) {
    throw new Error('Submission invoice email was not enqueued in notification outbox');
  }
  console.log(`✔ Submission / Fee Invoice email enqueued for ${testEmail} (Idempotency: ${submissionEmail.idempotencyKey})`);

  // Verify Super Admin alert
  const adminSubmitAlert = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `ADMIN_NOTIF:APPLICATION_SUBMITTED:${submitted.id}`,
    },
  });
  if (!adminSubmitAlert) {
    throw new Error('Super Admin admission submission alert was not created');
  }
  console.log(`✔ Super Admin dashboard alert created: "${adminSubmitAlert.subject}"\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Gate Enforcement — Portal User NOT Created Before Acceptance
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Gate Enforcement Before Acceptance ---');
  const userBeforeAcceptance = await prisma.user.findUnique({
    where: { email: testEmail },
  });
  if (userBeforeAcceptance) {
    throw new Error('GATE VIOLATION: Portal user was created before Super Admin acceptance!');
  }
  console.log(`✔ Gate strictly enforced: No portal user account exists for ${testEmail} while application is SUBMITTED.\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: Super Admin Acceptance Gate & Portal User Provisioning
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Super Admin Acceptance Gate ---');
  const selection = submitted.programmeSelections[0];
  const reviewResult = await reviewProgrammeSelection(adminActor, selection.id, {
    decision: 'APPROVED',
    decisionNotes: 'Full compliance with entrance criteria. Offer of admission granted.',
  });

  console.log(`✔ Programme selection reviewed: Decision APPROVED`);
  console.log(` - Application Status: ${reviewResult.applicationStatus} (Expected: APPROVED)`);

  if (reviewResult.applicationStatus !== ApplicationStatus.APPROVED) {
    throw new Error(`Expected application status APPROVED, got ${reviewResult.applicationStatus}`);
  }

  // Verify portal user was provisioned upon acceptance
  const provisionedUser = await prisma.user.findUnique({
    where: { email: testEmail },
    include: {
      userRoles: { include: { role: true } },
      emailVerifications: true,
    },
  });

  if (!provisionedUser) {
    throw new Error('GATE FAILURE: Portal user account was not provisioned upon Super Admin acceptance!');
  }

  console.log(`✔ Parent Portal User created: ${provisionedUser.email}`);
  console.log(` - Status: ${provisionedUser.status} (Expected: PENDING_VERIFICATION)`);
  console.log(` - Roles: ${provisionedUser.userRoles.map((r) => r.role.code).join(', ')} (Expected: PARENT)`);
  console.log(` - Email Verifications: ${provisionedUser.emailVerifications.length} (Token Type: ACCOUNT_ACTIVATION)`);

  // Verify activation email dispatched
  const activationEmail = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `AUTH:ACTIVATION:ADMISSION:${submitted.id}:${provisionedUser.id}`,
      recipientEmail: testEmail,
    },
  });
  if (!activationEmail) {
    throw new Error('Activation email with secure single-use token was not enqueued');
  }
  console.log(`✔ Account activation email enqueued for ${testEmail}`);

  // Verify Super Admin alert for account provisioning
  const adminProvisionAlert = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `ADMIN_NOTIF:PARENT_PROVISIONED:${submitted.id}:${provisionedUser.id}`,
    },
  });
  if (!adminProvisionAlert) {
    throw new Error('Super Admin alert for parent portal provisioning was not created');
  }
  console.log(`✔ Super Admin alert created: "${adminProvisionAlert.subject}"\n`);

  // ---------------------------------------------------------------------------
  // TEST 4: Duplicate Acceptance Idempotency
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Duplicate Acceptance Protection ---');
  // Second review on same selection
  await reviewProgrammeSelection(adminActor, selection.id, {
    decision: 'APPROVED',
    decisionNotes: 'Repeated approval test.',
  });

  const usersCount = await prisma.user.count({
    where: { email: testEmail },
  });
  if (usersCount !== 1) {
    throw new Error(`Duplicate account created! Found ${usersCount} users for ${testEmail}`);
  }
  console.log(`✔ Duplicate protection verified: Exactly 1 portal user account exists.\n`);

  // ---------------------------------------------------------------------------
  // TEST 5: Application Fee Payment Confirmation & Automation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Application Fee Payment Confirmation & Automation ---');
  const appRef = `SWN-APP-${submitted.applicationNumber}-${Date.now().toString(36).toUpperCase()}-TEST12`;

  // Initialize payment transaction
  await prisma.paymentTransaction.create({
    data: {
      gatewayProvider: GatewayProvider.PAYSTACK,
      gatewayReference: appRef,
      applicationId: submitted.id,
      amountKobo: submitted.totalAmountKobo,
      currency: 'NGN',
      status: GatewayTransactionStatus.INITIALIZED,
    },
  });

  const appPayResult = await processVerifiedTransaction(
    appRef,
    {
      id: 999111,
      reference: appRef,
      amount: Number(submitted.totalAmountKobo),
      currency: 'NGN',
      status: 'success',
      paid_at: new Date().toISOString(),
      channel: 'card',
      customer: { email: testEmail },
    }
  );

  console.log(`✔ Application fee payment processed (Ref: ${appRef})`);
  console.log(` - Success: ${appPayResult.success}`);

  const updatedApp = await prisma.application.findUniqueOrThrow({
    where: { id: submitted.id },
  });
  console.log(` - Application Payment Status: ${updatedApp.paymentStatus} (Expected: PAYMENT_CONFIRMED)`);
  console.log(` - Application Amount Paid: ₦${(Number(updatedApp.amountPaidKobo) / 100).toLocaleString()}`);

  if (updatedApp.paymentStatus !== ApplicationPaymentStatus.PAYMENT_CONFIRMED) {
    throw new Error(`Expected application paymentStatus PAYMENT_CONFIRMED, got ${updatedApp.paymentStatus}`);
  }

  // Verify Super Admin alert for application fee payment
  const adminAppPayAlert = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `ADMIN_NOTIF:APP_PAYMENT_CONFIRMED:${appRef}`,
    },
  });
  if (!adminAppPayAlert) {
    throw new Error('Super Admin alert for application fee payment was not created');
  }
  console.log(`✔ Super Admin alert created: "${adminAppPayAlert.subject}"\n`);

  // ---------------------------------------------------------------------------
  // TEST 6: Tuition Invoice Generation & Super Admin Alert
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: School Tuition Invoice Generation & Automation ---');
  // Create a temporary student and guardian for invoice verification
  const testGuardian = await prisma.guardian.create({
    data: {
      firstName: 'Balarabe',
      lastName: 'Musa',
      email: `guardian-${testTimestamp}@swanford.test`,
      phonePrimary: testPhone,
    },
  });

  const testStudent = await prisma.student.create({
    data: {
      admissionNumber: `SA-TEST-${testTimestamp.toString().slice(-4)}`,
      firstName: 'Zainab',
      lastName: 'Balarabe',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2019-05-15'),
      admissionDate: new Date(),
    },
  });

  await prisma.guardianStudentRelationship.create({
    data: {
      guardianId: testGuardian.id,
      studentId: testStudent.id,
      relationshipType: RelationshipType.FATHER,
      isPrimaryContact: true,
      receivesInvoices: true,
    },
  });

  const invoice = await createInvoice(null, {
    studentId: testStudent.id,
    guardianId: testGuardian.id,
    academicSessionId: session.id,
    academicTermId: firstTerm.id,
    programmeId,
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    items: [
      { description: 'First Term Tuition Fee', unitAmountKobo: BigInt(7500000), quantity: 1 },
      { description: 'Exercise Books & Stationeries', unitAmountKobo: BigInt(1500000), quantity: 1 },
    ],
  });

  console.log(`✔ Invoice issued: ${invoice.invoiceNumber}`);
  console.log(` - Total Amount: ₦${(Number(invoice.totalAmountKobo) / 100).toLocaleString()}`);
  console.log(` - Status: ${invoice.status} (Expected: ISSUED)`);

  // Verify Invoice Issued email to guardian
  const invoiceEmail = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `FINANCE:INVOICE_ISSUED:${invoice.id}:${invoice.invoiceNumber}`,
    },
  });
  if (!invoiceEmail) {
    throw new Error('Invoice issued email was not enqueued in notification outbox');
  }
  console.log(`✔ Invoice email enqueued for guardian ${testGuardian.email}`);

  // Verify Super Admin alert for invoice issuance
  const adminInvoiceAlert = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `ADMIN_NOTIF:INVOICE_ISSUED:${invoice.id}`,
    },
  });
  if (!adminInvoiceAlert) {
    throw new Error('Super Admin alert for invoice issuance was not created');
  }
  console.log(`✔ Super Admin alert created: "${adminInvoiceAlert.subject}"\n`);

  // ---------------------------------------------------------------------------
  // TEST 7: Invoice Online Payment, Receipt Issuance & Automation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Invoice Online Payment & Automated Receipt Generation ---');
  const invRef = `SWN-INV-${invoice.invoiceNumber}-${Date.now().toString(36).toUpperCase()}-TEST34`;

  await prisma.paymentTransaction.create({
    data: {
      gatewayProvider: GatewayProvider.PAYSTACK,
      gatewayReference: invRef,
      invoiceId: invoice.id,
      amountKobo: invoice.totalAmountKobo,
      currency: 'NGN',
      status: GatewayTransactionStatus.INITIALIZED,
    },
  });

  const payResult = await processVerifiedTransaction(
    invRef,
    {
      id: 999222,
      reference: invRef,
      amount: Number(invoice.totalAmountKobo),
      currency: 'NGN',
      status: 'success',
      paid_at: new Date().toISOString(),
      channel: 'card',
      customer: { email: testGuardian.email! },
    }
  );

  console.log(`✔ Online payment confirmed by gateway worker (Ref: ${invRef})`);
  console.log(` - Official Receipt Number: ${payResult.receiptNumber}`);

  // Verify invoice updated to PAID with 0 balance
  const paidInvoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
  });
  console.log(` - Invoice Status: ${paidInvoice.status} (Expected: PAID)`);
  console.log(` - Outstanding Balance: ₦${(Number(paidInvoice.outstandingBalanceKobo) / 100).toLocaleString()} (Expected: ₦0.00)`);

  if (paidInvoice.status !== 'PAID' || paidInvoice.outstandingBalanceKobo !== BigInt(0)) {
    throw new Error(`Invoice status or balance mismatch! Status: ${paidInvoice.status}, Balance: ${paidInvoice.outstandingBalanceKobo}`);
  }

  // Verify receipt record created
  const receipt = await prisma.receipt.findFirst({
    where: { receiptNumber: payResult.receiptNumber! },
  });
  if (!receipt) {
    throw new Error(`Receipt record ${payResult.receiptNumber} not found in database`);
  }
  console.log(`✔ Official Receipt verified: ${receipt.receiptNumber} (Amount: ₦${(Number(receipt.amountKobo) / 100).toLocaleString()})`);

  // Verify Receipt Email enqueued to guardian
  const receiptEmail = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `FINANCE:PAYMENT_CONFIRMED:PAYSTACK:${invRef}`,
    },
  });
  if (!receiptEmail) {
    throw new Error('Payment confirmation and receipt email was not enqueued');
  }
  console.log(`✔ Receipt email enqueued for guardian ${testGuardian.email}`);

  // Verify Super Admin alert for invoice payment & receipt
  const adminPayAlert = await prisma.notification.findFirst({
    where: {
      idempotencyKey: `ADMIN_NOTIF:INVOICE_PAYMENT_CONFIRMED:${invRef}`,
    },
  });
  if (!adminPayAlert) {
    throw new Error('Super Admin alert for invoice payment was not created');
  }
  console.log(`✔ Super Admin alert created: "${adminPayAlert.subject}"\n`);

  // ---------------------------------------------------------------------------
  // CLEANUP ISOLATED TEST RECORDS
  // ---------------------------------------------------------------------------
  console.log('--- Cleaning Up Isolated Test Records ---');
  await prisma.paymentAllocation.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.receipt.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.payment.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.paymentTransaction.deleteMany({ where: { gatewayReference: { in: [appRef, invRef] } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.invoice.deleteMany({ where: { id: invoice.id } });
  await prisma.guardianStudentRelationship.deleteMany({ where: { guardianId: testGuardian.id } });
  await prisma.student.deleteMany({ where: { id: testStudent.id } });
  await prisma.guardian.deleteMany({ where: { id: testGuardian.id } });
  await prisma.userRole.deleteMany({ where: { userId: provisionedUser.id } });
  await prisma.emailVerification.deleteMany({ where: { email: testEmail } });
  await prisma.user.deleteMany({ where: { id: provisionedUser.id } });
  await prisma.applicationProgrammeSelection.deleteMany({ where: { applicationId: submitted.id } });
  await prisma.applicationChargeItem.deleteMany({ where: { applicationId: submitted.id } });
  await prisma.application.deleteMany({ where: { id: submitted.id } });
  await prisma.notification.deleteMany({
    where: {
      idempotencyKey: {
        in: [
          `ADMISSION:SUBMITTED:${submitted.id}:${submitted.applicationNumber}`,
          `ADMIN_NOTIF:APPLICATION_SUBMITTED:${submitted.id}`,
          `ADMISSION_DECISION:APPROVED:${submitted.id}`,
          `AUTH:ACTIVATION:ADMISSION:${submitted.id}:${provisionedUser.id}`,
          `ADMIN_NOTIF:PARENT_PROVISIONED:${submitted.id}:${provisionedUser.id}`,
          `ADMIN_NOTIF:APP_PAYMENT_CONFIRMED:${appRef}`,
          `FINANCE:INVOICE_ISSUED:${invoice.id}:${invoice.invoiceNumber}`,
          `ADMIN_NOTIF:INVOICE_ISSUED:${invoice.id}`,
          `FINANCE:PAYMENT_CONFIRMED:PAYSTACK:${invRef}`,
          `ADMIN_NOTIF:INVOICE_PAYMENT_CONFIRMED:${invRef}`,
        ],
      },
    },
  });
  console.log('✔ All isolated test records pruned cleanly.\n');

  console.log('====================================================');
  console.log('🎉 ALL 7 AUDIT WORKFLOW VERIFICATION TESTS PASSED!');
  console.log('====================================================');
}

runVerification()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
