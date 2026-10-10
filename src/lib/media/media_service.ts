import crypto from 'crypto';
import { RoleCode, MediaType, MediaAsset, EnrollmentStatus, RelationshipStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError, hasPermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { assertTeacherStudentScope } from '@/lib/auth/scopes';
import { processProfilePhoto, processGalleryPhoto } from './image_processor';
import { saveMediaFile, readMediaFile, deleteMediaFile } from './storage';

/**
 * Swanford Academy — Central Media & Profile Photo Service
 * Master Specification Reference: Work Package B Final Addendum (Media & Profile Photos)
 *
 * Rules:
 * 1. ONE unified domain service for Students, Teachers, Parents, Admins, Super Admins.
 * 2. Zero binary data in PostgreSQL.
 * 3. Never construct filesystem paths from user input.
 * 4. IDOR-safe delivery with server-side authorization.
 * 5. Single-binary reuse: Application photo transfers to Student without duplication.
 * 6. Reference-safe cleanup of replaced media assets.
 * 7. Scoped teacher authorization via STUDENT_PROFILE_PHOTO_UPDATE and TeacherScope.
 */

function actorHasRole(actor: SafeUser, role: RoleCode): boolean {
  return Boolean(actor.roles?.includes(role));
}

export interface CreateMediaAssetOptions {
  buffer: Buffer;
  originalFilename?: string;
  uploadedById?: string;
  mediaType?: MediaType;
  targetDimension?: number;
}

/**
 * Optimizes an uploaded profile photo and stores both the file and its database reference.
 * The original image is immediately discarded and never persisted.
 */
export async function uploadAndStoreProfilePhoto(options: CreateMediaAssetOptions): Promise<MediaAsset> {
  const processed = await processProfilePhoto(options.buffer, {
    targetDimension: options.targetDimension || 320,
  });

  const assetId = crypto.randomUUID();
  const storageKey = `profile-photos/${assetId}.webp`;

  // Persist optimized WebP to disk
  await saveMediaFile(storageKey, processed.buffer);

  // Store metadata record in PostgreSQL
  const mediaAsset = await prisma.mediaAsset.create({
    data: {
      id: assetId,
      storageKey,
      mediaType: options.mediaType || MediaType.PROFILE_PHOTO,
      mimeType: processed.mimeType,
      fileSize: processed.size,
      width: processed.width,
      height: processed.height,
      checksum: processed.checksum,
      uploadedById: options.uploadedById || null,
    },
  });

  return mediaAsset;
}

/**
 * Optimizes an uploaded gallery photo and stores both the file and its database reference.
 * Supports both landscape and portrait orientations without distortion.
 */
export async function uploadAndStoreGalleryPhoto(options: {
  buffer: Buffer;
  uploadedById?: string;
  maxWidth?: number;
  maxHeight?: number;
}): Promise<MediaAsset> {
  const processed = await processGalleryPhoto(options.buffer, {
    maxWidth: options.maxWidth || 1920,
    maxHeight: options.maxHeight || 1080,
  });

  const assetId = crypto.randomUUID();
  const storageKey = `gallery-photos/${assetId}.webp`;

  await saveMediaFile(storageKey, processed.buffer);

  const mediaAsset = await prisma.mediaAsset.create({
    data: {
      id: assetId,
      storageKey,
      mediaType: MediaType.GALLERY_PHOTO,
      mimeType: processed.mimeType,
      fileSize: processed.size,
      width: processed.width,
      height: processed.height,
      checksum: processed.checksum,
      uploadedById: options.uploadedById || null,
    },
  });

  return mediaAsset;
}

/**
 * Retrieves a media asset metadata record by ID.
 */
export async function getMediaAsset(id: string): Promise<MediaAsset | null> {
  return prisma.mediaAsset.findUnique({
    where: { id },
  });
}

/**
 * Retrieves an authorized media file buffer with strict IDOR protections.
 */
export async function getAuthorizedMedia(
  assetId: string,
  actor: SafeUser | null
): Promise<{ asset: MediaAsset; buffer: Buffer }> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
  });

  if (!asset) {
    throw new AuthorizationError('Media asset not found.', 404, 'MEDIA_NOT_FOUND');
  }

  // Gallery Photos: Published photos are publicly accessible to all (including unauthenticated visitors)
  if (asset.mediaType === MediaType.GALLERY_PHOTO) {
    const isStaff = actor && (actorHasRole(actor, RoleCode.SUPER_ADMIN) || actorHasRole(actor, RoleCode.ADMIN));
    if (isStaff) {
      const buffer = await readMediaFile(asset.storageKey);
      return { asset, buffer };
    }

    const galleryItem = await prisma.galleryItem.findFirst({
      where: { mediaAssetId: assetId },
    });

    if (galleryItem && galleryItem.isPublished) {
      const buffer = await readMediaFile(asset.storageKey);
      return { asset, buffer };
    }

    if (!actor) {
      throw new AuthorizationError('Authentication required to access unpublished media.', 401, 'UNAUTHENTICATED');
    }
    throw new AuthorizationError('You do not have permission to view unpublished gallery media.', 403, 'FORBIDDEN');
  }

  // Non-gallery media assets (profile photos, student documents) require authentication
  if (!actor) {
    throw new AuthorizationError('Authentication required to access media asset.', 401, 'UNAUTHENTICATED');
  }

  const isSuperAdmin = actorHasRole(actor, RoleCode.SUPER_ADMIN);
  const isAdmin = actorHasRole(actor, RoleCode.ADMIN);

  // Super Admin and Admin have school-wide oversight
  if (isSuperAdmin || isAdmin) {
    const buffer = await readMediaFile(asset.storageKey);
    return { asset, buffer };
  }

  // Check if asset is actor's own user profile photo
  if (actor.profilePhotoId === assetId || asset.uploadedById === actor.id) {
    const buffer = await readMediaFile(asset.storageKey);
    return { asset, buffer };
  }

  const isTeacher = actorHasRole(actor, RoleCode.TEACHER);
  const isParent = actorHasRole(actor, RoleCode.PARENT);

  // 1. Check if asset belongs to a Student
  const student = await prisma.student.findFirst({
    where: { profilePhotoId: assetId },
    include: {
      programmeEnrollments: {
        where: { enrollmentStatus: EnrollmentStatus.ACTIVE },
      },
      guardianLinks: {
        where: { status: RelationshipStatus.ACTIVE },
      },
    },
  });

  if (student) {
    if (isTeacher) {
      // Check if teacher has an active scope for this student's programme/class
      const teacher = await prisma.teacher.findUnique({
        where: { userId: actor.id },
        include: { scopes: true },
      });

      if (teacher && teacher.scopes.length > 0) {
        const studentEnrollments = student.programmeEnrollments;
        const hasMatchingScope = teacher.scopes.some((scope) => {
          return studentEnrollments.some((enr) => {
            if (scope.academicSessionId !== enr.academicSessionId) return false;
            if (scope.programmeId !== enr.programmeId) return false;
            if (scope.schoolClassId && scope.schoolClassId !== enr.schoolClassId) return false;
            return true;
          });
        });

        if (hasMatchingScope) {
          const buffer = await readMediaFile(asset.storageKey);
          return { asset, buffer };
        }
      }
    }

    if (isParent) {
      // Check if parent has active relationship with this student
      const guardian = await prisma.guardian.findUnique({
        where: { userId: actor.id },
      });

      if (guardian) {
        const isLinked = student.guardianLinks.some((link) => link.guardianId === guardian.id);
        if (isLinked) {
          const buffer = await readMediaFile(asset.storageKey);
          return { asset, buffer };
        }
      }
    }
  }

  // 2. Check if asset belongs to an Application (e.g. parent reviewing draft / admitted child)
  const application = await prisma.application.findFirst({
    where: { profilePhotoId: assetId },
  });

  if (application) {
    if (isParent && application.guardianEmail.toLowerCase() === actor.email.toLowerCase()) {
      const buffer = await readMediaFile(asset.storageKey);
      return { asset, buffer };
    }
  }

  throw new AuthorizationError(
    'Access denied: You do not have authorization to view this media asset.',
    403,
    'MEDIA_ACCESS_DENIED'
  );
}

