'use strict';
/**
 * (v22.2) ENDLESS TWISTS, proved in Node (in every `node tools/check.js` run): runs of depths 1-60 on every difficulty,
 * with Twists on and off -
 *   - every depth builds and passes Endless's fairness rules (endlessCheck), and every twist level is fair WITH its
 *     twists (EchoTwists.check: solvable through crumbling floor and ahead of the creep, with real slack);
 *   - the schedule is exactly SCHEDULE, the same on every run and every difficulty, and nothing after depth 50;
 *   - each twist really is laid down (ghost and hidden walls, dead air, crumbling floor, the creep's rings, the slowed
 *     and late ripple) - and nothing of it is under the start;
 *   - every depth WITHOUT a twist is the very same maze with Twists on as with Twists off, and Twists off is what
 *     generateEndless always built (its own fields untouched).
 *
 *   node tools/twists-check.js [--quiet]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const quiet = process.argv.includes('--quiet');
const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
const ok = (name, pass, info) => {
  if (pass) passed++;
  else failed++;
  if (!pass || !quiet) console.log(`${pass ? 'ok     ' : 'FAILED '} ${name}${!pass && info !== undefined ? `  - ${typeof info === 'string' ? info : JSON.stringify(info).slice(0, 500)}` : ''}`);
};

const ctx = { console, Math, JSON, Map, Set, Uint8Array, Int32Array, Float32Array, Int8Array, BigInt, localStorage: { getItem: () => null, setItem() {} } };
ctx.window = ctx;
ctx.document = { documentElement: { style: { setProperty() {} }, dataset: {} }, querySelectorAll: () => [], getElementById: () => null };
vm.createContext(ctx);
for (const f of ['js/profile.js', 'js/palette.js', 'js/level.js', 'js/tutorial.js', 'js/warden.js', 'js/story.js', 'js/twists.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const G = (e) => vm.runInContext(e, ctx);
const T = G('EchoTwists');
const TILE = G('TILE');
const MODES = ['easy', 'normal', 'hard', 'hardcore'];
const RUNS = [101, 2024, 77777, 31337, 9001, 424242];
const DEPTHS = 60;

/** The maze itself: walls, start, exit, every monster - its fingerprint. */
function mazeHash(lv) {
  let h = 2166136261;
  const add = (v) => {
    h ^= v & 0xffffffff;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (let i = 0; i < lv.walls.length; i++) add(lv.walls[i] * (i + 1));
  add(lv.start.x);
  add(lv.start.y);
  add(lv.exit.x);
  add(lv.exit.y);
  for (const m of lv.enemies) {
    add(m.tx);
    add(m.ty);
    add(m.kind.length);
  }
  return h;
}

const schedule = {};
const problems = [];
const unfair = [];
const offDiff = [];
const notLaid = [];
const late = [];
let twistLevels = 0;
const spares = [];
const attempts = {};
for (const mode of MODES) {
  for (const run of RUNS) {
    for (let d = 1; d <= DEPTHS; d++) {
      const on = G(`generateEndless(${run}, ${d}, '${mode}', { alarm: true, twists: true })`);
      const off = G(`generateEndless(${run}, ${d}, '${mode}', { alarm: true })`);
      if (!on.endless.ok) problems.push(`${mode} run ${run} depth ${d}: ${on.endless.why}`);
      if (!off.endless.ok) problems.push(`${mode} run ${run} depth ${d} (off): ${off.endless.why}`);
      const want = T.at(d);
      const got = on.twist ? on.twist.kinds.join('+') : '';
      const key = `${d}`;
      if (got) (schedule[key] = schedule[key] || new Set()).add(got);
      if ((want ? want.join('+') : '') !== got) late.push(`${mode} run ${run} depth ${d}: got "${got}", the schedule says "${want ? want.join('+') : ''}"`);
      if (off.twist || off.act2) offDiff.push(`${mode} run ${run} depth ${d}: Twists off has a twist`);
      if (!want && mazeHash(on) !== mazeHash(off)) offDiff.push(`${mode} run ${run} depth ${d}: not the same maze`);
      if (!want && (on.act2 || on.rippleScale || on.rayWalls)) offDiff.push(`${mode} run ${run} depth ${d}: something of a twist without one`);
      if (on.twist) {
        twistLevels++;
        attempts[on.endless.attempt] = (attempts[on.endless.attempt] || 0) + 1;
        const c = T.check(on);
        if (!c.ok) unfair.push(`${mode} run ${run} depth ${d}: ${c.why}`);
        if (Number.isFinite(c.spare)) spares.push(c.spare);
        const a2 = on.act2;
        const k = on.twist.kinds;
        const s = Math.floor(on.start.y / TILE) * on.W + Math.floor(on.start.x / TILE);
        if (k.includes('late') && !(on.rippleScale > 0 && on.rippleLag > 0)) notLaid.push(`${d} late`);
        if (k.includes('liar') && !(a2.ghosts.length >= 2 && a2.hidden.length >= 2 && on.rayWalls)) notLaid.push(`${d} liar`);
        if (k.includes('liar') && a2.ghosts.some((g) => on.walls[g.i] || on.blocked[g.i])) notLaid.push(`${d} a ghost wall that is really there`);
        if (k.includes('liar') && a2.hidden.some((h) => !on.walls[h.i])) notLaid.push(`${d} a hidden wall that is not there`);
        if (k.includes('dead') && !(a2.dead && a2.dead.some((v) => v))) notLaid.push(`${d} dead`);
        if (k.includes('crumble') && a2.crumbles.length < 6) notLaid.push(`${d} crumble (${a2.crumbles.length})`);
        if (k.includes('creep') && !(a2.creep && a2.creep.layers.length >= 3 && a2.creep.layers.some((L) => L.tiles.length))) notLaid.push(`${d} creep`);
        if (a2.crumbles.some((c2) => c2.i === s) || a2.voidGrid[s] || (a2.dead && a2.dead[s])) notLaid.push(`${d} something under the start`);
      }
    }
  }
}
const n = MODES.length * RUNS.length * DEPTHS;
ok(`every depth 1-${DEPTHS} builds fairly, Twists on and off (${n} each, ${MODES.length} difficulties x ${RUNS.length} runs)`, problems.length === 0, problems.slice(0, 5));
ok(`the twists are exactly the schedule, at depths ${Object.keys(T.SCHEDULE).join(', ')} - none after ${T.LAST}`, late.length === 0, late.slice(0, 5));
ok('the same twist at the same depth on every run and every difficulty', Object.values(schedule).every((v) => v.size === 1) && Object.keys(schedule).length === Object.keys(T.SCHEDULE).length, Object.fromEntries(Object.entries(schedule).map(([k, v]) => [k, [...v]])));
ok(`every twist level fair WITH its twists (${twistLevels}): solvable through crumbling floor, ahead of the creep`, unfair.length === 0, unfair.slice(0, 5));
ok('every twist really laid down, and nothing of it under the start', notLaid.length === 0, notLaid.slice(0, 6));
const minSpare = spares.length ? Math.min(...spares) : Infinity;
ok(`the creep always leaves real slack (the least: ${Math.round(minSpare * 100)}% slower would still get out; at least ${Math.round(T.CREEP.minSpare * 100)}%)`, minSpare >= T.CREEP.minSpare, minSpare);
ok('every depth without a twist is the very same maze with Twists on as off, and Twists off never has one', offDiff.length === 0, offDiff.slice(0, 5));
if (!quiet) console.log(`twist levels by the attempt they needed: ${JSON.stringify(attempts)}`);

// Twists off is what generateEndless always built: the same fields, and the same mazes (by a recorded fingerprint of
// v22.1's output for these runs - a change to Endless with Twists off has to change this number on purpose)
{
  let h = 2166136261;
  for (const mode of MODES) for (const run of RUNS.slice(0, 3)) for (let d = 1; d <= DEPTHS; d++) {
    const lv = G(`generateEndless(${run}, ${d}, '${mode}', { alarm: true })`);
    h ^= mazeHash(lv);
    h = Math.imul(h, 16777619) >>> 0;
    h ^= lv.endless.attempt;
    h = Math.imul(h, 16777619) >>> 0;
  }
  const want = '804295ea'; // (v22.1's own output for these runs, computed on its committed js/level.js and js/story.js)
  const got = h.toString(16);
  ok(`Endless with Twists off unchanged (fingerprint ${got}, v22.1's ${want})`, got === want, { got, want });
  if (!quiet) console.log(`twists-off fingerprint: ${got}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
