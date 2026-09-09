import { NotificationCategory, NotificationChannel, NotificationStatus } from '@prisma/client';

export { NotificationCategory, NotificationChannel, NotificationStatus };

export interface SendEmailOptions {
  to: string;
  subject: string;
  bodyText?: string;
  text?: string;
  htmlBody?: string;
  html?: string;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  providerMessageId?: string;
  accepted?: boolean;
  retryable?: boolean;
  error?: string;
}

export interface EnqueueNotificationInput {
  idempotencyKey: string;
  recipientEmail: string;
  recipientUserId?: string | null;
  recipientPhone?: string | null;
  channel?: NotificationChannel;
  category: NotificationCategory;
  templateName: string;
  subject: string;
  bodyText: string;
  htmlBody?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface EnqueueNotificationResult {
  enqueued: boolean;
  notificationId?: string;
  duplicate?: boolean;
  skippedDueToPreference?: boolean;
}

export interface ProcessBatchResult {
  claimed: number;
  processed: number;
  failedRetryable: number;
  failedPermanent: number;
  staleDiscarded: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  deadLetterCount: number;
}
