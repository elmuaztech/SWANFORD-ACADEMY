import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { AssessmentType, Prisma } from '@prisma/client';

export interface AssessmentComponentDef {
  name: string; // e.g. "Continuous Assessment", "Examination"
  shortCode: string; // e.g. "CA", "EXAM"
  maxScore: number; // e.g. 30, 70
  weightPercentage: number; // e.g. 30, 70
  type: AssessmentType;
}

export interface CreateAssessmentConfigInput {
  name: string;
  code?: string;
  description?: string;
  isDefault?: boolean;
  components: AssessmentComponentDef[];
  totalMaxScore?: number;
  programmeId?: string | null;
  academicSessionId?: string;
  academicTermId?: string | null;
  schoolClassId?: string | null;
  subjectId?: string | null;
  isActive?: boolean;
}

export interface UpdateAssessmentConfigInput {
  name?: string;
  code?: string;
  description?: string;
  isDefault?: boolean;
  components?: AssessmentComponentDef[];
  totalMaxScore?: number;
  programmeId?: string | null;
  academicSessionId?: string;
  academicTermId?: string | null;
  schoolClassId?: string | null;
  subjectId?: string | null;
  isActive?: boolean;
}

/**
 * Swanford Academy — Dynamic Assessment Structure Configuration Service
 * Allows Super Admin to configure assessment breakdown (e.g., CA 30 + Exam 70).
 */

export async function listAssessmentConfigs(actor?: SafeUser | string) {
  if (actor) {
    const actorUserId = typeof actor === 'string' ? actor : actor.id;
    await requirePermission(actorUserId, PermissionCode.ASSESSMENT_VIEW);
  }

  return prisma.assessmentStructureConfig.findMany({
    include: {
      programme: { select: { id: true, name: true, code: true } },
      schoolClass: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      academicSession: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
}

export async function getAssessmentConfig(id: string) {
  const config = await prisma.assessmentStructureConfig.findUnique({
    where: { id },
    include: {
      programme: { select: { id: true, name: true, code: true } },
      schoolClass: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      academicSession: { select: { id: true, name: true } },
    },
  });

  if (!config) {
    throw new AuthorizationError('Assessment structure configuration not found.', 404, 'CONFIG_NOT_FOUND');
  }

  return config;
}

export async function createAssessmentConfig(
  actor: SafeUser | string,
  input: CreateAssessmentConfigInput
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.SYSTEM_CONFIG_MANAGE);

  if (!input.name || input.name.trim().length === 0) {
    throw new AuthorizationError('Configuration name is required.', 400, 'NAME_REQUIRED');
  }

  if (!input.components || !Array.isArray(input.components) || input.components.length === 0) {
    throw new AuthorizationError(
      'At least one assessment component (e.g., Continuous Assessment or Exam) is required.',
      400,
      'COMPONENTS_REQUIRED'
    );
  }

  // Validate components and calculate total max score
  let calculatedTotal = 0;
  for (const comp of input.components) {
    if (!comp.name || comp.name.trim().length === 0) {
      throw new AuthorizationError('Component name is required for each component.', 400, 'INVALID_COMPONENT');
    }
    if (comp.maxScore <= 0) {
      throw new AuthorizationError(`Max score for ${comp.name} must be greater than zero.`, 400, 'INVALID_SCORE');
    }
    calculatedTotal += comp.maxScore;
  }

  const totalMaxScore = input.totalMaxScore && input.totalMaxScore > 0 ? input.totalMaxScore : calculatedTotal;

  // Resolve active session
  let sessionId = input.academicSessionId;
  if (!sessionId) {
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!activeSession) {
      throw new AuthorizationError('No active academic session found.', 400, 'NO_ACTIVE_SESSION');
    }
    sessionId = activeSession.id;
  }

  // Resolve programmeId if not provided (default to primary academic)
  let programmeId = input.programmeId;
  if (!programmeId) {
    const defaultProg = await prisma.programme.findFirst({
      where: { isMainAcademic: true, isActive: true },
      select: { id: true },
    });
    if (!defaultProg) {
      throw new AuthorizationError('Programme ID is required.', 400, 'PROGRAMME_REQUIRED');
    }
    programmeId = defaultProg.id;
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.assessmentStructureConfig.create({
      data: {
        name: input.name.trim(),
        academicSessionId: sessionId,
        academicTermId: input.academicTermId || null,
        programmeId,
        schoolClassId: input.schoolClassId || null,
        subjectId: input.subjectId || null,
        componentsJson: input.components as unknown as Prisma.InputJsonValue,
        totalMaxScore: new Prisma.Decimal(totalMaxScore),
        isActive: input.isActive !== undefined ? input.isActive : true,
        createdById: actorUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_CONFIG_CREATED',
        entityType: 'AssessmentStructureConfig',
        entityId: created.id,
        newValues: {
          name: created.name,
          totalMaxScore,
          componentsCount: input.components.length,
        },
      },
    });

    return created;
  });
}

