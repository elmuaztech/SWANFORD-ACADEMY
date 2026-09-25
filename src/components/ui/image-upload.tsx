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

export function ImageUpload({
  label = 'Profile Photo',
  helperText = 'Clear face photo. JPEG, PNG, or WebP. Max 5 MB (automatically optimized).',
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

    // Client-side size check (5 MB maximum)
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setError('File is too large. Maximum permitted upload size is 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Client-side file type validation (JPEG, PNG, WebP)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    if (!allowedMimeTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
      setError('Unsupported file type. Please upload a genuine JPEG, PNG, or WebP image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Immediate local preview while uploading & optimizing
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
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
              accept="image/jpeg,image/png,image/webp"
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
