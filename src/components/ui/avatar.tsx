'use client';

import React, { useState } from 'react';

export interface AvatarProps {
  src?: string | null;
  name?: string;
  alt?: string;
  fallback?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-lg',
};

/**
 * Extracts uppercase initials from a person's full name.
 * e.g. "Aisha Bello" -> "AB", "Muhammad" -> "M"
 */
function getInitials(name: string): string {
  if (!name) return 'SA';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Swanford Academy — Canonical Avatar Component
 * Displays optimized photo or dignified initials fallback. Never displays broken image icons.
 */
export function Avatar({ src, name, alt, fallback, size = 'md', className = '' }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const displayName = name || alt || fallback || 'User';
  const initials = fallback || getInitials(displayName);

  // If no source or error occurred, render fallback initials
  if (!src || hasError) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-full bg-[#5B0612] text-[#FDFBF7] font-semibold select-none shrink-0 shadow-sm border border-[#EADBDA] ${sizeClass} ${className}`}
        aria-label={name}
        title={name}
      >
        <span>{initials}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative inline-block rounded-full overflow-hidden shrink-0 shadow-sm border border-[#EADBDA] bg-[#F5F0EB] ${sizeClass} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover"
        onError={() => setHasError(true)}
        loading="lazy"
      />
    </div>
  );
}
