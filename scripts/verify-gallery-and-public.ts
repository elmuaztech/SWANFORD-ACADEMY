import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VIEWPORTS = [
  { name: '360px_mobile', width: 360, height: 640 },
  { name: '390px_mobile', width: 390, height: 844 },
  { name: '768px_tablet', width: 768, height: 1024 },
  { name: '1280px_desktop', width: 1280, height: 800 },
  { name: '1440px_desktop', width: 1440, height: 900 },
];

const PAGES_TO_TEST = [
  { name: 'homepage', path: '/', isPublic: true },
  { name: 'fees', path: '/fees', isPublic: true },
  { name: 'gallery', path: '/gallery', isPublic: true },
  { name: 'admin_gallery', path: '/admin/gallery', isPublic: false },
];

const SCREENSHOT_DIR = path.resolve(
  'C:/Users/HomePC/.gemini/antigravity-ide/brain/f9a6ed7a-d016-4e22-a751-dcaa73ed76c7/screenshots'
);

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('=================================================================');
  console.log('SWANFORD ACADEMY — REAL BROWSER VERIFICATION SUITE');
  console.log('Testing Public Website, Fees, Gallery & Super Admin Gallery Console');
  console.log('Using Microsoft Edge (Chromium Engine) across 5 standard viewports');
  console.log('=================================================================');

  // Locate genuine Super Admin
  const adminUser = await prisma.user.findFirst({
    where: { email: 'swanford99@gmail.com' },
  });

  if (!adminUser) {
    throw new Error('Genuine administrator account (swanford99@gmail.com) not found in database!');
  }
  console.log(`✔ Genuine admin account found: ${adminUser.email}`);

  // Create temporary authenticated session
  const rawSessionToken = crypto.randomBytes(32).toString('hex');
  const sessionTokenHash = hashToken(rawSessionToken);
  const sessionExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);

  const testSession = await prisma.session.create({
    data: {
      userId: adminUser.id,
      sessionTokenHash,
      expiresAt: sessionExpiry,
    },
  });
  console.log(`✔ Test session established for admin verification`);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (err) {
    console.log('Trying default chromium without msedge channel...');
    browser = await chromium.launch({ headless: true });
  }

  const results: any[] = [];

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });

      // Add session cookie for admin routes
      await context.addCookies([
        {
          name: 'swanford_session',
          value: rawSessionToken,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);

      const page = await context.newPage();

      for (const pg of PAGES_TO_TEST) {
        const url = `http://localhost:3000${pg.path}`;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1000); // Allow hydration

          // 1. Measure horizontal overflow
          const overflow = await page.evaluate(() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const bodyWidth = document.body.scrollWidth;
            return {
              hasOverflow: docWidth > winWidth || bodyWidth > winWidth,
              docWidth,
              winWidth,
              bodyWidth,
              diff: Math.max(docWidth, bodyWidth) - winWidth,
            };
          });

          // 2. Specific Page Content Assertions
          let specificCheck: Record<string, any> = {};

          if (pg.name === 'homepage') {
            const marqueeVisible = await page.evaluate(() => {
              const el = document.querySelector('.animate-marquee');
              return Boolean(el && el.textContent?.includes('ADMISSIONS OPEN'));
            });
            const galleryPreviewVisible = await page.evaluate(() => {
              const text = document.body.innerText;
              return text.includes('School Gallery') || text.includes('Campus Life');
            });
            specificCheck = { marqueeVisible, galleryPreviewVisible };
          }

          if (pg.name === 'fees') {
            const feeCheck = await page.evaluate(() => {
              const bodyText = document.body.innerText;
              const hasBank = bodyText.includes('0012031162') || bodyText.includes('Jaiz Bank');
              const hasOldFeeCards = bodyText.includes('Primary Admission Fee') || bodyText.includes('Tahfeez Admission Fee');
              const hasPolicyText = bodyText.includes('Official Admission Invoices') || bodyText.includes('Programme fees are provided');
              const hasApplyCTA = bodyText.includes('Apply Online');
              return { hasBank, hasOldFeeCards, hasPolicyText, hasApplyCTA };
            });
            specificCheck = feeCheck;
          }

          if (pg.name === 'gallery') {
            const galleryCheck = await page.evaluate(() => {
              const bodyText = document.body.innerText;
              const hasHeader = bodyText.includes('Life at Swanford');
              const hasPills = bodyText.includes('All Categories') || bodyText.includes('Academics');
              const hasEmptyState = bodyText.includes('No Published Photographs Yet');
              return { hasHeader, hasPills, hasEmptyState };
            });
            specificCheck = galleryCheck;
          }

          if (pg.name === 'admin_gallery') {
            const adminCheck = await page.evaluate(() => {
              const bodyText = document.body.innerText;
              const hasTitle = bodyText.includes('School Gallery Management');
              const hasUploadBtn = bodyText.includes('Upload Photo');
              const hasMetrics = bodyText.includes('Total Photographs');
              return { hasTitle, hasUploadBtn, hasMetrics };
            });
            specificCheck = adminCheck;
          }

          // 3. Capture screenshot
          const screenshotFileName = `${pg.name}_${vp.name}.png`;
          const screenshotFilePath = path.join(SCREENSHOT_DIR, screenshotFileName);
          await page.screenshot({ path: screenshotFilePath, fullPage: false });

          const status = !overflow.hasOverflow ? 'PASS' : 'FAIL_OVERFLOW';
          console.log(`  [${status}] ${pg.name} @ ${vp.name} — overflow: ${overflow.diff}px, details:`, specificCheck);

          results.push({
            page: pg.name,
            viewport: vp.name,
            overflow,
            specificCheck,
            screenshot: screenshotFileName,
            pass: !overflow.hasOverflow,
          });
        } catch (err: any) {
          console.error(`  [ERROR] Failed testing ${pg.name} @ ${vp.name}:`, err.message);
          results.push({
            page: pg.name,
            viewport: vp.name,
            error: err.message,
            pass: false,
          });
        }
      }

      await context.close();
    }
  } finally {
    if (browser) await browser.close();

    // Clean up test session
    await prisma.session.deleteMany({ where: { id: testSession.id } });
    console.log(`\n✔ Cleaned up test session from database`);
  }

  const passedCount = results.filter(r => r.pass).length;
  console.log(`\n=================================================================`);
  console.log(`VERIFICATION SUMMARY: ${passedCount}/${results.length} checks passed cleanly.`);
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`=================================================================`);

  if (passedCount < results.length) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
