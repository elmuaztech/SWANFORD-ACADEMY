import { prisma } from '@/lib/prisma';
import { ReminderScheduleStatus, ReminderTargetType } from '@prisma/client';
import { formatNaira } from '@/lib/money';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { renderMasterEmail } from '@/lib/notifications/templates/renderer';
import { VERIFIED_SCHOOL_INFO } from '@/lib/notifications/templates/theme';
import { toAbsoluteEmailUrl } from '@/lib/utils/url';

export interface OutstandingStudentItem {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  admissionNumber: string | null;
  guardianId: string;
  guardianName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  guardianUserId: string | null;
  className: string;
  termName: string;
  sessionName: string;
  totalAmountKobo: string;
  amountPaidKobo: string;
  outstandingBalanceKobo: string;
  totalAmountFormatted: string;
  amountPaidFormatted: string;
  outstandingBalanceFormatted: string;
  category: 'NO_PAYMENT' | 'PARTIAL_PAYMENT' | 'FULLY_PAID';
}

export interface OutstandingFeesSummary {
  sessionName: string;
  termName: string;
  sessionId: string | null;
  termId: string | null;
  counts: {
    noPayment: number;
    partialPayment: number;
    fullyPaid: number;
    totalStudents: number;
  };
  totals: {
    totalBilledKobo: string;
    totalPaidKobo: string;
    totalOutstandingKobo: string;
    totalBilledFormatted: string;
    totalPaidFormatted: string;
    totalOutstandingFormatted: string;
  };
  students: OutstandingStudentItem[];
}

/**
 * Retrieves the term-aware outstanding fees breakdown from real database records.
 * Categorizes students strictly into:
 * A. NO PAYMENT (0 paid, full balance due)
 * B. PARTIAL PAYMENT (partially paid, remaining balance due)
 * C. FULLY PAID (0 balance due)
 */
export async function getOutstandingFeesOverview(
  sessionId?: string,
  termId?: string
): Promise<OutstandingFeesSummary> {
  // Resolve active session & term if not provided
  let activeSessionId = sessionId;
  let activeTermId = termId;

  if (!activeSessionId) {
    const currentSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true, name: true },
    });
    activeSessionId = currentSession?.id;
  }

  if (!activeTermId && activeSessionId) {
    const currentTerm = await prisma.academicTerm.findFirst({
      where: { academicSessionId: activeSessionId, isCurrent: true },
      select: { id: true, name: true },
    });
    activeTermId = currentTerm?.id;
  }

  // Build where clause
  const where: any = {
    status: { notIn: ['CANCELLED', 'REFUNDED'] },
  };
  if (activeSessionId) where.academicSessionId = activeSessionId;
  if (activeTermId) where.academicTermId = activeTermId;

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNumber: true,
          programmeEnrollments: {
            take: 1,
            select: {
              schoolClass: { select: { name: true } },
            },
          },
        },
      },
      guardian: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phonePrimary: true,
          userId: true,
          user: { select: { email: true } },
        },
      },
      programme: { select: { name: true } },
      academicSession: { select: { id: true, name: true } },
      academicTerm: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  let totalBilledKobo = 0n;
  let totalPaidKobo = 0n;
  let totalOutstandingKobo = 0n;

  let noPaymentCount = 0;
  let partialPaymentCount = 0;
  let fullyPaidCount = 0;

  const students: OutstandingStudentItem[] = invoices.map((inv) => {
    const total = BigInt(inv.totalAmountKobo);
    const paid = BigInt(inv.amountPaidKobo);
    const balance = BigInt(inv.outstandingBalanceKobo);

    totalBilledKobo += total;
    totalPaidKobo += paid;
    totalOutstandingKobo += balance;

    let category: 'NO_PAYMENT' | 'PARTIAL_PAYMENT' | 'FULLY_PAID';
    if (balance <= 0n || inv.status === 'PAID') {
      category = 'FULLY_PAID';
      fullyPaidCount++;
    } else if (paid > 0n) {
      category = 'PARTIAL_PAYMENT';
      partialPaymentCount++;
    } else {
      category = 'NO_PAYMENT';
      noPaymentCount++;
    }

    const studentFullName = [inv.student.firstName, inv.student.otherNames, inv.student.lastName]
      .filter(Boolean)
      .join(' ');

    const guardianFullName = [inv.guardian.firstName, inv.guardian.lastName].filter(Boolean).join(' ');
    const email = inv.guardian.email || inv.guardian.user?.email || null;

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      studentId: inv.student.id,
      studentName: studentFullName,
      admissionNumber: inv.student.admissionNumber,
      guardianId: inv.guardian.id,
      guardianName: guardianFullName,
      guardianEmail: email,
      guardianPhone: inv.guardian.phonePrimary || null,
      guardianUserId: inv.guardian.userId || null,
      className: inv.student.programmeEnrollments[0]?.schoolClass?.name || inv.programme?.name || 'Class Assigned',
      termName: inv.academicTerm?.name || 'Current Term',
      sessionName: inv.academicSession?.name || 'Current Session',
      totalAmountKobo: total.toString(),
      amountPaidKobo: paid.toString(),
      outstandingBalanceKobo: balance.toString(),
      totalAmountFormatted: formatNaira(total),
      amountPaidFormatted: formatNaira(paid),
      outstandingBalanceFormatted: formatNaira(balance),
      category,
    };
  });

  const sessionName = invoices[0]?.academicSession?.name || 'Current Session';
  const termName = invoices[0]?.academicTerm?.name || 'Current Term';

  return {
    sessionName,
    termName,
    sessionId: activeSessionId || null,
    termId: activeTermId || null,
    counts: {
      noPayment: noPaymentCount,
      partialPayment: partialPaymentCount,
      fullyPaid: fullyPaidCount,
      totalStudents: students.length,
    },
    totals: {
      totalBilledKobo: totalBilledKobo.toString(),
      totalPaidKobo: totalPaidKobo.toString(),
      totalOutstandingKobo: totalOutstandingKobo.toString(),
      totalBilledFormatted: formatNaira(totalBilledKobo),
      totalPaidFormatted: formatNaira(totalPaidKobo),
      totalOutstandingFormatted: formatNaira(totalOutstandingKobo),
    },
    students,
  };
}