/**
 * Safely removes a media file from disk and deletes the database record ONLY IF
 * no Student, User, or Application still references it.
 */
export async function cleanupOrphanedMediaAsset(assetId: string): Promise<boolean> {
  const [studentRefs, userRefs, appRefs, galleryRefs] = await Promise.all([
    prisma.student.count({ where: { profilePhotoId: assetId } }),
    prisma.user.count({ where: { profilePhotoId: assetId } }),
    prisma.application.count({ where: { profilePhotoId: assetId } }),
    prisma.galleryItem.count({ where: { mediaAssetId: assetId } }),
  ]);

  const totalRefs = studentRefs + userRefs + appRefs + galleryRefs;
  if (totalRefs > 0) {
    // Media is still actively referenced by other entities — preserve it!
    return false;
  }

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
  });

  if (!asset) return false;

  // Safe file removal
  await deleteMediaFile(asset.storageKey);

  // Delete DB record
  await prisma.mediaAsset.delete({
    where: { id: assetId },
  });

  return true;
}

/**
 * Bulk cleanup utility for unclaimed / abandoned media uploads older than specified threshold.
 * Runs safely against orphaned media files without touching active references.
 */
export async function cleanupAbandonedMediaUploads(olderThanHours = 24): Promise<{ inspected: number; deleted: number }> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const potentialOrphans = await prisma.mediaAsset.findMany({
    where: {
      createdAt: { lt: cutoff },
    },
    select: { id: true },
  });

  let deletedCount = 0;
  for (const item of potentialOrphans) {
    const wasDeleted = await cleanupOrphanedMediaAsset(item.id);
    if (wasDeleted) deletedCount++;
  }

  return { inspected: potentialOrphans.length, deleted: deletedCount };
}

