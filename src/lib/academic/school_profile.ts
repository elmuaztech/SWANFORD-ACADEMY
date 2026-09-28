import { ConfigCategory } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { LAGOS_TIMEZONE } from '@/lib/config/timezone';

/**
 * Swanford Academy — School Profile & Configuration Service
 * Master Specification Reference: Sections 3, 5, 6
 *
 * Core Invariant:
 * - Authoritative configuration is DATABASE-DRIVEN from SystemConfig.
 * - No fake or hardcoded operational profile values.
 * - Updates require SYSTEM_CONFIG_MANAGE and produce persistent AuditLog records.
 */

export interface SchoolProfile {
  name: string;
  subtitle?: string;
  motto: string;
  mission?: string;
  vision?: string;
  coreValues?: string;
  address: string;
  state?: string;
  country?: string;
  phonePrimary: string;
  phoneSecondary?: string;
  email: string;
  website?: string;
  proprietor?: string;
  logoUrl?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  primaryColor?: string;
  secondaryColor?: string;
  timezone: string;
}

export const SchoolProfileSchema = z.object({
  name: z.string().min(2, 'School name must have at least 2 characters'),
  subtitle: z.string().optional(),
  motto: z.string().min(2, 'Motto is required'),
  mission: z.string().optional(),
  vision: z.string().optional(),
  coreValues: z.string().optional(),
  address: z.string().min(5, 'Address is required'),
  state: z.string().optional(),
  country: z.string().optional(),
  phonePrimary: z.string().min(5, 'Primary phone is required'),
  phoneSecondary: z.string().optional(),
  email: z.string().email('Valid email is required'),
  website: z.string().url().optional().or(z.literal('')),
  proprietor: z.string().optional(),
  logoUrl: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  primaryColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color').optional(),
  secondaryColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color').optional(),
  timezone: z.string().default(LAGOS_TIMEZONE),
});

export const UpdateSchoolProfileSchema = SchoolProfileSchema.partial();
export type UpdateSchoolProfileInput = z.infer<typeof UpdateSchoolProfileSchema>;

const PROFILE_KEY_MAP: Record<keyof SchoolProfile, string> = {
  name: 'school.name',
  subtitle: 'school.subtitle',
  motto: 'school.motto',
  mission: 'school.mission',
  vision: 'school.vision',
  coreValues: 'school.core_values',
  address: 'school.address',
  state: 'school.state',
  country: 'school.country',
  phonePrimary: 'school.phone_primary',
  phoneSecondary: 'school.phone_secondary',
  email: 'school.email',
  website: 'school.website',
  proprietor: 'school.proprietor',
  logoUrl: 'school.logo_url',
  bankName: 'school.bank_name',
  bankAccountName: 'school.bank_account_name',
  bankAccountNumber: 'school.bank_account_number',
  primaryColor: 'school.primary_color',
  secondaryColor: 'school.secondary_color',
  timezone: 'school.timezone',
};

/**
 * Retrieves the current authoritative school profile from the database.
 */
export async function getSchoolProfile(): Promise<SchoolProfile> {
  const configs = await prisma.systemConfig.findMany({
    where: {
      key: {
        startsWith: 'school.',
      },
    },
  });

  const configMap = new Map<string, string>();
  for (const c of configs) {
    configMap.set(c.key, c.value);
  }

  return {
    name: configMap.get('school.name') || 'Swanford Academy',
    subtitle: configMap.get('school.subtitle') || 'Nursery, Primary & Tahfeez School — Dutse',
    motto: configMap.get('school.motto') || '“Illuminating the Path to Success”',
    mission:
      configMap.get('school.mission') ||
      'To develop highly educated, disciplined, well-mannered and responsible individuals, equipped with the knowledge, character and skills to make a positive impact on society and confidently navigate the challenges of a dynamic world.',
    vision:
      configMap.get('school.vision') ||
      'To become a leading institution recognised for excellence in education, character and discipline, producing highly capable individuals who are respected, responsible and prepared to make a positive impact on society.',
    coreValues:
      configMap.get('school.core_values') ||
      'Excellence • Integrity • Discipline • Respect • Responsibility • Good Character • Wisdom • Leadership',
    address: configMap.get('school.address') || 'PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE',
    state: configMap.get('school.state') || 'Jigawa State',
    country: configMap.get('school.country') || 'Nigeria',
    phonePrimary: configMap.get('school.phone_primary') || '+234 803 695 0352',
    phoneSecondary: configMap.get('school.phone_secondary') || undefined,
    email: configMap.get('school.email') || 'info@swanfordacademy.edu.ng',
    website: configMap.get('school.website') || undefined,
    proprietor: configMap.get('school.proprietor') || 'Muhammad Kanti, Proprietor',
    logoUrl: configMap.get('school.logo_url') || undefined,
    bankName: configMap.get('school.bank_name') || '',
    bankAccountName: configMap.get('school.bank_account_name') || 'Swanford Academy',
    bankAccountNumber: configMap.get('school.bank_account_number') || '',
    primaryColor: configMap.get('school.primary_color') || '#800020',
    secondaryColor: configMap.get('school.secondary_color') || '#D4AF37',
    timezone: configMap.get('school.timezone') || LAGOS_TIMEZONE,
  };
}

/**
 * Updates the school profile in SystemConfig with server-side validation and audit logging.
 */
export async function updateSchoolProfile(
  actorUserId: string,
  input: UpdateSchoolProfileInput
): Promise<SchoolProfile> {
  await requirePermission(actorUserId, PermissionCode.SYSTEM_CONFIG_MANAGE);

  const oldProfile = await getSchoolProfile();
  const merged = { ...oldProfile, ...input };
  const validated = SchoolProfileSchema.parse(merged);

  await prisma.$transaction(async (tx) => {
    for (const [field, key] of Object.entries(PROFILE_KEY_MAP)) {
      const val = validated[field as keyof SchoolProfile];
      if (val !== undefined) {
        await tx.systemConfig.upsert({
          where: { key },
          update: { value: String(val), category: ConfigCategory.GENERAL },
          create: {
            key,
            value: String(val),
            category: ConfigCategory.GENERAL,
            description: `School profile configuration: ${field}`,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'SCHOOL_PROFILE_UPDATED',
        entityType: 'SystemConfig',
        entityId: 'school.profile',
        oldValues: oldProfile as unknown as object,
        newValues: validated as unknown as object,
      },
    });
  });

  return getSchoolProfile();
}