export async function updateAssessmentConfig(
  actor: SafeUser | string,
  id: string,
  input: UpdateAssessmentConfigInput
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.SYSTEM_CONFIG_MANAGE);

  const existing = await prisma.assessmentStructureConfig.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AuthorizationError('Assessment configuration not found.', 404, 'CONFIG_NOT_FOUND');
  }

  const components = input.components;
  let totalMaxScore = input.totalMaxScore ? new Prisma.Decimal(input.totalMaxScore) : existing.totalMaxScore;

  if (components) {
    if (!Array.isArray(components) || components.length === 0) {
      throw new AuthorizationError('At least one assessment component is required.', 400, 'COMPONENTS_REQUIRED');
    }

    let calculatedTotal = 0;
    for (const comp of components) {
      if (!comp.name || comp.name.trim().length === 0) {
        throw new AuthorizationError('Component name is required for each component.', 400, 'INVALID_COMPONENT');
      }
      if (comp.maxScore <= 0) {
        throw new AuthorizationError(`Max score for ${comp.name} must be greater than zero.`, 400, 'INVALID_SCORE');
      }
      calculatedTotal += comp.maxScore;
    }
    if (!input.totalMaxScore) {
      totalMaxScore = new Prisma.Decimal(calculatedTotal);
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.assessmentStructureConfig.update({
      where: { id },
      data: {
        name: input.name !== undefined ? input.name.trim() : undefined,
        academicSessionId: input.academicSessionId !== undefined ? input.academicSessionId : undefined,
        academicTermId: input.academicTermId !== undefined ? (input.academicTermId || null) : undefined,
        programmeId: input.programmeId !== undefined ? (input.programmeId || undefined) : undefined,
        schoolClassId: input.schoolClassId !== undefined ? (input.schoolClassId || null) : undefined,
        subjectId: input.subjectId !== undefined ? (input.subjectId || null) : undefined,
        componentsJson: components ? (components as unknown as Prisma.InputJsonValue) : undefined,
        totalMaxScore,
        isActive: input.isActive !== undefined ? input.isActive : undefined,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_CONFIG_UPDATED',
        entityType: 'AssessmentStructureConfig',
        entityId: id,
        newValues: {
          name: updated.name,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
  });
}

export async function deleteAssessmentConfig(
  actor: SafeUser | string,
  id: string
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.SYSTEM_CONFIG_MANAGE);

  const existing = await prisma.assessmentStructureConfig.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AuthorizationError('Assessment configuration not found.', 404, 'CONFIG_NOT_FOUND');
  }

  await prisma.$transaction(async (tx) => {
    await tx.assessmentStructureConfig.delete({ where: { id } });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_CONFIG_DELETED',
        entityType: 'AssessmentStructureConfig',
        entityId: id,
        newValues: { name: existing.name },
      },
    });
  });

  return { success: true };
}

export async function getDefaultAssessmentConfig(programmeId?: string) {
  if (programmeId) {
    const programmeDefault = await prisma.assessmentStructureConfig.findFirst({
      where: { programmeId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (programmeDefault) return programmeDefault;
  }

  return prisma.assessmentStructureConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}
