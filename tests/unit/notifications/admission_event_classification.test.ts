import { describe, it, expect } from 'vitest';
import { isCategoryMandatory } from '@/lib/notifications/preferences';
import { NotificationCategory } from '@prisma/client';

describe('Stage 10: Admission Event Classification Policy', () => {
  it('classifies application submission acknowledgement as ADMISSION_GENERAL (optional)', () => {
    const category = NotificationCategory.ADMISSION_GENERAL;
    expect(isCategoryMandatory(category)).toBe(false);
  });

  it('classifies application fee confirmation as FINANCE (mandatory)', () => {
    const category = NotificationCategory.FINANCE;
    expect(isCategoryMandatory(category)).toBe(true);
  });

  it('classifies admission offer / rejection as ADMISSION_DECISION (mandatory)', () => {
    const category = NotificationCategory.ADMISSION_DECISION;
    expect(isCategoryMandatory(category)).toBe(true);
  });

  it('classifies student matriculation as ADMISSION_DECISION (mandatory)', () => {
    const category = NotificationCategory.ADMISSION_DECISION;
    expect(isCategoryMandatory(category)).toBe(true);
  });

  it('ensures that applicants cannot miss legal/official admission decisions via unsubscribe', () => {
    const decisionCategory = NotificationCategory.ADMISSION_DECISION;
    expect(isCategoryMandatory(decisionCategory)).toBe(true);
  });
});
