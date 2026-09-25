import { chromium } from 'playwright';

async function checkButton() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Find the "Get Directions & Contact" button
  const buttonSelector = 'a[href="/contact"] button';
  const button = await page.$(buttonSelector);
  
  if (button) {
    const styles = await page.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        text: el.textContent?.trim(),
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontFamily: computed.fontFamily,
      };
    }, button);

    console.log('Button Styles:', styles);
    await button.screenshot({ path: 'scratch/button-directions-fixed.png' });
    console.log('Screenshot saved to scratch/button-directions-fixed.png');
  } else {
    console.error('Button not found!');
  }

  // Also check all other buttons on the home page
  const allButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim().slice(0, 30),
      color: window.getComputedStyle(b).color,
      bg: window.getComputedStyle(b).backgroundColor,
    }));
  });
  console.log('\nAll home page buttons:', allButtons);

  await browser.close();
}

checkButton().catch(console.error);
