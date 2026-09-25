import { NextRequest, NextResponse } from 'next/server';
import { RoleCode, NotificationChannel, NotificationCategory, NotificationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getEmailProvider } from '@/lib/notifications/provider';
import { renderSmtpTestEmail } from '@/lib/notifications/templates';

export const dynamic = 'force-dynamic';

// Rate limiting map: tracks last test email sent timestamp per user ID
const lastTestTimestampByUser = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds between test sends

/**
 * POST /api/admin/notifications/test-email
 * Protected Admin Endpoint to verify real Gmail SMTP delivery.
 *
 * Requirements:
 * 1. Authenticated administrator (ADMIN or SUPER_ADMIN).
 * 2. Recipient email validation.
 * 3. Rate limiting to prevent duplicate accidental sends.
 * 4. Honest reporting: ACCEPTED BY GMAIL SMTP does not claim inbox delivery.
 *    Displays "NOT VERIFIED — REAL INBOX TEST REQUIRED" until verified by human.
 * 5. Safe audit recording without secret exposure.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthUser(req);
    if (!actor) {
      return NextResponse.json(
        { error: 'Authentication required to run email delivery tests.' },
        { status: 401 }
      );
    }

    const isAuthorizedAdmin =
      actor.roles?.includes(RoleCode.ADMIN) || actor.roles?.includes(RoleCode.SUPER_ADMIN);

    if (!isAuthorizedAdmin) {
      return NextResponse.json(
        { error: 'Access denied: Only administrators can initiate SMTP delivery verification.' },
        { status: 403 }
      );
    }

    // Rate-limiting check
    const now = Date.now();
    const lastSent = lastTestTimestampByUser.get(actor.id) || 0;
    if (now - lastSent < RATE_LIMIT_WINDOW_MS) {
      const waitSec = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastSent)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSec} second(s) before sending another test email to prevent duplicate dispatches.` },
        { status: 429 }
      );
    }

    // Validate request body
    const body = await req.json().catch(() => ({}));
    const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : '';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recipientEmail || !emailRegex.test(recipientEmail)) {
      return NextResponse.json(
        { error: 'Please provide a valid recipient email address.' },
        { status: 400 }
      );
    }

    // Record rate limit timestamp
    lastTestTimestampByUser.set(actor.id, now);

    const provider = getEmailProvider();
    const rendered = renderSmtpTestEmail({
      initiatorEmail: actor.email,
      recipientEmail,
      providerInfo: 'Gmail SMTP (smtp.gmail.com:587 via STARTTLS)',
      securityInfo: 'TLS / STARTTLS Verified (App Password)',
      timestampFormatted: new Date().toUTCString(),
    });

    const sendResult = await provider.sendEmail({
      to: recipientEmail,
      subject: rendered.subject,
      bodyText: rendered.text,
      htmlBody: rendered.html,
    });

    // Record safe delivery status into PostgreSQL Notification history
    const idempotencyKey = `test-email-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    await prisma.notification.create({
      data: {
        idempotencyKey,
        recipientUserId: actor.id,
        recipientEmail,
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.SECURITY,
        templateName: 'ADMIN_SMTP_VERIFICATION_TEST',
        subject: rendered.subject,
        bodyText: rendered.text,
        htmlBody: rendered.html,
        status: sendResult.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        attempts: 1,
        sentAt: sendResult.success ? new Date() : null,
        deliveredAt: null,
        providerMessageId: sendResult.messageId || null,
        errorMessage: sendResult.error || null,
      },
    });

    if (!sendResult.success) {
      return NextResponse.json(
        {
          success: false,
          providerStatus: 'SMTP DELIVERY REJECTED',
          verificationStatus: 'FAILED',
          error: sendResult.error || 'SMTP delivery rejected by mail server.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      providerStatus: 'ACCEPTED BY GMAIL SMTP',
      verificationStatus: 'NOT VERIFIED — REAL INBOX TEST REQUIRED',
      messageId: sendResult.messageId,
      recipient: recipientEmail,
      note: 'Gmail SMTP accepted the message for delivery. Please check the recipient inbox and spam folder to confirm actual receipt.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during SMTP test dispatch.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
