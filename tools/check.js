/*
 * tools/check.js - the standard checks, in one command. The same in a local session and a cloud one.
 *
 *   node tools/check.js            the quick set (a minute or two): see QUICK below
 *   node tools/check.js --full     every test suite that is not a soak (several minutes)
 *   node tools/check.js --shot [file.png]   also a screenshot of the title (default tools/out/title.png - ignored by git)
 *   node tools/check.js --release  THE RELEASE GATE a cloud session runs before it may push to main: everything --full
 *                                  runs, plus screenshots in tools/out/release/ (the title on a laptop and on a phone, and
 *                                  level 1 lit by a ripple). Exit code 0 = every check passed = main may be pushed.
 *
 * The version check (always run, no browser needed): VERSION.json holds the version and its short title, and every
 * other place that names the current version must agree with it - the "(latest)" row of CLAUDE.md's version table
 * and the "Current version" line of README.md. The game itself stores no version on purpose (the title screen reads
 * it from the version folder's name, and sw.js is network-first with an unversioned cache), and the check fails if a
 * hard-coded one appears in sw.js or the title screen's tag - see CLAUDE.md, "Cloud sessions".
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
const RELEASE = args.includes('--release');
const FULL = RELEASE || args.includes('--full');
const SHOT_DIR = path.join(ROOT, 'tools', 'out', 'release');
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
  versionCheck();
}

/** VERSION.json, and every place that names the current version, must agree (CLAUDE.md, "Cloud sessions"). */
function versionCheck() {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  let v;
  try {
    v = JSON.parse(read('VERSION.json'));
  } catch (e) {
    return ok('VERSION.json is there and readable', false, String(e.message || e));
  }
  const problems = [];
  if (!/^v\d+\.\d+$/.test(v.version || '')) problems.push(`"version" must look like v16.0 (got ${JSON.stringify(v.version)})`);
  if (typeof v.title !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ,.'()&+-]{0,39}$/.test(v.title) || v.title !== v.title.trim()) problems.push(`"title" must be a few plain words, at most 40 characters, nothing a folder name cannot hold (got ${JSON.stringify(v.title)})`);
  // CLAUDE.md: the version table's last row is the one marked (latest), and it is this version
  // (the version table is the one headed "| Version | Commit | What changed |" - other tables have v-rows too)
  const md = read('CLAUDE.md').split('\n');
  const head = md.findIndex((l) => l.startsWith('| Version | Commit |'));
  const rows = [];
  for (let i = head + 2; head >= 0 && i < md.length && /^\| v\d+\.\d+ \|/.test(md[i]); i++) rows.push(md[i]);
  const latest = rows.filter((l) => l.includes('(latest)'));
  const num = (x) => x.slice(1).split('.').map(Number);
  const cmp = (a, b) => num(a)[0] - num(b)[0] || num(a)[1] - num(b)[1];
  if (latest.length !== 1) problems.push(`CLAUDE.md's version table must mark exactly one row "(latest)" (found ${latest.length})`);
  else if (latest[0] !== rows[rows.length - 1]) problems.push(`the "(latest)" row must be the last row of CLAUDE.md's version table`);
  else {
    const lv = latest[0].split('|')[1].trim();
    if (lv !== v.version) problems.push(`CLAUDE.md's latest row is ${lv}, VERSION.json says ${v.version}`);
    const top = rows.map((l) => l.split('|')[1].trim()).sort(cmp).pop();
    if (top !== lv) problems.push(`CLAUDE.md's version table has ${top}, newer than its "(latest)" row ${lv}`);
  }
  // README.md: one "Current version" line
  const lines = read('README.md').split('\n').filter((l) => l.startsWith('**Current version:**'));
  const want = `**Current version:** ${v.version} - ${v.title}`;
  if (lines.length !== 1 || lines[0].trim() !== want) problems.push(`README.md must have exactly one line "${want}" (found ${lines.length ? JSON.stringify(lines) : 'none'})`);
  // the game: no version of its own (sw.js network-first with an unversioned cache; the title's tag filled from the folder name)
  // (string values only - a comment saying which version added something is history, not a cache version)
  const swStrings = read('sw.js').match(/(['"`])[^'"`\n]*\1/g) || [];
  const swVersions = swStrings.join(' ').match(/v\d+\.\d+/g) || [];
  if (swVersions.some((x) => x !== v.version)) problems.push(`sw.js names ${[...new Set(swVersions)].join(', ')}, not ${v.version} - the service worker is network-first and needs no cache version (CLAUDE.md)`);
  if (!/<p id="version-tag"[^>]*><\/p>/.test(read('index.html'))) problems.push(`index.html's #version-tag must be empty - the title screen reads the version from the version folder's name`);
  ok(`the version agrees everywhere (${v.version} - ${v.title})`, !problems.length, problems.join(' / '));
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
      if (RELEASE) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        const f = path.join(SHOT_DIR, '1-title-laptop.png');
        await page.shot(f);
        ok('release screenshot: the title on a laptop', fs.statSync(f).size > 5000, path.relative(ROOT, f));
      }
    });
    if (RELEASE) await releaseShots(base);
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

/** --release: two more screenshots, each from a fresh page - the title on a phone, and level 1 lit by a ripple. */
async function releaseShots(base) {
  await withPage(async (page) => {
    await page.goto(base, {});
    await new Promise((r) => setTimeout(r, 2500));
    const f = path.join(SHOT_DIR, '2-title-phone.png');
    await page.shot(f);
    ok('release screenshot: the title on a phone', fs.statSync(f).size > 5000 && !page.exceptions.length && !page.consoleErrors.length, path.relative(ROOT, f));
  }, { w: 844, h: 390, mobile: true });
  await withPage(async (page) => {
    await page.goto(base + '?debug', {});
    await new Promise((r) => setTimeout(r, 1500));
    await page.eval(`(() => { __echo.audio.setMuted(true); __echo.go(1); __echo.step(0.3); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); __echo.step(0.6); return true; })()`);
    await new Promise((r) => setTimeout(r, 400));
    const f = path.join(SHOT_DIR, '3-level-1-ripple.png');
    await page.shot(f);
    const info = await page.eval('({ state: __echo.info().state, level: __echo.info().levelNum, ripples: __echo.ripples().length })');
    ok('release screenshot: level 1 lit by a ripple', fs.statSync(f).size > 5000 && info.state === 'play' && info.level === 1 && !page.exceptions.length, `${path.relative(ROOT, f)} ${JSON.stringify(info)}`);
  });
}

function finish(t0) {
  const failed = results.filter((r) => r.pass === false);
  const notRun = results.filter((r) => r.pass === null);
  console.log(`\n${results.length - failed.length - notRun.length} passed, ${failed.length} failed, ${notRun.length} not run - ${((Date.now() - t0) / 1000).toFixed(0)} s${FULL ? '' : ' (quick set; --full for every suite)'}`);
  // (a release needs every check really RUN, not just none failed - no browser means no push to main)
  if (RELEASE) console.log(failed.length || notRun.length ? 'RELEASE GATE: FAILED - do NOT push to main (a branch and a pull request instead; CLAUDE.md, "Cloud sessions")' : 'RELEASE GATE: PASSED - main may be pushed');
  process.exit(failed.length || (RELEASE && notRun.length) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
