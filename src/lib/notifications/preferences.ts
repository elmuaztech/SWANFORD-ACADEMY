import { NotificationCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthorizationError } from '@/lib/auth/authorization';

/**
 * Swanford Academy — Mandatory Notification Categories Policy
 *
 * Mandatory Categories (CANNOT be opted out or disabled):
 * - SECURITY: Password resets, account activation, security lockouts, password change notices.
 * - FINANCE: Invoices, official payment confirmations, receipts, payment failure notices, refunds/reversals.
 * - ADMISSION_DECISION: Formal admissions acceptance, partial approval, rejection, matriculation/admission numbers.
 *
 * Optional Categories (User-configurable):
 * - ADMISSION_GENERAL: Cycle dates, reminders, open day announcements, marketing.
 * - ACADEMIC: Term announcements, homework reminders.
 * - GENERAL: School newsletters, general administrative notices.
 */

export const MANDATORY_NOTIFICATION_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  NotificationCategory.SECURITY,
  NotificationCategory.FINANCE,
  NotificationCategory.ADMISSION_DECISION,
]);

export function isCategoryMandatory(category: NotificationCategory): boolean {
  return MANDATORY_NOTIFICATION_CATEGORIES.has(category);
}

/**
 * Checks if a user has opted out of a notification category.
 * Mandatory notifications ALWAYS return true regardless of preferences.
 */
export async function isNotificationAllowed(
  userId: string | null | undefined,
  category: NotificationCategory
): Promise<boolean> {
  // 1. Mandatory categories can never be suppressed
  if (isCategoryMandatory(category)) {
    return true;
  }

  // 2. If no user ID is provided (e.g. prospective parent before account creation), default to allowed
  if (!userId) {
    return true;
  }

  // 3. Query user preference from PostgreSQL
  const preference = await prisma.notificationPreference.findUnique({
    where: {
      userId_category_channel: {
        userId,
        category,
        channel: 'EMAIL',
      },
    },
  });

  if (preference) {
    return preference.enabled;
  }

  // Default is enabled if no specific preference row exists
  return true;
}

/**
 * Updates a user's notification preference.
 * Strictly blocks any attempt to disable mandatory categories.
 */
export async function updateNotificationPreference(
  userId: string,
  category: NotificationCategory,
  enabled: boolean
): Promise<{ success: boolean; category: NotificationCategory; enabled: boolean }> {
  if (isCategoryMandatory(category) && !enabled) {
    throw new AuthorizationError(
      'Mandatory notifications (Security, Finance, Admission Decisions) cannot be disabled.',
      400,
      'CANNOT_DISABLE_MANDATORY_NOTIFICATION'
    );
  }

  const updated = await prisma.notificationPreference.upsert({
    where: {
      userId_category_channel: {
        userId,
        category,
        channel: 'EMAIL',
      },
    },
    create: {
      userId,
      category,
      channel: 'EMAIL',
      enabled,
    },
    update: {
      enabled,
    },
  });

  return {
    success: true,
    category: updated.category,
    enabled: updated.enabled,
  };
}

export function isPreferenceConfigurable(category: NotificationCategory): boolean {
  return !isCategoryMandatory(category);
}

export async function shouldSendNotification(input: {
  userId?: string | null;
  category: NotificationCategory;
  channel?: string;
}): Promise<boolean> {
  return isNotificationAllowed(input.userId, input.category);
}