/**
 * Dispatches payment reminders immediately to affected parents.
 * Separates strictly into:
 * 1. NO PAYMENT (indicates no payment has been recorded yet)
 * 2. PARTIAL PAYMENT (shows amount paid, remaining balance, and required amount)
 * Excludes fully paid parents.
 */
export async function sendPaymentRemindersNow(options: {
  sessionId?: string;
  termId?: string;
  targetType?: ReminderTargetType;
  createdById?: string;
}): Promise<{ totalTargeted: number; totalSent: number }> {
  const { sessionId, termId, targetType = 'ALL_OUTSTANDING' } = options;

  const overview = await getOutstandingFeesOverview(sessionId, termId);

  // Filter strictly according to targetType
  const candidates = overview.students.filter((st) => {
    if (st.category === 'FULLY_PAID') return false;
    if (targetType === 'NO_PAYMENT_ONLY') return st.category === 'NO_PAYMENT';
    if (targetType === 'PARTIAL_PAYMENT_ONLY') return st.category === 'PARTIAL_PAYMENT';
    return true; // ALL_OUTSTANDING
  });

  let sentCount = 0;

  for (const item of candidates) {
    if (!item.guardianEmail) continue;

    const isNoPayment = item.category === 'NO_PAYMENT';

    // Tailored polite school wording
    const headline = isNoPayment
      ? `School Fees Reminder — ${item.termName} (${item.sessionName})`
      : `Outstanding Balance Reminder — ${item.termName} (${item.sessionName})`;

    const paragraphs = isNoPayment
      ? [
          `Dear ${item.guardianName},`,
          `This is a polite reminder regarding the school fees for ${item.studentName} (${item.className}) for ${item.termName}, ${item.sessionName}.`,
          `Our records indicate that no payment has been recorded yet for Invoice ${item.invoiceNumber}. The outstanding fee amount is ${item.outstandingBalanceFormatted}.`,
          `We kindly request that payment be made promptly through the secure Parent Portal or direct bank transfer. If payment has recently been made, please disregard this notice or contact the school office.`,
        ]
      : [
          `Dear ${item.guardianName},`,
          `Thank you for your recent payment towards school fees for ${item.studentName} (${item.className}) for ${item.termName}, ${item.sessionName}.`,
          `We have credited ${item.amountPaidFormatted} towards Invoice ${item.invoiceNumber}. The remaining balance required to complete the term fees is ${item.outstandingBalanceFormatted}.`,
          `We kindly request that the balance be settled at your earliest convenience through the Parent Portal or direct bank transfer. Thank you for your continued support and cooperation.`,
        ];

    const detailsTable = isNoPayment
      ? [
          { label: 'Pupil Name', value: item.studentName },
          { label: 'Class', value: item.className },
          { label: 'Session / Term', value: `${item.sessionName} — ${item.termName}` },
          { label: 'Invoice Number', value: item.invoiceNumber },
          { label: 'Total Outstanding', value: item.outstandingBalanceFormatted, isEmphasized: true },
        ]
      : [
          { label: 'Pupil Name', value: item.studentName },
          { label: 'Class', value: item.className },
          { label: 'Session / Term', value: `${item.sessionName} — ${item.termName}` },
          { label: 'Total Billed', value: item.totalAmountFormatted },
          { label: 'Amount Paid', value: item.amountPaidFormatted },
          { label: 'Remaining Balance', value: item.outstandingBalanceFormatted, isEmphasized: true },
        ];

    const rendered = renderMasterEmail('SWANFORD ACADEMY', {
      title: 'Fee Payment Reminder',
      badge: 'Bursary Notice',
      recipientName: item.guardianName,
      headline,
      contentParagraphs: paragraphs,
      detailsTable,
      callToAction: {
        label: 'View Invoice & Pay Online',
        url: toAbsoluteEmailUrl('/parent'),
      },
      footerNotes: [
        `${VERIFIED_SCHOOL_INFO.name}`,
        `${VERIFIED_SCHOOL_INFO.address}`,
      ],
    });

    const idempotencyKey = `fee-reminder-${item.invoiceId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      await enqueueNotification({
        idempotencyKey,
        recipientEmail: item.guardianEmail,
        recipientUserId: item.guardianUserId || undefined,
        recipientPhone: item.guardianPhone || undefined,
        channel: 'EMAIL',
        category: 'FINANCE',
        templateName: isNoPayment ? 'fee_reminder_no_payment' : 'fee_reminder_partial_payment',
        subject: 'SWANFORD ACADEMY',
        bodyText: rendered.text,
        htmlBody: rendered.html,
        metadata: {
          invoiceId: item.invoiceId,
          studentId: item.studentId,
          category: item.category,
          balance: item.outstandingBalanceFormatted,
        },
      });

      sentCount++;
    } catch (err) {
      console.error(`[Reminder Error] Failed to enqueue reminder for invoice ${item.invoiceId}:`, err);
    }
  }

  // Record immediate execution into ScheduledReminder
  await prisma.scheduledReminder.create({
    data: {
      academicSessionId: overview.sessionId,
      academicTermId: overview.termId,
      scheduledFor: new Date(),
      targetType,
      status: ReminderScheduleStatus.COMPLETED,
      totalTargeted: candidates.length,
      totalSent: sentCount,
      sentAt: new Date(),
      notes: 'Immediate reminder triggered by Super Admin',
    },
  });

  return {
    totalTargeted: candidates.length,
    totalSent: sentCount,
  };
}

/**
 * Creates a server-side scheduled reminder.
 * Persists to PostgreSQL. The deployed server processes it at the designated time.
 */
export async function schedulePaymentReminder(data: {
  sessionId?: string;
  termId?: string;
  scheduledFor: Date;
  targetType?: ReminderTargetType;
  notes?: string;
  createdById?: string;
}) {
  const { sessionId, termId, scheduledFor, targetType = 'ALL_OUTSTANDING', notes } = data;

  return prisma.scheduledReminder.create({
    data: {
      academicSessionId: sessionId || null,
      academicTermId: termId || null,
      scheduledFor,
      targetType,
      status: ReminderScheduleStatus.PENDING,
      notes: notes || null,
    },
  });
}

/**
 * Cancels a pending scheduled reminder.
 */
export async function cancelScheduledReminder(id: string) {
  return prisma.scheduledReminder.update({
    where: { id },
    data: {
      status: ReminderScheduleStatus.CANCELLED,
      cancelledAt: new Date(),
    },
  });
}

/**
 * Lists scheduled reminders with session and term details.
 */
export async function listScheduledReminders(filters?: {
  sessionId?: string;
  termId?: string;
  status?: ReminderScheduleStatus;
}) {
  const where: any = {};
  if (filters?.sessionId) where.academicSessionId = filters.sessionId;
  if (filters?.termId) where.academicTermId = filters.termId;
  if (filters?.status) where.status = filters.status;

  return prisma.scheduledReminder.findMany({
    where,
    include: {
      academicSession: { select: { id: true, name: true } },
      academicTerm: { select: { id: true, name: true } },
    },
    orderBy: { scheduledFor: 'desc' },
  });
}

/**
 * Independent Server-Side Scheduled Process.
 * Evaluates CURRENT database records at the scheduled time.
 * Parents who have already paid are automatically excluded.
 */
export async function processDueScheduledReminders(): Promise<number> {
  const now = new Date();

  // Find pending schedules whose scheduled time has arrived
  const dueSchedules = await prisma.scheduledReminder.findMany({
    where: {
      status: ReminderScheduleStatus.PENDING,
      scheduledFor: { lte: now },
    },
  });

  if (dueSchedules.length === 0) return 0;

  let processedCount = 0;

  for (const schedule of dueSchedules) {
    try {
      // Mark as PROCESSING
      await prisma.scheduledReminder.update({
        where: { id: schedule.id },
        data: { status: ReminderScheduleStatus.PROCESSING },
      });

      // Query latest database records at execution time!
      const overview = await getOutstandingFeesOverview(
        schedule.academicSessionId || undefined,
        schedule.academicTermId || undefined
      );

      const candidates = overview.students.filter((st) => {
        if (st.category === 'FULLY_PAID') return false;
        if (schedule.targetType === 'NO_PAYMENT_ONLY') return st.category === 'NO_PAYMENT';
        if (schedule.targetType === 'PARTIAL_PAYMENT_ONLY') return st.category === 'PARTIAL_PAYMENT';
        return true;
      });

      let sent = 0;
      for (const item of candidates) {
        if (!item.guardianEmail) continue;

        const isNoPayment = item.category === 'NO_PAYMENT';
        const headline = isNoPayment
          ? `School Fees Reminder — ${item.termName} (${item.sessionName})`
          : `Outstanding Balance Reminder — ${item.termName} (${item.sessionName})`;

        const paragraphs = isNoPayment
          ? [
              `Dear ${item.guardianName},`,
              `This is a polite reminder regarding the school fees for ${item.studentName} (${item.className}) for ${item.termName}, ${item.sessionName}.`,
              `Our records indicate that no payment has been recorded yet for Invoice ${item.invoiceNumber}. The outstanding fee amount is ${item.outstandingBalanceFormatted}.`,
              `We kindly request that payment be made promptly through the secure Parent Portal or direct bank transfer. If payment has recently been made, please disregard this notice or contact the school office.`,
            ]
          : [
              `Dear ${item.guardianName},`,
              `Thank you for your recent payment towards school fees for ${item.studentName} (${item.className}) for ${item.termName}, ${item.sessionName}.`,
              `We have credited ${item.amountPaidFormatted} towards Invoice ${item.invoiceNumber}. The remaining balance required to complete the term fees is ${item.outstandingBalanceFormatted}.`,
              `We kindly request that the balance be settled at your earliest convenience through the Parent Portal or direct bank transfer. Thank you for your continued support and cooperation.`,
            ];

        const detailsTable = isNoPayment
          ? [
              { label: 'Pupil Name', value: item.studentName },
              { label: 'Class', value: item.className },
              { label: 'Session / Term', value: `${item.sessionName} — ${item.termName}` },
              { label: 'Invoice Number', value: item.invoiceNumber },
              { label: 'Total Outstanding', value: item.outstandingBalanceFormatted, isEmphasized: true },
            ]
          : [
              { label: 'Pupil Name', value: item.studentName },
              { label: 'Class', value: item.className },
              { label: 'Session / Term', value: `${item.sessionName} — ${item.termName}` },
              { label: 'Total Billed', value: item.totalAmountFormatted },
              { label: 'Amount Paid', value: item.amountPaidFormatted },
              { label: 'Remaining Balance', value: item.outstandingBalanceFormatted, isEmphasized: true },
            ];

        const rendered = renderMasterEmail('SWANFORD ACADEMY', {
          title: 'Fee Payment Reminder',
          badge: 'Bursary Notice',
          recipientName: item.guardianName,
          headline,
          contentParagraphs: paragraphs,
          detailsTable,
          callToAction: {
            label: 'View Invoice & Pay Online',
            url: toAbsoluteEmailUrl('/parent'),
          },
          footerNotes: [
            `${VERIFIED_SCHOOL_INFO.name}`,
            `${VERIFIED_SCHOOL_INFO.address}`,
          ],
        });

        const idempotencyKey = `sched-reminder-${schedule.id}-${item.invoiceId}-${now.toISOString().split('T')[0]}`;

        try {
          await enqueueNotification({
            idempotencyKey,
            recipientEmail: item.guardianEmail,
            recipientUserId: item.guardianUserId || undefined,
            recipientPhone: item.guardianPhone || undefined,
            channel: 'EMAIL',
            category: 'FINANCE',
            templateName: isNoPayment ? 'fee_reminder_no_payment' : 'fee_reminder_partial_payment',
            subject: 'SWANFORD ACADEMY',
            bodyText: rendered.text,
            htmlBody: rendered.html,
            metadata: {
              invoiceId: item.invoiceId,
              studentId: item.studentId,
              category: item.category,
              balance: item.outstandingBalanceFormatted,
              scheduledReminderId: schedule.id,
            },
          });
          sent++;
        } catch (e) {
          console.error(`[Scheduled Reminder Worker Error] Could not enqueue for invoice ${item.invoiceId}:`, e);
        }
      }

      await prisma.scheduledReminder.update({
        where: { id: schedule.id },
        data: {
          status: ReminderScheduleStatus.COMPLETED,
          totalTargeted: candidates.length,
          totalSent: sent,
          sentAt: new Date(),
        },
      });

      processedCount++;
    } catch (err) {
      console.error(`[Scheduled Reminder Processing Error] Schedule ID: ${schedule.id}`, err);
      await prisma.scheduledReminder.update({
        where: { id: schedule.id },
        data: { status: ReminderScheduleStatus.FAILED },
      });
    }
  }

  return processedCount;
}
