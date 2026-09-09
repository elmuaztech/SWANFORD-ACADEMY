import { renderMasterEmail, RenderedEmail } from './renderer';
import { formatKoboToNaira } from '@/lib/money';

// -----------------------------------------------------------------------------
// 1. AUTHENTICATION TEMPLATES (SECURITY)
// -----------------------------------------------------------------------------

export function renderAccountActivationEmail(data: {
  recipientName: string;
  activationUrl: string;
  expiresInHours?: number;
}): RenderedEmail {
  const hours = data.expiresInHours || 24;
  return renderMasterEmail('Welcome to Swanford Academy — Activate Your Parent Portal Account', {
    title: 'Account Activation',
    recipientName: data.recipientName,
    headline: 'Your Parent Portal Account is Ready for Activation',
    contentParagraphs: [
      'Welcome to Swanford Academy. A parent portal account has been provisioned for you to track academic progress, view invoices, and communicate with the academy.',
      `Please activate your account and establish your secure private password. For your security, this activation link will expire in ${hours} hours.`,
    ],
    callToAction: {
      label: 'Activate Account & Set Password',
      url: data.activationUrl,
    },
    footerNotes: [
      'If you did not request or expect this account, please notify our administrative team immediately.',
      'Swanford Academy · Nursery, Primary & Tahfeez',
    ],
  });
}

export function renderPasswordResetEmail(data: {
  recipientName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}): RenderedEmail {
  const minutes = data.expiresInMinutes || 60;
  return renderMasterEmail('Swanford Academy — Password Reset Request', {
    title: 'Password Reset',
    recipientName: data.recipientName,
    headline: 'Password Reset Verification',
    contentParagraphs: [
      'We received a request to reset the password for your Swanford Academy portal account.',
      `Use the button below to choose a new password. This link is single-use and will expire in ${minutes} minutes.`,
      'If you did not initiate this password reset request, please disregard this email or contact the school office immediately. Your account remains secure.',
    ],
    callToAction: {
      label: 'Reset My Password',
      url: data.resetUrl,
    },
  });
}

export function renderPasswordChangedEmail(data: {
  recipientName: string;
  changeDateFormatted: string;
}): RenderedEmail {
  return renderMasterEmail('Swanford Academy — Security Alert: Password Changed', {
    title: 'Security Alert',
    recipientName: data.recipientName,
    headline: 'Your Portal Password Has Been Successfully Changed',
    contentParagraphs: [
      `This is an automated confirmation that your Swanford Academy account password was updated on ${data.changeDateFormatted}.`,
      'All previous active sessions have been invalidated as a security precaution.',
      'If you did NOT authorize this change, please contact the academy administration immediately to secure your account.',
    ],
  });
}

// -----------------------------------------------------------------------------
// 2. ADMISSIONS TEMPLATES
// -----------------------------------------------------------------------------

export function renderApplicationSubmittedEmail(data: {
  guardianName: string;
  applicantName: string;
  applicationNumber: string;
  programmesList: string;
  totalFeeKobo: bigint | number;
}): RenderedEmail {
  return renderMasterEmail(`Application Received: ${data.applicationNumber} — Swanford Academy`, {
    title: 'Application Submitted',
    recipientName: data.guardianName,
    headline: 'We Have Received Your Admission Application',
    contentParagraphs: [
      `Thank you for applying to Swanford Academy for ${data.applicantName}. We have successfully received your application.`,
      'Please find your official application reference details below. Keep your application number safe for tracking and payment verification.',
    ],
    detailsTable: [
      { label: 'Application Number', value: data.applicationNumber },
      { label: 'Applicant Name', value: data.applicantName },
      { label: 'Selected Programme(s)', value: data.programmesList },
      { label: 'Application Fee', value: formatKoboToNaira(data.totalFeeKobo) },
    ],
    footerNotes: [
      'Application fees must be confirmed before admission screening commences.',
      'Swanford Academy · Admissions Office',
    ],
  });
}

