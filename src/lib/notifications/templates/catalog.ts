import { renderMasterEmail, RenderedEmail, escapeHtml } from './renderer';
import { formatKoboToNaira } from '@/lib/money';
import { VERIFIED_SCHOOL_INFO, BRAND_COLORS } from './theme';

// -----------------------------------------------------------------------------
// 1. AUTHENTICATION & SECURITY TEMPLATES
// -----------------------------------------------------------------------------

export function renderPasswordResetOtpEmail(data: {
  recipientName: string;
  otpCode: string;
  expiresInMinutes?: number;
}): RenderedEmail {
  const minutes = data.expiresInMinutes || 2;
  return renderMasterEmail('Swanford Academy — Password Reset Verification Code', {
    title: 'Password Reset Verification Code',
    badge: 'Security Verification',
    recipientName: data.recipientName,
    headline: 'Your 4-Digit Password Reset Verification Code',
    contentParagraphs: [
      'We received a request to verify your identity to reset the password for your Swanford Academy portal account.',
      `Please enter the 4-digit code below into the verification screen. For your strict protection, this single-use code expires in ${minutes} minutes.`,
      'If you did not initiate this request, no action is needed. Your account remains completely safe and secure.',
    ],
    otpBox: {
      code: data.otpCode,
      expiresInMinutes: minutes,
    },
    detailsTable: [
      { label: 'Security Purpose', value: 'Password Reset Verification' },
      { label: 'Code Validity', value: `${minutes} Minutes (Strict Single-Use)` },
      { label: 'Security Advice', value: 'Never share this code with anyone' },
    ],
    footerNotes: [
      'Swanford Academy staff and administrators will NEVER ask for your password or OTP verification code.',
      `${VERIFIED_SCHOOL_INFO.name}`,
    ],
  });
}

export function renderAccountActivationEmail(data: {
  recipientName: string;
  activationUrl: string;
  expiresInHours?: number;
  roleName?: string;
}): RenderedEmail {
  const hours = data.expiresInHours || 24;
  return renderMasterEmail('SWANFORD ACADEMY', {
    title: 'Account Activation',
    badge: 'Parent Portal Onboarding',
    recipientName: data.recipientName,
    headline: 'Your Official Parent Portal Account is Ready for Activation',
    contentParagraphs: [
      'Welcome to Swanford Academy. An official parent portal account has been established for you to track academic achievements, view financial invoices, access school announcements, and communicate with administration.',
      `In accordance with institutional security standards, you must establish your own private credentials. Please click the activation button below to set your confidential password. For security, this link will expire in ${hours} hours.`,
    ],
    callToAction: {
      label: 'Activate Account & Set Password',
      url: data.activationUrl,
    },
    detailsTable: [
      { label: 'Account Holder', value: data.recipientName },
      { label: 'Access Level', value: data.roleName || 'Parent / Legal Guardian' },
      { label: 'Activation Window', value: `${hours} Hours` },
    ],
    footerNotes: [
      'If you did not expect this account activation, please contact the administrative registry immediately.',
      `${VERIFIED_SCHOOL_INFO.name}`,
    ],
  });
}

export function renderWelcomeNewUserEmail(data: {
  recipientName: string;
  roleName: string;
  email: string;
  temporaryPassword?: string;
  loginUrl?: string;
  activationUrl?: string;
  expiresInHours?: number;
}): RenderedEmail {
  const hours = data.expiresInHours || 24;
  const isTempPass = Boolean(data.temporaryPassword);

  const paragraphs = isTempPass
    ? [
        `Welcome to Swanford Academy. An official account has been provisioned for you with the assigned role of ${data.roleName}.`,
        'Your initial temporary login credentials have been generated below. Upon your first sign in, you will be required to change your temporary password to a secure permanent password of your own choosing.',
        'Please sign in to your authorized portal using the credentials provided below to complete your onboarding.',
      ]
    : [
        `Welcome to Swanford Academy. An official account has been provisioned for you with the assigned role of ${data.roleName}.`,
        'Swanford Academy strictly follows a secure credential standard: system administrators never view or store plaintext passwords.',
        `Please activate your account and establish your private password using the button below. This link expires in ${hours} hours.`,
      ];

  const detailsTable = isTempPass
    ? [
        { label: 'Registered Email', value: data.email },
        { label: 'Assigned Role', value: data.roleName },
        { label: 'Temporary Password', value: data.temporaryPassword! },
        { label: 'Security Policy', value: 'Mandatory password change on first sign in' },
      ]
    : [
        { label: 'Registered Email', value: data.email },
        { label: 'Assigned Role', value: data.roleName },
        { label: 'Link Expiry Window', value: `${hours} Hours` },
      ];

  const ctaUrl = data.loginUrl || data.activationUrl || '/auth/login';
  const ctaLabel = isTempPass ? 'Sign In to Portal' : 'Activate Account & Set Password';

  return renderMasterEmail('SWANFORD ACADEMY', {
    title: 'Official Account Provisioning',
    badge: 'Account Provisioning',
    recipientName: data.recipientName,
    headline: 'Your Official Swanford Academy Account Is Ready',
    contentParagraphs: paragraphs,
    detailsTable,
    callToAction: {
      label: ctaLabel,
      url: ctaUrl,
    },
    footerNotes: [
      'Keep your credentials secure. Swanford Academy administration will never ask for your password.',
      `${VERIFIED_SCHOOL_INFO.name}`,
    ],
  });
}

