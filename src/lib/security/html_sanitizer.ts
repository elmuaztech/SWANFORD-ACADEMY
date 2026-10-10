/**
 * Swanford Academy — Secure HTML Sanitizer
 * Master Specification Reference: Work Package D (Security Controls)
 *
 * Sanitizes rich HTML document templates and preview strings before rendering
 * via dangerouslySetInnerHTML.
 *
 * Rules:
 * 1. Strictly strips <script>, <object>, <embed>, <iframe>, <form>, <link>, <meta>, <base> tags.
 * 2. Strips all inline event handlers (on* attributes like onclick, onerror, onload).
 * 3. Strips javascript:, data:text/html, and vbscript: URI schemes.
 * 4. Preserves legitimate document styling, tables, borders, letterheads, and typography for printing.
 */

const DANGEROUS_BLOCKS_REGEX = /<\s*(script|object|embed|applet)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const DANGEROUS_TAGS_REGEX = /<\s*\/?\s*(script|iframe|object|embed|form|input|button|link|meta|base|applet)\b[^>]*>/gi;
const DANGEROUS_ATTRIBUTES_REGEX = /\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URLS_REGEX = /\b(href|src)\s*=\s*(?:"\s*(javascript|vbscript|data:text\/html):[^"]*"|'\s*(javascript|vbscript|data:text\/html):[^']*')/gi;

/**
 * Sanitizes an HTML string to eliminate XSS vectors while preserving
 * legitimate layout, tables, fonts, and print structures.
 */
export function sanitizeDocumentHtml(dirtyHtml: string | null | undefined): string {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') {
    return '';
  }

  // 1. Remove dangerous blocks entirely (including enclosed code)
  let clean = dirtyHtml.replace(DANGEROUS_BLOCKS_REGEX, '');

  // 2. Remove remaining single/unclosed dangerous tags
  clean = clean.replace(DANGEROUS_TAGS_REGEX, '');

  // 3. Remove all inline event handlers (onclick, onerror, onload, etc.)
  clean = clean.replace(DANGEROUS_ATTRIBUTES_REGEX, '');

  // 4. Remove javascript: or unsafe URI schemes from attributes
  clean = clean.replace(DANGEROUS_URLS_REGEX, '$1="#"');

  return clean;
}
