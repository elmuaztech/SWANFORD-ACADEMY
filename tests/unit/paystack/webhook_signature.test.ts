import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyPaystackSignature } from '@/lib/paystack/webhook';

describe('Stage 9 — Unit: Paystack Webhook Signature Verification', () => {
  const secret = 'sk_test_mock_secret_key_12345';

  it('validates a correct HMAC-SHA512 signature', () => {
    const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'SWN-APP-1' } });
    const validSignature = crypto
      .createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');

    const result = verifyPaystackSignature(rawBody, validSignature, secret);
    expect(result).toBe(true);
  });

  it('rejects an invalid or tampered signature', () => {
    const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'SWN-APP-1' } });
    const wrongSignature = crypto
      .createHmac('sha512', 'wrong_secret')
      .update(rawBody)
      .digest('hex');

    const result = verifyPaystackSignature(rawBody, wrongSignature, secret);
    expect(result).toBe(false);
  });

  it('rejects when payload body is modified after signing', () => {
    const originalBody = JSON.stringify({ event: 'charge.success', amount: 500000 });
    const tamperedBody = JSON.stringify({ event: 'charge.success', amount: 1000 });

    const signature = crypto
      .createHmac('sha512', secret)
      .update(originalBody)
      .digest('hex');

    const result = verifyPaystackSignature(tamperedBody, signature, secret);
    expect(result).toBe(false);
  });

  it('rejects missing, null, undefined, or empty signature headers', () => {
    const rawBody = '{"test":true}';
    expect(verifyPaystackSignature(rawBody, null, secret)).toBe(false);
    expect(verifyPaystackSignature(rawBody, undefined, secret)).toBe(false);
    expect(verifyPaystackSignature(rawBody, '', secret)).toBe(false);
    expect(verifyPaystackSignature(rawBody, '   ', secret)).toBe(false);
  });

  it('rejects signatures with incorrect byte length without timing leaks', () => {
    const rawBody = '{"test":true}';
    expect(verifyPaystackSignature(rawBody, 'deadbeef', secret)).toBe(false);
    expect(verifyPaystackSignature(rawBody, '1234', secret)).toBe(false);
  });
});
