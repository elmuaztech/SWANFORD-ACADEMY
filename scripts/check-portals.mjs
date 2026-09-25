import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9230;
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\HomePC\\.gemini\\antigravity-ide\\brain\\ce7de5af-d6a5-4319-97c4-9cc0a01c19ae';

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

  async setCookie(name, value, domain = 'localhost') {
    await this.send('Network.setCookie', {
      name,
      value,
      domain,
      path: '/',
      httpOnly: true,
      secure: false,
    });
  }

  async clearCookies() {
    await this.send('Network.clearBrowserCookies');
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
    '--user-data-dir=' + path.join(process.env.TEMP || 'C:\\temp', 'chrome_portal_test_' + Date.now()),
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
    await session.send('Network.enable');

    // 1. Home Desktop
    await session.setViewport(1440, 900, false);
    await session.navigate(`${BASE_URL}/`);
    await session.eval('new Promise(res => setTimeout(res, 1000))');
    await session.screenshot('home_desktop_verified.png');

    // 2. Home Mobile 360px
    await session.setViewport(360, 780, true);
    await session.navigate(`${BASE_URL}/`);
    await session.eval('new Promise(res => setTimeout(res, 1000))');
    await session.screenshot('home_mobile_360_verified.png');

    // 3. Login Desktop
    await session.setViewport(1440, 900, false);
    await session.clearCookies();
    await session.navigate(`${BASE_URL}/auth/login`);
    await session.eval('new Promise(res => setTimeout(res, 1000))');
    await session.screenshot('login_desktop_verified.png');

    // 4. Login Mobile 360px
    await session.setViewport(360, 780, true);
    await session.navigate(`${BASE_URL}/auth/login`);
    await session.eval('new Promise(res => setTimeout(res, 1000))');
    await session.screenshot('login_mobile_360_verified.png');

    // 5. Parent Portal (authenticated)
    await session.setViewport(1440, 900, false);
    await session.setCookie('swanford_session', 'demo_session_parent');
    await session.navigate(`${BASE_URL}/parent`);
    await session.eval('new Promise(res => setTimeout(res, 1500))');
    await session.screenshot('parent_portal_verified.png');

    // 6. Teacher Portal (authenticated)
    await session.setCookie('swanford_session', 'demo_session_teacher');
    await session.navigate(`${BASE_URL}/teacher`);
    await session.eval('new Promise(res => setTimeout(res, 1500))');
    await session.screenshot('teacher_portal_verified.png');

    // 7. Admin Portal (Super Admin authenticated)
    await session.setCookie('swanford_session', 'demo_session_super_admin');
    await session.navigate(`${BASE_URL}/admin`);
    await session.eval('new Promise(res => setTimeout(res, 1500))');
    await session.screenshot('admin_portal_verified.png');

    // 8. Fees Page
    await session.navigate(`${BASE_URL}/fees`);
    await session.eval('new Promise(res => setTimeout(res, 1000))');
    await session.screenshot('fees_desktop_verified.png');

    console.log('All visual screenshots captured successfully!');
    await session.close();
  } finally {
    chromeProcess.kill();
  }
}

main().catch(console.error);

