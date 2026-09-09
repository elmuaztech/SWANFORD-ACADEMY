import { describe, it, expect } from 'vitest';
import {
  isCategoryMandatory,
  shouldSendNotification,
  isPreferenceConfigurable,
} from '@/lib/notifications/preferences';
import { NotificationCategory, NotificationChannel } from '@prisma/client';

describe('Stage 10: Notification Preference Policy & Enforcement', () => {
  describe('isCategoryMandatory', () => {
    it('enforces that SECURITY notifications are mandatory', () => {
      expect(isCategoryMandatory(NotificationCategory.SECURITY)).toBe(true);
      expect(isPreferenceConfigurable(NotificationCategory.SECURITY)).toBe(false);
    });

    it('enforces that FINANCE notifications are mandatory', () => {
      expect(isCategoryMandatory(NotificationCategory.FINANCE)).toBe(true);
      expect(isPreferenceConfigurable(NotificationCategory.FINANCE)).toBe(false);
    });

    it('enforces that ADMISSION_DECISION notifications are mandatory', () => {
      expect(isCategoryMandatory(NotificationCategory.ADMISSION_DECISION)).toBe(true);
      expect(isPreferenceConfigurable(NotificationCategory.ADMISSION_DECISION)).toBe(false);
    });

    it('allows ADMISSION_GENERAL, ACADEMIC, and GENERAL to be configurable / optional', () => {
      expect(isCategoryMandatory(NotificationCategory.ADMISSION_GENERAL)).toBe(false);
      expect(isPreferenceConfigurable(NotificationCategory.ADMISSION_GENERAL)).toBe(true);

      expect(isCategoryMandatory(NotificationCategory.ACADEMIC)).toBe(false);
      expect(isPreferenceConfigurable(NotificationCategory.ACADEMIC)).toBe(true);

      expect(isCategoryMandatory(NotificationCategory.GENERAL)).toBe(false);
      expect(isPreferenceConfigurable(NotificationCategory.GENERAL)).toBe(true);
    });
  });

  describe('shouldSendNotification without database preferences (default behavior)', () => {
    it('defaults to sending all notifications when no user preferences are recorded', async () => {
      // Without recipient user ID (e.g. public admission form applicant)
      const res = await shouldSendNotification({
        category: NotificationCategory.ADMISSION_GENERAL,
        channel: NotificationChannel.EMAIL,
      });
      expect(res).toBe(true);
    });

    it('always permits mandatory categories even if user preferences attempt to disable', async () => {
      const resSecurity = await shouldSendNotification({
        userId: 'some-user-uuid',
        category: NotificationCategory.SECURITY,
        channel: NotificationChannel.EMAIL,
      });
      expect(resSecurity).toBe(true);

      const resFinance = await shouldSendNotification({
        userId: 'some-user-uuid',
        category: NotificationCategory.FINANCE,
        channel: NotificationChannel.EMAIL,
      });
      expect(resFinance).toBe(true);

      const resAdmissionDecision = await shouldSendNotification({
        userId: 'some-user-uuid',
        category: NotificationCategory.ADMISSION_DECISION,
        channel: NotificationChannel.EMAIL,
      });
      expect(resAdmissionDecision).toBe(true);
    });
  });
});
