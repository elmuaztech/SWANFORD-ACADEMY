import sharp, { Metadata } from 'sharp';
import crypto from 'crypto';

/**
 * Swanford Academy — Secure Image Processing Service
 * Master Specification Reference: Work Package B Final Addendum (Media & Profile Photos)
 *
 * Rules:
 * 1. Maximum original upload: 5 MB.
 * 2. Magic byte / content validation (reject SVG, HTML, scripts, PE/ELF executables).
 * 3. Decompression-bomb mitigation (strict pixel limits and dimension limits).
 * 4. Profile photo dimensions: 320x320 (cover crop, face/entropy preservation).
 * 5. Format: WebP.
 * 6. Size target: 30–100 KB, hard cap: 150 KB.
 *    DO NOT force 20 KB if that degrades facial clarity!
 * 7. Metadata (EXIF) stripping.
 * 8. Zero retention of original uploads.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const HARD_MAX_PROCESSED_BYTES = 150 * 1024; // 150 KB
export const TARGET_MIN_BYTES = 20 * 1024; // 20 KB
export const TARGET_MAX_BYTES = 100 * 1024; // 100 KB
export const MAX_INPUT_DIMENSION = 4096; // 4096 px width/height
export const MAX_INPUT_PIXELS = 16_777_216; // 16 Megapixels decompression bomb protection
export const DEFAULT_AVATAR_DIMENSION = 320; // 320x320 profile photo

export type SupportedImageFormat = 'jpeg' | 'png' | 'webp';

export interface ProcessedImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'webp';
  size: number;
  mimeType: 'image/webp';
  checksum: string;
}

export class ImageValidationError extends Error {
  constructor(message: string, public code: string = 'IMAGE_VALIDATION_ERROR') {
    super(message);
    this.name = 'ImageValidationError';
  }
}

/**
 * Validates the raw buffer size and magic bytes to confirm it is a genuine JPEG, PNG, or WebP.
 * Strictly rejects SVG, HTML, scripts, executables, or unknown binary streams.
 */
