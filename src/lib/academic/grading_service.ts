import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { getProgramme } from '@/lib/academic/programme_service';

/**
 * Swanford Academy — Grading Foundation Service
 * Master Specification Reference: Sections 3, 5, 6
 *
 * Invariants:
 * - Grading scales and bands are database-driven.
 * - Grade ranges must be non-overlapping and bounded within [0, maxScore].
 * - Configurable pass mark is strictly validated.
 * - Pure score-to-grade resolution.
 */

export const GradingBandInputSchema = z.object({
  grade: z.string().min(1).max(10), // e.g. "A", "B", "Mumtaz"
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  points: z.number().optional(),
  remark: z.string().min(1),
  isPass: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

export const CreateGradingScaleSchema = z.object({
  programmeId: z.string().uuid().optional(),
  code: z.string().min(2).max(30).regex(/^[A-Z0-9_]+$/, 'Grading scale code must be uppercase alphanumeric/underscores'),
  name: z.string().min(2),
  passMark: z.number().min(0).max(100),
  maxScore: z.number().min(1).max(100).default(100),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  bands: z.array(GradingBandInputSchema).min(1, 'At least one grade band is required'),
});

export const UpdateGradingScaleSchema = z.object({
  name: z.string().min(2).optional(),
  passMark: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  bands: z.array(GradingBandInputSchema).min(1).optional(),
});

export type CreateGradingScaleInput = z.input<typeof CreateGradingScaleSchema>;
export type UpdateGradingScaleInput = z.input<typeof UpdateGradingScaleSchema>;

/**
 * Validates that grade bands have minScore <= maxScore and zero overlapping ranges.
 */
export function validateGradingBands(bands: z.infer<typeof GradingBandInputSchema>[], maxScore: number): void {
  // Check internal boundaries
  for (const band of bands) {
    if (band.minScore >= band.maxScore && !(band.minScore === band.maxScore && band.minScore === maxScore)) {
      throw new AuthorizationError(
        `Invalid grade band '${band.grade}': Minimum score (${band.minScore}) must be less than maximum score (${band.maxScore}).`,
        400,
        'INVALID_GRADE_BAND_BOUNDS'
      );
    }
    if (band.maxScore > maxScore) {
      throw new AuthorizationError(
        `Invalid grade band '${band.grade}': Maximum score (${band.maxScore}) cannot exceed scale max score (${maxScore}).`,
        400,
        'BAND_EXCEEDS_MAX_SCORE'
      );
    }
  }

  // Check duplicate grade codes
  const gradeSet = new Set<string>();
  for (const band of bands) {
    if (gradeSet.has(band.grade.toUpperCase())) {
      throw new AuthorizationError(
        `Duplicate grade code '${band.grade}' found in scale bands.`,
        400,
        'DUPLICATE_GRADE_BAND'
      );
    }
    gradeSet.add(band.grade.toUpperCase());
  }

  // Check overlaps between distinct bands
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const b1 = bands[i];
      const b2 = bands[j];

      const maxMin = Math.max(b1.minScore, b2.minScore);
      const minMax = Math.min(b1.maxScore, b2.maxScore);

      // Overlap occurs if the intersection range is positive
      if (maxMin < minMax) {
        throw new AuthorizationError(
          `Overlapping grade ranges detected between band '${b1.grade}' (${b1.minScore}-${b1.maxScore}) and band '${b2.grade}' (${b2.minScore}-${b2.maxScore}).`,
          400,
          'OVERLAPPING_GRADE_BANDS'
        );
      }
    }
  }
}

