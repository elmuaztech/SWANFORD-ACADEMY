import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GET, POST, PUT } from '@/app/api/admin/me/photo/route';
import { generateSecureToken } from '@/lib/auth/tokens';
import { RoleCode } from '@prisma/client';
import sharp from 'sharp';

describe('Admin Photo Upload & Persistence Pipeline', () => {
  let adminUserId: string;
  let sessionToken: string;
  let cleanupSession: () => Promise<void>;

  beforeEach(async () => {
    // Find or verify existing admin user
    const admin = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: { code: RoleCode.ADMIN },
          },
        },
      },
    });

    if (!admin) {
      throw new Error('Test requires an admin user in the database.');
    }

    adminUserId = admin.id;

    // Create authentic test session in PostgreSQL
    const { rawToken, tokenHash } = generateSecureToken();
    const session = await prisma.session.create({
      data: {
        userId: admin.id,
        sessionTokenHash: tokenHash,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });

    sessionToken = rawToken;
    cleanupSession = async () => {
      await prisma.session.deleteMany({ where: { id: session.id } });
    };
  });

  afterEach(async () => {
    if (cleanupSession) {
      await cleanupSession();
    }
    // Reset test admin's profile photo to null after tests to preserve clean state
    await prisma.user.update({
      where: { id: adminUserId },
      data: { profilePhotoId: null },
    });
  });

  it('rejects unauthenticated GET, POST, and PUT requests with 401 JSON', async () => {
    const reqGet = new NextRequest('http://localhost:3000/api/admin/me/photo', { method: 'GET' });
    const resGet = await GET(reqGet);
    expect(resGet.status).toBe(401);
    const jsonGet = await resGet.json();
    expect(jsonGet.error).toBe('Authentication required.');

    const reqPost = new NextRequest('http://localhost:3000/api/admin/me/photo', { method: 'POST' });
    const resPost = await POST(reqPost);
    expect(resPost.status).toBe(401);
    const jsonPost = await resPost.json();
    expect(jsonPost.error).toBe('Authentication required.');

    const reqPut = new NextRequest('http://localhost:3000/api/admin/me/photo', { method: 'PUT' });
    const resPut = await PUT(reqPut);
    expect(resPut.status).toBe(401);
    const jsonPut = await resPut.json();
    expect(jsonPut.error).toBe('Authentication required.');
  });

  it('successfully uploads valid JPEG via POST, optimizes to WebP, and updates database', async () => {
    // Create valid 100x100 JPEG buffer
    const jpegBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 128, g: 0, b: 32 },
      },
    })
      .jpeg()
      .toBuffer();

    const formData = new FormData();
    const file = new File([jpegBuffer], 'admin_photo.jpg', { type: 'image/jpeg' });
    formData.append('file', file);

    const req = new NextRequest('http://localhost:3000/api/admin/me/photo', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.assetId).toBeDefined();
    expect(data.url).toBe(`/api/media/${data.assetId}`);

    // Verify database record was updated
    const userInDb = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { profilePhotoId: true },
    });
    expect(userInDb?.profilePhotoId).toBe(data.assetId);

    // Verify GET /api/admin/me/photo retrieves this photo for page refresh persistence
    const reqGet = new NextRequest('http://localhost:3000/api/admin/me/photo', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });
    const resGet = await GET(reqGet);
    expect(resGet.status).toBe(200);
    const dataGet = await resGet.json();
    expect(dataGet.success).toBe(true);
    expect(dataGet.assetId).toBe(data.assetId);
    expect(dataGet.url).toBe(`/api/media/${data.assetId}`);
  });

  it('rejects uploads exceeding 5 MB limit with status 413 and valid JSON error', async () => {
    // Create a virtual file payload larger than 5 MB
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    const formData = new FormData();
    const file = new File([largeBuffer], 'oversized.jpg', { type: 'image/jpeg' });
    formData.append('file', file);

    const req = new NextRequest('http://localhost:3000/api/admin/me/photo', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain('exceeds maximum permitted limit of 5 MB');
  });

  it('rejects unsupported file formats with 400 JSON', async () => {
    const invalidBuffer = Buffer.from('Fake image content that is not genuine image bytes');
    const formData = new FormData();
    const file = new File([invalidBuffer], 'fake.jpg', { type: 'image/jpeg' });
    formData.append('file', file);

    const req = new NextRequest('http://localhost:3000/api/admin/me/photo', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
    expect(data.error).toContain('Unsupported image format');
  });
});
