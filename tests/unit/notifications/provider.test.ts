import { describe, it, expect, beforeEach } from 'vitest';
import { MockEmailProvider } from '@/lib/notifications/provider';

describe('Stage 10: Email Provider Abstraction & Security', () => {
  let provider: MockEmailProvider;

  beforeEach(() => {
    provider = new MockEmailProvider();
  });

  it('records sent emails and returns deterministic provider message IDs', async () => {
    const result = await provider.sendEmail({
      to: 'parent@swanford.academy',
      subject: 'Test Notification',
      text: 'This is a test notification body.',
      html: '<p>This is a test notification body.</p>',
      idempotencyKey: 'TEST:KEY:001',
    });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toMatch(/^mock-email-/);
    expect(provider.sentEmails).toHaveLength(1);
    expect(provider.sentEmails[0].to).toBe('parent@swanford.academy');
    expect(provider.sentEmails[0].idempotencyKey).toBe('TEST:KEY:001');
  });

  it('handles simulated transient delivery failures and preserves retryability', async () => {
    provider.setSimulateFailure(true, 'SMTP connection timed out after 10000ms');

    const result = await provider.sendEmail({
      to: 'guardian@swanford.academy',
      subject: 'Invoice Notification',
      text: 'Your school fees invoice is ready.',
      html: '<p>Your school fees invoice is ready.</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP connection timed out');
    expect(provider.sentEmails).toHaveLength(0);
  });

  it('allows clearing sent email history between test runs', async () => {
    await provider.sendEmail({
      to: 'user@swanford.academy',
      subject: 'Welcome',
      text: 'Welcome to Swanford',
      html: '<p>Welcome</p>',
    });

    expect(provider.sentEmails).toHaveLength(1);
    provider.clear();
    expect(provider.sentEmails).toHaveLength(0);
  });
});
