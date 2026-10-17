/*
 * tools/test-copy-check.js - look at the finished test copy after tools/update-test-copy.ps1 has rebuilt it (the
 * check CLAUDE.md asks for), in a headless browser with a throwaway profile - so nothing is left in any browser's
 * storage afterwards and there is nothing to clear.
 *
 *   node tools/test-copy-check.js ["C:\Claude\echo game\Test - everything finished"]
 *
 * It checks: the page loads with no console error; "TEST COPY" is on it; every mode says Finished; My Levels holds
 * every sample level in tools/sample-levels.json and the sample folders; the Bonus Levels tab has two ticked; the
 * Level Editor button goes straight past the spoiler warning (accepted in the test save); and the first sample code
 * in tools/sample-codes.txt reads as a level. Exit code 0 only if all of that holds.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { withPage } = require('./headless.js');

const dir = process.argv[2] || 'C:\\Claude\\echo game\\Test - everything finished';
const index = path.join(dir, 'index.html');
if (!fs.existsSync(index)) {
  console.error(`No test copy at ${dir}`);
  process.exit(1);
}
const samples = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-levels.json'), 'utf8'));
const folders = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-folders.json'), 'utf8'));
const code = (fs.readFileSync(path.join(__dirname, 'sample-codes.txt'), 'utf8').match(/ECHO1L[0-9A-Za-z]+/) || [''])[0];

const expr = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  out.notice = document.body.textContent.includes('TEST COPY');
  out.modes = [...document.querySelectorAll('#title .modes .mode small')].map((s) => s.textContent);
  out.levels = EchoLevelStore.list().length;
  out.folders = EchoLevelStore.listFolders().length;
  out.bonusDone = EchoLevelStore.bonus.doneIds().length;
  document.getElementById('btn-editor').click();
  await sleep(450);
  out.firstScreen = __echo.editorScreen();
  const d = ${JSON.stringify(code)} ? await EchoShare.decode(${JSON.stringify(code)}) : { ok: false };
  out.codeReads = !!d.ok;
  return out;
})()`;

withPage(async (page) => {
  await page.goto(pathToFileURL(index).href + '?debug', {});
  await new Promise((r) => setTimeout(r, 2000));
  const r = await page.eval(expr, 120);
  const checks = [
    ['loads with no console error or exception', !page.consoleErrors.length && !page.exceptions.length, [...page.exceptions, ...page.consoleErrors].join(' / ')],
    ['"TEST COPY" notice', r.notice],
    ['every mode says Finished', r.modes.length === 4 && r.modes.every((t) => /Finished/.test(t)), r.modes.join(' | ')],
    [`My Levels holds the ${samples.length} sample levels`, r.levels >= samples.length, `${r.levels}`],
    [`the ${(folders.folders || []).length} sample folders`, r.folders >= (folders.folders || []).length, `${r.folders}`],
    ['Bonus Levels: two ticked', r.bonusDone === 2, `${r.bonusDone}`],
    ['Level Editor: no spoiler warning (accepted in the test save)', r.firstScreen !== 'gate', r.firstScreen],
    ['a sample code from the READ ME reads', r.codeReads],
  ];
  let bad = 0;
  for (const [label, pass, info] of checks) {
    if (!pass) bad++;
    console.log(`${pass ? 'ok    ' : 'FAILED'} ${label}${info ? '  - ' + info : ''}`);
  }
  return bad;
})
  .then((bad) => process.exit(bad ? 1 : 0))
  .catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  });
