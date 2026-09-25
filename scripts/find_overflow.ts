import { chromium } from 'playwright';

async function check() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const viewports = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ];

  const routes = [
    '/', '/about', '/admissions', '/gallery', '/programmes', '/contact', '/fees',
    '/auth/login', '/admin/admissions', '/admin/gallery', '/admin/settings'
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: vp });
    for (const route of routes) {
      await page.goto(`http://localhost:3000${route}`, { waitUntil: 'networkidle' });
      const scrollInfo = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
        const clientWidth = doc.clientWidth;
        const innerWidth = window.innerWidth;
        const hasHorizontalScroll = scrollWidth > clientWidth;

        // Find elements whose scrollWidth or client bounding rect causes document overflow
        let culprits: any[] = [];
        if (hasHorizontalScroll) {
          const all = Array.from(document.querySelectorAll('*'));
          for (const el of all) {
            const rect = el.getBoundingClientRect();
            // Ignore elements inside overflow:hidden containers unless they expand the body
            if (rect.right > innerWidth + 1) {
              const style = window.getComputedStyle(el);
              culprits.push({
                tag: el.tagName,
                id: el.id,
                className: (el.className || '').toString().slice(0, 80),
                rectRight: Math.round(rect.right),
                rectWidth: Math.round(rect.width),
                overflow: style.overflow,
                overflowX: style.overflowX
              });
            }
          }
        }

        return {
          scrollWidth,
          clientWidth,
          innerWidth,
          hasHorizontalScroll,
          culpritsCount: culprits.length,
          culprits: culprits.slice(0, 10),
        };
      });

      if (scrollInfo.hasHorizontalScroll) {
        console.log(`[OVERFLOW DETECTED] Route: ${route}, Viewport: ${vp.width}x${vp.height}`, scrollInfo);
      } else {
        console.log(`[OK] Route: ${route}, Viewport: ${vp.width}x${vp.height} (scrollWidth: ${scrollInfo.scrollWidth}, clientWidth: ${scrollInfo.clientWidth})`);
      }
    }
    await page.close();
  }

  await browser.close();
}

check().catch(console.error);
