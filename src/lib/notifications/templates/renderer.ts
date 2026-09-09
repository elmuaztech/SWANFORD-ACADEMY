/**
 * Swanford Academy — Master Email Layout & Rendering Engine
 *
 * Requirements:
 * 1. Swanford branding (#0F2942 Navy Blue, #D4AF37 Gold).
 * 2. Mobile-first responsive email HTML.
 * 3. Data minimization: strictly NO raw UUIDs, NO medical notes, NO NIN, NO passwords.
 * 4. Human-readable amounts in Nigerian Naira (₦X,XXX.XX).
 * 5. High-fidelity plain-text fallback.
 */

export interface EmailRenderInput {
  title: string;
  recipientName: string;
  headline: string;
  contentParagraphs: string[];
  callToAction?: {
    label: string;
    url: string;
  };
  detailsTable?: Array<{ label: string; value: string }>;
  footerNotes?: string[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderMasterEmail(subject: string, input: EmailRenderInput): RenderedEmail {
  const sanitizedSubject = escapeHtml(subject);
  const sanitizedRecipient = escapeHtml(input.recipientName);
  const sanitizedHeadline = escapeHtml(input.headline);

  const paragraphsHtml = input.contentParagraphs
    .map((p) => `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">${escapeHtml(p)}</p>`)
    .join('\n');

  let tableHtml = '';
  if (input.detailsTable && input.detailsTable.length > 0) {
    const rows = input.detailsTable
      .map(
        (row) => `
        <tr>
          <td style="padding: 10px 14px; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${escapeHtml(row.label)}</td>
          <td style="padding: 10px 14px; font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: right;">${escapeHtml(row.value)}</td>
        </tr>
      `
      )
      .join('\n');

    tableHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: collapse; background-color: #f8fafc;">
        ${rows}
      </table>
    `;
  }

  let ctaHtml = '';
  if (input.callToAction) {
    ctaHtml = `
      <div style="margin: 28px 0; text-align: center;">
        <a href="${escapeHtml(input.callToAction.url)}" style="display: inline-block; padding: 14px 28px; background-color: #0F2942; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px; box-shadow: 0 2px 4px rgba(15, 41, 66, 0.2); min-height: 44px; line-height: 20px;">
          ${escapeHtml(input.callToAction.label)}
        </a>
      </div>
    `;
  }

  const footerNotesHtml = (input.footerNotes || [
    'Swanford Academy · Nursery, Primary & Tahfeez · Nigeria',
    'For inquiries, contact the administrative desk at info@swanford.edu.ng.',
  ])
    .map((fn) => `<p style="margin: 4px 0; font-size: 12px; color: #94a3b8; text-align: center;">${escapeHtml(fn)}</p>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sanitizedSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0F2942; padding: 24px 32px; border-bottom: 3px solid #D4AF37;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">SWANFORD ACADEMY</h1>
                    <p style="margin: 2px 0 0; font-size: 12px; color: #D4AF37; text-transform: uppercase; letter-spacing: 1px;">Nursery · Primary · Tahfeez</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <h2 style="margin: 0 0 12px; font-size: 18px; color: #0F2942; font-weight: 700;">${sanitizedHeadline}</h2>
              <p style="margin: 0 0 16px; font-size: 15px; color: #334155; font-weight: 600;">Dear ${sanitizedRecipient},</p>
              ${paragraphsHtml}
              ${tableHtml}
              ${ctaHtml}
              <p style="margin: 24px 0 0; font-size: 14px; color: #64748b; line-height: 1.5;">Warm regards,<br><strong style="color: #0F2942;">Swanford Academy Administration</strong></p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0;">
              ${footerNotesHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-Text Fallback
  let text = `SWANFORD ACADEMY — ${input.title.toUpperCase()}\n`;
  text += `Nursery · Primary · Tahfeez · Nigeria\n\n`;
  text += `Dear ${input.recipientName},\n\n`;
  text += `${input.headline}\n\n`;
  for (const p of input.contentParagraphs) {
    text += `${p}\n\n`;
  }
  if (input.detailsTable && input.detailsTable.length > 0) {
    text += `--- DETAILS ---\n`;
    for (const row of input.detailsTable) {
      text += `${row.label}: ${row.value}\n`;
    }
    text += `\n`;
  }
  if (input.callToAction) {
    text += `${input.callToAction.label}: ${input.callToAction.url}\n\n`;
  }
  text += `Warm regards,\nSwanford Academy Administration\n\n`;
  text += `info@swanford.edu.ng\n`;

  return {
    subject,
    html,
    text,
  };
}
