/**
 * Swanford Academy — Timezone & Date Configuration
 * Canonical Timezone: Africa/Lagos (West Africa Time, UTC+1)
 * Master Specification Reference: Sections 3, 5, 6
 */

export const LAGOS_TIMEZONE = 'Africa/Lagos';

/**
 * Returns current date/time string formatted in Africa/Lagos timezone.
 */
export function getLagosDateTimeString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: LAGOS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Validates that startDate is strictly before endDate.
 */
export function validateDateChronology(startDate: Date, endDate: Date): boolean {
  return startDate.getTime() < endDate.getTime();
}

/**
 * Checks if two date ranges [startA, endA] and [startB, endB] overlap.
 * Ranges overlap if: max(startA, startB) <= min(endA, endB).
 */
export function doDateRangesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  const maxStart = Math.max(startA.getTime(), startB.getTime());
  const minEnd = Math.min(endA.getTime(), endB.getTime());
  return maxStart <= minEnd;
}

/**
 * Checks if a target date range [targetStart, targetEnd] is fully contained
 * within an outer date range [outerStart, outerEnd].
 */
export function isDateRangeWithin(
  targetStart: Date,
  targetEnd: Date,
  outerStart: Date,
  outerEnd: Date
): boolean {
  return (
    targetStart.getTime() >= outerStart.getTime() &&
    targetEnd.getTime() <= outerEnd.getTime()
  );
}
