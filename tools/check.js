/*
 * tools/check.js - the standard checks, in one command. The same in a local session and a cloud one.
 *
 *   node tools/check.js            the quick set (a minute or two): see QUICK below
 *   node tools/check.js --full     every test suite that is not a soak (several minutes)
 *   node tools/check.js --shot [file.png]   also a screenshot of the title (default tools/out/title.png - ignored by git)
 *
 * What it does: every .js file through `node --check`, every .json file parsed; then the repo is served
 * (tools/serve.js) and loaded in a headless browser (tools/headless.js) - the page must load with NO console error
 * and no exception; then the generator fingerprint (tools/generator-fingerprint.js) must be EXPECTED_FINGERPRINT with
 * a real level 12 for its sanity line; then the test suites, each group in a fresh browser (so one suite's save can
 * never leak into the next). Exit code 0 only if everything passed.
 *
 * No browser anywhere (some containers)? The syntax and JSON checks still run, and the generator fingerprint is
 * worked out in Node itself (the generator needs no page); the browser suites are reported as NOT RUN - install
 * one with `npx -y playwright install chromium` and run it again.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { start } = require('./serve.js');
const { withPage, findBrowser } = require('./headless.js');

const ROOT = path.join(__dirname, '..');
// levels 1-12 as generated must never change unless an update means them to (CLAUDE.md, "Constraints")
const EXPECTED_FINGERPRINT = '9097b344';
const EXPECTED_SANITY = { W: 37, H: 29, enemies: 'echo,singer', pathTiles: 72 };

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const shotAt = args.indexOf('--shot');
const SHOT = shotAt >= 0 ? (args[shotAt + 1] && !args[shotAt + 1].startsWith('--') ? args[shotAt + 1] : path.join(ROOT, 'tools', 'out', 'title.png')) : null;

// [harness file(s) to load, object, suites] - one browser per group
const QUICK = [
  { name: 'formats and share codes', load: ['editor-test.js', 'editor-test-2.js', 'bonus-test.js', 'share-test.js'], runs: [['EditorTest', 'validation'], ['EditorTest', 'untrusted'], ['EditorTest2', 'migration'], ['BonusTest', 'load'], ['ShareTest', 'format'], ['ShareTest', 'roundTrips'], ['ShareTest', 'bad']] },
  { name: 'monsters (v15.7)', load: ['monster-test.js'], runs: [['MonsterTest', 'campaign'], ['MonsterTest', 'sharing'], ['MonsterTest', 'alarm']] },
];
const FULL_EXTRA = [
  { name: 'editor (v15.0)', load: ['editor-test.js'], runs: ['gate', 'tools', 'storage', 'noWrites'].map((n) => ['EditorTest', n]) },
  { name: 'editor (v15.1)', load: ['editor-test.js', 'editor-test-2.js'], runs: ['touchGate', 'exits', 'keys', 'objects', 'effects', 'card', 'difficulty', 'folders', 'untrusted', 'noWrites'].map((n) => ['EditorTest2', n]) },
  { name: 'bonus levels', load: ['bonus-test.js'], runs: ['gates', 'noWrites', 'copy', 'readOnly', 'ticks', 'invalid'].map((n) => ['BonusTest', n]) },
  { name: 'sharing screens', load: ['editor-test.js', 'editor-test-2.js', 'bonus-test.js', 'share-test.js'], runs: ['screens', 'authors', 'plays', 'noWrites'].map((n) => ['ShareTest', n]) },
  { name: 'monsters, more', load: ['monster-test.js'], runs: ['alarmOthers', 'screecho', 'tuning', 'editor', 'noWrites'].map((n) => ['MonsterTest', n]) },
  { name: 'the editor warning', load: ['monster-test.js'], runs: [['MonsterTest', 'gate']] },
  { name: 'title screen', load: ['title-test.js'], runs: ['keys', 'howTo', 'buttons', 'touch', 'noWrites', 'begin'].map((n) => ['TitleTest', n]) },
];

const results = [];
const ok = (name, pass, info) => {
  results.push({ name, pass, info });
  console.log(`${pass === null ? 'NOT RUN' : pass ? 'ok     ' : 'FAILED '} ${name}${info ? '  - ' + info : ''}`);
};

function listFiles(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'out') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

function staticChecks() {
  const bad = [];
  for (const f of listFiles(ROOT, '.js')) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      bad.push(`${path.relative(ROOT, f)}: ${String(e.stderr || e).split('\n').slice(0, 4).join(' ')}`);
    }
  }
  ok('every .js file parses (node --check)', !bad.length, bad.join(' / '));
  const badJson = [];
  for (const f of listFiles(ROOT, '.json').concat([path.join(ROOT, 'manifest.webmanifest')])) {
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      badJson.push(`${path.relative(ROOT, f)}: ${e.message}`);
    }
  }
  ok('every .json file (and the web app manifest) is valid JSON', !badJson.length, badJson.join(' / '));
}

/** The generator, run in Node with no page at all (it needs none): the fallback when there is no browser. */
function nodeFingerprint() {
  // (the palette and the save module are loaded first, as the page does; they get a do-nothing page to talk to)
  const store = {};
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], key: (i) => Object.keys(store)[i], get length() { return Object.keys(store).length; } };
  const el = { style: { setProperty() {} }, dataset: {}, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} } };
  const ctx = { console, Math, Date, JSON, localStorage, document: { documentElement: el, querySelectorAll: () => [], getElementById: () => null } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/profile.js', 'js/palette.js', 'js/level.js', 'js/tutorial.js', 'js/warden.js', 'js/story.js', 'tools/generator-fingerprint.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return vm.runInContext('GENFP()', ctx);
}

