/**
 * Swanford Academy — Institutional Design System Tokens
 *
 * Central source of truth for brand colors, typography, spacing,
 * touch targets, borders, and status styles across all interfaces.
 */

export const BRAND_TOKENS = {
  colors: {
    // Primary Brand Identity
    maroonDeep: '#5B0612',
    maroonPrimary: '#800020',
    maroonHover: '#6B001A',
    maroonSoft: '#FAF2F4',

    // Accents
    goldAccent: '#D4AF37',
    goldHover: '#B89628',
    goldSoft: '#FCF8ED',
    goldText: '#996515',

    // Supporting Navy
    navy: '#0F2942',
    navySoft: '#F0F4F8',

    // Surfaces & Backgrounds
    creamCanvas: '#EFE8DC',
    creamCard: '#FFFFFF',
    creamSection: '#EFE8DC',
    creamBorder: '#EADBDA',
    creamBorderLight: '#EFE9DF',

    // Text & Neutrals
    textCharcoal: '#1C1A1A',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    borderSubtle: '#E2E8F0',

    // Status Colors
    success: '#065F46',
    successBg: '#ECFDF5',
    successBorder: '#A7F3D0',
    warning: '#92400E',
    warningBg: '#FFFBEB',
    warningBorder: '#FDE68A',
    danger: '#991B1B',
    dangerBg: '#FEF2F2',
    dangerBorder: '#FECDD3',
    info: '#0369A1',
    infoBg: '#F0F9FF',
    infoBorder: '#BAE6FD',
  },

  typography: {
    fontSans: "'Inter', ui-sans-serif, system-ui, sans-serif",
    fontDisplay: "'Inter', ui-sans-serif, system-ui, sans-serif",
    fontMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },

  layout: {
    maxContentWidth: '1280px', // max-w-7xl
    minTouchTarget: '44px',
    headerHeight: '64px',
    sidebarWidthExpanded: '260px',
    sidebarWidthCollapsed: '72px',
  },

  radius: {
    sm: '0.375rem',  // 6px
    md: '0.5rem',    // 8px
    lg: '0.75rem',   // 12px
    xl: '1rem',      // 16px
    '2xl': '1.25rem', // 20px
    full: '9999px',
  },
} as const;

export type BrandTokens = typeof BRAND_TOKENS;
