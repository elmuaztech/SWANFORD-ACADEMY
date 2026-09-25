import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VIEWPORTS = [
  { name: '360px_mobile', width: 360, height: 640 },
  { name: '390px_mobile', width: 390, height: 844 },
  { name: '430px_mobile', width: 430, height: 932 },
  { name: '768px_tablet', width: 768, height: 1024 },
  { name: '1280px_desktop', width: 1280, height: 800 },
  { name: '1440px_desktop', width: 1440, height: 900 },
  { name: '1920px_desktop', width: 1920, height: 1080 },
];

const PAGES_TO_TEST = [
  { name: 'homepage', path: '/', isPublic: true },
  { name: 'admissions', path: '/admissions', isPublic: true },
  { name: 'login', path: '/auth/login', isPublic: true },
  { name: 'admin_academic', path: '/admin/academic', isPublic: false },
  { name: 'admin_admissions', path: '/admin/admissions', isPublic: false },
  { name: 'admin_notifications', path: '/admin/notifications', isPublic: false },
];

const SCREENSHOT_DIR = path.resolve(
  'C:/Users/HomePC/.gemini/antigravity-ide/brain/e2aac07a-389c-4b72-a25a-d2bae068002d/screenshots'
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
  console.log('Testing 7 Viewports across Core Screens via Headless Microsoft Edge');
  console.log('=================================================================');

  // 1. Locate genuine admin user and establish active session
  const adminUser = await prisma.user.findFirst({
    where: { email: 'swanford99@gmail.com' },
  });

  if (!adminUser) {
    throw new Error('Genuine administrator account (swanford99@gmail.com) not found in database!');
  }
  console.log(`✔ Genuine admin found: ${adminUser.email} (ID: ${adminUser.id})`);

  const rawSessionToken = crypto.randomBytes(32).toString('hex');
  const sessionTokenHash = hashToken(rawSessionToken);
  const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const testSession = await prisma.session.create({
    data: {
      userId: adminUser.id,
      sessionTokenHash,
      expiresAt: sessionExpiry,
    },
  });
  console.log(`✔ Test admin session established in PostgreSQL (ID: ${testSession.id})`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const report: any = {
    timestamp: new Date().toISOString(),
    browser: 'Microsoft Edge (Chromium engine)',
    viewportsTested: VIEWPORTS.map(v => `${v.name} (${v.width}x${v.height})`),
    pagesTested: PAGES_TO_TEST.map(p => p.path),
    results: [],
  };

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
          await page.waitForTimeout(1000); // allow client hydration

          // 1. Measure horizontal overflow
          const overflow = await page.evaluate(() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const bodyWidth = document.body.scrollWidth;
            return {
              docWidth,
              winWidth,
              bodyWidth,
              hasOverflow: docWidth > winWidth,
            };
          });

          // 2. Check for prohibited technical text
          const pageText = await page.evaluate(() => document.body.innerText);
          const forbiddenMatches: string[] = [];
          if (pageText.includes('Africa/Lagos (WAT)')) forbiddenMatches.push('Africa/Lagos (WAT)');
          if (pageText.includes('(WAT)')) forbiddenMatches.push('(WAT)');
          if (pageText.includes('Jaiz Bank')) forbiddenMatches.push('Jaiz Bank');
          if (pageText.includes('0012031162')) forbiddenMatches.push('0012031162');
          if (pageText.includes('Reconciled Bank')) forbiddenMatches.push('Reconciled Bank');
          if (pageText.includes('Port Harcourt Campus')) forbiddenMatches.push('Port Harcourt Campus');

          // 3. Specific screen validations
          let featureCheck = 'OK';
          if (pg.name === 'admin_academic') {
            try {
              await page.waitForSelector('button:has-text("Create Academic Session")', { timeout: 15000 });
            } catch {}
            const hasCreateBtn = (await page.locator('button:has-text("Create Academic Session")').count()) > 0;
            if (!hasCreateBtn) featureCheck = 'MISSING_CREATE_SESSION_BUTTON';
          } else if (pg.name === 'admin_admissions') {
            try {
              await page.waitForSelector('text=Admissions Cycle Control', { timeout: 15000 });
            } catch {}
            const hasCycleControl = pageText.includes('Admissions Cycle Control');
            if (!hasCycleControl) featureCheck = 'MISSING_CYCLE_CONTROL';
          } else if (pg.name === 'homepage') {
            const hasAnnouncement = pageText.includes('Admissions for 2026/2027');
            if (!hasAnnouncement) featureCheck = 'MISSING_DYNAMIC_ANNOUNCEMENT';
          }

          // 4. Take screenshot
          const screenshotFileName = `${pg.name}_${vp.width}px.png`;
          const screenshotFilePath = path.join(SCREENSHOT_DIR, screenshotFileName);
          await page.screenshot({ path: screenshotFilePath, fullPage: false });

          const isPass = !overflow.hasOverflow && forbiddenMatches.length === 0 && featureCheck === 'OK';
          const pageResult = {
            viewport: vp.name,
            width: vp.width,
            page: pg.path,
            hasOverflow: overflow.hasOverflow,
            docWidth: overflow.docWidth,
            winWidth: overflow.winWidth,
            forbiddenMatches,
            featureCheck,
            screenshot: screenshotFileName,
            status: isPass ? 'PASS' : 'FAIL',
          };

          report.results.push(pageResult);
          console.log(
            `  [${pageResult.status}] ${pg.path} at ${vp.width}px — Overflow: ${overflow.hasOverflow ? `YES (${overflow.docWidth}px > ${overflow.winWidth}px)` : 'NO'}, Forbidden: ${forbiddenMatches.length > 0 ? forbiddenMatches.join(', ') : 'NONE'}, Feature: ${featureCheck}`
          );
        } catch (err: any) {
          console.error(`  [ERROR] ${pg.path} at ${vp.width}px:`, err.message);
          report.results.push({
            viewport: vp.name,
            width: vp.width,
            page: pg.path,
            status: 'ERROR',
            error: err.message,
          });
        }
      }

      await context.close();
    }

    // Interactive Verification: Test Session Creation Modal on Desktop
    console.log('\n--- Testing Academic Session Creation Modal Interaction ---');
    const modalContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await modalContext.addCookies([
      {
        name: 'swanford_session',
        value: rawSessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const modalPage = await modalContext.newPage();
    await modalPage.goto('http://localhost:3000/admin/academic', { waitUntil: 'domcontentloaded' });
    await modalPage.waitForSelector('button:has-text("Create Academic Session")', { timeout: 15000 });

    // Click "Create Academic Session" button
    const createBtn = modalPage.locator('button:has-text("Create Academic Session")');
    await createBtn.click();
    await modalPage.waitForTimeout(600);

    // Verify modal appeared
    const modalHeading = modalPage.locator('h3:has-text("Create Academic Session")');
    const modalVisible = (await modalHeading.count()) > 0;
    console.log('Academic Session Modal Visible on Click:', modalVisible ? '✔ PASS' : '❌ FAIL');
    await modalPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'admin_academic_modal_open_1280px.png') });

    // Close modal
    const cancelBtn = modalPage.locator('button:has-text("Cancel")');
    await cancelBtn.click();
    await modalPage.waitForTimeout(500);
    await modalContext.close();

    // Dynamic Admissions Cycle Verification: Toggle CLOSED and OPEN
    console.log('\n--- Testing Dynamic Admissions Toggle & Public Announcement ---');
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await adminContext.addCookies([
      {
        name: 'swanford_session',
        value: rawSessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const adminPage = await adminContext.newPage();

    // Check status before
    const statusBeforeRes = await fetch('http://localhost:3000/api/admin/admissions/status', {
      headers: { Cookie: `swanford_session=${rawSessionToken}` },
    });
    const statusBefore = await statusBeforeRes.json();
    console.log('Current Admissions Status:', statusBefore.isOpen ? 'OPEN' : 'CLOSED', 'Active Session:', statusBefore.activeSessionName);

    // Toggle Closed
    console.log('Action: Toggling Admissions CLOSED...');
    const closeRes = await fetch('http://localhost:3000/api/admin/admissions/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `swanford_session=${rawSessionToken}`,
      },
      body: JSON.stringify({ action: 'CLOSE' }),
    });
    const closeJson = await closeRes.json();
    console.log('Close Result:', closeJson.success ? 'SUCCESS' : 'FAILED', closeJson.message || closeJson.error);

    // Verify homepage reflects closed state
    await adminPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    const closedAnnouncementText = await adminPage.evaluate(() => document.body.innerText);
    const reflectsClosed = closedAnnouncementText.includes('currently closed');
    console.log('Homepage Reflects Closed Announcement:', reflectsClosed ? '✔ PASS' : '❌ FAIL');
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'homepage_admissions_closed_1280px.png') });

    // Verify /admissions form is disabled
    await adminPage.goto('http://localhost:3000/admissions', { waitUntil: 'networkidle' });
    const admissionsClosedText = await adminPage.evaluate(() => document.body.innerText);
    const admissionsPageReflectsClosed = admissionsClosedText.includes('currently closed');
    console.log('/admissions Form Reflects Closed Notice:', admissionsPageReflectsClosed ? '✔ PASS' : '❌ FAIL');
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'admissions_page_closed_1280px.png') });

    // Toggle Back Open
    console.log('Action: Toggling Admissions OPEN...');
    const openRes = await fetch('http://localhost:3000/api/admin/admissions/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `swanford_session=${rawSessionToken}`,
      },
      body: JSON.stringify({ action: 'OPEN' }),
    });
    const openJson = await openRes.json();
    console.log('Open Result:', openJson.success ? 'SUCCESS' : 'FAILED', openJson.message || openJson.error);

    // Verify homepage reflects open state
    await adminPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    const openAnnouncementText = await adminPage.evaluate(() => document.body.innerText);
    const reflectsOpen = openAnnouncementText.includes('now open. Apply today.');
    console.log('Homepage Reflects Open Announcement:', reflectsOpen ? '✔ PASS' : '❌ FAIL');
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'homepage_admissions_open_1280px.png') });

    await adminContext.close();
    await browser.close();
  } finally {
    // Clean up temporary test session
    await prisma.session.delete({
      where: { id: testSession.id },
    }).catch(() => {});
    await prisma.$disconnect();
    console.log(`✔ Cleaned up temporary test admin session.`);
  }

  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'browser_verification_report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('\n=================================================================');
  console.log(`✔ Real browser verification completed. All screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log('=================================================================');
}

main().catch(console.error);