export function renderPasswordResetEmail(data: {
  recipientName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}): RenderedEmail {
  const minutes = data.expiresInMinutes || 2;
  return renderMasterEmail('Swanford Academy — Password Reset Request', {
    title: 'Password Reset',
    badge: 'Security Request',
    recipientName: data.recipientName,
    headline: 'Password Reset Verification',
    contentParagraphs: [
      'We received a request to reset the password for your Swanford Academy portal account.',
      `Click the button below to choose a new private password. For your security, this single-use link expires in ${minutes} minutes.`,
      'If you did not request this password reset, please ignore this email or notify the administrative desk immediately. Your account remains protected.',
    ],
    callToAction: {
      label: 'Reset My Password',
      url: data.resetUrl,
    },
    detailsTable: [
      { label: 'Account Holder', value: data.recipientName },
      { label: 'Request Expiry', value: `${minutes} Minutes` },
      { label: 'Status', value: 'Awaiting User Action' },
    ],
  });
}

export function renderAdminPasswordResetEmail(data: {
  recipientName: string;
  resetUrl: string;
  expiresInHours?: number;
}): RenderedEmail {
  const hours = data.expiresInHours || 24;
  return renderMasterEmail('Swanford Academy — Administrative Password Reset', {
    title: 'Administrative Password Reset',
    badge: 'Administrative Notice',
    recipientName: data.recipientName,
    headline: 'An Administrator Has Initiated a Secure Password Reset',
    contentParagraphs: [
      'An administrator at Swanford Academy has initiated a secure password reset for your portal account to assist you.',
      'To maintain complete privacy and data security, administrators cannot assign or view your password. Please click the button below to set your confidential password.',
      `This link is single-use and will expire in ${hours} hours. All previous active sessions have been safely invalidated.`,
    ],
    callToAction: {
      label: 'Set New Password',
      url: data.resetUrl,
    },
  });
}

export function renderEmailChangedNotification(data: {
  recipientName: string;
  oldEmail: string;
  newEmail: string;
  isNewEmailNotice: boolean;
  verificationUrl?: string;
}): RenderedEmail {
  if (data.isNewEmailNotice) {
    return renderMasterEmail('Swanford Academy — Verify Your Updated Email Address', {
      title: 'Email Address Verification',
      badge: 'Account Management',
      recipientName: data.recipientName,
      headline: 'Verify Your Updated Account Email Address',
      contentParagraphs: [
        `An administrative update was requested to associate this email address (${data.newEmail}) with your Swanford Academy account.`,
        'Please verify this email address using the link below to confirm ownership and maintain communication delivery.',
      ],
      callToAction: data.verificationUrl
        ? { label: 'Verify Email Address', url: data.verificationUrl }
        : undefined,
    });
  }

  return renderMasterEmail('Swanford Academy — Security Alert: Account Email Address Changed', {
    title: 'Security Alert: Email Updated',
    badge: 'Security Alert',
    recipientName: data.recipientName,
    headline: 'Your Primary Account Email Has Been Updated',
    contentParagraphs: [
      `This is a security alert to confirm that the primary email address for your Swanford Academy account was changed from ${data.oldEmail} to ${data.newEmail}.`,
      'If you did not authorize this change, please contact the academy administration immediately to safeguard your account.',
    ],
    detailsTable: [
      { label: 'Previous Registered Email', value: data.oldEmail },
      { label: 'New Registered Email', value: data.newEmail },
      { label: 'Notice Timestamp', value: new Date().toUTCString() },
    ],
  });
}