function judgeFingerprint(g, where) {
  const s = g && g.sanity;
  const sane = !!s && s.W === EXPECTED_SANITY.W && s.H === EXPECTED_SANITY.H && s.enemies === EXPECTED_SANITY.enemies && s.pathTiles === EXPECTED_SANITY.pathTiles;
  ok(`generator fingerprint ${EXPECTED_FINGERPRINT} (${where})`, !!g && g.combined === EXPECTED_FINGERPRINT && sane, g ? `got ${g.combined}, sanity ${JSON.stringify(s)}` : 'no result');
}

const loadScripts = (files) => `(async () => { for (const f of ${JSON.stringify(files)}) await new Promise((r, j) => { const s = document.createElement('script'); s.src = '/tools/' + f + '?' + Date.now(); s.onload = r; s.onerror = () => j(new Error('could not load ' + f)); document.head.appendChild(s); }); return true; })()`;
const runSuite = (obj, name) => `(async () => { const r = await window.${obj}.${name}(); const pass = r.pass !== undefined ? r.pass : r.passed; const fail = r.fail !== undefined ? r.fail : (r.failed || []).length; return { pass, fail, failed: JSON.stringify(r.failed || []).slice(0, 600) }; })()`;

async function main() {
  const t0 = Date.now();
  staticChecks();
  const exe = process.env.ECHO_NO_BROWSER ? null : findBrowser(); // (ECHO_NO_BROWSER=1 tries the fallback on purpose)
  if (!exe) {
    try {
      judgeFingerprint(nodeFingerprint(), 'worked out in Node - no browser found');
    } catch (e) {
      ok('generator fingerprint (in Node)', false, String(e.message || e));
    }
    ok('the game loads with no console errors', null, 'no browser found: set ECHO_BROWSER, or run `npx -y playwright install chromium`');
    ok('the browser test suites', null, 'no browser found');
    return finish(t0);
  }
  console.log(`(browser: ${exe})`);
  const port = 8400 + Math.floor(Math.random() * 400);
  const server = await start(port, ROOT);
  const base = `http://localhost:${port}/`;
  try {
    // the plain game: no ?debug, a fresh save - nothing may go wrong just loading it
    await withPage(async (page) => {
      await page.goto(base, {});
      await new Promise((r) => setTimeout(r, 2500));
      const title = await page.eval('document.title');
      ok('the game loads with no console errors or exceptions', !page.consoleErrors.length && !page.exceptions.length && title === 'Echo Maze', [...page.exceptions, ...page.consoleErrors].join(' / ') || `title "${title}"`);
      if (SHOT) {
        await page.shot(SHOT);
        ok('screenshot of the title', fs.existsSync(SHOT) && fs.statSync(SHOT).size > 5000, path.relative(ROOT, SHOT));
      }
    });
    // the generator fingerprint, in the page (the way CLAUDE.md has always run it)
    await withPage(async (page) => {
      await page.goto(base + '?debug', {});
      await page.eval(loadScripts(['generator-fingerprint.js']));
      judgeFingerprint(await page.eval('GENFP()', 300), 'in the browser');
    });
    for (const group of FULL ? QUICK.concat(FULL_EXTRA) : QUICK) {
      await withPage(async (page) => {
        await page.goto(base + '?debug', {});
        await new Promise((r) => setTimeout(r, 1200));
        await page.eval('__echo.audio.setMuted(true), true');
        await page.eval(loadScripts(group.load));
        for (const [obj, name] of group.runs) {
          try {
            const r = await page.eval(runSuite(obj, name), 600);
            ok(`${obj}.${name} ${r.pass}/${r.pass + r.fail}`, r.fail === 0, r.fail ? r.failed : '');
          } catch (e) {
            ok(`${obj}.${name}`, false, `threw: ${String(e.message || e).slice(0, 300)}`);
          }
        }
        // (a suite that ends with a page error says so)
        if (page.exceptions.length) ok(`${group.name}: no uncaught exceptions`, false, page.exceptions.slice(0, 3).join(' / '));
      });
    }
  } finally {
    server.close();
  }
  return finish(t0);
}

function finish(t0) {
  const failed = results.filter((r) => r.pass === false);
  const notRun = results.filter((r) => r.pass === null);
  console.log(`\n${results.length - failed.length - notRun.length} passed, ${failed.length} failed, ${notRun.length} not run - ${((Date.now() - t0) / 1000).toFixed(0)} s${FULL ? '' : ' (quick set; --full for every suite)'}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
