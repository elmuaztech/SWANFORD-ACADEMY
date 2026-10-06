import { describe, it, expect } from 'vitest';
import {
  renderAccountActivationEmail,
  renderPasswordResetEmail,
  renderPasswordChangedEmail,
  renderApplicationSubmittedEmail,
  renderApplicationFeeConfirmedEmail,
  renderAdmissionDecisionEmail,
  renderMatriculationEnrolledEmail,
  renderInvoiceIssuedEmail,
  renderPaymentConfirmedEmail,
  renderPaymentReversedEmail,
  renderPasswordResetOtpEmail,
  renderAdmissionInvoiceEmail,
  renderPaymentReceiptEmail,
  renderPaymentFailedEmail,
  renderSmtpTestEmail,
  renderWelcomeNewUserEmail,
} from '@/lib/notifications/templates';

describe('Stage 10: Notification Templates & Data Minimization', () => {
  it('renders account activation email with branding and security tokens', () => {
    const rendered = renderAccountActivationEmail({
      recipientName: 'Amina Bello',
      activationUrl: 'https://swanford.academy/activate?token=secure123',
      expiresInHours: 24,
    });

    expect(rendered.subject).toBe('SWANFORD ACADEMY');
    expect(rendered.html).toContain('#0F2942'); // Swanford Navy
    expect(rendered.html).toContain('#D4AF37'); // Swanford Gold
    expect(rendered.html).toContain('Amina Bello');
    expect(rendered.html).toContain('https://swanford.academy/activate?token=secure123');
    expect(rendered.text).toContain('https://swanford.academy/activate?token=secure123');
  });

  it('renders password reset email with anti-leakage guards', () => {
    const rendered = renderPasswordResetEmail({
      recipientName: 'Ibrahim Musa',
      resetUrl: 'https://swanford.academy/reset-password?token=token_xyz',
      expiresInMinutes: 60,
    });

    expect(rendered.subject).toContain('Password Reset Request');
    expect(rendered.text).toContain('60 minutes');
    expect(rendered.html).toContain('https://swanford.academy/reset-password?token=token_xyz');

    // Data minimization: no raw password hashes or DB table names
    expect(rendered.html).not.toMatch(/password_hash|\$2a\$|\$2b\$/i);
  });

  it('renders password changed security alert', () => {
    const rendered = renderPasswordChangedEmail({
      recipientName: 'Khadijah Yusuf',
      changeDateFormatted: '08/09/2026, 14:30',
    });

    expect(rendered.subject).toContain('Security Alert: Password Changed');
    expect(rendered.text).toContain('Khadijah Yusuf');
    expect(rendered.text).toContain('08/09/2026, 14:30');
    expect(rendered.text).toContain('All previous active sessions have been invalidated');
  });

  it('renders application submitted email with fee in Naira', () => {
    const rendered = renderApplicationSubmittedEmail({
      guardianName: 'Dr. Aliyu Abubakar',
      applicantName: 'Fatima Abubakar',
      applicationNumber: 'APP-2026-0001',
      programmesList: 'Nursery 1, Tahfeez Morning',
      totalFeeKobo: BigInt(2500000), // ₦25,000.00
    });

    expect(rendered.subject).toContain('APP-2026-0001');
    expect(rendered.html).toContain('APP-2026-0001');
    expect(rendered.html).toContain('Fatima Abubakar');
    expect(rendered.html).toContain('₦25,000.00');
    expect(rendered.text).toContain('₦25,000.00');
  });

  it('renders application fee confirmed email', () => {
    const rendered = renderApplicationFeeConfirmedEmail({
      guardianName: 'Mrs. Zainab Umar',
      applicantName: 'Umar Farouq',
      applicationNumber: 'APP-2026-0042',
      paymentReference: 'SWF-APP-20260908-001',
      amountKobo: BigInt(1500000), // ₦15,000.00
    });

    expect(rendered.subject).toContain('Application Fee Confirmed');
    expect(rendered.html).toContain('SWF-APP-20260908-001');
    expect(rendered.html).toContain('₦15,000.00');
  });

  it('renders admission decision email for approved and rejected applications', () => {
    const approved = renderAdmissionDecisionEmail({
      guardianName: 'Mallam Suleiman',
      applicantName: 'Ahmad Suleiman',
      applicationNumber: 'APP-2026-0105',
      decision: 'APPROVED',
      approvedProgrammes: 'Primary 1',
    });
    expect(approved.subject).toContain('Congratulations');
    expect(approved.text).toContain('approved the application');

    const rejected = renderAdmissionDecisionEmail({
      guardianName: 'Mallam Suleiman',
      applicantName: 'Ahmad Suleiman',
      applicationNumber: 'APP-2026-0105',
      decision: 'REJECTED',
    });
    expect(rejected.subject).not.toContain('Congratulations');
    expect(rejected.text).toContain('unable to offer admission');
  });

  it('renders matriculation enrolled email with official admission number', () => {
    const rendered = renderMatriculationEnrolledEmail({
      guardianName: 'Alhaji Haruna',
      studentName: 'Bilkisu Haruna',
      admissionNumber: 'SWN-2026-0012',
      enrolledProgrammes: 'Primary 3 (Main), Tahfeez Afternoon',
    });

    expect(rendered.subject).toContain('SWN-2026-0012');
    expect(rendered.html).toContain('SWN-2026-0012');
    expect(rendered.html).toContain('Bilkisu Haruna');
    expect(rendered.text).toContain('Active Student');
  });

  it('renders invoice issued email with total in Naira and due date', () => {
    const rendered = renderInvoiceIssuedEmail({
      guardianName: 'Mr. & Mrs. Okon',
      studentName: 'David Okon',
      invoiceNumber: 'INV-2026-0033',
      totalAmountKobo: BigInt(15000000), // ₦150,000.00
      dueDateFormatted: '15/09/2026',
    });

    expect(rendered.subject).toContain('INV-2026-0033');
    expect(rendered.html).toContain('₦150,000.00');
    expect(rendered.html).toContain('15/09/2026');
  });

  it('renders payment confirmed email with receipt number and payment method', () => {
    const rendered = renderPaymentConfirmedEmail({
      guardianName: 'Engr. Bello',
      receiptNumber: 'REC-2026-0089',
      paymentReference: 'SWF-PAY-2026-009',
      amountKobo: BigInt(7500000),
      remainingBalanceKobo: BigInt(2500000),
      paymentMethod: 'Bank Transfer',
    });

    expect(rendered.subject).toContain('REC-2026-0089');
    expect(rendered.html).toContain('REC-2026-0089');
    expect(rendered.html).toContain('₦75,000.00');
    expect(rendered.html).toContain('Bank Transfer');
  });

  it('renders payment reversal notice with voided receipt details', () => {
    const rendered = renderPaymentReversedEmail({
      guardianName: 'Hajiya Fatima',
      receiptNumber: 'REC-2026-0010',
      reversedAmountKobo: BigInt(5000000),
      reversalReason: 'Duplicate bank deposit credit',
    });

    expect(rendered.subject).toContain('REC-2026-0010');
    expect(rendered.html).toContain('Voided Receipt Number');
    expect(rendered.html).toContain('Duplicate bank deposit credit');
  });

  it('renders password reset OTP email with prominent 4-digit code and 5-minute strict expiry', () => {
    const rendered = renderPasswordResetOtpEmail({
      recipientName: 'Musa Danladi',
      otpCode: '8492',
      expiresInMinutes: 5,
    });

    expect(rendered.subject).toContain('Password Reset Verification Code');
    expect(rendered.html).toContain('8492');
    expect(rendered.text).toContain('8492');
    expect(rendered.html).toContain('5 minutes');
    expect(rendered.text).toContain('5 minutes');
    expect(rendered.html).toContain('Single-use security code');
    // Anti-leakage checks
    expect(rendered.html).not.toMatch(/password_hash|\$2a\$|\$2b\$/i);
  });

  it('renders admission invoice with line items and due date', () => {
    const rendered = renderAdmissionInvoiceEmail({
      guardianName: 'Dr. Kabir Sani',
      applicantName: 'Maryam Kabir',
      invoiceNumber: 'ADM-INV-2026-001',
      totalAmountKobo: BigInt(2500000), // ₦25,000.00
      dueDateFormatted: '25/09/2026',
      payUrl: 'https://swanford.academy/pay/ADM-INV-2026-001',
      lineItems: [
        { description: 'Application & Screening Processing', amountKobo: BigInt(2500000) },
      ],
    });

    expect(rendered.subject).toContain('ADM-INV-2026-001');
    expect(rendered.html).toContain('Maryam Kabir');
    expect(rendered.html).toContain('₦25,000.00');
    expect(rendered.html).toContain('25/09/2026');
    expect(rendered.html).toContain('Pay Admission Fee Online');
  });

  it('renders payment receipt with transaction reference, paid amount, and remaining balance', () => {
    const rendered = renderPaymentReceiptEmail({
      guardianName: 'Alhaji Gambo',
      receiptNumber: 'REC-2026-0123',
      paymentReference: 'PAY-REF-9988',
      amountKobo: BigInt(5000000), // ₦50,000.00
      remainingBalanceKobo: BigInt(0),
      paymentMethod: 'Paystack Online (Debit Card)',
      paymentDateFormatted: '20/09/2026 14:30 WAT',
      studentName: 'Aisha Gambo',
      invoiceNumber: 'INV-2026-0044',
    });

    expect(rendered.subject).toContain('REC-2026-0123');
    expect(rendered.html).toContain('REC-2026-0123');
    expect(rendered.html).toContain('PAY-REF-9988');
    expect(rendered.html).toContain('Aisha Gambo');
    expect(rendered.html).toContain('₦50,000.00');
    expect(rendered.html).toContain('RECEIPT PAID IN FULL');
  });

  it('renders failed payment notification with reference, reason, and ledger reassurance', () => {
    const rendered = renderPaymentFailedEmail({
      guardianName: 'Mrs. Amina Garba',
      reference: 'TXN-FAIL-5544',
      amountKobo: BigInt(3000000),
      failureReason: 'Insufficient funds on card',
      retryUrl: 'https://swanford.academy/pay/retry?ref=TXN-FAIL-5544',
    });

    expect(rendered.subject).toContain('TXN-FAIL-5544');
    expect(rendered.html).toContain('Insufficient funds on card');
    expect(rendered.html).toContain('No funds were credited to the school ledger');
    expect(rendered.html).toContain('Retry Payment');
  });

  it('renders SMTP test email with provider info and verified branding', () => {
    const rendered = renderSmtpTestEmail({
      initiatorEmail: 'admin@swanford.edu.ng',
      recipientEmail: 'test@example.com',
      providerInfo: 'Gmail SMTP (smtp.gmail.com:587 via STARTTLS)',
      securityInfo: 'TLS / STARTTLS Verified (App Password)',
    });

    expect(rendered.subject).toContain('SMTP Delivery Verification Test');
    expect(rendered.html).toContain('admin@swanford.edu.ng');
    expect(rendered.html).toContain('Gmail SMTP');
    expect(rendered.html).toContain('SWANFORD ACADEMY');
    // Dominant maroon branding check
    expect(rendered.html).toContain('#5B0612');
    expect(rendered.html).toContain('#D4AF37');
    // Accessible image fallback & enlarged centered crest
    expect(rendered.html).toContain('alt="Swanford Academy Crest"');
    expect(rendered.html).toContain('width="80"');
    expect(rendered.html).toContain('height="80"');
    expect(rendered.html).not.toContain('NURSERY · PRIMARY · TAHFEEZ');
  });

  it('guarantees relative and localhost activation URLs are converted to secure canonical HTTPS domain', () => {
    const rendered = renderAccountActivationEmail({
      recipientName: 'Ruqayyah Parent',
      activationUrl: '/auth/activate?token=sample_token_123',
      expiresInHours: 24,
    });

    expect(rendered.html).toContain('href="https://swanfordacademy.com.ng/auth/activate?token=sample_token_123"');
    expect(rendered.text).toContain('https://swanfordacademy.com.ng/auth/activate?token=sample_token_123');
    expect(rendered.html).not.toContain('href="/auth/activate');
    expect(rendered.html).not.toContain('http:///');
  });
});

