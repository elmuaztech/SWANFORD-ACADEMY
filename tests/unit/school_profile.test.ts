import { describe, it, expect } from 'vitest';
import {
  SchoolProfileSchema,
} from '@/lib/academic/school_profile';
import {
  LAGOS_TIMEZONE,
  validateDateChronology,
  doDateRangesOverlap,
  isDateRangeWithin,
} from '@/lib/config/timezone';

describe('Unit Tests: School Profile & Timezone Configuration', () => {
  it('validates a valid school profile input', () => {
    const valid = {
      name: 'Swanford Academy',
      motto: 'Illuminating the Path to Success',
      address: 'Plot 212, Dutse, Jigawa State',
      phonePrimary: '08031234567',
      email: 'info@swanfordacademy.edu.ng',
      timezone: LAGOS_TIMEZONE,
      primaryColor: '#1E3A8A',
      secondaryColor: '#F59E0B',
    };

    const parsed = SchoolProfileSchema.parse(valid);
    expect(parsed.name).toBe('Swanford Academy');
    expect(parsed.timezone).toBe('Africa/Lagos');
  });

  it('rejects invalid email formats', () => {
    const invalid = {
      name: 'Swanford Academy',
      motto: 'Illuminating the Path to Success',
      address: 'Plot 212, Dutse, Jigawa State',
      phonePrimary: '08031234567',
      email: 'not-an-email',
    };

    expect(() => SchoolProfileSchema.parse(invalid)).toThrow();
  });

  it('rejects invalid hex color codes', () => {
    const invalid = {
      name: 'Swanford Academy',
      motto: 'Illuminating the Path to Success',
      address: 'Plot 212, Dutse, Jigawa State',
      phonePrimary: '08031234567',
      email: 'info@swanfordacademy.edu.ng',
      primaryColor: 'not-a-color',
    };

    expect(() => SchoolProfileSchema.parse(invalid)).toThrow();
  });

  describe('Timezone & Date Utilities (Africa/Lagos)', () => {
    it('correctly validates chronological dates', () => {
      const start = new Date('2026-09-01');
      const end = new Date('2027-07-31');
      expect(validateDateChronology(start, end)).toBe(true);
      expect(validateDateChronology(end, start)).toBe(false);
      expect(validateDateChronology(start, start)).toBe(false);
    });

    it('correctly identifies overlapping date ranges', () => {
      const term1Start = new Date('2026-09-01');
      const term1End = new Date('2026-12-15');

      const term2Start = new Date('2026-12-10'); // Overlaps with term 1
      const term2End = new Date('2027-04-10');

      expect(doDateRangesOverlap(term1Start, term1End, term2Start, term2End)).toBe(true);
    });

    it('correctly confirms non-overlapping date ranges', () => {
      const term1Start = new Date('2026-09-01');
      const term1End = new Date('2026-12-15');

      const term2Start = new Date('2027-01-10'); // Disjoint
      const term2End = new Date('2027-04-10');

      expect(doDateRangesOverlap(term1Start, term1End, term2Start, term2End)).toBe(false);
    });

    it('correctly verifies containment within session bounds', () => {
      const sessionStart = new Date('2026-09-01');
      const sessionEnd = new Date('2027-07-31');

      const termStart = new Date('2026-09-15');
      const termEnd = new Date('2026-12-10');

      expect(isDateRangeWithin(termStart, termEnd, sessionStart, sessionEnd)).toBe(true);

      const outOfBoundsTermEnd = new Date('2027-08-15');
      expect(isDateRangeWithin(termStart, outOfBoundsTermEnd, sessionStart, sessionEnd)).toBe(false);
    });
  });
});
