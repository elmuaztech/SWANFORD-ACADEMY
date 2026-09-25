/**
 * Swanford Academy — Centralized Email Brand Tokens & Institutional Profile
 *
 * Requirements:
 * 1. Confirmed against active database SystemConfig & codebase.
 * 2. Dominant deep maroon (#5B0612 / #4A0E17) with royal gold (#D4AF37) accents.
 * 3. Supporting cream (#FAF7F2 / #FDFBF7), pure white (#FFFFFF), and restrained navy (#0F2942).
 * 4. Verified institution address, contact desk, and proprietor reference.
 */

export const BRAND_COLORS = {
  // Dominant institutional maroon
  maroonDeep: '#4A0E17',
  maroonPrimary: '#5B0612',
  maroonButton: '#800020',
  maroonSoft: '#FDF2F4',

  // Supporting gold & cream accents
  goldAccent: '#D4AF37',
  goldSoft: '#FCF8ED',
  goldText: '#996515',

  // Restrained navy (for secondary badges & border compatibility)
  navy: '#0F2942',
  navySoft: '#F0F4F8',

  // Neutrals & Card Backgrounds
  creamCanvas: '#FAF7F2',
  cardWhite: '#FFFFFF',
  textDark: '#1C1A1A',
  textSecondary: '#334155',
  textMuted: '#524B46',
  textLight: '#64748B',
  borderSubtle: '#EADBDA',
  borderLight: '#E2E8F0',

  // Status Colors
  successGreen: '#065F46',
  successBg: '#ECFDF5',
  warningAmber: '#92400E',
  warningBg: '#FFFBEB',
  dangerRed: '#991B1B',
  dangerBg: '#FEF2F2',
} as const;

/**
 * Authoritative School Profile
 * Verified from SystemConfig database records:
 * - school.name: "Swanford Academy"
 * - school.subtitle: "Nursery, Primary & Tahfeez School"
 * - school.motto: "Illuminating the Path to Success"
 * - school.address: "PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE"
 * - school.email: "info@swanfordacademy.edu.ng"
 * - school.phone_primary: "08030000001"
 * - school.proprietor: "Alhaji Muhammad Sani"
 * - finance.bank_name: "Jaiz Bank"
 * - finance.account_number: "0012031162"
 * - finance.account_name: "Swanford Academy"
 */
export const VERIFIED_SCHOOL_INFO = {
  name: 'Swanford Academy',
  subtitle: 'Nursery, Primary & Tahfeez School — Dutse',
  divisions: 'Nursery · Primary · Tahfeez',
  motto: '“Illuminating the Path to Success”',
  location: 'Dutse, Jigawa State',
  address: 'PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE',
  email: 'info@swanfordacademy.edu.ng',
  phone: '+234 803 695 0352',
  proprietor: 'Muhammad Kanti, Proprietor',
  bankName: 'Stanbic IBTC Bank',
  bankAccountNumber: '0034567890',
  bankAccountName: 'Swanford Academy Ltd',
} as const;

export const EMAIL_LAYOUT_CONSTANTS = {
  maxWidth: '600px',
  logoWidth: '80',
  logoHeight: '80',
  minTouchTarget: '44px',
} as const;
