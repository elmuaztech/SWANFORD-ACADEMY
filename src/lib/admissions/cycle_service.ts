import { prisma } from '@/lib/prisma';
import { AdmissionCycleStatus, ProgrammeAvailabilityStatus, Prisma } from '@prisma/client';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { evaluateAdmissionWindow, formatLagosDate, WindowEvaluationResult } from '@/lib/admission_window';
import { z } from 'zod';

export const CreateAdmissionCycleSchema = z.object({
  academicSessionId: z.string().uuid(),
  code: z.string().min(3).max(50).trim(),
  name: z.string().min(3).max(100).trim(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  description: z.string().max(500).optional().nullable(),
  status: z.nativeEnum(AdmissionCycleStatus).optional().default(AdmissionCycleStatus.UPCOMING),
});

export type CreateAdmissionCycleInput = z.input<typeof CreateAdmissionCycleSchema>;

export const UpdateAdmissionCycleSchema = z.object({
  name: z.string().min(3).max(100).trim().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  description: z.string().max(500).optional().nullable(),
  status: z.nativeEnum(AdmissionCycleStatus).optional(),
});

export type UpdateAdmissionCycleInput = z.infer<typeof UpdateAdmissionCycleSchema>;

export const SetProgrammeAvailabilitySchema = z.object({
  status: z.nativeEnum(ProgrammeAvailabilityStatus),
  maxCapacity: z.number().int().positive().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type SetProgrammeAvailabilityInput = z.infer<typeof SetProgrammeAvailabilitySchema>;

/**
 * Valid forward lifecycle transitions for Admission Cycles
 */
const VALID_STATUS_TRANSITIONS: Record<AdmissionCycleStatus, AdmissionCycleStatus[]> = {
  [AdmissionCycleStatus.UPCOMING]: [AdmissionCycleStatus.OPEN, AdmissionCycleStatus.CLOSED, AdmissionCycleStatus.ARCHIVED],
  [AdmissionCycleStatus.OPEN]: [AdmissionCycleStatus.CLOSED, AdmissionCycleStatus.ARCHIVED],
  [AdmissionCycleStatus.CLOSED]: [AdmissionCycleStatus.ARCHIVED],
  [AdmissionCycleStatus.ARCHIVED]: [], // Final terminal state
};

/**
 * Creates a new Admission Cycle container targeting a valid Academic Session.
 */
export async function createAdmissionCycle(
  actor: SafeUser,
  input: CreateAdmissionCycleInput,
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.ADMISSION_CYCLE_MANAGE);
  const validated = CreateAdmissionCycleSchema.parse(input);
  const dbClient = externalTx || prisma;

  // 1. Verify target academic session exists
  const session = await dbClient.academicSession.findUnique({
    where: { id: validated.academicSessionId },
  });
  if (!session) {
    throw new AuthorizationError('Target academic session not found.', 404, 'SESSION_NOT_FOUND');
  }

  // 2. Validate chronology: startDate must be strictly before endDate
  if (validated.startDate.getTime() >= validated.endDate.getTime()) {
    throw new AuthorizationError(
      `Cycle startDate (${formatLagosDate(validated.startDate)}) must be chronologically before endDate (${formatLagosDate(validated.endDate)}).`,
      400,
      'INVALID_CYCLE_CHRONOLOGY'
    );
  }

  // 3. Check uniqueness of code and name
  const existingByCode = await dbClient.admissionCycle.findUnique({
    where: { code: validated.code },
  });
  if (existingByCode) {
    throw new AuthorizationError(
      `An admission cycle with code '${validated.code}' already exists.`,
      400,
      'DUPLICATE_CYCLE_CODE'
    );
  }

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    const cycle = await tx.admissionCycle.create({
      data: {
        academicSessionId: validated.academicSessionId,
        code: validated.code,
        name: validated.name,
        startDate: validated.startDate,
        endDate: validated.endDate,
        status: validated.status,
        description: validated.description || null,
      },
    });

    // Auto-populate availability for all active programmes as default OPEN
    const activeProgrammes = await tx.programme.findMany({
      where: { isActive: true },
    });

    for (const prog of activeProgrammes) {
      await tx.admissionCycleProgramme.create({
        data: {
          admissionCycleId: cycle.id,
          programmeId: prog.id,
          status: ProgrammeAvailabilityStatus.OPEN,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ADMISSION_CYCLE_CREATED',
        entityType: 'admission_cycle',
        entityId: cycle.id,
        newValues: {
          code: cycle.code,
          name: cycle.name,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
          status: cycle.status,
        },
      },
    });

    return cycle;
  };

  return externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);
}

/**
 * Updates an existing Admission Cycle with forward lifecycle validation.
 */
export async function updateAdmissionCycle(
  actor: SafeUser,
  cycleId: string,
  input: UpdateAdmissionCycleInput,
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.ADMISSION_CYCLE_MANAGE);
  const validated = UpdateAdmissionCycleSchema.parse(input);
  const dbClient = externalTx || prisma;

  const existing = await dbClient.admissionCycle.findUnique({
    where: { id: cycleId },
  });
  if (!existing) {
    throw new AuthorizationError('Admission cycle not found.', 404, 'CYCLE_NOT_FOUND');
  }

  const effectiveStart = validated.startDate ?? existing.startDate;
  const effectiveEnd = validated.endDate ?? existing.endDate;

  if (effectiveStart.getTime() >= effectiveEnd.getTime()) {
    throw new AuthorizationError(
      `Cycle startDate (${formatLagosDate(effectiveStart)}) must be chronologically before endDate (${formatLagosDate(effectiveEnd)}).`,
      400,
      'INVALID_CYCLE_CHRONOLOGY'
    );
  }

  // Validate lifecycle transition
  if (validated.status && validated.status !== existing.status) {
    const allowed = VALID_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(validated.status)) {
      throw new AuthorizationError(
        `Invalid admission cycle status transition from '${existing.status}' to '${validated.status}'.`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }
  }

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    const updated = await tx.admissionCycle.update({
      where: { id: cycleId },
      data: {
        name: validated.name ?? existing.name,
        startDate: effectiveStart,
        endDate: effectiveEnd,
        description: validated.description !== undefined ? validated.description : existing.description,
        status: validated.status ?? existing.status,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ADMISSION_CYCLE_UPDATED',
        entityType: 'admission_cycle',
        entityId: updated.id,
        oldValues: {
          name: existing.name,
          startDate: existing.startDate,
          endDate: existing.endDate,
          status: existing.status,
        },
        newValues: {
          name: updated.name,
          startDate: updated.startDate,
          endDate: updated.endDate,
          status: updated.status,
        },
      },
    });

    return updated;
  };

  return externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);
}

