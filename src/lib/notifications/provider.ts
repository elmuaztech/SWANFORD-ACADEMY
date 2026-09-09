import { getEnv } from '@/lib/env';
import { SendEmailOptions, SendEmailResult } from './types';
import * as net from 'net';
import * as tls from 'tls';

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
}

/**
 * In-Memory Mock Email Provider for Testing & Development
 */
export class MockEmailProvider implements EmailProvider {
  private _sentEmails: Array<SendEmailOptions & { messageId: string; timestamp: Date }> = [];
  private failNextTimes = 0;
  private failPermanent = false;
  private customErrorMessage?: string;

  get sentEmails() {
    return this._sentEmails;
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (this.failNextTimes > 0) {
      this.failNextTimes--;
      return {
        success: false,
        retryable: !this.failPermanent,
        error:
          this.customErrorMessage ||
          (this.failPermanent
            ? 'Permanent recipient mailbox rejection'
            : 'Transient SMTP connection timeout'),
      };
    }

    const messageId = `mock-email-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this._sentEmails.push({
      ...options,
      messageId,
      timestamp: new Date(),
    });

    return {
      success: true,
      messageId,
      providerMessageId: messageId,
      accepted: true,
    };
  }

  getSentEmails() {
    return [...this._sentEmails];
  }

  clear() {
    this.clearSentEmails();
  }

  clearSentEmails() {
    this._sentEmails = [];
    this.failNextTimes = 0;
    this.failPermanent = false;
    this.customErrorMessage = undefined;
  }

  simulateFailure(count = 1, permanent = false) {
    this.failNextTimes = count;
    this.failPermanent = permanent;
  }

  setSimulateFailure(fail: boolean, errorMessage?: string) {
    if (fail) {
      this.failNextTimes = 999;
      this.customErrorMessage = errorMessage;
    } else {
      this.failNextTimes = 0;
      this.customErrorMessage = undefined;
    }
  }
}

/**
 * Standard Production/Staging Native Node.js SMTP Provider
 * Does not require external packages. Enforces strict 10s socket timeout.
 */
export class SmtpEmailProvider implements EmailProvider {
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const env = getEnv();
    const host = env.SMTP_HOST || 'localhost';
    const port = env.SMTP_PORT || 587;
    const isTls = port === 465;
    const fromAddress = env.SMTP_FROM || 'Swanford Academy <notifications@swanford.edu.ng>';
    const user = env.SMTP_USER;
    const pass = env.SMTP_PASS;

    return new Promise((resolve) => {
      let socket: net.Socket | tls.TLSSocket;
      let buffer = '';
      let stage = 0;
      let resolved = false;

      const finish = (result: SendEmailResult) => {
        if (!resolved) {
          resolved = true;
          try {
            socket.destroy();
          } catch {
            // ignore cleanup errors
          }
          resolve(result);
        }
      };

      try {
        if (isTls) {
          socket = tls.connect({ host, port, minVersion: 'TLSv1.2', timeout: 10000 });
        } else {
          socket = net.createConnection({ host, port, timeout: 10000 });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Connection failed';
        return finish({ success: false, retryable: true, error: errorMsg });
      }

      socket.setTimeout(10000);
      socket.setEncoding('utf8');

      socket.on('timeout', () => {
        finish({ success: false, retryable: true, error: 'SMTP connection timed out after 10000ms' });
      });

      socket.on('error', (err: Error) => {
        const msg = err.message || 'SMTP Socket error';
        const sanitized = msg.replace(/password|auth|secret/gi, '[REDACTED]');
        const isTransient = /timeout|econnreset|econnrefused|etimedout/i.test(msg);
        finish({ success: false, retryable: isTransient, error: sanitized });
      });

      socket.on('data', (data: string) => {
        buffer += data;
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line || line.length < 3) continue;
          const code = parseInt(line.substring(0, 3), 10);
          const isMultiline = line[3] === '-';
          if (isMultiline) continue;

          if (code >= 400 && code < 500) {
            return finish({ success: false, retryable: true, error: `SMTP transient rejection: ${code} ${line}` });
          }
          if (code >= 500) {
            return finish({ success: false, retryable: false, error: `SMTP permanent rejection: ${code} ${line}` });
          }

          // State machine
          if (stage === 0 && code === 220) {
            stage = 1;
            socket.write(`EHLO swanford.edu.ng\r\n`);
          } else if (stage === 1 && code === 250) {
            if (user && pass) {
              stage = 2;
              socket.write(`AUTH LOGIN\r\n`);
            } else {
              stage = 5;
              const cleanFrom = fromAddress.match(/<([^>]+)>/)?.[1] || fromAddress;
              socket.write(`MAIL FROM:<${cleanFrom}>\r\n`);
            }
          } else if (stage === 2 && code === 334) {
            stage = 3;
            socket.write(`${Buffer.from(user || '').toString('base64')}\r\n`);
          } else if (stage === 3 && code === 334) {
            stage = 4;
            socket.write(`${Buffer.from(pass || '').toString('base64')}\r\n`);
          } else if (stage === 4 && code === 235) {
            stage = 5;
            const cleanFrom = fromAddress.match(/<([^>]+)>/)?.[1] || fromAddress;
            socket.write(`MAIL FROM:<${cleanFrom}>\r\n`);
          } else if (stage === 5 && code === 250) {
            stage = 6;
            const cleanTo = options.to.match(/<([^>]+)>/)?.[1] || options.to;
            socket.write(`RCPT TO:<${cleanTo}>\r\n`);
          } else if (stage === 6 && code === 250) {
            stage = 7;
            socket.write(`DATA\r\n`);
          } else if (stage === 7 && code === 354) {
            stage = 8;
            const msgId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@swanford.edu.ng>`;
            const headers = [
              `From: ${fromAddress}`,
              `To: ${options.to}`,
              `Subject: ${options.subject}`,
              `Message-ID: ${msgId}`,
              `Date: ${new Date().toUTCString()}`,
              `MIME-Version: 1.0`,
              options.htmlBody
                ? `Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit`
                : `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit`,
              options.idempotencyKey ? `X-Entity-Ref-ID: ${options.idempotencyKey}` : '',
            ].filter(Boolean).join('\r\n');

            const body = options.htmlBody || options.bodyText || '';
            const escapedBody = body.replace(/\r?\n\./g, '\r\n..');
            socket.write(`${headers}\r\n\r\n${escapedBody}\r\n.\r\n`);
          } else if (stage === 8 && code === 250) {
            stage = 9;
            socket.write(`QUIT\r\n`);
            finish({
              success: true,
              messageId: `smtp-${Date.now()}`,
              accepted: true,
            });
          }
        }
      });
    });
  }
}

// Global mock singleton for easy test inspection
export const globalMockEmailProvider = new MockEmailProvider();

/**
 * Provider factory
 */
export function getEmailProvider(): EmailProvider {
  const env = getEnv();
  if (env.NOTIFICATION_PROVIDER === 'smtp') {
    return new SmtpEmailProvider();
  }
  return globalMockEmailProvider;
}

