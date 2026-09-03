// =============================================================================
// Swanford Academy - Canonical Admission Window & Timezone Utility
// Master Specification Reference: Sections 5, 8, 10, 21
// Reference: docs/ADMISSION_LIFECYCLE_DESIGN.md
// Canonical Business Timezone: Africa/Lagos (West Africa Time, UTC+1, No DST)
// =============================================================================

import { AdmissionCycleStatus, ProgrammeAvailabilityStatus } from '@prisma/client';

export const SWANFORD_TIMEZONE = 'Africa/Lagos';
export const LAGOS_UTC_OFFSET_HOURS = 1; // Africa/Lagos is strictly UTC+1 year-round (no DST)

export interface WindowEvaluationResult {
  isOpen: boolean;
  canAcceptDrafts: boolean;
  canAcceptSubmissions: boolean;
  canAcceptPayments: boolean;
  reason?: 'UPCOMING_CYCLE' | 'CLOSED_CYCLE' | 'ARCHIVED_CYCLE' | 'BEFORE_WINDOW' | 'AFTER_WINDOW';
  message: string;
}

/**
 * Creates an exact UTC Date instant from a Lagos calendar date (YYYY-MM-DD)
 * and a specific Lagos wall-clock time (HH:mm:ss).
 * 
 * Because Africa/Lagos is strictly UTC+1 year-round:
 * 08:00:00 in Lagos -> 07:00:00.000 UTC
 * 23:59:59 in Lagos -> 22:59:59.000 UTC
 */
export function createLagosInstant(
  dateStr: string, // YYYY-MM-DD
  timeStr: 'start_of_day' | 'end_of_day' | 'school_open' | string
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid date format for Lagos instant: ${dateStr}. Expected YYYY-MM-DD.`);
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let ms = 0;

  if (timeStr === 'start_of_day') {
    hours = 0;
    minutes = 0;
    seconds = 0;
  } else if (timeStr === 'school_open') {
    hours = 8; // 08:00 AM Lagos
    minutes = 0;
    seconds = 0;
  } else if (timeStr === 'end_of_day') {
    hours = 23;
    minutes = 59;
    seconds = 59;
    ms = 999;
  } else {
    const parts = timeStr.split(':').map(Number);
    hours = parts[0] ?? 0;
    minutes = parts[1] ?? 0;
    seconds = parts[2] ?? 0;
  }

  // Lagos is UTC+1. To get UTC, subtract 1 hour from Lagos wall-clock hours.
  const utcMillis = Date.UTC(year, month - 1, day, hours - LAGOS_UTC_OFFSET_HOURS, minutes, seconds, ms);
  return new Date(utcMillis);
}

/**
 * Evaluates whether an Admission Cycle window is currently active and open.
 * Evaluates against an exact instant in UTC, independent of client or machine local timezone.
 */
export function evaluateAdmissionWindow(
  cycle: {
    startDate: Date;
    endDate: Date;
    status: AdmissionCycleStatus;
    name?: string;
  },
  now: Date = new Date()
): WindowEvaluationResult {
  const currentInstant = now.getTime();
  const startInstant = cycle.startDate.getTime();
  const endInstant = cycle.endDate.getTime();

  // 1. Check administrative cycle lifecycle status
  if (cycle.status === AdmissionCycleStatus.UPCOMING) {
    return {
      isOpen: false,
      canAcceptDrafts: false,
      canAcceptSubmissions: false,
      canAcceptPayments: false,
      reason: 'UPCOMING_CYCLE',
      message: `Admissions for ${cycle.name ?? 'this cycle'} have not opened yet.`,
    };
  }

  if (cycle.status === AdmissionCycleStatus.CLOSED) {
    return {
      isOpen: false,
      canAcceptDrafts: false,
      canAcceptSubmissions: false,
      canAcceptPayments: false,
      reason: 'CLOSED_CYCLE',
      message: `Admissions for ${cycle.name ?? 'this cycle'} are officially closed.`,
    };
  }

  if (cycle.status === AdmissionCycleStatus.ARCHIVED) {
    return {
      isOpen: false,
      canAcceptDrafts: false,
      canAcceptSubmissions: false,
      canAcceptPayments: false,
      reason: 'ARCHIVED_CYCLE',
      message: `This admission cycle is archived.`,
    };
  }

  // 2. Cycle status is OPEN: Evaluate temporal boundaries
  if (currentInstant < startInstant) {
    return {
      isOpen: false,
      canAcceptDrafts: false,
      canAcceptSubmissions: false,
      canAcceptPayments: false,
      reason: 'BEFORE_WINDOW',
      message: `Admissions open on ${formatLagosDate(cycle.startDate)}.`,
    };
  }

  if (currentInstant > endInstant) {
    return {
      isOpen: false,
      canAcceptDrafts: false,
      canAcceptSubmissions: false,
      canAcceptPayments: false,
      reason: 'AFTER_WINDOW',
      message: `The admission deadline closed on ${formatLagosDate(cycle.endDate)}. Unsubmitted drafts and new applications are no longer accepted.`,
    };
  }

  // Window is active and open
  return {
    isOpen: true,
    canAcceptDrafts: true,
    canAcceptSubmissions: true,
    canAcceptPayments: true,
    message: `Admissions are currently open until ${formatLagosDate(cycle.endDate)}.`,
  };
}

/**
 * Checks whether a specific programme is accepting applications within an admission cycle.
 */
export function isProgrammeAvailableForApplication(availability?: {
  status: ProgrammeAvailabilityStatus;
}): { isAvailable: boolean; reason?: 'CLOSED' | 'FULL'; message: string } {
  if (!availability) {
    return {
      isAvailable: false,
      reason: 'CLOSED',
      message: 'This programme is not participating in the current admission cycle.',
    };
  }

  if (availability.status === ProgrammeAvailabilityStatus.CLOSED) {
    return {
      isAvailable: false,
      reason: 'CLOSED',
      message: 'Admissions for this programme are closed.',
    };
  }

  if (availability.status === ProgrammeAvailabilityStatus.FULL) {
    return {
      isAvailable: false,
      reason: 'FULL',
      message: 'This programme has reached full intake capacity.',
    };
  }

  return {
    isAvailable: true,
    message: 'Programme is open for application.',
  };
}

/**
 * Formats a UTC Date object into a readable West Africa Time string
 */
export function formatLagosDate(date: Date, includeTime = true): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: SWANFORD_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(includeTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }
      : {}),
  };

  return new Intl.DateTimeFormat('en-GB', options).format(date);
}
