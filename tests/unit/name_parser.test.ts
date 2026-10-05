import { describe, it, expect } from 'vitest';
import { parseFullName, formatFullName } from '@/lib/utils/name_parser';
import { CreateApplicationSchema } from '@/lib/admissions/application_service';

describe('Name Parser Utility & Full Name Input Standard', () => {
  it('correctly parses three-part Nigerian names into firstName, otherNames, and lastName', () => {
    const parsed = parseFullName('Bilkisu Usman Muhammed');
    expect(parsed.firstName).toBe('Bilkisu');
    expect(parsed.otherNames).toBe('Usman');
    expect(parsed.lastName).toBe('Muhammed');
    expect(parsed.fullName).toBe('Bilkisu Usman Muhammed');
  });

  it('correctly parses two-part names', () => {
    const parsed = parseFullName('Usman Muhammed');
    expect(parsed.firstName).toBe('Usman');
    expect(parsed.otherNames).toBeUndefined();
    expect(parsed.lastName).toBe('Muhammed');
    expect(parsed.fullName).toBe('Usman Muhammed');
  });

  it('correctly handles four-part compound names', () => {
    const parsed = parseFullName('Fatima Zahra Al-Amin Abubakar');
    expect(parsed.firstName).toBe('Fatima');
    expect(parsed.otherNames).toBe('Zahra Al-Amin');
    expect(parsed.lastName).toBe('Abubakar');
    expect(parsed.fullName).toBe('Fatima Zahra Al-Amin Abubakar');
  });

  it('gracefully handles single name inputs', () => {
    const parsed = parseFullName('Bilkisu');
    expect(parsed.firstName).toBe('Bilkisu');
    expect(parsed.lastName).toBe('Bilkisu');
    expect(parsed.otherNames).toBeUndefined();
  });

  it('handles null, undefined, and empty string without throwing', () => {
    expect(parseFullName('')).toEqual({ firstName: '', lastName: '', fullName: '' });
    expect(parseFullName(null)).toEqual({ firstName: '', lastName: '', fullName: '' });
    expect(parseFullName(undefined)).toEqual({ firstName: '', lastName: '', fullName: '' });
  });

  it('formats full names correctly from parts', () => {
    expect(formatFullName({ firstName: 'Bilkisu', otherNames: 'Usman', lastName: 'Muhammed' })).toBe('Bilkisu Usman Muhammed');
    expect(formatFullName({ firstName: 'Usman', lastName: 'Muhammed' })).toBe('Usman Muhammed');
  });

  it('validates CreateApplicationSchema with single applicantFullName and guardianFullName', () => {
    const rawInput = {
      admissionCycleId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      applicantFullName: 'Bilkisu Usman Muhammed',
      applicantGender: 'FEMALE' as const,
      applicantDob: '2018-01-01',
      guardianFullName: 'Usman Muhammed',
      guardianEmail: 'usman.muhammed@example.com',
      guardianPhone: '08035671947',
      guardianRelationship: 'FATHER' as const,
      applicantAddress: 'No 11 Kasarau Street, Dutse',
      placeOfBirth: 'Dutse',
      stateOfOrigin: 'Adamawa',
      lga: 'Yola North',
      nationality: 'Nigerian',
      specialAttention: 'None',
      additionalInformation: 'Pre-school graduate',
      guardianOccupation: 'Civil Servant',
      guardianAddress: 'Federal University Dutse, Faculty of Education',
      programmeSelections: [
        { programmeId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' },
      ],
    };

    const validated = CreateApplicationSchema.parse(rawInput);
    expect(validated.applicantFirstName).toBe('Bilkisu');
    expect(validated.applicantOtherNames).toBe('Usman');
    expect(validated.applicantLastName).toBe('Muhammed');
    expect(validated.guardianFirstName).toBe('Usman');
    expect(validated.guardianLastName).toBe('Muhammed');
    expect(validated.applicantAddress).toBe('No 11 Kasarau Street, Dutse');
    expect(validated.guardianOccupation).toBe('Civil Servant');
  });
});
