import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = path.join(os.tmpdir(), 'swanford_browser_artifacts');

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

class ChromeSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && this.pending.has(data.id)) {
          const { resolve, reject } = this.pending.get(data.id);
          this.pending.delete(data.id);
          if (data.error) reject(new Error(JSON.stringify(data.error)));
          else resolve(data.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: isMobile,
    });
    await this.send('Emulation.setVisibleSize', { width, height });
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res?.data) {
      const buffer = Buffer.from(res.data, 'base64');
      const filepath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(filepath, buffer);
      return filepath;
    }
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function startChrome() {
  const userDataDir = path.join(ARTIFACT_DIR, 'chrome_temp_profile');
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (!wsUrl) {
    chromeProcess.kill();
    throw new Error('Failed to connect to headless Chrome on port ' + PORT);
  }

  return { chromeProcess, wsUrl };
}

async function runVisualSuite() {
  console.log('====================================================');
  console.log('SWANFORD ACADEMY — REAL BROWSER VISUAL VERIFICATION');
  console.log('Browser Engine: Google Chrome (Headless CDP)');
  console.log('====================================================\n');

  const { chromeProcess, wsUrl } = await startChrome();
  console.log('✅ Connected to Chrome CDP:', wsUrl);

  const newTargetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${BASE_URL}`, {
    method: 'PUT',
  });
  const targetData = await newTargetRes.json();
  const session = new ChromeSession(targetData.webSocketDebuggerUrl);
  await session.connect();
  await session.send('Page.enable');
  await session.send('DOM.enable');
  await session.send('Runtime.enable');

  const viewports = [
    { name: '360px Mobile (Small)', width: 360, height: 740, mobile: true },
    { name: '390px Mobile (iPhone 14)', width: 390, height: 844, mobile: true },
    { name: '430px Mobile (iPhone 14 Pro Max)', width: 430, height: 932, mobile: true },
    { name: '1280px Desktop', width: 1280, height: 800, mobile: false },
    { name: '1440px Desktop (Standard)', width: 1440, height: 900, mobile: false },
    { name: '1920px Desktop (Full HD)', width: 1920, height: 1080, mobile: false },
  ];

  const routes = [
    { path: '/', name: 'Homepage' },
    { path: '/about', name: 'About' },
    { path: '/programmes', name: 'Programmes' },
    { path: '/fees', name: 'Fees' },
    { path: '/contact', name: 'Contact' },
    { path: '/admissions', name: 'Admissions Wizard' },
    { path: '/admissions/status', name: 'Status Tracker' },
  ];

  const results = [];

  for (const vp of viewports) {
    console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
    await session.setViewport(vp.width, vp.height, vp.mobile);

    for (const r of routes) {
      await session.navigate(`${BASE_URL}${r.path}`);

      const layoutMetrics = await session.eval(`
        (() => {
          const doc = document.documentElement;
          const scrollW = doc.scrollWidth;
          const clientW = doc.clientWidth;
          const hasHorizontalOverflow = scrollW > clientW + 1;

          const buttons = Array.from(document.querySelectorAll('button, a, input, select'));
          const smallTargets = buttons.filter(b => {
            const rect = b.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return rect.height < 32 && rect.width < 32;
            }
            return false;
          }).length;

          const h1 = document.querySelectorAll('h1').length;
          const textLength = document.body.innerText.length;

          return {
            scrollW,
            clientW,
            hasHorizontalOverflow,
            smallTargets,
            h1Count: h1,
            textLength,
            title: document.title
          };
        })()
      `);

      const screenshotFile = `vp_${vp.width}_${r.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      await session.screenshot(screenshotFile);

      const pass = !layoutMetrics.hasHorizontalOverflow;
      results.push({
        viewport: vp.name,
        route: r.name,
        path: r.path,
        pass,
        scrollWidth: layoutMetrics.scrollW,
        clientWidth: layoutMetrics.clientW,
        h1Count: layoutMetrics.h1Count,
        screenshot: screenshotFile,
      });

      console.log(
        `  ${pass ? '✅ PASS' : '❌ FAIL'}: ${r.name} (${r.path}) | scroll: ${layoutMetrics.scrollW}px, client: ${layoutMetrics.clientW}px | h1: ${layoutMetrics.h1Count}`
      );
    }
  }

  // INTERACTIVE TEST 1: ADMISSION WIZARD STEP VALIDATION & RENDER
  console.log('\n--- INTERACTIVE TEST: Complete Public Admission Wizard Walkthrough ---');
  await session.setViewport(390, 844, true);
  await session.navigate(`${BASE_URL}/admissions`);
  await new Promise((r) => setTimeout(r, 1000));

  const step1Render = await session.eval(`
    (() => {
      const text = document.body.innerText;
      return text.includes('Step 1 of 5') && text.includes('Parent / Guardian Details');
    })()
  `);
  console.log(`  Step 1 Rendered: ${step1Render ? '✅ PASS' : '❌ FAIL'}`);

  // INTERACTIVE TEST 2: STATUS TRACKER ANTI-ENUMERATION TEST
  console.log('\n--- INTERACTIVE TEST: Status Tracker Security & Anti-Enumeration ---');
  await session.navigate(`${BASE_URL}/admissions/status`);
  await new Promise((r) => setTimeout(r, 1000));

  const statusFormRender = await session.eval(`
    (() => {
      const text = document.body.innerText;
      return text.includes('Track Admission Status') && text.includes('Application Number');
    })()
  `);
  console.log(`  Status Tracker Form Rendered: ${statusFormRender ? '✅ PASS' : '❌ FAIL'}`);

  // Test anti-enumeration API directly from browser context
  const antiEnumApiCheck = await session.eval(`
    (async () => {
      const res = await fetch('/api/admissions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationNumber: 'APP-9999-9999',
          contactVerification: 'wrong@example.com'
        })
      });
      const data = await res.json();
      return {
        status: res.status,
        error: data.error,
        isGeneric: data.error === 'No matching application found with the provided details'
      };
    })()
  `);
  console.log(`  Status Anti-Enumeration Generic 404: ${antiEnumApiCheck.isGeneric ? '✅ PASS' : '❌ FAIL'} (HTTP ${antiEnumApiCheck.status}: "${antiEnumApiCheck.error}")`);

  // INTERACTIVE TEST 3: FEES DYNAMIC DISPLAY & JAIZ BANK DETAILS
  console.log('\n--- INTERACTIVE TEST: Fees Page Dynamic Backend Verification ---');
  await session.navigate(`${BASE_URL}/fees`);
  await new Promise((r) => setTimeout(r, 1000));

  const feesPageCheck = await session.eval(`
    (() => {
      const text = document.body.innerText;
      return {
        hasJaizBank: text.includes('Jaiz Bank') && text.includes('0012031162'),
        hasApplicationFee: text.includes('5,000') || text.includes('Application Form Fee'),
        hasTuitionTables: text.includes('Tuition') || text.includes('Structure') || text.includes('Term'),
      };
    })()
  `);
  console.log(`  Jaiz Bank Account Display: ${feesPageCheck.hasJaizBank ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Dynamic Application Fee Display: ${feesPageCheck.hasApplicationFee ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Tuition Breakdown Present: ${feesPageCheck.hasTuitionTables ? '✅ PASS' : '❌ FAIL'}`);

  // INTERACTIVE TEST 4: PROGRAMMES PLACEMENT GUIDANCE AUDIT
  console.log('\n--- INTERACTIVE TEST: Content Audit (Neutral Placement Guidance) ---');
  await session.navigate(`${BASE_URL}/programmes`);
  await new Promise((r) => setTimeout(r, 1000));

  const programmesContentCheck = await session.eval(`
    (() => {
      const text = document.body.innerText;
      return {
        hasNeutralPlacement: text.includes('Contact the school for placement guidance.'),
        hasEarlyYears: text.includes('Early Years') && text.includes('Creche') && text.includes('Nursery'),
        hasPrimary: text.includes('Primary') && text.includes('Grades 1') && text.includes('Grades 4'),
        hasTahfeez: text.includes('Tahfeez') && text.toLowerCase().includes('quranic memoriz'),
      };
    })()
  `);
  console.log(`  Neutral Placement Guidance: ${programmesContentCheck.hasNeutralPlacement ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Early Years Programme: ${programmesContentCheck.hasEarlyYears ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Primary Programme: ${programmesContentCheck.hasPrimary ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Standalone Tahfeez Programme: ${programmesContentCheck.hasTahfeez ? '✅ PASS' : '❌ FAIL'}`);

  await session.close();
  chromeProcess.kill();

  console.log('\n====================================================');
  console.log(`VISUAL & BROWSER VERIFICATION COMPLETED: ${results.filter(r => r.pass).length}/${results.length} PASSED`);
  console.log('====================================================');
}

runVisualSuite().catch((err) => {
  console.error('Visual test suite error:', err);
  process.exit(1);
});