export function renderPasswordChangedEmail(data: {
  recipientName: string;
  changeDateFormatted: string;
}): RenderedEmail {
  return renderMasterEmail('Swanford Academy — Security Alert: Password Changed', {
    title: 'Password Updated',
    badge: 'Security Alert',
    recipientName: data.recipientName,
    headline: 'Your Portal Password Has Been Successfully Changed',
    contentParagraphs: [
      `This is an automated confirmation that your Swanford Academy account password was updated on ${data.changeDateFormatted}.`,
      'All previous active sessions have been invalidated as an institutional security precaution.',
      'If you did NOT authorize this change, please contact the academy administration immediately to secure your account.',
    ],
    detailsTable: [
      { label: 'Account Holder', value: data.recipientName },
      { label: 'Timestamp', value: data.changeDateFormatted },
      { label: 'Session Status', value: 'All previous sessions revoked' },
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
    title: 'Admission Application Submitted',
    badge: 'Admissions Office',
    statusBadge: { label: 'Under Review & Screening', variant: 'info' },
    recipientName: data.guardianName,
    headline: 'We Have Received Your Admission Application',
    contentParagraphs: [
      `Thank you for choosing Swanford Academy for ${data.applicantName}. Your admission application has been successfully received by the registry.`,
      'Please find your official application reference details below. Kindly retain your application number for status tracking, screening schedules, and payment verification.',
    ],
    detailsTable: [
      { label: 'Application Number', value: data.applicationNumber, isEmphasized: true },
      { label: 'Applicant Full Name', value: data.applicantName },
      { label: 'Applied Programme(s)', value: data.programmesList },
      { label: 'Application Fee', value: formatKoboToNaira(data.totalFeeKobo), isEmphasized: true },
      { label: 'Review Stage', value: 'Screening & Academic Evaluation' },
    ],
    footerNotes: [
      'Application fees must be confirmed before admission screening commences.',
      `${VERIFIED_SCHOOL_INFO.name} &bull; Admissions Committee`,
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
    title: 'Application Fee Confirmed',
    badge: 'Admissions Office',
    statusBadge: { label: 'Payment Confirmed', variant: 'success' },
    recipientName: data.guardianName,
    headline: 'Application Fee Payment Confirmed',
    contentParagraphs: [
      `We have confirmed receipt of the application fee for ${data.applicantName}.`,
      'Your application has now progressed to the academic evaluation and screening stage. The admissions desk will contact you regarding upcoming assessment and interview schedules.',
    ],
    detailsTable: [
      { label: 'Application Number', value: data.applicationNumber },
      { label: 'Applicant Name', value: data.applicantName },
      { label: 'Payment Reference', value: data.paymentReference },
      { label: 'Amount Confirmed', value: formatKoboToNaira(data.amountKobo), isEmphasized: true },
      { label: 'Current Status', value: 'Screening & Assessment' },
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
    ? `Congratulations: Admission Offer for ${data.applicantName} (${data.applicationNumber})`
    : `Admission Decision: Application ${data.applicationNumber} — Swanford Academy`;

  const headline = isApproved
    ? `Offer of Admission for ${data.applicantName}`
    : `Update on Admission Application for ${data.applicantName}`;

  const paragraphs: string[] = [];

  if (data.decision === 'APPROVED') {
    paragraphs.push(
      `We are pleased to inform you that the admissions committee has approved the application for ${data.applicantName} for admission into Swanford Academy.`,
      `Approved Programme(s): ${data.approvedProgrammes || 'All applied programmes'}.`,
      'Please proceed to review the matriculation requirements and complete registration to secure placement.'
    );
  } else if (data.decision === 'PARTIALLY_APPROVED') {
    paragraphs.push(
      `The admissions committee has reviewed the application for ${data.applicantName}. We are pleased to offer admission for the following programme(s): ${data.approvedProgrammes}.`,
      'Please contact the admissions desk if you have any questions regarding your placement options.'
    );
  } else {
    paragraphs.push(
      `Thank you for considering Swanford Academy for ${data.applicantName}.`,
      data.notes
        ? `Reason for Decision: ${data.notes}`
        : 'Following academic assessment and review of the application dossier, we regret to inform you that we are unable to offer admission at this time due to cohort capacity constraints.',
      'We appreciate your interest in our institution and wish your child every success in their educational journey.'
    );
  }

  if (isApproved && data.notes) {
    paragraphs.push(`Committee Remarks: ${data.notes}`);
  }

  return renderMasterEmail(subject, {
    title: 'Admission Decision Notice',
    badge: 'Admissions Decision',
    statusBadge: {
      label: isApproved ? 'OFFER OF ADMISSION' : 'APPLICATION NOT SUCCESSFUL',
      variant: isApproved ? 'success' : 'danger',
    },
    recipientName: data.guardianName,
    headline,
    contentParagraphs: paragraphs,
    detailsTable: [
      { label: 'Application Number', value: data.applicationNumber },
      { label: 'Applicant Name', value: data.applicantName },
      { label: 'Decision', value: data.decision.replace('_', ' ') },
      ...(data.approvedProgrammes ? [{ label: 'Approved Placement', value: data.approvedProgrammes }] : []),
      ...(!isApproved && data.notes ? [{ label: 'Decision Reason', value: data.notes }] : []),
    ],
  });
}

export function renderOfficialAdmissionLetterEmail(data: {
  guardianName: string;
  guardianPhone?: string;
  applicantName: string;
  applicationNumber: string;
  applicantDob: string;
  applicantGender: string;
  programmesList: string;
  academicSessionName: string;
  profilePhotoDataUri?: string | null;
  admissionLetterUrl: string;
  dateIssued?: string;
  notes?: string;
}): RenderedEmail {
  const subject = `Congratulations: Official Admission Letter for ${data.applicantName} (${data.applicationNumber}) — Swanford Academy`;
  const formattedDate = data.dateIssued || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const logoSrc = process.env.EMAIL_LOGO_URL && process.env.EMAIL_LOGO_URL.startsWith('https://')
    ? escapeHtml(process.env.EMAIL_LOGO_URL)
    : 'cid:swanford-logo';

  const photoHtml = data.profilePhotoDataUri
    ? `<img src="${data.profilePhotoDataUri}" alt="${escapeHtml(data.applicantName)}" style="display: block; width: 90px; height: 90px; border-radius: 8px; object-fit: cover; border: 2px solid ${BRAND_COLORS.goldAccent}; margin: 0 auto 12px;" />`
    : `<div style="width: 80px; height: 80px; border-radius: 8px; background-color: ${BRAND_COLORS.maroonSoft}; border: 2px dashed ${BRAND_COLORS.goldAccent}; text-align: center; line-height: 80px; font-weight: 800; font-size: 24px; color: ${BRAND_COLORS.maroonPrimary}; margin: 0 auto 12px;">${escapeHtml(data.applicantName.charAt(0))}</div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; }
    @media screen and (max-width: 600px) {
      .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
      .mobile-stack { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_COLORS.creamCanvas}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${BRAND_COLORS.textDark};">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND_COLORS.creamCanvas}; padding: 24px 8px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; background-color: #FFFFFF; border: 1px solid ${BRAND_COLORS.borderSubtle}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(91, 6, 18, 0.08);">
          
          <!-- Institutional Header -->
          <tr>
            <td align="center" style="background-color: ${BRAND_COLORS.maroonPrimary}; padding: 26px 20px 20px; border-bottom: 4px solid ${BRAND_COLORS.goldAccent}; text-align: center;">
              <div style="width: 76px; height: 76px; background-color: #FFFFFF; border-radius: 12px; border: 2px solid ${BRAND_COLORS.goldAccent}; text-align: center; vertical-align: middle; overflow: hidden; display: inline-block; margin: 0 auto 10px;">
                <img src="${logoSrc}" alt="Swanford Academy Crest" width="76" height="76" style="display: block; width: 76px; height: 76px; object-fit: contain; margin: 0 auto;" />
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #FFFFFF; letter-spacing: 1px; text-transform: uppercase;">SWANFORD ACADEMY</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: ${BRAND_COLORS.goldAccent}; font-style: italic; font-weight: 500;">Nursery &bull; Primary &bull; Tahfeez School &bull; Dutse, Jigawa State</p>
              <p style="margin: 2px 0 0; font-size: 11px; color: #EADBDA;">&ldquo;<em>${escapeHtml(VERIFIED_SCHOOL_INFO.motto.replace(/[“”"]/g, ''))}</em>&rdquo;</p>
            </td>
          </tr>

          <!-- Letter Meta & Ref -->
          <tr>
            <td style="padding: 14px 24px; background-color: ${BRAND_COLORS.creamCanvas}; border-bottom: 1px solid ${BRAND_COLORS.borderSubtle}; font-size: 12px; color: ${BRAND_COLORS.textMuted};">
              <table role="presentation" width="100%">
                <tr>
                  <td style="font-family: monospace; font-size: 12px; font-weight: 700; color: ${BRAND_COLORS.maroonPrimary};">
                    REF: SA/ADM/${new Date().getFullYear()}/${escapeHtml(data.applicationNumber.replace('APP-', ''))}
                  </td>
                  <td style="text-align: right; font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.textDark};">
                    Date: ${escapeHtml(formattedDate)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Congratulations & Offer Title Banner -->
          <tr>
            <td style="padding: 24px 24px 12px; text-align: center;">
              <div style="display: inline-block; padding: 6px 20px; background-color: ${BRAND_COLORS.goldSoft}; border: 1px solid ${BRAND_COLORS.goldAccent}; border-radius: 9999px; margin-bottom: 12px;">
                <span style="font-size: 12px; font-weight: 800; color: ${BRAND_COLORS.goldText}; letter-spacing: 1px; text-transform: uppercase;">
                  OFFICIAL OFFER OF PROVISIONAL ADMISSION
                </span>
              </div>
              <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: ${BRAND_COLORS.maroonPrimary};">
                Congratulations, ${escapeHtml(data.applicantName)}!
              </h2>
            </td>
          </tr>

          <!-- Child Profile & Dossier Table -->
          <tr>
            <td class="mobile-padding" style="padding: 12px 24px 20px;">
              <div style="background-color: #FAFAFA; border: 1px solid ${BRAND_COLORS.borderLight}; border-radius: 10px; padding: 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="mobile-stack" align="center" valign="middle" style="width: 110px; padding-right: 18px; text-align: center;">
                      ${photoHtml}
                      <span style="display: block; font-size: 10px; font-weight: 700; color: ${BRAND_COLORS.maroonPrimary}; text-transform: uppercase;">Admitted Pupil</span>
                    </td>
                    <td class="mobile-stack" valign="top">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                        <tr>
                          <td style="padding: 5px 0; color: ${BRAND_COLORS.textLight}; font-weight: 500;">Pupil Full Name:</td>
                          <td style="padding: 5px 0; font-weight: 700; color: ${BRAND_COLORS.textDark}; text-align: right;">${escapeHtml(data.applicantName)}</td>
                        </tr>
                        <tr>
                          <td style="padding: 5px 0; color: ${BRAND_COLORS.textLight}; font-weight: 500;">Application Number:</td>
                          <td style="padding: 5px 0; font-weight: 700; color: ${BRAND_COLORS.maroonPrimary}; font-family: monospace; text-align: right;">${escapeHtml(data.applicationNumber)}</td>
                        </tr>
                        <tr>
                          <td style="padding: 5px 0; color: ${BRAND_COLORS.textLight}; font-weight: 500;">Programme Admitted:</td>
                          <td style="padding: 5px 0; font-weight: 700; color: ${BRAND_COLORS.textDark}; text-align: right;">${escapeHtml(data.programmesList)}</td>
                        </tr>
                        <tr>
                          <td style="padding: 5px 0; color: ${BRAND_COLORS.textLight}; font-weight: 500;">Academic Session:</td>
                          <td style="padding: 5px 0; font-weight: 600; color: ${BRAND_COLORS.textDark}; text-align: right;">${escapeHtml(data.academicSessionName)}</td>
                        </tr>
                        <tr>
                          <td style="padding: 5px 0; color: ${BRAND_COLORS.textLight}; font-weight: 500;">Date of Birth / Gender:</td>
                          <td style="padding: 5px 0; font-weight: 600; color: ${BRAND_COLORS.textDark}; text-align: right;">${escapeHtml(data.applicantDob)} &bull; ${escapeHtml(data.applicantGender)}</td>
                        </tr>
                        <tr>
                          <td style="padding: 5px 0; color: ${BRAND_COLORS.textLight}; font-weight: 500;">Parent / Guardian:</td>
                          <td style="padding: 5px 0; font-weight: 600; color: ${BRAND_COLORS.textDark}; text-align: right;">${escapeHtml(data.guardianName)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Formal Admission Offer Body Paragraphs -->
          <tr>
            <td class="mobile-padding" style="padding: 8px 24px 16px; font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.textSecondary};">
              <p style="margin: 0 0 14px;">Dear <strong>${escapeHtml(data.guardianName)}</strong>,</p>
              <p style="margin: 0 0 14px;">
                Following the successful entrance screening, document evaluation, and committee assessment, we are delighted to offer <strong>${escapeHtml(data.applicantName)}</strong> provisional admission into <strong>Swanford Academy</strong> for the <strong>${escapeHtml(data.academicSessionName)}</strong>.
              </p>
              <p style="margin: 0 0 14px;">
                Swanford Academy provides a premier integrated learning environment combining the standard Nigerian basic education curriculum with authentic Qur'anic memorization (Tahfeez) and moral character building.
              </p>
              
              <div style="background-color: ${BRAND_COLORS.creamCanvas}; border-left: 3px solid ${BRAND_COLORS.maroonPrimary}; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; font-size: 13px;">
                <strong style="color: ${BRAND_COLORS.maroonPrimary}; display: block; margin-bottom: 6px;">Next Steps to Confirm Placement:</strong>
                <ol style="margin: 0; padding-left: 18px; line-height: 1.5;">
                  <li>Log in to your parent portal or visit the Admissions Desk to confirm acceptance within fourteen (14) days.</li>
                  <li>Complete tuition fee settlement to secure your child's classroom seat and uniform kit.</li>
                  <li>Present original birth certificate and medical immunization records upon physical resumption.</li>
                </ol>
              </div>

              ${data.notes ? `<p style="margin: 12px 0; font-size: 13px; color: ${BRAND_COLORS.maroonPrimary};"><strong>Admissions Committee Remarks:</strong> ${escapeHtml(data.notes)}</p>` : ''}
            </td>
          </tr>

          <!-- A4 Print / Download Call to Action -->
          <tr>
            <td align="center" style="padding: 10px 24px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: ${BRAND_COLORS.maroonPrimary};">
                    <a href="${escapeHtml(data.admissionLetterUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 700; color: #FFFFFF; text-decoration: none; border-radius: 8px; min-height: 44px; line-height: 20px;">
                      📄 View &amp; Print Official Admission Letter (A4)
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 10px 0 0; font-size: 12px; color: ${BRAND_COLORS.textLight};">
                Formatted as a single-page official A4 document ready for printing or saving as PDF.
              </p>
            </td>
          </tr>

          <!-- Institutional Signatures Block -->
          <tr>
            <td class="mobile-padding" style="padding: 16px 24px 24px; border-top: 1px solid ${BRAND_COLORS.borderLight};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 12px;">
                <tr>
                  <td valign="top" style="width: 50%; color: ${BRAND_COLORS.textMuted};">
                    <div style="font-family: Georgia, serif; font-size: 16px; color: ${BRAND_COLORS.maroonPrimary}; font-style: italic; margin-bottom: 4px;">Admissions Registry</div>
                    <strong>Admissions Committee Secretary</strong><br />
                    Swanford Academy, Dutse
                  </td>
                  <td valign="top" style="width: 50%; text-align: right; color: ${BRAND_COLORS.textMuted};">
                    <div style="font-family: Georgia, serif; font-size: 16px; color: ${BRAND_COLORS.maroonPrimary}; font-style: italic; margin-bottom: 4px;">Muhammad Kanti</div>
                    <strong>School Director / Proprietor</strong><br />
                    Swanford Academy, Jigawa State
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${BRAND_COLORS.creamCanvas}; padding: 18px 24px; border-top: 1px solid ${BRAND_COLORS.borderSubtle}; text-align: center; font-size: 11px; color: ${BRAND_COLORS.textLight}; line-height: 1.5;">
              <p style="margin: 0;">${escapeHtml(VERIFIED_SCHOOL_INFO.name)} &bull; ${escapeHtml(VERIFIED_SCHOOL_INFO.address)}</p>
              <p style="margin: 4px 0 0;">Admissions Desk: ${escapeHtml(VERIFIED_SCHOOL_INFO.email)} &bull; Tel: ${escapeHtml(VERIFIED_SCHOOL_INFO.phone)}</p>
              <p style="margin: 6px 0 0; color: #94A3B8;">&copy; 2026 ${escapeHtml(VERIFIED_SCHOOL_INFO.name)}. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  let text = `====================================================\n`;
  text += `${VERIFIED_SCHOOL_INFO.name.toUpperCase()}\n`;
  text += `${VERIFIED_SCHOOL_INFO.subtitle}\n`;
  text += `"${VERIFIED_SCHOOL_INFO.motto}"\n`;
  text += `====================================================\n\n`;
  text += `REF: SA/ADM/${new Date().getFullYear()}/${data.applicationNumber.replace('APP-', '')}\n`;
  text += `DATE: ${formattedDate}\n\n`;
  text += `OFFICIAL OFFER OF PROVISIONAL ADMISSION\n`;
  text += `Congratulations, ${data.applicantName}!\n\n`;
  text += `PUPIL DETAILS:\n`;
  text += `- Name: ${data.applicantName}\n`;
  text += `- Application Number: ${data.applicationNumber}\n`;
  text += `- Admitted Programme: ${data.programmesList}\n`;
  text += `- Academic Session: ${data.academicSessionName}\n`;
  text += `- Date of Birth: ${data.applicantDob}\n`;
  text += `- Gender: ${data.applicantGender}\n`;
  text += `- Guardian: ${data.guardianName}\n\n`;
  text += `Dear ${data.guardianName},\n\n`;
  text += `Following the successful entrance screening and committee assessment, we are pleased to offer ${data.applicantName} provisional admission into Swanford Academy for the ${data.academicSessionName}.\n\n`;
  text += `NEXT STEPS:\n`;
  text += `1. Confirm acceptance within 14 days.\n`;
  text += `2. Complete school fees settlement.\n`;
  text += `3. Present original birth certificate and medical immunization records upon physical resumption.\n\n`;
  if (data.notes) {
    text += `Admissions Committee Remarks: ${data.notes}\n\n`;
  }
  text += `Download & Print Official A4 Admission Letter:\n${data.admissionLetterUrl}\n\n`;
  text += `Warm regards,\n`;
  text += `Admissions Committee & School Management\n`;
  text += `${VERIFIED_SCHOOL_INFO.name}, Dutse, Jigawa State\n`;

  return { subject, html, text };
}

export function renderMatriculationEnrolledEmail(data: {
  guardianName: string;
  studentName: string;
  admissionNumber: string;
  enrolledProgrammes: string;
}): RenderedEmail {
  return renderMasterEmail(`Official Enrollment: ${data.studentName} (${data.admissionNumber})`, {
    title: 'Student Matriculation Confirmed',
    badge: 'Academic Registry',
    statusBadge: { label: 'Officially Enrolled', variant: 'success' },
    recipientName: data.guardianName,
    headline: 'Official Student Matriculation Confirmed',
    contentParagraphs: [
      `We are delighted to welcome ${data.studentName} as an officially matriculated student of Swanford Academy.`,
      'Your child has been assigned their permanent official Student Admission Number. Please retain this number for all subsequent academic, attendance, and administrative communications.',
    ],
    detailsTable: [
      { label: 'Official Admission Number', value: data.admissionNumber, isEmphasized: true },
      { label: 'Student Full Name', value: data.studentName },
      { label: 'Enrolled Programme(s)', value: data.enrolledProgrammes },
      { label: 'Enrollment Status', value: 'Active Student' },
    ],
    footerNotes: [
      `${VERIFIED_SCHOOL_INFO.name} &bull; Registry & Academic Records`,
    ],
  });
}

// -----------------------------------------------------------------------------
// 3. FINANCE & INVOICE TEMPLATES
// -----------------------------------------------------------------------------

export function renderAdmissionInvoiceEmail(data: {
  guardianName: string;
  applicantName: string;
  invoiceNumber: string;
  applicationNumber?: string;
  totalAmountKobo: bigint | number;
  dueDateFormatted: string;
  payUrl?: string;
  lineItems?: Array<{ description: string; amountKobo: bigint | number }>;
  status?: string;
}): RenderedEmail {
  const lineItems = data.lineItems || [
    { description: 'Admission & Application Processing Fee', amountKobo: data.totalAmountKobo },
  ];

  return renderMasterEmail(`Admission Invoice: ${data.invoiceNumber} — Swanford Academy`, {
    title: 'Admission Invoice',
    badge: 'Admissions & Finance',
    statusBadge: { label: data.status || 'Payment Due', variant: 'warning' },
    recipientName: data.guardianName,
    headline: `Admission Fee Invoice for ${data.applicantName}`,
    contentParagraphs: [
      `An official admission fee invoice (${data.invoiceNumber}) has been generated for applicant ${data.applicantName}.`,
      'Please review the itemized breakdown below and complete payment on or before the due date to ensure processing.',
    ],
    detailsTable: [
      { label: 'Invoice Number', value: data.invoiceNumber, isEmphasized: true },
      { label: 'Applicant Name', value: data.applicantName },
      ...(data.applicationNumber ? [{ label: 'Application Number', value: data.applicationNumber }] : []),
      { label: 'Invoice Type', value: 'Admission & Screening Fee' },
      { label: 'Due Date', value: data.dueDateFormatted },
      { label: 'Total Due', value: formatKoboToNaira(data.totalAmountKobo), isEmphasized: true },
    ],
    lineItemsTable: lineItems.map((item) => ({
      description: item.description,
      amount: formatKoboToNaira(item.amountKobo),
    })),
    tableSummary: {
      total: formatKoboToNaira(data.totalAmountKobo),
    },
    callToAction: data.payUrl
      ? {
          label: 'Pay Admission Fee Online',
          url: data.payUrl,
        }
      : undefined,
    footerNotes: [
      `Payment Reference: ${data.invoiceNumber}`,
      `Official Bank Details: ${VERIFIED_SCHOOL_INFO.bankName}, Account: ${VERIFIED_SCHOOL_INFO.bankAccountNumber} (${VERIFIED_SCHOOL_INFO.bankAccountName})`,
    ],
  });
}

export function renderInvoiceIssuedEmail(data: {
  guardianName: string;
  studentName: string;
  invoiceNumber: string;
  totalAmountKobo: bigint | number;
  dueDateFormatted: string;
  payUrl?: string;
  termName?: string;
  lineItems?: Array<{ description: string; amountKobo: bigint | number }>;
  status?: string;
}): RenderedEmail {
  const lineItems = data.lineItems || [
    { description: 'Term Tuition & Academic Services', amountKobo: data.totalAmountKobo },
  ];

  return renderMasterEmail(`School Fee Invoice: ${data.invoiceNumber} — Swanford Academy`, {
    title: 'School Fee Invoice',
    badge: 'Finance & Accounts',
    statusBadge: { label: data.status || 'Payment Due', variant: 'warning' },
    recipientName: data.guardianName,
    headline: `School Fee Invoice for ${data.studentName}`,
    contentParagraphs: [
      `A new school fee invoice (${data.invoiceNumber}) has been issued for ${data.studentName}${data.termName ? ` for ${data.termName}` : ''}.`,
      'Kindly review the fee schedule below and ensure settlement on or before the due date to ensure continuous academic standing.',
    ],
    detailsTable: [
      { label: 'Invoice Number', value: data.invoiceNumber, isEmphasized: true },
      { label: 'Student Name', value: data.studentName },
      ...(data.termName ? [{ label: 'Academic Term', value: data.termName }] : []),
      { label: 'Total Amount Due', value: formatKoboToNaira(data.totalAmountKobo), isEmphasized: true },
      { label: 'Payment Due Date', value: data.dueDateFormatted },
    ],
    lineItemsTable: lineItems.map((item) => ({
      description: item.description,
      amount: formatKoboToNaira(item.amountKobo),
    })),
    tableSummary: {
      total: formatKoboToNaira(data.totalAmountKobo),
    },
    callToAction: data.payUrl
      ? {
          label: 'View Invoice & Pay Online',
          url: data.payUrl,
        }
      : undefined,
    footerNotes: [
      `Official Bank Details: ${VERIFIED_SCHOOL_INFO.bankName}, Account No: ${VERIFIED_SCHOOL_INFO.bankAccountNumber} (${VERIFIED_SCHOOL_INFO.bankAccountName})`,
      `${VERIFIED_SCHOOL_INFO.name} &bull; Bursary Office`,
    ],
  });
}

export function renderPaymentConfirmedEmail(data: {
  guardianName: string;
  receiptNumber: string;
  paymentReference: string;
  amountKobo: bigint | number;
  remainingBalanceKobo: bigint | number;
  paymentMethod: string;
  paymentDateFormatted?: string;
  invoiceNumber?: string;
}): RenderedEmail {
  const isPaidInFull = data.remainingBalanceKobo <= BigInt(0);

  return renderMasterEmail(`Payment Confirmation: Receipt ${data.receiptNumber} — Swanford Academy`, {
    title: 'Payment Confirmation',
    badge: 'Finance & Bursary',
    statusBadge: {
      label: isPaidInFull ? 'CONFIRMED — PAID IN FULL' : 'CONFIRMED — PARTIAL PAYMENT',
      variant: 'success',
    },
    recipientName: data.guardianName,
    headline: 'Official Payment Confirmation',
    contentParagraphs: [
      'We gratefully acknowledge receipt of your payment to Swanford Academy.',
      'Your payment has been successfully recorded in the institutional ledger. Please find your official confirmation summary below.',
    ],
    detailsTable: [
      { label: 'Official Receipt Number', value: data.receiptNumber, isEmphasized: true },
      { label: 'Payment Reference', value: data.paymentReference },
      ...(data.invoiceNumber ? [{ label: 'Invoice Reference', value: data.invoiceNumber }] : []),
      { label: 'Payment Channel', value: data.paymentMethod },
      { label: 'Amount Confirmed', value: formatKoboToNaira(data.amountKobo), isEmphasized: true },
      { label: 'Outstanding Balance', value: formatKoboToNaira(data.remainingBalanceKobo) },
      ...(data.paymentDateFormatted ? [{ label: 'Payment Date', value: data.paymentDateFormatted }] : []),
    ],
    footerNotes: [
      'An official receipt has been issued and filed in the registry records.',
      `${VERIFIED_SCHOOL_INFO.name} &bull; Bursary & Accounts`,
    ],
  });
}

export function renderPaymentReceiptEmail(data: {
  guardianName: string;
  receiptNumber: string;
  paymentReference: string;
  amountKobo: bigint | number;
  remainingBalanceKobo: bigint | number;
  paymentMethod: string;
  paymentDateFormatted: string;
  invoiceNumber?: string;
  studentName?: string;
}): RenderedEmail {
  const isPaidInFull = data.remainingBalanceKobo <= BigInt(0);

  return renderMasterEmail(`Official Payment Receipt: ${data.receiptNumber} — Swanford Academy`, {
    title: 'Official Payment Receipt',
    badge: 'Official Bursary Receipt',
    statusBadge: {
      label: isPaidInFull ? 'RECEIPT PAID IN FULL' : 'RECEIPT PARTIAL PAYMENT',
      variant: 'success',
    },
    recipientName: data.guardianName,
    headline: `Payment Receipt: ${data.receiptNumber}`,
    contentParagraphs: [
      'This document serves as your official electronic receipt confirming payment credited to Swanford Academy.',
      'Thank you for your prompt fulfillment of academic fees. Please keep this receipt for your records.',
    ],
    detailsTable: [
      { label: 'Receipt Number', value: data.receiptNumber, isEmphasized: true },
      { label: 'Payment Reference', value: data.paymentReference },
      ...(data.studentName ? [{ label: 'Student / Applicant Name', value: data.studentName }] : []),
      ...(data.invoiceNumber ? [{ label: 'Invoice Number', value: data.invoiceNumber }] : []),
      { label: 'Payment Date & Time', value: data.paymentDateFormatted },
      { label: 'Payment Channel', value: data.paymentMethod },
      { label: 'Amount Paid', value: formatKoboToNaira(data.amountKobo), isEmphasized: true },
      { label: 'Remaining Balance', value: formatKoboToNaira(data.remainingBalanceKobo) },
    ],
    footerNotes: [
      'This is an official receipt issued by the Swanford Academy Finance Office.',
      `${VERIFIED_SCHOOL_INFO.name}`,
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
    badge: 'Payment Notice',
    statusBadge: { label: 'Transaction Incomplete', variant: 'danger' },
    recipientName: data.guardianName,
    headline: 'Payment Transaction Could Not Be Completed',
    contentParagraphs: [
      `We noticed that your recent payment attempt of ${formatKoboToNaira(data.amountKobo)} (Reference: ${data.reference}) was not completed successfully by the payment provider.`,
      `Reason provided: ${data.failureReason || 'Transaction declined, cancelled, or timed out'}.`,
      'No funds were credited to the school ledger. If your bank account was debited, please contact your financial institution with the transaction reference.',
    ],
    detailsTable: [
      { label: 'Payment Reference', value: data.reference },
      { label: 'Attempted Amount', value: formatKoboToNaira(data.amountKobo) },
      { label: 'Provider Response', value: data.failureReason || 'Declined' },
      { label: 'Ledger Status', value: 'Uncredited (No debit to student balance)' },
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
    badge: 'Bursary Adjustment',
    statusBadge: { label: 'Payment Voided / Reversed', variant: 'danger' },
    recipientName: data.guardianName,
    headline: 'Official Notice of Payment Reversal',
    contentParagraphs: [
      `This notice confirms that payment under receipt ${data.receiptNumber} has been reversed in the academy records.`,
      `Reason for reversal: ${data.reversalReason}.`,
      'The corresponding receipt has been voided, and your invoice balance has been adjusted accordingly in the school ledger.',
    ],
    detailsTable: [
      { label: 'Voided Receipt Number', value: data.receiptNumber, isEmphasized: true },
      { label: 'Reversed Amount', value: formatKoboToNaira(data.reversedAmountKobo), isEmphasized: true },
      { label: 'Reason for Adjustment', value: data.reversalReason },
      { label: 'Effective Date', value: new Date().toLocaleDateString('en-GB') },
    ],
  });
}

// -----------------------------------------------------------------------------
// 4. ADMINISTRATIVE & ACADEMIC TEMPLATES
// -----------------------------------------------------------------------------

export function renderResultPublishedEmail(data: {
  recipientName: string;
  studentName: string;
  subjectName: string;
  grade: string;
  resultsUrl: string;
}): RenderedEmail {
  return renderMasterEmail(`Swanford Academy — Academic Result Published: ${data.studentName}`, {
    title: 'Academic Results Published',
    badge: 'Academic Assessment',
    statusBadge: { label: 'Results Published', variant: 'success' },
    recipientName: data.recipientName,
    headline: `New Academic Result Published for ${data.studentName}`,
    contentParagraphs: [
      `Official results have been reviewed and published for ${data.studentName} in ${data.subjectName}.`,
      `Performance Grade: ${data.grade}.`,
      'You can view the comprehensive performance breakdown, teacher remarks, and continuous assessment breakdown on the Parent Portal.',
    ],
    detailsTable: [
      { label: 'Student Name', value: data.studentName },
      { label: 'Subject / Course', value: data.subjectName },
      { label: 'Assessed Grade', value: data.grade, isEmphasized: true },
    ],
    callToAction: {
      label: 'View Results on Portal',
      url: data.resultsUrl,
    },
    footerNotes: [
      `${VERIFIED_SCHOOL_INFO.name} &bull; Academic Board & Registry`,
    ],
  });
}

export function renderAssessmentSubmittedEmail(data: {
  recipientName: string;
  teacherName: string;
  assessmentTitle: string;
  className: string;
  subjectName?: string;
  reviewUrl: string;
}): RenderedEmail {
  return renderMasterEmail(`Assessment Submitted for Review: ${data.assessmentTitle}`, {
    title: 'Assessment Review',
    badge: 'Teacher Operations',
    statusBadge: { label: 'Awaiting Admin Review', variant: 'info' },
    recipientName: data.recipientName,
    headline: 'Teacher Submitted Assessment Scores for Approval',
    contentParagraphs: [
      `Teacher ${data.teacherName} has submitted student scores for "${data.assessmentTitle}" in ${data.className}${data.subjectName ? ` (${data.subjectName})` : ''}.`,
      'Please review the score submissions and finalize or publish the results when approved.',
    ],
    detailsTable: [
      { label: 'Assessment Title', value: data.assessmentTitle },
      { label: 'Class / Section', value: data.className },
      { label: 'Submitting Teacher', value: data.teacherName },
      ...(data.subjectName ? [{ label: 'Subject', value: data.subjectName }] : []),
    ],
    callToAction: {
      label: 'Review Assessment Scores',
      url: data.reviewUrl,
    },
  });
}

export function renderAttendanceWarningEmail(data: {
  recipientName: string;
  studentName: string;
  className: string;
  absentDaysCount: number;
  attendancePercentage: number;
  portalUrl: string;
}): RenderedEmail {
  return renderMasterEmail(`Swanford Academy — Attendance Alert for ${data.studentName}`, {
    title: 'Attendance Alert',
    badge: 'Student Welfare',
    statusBadge: { label: 'Attendance Warning', variant: 'warning' },
    recipientName: data.recipientName,
    headline: `Attendance Notice: ${data.studentName}`,
    contentParagraphs: [
      `Our records indicate that ${data.studentName} (${data.className}) has accumulated ${data.absentDaysCount} absences this term, bringing current attendance to ${data.attendancePercentage}%.`,
      'Consistent attendance is essential for your child’s academic and Tahfeez development. If these absences were due to medical reasons or an emergency, please notify the school office.',
    ],
    detailsTable: [
      { label: 'Student Name', value: data.studentName },
      { label: 'Class', value: data.className },
      { label: 'Total Absences This Term', value: `${data.absentDaysCount} Days` },
      { label: 'Term Attendance Rate', value: `${data.attendancePercentage}%`, isEmphasized: true },
    ],
    callToAction: {
      label: 'View Attendance Record',
      url: data.portalUrl,
    },
    footerNotes: [
      `${VERIFIED_SCHOOL_INFO.name} Administration &bull; Student Welfare Desk`,
    ],
  });
}

export function renderGeneralBroadcastEmail(data: {
  recipientName: string;
  headline: string;
  bodyParagraphs: string[];
  actionLabel?: string;
  actionUrl?: string;
}): RenderedEmail {
  return renderMasterEmail(`Swanford Academy Announcement: ${data.headline}`, {
    title: 'School Announcement',
    badge: 'General Broadcast',
    recipientName: data.recipientName,
    headline: data.headline,
    contentParagraphs: data.bodyParagraphs,
    callToAction: data.actionLabel && data.actionUrl ? {
      label: data.actionLabel,
      url: data.actionUrl,
    } : undefined,
  });
}

// -----------------------------------------------------------------------------
// 5. SMTP TEST EMAIL (ADMINISTRATIVE VERIFICATION)
// -----------------------------------------------------------------------------

export function renderSmtpTestEmail(data: {
  initiatorEmail: string;
  recipientEmail: string;
  providerInfo?: string;
  securityInfo?: string;
  timestampFormatted?: string;
}): RenderedEmail {
  const timestamp = data.timestampFormatted || new Date().toUTCString();
  const provider = data.providerInfo || 'Gmail SMTP (smtp.gmail.com:587)';
  const security = data.securityInfo || 'STARTTLS with Google App Password';

  return renderMasterEmail('Swanford Academy — SMTP Delivery Verification Test', {
    title: 'SMTP Delivery Verification Notice',
    badge: 'System Verification',
    statusBadge: { label: 'SMTP Dispatch Test', variant: 'info' },
    recipientName: data.recipientEmail.split('@')[0],
    headline: 'Automated SMTP Delivery Verification Notice',
    contentParagraphs: [
      `This is an automated delivery test initiated by authorized administrator: ${data.initiatorEmail}.`,
      'If you have received this email in your inbox, your mail transport agent has successfully accepted and delivered the branded Swanford Academy email message.',
    ],
    detailsTable: [
      { label: 'Delivery Provider', value: provider },
      { label: 'Security Transport', value: security },
      { label: 'Target Recipient', value: data.recipientEmail, isEmphasized: true },
      { label: 'Initiated By', value: data.initiatorEmail },
      { label: 'Timestamp (UTC)', value: timestamp },
    ],
    footerNotes: [
      'This is an internal system delivery test. No administrative action is required.',
      `${VERIFIED_SCHOOL_INFO.name} &bull; ICT & Systems Administration`,
    ],
  });
}
