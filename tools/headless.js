/*
 * tools/headless.js - drive a headless Chrome / Chromium / Edge over the DevTools protocol, with Node's own
 * WebSocket and fetch (Node 22+; no packages). Works on Windows, macOS and Linux - including a cloud container.
 *
 *   node tools/headless.js <url> [--expr "<js>" | --eval file.js] [--save save.json] [--shot out.png]
 *                          [--size 1366x768] [--mobile] [--wait 1500] [--timeout 600]
 *
 *   --expr / --eval  an expression run in the page (awaited if it is a promise); its value is printed as JSON
 *   --save           a JSON object of localStorage keys -> values, put in place before the page loads for real
 *   --shot           a PNG screenshot of the page after the expression (only when you mean to take one)
 *   --size, --mobile the viewport (--mobile also turns on touch emulation and a phone user agent)
 * It prints { result, consoleErrors, exceptions } and exits 1 if the page threw or logged an error.
 *
 * The browser: $ECHO_BROWSER (or $CHROME_PATH) if set, else the usual install places (Edge / Chrome on Windows,
 * Chrome on macOS, chromium / google-chrome / microsoft-edge on Linux, Playwright's Chromium). No browser at all?
 *   npx -y playwright install chromium     (then it is found in ~/.cache/ms-playwright automatically)
 *
 * From a script: const { withPage } = require('./headless.js'); await withPage(async (page) => { ... }).
 */
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

function findBrowser() {
  const env = process.env.ECHO_BROWSER || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const candidates = [];
  if (process.platform === 'win32') {
    const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    for (const p of pf) candidates.push(path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else {
    for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge', 'microsoft-edge-stable']) {
      try {
        const p = execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (p) candidates.push(p);
      } catch (e) {
        /* not installed */
      }
    }
  }
  // Playwright's own Chromium (npx playwright install chromium)
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), process.platform === 'win32' ? 'AppData/Local/ms-playwright' : process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  try {
    for (const d of fs.readdirSync(pw).filter((n) => /^chromium/.test(n)).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-headless-shell-linux64/chrome-headless-shell']) candidates.push(path.join(pw, d, rel));
    }
  } catch (e) {
    /* no Playwright browsers */
  }
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/** Launch a browser, hand `fn` a page object, close everything afterwards. */
async function withPage(fn, opts = {}) {
  const exe = findBrowser();
  if (!exe) throw new Error('No Chrome / Chromium / Edge found. Set ECHO_BROWSER to one, or run: npx -y playwright install chromium');
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-headless-'));
  const args = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu', '--hide-scrollbars'];
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-dev-shm-usage'); // (containers run as root, with a tiny /dev/shm)
  args.push('about:blank');
  const browser = spawn(exe, args, { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch (e) {
      /* still starting */
    }
  }
  if (!target) {
    browser.kill();
    throw new Error(`${exe} did not start (no DevTools on port ${port})`);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  const consoleErrors = [];
  const exceptions = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(((msg.params.exceptionDetails.exception || {}).description || msg.params.exceptionDetails.text || '').split('\n').slice(0, 3).join(' | '));
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map((a) => a.value !== undefined ? String(a.value) : a.description || '').join(' '));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') consoleErrors.push(`${msg.params.entry.text}${msg.params.entry.url ? ' (' + msg.params.entry.url + ')' : ''}`);
    for (const w of waiters.splice(0)) if (w.m === msg.method) w.r(msg.params);
    else waiters.push(w);
  };
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const once = (m, ms = 20000) => new Promise((r) => {
    waiters.push({ m, r });
    setTimeout(r, ms);
  });
  const page = {
    send,
    consoleErrors,
    exceptions,
    async size(w = 1366, h = 768, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
      await send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await send('Emulation.setUserAgentOverride', { userAgent: mobile ? MOBILE_UA : '' });
    },
    async goto(url, save) {
      let l = once('Page.loadEventFired');
      await send('Page.navigate', { url });
      await l;
      if (save) {
        await page.eval(`(() => { localStorage.clear(); const s = ${JSON.stringify(save)}; for (const k in s) localStorage.setItem(k, s[k]); return true; })()`);
        consoleErrors.length = 0;
        exceptions.length = 0;
        l = once('Page.loadEventFired');
        await send('Page.navigate', { url });
        await l;
      }
    },
    async eval(expression, timeoutS = 600) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: timeoutS * 1000 });
      if (r.result && r.result.exceptionDetails) {
        const d = r.result.exceptionDetails;
        throw new Error(((d.exception || {}).description || d.text || 'the expression threw').split('\n').slice(0, 4).join(' | '));
      }
      return r.result && r.result.result ? r.result.result.value : undefined;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      return file;
    },
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await page.size(opts.w || 1366, opts.h || 768, !!opts.mobile);
    return await fn(page);
  } finally {
    try {
      ws.close();
    } catch (e) {
      /* closed */
    }
    browser.kill();
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (e) {
      /* the browser may still hold a file for a moment; it is only a temp profile */
    }
  }
}

module.exports = { withPage, findBrowser };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const url = argv[0];
  if (!url || url.startsWith('--')) {
    console.error('usage: node tools/headless.js <url> [--expr "<js>" | --eval file.js] [--save save.json] [--shot out.png] [--size 1366x768] [--mobile] [--wait 1500]');
    process.exit(2);
  }
  const [w, h] = (opt('--size') || '1366x768').split('x').map(Number);
  const expr = opt('--expr') || (opt('--eval') ? fs.readFileSync(opt('--eval'), 'utf8') : null);
  const save = opt('--save') ? JSON.parse(fs.readFileSync(opt('--save'), 'utf8')) : null;
  withPage(async (page) => {
    await page.goto(url, save);
    await sleep(+(opt('--wait') || 1500));
    const result = expr ? await page.eval(expr, +(opt('--timeout') || 600)) : undefined;
    if (opt('--shot')) await page.shot(opt('--shot'));
    return { result, consoleErrors: page.consoleErrors, exceptions: page.exceptions };
  }, { w, h, mobile: argv.includes('--mobile') })
    .then((out) => {
      console.log(JSON.stringify(out, null, 1));
      process.exit(out.exceptions.length || out.consoleErrors.length ? 1 : 0);
    })
    .catch((e) => {
      console.error(String(e && e.message ? e.message : e));
      process.exit(1);
    });
}
