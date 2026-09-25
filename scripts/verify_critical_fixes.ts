import { chromium } from 'playwright';
import { prisma } from '../src/lib/prisma';
import { generateSecureToken } from '../src/lib/auth/tokens';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.resolve(
  process.env.USERPROFILE || 'C:\\Users\\HomePC',
  '.gemini/antigravity-ide/brain/e2aac07a-389c-4b72-a25a-d2bae068002d/screenshots'
);

async function runVerification() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // 1. Establish authenticated session for genuine admin
  const admin = await prisma.user.findFirst({
    where: { email: 'swanford99@gmail.com' },
  });

  if (!admin) {
    throw new Error('Admin user swanford99@gmail.com not found in PostgreSQL.');
  }

  const { rawToken, tokenHash } = generateSecureToken();
  const session = await prisma.session.create({
    data: {
      userId: admin.id,
      sessionTokenHash: tokenHash,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });

  console.log('Established session for admin:', admin.email);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  await context.addCookies([
    {
      name: 'swanford_session',
      value: rawToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  const results: Record<string, any> = {
    imageUpload: {},
    admissionsTable: {},
    emailVerification: {},
  };

  try {
    // =========================================================================
    // 1. TEST IMAGE UPLOAD ON /admin/settings
    // =========================================================================
    console.log('\n--- 1. Testing Image Upload on /admin/settings ---');
    await page.goto('http://localhost:3000/admin/settings', { waitUntil: 'networkidle' });

    // A. Oversized file (> 5 MB)
    console.log('Testing oversized file (>5 MB)...');
    const fileInput = page.locator('input[type="file"]');
    const oversizedPath = path.resolve(process.cwd(), 'scratch/test_oversized.jpg');
    await fileInput.setInputFiles(oversizedPath);
    await page.waitForTimeout(1000);

    const errorAlert = page.locator('[role="alert"], .bg-rose-50, .border-red-200');
    const errorText = await page.locator('text=File is too large').count();
    console.log('Oversized error displayed:', errorText > 0);
    results.imageUpload.oversizedRejected = errorText > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'upload_1_oversized_rejection.png') });

    // B. Unsupported file type
    console.log('Testing unsupported file type (.pdf)...');
    const invalidPath = path.resolve(process.cwd(), 'scratch/test_invalid.pdf');
    await fileInput.setInputFiles(invalidPath);
    await page.waitForTimeout(1000);
    const unsupportedText = await page.locator('text=Unsupported file type').count();
    console.log('Unsupported type error displayed:', unsupportedText > 0);
    results.imageUpload.unsupportedRejected = unsupportedText > 0;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'upload_2_unsupported_rejection.png') });

    // C. Valid JPEG upload
    console.log('Testing valid JPEG upload...');
    const validJpegPath = path.resolve(process.cwd(), 'scratch/test_valid.jpg');
    await fileInput.setInputFiles(validJpegPath);
    await page.waitForSelector('text=Profile photo uploaded and processed successfully.', { timeout: 10000 });
    console.log('Valid JPEG successfully uploaded and processed!');
    results.imageUpload.validJpegUploaded = true;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'upload_3_valid_jpeg_success.png') });

    // D. Refresh page and confirm photo persists!
    console.log('Refreshing page to verify photo persistence...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const imgSelector = 'img[alt="Photo Preview"]';
    const hasImageAfterRefresh = await page.locator(imgSelector).count();
    const imgSrc = hasImageAfterRefresh > 0 ? await page.locator(imgSelector).getAttribute('src') : null;
    console.log('Photo visible after refresh:', hasImageAfterRefresh > 0, 'URL:', imgSrc);
    results.imageUpload.persistedAfterRefresh = hasImageAfterRefresh > 0 && Boolean(imgSrc?.includes('/api/media/'));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'upload_4_persisted_after_refresh.png') });

    // E. Mobile viewport upload check (390px)
    console.log('Testing mobile viewport upload check (390px)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log('Mobile settings has horizontal overflow:', mobileOverflow);
    results.imageUpload.mobileNoOverflow = !mobileOverflow;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'upload_5_mobile_390px.png') });

    // =========================================================================
    // 2. TEST ADMISSIONS TABLE ALIGNMENT & RESPONSIVENESS
    // =========================================================================
    console.log('\n--- 2. Testing Admissions Table on /admin/admissions ---');
    const viewports = [
      { name: '360px', width: 360, height: 640 },
      { name: '390px', width: 390, height: 844 },
      { name: '430px', width: 430, height: 932 },
      { name: '768px', width: 768, height: 1024 },
      { name: '1280px', width: 1280, height: 800 },
      { name: '1440px', width: 1440, height: 900 },
      { name: '1920px', width: 1920, height: 1080 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:3000/admin/admissions', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const snCount = await page.locator('text=S/N').count();
      const viewProfileCount = await page.locator('text=View Profile').count();

      console.log(`Viewport ${vp.name} (${vp.width}x${vp.height}): Overflow=${hasOverflow}, S/N header visible=${snCount > 0}, View Profile buttons=${viewProfileCount}`);
      results.admissionsTable[vp.name] = {
        width: vp.width,
        noHorizontalOverflow: !hasOverflow,
        viewProfileButtonsCount: viewProfileCount,
      };

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admissions_table_${vp.name}.png`),
        fullPage: false,
      });
    }

    // =========================================================================
    // 3. TEST GMAIL SMTP NOTIFICATION VERIFICATION
    // =========================================================================
    console.log('\n--- 3. Testing Real Gmail SMTP on /admin/notifications ---');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('http://localhost:3000/admin/notifications', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const hasSmtpCard = await page.locator('text=Gmail SMTP Delivery Verification').count();
    const hasUnverifiedBadge = await page.locator('text=NOT VERIFIED — REAL INBOX TEST REQUIRED').count();
    console.log('SMTP Verification Card rendered:', hasSmtpCard > 0, 'Unverified badge visible:', hasUnverifiedBadge > 0);
    results.emailVerification.cardRendered = hasSmtpCard > 0;
    results.emailVerification.initialUnverifiedState = hasUnverifiedBadge > 0;

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'notifications_1_initial.png') });

    // Wait 11 seconds to guarantee rate limit window has expired
    console.log('Waiting 11s rate limit clearance before test email dispatch...');
    await page.waitForTimeout(11000);

    // Click Send Test Email
    console.log('Submitting test email to swanford99@gmail.com...');
    const sendButton = page.locator('button:has-text("Send Test Email")');
    await sendButton.click();

    // Wait for response notice (either accepted or failed banner)
    await page.locator('text=ACCEPTED BY GMAIL SMTP').or(page.locator('text=SMTP DELIVERY REJECTED')).waitFor({ timeout: 30000 });
    const acceptedNotice = await page.locator('text=ACCEPTED BY GMAIL SMTP').count();
    const honestVerificationBadge = await page.locator('text=NOT VERIFIED — REAL INBOX TEST REQUIRED').count();
    console.log('Provider accepted message:', acceptedNotice > 0);
    console.log('Honest status badge preserved:', honestVerificationBadge > 0);

    results.emailVerification.acceptedByProvider = acceptedNotice > 0;
    results.emailVerification.honestStatusDisplayed = honestVerificationBadge > 0;

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'notifications_2_after_send.png') });
  } finally {
    await browser.close();
    // Clean up test session
    await prisma.session.deleteMany({ where: { id: session.id } });
    console.log('Cleaned up test session.');
  }

  console.log('\n========================================');
  console.log('BROWSER VERIFICATION SUMMARY:');
  console.log(JSON.stringify(results, null, 2));
  console.log('========================================\n');
  return results;
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Browser verification failed:', err);
    process.exit(1);
  });
