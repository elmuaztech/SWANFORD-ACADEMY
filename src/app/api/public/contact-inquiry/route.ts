import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmailProvider } from '@/lib/notifications/provider';
import { BRAND_COLORS } from '@/lib/notifications/templates/theme';

export const dynamic = 'force-dynamic';

const InquirySchema = z.object({
  parentName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phoneOrEmail: z.string().min(5, 'Contact details must be at least 5 characters').max(100),
  message: z.string().min(5, 'Message must be at least 5 characters').max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = InquirySchema.parse(body);

    const emailProvider = getEmailProvider();
    const timestamp = new Date().toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Admissions Inquiry - Swanford Academy</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_COLORS.creamCanvas}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${BRAND_COLORS.textDark};">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND_COLORS.creamCanvas}; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid ${BRAND_COLORS.borderSubtle}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_COLORS.maroonDeep} 0%, ${BRAND_COLORS.maroonPrimary} 100%); padding: 28px 32px; text-align: left;">
              <span style="display: inline-block; padding: 4px 10px; background-color: rgba(255,255,255,0.15); border-radius: 6px; font-size: 11px; font-weight: bold; color: ${BRAND_COLORS.goldAccent}; letter-spacing: 1px; text-transform: uppercase;">
                Public Admissions Desk
              </span>
              <h1 style="margin: 10px 0 4px 0; font-size: 22px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.5px;">
                New Website Inquiry
              </h1>
              <p style="margin: 0; font-size: 13px; color: #F5EBDC;">
                Swanford Academy &bull; Plot 212, Dr Nuhu Muhammadu Sanusi Way, Dutse
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.textDark};">
                A new inquiry has been submitted through the public website contact form with the following details:
              </p>

              <!-- Inquiry Summary Card -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND_COLORS.creamCanvas}; border: 1px solid ${BRAND_COLORS.borderSubtle}; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid ${BRAND_COLORS.borderSubtle};">
                    <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted}; display: block; margin-bottom: 4px;">
                      Parent / Guardian Name
                    </span>
                    <strong style="font-size: 15px; color: ${BRAND_COLORS.maroonPrimary};">
                      ${validated.parentName}
                    </strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid ${BRAND_COLORS.borderSubtle};">
                    <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted}; display: block; margin-bottom: 4px;">
                      Phone Number / Contact Email
                    </span>
                    <strong style="font-size: 15px; color: ${BRAND_COLORS.textDark};">
                      ${validated.phoneOrEmail}
                    </strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid ${BRAND_COLORS.borderSubtle};">
                    <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted}; display: block; margin-bottom: 4px;">
                      Submission Time
                    </span>
                    <span style="font-size: 13px; color: ${BRAND_COLORS.textSecondary};">
                      ${timestamp}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px;">
                    <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted}; display: block; margin-bottom: 6px;">
                      Inquiry Message
                    </span>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.textDark}; white-space: pre-wrap;">
                      ${validated.message}
                    </p>
                  </td>
                </tr>
              </table>

              <div style="background-color: ${BRAND_COLORS.maroonSoft}; border-left: 4px solid ${BRAND_COLORS.maroonPrimary}; border-radius: 4px; padding: 12px 16px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: ${BRAND_COLORS.maroonPrimary};">
                  <strong>Action Required:</strong> Please reply directly to the prospective parent via phone or email at <strong>${validated.phoneOrEmail}</strong>.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${BRAND_COLORS.creamCanvas}; padding: 18px 32px; border-top: 1px solid ${BRAND_COLORS.borderSubtle}; text-align: center; font-size: 11px; color: ${BRAND_COLORS.textLight};">
              Official Automated Notification &bull; Swanford Academy Admissions Office<br>
              Delivered directly to school official email: <a href="mailto:swanford99@gmail.com" style="color: ${BRAND_COLORS.maroonPrimary}; font-weight: bold; text-decoration: none;">swanford99@gmail.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const textBody = `
NEW ADMISSIONS INQUIRY - SWANFORD ACADEMY

Parent / Guardian: ${validated.parentName}
Contact: ${validated.phoneOrEmail}
Date: ${timestamp}

Message:
${validated.message}

Please respond to the parent via ${validated.phoneOrEmail}.
Official notification delivered to swanford99@gmail.com
    `.trim();

    await emailProvider.sendEmail({
      to: 'swanford99@gmail.com',
      subject: `New Admissions Inquiry from ${validated.parentName} - Swanford Academy`,
      bodyText: textBody,
      htmlBody,
    });

    return NextResponse.json({
      success: true,
      message: 'Inquiry has been successfully sent to the school official desk.',
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Invalid form submission.' },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to send inquiry.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
