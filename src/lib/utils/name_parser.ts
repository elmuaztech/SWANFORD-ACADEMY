/**
 * Swanford Academy — Full Name Parser Utility
 * 
 * Supports entering full names in a single box (e.g. "Bilkisu Usman Muhammed")
 * across Bulk Enrollment, Single Student Enrollment, Application Forms, and User Accounts.
 */

export interface ParsedName {
  firstName: string;
  lastName: string;
  otherNames?: string;
  fullName: string;
}

/**
 * Parses a single full name string into structured name components.
 * 
 * Examples:
 * - "Bilkisu Usman Muhammed" -> firstName: "Bilkisu", otherNames: "Usman", lastName: "Muhammed"
 * - "Usman Muhammed"         -> firstName: "Usman", otherNames: undefined, lastName: "Muhammed"
 * - "Bilkisu"                -> firstName: "Bilkisu", otherNames: undefined, lastName: "Bilkisu"
 * - "Fatima Zahra Abubakar"  -> firstName: "Fatima", otherNames: "Zahra", lastName: "Abubakar"
 */
export function parseFullName(input: string | null | undefined): ParsedName {
  const clean = (input || '').trim().replace(/\s+/g, ' ');
  if (!clean) {
    return { firstName: '', lastName: '', fullName: '' };
  }

  const parts = clean.split(' ');
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: parts[0],
      fullName: parts[0],
    };
  }

  if (parts.length === 2) {
    return {
      firstName: parts[0],
      lastName: parts[1],
      fullName: `${parts[0]} ${parts[1]}`,
    };
  }

  // 3 or more names (e.g. "Bilkisu Usman Muhammed")
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const otherNames = parts.slice(1, -1).join(' ');

  return {
    firstName,
    lastName,
    otherNames: otherNames || undefined,
    fullName: clean,
  };
}

/**
 * Composes a clean full name from parts.
 */
export function formatFullName(parts?: {
  firstName?: string | null;
  lastName?: string | null;
  otherNames?: string | null;
}): string {
  if (!parts) return '';
  const list = [parts.firstName, parts.otherNames, parts.lastName].filter(Boolean);
  return list.join(' ').trim();
}
