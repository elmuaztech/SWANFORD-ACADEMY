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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Client-side quick size check (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File is too large. Maximum permitted upload size is 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Client-side quick type check
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Unsupported file type. Please upload a JPEG, PNG, or WebP image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Immediate local preview while optimizing
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload and optimize image.');
      }

      // Server optimized asset ready
      setPreviewUrl(data.url);
      onUploadSuccess({ assetId: data.assetId, url: data.url });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred during upload';
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
