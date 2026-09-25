import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9226;
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\HomePC\\.gemini\\antigravity-ide\\brain\\ece0888b-1304-43c7-ba26-3fc0dfd155f8';

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
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
      console.log(`Saved screenshot: ${filepath}`);
      return filepath;
    }
  }

  async close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
  }
}

async function main() {
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--user-data-dir=' + path.join(process.env.TEMP || 'C:\\temp', 'chrome_test_profile_' + Date.now()),
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Chrome headless CDP');
    chromeProcess.kill();
    process.exit(1);
  }

  try {
    const newTargetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${BASE_URL}`, { method: 'PUT' });
    const targetData = await newTargetRes.json();
    const session = new ChromeSession(targetData.webSocketDebuggerUrl);
    await session.connect();
    await session.send('Page.enable');
    await session.send('DOM.enable');

    console.log('--- TEST 1: Home Desktop Viewport (1440x900) ---');
    await session.setViewport(1440, 900, false);
    await session.navigate(BASE_URL);
    await session.eval('new Promise(r => setTimeout(r, 1200))');

    const homeDesktopChecks = await session.eval(`(() => {
      const bodyText = document.body.innerText;
      const hasArabic = /[\\u0600-\\u06FF]/.test(bodyText);
      const hasPaystack = /paystack/i.test(bodyText);
      const hasParentContact = /parents contact immediately/i.test(bodyText);
      const portalBtn = Array.from(document.querySelectorAll('button, a')).find(el => el.innerText.includes('Portal Login'));
      const portalStyles = portalBtn ? window.getComputedStyle(portalBtn) : null;
      const motto = document.querySelector('.italic');
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      return {
        hasArabic,
        hasPaystack,
        hasParentContact,
        overflow,
        portalBtnFound: !!portalBtn,
        portalBg: portalStyles ? portalStyles.backgroundColor : null,
        portalColor: portalStyles ? portalStyles.color : null,
        mottoText: motto?.innerText
      };
    })()`);
    console.log('Home Desktop checks:', JSON.stringify(homeDesktopChecks, null, 2));
    await session.screenshot('home_desktop_verified.png');

    console.log('--- TEST 1B: Programmes Section on Home Page ---');
    await session.eval('document.getElementById("our-programmes")?.scrollIntoView({ behavior: "instant" })');
    await session.eval('new Promise(r => setTimeout(r, 600))');
    await session.screenshot('programmes_section_verified.png');

    console.log('--- TEST 2: Home Phone (360x780) ---');
    await session.setViewport(360, 780, true);
    await session.navigate(BASE_URL);
    await session.eval('new Promise(r => setTimeout(r, 1200))');

    const home360Checks = await session.eval(`(() => {
      const bodyText = document.body.innerText;
      const hasPaystack = /paystack/i.test(bodyText);
      const hasParentContact = /parents contact immediately/i.test(bodyText);
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      return {
        hasPaystack,
        hasParentContact,
        overflow
      };
    })()`);
    console.log('Home 360px checks:', JSON.stringify(home360Checks, null, 2));
    await session.screenshot('home_mobile_360_verified.png');

    console.log('--- TEST 3: Login Page Desktop (1440x900) ---');
    await session.setViewport(1440, 900, false);
    await session.navigate(`${BASE_URL}/auth/login`);
    await session.eval('new Promise(r => setTimeout(r, 1200))');

    const loginDesktopChecks = await session.eval(`(() => {
      const bodyText = document.body.innerText;
      const hasPaystack = /paystack/i.test(bodyText);
      const emailInput = document.querySelector('#email');
      const passwordInput = document.querySelector('#password');
      const submitBtn = document.querySelector('button[type="submit"]');
      return {
        hasPaystack,
        hasEmailInput: !!emailInput,
        hasPasswordInput: !!passwordInput,
        submitBtnText: submitBtn?.innerText
      };
    })()`);
    console.log('Login Desktop checks:', JSON.stringify(loginDesktopChecks, null, 2));
    await session.screenshot('login_desktop_verified.png');

    console.log('--- TEST 4: Login Page Mobile (360x780) ---');
    await session.setViewport(360, 780, true);
    await session.navigate(`${BASE_URL}/auth/login`);
    await session.eval('new Promise(r => setTimeout(r, 1200))');

    const login360Checks = await session.eval(`(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      const submitBtn = document.querySelector('button[type="submit"]');
      const rect = submitBtn ? submitBtn.getBoundingClientRect() : null;
      return {
        overflow,
        submitBtnHeight: rect?.height
      };
    })()`);
    console.log('Login 360px checks:', JSON.stringify(login360Checks, null, 2));
    await session.screenshot('login_mobile_360_verified.png');

    console.log('--- TEST 5: Fees Page (Verify 0 Paystack / 0 Dev terms) ---');
    await session.setViewport(1440, 900, false);
    await session.navigate(`${BASE_URL}/fees`);
    await session.eval('new Promise(r => setTimeout(r, 1200))');

    const feesChecks = await session.eval(`(() => {
      const bodyText = document.body.innerText;
      const hasPaystack = /paystack/i.test(bodyText);
      const hasGateway = /gateway/i.test(bodyText);
      const hasLedger = /ledger/i.test(bodyText);
      return {
        hasPaystack,
        hasGateway,
        hasLedger
      };
    })()`);
    console.log('Fees Page checks:', JSON.stringify(feesChecks, null, 2));
    await session.screenshot('fees_desktop_verified.png');

    await session.close();
  } finally {
    chromeProcess.kill();
  }
}

main().catch(console.error);
