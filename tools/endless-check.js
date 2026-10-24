/*
 * tools/endless-check.js (v20.0) - Endless mode's mazes, in Node (no browser): every depth 1-60 of several runs in
 * every mode, with and without the Alarm met, built and checked.
 *
 *   node tools/endless-check.js [--quiet] [runs]
 *
 * Checks: every depth passes the fairness rules (endlessCheck) without running out of seeds; the same run seed and
 * depth always build the same maze (and another seed another maze); only the monsters the campaign has brought in by
 * then (in its order, one new kind every ENDLESS_STEP depths, the newest always there in its first stretch), the Alarm
 * only when it has been met, never a Screecho or a Warden or a story tile; the mazes grow to ENDLESS_SIZE_DEPTH and
 * then stop; monsters and their speed rise slowly to caps, every speed under the player's 170; and the generator
 * fingerprint of levels 1-12 is untouched (tools/check.js works that out too). In every tools/check.js run.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const RUNS = Number(args.find((a) => /^\d+$/.test(a))) || 6;
const warnings = [];
const el = { style: { setProperty() {} }, dataset: {}, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} } };
const ctx = {
  console: { log() {}, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push(a.join(' ')) },
  Math,
  Date,
  JSON,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
  document: { documentElement: el, querySelectorAll: () => [], getElementById: () => null },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/profile.js', 'js/palette.js', 'js/level.js', 'js/tutorial.js', 'js/warden.js', 'js/story.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const G = (expr) => vm.runInContext(expr, ctx);
const INTRO = G('ENDLESS_INTRO');
const SIZE_DEPTH = G('ENDLESS_SIZE_DEPTH');

const results = [];
const ok = (name, pass, info) => {
  results.push(pass);
  if (!QUIET || !pass) console.log(`${pass ? 'ok     ' : 'FAILED '} ${name}${info ? '  - ' + info : ''}`);
};
const hash = (lv) => {
  let h = 2166136261;
  const add = (v) => {
    h ^= v & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (const w of lv.walls) add(w);
  for (const o of lv.obstacles) add(o.tx * 97 + o.ty);
  for (const e of lv.enemies) add(e.tx * 131 + e.ty * 7 + e.kind.length);
  add(lv.exit.x);
  return h.toString(16);
};

const modes = ['easy', 'normal', 'hard', 'hardcore'];
let built = 0;
let retried = 0;
const fails = [];
const badKinds = [];
const missingNewest = [];
const tooFast = [];
let maxTries = 0;
let maxMonsters = 0;
const sizeAt = {};
const seenKinds = new Set();
for (const mode of modes) {
  for (let r = 0; r < RUNS; r++) {
    const runSeed = (0x1234567 + r * 7919 + mode.length * 104729) >>> 0;
    const alarm = r % 2 === 1;
    for (let d = 1; d <= 60; d++) {
      const lv = G(`generateEndless(${runSeed}, ${d}, '${mode}', { alarm: ${alarm} })`);
      built++;
      if (!lv.endless.ok) fails.push(`${mode} run ${r} depth ${d}: ${lv.endless.why}`);
      if (lv.endless.attempt > 0) retried++;
      maxTries = Math.max(maxTries, lv.endless.attempt + 1);
      const allowed = new Set(G(`endlessKinds(${d}, { alarm: ${alarm} })`));
      for (const k of lv.endless.kinds) {
        seenKinds.add(k);
        if (!allowed.has(k)) badKinds.push(`${mode} d${d}: ${k}`);
      }
      // the newest kind, in its first stretch, is there
      for (const k of allowed) if (d < INTRO[k] + G('ENDLESS_STEP') && !lv.endless.kinds.includes(k)) missingNewest.push(`${mode} d${d}: no ${k}`);
      const c = lv.cfg;
      for (const sp of ['enemySpeed', 'scentSpeed', 'stalkerSpeed', 'mufflerSpeed', 'singerSpeed']) if (!(c[sp] < 170)) tooFast.push(`${mode} d${d} ${sp} ${c[sp]}`);
      maxMonsters = Math.max(maxMonsters, lv.enemies.length);
      if (mode === 'normal' && r === 0) sizeAt[d] = `${lv.W}x${lv.H}`;
    }
  }
}
ok(`${built} depths built (1-60, ${RUNS} runs x 4 modes, half with the Alarm met): every one passes the fairness rules`, fails.length === 0, fails.slice(0, 5).join(' / '));
ok(`...${retried} of them needed another seed, never more than ${maxTries} tries (of ${G('ENDLESS_TRIES')})`, maxTries < G('ENDLESS_TRIES'));
ok('only the monsters met by then, in the campaign\'s order (the Alarm only once met)', badKinds.length === 0, badKinds.slice(0, 5).join(', '));
ok('a kind\'s first stretch always has one of it', missingNewest.length === 0, missingNewest.slice(0, 5).join(', '));
ok(`never a Screecho, a Warden or anything else (${[...seenKinds].join(', ')})`, [...seenKinds].every((k) => ['echo', 'scent', 'mimic', 'stalker', 'muffler', 'singer', 'alarm'].includes(k)) && seenKinds.has('alarm'));
ok('every monster slower than the player (170 px/s), at every depth', tooFast.length === 0, tooFast.slice(0, 4).join(', '));
ok(`at most ${G('ENDLESS_MAX_MONSTERS')} monsters (${maxMonsters})`, maxMonsters <= G('ENDLESS_MAX_MONSTERS'));
ok(`depths 1-3 are small, with one echo monster only (${sizeAt[1]}, ${sizeAt[3]})`, [1, 2, 3].every((d) => {
  const lv = G(`generateEndless(99, ${d}, 'normal', {})`);
  return lv.enemies.length === 1 && lv.enemies[0].kind === 'echo' && lv.W <= 17;
}));
ok(`the mazes grow to depth ${SIZE_DEPTH} and then stop (${sizeAt[1]} -> ${sizeAt[15]} -> ${sizeAt[SIZE_DEPTH]} = ${sizeAt[60]})`, sizeAt[SIZE_DEPTH] === sizeAt[60] && sizeAt[1] !== sizeAt[SIZE_DEPTH]);
const sp30 = G(`endlessConfig(30, 'hardcore', {}, () => 0.5).enemySpeed`);
const sp60 = G(`endlessConfig(60, 'hardcore', {}, () => 0.5).enemySpeed`);
const sp200 = G(`endlessConfig(200, 'hardcore', {}, () => 0.5).enemySpeed`);
ok(`past depth ${SIZE_DEPTH} the monsters speed up slowly, to a cap (Hardcore ${sp30.toFixed(1)} -> ${sp60.toFixed(1)} -> ${sp200.toFixed(1)} px/s)`, sp60 > sp30 && sp200 >= sp60 && sp200 < 170 && sp200 <= sp30 * G('ENDLESS_SPEED_TOP') + 0.01);
// the same seed and depth: the same maze; another seed: another
const a = hash(G(`generateEndless(424242, 17, 'hard', { alarm: true })`));
const b = hash(G(`generateEndless(424242, 17, 'hard', { alarm: true })`));
const c = hash(G(`generateEndless(424243, 17, 'hard', { alarm: true })`));
const d2 = hash(G(`generateEndless(424242, 18, 'hard', { alarm: true })`));
ok(`deterministic: (run seed, depth) always builds the same maze (${a}), another seed or depth another (${c}, ${d2})`, a === b && a !== c && a !== d2);
// levels 1-12 by the campaign's own call: untouched by any of this (the full fingerprint is tools/check.js's)
const before = hash(G(`generateLevel(12, 777, 'normal')`));
G(`generateEndless(777, 12, 'normal', {})`);
ok(`a campaign level is built the same before and after building endless depths (${before})`, hash(G(`generateLevel(12, 777, 'normal')`)) === before && !G(`'alarms' in levelConfig(12, 'normal')`));
ok('no warnings while building', !warnings.length, warnings.slice(0, 3).join(' / '));

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
