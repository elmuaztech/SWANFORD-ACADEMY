import fs from 'fs/promises';
import path from 'path';
import { AuthorizationError } from '@/lib/auth/authorization';

/**
 * Swanford Academy — Media Storage Driver
 * Master Specification Reference: Work Package B Final Addendum (Media & Profile Photos)
 *
 * Enforces safe file storage outside database binaries with strict path traversal protection.
 */

const BASE_STORAGE_DIR = process.env.MEDIA_STORAGE_DIR
  ? path.resolve(process.env.MEDIA_STORAGE_DIR)
  : process.env.VERCEL
  ? path.resolve('/tmp', 'swanford-media')
  : path.resolve(process.cwd(), 'storage', 'media');

/**
 * Resolves a storage key to an absolute filesystem path, verifying that it remains
 * strictly within the designated storage directory.
 */
export function getSafeFilePath(storageKey: string): string {
  // Normalize and prevent path traversal
  const normalizedKey = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
  const absolutePath = path.resolve(BASE_STORAGE_DIR, normalizedKey);

  const relative = path.relative(BASE_STORAGE_DIR, absolutePath);
  const isTraversal = relative.startsWith('..') || path.isAbsolute(relative);

  // Case-insensitive check for Windows drive letters
  const normalizedAbsolute = path.resolve(absolutePath).toLowerCase();
  const normalizedBase = path.resolve(BASE_STORAGE_DIR).toLowerCase();

  if (isTraversal || !normalizedAbsolute.startsWith(normalizedBase)) {
    throw new Error('Access denied: Invalid storage key or attempted path traversal.');
  }

  return absolutePath;
}

/**
 * Persists an optimized media buffer to disk.
 */
export async function saveMediaFile(storageKey: string, buffer: Buffer): Promise<string> {
  const filePath = getSafeFilePath(storageKey);
  const dirPath = path.dirname(filePath);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return filePath;
}

/**
 * Reads a media file buffer from disk.
 */
export async function readMediaFile(storageKey: string): Promise<Buffer> {
  const filePath = getSafeFilePath(storageKey);
  try {
    return await fs.readFile(filePath);
  } catch (err: unknown) {
    const isEnoent = (err as { code?: string })?.code === 'ENOENT';
    if (isEnoent) {
      throw new AuthorizationError('Media asset file not found on disk storage.', 404, 'MEDIA_NOT_FOUND');
    }
    throw err;
  }
}

/**
 * Checks if a media file exists on disk.
 */
export async function mediaFileExists(storageKey: string): Promise<boolean> {
  try {
    const filePath = getSafeFilePath(storageKey);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a media file from disk safely.
 */
export async function deleteMediaFile(storageKey: string): Promise<boolean> {
  try {
    const filePath = getSafeFilePath(storageKey);
    await fs.unlink(filePath);
    return true;
  } catch {
    // If file already deleted or doesn't exist, ignore error
    return false;
  }
}
