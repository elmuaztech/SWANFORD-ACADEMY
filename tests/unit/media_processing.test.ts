import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  validateImageSignature,
  processProfilePhoto,
  ImageValidationError,
  MAX_UPLOAD_BYTES,
  HARD_MAX_PROCESSED_BYTES,
  DEFAULT_AVATAR_DIMENSION,
} from '@/lib/media/image_processor';

describe('Unit Tests: Media & Image Processing Service', () => {
  // Helper to generate test images using sharp
  const createTestImage = async (
    width: number,
    height: number,
    format: 'jpeg' | 'png' | 'webp',
    options?: { withExif?: boolean }
  ): Promise<Buffer> => {
    let pipeline = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 128, g: 0, b: 32 }, // Maroon
      },
    });

    if (format === 'jpeg') {
      if (options?.withExif) {
        pipeline = pipeline.withExif({
          IFD0: {
            Make: 'Swanford Camera',
            Model: 'Testing Device',
          },
        });
      }
      return pipeline.jpeg().toBuffer();
    }
    if (format === 'png') {
      return pipeline.png().toBuffer();
    }
    return pipeline.webp().toBuffer();
  };

  describe('Image Content & Magic Bytes Signature Validation', () => {
    it('successfully validates genuine JPEG image buffer', async () => {
      const buffer = await createTestImage(100, 100, 'jpeg');
      const result = validateImageSignature(buffer);
      expect(result.format).toBe('jpeg');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('successfully validates genuine PNG image buffer', async () => {
      const buffer = await createTestImage(100, 100, 'png');
      const result = validateImageSignature(buffer);
      expect(result.format).toBe('png');
      expect(result.mimeType).toBe('image/png');
    });

    it('successfully validates genuine WebP image buffer', async () => {
      const buffer = await createTestImage(100, 100, 'webp');
      const result = validateImageSignature(buffer);
      expect(result.format).toBe('webp');
      expect(result.mimeType).toBe('image/webp');
    });

    it('rejects oversized original uploads exceeding 5 MB', () => {
      const oversizedBuffer = Buffer.alloc(MAX_UPLOAD_BYTES + 1024);
      expect(() => validateImageSignature(oversizedBuffer)).toThrow(ImageValidationError);
      expect(() => validateImageSignature(oversizedBuffer)).toThrow(/exceeds maximum permitted size/);
    });

    it('rejects disguised non-images: HTML disguised as image', () => {
      const htmlDisguised = Buffer.from('<!DOCTYPE html><html><body><h1>Fake Image</h1></body></html>');
      expect(() => validateImageSignature(htmlDisguised)).toThrow(ImageValidationError);
      expect(() => validateImageSignature(htmlDisguised)).toThrow(/strictly prohibited/);
    });

    it('rejects disguised non-images: SVG vector file disguised as image', () => {
      const svgDisguised = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>');
      expect(() => validateImageSignature(svgDisguised)).toThrow(ImageValidationError);
      expect(() => validateImageSignature(svgDisguised)).toThrow(/Vector, HTML, script, or executable/);
    });

    it('rejects disguised executables: DOS PE (MZ) and Linux ELF binaries', () => {
      const mzExecutable = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
      expect(() => validateImageSignature(mzExecutable)).toThrow(ImageValidationError);
      expect(() => validateImageSignature(mzExecutable)).toThrow(/Executable binaries/);

      const elfExecutable = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(() => validateImageSignature(elfExecutable)).toThrow(ImageValidationError);
      expect(() => validateImageSignature(elfExecutable)).toThrow(/ELF binaries/);
    });

    it('rejects random unsupported binary streams and invalid MIME types', () => {
      const randomBinary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
      expect(() => validateImageSignature(randomBinary)).toThrow(ImageValidationError);
      expect(() => validateImageSignature(randomBinary)).toThrow(/Unsupported image format/);
    });
  });

  describe('Image Processing, Optimization & Security Checks', () => {
    it('successfully processes JPEG into an optimized 320x320 WebP profile photo', async () => {
      const original = await createTestImage(600, 800, 'jpeg');
      const processed = await processProfilePhoto(original);

      expect(processed.format).toBe('webp');
      expect(processed.mimeType).toBe('image/webp');
      expect(processed.width).toBe(DEFAULT_AVATAR_DIMENSION);
      expect(processed.height).toBe(DEFAULT_AVATAR_DIMENSION);
      expect(processed.size).toBeLessThanOrEqual(HARD_MAX_PROCESSED_BYTES);
      expect(processed.checksum).toBeTruthy();

      // Verify the processed buffer is indeed valid WebP
      const meta = await sharp(processed.buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(DEFAULT_AVATAR_DIMENSION);
      expect(meta.height).toBe(DEFAULT_AVATAR_DIMENSION);
    });

    it('successfully processes PNG into an optimized 320x320 WebP profile photo', async () => {
      const original = await createTestImage(500, 500, 'png');
      const processed = await processProfilePhoto(original);

      expect(processed.format).toBe('webp');
      expect(processed.width).toBe(320);
      expect(processed.height).toBe(320);
      expect(processed.size).toBeLessThanOrEqual(HARD_MAX_PROCESSED_BYTES);
    });

    it('strips EXIF metadata during profile photo processing', async () => {
      const originalWithExif = await createTestImage(400, 400, 'jpeg', { withExif: true });
      const processed = await processProfilePhoto(originalWithExif);

      const meta = await sharp(processed.buffer).metadata();
      expect(meta.exif).toBeUndefined();
    });

    it('rejects corrupted image content', async () => {
      // Valid JPEG header bytes followed by corrupted garbage
      const corruptedBuffer = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
        Buffer.from('corrupted garbage bytes that cannot be decoded as an image'),
      ]);

      await expect(processProfilePhoto(corruptedBuffer)).rejects.toThrow(ImageValidationError);
    });

    it('rejects images with extreme dimensions exceeding maximum limit (decompression bomb protection)', async () => {
      // 4097 x 100 image exceeding MAX_INPUT_DIMENSION (4096px)
      const hugeDimImage = await sharp({
        create: {
          width: 4097,
          height: 10,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      await expect(processProfilePhoto(hugeDimImage)).rejects.toThrow(ImageValidationError);
      await expect(processProfilePhoto(hugeDimImage)).rejects.toThrow(/exceed maximum allowed/);
    });

    it('guarantees that final processed profile photo size is strictly under 150 KB', async () => {
      // Create a large noisy 1000x1000 image
      const noisyImage = await sharp({
        create: {
          width: 1000,
          height: 1000,
          channels: 3,
          background: { r: 200, g: 150, b: 100 },
        },
      })
        .jpeg()
        .toBuffer();

      const processed = await processProfilePhoto(noisyImage);
      expect(processed.size).toBeLessThanOrEqual(HARD_MAX_PROCESSED_BYTES);
      expect(processed.size).toBeGreaterThan(0);
    });
  });
});