export function renderApplicationFeeConfirmedEmail(data: {
  guardianName: string;
  applicantName: string;
  applicationNumber: string;
  paymentReference: string;
  amountKobo: bigint | number;
}): RenderedEmail {
  return renderMasterEmail(`Application Fee Confirmed: ${data.applicationNumber}`, {
    title: 'Payment Confirmed',
    recipientName: data.guardianName,
    headline: 'Application Fee Payment Confirmed',
    contentParagraphs: [
      `We have confirmed receipt of the application fee for ${data.applicantName}.`,
      'Your application has now progressed to the screening and academic review stage. The admissions committee will contact you regarding subsequent assessment or interview dates.',
    ],
    detailsTable: [
      { label: 'Application Number', value: data.applicationNumber },
      { label: 'Applicant Name', value: data.applicantName },
      { label: 'Payment Reference', value: data.paymentReference },
      { label: 'Amount Paid', value: formatKoboToNaira(data.amountKobo) },
      { label: 'Current Status', value: 'Under Review' },
    ],
  });
}

export function renderAdmissionDecisionEmail(data: {
  guardianName: string;
  applicantName: string;
  applicationNumber: string;
  decision: 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED';
  approvedProgrammes?: string;
  notes?: string;
}): RenderedEmail {
  const isApproved = data.decision === 'APPROVED' || data.decision === 'PARTIALLY_APPROVED';
  const subject = isApproved
    ? `Congratulations: Admission Decision for ${data.applicantName} (${data.applicationNumber})`
    : `Admission Decision: Application ${data.applicationNumber} — Swanford Academy`;

  const headline = isApproved
    ? `Offer of Admission for ${data.applicantName}`
    : `Update on Admission Application for ${data.applicantName}`;

  const paragraphs: string[] = [];

  if (data.decision === 'APPROVED') {
    paragraphs.push(
      `We are pleased to inform you that the admissions committee has approved the application for ${data.applicantName} for admission into Swanford Academy.`,
      `Approved Programme(s): ${data.approvedProgrammes || 'All applied programmes'}.`,
      'Please proceed to review the matriculation terms and complete enrollment to secure this placement.'
    );
  } else if (data.decision === 'PARTIALLY_APPROVED') {
    paragraphs.push(
      `The admissions committee has reviewed the application for ${data.applicantName}. We are pleased to offer admission for the following programme(s): ${data.approvedProgrammes}.`,
      'Please contact the admissions desk if you have any questions regarding your selected programme options.'
    );
  } else {
    paragraphs.push(
      `Thank you for considering Swanford Academy for ${data.applicantName}. Following our academic assessment and review, we regret to inform you that we are unable to offer admission at this time due to cohort capacity constraints.`,
      'We appreciate your interest in Swanford Academy and wish your family all the best in educational pursuits.'
    );
  }

  if (data.notes) {
    paragraphs.push(`Committee Notes: ${data.notes}`);
  }

  return renderMasterEmail(subject, {
    title: 'Admission Decision',
    recipientName: data.guardianName,
    headline,
    contentParagraphs: paragraphs,
    detailsTable: [
      { label: 'Application Number', value: data.applicationNumber },
      { label: 'Applicant Name', value: data.applicantName },
      { label: 'Decision', value: data.decision.replace('_', ' ') },
    ],
  });
}

export function renderMatriculationEnrolledEmail(data: {
  guardianName: string;
  studentName: string;
  admissionNumber: string;
  enrolledProgrammes: string;
}): RenderedEmail {
  return renderMasterEmail(`Official Enrollment: ${data.studentName} (${data.admissionNumber})`, {
    title: 'Enrollment Confirmed',
    recipientName: data.guardianName,
    headline: 'Official Student Matriculation Confirmed',
    contentParagraphs: [
      `We are delighted to welcome ${data.studentName} as an officially enrolled student of Swanford Academy.`,
      'Your child has been assigned their permanent official Student Admission Number. Please retain this number for all future academic and administrative communications.',
    ],
    detailsTable: [
      { label: 'Student Admission Number', value: data.admissionNumber },
      { label: 'Student Full Name', value: data.studentName },
      { label: 'Enrolled Programme(s)', value: data.enrolledProgrammes },
      { label: 'Status', value: 'Active Student' },
    ],
  });
}

// -----------------------------------------------------------------------------
// 3. FINANCE TEMPLATES
// -----------------------------------------------------------------------------