export function validateImageSignature(buffer: Buffer): { format: SupportedImageFormat; mimeType: string } {
  if (!buffer || buffer.length === 0) {
    throw new ImageValidationError('No image data provided.', 'EMPTY_IMAGE');
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError(
      `Image upload exceeds maximum permitted size of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
      'IMAGE_TOO_LARGE'
    );
  }

  // Minimum header size for signature inspection
  if (buffer.length < 12) {
    throw new ImageValidationError('Invalid image data: header is too small.', 'INVALID_HEADER');
  }

  // Check for malicious / disguised text-based formats (SVG, XML, HTML, PHP, Scripts)
  const headerUtf8 = buffer.subarray(0, 256).toString('utf8').toLowerCase();
  if (
    headerUtf8.includes('<svg') ||
    headerUtf8.includes('<?xml') ||
    headerUtf8.includes('<html') ||
    headerUtf8.includes('<!doctype') ||
    headerUtf8.includes('<script') ||
    headerUtf8.includes('<?php')
  ) {
    throw new ImageValidationError('Vector, HTML, script, or executable content is strictly prohibited.', 'DISALLOWED_FORMAT');
  }

  // Check for executable signatures (DOS MZ, ELF)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new ImageValidationError('Executable binaries are strictly prohibited.', 'EXECUTABLE_REJECTED');
  }
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    throw new ImageValidationError('ELF binaries are strictly prohibited.', 'EXECUTABLE_REJECTED');
  }

  // 1. JPEG signature: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { format: 'jpeg', mimeType: 'image/jpeg' };
  }

  // 2. PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { format: 'png', mimeType: 'image/png' };
  }

  // 3. WebP signature: RIFF .... WEBP
  const isRiff = buffer.subarray(0, 4).toString('ascii') === 'RIFF';
  const isWebp = buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (isRiff && isWebp) {
    return { format: 'webp', mimeType: 'image/webp' };
  }

  throw new ImageValidationError(
    'Unsupported image format. Allowed formats: JPEG, PNG, WebP.',
    'UNSUPPORTED_FORMAT'
  );
}

/**
 * Validates and optimizes an image buffer into an efficient, safe WebP profile photo.
 */
export async function processProfilePhoto(
  inputBuffer: Buffer,
  options?: { targetDimension?: number }
): Promise<ProcessedImageResult> {
  // Step 1: Validate file signature and maximum upload limit
  validateImageSignature(inputBuffer);

  const dimension = options?.targetDimension || DEFAULT_AVATAR_DIMENSION;

  // Step 2: Initialize Sharp with decompression bomb guard
  const image = sharp(inputBuffer, {
    failOn: 'truncated',
    limitInputPixels: MAX_INPUT_PIXELS,
  });

  // Step 3: Inspect metadata and validate internal structure
  let metadata: Metadata;
  try {
    metadata = await image.metadata();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Corrupt or malformed image';
    throw new ImageValidationError(`Corrupted image content: ${message}`, 'CORRUPT_IMAGE');
  }

  if (!metadata.width || !metadata.height) {
    throw new ImageValidationError('Image has invalid or missing dimensions.', 'INVALID_DIMENSIONS');
  }

  if (metadata.width > MAX_INPUT_DIMENSION || metadata.height > MAX_INPUT_DIMENSION) {
    throw new ImageValidationError(
      `Image dimensions (${metadata.width}x${metadata.height}) exceed maximum allowed of ${MAX_INPUT_DIMENSION}px.`,
      'DIMENSIONS_TOO_LARGE'
    );
  }

  // Disallow animated profile photos (multi-page GIF, APNG, animated WebP)
  if (metadata.pages && metadata.pages > 1) {
    throw new ImageValidationError(
      'Animated profile images are not permitted.',
      'ANIMATION_NOT_PERMITTED'
    );
  }

  // Step 4: Auto-orient based on EXIF, strip metadata, resize to avatar dimensions
  // Try entropy-based crop for face preservation; fallback to centre if entropy is unavailable
  let processedBuffer: Buffer;
  let currentQuality = 80;

  const buildPipeline = (quality: number, useEntropyCrop: boolean) => {
    const pipeline = sharp(inputBuffer, {
      failOn: 'truncated',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate() // Auto-orient based on EXIF before stripping
      .resize(dimension, dimension, {
        fit: 'cover',
        position: useEntropyCrop ? sharp.strategy.entropy : sharp.gravity.centre,
      })
      .webp({
        quality,
        effort: 4, // Balanced CPU usage on hostinger 1 vCPU
        lossless: false,
      });

    return pipeline;
  };

  try {
    processedBuffer = await buildPipeline(currentQuality, true).toBuffer();
  } catch {
    // Fallback to center gravity crop if entropy crop fails on uniform images
    processedBuffer = await buildPipeline(currentQuality, false).toBuffer();
  }

  // Step 5: Adaptive compression if output exceeds HARD_MAX_PROCESSED_BYTES (150 KB)
  // Note: We do NOT force down to 20 KB if quality degrades, but we strictly enforce <= 150 KB.
  while (processedBuffer.length > HARD_MAX_PROCESSED_BYTES && currentQuality > 40) {
    currentQuality -= 10;
    try {
      processedBuffer = await buildPipeline(currentQuality, true).toBuffer();
    } catch {
      processedBuffer = await buildPipeline(currentQuality, false).toBuffer();
    }
  }

  if (processedBuffer.length > HARD_MAX_PROCESSED_BYTES) {
    throw new ImageValidationError(
      `Unable to compress image below maximum allowed size of ${HARD_MAX_PROCESSED_BYTES / 1024} KB while preserving facial quality.`,
      'PROCESSED_SIZE_EXCEEDED'
    );
  }

  // Step 6: Calculate checksum
  const checksum = crypto.createHash('sha256').update(processedBuffer).digest('hex');

  return {
    buffer: processedBuffer,
    width: dimension,
    height: dimension,
    format: 'webp',
    size: processedBuffer.length,
    mimeType: 'image/webp',
    checksum,
  };
}
