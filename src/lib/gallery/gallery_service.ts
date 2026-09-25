import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { RoleCode } from '@prisma/client';
import { AuthorizationError } from '@/lib/auth/authorization';
import { uploadAndStoreGalleryPhoto } from '@/lib/media/media_service';
import { deleteMediaFile } from '@/lib/media/storage';

import { GALLERY_CATEGORIES, GalleryCategory } from './types';
export { GALLERY_CATEGORIES, type GalleryCategory };

export const CreateGalleryItemSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(150, 'Title cannot exceed 150 characters'),
  caption: z.string().trim().max(500, 'Caption cannot exceed 500 characters').optional().nullable(),
  altText: z.string().trim().min(2, 'Alt text is required for accessibility').max(200, 'Alt text cannot exceed 200 characters'),
  category: z.string().trim().default('CAMPUS'),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isPublished: z.boolean().default(false),
});

export const UpdateGalleryItemSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  caption: z.string().trim().max(500).optional().nullable(),
  altText: z.string().trim().min(2).max(200).optional(),
  category: z.string().trim().optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  isPublished: z.boolean().optional(),
});

function assertSuperAdmin(actor: SafeUser | null) {
  if (!actor) {
    throw new AuthorizationError('Authentication required to manage gallery photos.', 401, 'UNAUTHENTICATED');
  }
  const isSuperAdmin = actor.roles?.includes(RoleCode.SUPER_ADMIN);
  if (!isSuperAdmin) {
    throw new AuthorizationError('Only authorized Super Administrators may manage the school gallery.', 403, 'FORBIDDEN');
  }
}

/**
 * Public: Retrieves published gallery items for the school website.
 */
export async function getPublicGalleryItems(filter?: { category?: string }) {
  const where: any = {
    isPublished: true,
  };

  if (filter?.category && filter.category !== 'ALL') {
    where.category = filter.category;
  }

  const items = await prisma.galleryItem.findMany({
    where,
    orderBy: [
      { displayOrder: 'asc' },
      { publishedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      mediaAsset: {
        select: {
          id: true,
          width: true,
          height: true,
          fileSize: true,
          mimeType: true,
        },
      },
    },
  });

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    caption: item.caption,
    altText: item.altText,
    category: item.category,
    displayOrder: item.displayOrder,
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
    imageUrl: `/api/media/${item.mediaAssetId}`,
    width: item.mediaAsset?.width || 1200,
    height: item.mediaAsset?.height || 800,
  }));
}

/**
 * Super Admin: Retrieves all gallery items (published and drafts).
 */
export async function getAdminGalleryItems(
  actor: SafeUser | null,
  filter?: { category?: string; status?: 'ALL' | 'PUBLISHED' | 'DRAFT' }
) {
  assertSuperAdmin(actor);

  const where: any = {};

  if (filter?.category && filter.category !== 'ALL') {
    where.category = filter.category;
  }

  if (filter?.status === 'PUBLISHED') {
    where.isPublished = true;
  } else if (filter?.status === 'DRAFT') {
    where.isPublished = false;
  }

  const items = await prisma.galleryItem.findMany({
    where,
    orderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'desc' },
    ],
    include: {
      mediaAsset: {
        select: {
          id: true,
          width: true,
          height: true,
          fileSize: true,
          mimeType: true,
          createdAt: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    caption: item.caption,
    altText: item.altText,
    category: item.category,
    displayOrder: item.displayOrder,
    isPublished: item.isPublished,
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    imageUrl: `/api/media/${item.mediaAssetId}`,
    mediaAsset: item.mediaAsset,
    createdBy: item.createdBy,
  }));
}

/**
 * Super Admin: Creates a new gallery item with an uploaded image.
 */
