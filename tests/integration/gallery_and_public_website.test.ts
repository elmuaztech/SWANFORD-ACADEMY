import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { RoleCode, UserStatus } from '@prisma/client';
import { generateSecureToken } from '@/lib/auth/tokens';
import { hashPassword } from '@/lib/auth/password';
import { GET as getPublicGallery } from '@/app/api/public/gallery/route';
import { GET as getAdminGallery, POST as postAdminGallery } from '@/app/api/admin/gallery/route';
import { PATCH as patchAdminGallery, DELETE as deleteAdminGallery } from '@/app/api/admin/gallery/[id]/route';
import { GET as getMediaAsset } from '@/app/api/media/[id]/route';
import { getSafeFilePath, deleteMediaFile } from '@/lib/media/storage';

describe('Integration Tests: School Gallery & Public Website Refinement', () => {
  let superAdminUserId: string;
  let superAdminSessionToken: string;
  let teacherUserId: string;
  let teacherSessionToken: string;
  let createdGalleryItemId: string | null = null;
  let createdMediaAssetId: string | null = null;

  beforeAll(async () => {
    // Retrieve roles
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });

    const passwordHash = await hashPassword('TestAuthSecret2026!');

    // 1. Create temporary test Super Admin user
    const superAdmin = await prisma.user.create({
      data: {
        email: `test.superadmin.${Date.now()}@swanford.test`,
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: { roleId: superAdminRole.id },
        },
      },
    });
    superAdminUserId = superAdmin.id;

    // Create session for Super Admin
    const superAdminToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: superAdmin.id,
        sessionTokenHash: superAdminToken.tokenHash,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });
    superAdminSessionToken = superAdminToken.rawToken;

    // 2. Create temporary non-superadmin user (Teacher)
    const teacher = await prisma.user.create({
      data: {
        email: `test.teacher.${Date.now()}@swanford.test`,
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: { roleId: teacherRole.id },
        },
      },
    });
    teacherUserId = teacher.id;

    const teacherToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: teacher.id,
        sessionTokenHash: teacherToken.tokenHash,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });
    teacherSessionToken = teacherToken.rawToken;
  });

  afterAll(async () => {
    // Mandatory Rule: Clean up any test gallery item and restore DB to pristine state
    if (createdGalleryItemId) {
      await prisma.galleryItem.deleteMany({ where: { id: createdGalleryItemId } }).catch(() => {});
    }
    if (createdMediaAssetId) {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: createdMediaAssetId } });
      if (asset?.storageKey) {
        await deleteMediaFile(asset.storageKey);
      }
      await prisma.mediaAsset.deleteMany({ where: { id: createdMediaAssetId } }).catch(() => {});
    }

    // Clean up test sessions and users
    if (superAdminUserId) {
      await prisma.session.deleteMany({ where: { userId: superAdminUserId } });
      await prisma.userRole.deleteMany({ where: { userId: superAdminUserId } });
      await prisma.user.deleteMany({ where: { id: superAdminUserId } });
    }
    if (teacherUserId) {
      await prisma.session.deleteMany({ where: { userId: teacherUserId } });
      await prisma.userRole.deleteMany({ where: { userId: teacherUserId } });
      await prisma.user.deleteMany({ where: { id: teacherUserId } });
    }

    // Verify database has 0 gallery items
    const count = await prisma.galleryItem.count();
    expect(count).toBe(0);
  });

  describe('1. Server-Side Super Admin Authorization Enforcement', () => {
    it('rejects anonymous GET requests to /api/admin/gallery with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/gallery', { method: 'GET' });
      const res = await getAdminGallery(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Authentication required');
    });

    it('rejects non-Super Admin (Teacher) GET requests to /api/admin/gallery with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/gallery', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${teacherSessionToken}`,
        },
      });
      const res = await getAdminGallery(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Super Admin');
    });

    it('rejects non-Super Admin POST requests to /api/admin/gallery with 403 Forbidden', async () => {
      const formData = new FormData();
      formData.append('title', 'Unauthorized Upload');
      formData.append('category', 'CAMPUS');
      formData.append('altText', 'Unauthorized upload');

      const req = new NextRequest('http://localhost:3000/api/admin/gallery', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${teacherSessionToken}`,
        },
        body: formData,
      });
      const res = await postAdminGallery(req);
      expect(res.status).toBe(403);
    });

    it('allows Super Admin to view /api/admin/gallery', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/gallery', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${superAdminSessionToken}`,
        },
      });
      const res = await getAdminGallery(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.items)).toBe(true);
    });
  });

  describe('2. Super Admin Gallery Photo Upload & Sharp WebP Optimization', () => {
    it('uploads a genuine authorized school photograph, optimizes to WebP, and publishes', async () => {
      // Use genuine authorized school gate photo from public/images
      const photoPath = path.join(process.cwd(), 'public', 'images', 'school-gate.jpg');
      expect(fs.existsSync(photoPath)).toBe(true);

      const photoBuffer = await fs.promises.readFile(photoPath);
      const file = new File([photoBuffer], 'school-gate.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', 'Swanford Academy Main Entrance');
      formData.append('category', 'CAMPUS');
      formData.append('altText', 'The ceremonial entrance gate of Swanford Academy campus');
      formData.append('caption', 'Secure and welcoming gateway to Swanford Academy.');
      formData.append('displayOrder', '1');
      formData.append('isPublished', 'true');

      const req = new NextRequest('http://localhost:3000/api/admin/gallery', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${superAdminSessionToken}`,
        },
        body: formData,
      });

      const res = await postAdminGallery(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.item).toBeDefined();
      expect(json.item.title).toBe('Swanford Academy Main Entrance');
      expect(json.item.category).toBe('CAMPUS');
      expect(json.item.isPublished).toBe(true);

      createdGalleryItemId = json.item.id;
      createdMediaAssetId = json.item.mediaAssetId;

      // Verify DB media asset is WebP and width/height were computed by Sharp
      const media = await prisma.mediaAsset.findUnique({
        where: { id: createdMediaAssetId! },
      });
      expect(media).toBeDefined();
      expect(media?.mimeType).toBe('image/webp');
      expect(media?.width).toBeGreaterThan(0);
      expect(media?.height).toBeGreaterThan(0);
      expect(media?.storageKey).toBeTruthy();
      const diskPath = getSafeFilePath(media!.storageKey);
      expect(fs.existsSync(diskPath)).toBe(true);
    });
  });

  describe('3. Public Gallery Access & Category Filtering', () => {
    it('retrieves the published photo without authentication on public endpoint', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/gallery');
      const res = await getPublicGallery(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThanOrEqual(1);

      const found = json.items.find((i: { id: string }) => i.id === createdGalleryItemId);
      expect(found).toBeDefined();
      expect(found.title).toBe('Swanford Academy Main Entrance');
    });

    it('filters public items by category correctly', async () => {
      // Query CAMPUS
      const reqCampus = new NextRequest('http://localhost:3000/api/public/gallery?category=CAMPUS');
      const resCampus = await getPublicGallery(reqCampus);
      expect(resCampus.status).toBe(200);
      const jsonCampus = await resCampus.json();
      const campusFound = jsonCampus.items.find((i: { id: string }) => i.id === createdGalleryItemId);
      expect(campusFound).toBeDefined();

      // Query TAHFEEZ (should not contain this campus photo)
      const reqTahfeez = new NextRequest('http://localhost:3000/api/public/gallery?category=TAHFEEZ');
      const resTahfeez = await getPublicGallery(reqTahfeez);
      expect(resTahfeez.status).toBe(200);
      const jsonTahfeez = await resTahfeez.json();
      const tahfeezFound = jsonTahfeez.items.find((i: { id: string }) => i.id === createdGalleryItemId);
      expect(tahfeezFound).toBeUndefined();
    });

    it('allows anonymous visitors to stream published gallery photos from /api/media/[id]', async () => {
      const req = new NextRequest(`http://localhost:3000/api/media/${createdMediaAssetId}`);
      const res = await getMediaAsset(req, { params: Promise.resolve({ id: createdMediaAssetId! }) });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
    });
  });

  describe('4. Unpublished / Draft Access Control & IDOR Prevention', () => {
    it('unpublishes the photo via Super Admin PATCH', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/gallery/${createdGalleryItemId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${superAdminSessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          isPublished: false,
        }),
      });

      const res = await patchAdminGallery(req, { params: Promise.resolve({ id: createdGalleryItemId! }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.item.isPublished).toBe(false);
    });

    it('ensures unpublished photo is omitted from public gallery endpoint', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/gallery');
      const res = await getPublicGallery(req);
      const json = await res.json();
      const found = json.items.find((i: { id: string }) => i.id === createdGalleryItemId);
      expect(found).toBeUndefined();
    });

    it('rejects anonymous access to unpublished media asset with 401', async () => {
      const req = new NextRequest(`http://localhost:3000/api/media/${createdMediaAssetId}`);
      const res = await getMediaAsset(req, { params: Promise.resolve({ id: createdMediaAssetId! }) });
      expect(res.status).toBe(401);
    });

    it('rejects non-Super Admin (Teacher) access to unpublished media asset with 403', async () => {
      const req = new NextRequest(`http://localhost:3000/api/media/${createdMediaAssetId}`, {
        headers: {
          authorization: `Bearer ${teacherSessionToken}`,
        },
      });
      const res = await getMediaAsset(req, { params: Promise.resolve({ id: createdMediaAssetId! }) });
      expect(res.status).toBe(403);
    });

    it('allows Super Admin to view unpublished media asset', async () => {
      const req = new NextRequest(`http://localhost:3000/api/media/${createdMediaAssetId}`, {
        headers: {
          authorization: `Bearer ${superAdminSessionToken}`,
        },
      });
      const res = await getMediaAsset(req, { params: Promise.resolve({ id: createdMediaAssetId! }) });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
    });
  });

  describe('5. Super Admin Deletion & Storage Purge', () => {
    it('deletes the photo and cleans up file from disk and database', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/gallery/${createdGalleryItemId}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${superAdminSessionToken}`,
        },
      });

      const res = await deleteAdminGallery(req, { params: Promise.resolve({ id: createdGalleryItemId! }) });
      expect(res.status).toBe(200);

      // Verify GalleryItem is removed from DB
      const itemInDb = await prisma.galleryItem.findUnique({
        where: { id: createdGalleryItemId! },
      });
      expect(itemInDb).toBeNull();

      // Verify MediaAsset is removed from DB
      const mediaInDb = await prisma.mediaAsset.findUnique({
        where: { id: createdMediaAssetId! },
      });
      expect(mediaInDb).toBeNull();

      createdGalleryItemId = null;
      createdMediaAssetId = null;
    });
  });

  describe('6. Public Fees Page Visual Cleanliness Verification', () => {
    it('confirms fees page code has no public fee cards, total term sums, or public bank details', () => {
      const feesPageContent = fs.readFileSync(
        path.join(process.cwd(), 'src', 'app', 'fees', 'page.tsx'),
        'utf-8'
      );

      // Must not display hardcoded bank account numbers
      expect(feesPageContent).not.toContain('0012031162');
      expect(feesPageContent).not.toContain('Jaiz Bank');

      // Must not contain fee breakdown cards
      expect(feesPageContent).not.toContain('Primary Admission Fee');
      expect(feesPageContent).not.toContain('Tahfeez Admission Fee');
      expect(feesPageContent).not.toContain('Tuition & Academic Resources');

      // Must contain institutional fee invoice guidance and apply CTA
      expect(feesPageContent).toContain('Programme fees are provided in your official admission invoice');
      expect(feesPageContent).toContain('Apply Online');
    });
  });
});
