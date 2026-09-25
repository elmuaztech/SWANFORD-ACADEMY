import { getEnv } from '@/lib/env';
import { SendEmailOptions, SendEmailResult } from './types';
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';

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
 * Production/Staging Nodemailer SMTP Provider
 *
 * Implements supported attachments configuration for the inline logo:
 * - filename: swanford-logo.jpg
 * - path: verified local buffer or path
 * - cid: swanford-logo
 * - contentType: image/jpeg
 * - contentDisposition: inline
 *
 * Employs standard multipart/related with text/plain and text/html alternatives.
 * Preserves strict timeout, credential redaction, and idempotency headers.
 */
export class SmtpEmailProvider implements EmailProvider {
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const env = getEnv();
    const host = env.SMTP_HOST || 'localhost';
    const port = Number(env.SMTP_PORT) || 587;
    const isTls = env.SMTP_SECURE === 'true' || port === 465;
    const fromAddress =
      env.SMTP_FROM ||
      (env.SMTP_FROM_NAME && env.SMTP_FROM_EMAIL
        ? `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`
        : env.SMTP_FROM_EMAIL || 'Swanford Academy <notifications@swanford.edu.ng>');
    const user = env.SMTP_USER;
    const rawPass = env.SMTP_PASSWORD || env.SMTP_PASS || '';
    const pass = rawPass.replace(/\s+/g, '');
    const timeoutMs = env.SMTP_CONNECTION_TIMEOUT || 10000;

    if (
      !host ||
      host.includes('placeholder') ||
      !user ||
      user.includes('placeholder') ||
      user === 'YOUR_GMAIL_ADDRESS' ||
      !pass ||
      pass.trim() === ''
    ) {
      return {
        success: false,
        retryable: true,
        error: 'SMTP credentials not configured. Status: NOT VERIFIED — CREDENTIALS REQUIRED',
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: isTls,
        auth: {
          user,
          pass,
        },
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
      });

      // Prepare Nodemailer supported attachments configuration for inline logo
      const attachments: Array<{
        filename: string;
        path: string;
        cid: string;
        contentType: string;
        contentDisposition: 'inline';
      }> = [];

      const logoPath = path.join(process.cwd(), 'public', 'images', 'swanford-logo.jpg');
      if (fs.existsSync(logoPath)) {
        attachments.push({
          filename: 'swanford-logo.jpg',
          path: logoPath,
          cid: 'swanford-logo',
          contentType: 'image/jpeg',
          contentDisposition: 'inline',
        });
      }

      const mailOptions = {
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.bodyText || options.text || '',
        html: options.htmlBody || options.html || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        headers: options.idempotencyKey
          ? { 'X-Entity-Ref-ID': options.idempotencyKey }
          : undefined,
      };

      const info = await transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        providerMessageId: info.messageId,
        accepted: true,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'SMTP dispatch failed';
      const sanitized = errorMsg.replace(/password|auth|secret|key/gi, '[REDACTED]');
      const isTransient = /timeout|econnreset|econnrefused|etimedout|4\d\d/i.test(errorMsg);

      return {
        success: false,
        retryable: isTransient,
        error: sanitized,
      };
    }
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
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NOTIFICATION_PROVIDER must be set to "smtp" in production with verified SMTP credentials. Mock provider is prohibited.'
    );
  }
  return globalMockEmailProvider;
}