export function renderInvoiceIssuedEmail(data: {
  guardianName: string;
  studentName: string;
  invoiceNumber: string;
  totalAmountKobo: bigint | number;
  dueDateFormatted: string;
  payUrl?: string;
}): RenderedEmail {
  return renderMasterEmail(`New Invoice Issued: ${data.invoiceNumber} — Swanford Academy`, {
    title: 'School Fee Invoice',
    recipientName: data.guardianName,
    headline: `School Fee Invoice for ${data.studentName}`,
    contentParagraphs: [
      `A new school fee invoice (${data.invoiceNumber}) has been generated for ${data.studentName}.`,
      'Kindly review the invoice details and ensure payment is completed on or before the specified due date.',
    ],
    detailsTable: [
      { label: 'Invoice Number', value: data.invoiceNumber },
      { label: 'Student Name', value: data.studentName },
      { label: 'Total Amount Due', value: formatKoboToNaira(data.totalAmountKobo) },
      { label: 'Due Date', value: data.dueDateFormatted },
    ],
    callToAction: data.payUrl
      ? {
          label: 'View Invoice & Pay Online',
          url: data.payUrl,
        }
      : undefined,
  });
}

export function renderPaymentConfirmedEmail(data: {
  guardianName: string;
  receiptNumber: string;
  paymentReference: string;
  amountKobo: bigint | number;
  remainingBalanceKobo: bigint | number;
  paymentMethod: string;
}): RenderedEmail {
  return renderMasterEmail(`Payment Receipt: ${data.receiptNumber} — Swanford Academy`, {
    title: 'Payment Receipt',
    recipientName: data.guardianName,
    headline: 'Official Payment Confirmation & Receipt',
    contentParagraphs: [
      'We gratefully acknowledge receipt of your payment to Swanford Academy.',
      'An official receipt has been recorded in the academy registry. Please find your payment summary below.',
    ],
    detailsTable: [
      { label: 'Receipt Number', value: data.receiptNumber },
      { label: 'Payment Reference', value: data.paymentReference },
      { label: 'Payment Channel', value: data.paymentMethod },
      { label: 'Amount Confirmed', value: formatKoboToNaira(data.amountKobo) },
      { label: 'Outstanding Balance', value: formatKoboToNaira(data.remainingBalanceKobo) },
    ],
  });
}

export function renderPaymentFailedEmail(data: {
  guardianName: string;
  reference: string;
  amountKobo: bigint | number;
  failureReason?: string;
  retryUrl?: string;
}): RenderedEmail {
  return renderMasterEmail(`Payment Notice: Transaction Unsuccessful (Ref: ${data.reference})`, {
    title: 'Payment Notice',
    recipientName: data.guardianName,
    headline: 'Payment Transaction Could Not Be Completed',
    contentParagraphs: [
      `We noticed that your recent payment attempt of ${formatKoboToNaira(data.amountKobo)} (Reference: ${data.reference}) was not completed successfully by the payment provider.`,
      `Reason provided: ${data.failureReason || 'Transaction declined or expired'}.`,
      'No funds were credited to the school ledger. You may retry the transaction using the link below or contact your bank if funds were debited.',
    ],
    callToAction: data.retryUrl
      ? {
          label: 'Retry Payment',
          url: data.retryUrl,
        }
      : undefined,
  });
}

export function renderPaymentReversedEmail(data: {
  guardianName: string;
  receiptNumber: string;
  reversedAmountKobo: bigint | number;
  reversalReason: string;
}): RenderedEmail {
  return renderMasterEmail(`Payment Reversal Notice: Receipt ${data.receiptNumber}`, {
    title: 'Payment Reversal',
    recipientName: data.guardianName,
    headline: 'Official Notice of Payment Reversal',
    contentParagraphs: [
      `This notice confirms that payment under receipt ${data.receiptNumber} has been reversed in the academy records.`,
      `Reason: ${data.reversalReason}.`,
      'The corresponding receipt has been marked void, and your invoice balance has been adjusted accordingly in the school ledger.',
    ],
    detailsTable: [
      { label: 'Voided Receipt Number', value: data.receiptNumber },
      { label: 'Reversed Amount', value: formatKoboToNaira(data.reversedAmountKobo) },
    ],
  });
}
