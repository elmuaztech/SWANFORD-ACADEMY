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
} from '@/lib/notifications/templates';

describe('Stage 10: Notification Templates & Data Minimization', () => {
  it('renders account activation email with branding and security tokens', () => {
    const rendered = renderAccountActivationEmail({
      recipientName: 'Amina Bello',
      activationUrl: 'https://swanford.academy/activate?token=secure123',
      expiresInHours: 24,
    });

    expect(rendered.subject).toContain('Activate Your Parent Portal Account');
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
});