export async function listGradingScales(options?: {
  programmeId?: string;
  includeInactive?: boolean;
}) {
  return prisma.gradingScale.findMany({
    where: {
      ...(options?.programmeId && { programmeId: options.programmeId }),
      ...(!options?.includeInactive && { isActive: true }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      programme: true,
      bands: {
        orderBy: { minScore: 'desc' },
      },
    },
  });
}

export async function getGradingScale(id: string) {
  const scale = await prisma.gradingScale.findUnique({
    where: { id },
    include: {
      programme: true,
      bands: {
        orderBy: { minScore: 'desc' },
      },
    },
  });

  if (!scale) {
    throw new AuthorizationError('Grading scale not found.', 404, 'GRADING_SCALE_NOT_FOUND');
  }

  return scale;
}

export async function createGradingScale(
  actorUserId: string,
  input: CreateGradingScaleInput
) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const validated = CreateGradingScaleSchema.parse(input);

  if (validated.passMark > validated.maxScore) {
    throw new AuthorizationError(
      `Pass mark (${validated.passMark}) cannot be greater than max score (${validated.maxScore}).`,
      400,
      'INVALID_PASS_MARK'
    );
  }

  if (validated.programmeId) {
    await getProgramme(validated.programmeId);
  }

  const existing = await prisma.gradingScale.findUnique({
    where: { code: validated.code },
  });
  if (existing) {
    throw new AuthorizationError(
      `A grading scale with code '${validated.code}' already exists.`,
      400,
      'DUPLICATE_GRADING_SCALE_CODE'
    );
  }

  validateGradingBands(validated.bands, validated.maxScore);

  return prisma.$transaction(async (tx) => {
    const scale = await tx.gradingScale.create({
      data: {
        programmeId: validated.programmeId || null,
        code: validated.code,
        name: validated.name,
        passMark: validated.passMark,
        maxScore: validated.maxScore,
        description: validated.description,
        isActive: validated.isActive,
        bands: {
          create: validated.bands.map((b) => ({
            grade: b.grade,
            minScore: b.minScore,
            maxScore: b.maxScore,
            points: b.points || null,
            remark: b.remark,
            isPass: b.isPass,
            displayOrder: b.displayOrder,
          })),
        },
      },
      include: {
        bands: true,
        programme: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'GRADING_SCALE_CREATED',
        entityType: 'GradingScale',
        entityId: scale.id,
        newValues: {
          code: scale.code,
          name: scale.name,
          passMark: scale.passMark,
          maxScore: scale.maxScore,
        },
      },
    });

    return scale;
  });
}

export async function updateGradingScale(
  actorUserId: string,
  id: string,
  input: UpdateGradingScaleInput
) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const validated = UpdateGradingScaleSchema.parse(input);
  const scale = await getGradingScale(id);

  const newPassMark = validated.passMark !== undefined ? validated.passMark : Number(scale.passMark);
  const maxScore = Number(scale.maxScore);

  if (newPassMark > maxScore) {
    throw new AuthorizationError(
      `Pass mark (${newPassMark}) cannot exceed max score (${maxScore}).`,
      400,
      'INVALID_PASS_MARK'
    );
  }

  if (validated.bands) {
    validateGradingBands(validated.bands, maxScore);
  }

  return prisma.$transaction(async (tx) => {
    if (validated.bands) {
      await tx.gradingBand.deleteMany({
        where: { gradingScaleId: id },
      });
    }

    const updated = await tx.gradingScale.update({
      where: { id },
      data: {
        ...(validated.name && { name: validated.name }),
        ...(validated.passMark !== undefined && { passMark: validated.passMark }),
        ...(validated.description !== undefined && { description: validated.description }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
        ...(validated.bands && {
          bands: {
            create: validated.bands.map((b) => ({
              grade: b.grade,
              minScore: b.minScore,
              maxScore: b.maxScore,
              points: b.points || null,
              remark: b.remark,
              isPass: b.isPass,
              displayOrder: b.displayOrder,
            })),
          },
        }),
      },
      include: {
        bands: true,
        programme: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'GRADING_SCALE_UPDATED',
        entityType: 'GradingScale',
        entityId: id,
        oldValues: {
          name: scale.name,
          passMark: scale.passMark,
          isActive: scale.isActive,
        },
        newValues: {
          name: updated.name,
          passMark: updated.passMark,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
  });
}

export async function deleteGradingScale(actorUserId: string, id: string) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const scale = await getGradingScale(id);

  await prisma.$transaction(async (tx) => {
    await tx.gradingScale.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'GRADING_SCALE_DELETED',
        entityType: 'GradingScale',
        entityId: id,
        oldValues: {
          code: scale.code,
          name: scale.name,
        },
      },
    });
  });
}

export interface ResolvedGrade {
  grade: string;
  points?: number;
  remark: string;
  isPass: boolean;
  score: number;
}

/**
 * Resolves a score to a grade band based on the configured grading scale.
 * Pure evaluation function.
 */
export async function resolveGrade(
  gradingScaleId: string,
  score: number
): Promise<ResolvedGrade> {
  const scale = await getGradingScale(gradingScaleId);

  if (score < 0 || score > Number(scale.maxScore)) {
    throw new AuthorizationError(
      `Score (${score}) is outside the valid range [0, ${scale.maxScore}].`,
      400,
      'SCORE_OUT_OF_RANGE'
    );
  }

  const matchingBand = scale.bands.find(
    (b) => score >= Number(b.minScore) && score <= Number(b.maxScore)
  );

  if (!matchingBand) {
    throw new AuthorizationError(
      `Score (${score}) could not be resolved by grading scale '${scale.name}': No matching band defined.`,
      500,
      'GRADE_UNRESOLVED'
    );
  }

  return {
    grade: matchingBand.grade,
    points: matchingBand.points ? Number(matchingBand.points) : undefined,
    remark: matchingBand.remark,
    isPass: score >= Number(scale.passMark) && matchingBand.isPass,
    score,
  };
}