/**
 * Sets programme availability status and capacity quota within an admission cycle.
 */
export async function setProgrammeAvailability(
  actor: SafeUser,
  cycleId: string,
  programmeId: string,
  input: SetProgrammeAvailabilityInput,
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.ADMISSION_CYCLE_MANAGE);
  const validated = SetProgrammeAvailabilitySchema.parse(input);
  const dbClient = externalTx || prisma;

  const cycle = await dbClient.admissionCycle.findUnique({
    where: { id: cycleId },
  });
  if (!cycle) {
    throw new AuthorizationError('Admission cycle not found.', 404, 'CYCLE_NOT_FOUND');
  }

  const programme = await dbClient.programme.findUnique({
    where: { id: programmeId },
  });
  if (!programme) {
    throw new AuthorizationError('Programme not found.', 404, 'PROGRAMME_NOT_FOUND');
  }

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    const availability = await tx.admissionCycleProgramme.upsert({
      where: {
        unique_cycle_programme: {
          admissionCycleId: cycleId,
          programmeId,
        },
      },
      update: {
        status: validated.status,
        maxCapacity: validated.maxCapacity !== undefined ? validated.maxCapacity : undefined,
        notes: validated.notes !== undefined ? validated.notes : undefined,
      },
      create: {
        admissionCycleId: cycleId,
        programmeId,
        status: validated.status,
        maxCapacity: validated.maxCapacity || null,
        notes: validated.notes || null,
      },
      include: { programme: true },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PROGRAMME_AVAILABILITY_CHANGED',
        entityType: 'admission_cycle_programme',
        entityId: availability.id,
        newValues: {
          cycleId,
          programme: programme.name,
          status: availability.status,
          maxCapacity: availability.maxCapacity,
        },
      },
    });

    return availability;
  };

  return externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);
}

/**
 * Retrieves the currently active admission cycle along with available open programmes.
 * Evaluates temporal boundaries strictly in Africa/Lagos timezone.
 */
export async function getActiveAdmissionCycle(
  now: Date = new Date(),
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const cycles = await client.admissionCycle.findMany({
    where: { status: AdmissionCycleStatus.OPEN },
    include: {
      academicSession: true,
      programmeAvailabilities: {
        include: { programme: true },
      },
    },
    orderBy: { startDate: 'desc' },
  });

  for (const cycle of cycles) {
    const evaluation: WindowEvaluationResult = evaluateAdmissionWindow(cycle, now);
    if (evaluation.isOpen) {
      return {
        cycle,
        evaluation,
        openProgrammes: cycle.programmeAvailabilities.filter(
          (p) => p.status === ProgrammeAvailabilityStatus.OPEN
        ),
      };
    }
  }

  return null;
}

/**
 * Retrieves an admission cycle by ID with its programme availabilities.
 */
export async function getAdmissionCycleById(
  cycleId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const cycle = await client.admissionCycle.findUnique({
    where: { id: cycleId },
    include: {
      academicSession: true,
      programmeAvailabilities: {
        include: { programme: true },
        orderBy: { programme: { displayOrder: 'asc' } },
      },
    },
  });

  if (!cycle) {
    throw new AuthorizationError('Admission cycle not found.', 404, 'CYCLE_NOT_FOUND');
  }

  return cycle;
}

/**
 * Lists all admission cycles with optional filtering.
 */
export async function listAdmissionCycles(
  actor: SafeUser,
  filter?: {
    status?: AdmissionCycleStatus;
    academicSessionId?: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.ADMISSION_APPLICATION_VIEW);

  return client.admissionCycle.findMany({
    where: {
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.academicSessionId ? { academicSessionId: filter.academicSessionId } : {}),
    },
    include: {
      academicSession: true,
      _count: {
        select: { applications: true },
      },
    },
    orderBy: { startDate: 'desc' },
  });
}