/**
 * Replaces a profile photo on a target entity (User, Student, or Application).
 * Transactionally updates reference and cleans up the previous photo if orphaned.
 */
export async function replaceProfilePhoto(
  target: { type: 'STUDENT' | 'USER' | 'APPLICATION'; id: string },
  newAssetId: string,
  actor: SafeUser
): Promise<void> {
  let oldAssetId: string | null = null;

  if (target.type === 'USER') {
    // Only self or Super Admin / Admin can change user photo
    const isSelf = actor.id === target.id;
    const isAdmin = actorHasRole(actor, RoleCode.SUPER_ADMIN) || actorHasRole(actor, RoleCode.ADMIN);
    if (!isSelf && !isAdmin) {
      throw new AuthorizationError('Access denied: Cannot change another user photo.', 403, 'USER_PHOTO_UNAUTHORIZED');
    }

    const user = await prisma.user.findUnique({
      where: { id: target.id },
      select: { profilePhotoId: true },
    });
    oldAssetId = user?.profilePhotoId || null;

    await prisma.user.update({
      where: { id: target.id },
      data: { profilePhotoId: newAssetId },
    });
  } else if (target.type === 'STUDENT') {
    // Admin or Teacher with STUDENT_PROFILE_PHOTO_UPDATE
    const isSuperAdmin = actorHasRole(actor, RoleCode.SUPER_ADMIN);
    const isAdmin = actorHasRole(actor, RoleCode.ADMIN);

    if (!isSuperAdmin && !isAdmin) {
      const isTeacher = actorHasRole(actor, RoleCode.TEACHER);
      const canUpdate = hasPermission(actor, PermissionCode.STUDENT_PROFILE_PHOTO_UPDATE);

      if (!isTeacher || !canUpdate) {
        throw new AuthorizationError(
          'Access denied: Missing STUDENT_PROFILE_PHOTO_UPDATE permission.',
          403,
          'PERMISSION_DENIED'
        );
      }
    }

    const student = await prisma.student.findUnique({
      where: { id: target.id },
      select: { profilePhotoId: true },
    });
    oldAssetId = student?.profilePhotoId || null;

    await prisma.student.update({
      where: { id: target.id },
      data: { profilePhotoId: newAssetId },
    });
  } else if (target.type === 'APPLICATION') {
    const app = await prisma.application.findUnique({
      where: { id: target.id },
      select: { profilePhotoId: true, guardianEmail: true },
    });
    oldAssetId = app?.profilePhotoId || null;

    await prisma.application.update({
      where: { id: target.id },
      data: { profilePhotoId: newAssetId },
    });
  }

  // If old asset exists and differs from new, clean up if unreferenced
  if (oldAssetId && oldAssetId !== newAssetId) {
    await cleanupOrphanedMediaAsset(oldAssetId);
  }
}

/**
 * Transfers an existing photo from an Application to a Student record upon admission.
 * Reuses the single MediaAsset reference with ZERO duplicate binary files.
 */
export async function transferApplicationPhotoToStudent(
  applicationId: string,
  studentId: string
): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { profilePhotoId: true },
  });

  if (!application || !application.profilePhotoId) {
    return;
  }

  await prisma.student.update({
    where: { id: studentId },
    data: { profilePhotoId: application.profilePhotoId },
  });
}

/**
 * Handles a teacher updating a student's profile photo with full TeacherScope validation.
 */
export async function updateStudentPhotoByTeacher(
  actor: SafeUser,
  studentId: string,
  imageBuffer: Buffer,
  requirement: {
    programmeId: string;
    schoolClassId?: string;
    academicSessionId?: string;
  }
): Promise<MediaAsset> {
  // 1. Validate teacher role
  if (!actorHasRole(actor, RoleCode.TEACHER)) {
    throw new AuthorizationError('Only teachers can perform this scoped action.', 403, 'TEACHER_ROLE_REQUIRED');
  }

  // 2. Validate dedicated permission (STUDENT_VIEW is NOT enough!)
  if (!hasPermission(actor, PermissionCode.STUDENT_PROFILE_PHOTO_UPDATE)) {
    throw new AuthorizationError(
      'Access denied: Teacher does not possess STUDENT_PROFILE_PHOTO_UPDATE permission.',
      403,
      'STUDENT_PROFILE_PHOTO_UPDATE_REQUIRED'
    );
  }

  // 3. Server-side validate TeacherScope + student active enrollment
  await assertTeacherStudentScope(actor, {
    studentId,
    programmeId: requirement.programmeId,
    schoolClassId: requirement.schoolClassId,
    academicSessionId: requirement.academicSessionId,
  });

  // 4. Process and store the new optimized photo
  const newAsset = await uploadAndStoreProfilePhoto({
    buffer: imageBuffer,
    uploadedById: actor.id,
    mediaType: MediaType.PROFILE_PHOTO,
  });

  // 5. Replace student's photo and safely clean up old photo if orphaned
  await replaceProfilePhoto(
    { type: 'STUDENT', id: studentId },
    newAsset.id,
    actor
  );

  return newAsset;
}
