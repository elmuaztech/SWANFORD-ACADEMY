'use client';

import React, { useState, useRef } from 'react';
import { Button } from './button';
import { Alert } from './alert';

export interface ImageUploadProps {
  label?: string;
  helperText?: string;
  currentImageUrl?: string | null;
  onUploadSuccess: (result: { assetId: string; url: string }) => void;
  onRemove?: () => void;
  uploadEndpoint?: string;
  extraFormData?: Record<string, string>;
  disabled?: boolean;
}

async function compressImageClientSide(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.8
): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return resolve(file);
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return resolve(file);
          }
          const baseName = file.name ? file.name.replace(/\.[^.]+$/, '') : 'photo';
          const compressedFile = new File(
            [blob],
            `${baseName || 'photo'}.jpg`,
            {
              type: 'image/jpeg',
              lastModified: Date.now(),
            }
          );
          resolve(compressedFile);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export function ImageUpload({
  label = 'Profile Photo',
  helperText = 'Clear face photo. JPEG, PNG, or WebP. Automatically compressed for high clarity and minimal storage.',
  currentImageUrl,
  onUploadSuccess,
  onRemove,
  uploadEndpoint = '/api/media/upload',
  extraFormData = {},
  disabled = false,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize previewUrl if currentImageUrl changes asynchronously after load
  React.useEffect(() => {
    if (currentImageUrl !== undefined) {
      setPreviewUrl(currentImageUrl);
    }
  }, [currentImageUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Client-side file type validation (images only)
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file from camera or gallery.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);

    try {
      // Client-side compression if file is large (> 1.5MB); otherwise upload original directly to preserve sharp fidelity
      let uploadFile = file;
      if (file.size > 1.5 * 1024 * 1024) {
        try {
          uploadFile = await compressImageClientSide(file, 1200, 1200, 0.85);
        } catch (compErr) {
          console.warn('Client image compression skipped:', compErr);
          uploadFile = file;
        }
      }

      // Local preview while uploading
      const localUrl = URL.createObjectURL(uploadFile);
      setPreviewUrl(localUrl);

      const formData = new FormData();
      formData.append('file', uploadFile);
      Object.entries(extraFormData).forEach(([k, v]) => formData.append(k, v));

      const res = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
      });

      // Defensive JSON parsing: inspect response header and body safely
      let data: Record<string, any> | null = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        let errorMsg = data?.error;
        if (!errorMsg) {
          if (res.status === 405) {
            errorMsg = 'This upload endpoint does not accept POST requests. Please contact the administrator.';
          } else if (res.status === 413) {
            errorMsg = 'File size exceeds maximum permitted limit of 5 MB.';
          } else if (res.status === 401) {
            errorMsg = 'Authentication required. Please log in again to upload photos.';
          } else if (res.status === 403) {
            errorMsg = 'Access denied: You do not have permission to upload this photo.';
          } else if (res.status >= 500) {
            errorMsg = 'The server encountered an issue processing the image. Please try again.';
          } else {
            errorMsg = `Failed to upload photo (Status ${res.status}). Please try again.`;
          }
        }
        throw new Error(errorMsg);
      }

      if (!data || !data.url) {
        throw new Error('Image upload succeeded, but the server returned an invalid response format.');
      }

      // Server optimized asset ready
      setPreviewUrl(data.url);
      onUploadSuccess({ assetId: data.assetId, url: data.url });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred during photo upload.';
      setError(message);
      setPreviewUrl(currentImageUrl || null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onRemove) onRemove();
  };

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-semibold text-[#1C1A1A]">{label}</label>}

      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-[#EADBDA] rounded-xl bg-[#FDFBF7]">
        {/* Preview Container */}
        <div className="relative w-24 h-24 rounded-full overflow-hidden shrink-0 border-2 border-[#5B0612] bg-[#EADBDA] flex items-center justify-center">
          {previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt="Photo Preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <svg
              className="w-10 h-10 text-[#8C827A]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          )}

          {isUploading && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white text-xs font-medium p-1 text-center">
              <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mb-1"></span>
              <span>Optimizing...</span>
            </div>
          )}
        </div>

        {/* Controls and Helper Text */}
        <div className="flex-1 text-center sm:text-left space-y-2">
          <p className="text-xs text-[#524B46]">{helperText}</p>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled || isUploading}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
            >
              {previewUrl ? 'Change Photo' : 'Select Photo'}
            </Button>

            {previewUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={disabled || isUploading}
                className="text-red-700 hover:text-red-800"
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="Upload Failed">
          {error}
        </Alert>
      )}
    </div>
  );
}