export async function createGalleryItem(options: {
  fileBuffer: Buffer;
  data: z.infer<typeof CreateGalleryItemSchema>;
  actor: SafeUser;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  assertSuperAdmin(options.actor);

  const validated = CreateGalleryItemSchema.parse(options.data);

  // 1. Process and save gallery image
  const mediaAsset = await uploadAndStoreGalleryPhoto({
    buffer: options.fileBuffer,
    uploadedById: options.actor.id,
  });

  // 2. Create GalleryItem record
  const galleryItem = await prisma.galleryItem.create({
    data: {
      mediaAssetId: mediaAsset.id,
      title: validated.title,
      caption: validated.caption || null,
      altText: validated.altText,
      category: validated.category.toUpperCase(),
      displayOrder: validated.displayOrder,
      isPublished: validated.isPublished,
      publishedAt: validated.isPublished ? new Date() : null,
      createdById: options.actor.id,
    },
  });

  // 3. Create AuditLog
  await prisma.auditLog.create({
    data: {
      userId: options.actor.id,
      action: 'GALLERY_ITEM_CREATED',
      entityType: 'GalleryItem',
      entityId: galleryItem.id,
      newValues: {
        title: galleryItem.title,
        category: galleryItem.category,
        isPublished: galleryItem.isPublished,
        mediaAssetId: mediaAsset.id,
      },
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    },
  });

  return galleryItem;
}

/**
 * Super Admin: Updates an existing gallery item, optionally replacing the photo.
 */
export async function updateGalleryItem(options: {
  id: string;
  data: z.infer<typeof UpdateGalleryItemSchema>;
  newFileBuffer?: Buffer | null;
  actor: SafeUser;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  assertSuperAdmin(options.actor);

  const existing = await prisma.galleryItem.findUnique({
    where: { id: options.id },
    include: { mediaAsset: true },
  });

  if (!existing) {
    throw new AuthorizationError('Gallery item not found.', 404, 'NOT_FOUND');
  }

  const validated = UpdateGalleryItemSchema.parse(options.data);
  const oldValues = {
    title: existing.title,
    caption: existing.caption,
    altText: existing.altText,
    category: existing.category,
    displayOrder: existing.displayOrder,
    isPublished: existing.isPublished,
    mediaAssetId: existing.mediaAssetId,
  };

  let newMediaAssetId = existing.mediaAssetId;
  let oldAssetToDeleteKey: string | null = null;
  let oldAssetToDeleteId: string | null = null;

  if (options.newFileBuffer) {
    const newMediaAsset = await uploadAndStoreGalleryPhoto({
      buffer: options.newFileBuffer,
      uploadedById: options.actor.id,
    });
    newMediaAssetId = newMediaAsset.id;
    oldAssetToDeleteKey = existing.mediaAsset.storageKey;
    oldAssetToDeleteId = existing.mediaAssetId;
  }

  const isNowPublished = validated.isPublished !== undefined ? validated.isPublished : existing.isPublished;
  let publishedAt = existing.publishedAt;
  if (validated.isPublished === true && !existing.isPublished) {
    publishedAt = new Date();
  } else if (validated.isPublished === false) {
    publishedAt = null;
  }

  const updated = await prisma.galleryItem.update({
    where: { id: options.id },
    data: {
      title: validated.title !== undefined ? validated.title : existing.title,
      caption: validated.caption !== undefined ? validated.caption : existing.caption,
      altText: validated.altText !== undefined ? validated.altText : existing.altText,
      category: validated.category !== undefined ? validated.category.toUpperCase() : existing.category,
      displayOrder: validated.displayOrder !== undefined ? validated.displayOrder : existing.displayOrder,
      isPublished: isNowPublished,
      publishedAt,
      mediaAssetId: newMediaAssetId,
    },
  });

  // Clean up old media asset if replaced
  if (oldAssetToDeleteId && oldAssetToDeleteKey) {
    try {
      await prisma.mediaAsset.delete({ where: { id: oldAssetToDeleteId } });
      await deleteMediaFile(oldAssetToDeleteKey);
    } catch {
      // Non-blocking cleanup
    }
  }

  // Record audit log
  await prisma.auditLog.create({
    data: {
      userId: options.actor.id,
      action: 'GALLERY_ITEM_UPDATED',
      entityType: 'GalleryItem',
      entityId: updated.id,
      oldValues,
      newValues: {
        title: updated.title,
        caption: updated.caption,
        altText: updated.altText,
        category: updated.category,
        displayOrder: updated.displayOrder,
        isPublished: updated.isPublished,
        mediaAssetId: newMediaAssetId,
      },
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    },
  });

  return updated;
}

/**
 * Super Admin: Deletes a gallery item and its media asset.
 */
export async function deleteGalleryItem(options: {
  id: string;
  actor: SafeUser;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  assertSuperAdmin(options.actor);

  const existing = await prisma.galleryItem.findUnique({
    where: { id: options.id },
    include: { mediaAsset: true },
  });

  if (!existing) {
    throw new AuthorizationError('Gallery item not found.', 404, 'NOT_FOUND');
  }

  // 1. Delete GalleryItem
  await prisma.galleryItem.delete({
    where: { id: options.id },
  });

  // 2. Delete MediaAsset and physical storage file
  try {
    await prisma.mediaAsset.delete({
      where: { id: existing.mediaAssetId },
    });
    await deleteMediaFile(existing.mediaAsset.storageKey);
  } catch {
    // Non-blocking
  }

  // 3. Record AuditLog
  await prisma.auditLog.create({
    data: {
      userId: options.actor.id,
      action: 'GALLERY_ITEM_DELETED',
      entityType: 'GalleryItem',
      entityId: options.id,
      oldValues: {
        title: existing.title,
        category: existing.category,
        mediaAssetId: existing.mediaAssetId,
      },
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    },
  });

  return { success: true };
}
