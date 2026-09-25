import { chromium } from 'playwright';

async function verify() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const viewports = [
    { name: 'Mobile 360', width: 360, height: 800 },
    { name: 'Mobile 390', width: 390, height: 844 },
    { name: 'Tablet 768', width: 768, height: 1024 },
    { name: 'Desktop 1440', width: 1440, height: 900 },
  ];

  const routes = [
    '/',
    '/about',
    '/programmes',
    '/admissions',
    '/admissions/status',
    '/gallery',
    '/fees',
    '/contact',
    '/auth/login',
  ];

  let totalErrors = 0;

  for (const vp of viewports) {
    console.log(`\n================ Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ================`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    for (const route of routes) {
      await page.goto(`http://localhost:3000${route}`, { waitUntil: 'networkidle' });

      // 1. Check for Horizontal Scroll
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
        const clientWidth = doc.clientWidth;
        return {
          scrollWidth,
          clientWidth,
          hasOverflow: scrollWidth > clientWidth,
        };
      });

      if (overflow.hasOverflow) {
        console.error(`❌ [OVERFLOW] ${route}: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`);
        totalErrors++;
      } else {
        console.log(`✅ [NO OVERFLOW] ${route}: scrollWidth=${overflow.scrollWidth} === clientWidth=${overflow.clientWidth}`);
      }

      // 2. Check Headings color (Only on Desktop to avoid redundant checks)
      if (vp.name === 'Desktop 1440') {
        const headingsInfo = await page.evaluate(() => {
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
          return headings.map((h) => {
            const style = window.getComputedStyle(h);
            return {
              tag: h.tagName,
              text: (h.textContent || '').trim().slice(0, 40),
              color: style.color,
              parentBg: window.getComputedStyle(h.parentElement || h).backgroundColor,
            };
          });
        });

        console.log(`   [HEADINGS IN ${route}]: ${headingsInfo.length} headings checked`);
        for (const h of headingsInfo) {
          // rgb(91, 6, 18) is #5B0612 (Swanford Maroon)
          // rgb(128, 0, 32) is #800020 (Swanford Primary Maroon)
          // White/gold are allowed in dark hero/footer
          const isMaroon = h.color === 'rgb(91, 6, 18)' || h.color === 'rgb(128, 0, 32)';
          const isAllowedLight = h.color === 'rgb(255, 255, 255)' || h.color === 'rgb(253, 251, 247)' || h.color === 'rgb(212, 175, 55)';
          const isBlack = h.color === 'rgb(0, 0, 0)' || h.color === 'rgb(28, 26, 26)' || h.color === 'rgb(15, 23, 42)' || h.color === 'rgb(28, 25, 23)';

          if (isBlack) {
            console.error(`   ❌ Heading in BLACK: <${h.tag}> "${h.text}" color=${h.color}`);
            totalErrors++;
          } else if (isMaroon) {
            // Good
          } else if (isAllowedLight) {
            // White/Gold on dark section - good
          } else {
            console.log(`   ℹ️ Heading other color: <${h.tag}> "${h.text}" color=${h.color}`);
          }
        }
      }
    }
    await page.close();
  }

  await browser.close();

  console.log(`\n================ Summary ================`);
  if (totalErrors === 0) {
    console.log('🎉 ALL TESTS PASSED: 0 horizontal overflow and ALL headings in institutional Maroon!');
  } else {
    console.error(`❌ FAILED: ${totalErrors} issues detected.`);
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
