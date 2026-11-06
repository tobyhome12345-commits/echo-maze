'use strict';
/**
 * (v23.0) GHOST RUNS' store, proved in Node (in every `node tools/check.js` run): js/ghosts.js on its own, with a
 * stand-in localStorage -
 *   - a path packs and unpacks to exactly the same whole-pixel moves (small ones one character, big ones escaped);
 *   - a recorded run plays back where it really was: at every sample to the pixel, in between within a step's walk,
 *     at the way out at the run's own time, then fading and gone;
 *   - only the fastest run is kept: a slower one, or the same time, leaves the ghost as it was;
 *   - one ghost per level per difficulty, apart for the bonus levels and My Levels; a renamed level keeps its ghost, a
 *     changed maze drops it (on save, and on play); a deleted level loses all of its ghosts; sweep keeps only levels
 *     that are there;
 *   - a run longer than 5 minutes is not kept; at most MAX_GHOSTS, the oldest kept going first;
 *   - storage off, full or damaged: nothing kept, nothing thrown;
 *   - roughly how big a ghost is (a 5-minute one must stay small).
 *
 *   node tools/ghosts-check.js [--quiet]
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

// a localStorage that can be emptied, switched off or filled up
const mem = new Map();
const ls = { mode: 'ok' };
const localStorage = {
  getItem(k) {
    if (ls.mode === 'off') throw new Error('SecurityError');
    return mem.has(k) ? mem.get(k) : null;
  },
  setItem(k, v) {
    if (ls.mode === 'off') throw new Error('SecurityError');
    if (ls.mode === 'full') throw new Error('QuotaExceededError');
    mem.set(k, String(v));
  },
  removeItem(k) {
    mem.delete(k);
  },
};
const ctx = { console, Math, JSON, Date, Map, Set, Float32Array, localStorage };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/levelformat.js', 'js/ghosts.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const G = vm.runInContext('EchoGhosts', ctx);
const KEY = G.GHOSTS_KEY;

const level = (id, o = {}) => ({
  id,
  title: o.title || 'A level',
  size: { w: 9, h: 7 },
  walls: o.walls || ['#########', '#.......#', '#.#####.#', '#.......#', '#.#####.#', '#.......#', '#########'],
  start: { x: 1, y: 1 },
  exits: [{ x: 7, y: 5, locked: false }],
  enemies: o.enemies || [],
  objects: [],
  difficulty: o.difficulty || { rating: 'normal', monsterSpeed: 1, rippleRange: 1, hearing: 1 },
});
/** A run walked at 170 px/s around a path of points, sampled at 60 frames a second (as the game does). */
function run(points, speed = 170) {
  const frames = [];
  let [x, y] = points[0];
  let t = 0;
  for (let i = 1; i < points.length; i++) {
    const [tx, ty] = points[i];
    for (;;) {
      const d = Math.hypot(tx - x, ty - y);
      const stepLen = speed / 60;
      t += 1 / 60;
      if (d <= stepLen) {
        x = tx;
        y = ty;
        frames.push([t, x, y]);
        break;
      }
      x += ((tx - x) / d) * stepLen;
      y += ((ty - y) / d) * stepLen;
      frames.push([t, x, y]);
    }
  }
  return frames;
}
function record(frames, x0, y0) {
  const rec = G.recorder(x0, y0);
  let last = [0, x0, y0];
  for (const f of frames) {
    G.sample(rec, f[0] - 1 / 60, last[1], last[2]); // (as updatePlay: the time and place at the end of the last frame)
    last = f;
  }
  return { rec, t: last[0], x: last[1], y: last[2] };
}
const PATH = [[60, 60], [300, 60], [300, 140], [60, 140], [60, 220], [300, 220]];

ok('Ghost is on by default (nothing stored)', G.enabled() === true);

// ---------------------------------------------------------------- packing
{
  const moves = [0, 0, 1, -1, 31, -31, 32, -32, 17, -17, 400, -9999, 5, 0];
  const back = G._.unpack(G._.pack(moves));
  ok('a path packs and unpacks to exactly the same moves (small ones one character, big ones escaped)', JSON.stringify(back) === JSON.stringify(moves), back);
  ok('a damaged path is refused, not misread', G._.unpack('AB?C') === null && G._.unpack('_12') === null && G._.unpack('ABC') === null);
  ok('a small move is one character', G._.pack([3, -3]).length === 2);
}

// ---------------------------------------------------------------- recording and playing back
{
  mem.clear();
  const L = level('lv1');
  const frames = run(PATH);
  const r = record(frames, 60, 60);
  const res = G.offer('mylevels', L, r.rec, r.t, r.x, r.y);
  ok(`the first finished run is kept as the ghost (${r.t.toFixed(2)} s)`, res.kept && !res.newBest && res.best === 0, res);
  const g = G.best('mylevels', L);
  const pb = G.playback(g);
  let worstSample = 0;
  let worstBetween = 0;
  for (const [t, x, y] of frames) {
    const p = G.at(pb, t);
    const err = Math.hypot(p.x - x, p.y - y);
    if (Math.abs(t / G.STEP - Math.round(t / G.STEP)) < 1e-6) worstSample = Math.max(worstSample, err);
    worstBetween = Math.max(worstBetween, err);
  }
  ok(`the ghost is where the run was: within ${worstBetween.toFixed(2)} px all the way (a sample is a frame behind at most: 170 px/s / 60 = 2.8 px, plus rounding)`, worstBetween <= 4, worstBetween);
  const end = G.at(pb, r.t);
  ok('at the run\'s own time it is at the way out, exactly where the run ended', Math.hypot(end.x - r.x, end.y - r.y) < 0.6 && end.a === 1, end);
  const fading = G.at(pb, r.t + G.FADE / 2);
  ok('then it fades at the way out, and is gone', fading && fading.a > 0.3 && fading.a < 0.7 && G.at(pb, r.t + G.FADE + 0.01) === null, fading);
  ok('before it starts: at the start', (() => { const p = G.at(pb, 0); return Math.hypot(p.x - 60, p.y - 60) < 0.6; })());
  // slower and equal runs
  const slow = record(run(PATH, 120), 60, 60);
  const r2 = G.offer('mylevels', L, slow.rec, slow.t, slow.x, slow.y);
  ok(`a slower run (${slow.t.toFixed(1)} s) never replaces the ghost`, !r2.kept && !r2.newBest && G.best('mylevels', L).t === g.t && r2.best === g.t, r2);
  const same = record(run(PATH), 60, 60);
  const r3 = G.offer('mylevels', L, same.rec, g.t / 1000, same.x, same.y);
  ok('the same time does not replace it either', !r3.kept && G.best('mylevels', L).at === g.at);
  const fast = record(run(PATH, 240), 60, 60);
  const r4 = G.offer('mylevels', L, fast.rec, fast.t, fast.x, fast.y);
  ok(`a faster run (${fast.t.toFixed(1)} s) does - "New best!", and how much was the best (${(r4.best / 1000).toFixed(1)} s)`, r4.kept && r4.newBest && r4.best === g.t && G.best('mylevels', L).t === Math.round(fast.t * 1000), r4);
  const size = mem.get(KEY).length;
  ok(`a ghost is small (${size} characters for ${fast.t.toFixed(1)} s)`, size < 600, size);
}

// ---------------------------------------------------------------- which level, which difficulty
{
  mem.clear();
  const walk = () => record(run(PATH), 60, 60);
  const keep = (src, L) => {
    const r = walk();
    return G.offer(src, L, r.rec, r.t, r.x, r.y).kept;
  };
  const N = level('lv2');
  const H = level('lv2', { difficulty: { rating: 'hard', monsterSpeed: 1, rippleRange: 1, hearing: 1 } });
  const C = level('lv2', { difficulty: { rating: 'custom', monsterSpeed: 1.3, rippleRange: 0.8, hearing: 1 } });
  keep('mylevels', N);
  keep('mylevels', H);
  keep('mylevels', C);
  ok('each difficulty has its own ghost (Normal, Hard and a Custom one, the same maze)', G.best('mylevels', N) && G.best('mylevels', H) && G.best('mylevels', C) && G._.read().length === 3 && new Set(G._.read().map((e) => e.m)).size === 3, G._.read().map((e) => e.m));
  const C2 = level('lv2', { difficulty: { rating: 'custom', monsterSpeed: 1.0, rippleRange: 0.8, hearing: 1 } });
  ok('...and a Custom difficulty with other scales is another difficulty (no ghost yet)', G.best('mylevels', C2) === null);
  ok('a bonus level and one of My Levels with the same id are apart', G.best('bonus', N) === null);
  ok('a renamed level keeps its ghost (only the maze counts)', !!G.best('mylevels', level('lv2', { title: 'Renamed' })));
  const changed = level('lv2', { walls: ['#########', '#.......#', '#.##.##.#', '#.......#', '#.#####.#', '#.......#', '#########'] });
  G.levelChanged('mylevels', changed);
  ok('a level saved with its maze changed loses its old ghosts - at every difficulty', G._.read().filter((e) => e.id === 'lv2').length === 0 && G.best('mylevels', N) === null);
  keep('mylevels', N);
  ok('...a ghost found stale when the level is played is dropped too', G.best('mylevels', changed) === null && G._.read().length === 0);
  ok('monsters are part of the maze: moving one is a changed level', G.hashOf(N) !== G.hashOf(level('lv2', { enemies: [{ type: 'echo', x: 3, y: 3 }] })));
  keep('mylevels', N);
  keep('mylevels', H);
  keep('mylevels', level('lv3'));
  keep('bonus', level('lv2'));
  G.forgetLevel('mylevels', 'lv2');
  ok('deleting a level deletes all of its ghosts (and nothing else\'s)', G._.read().filter((e) => e.s === 'mylevels' && e.id === 'lv2').length === 0 && !!G.best('mylevels', level('lv3')) && !!G.best('bonus', level('lv2')));
  keep('mylevels', level('lv4'));
  G.sweep('mylevels', ['lv4']);
  ok('sweep keeps only the levels that are there (a save code that replaced My Levels)', G._.read().filter((e) => e.s === 'mylevels').map((e) => e.id).join() === 'lv4' && !!G.best('bonus', level('lv2')));
}

// ---------------------------------------------------------------- the caps
{
  mem.clear();
  // a run over 5 minutes: walked back and forth
  const long = [];
  for (let i = 0; i < 60; i++) long.push(i % 2 ? [300, 60] : [60, 60]);
  long.push([60, 60]);
  const lr = record(run(long, 40), 60, 60);
  const res = G.offer('mylevels', level('long'), lr.rec, lr.t, lr.x, lr.y);
  ok(`a run longer than 5 minutes (${(lr.t / 60).toFixed(1)} min) is not kept`, lr.t > G.MAX_SECONDS && !res.kept && G._.read().length === 0, res);
  const near = [];
  for (let i = 0; i < 40; i++) near.push(i % 2 ? [300, 60] : [60, 60]);
  near.push([60, 60]);
  const nr = record(run(near, 34), 60, 60);
  const res2 = G.offer('mylevels', level('near'), nr.rec, nr.t, nr.x, nr.y);
  const sz = mem.get(KEY) ? mem.get(KEY).length : 0;
  ok(`one just under 5 minutes (${(nr.t / 60).toFixed(1)} min) is kept - and stays small (${sz} characters)`, nr.t < G.MAX_SECONDS && res2.kept && sz < 8000, { t: nr.t, res2, sz });
  mem.clear();
  let clock = 1e12;
  const realNow = Date.now;
  ctx.Date.now = () => ++clock;
  for (let i = 0; i < G.MAX_GHOSTS + 5; i++) {
    const r = record(run(PATH), 60, 60);
    G.offer('mylevels', level(`cap${i}`), r.rec, r.t, r.x, r.y);
  }
  ctx.Date.now = realNow;
  const ids = G._.read().map((e) => e.id);
  ok(`at most ${G.MAX_GHOSTS} ghosts in all - the oldest kept went first (cap0-cap4 gone)`, ids.length === G.MAX_GHOSTS && !ids.includes('cap0') && !ids.includes('cap4') && ids.includes('cap5') && ids.includes(`cap${G.MAX_GHOSTS + 4}`), ids.slice(0, 6));
}

// ---------------------------------------------------------------- storage off, full, damaged
{
  mem.clear();
  const L = level('st');
  const r = record(run(PATH), 60, 60);
  let threw = false;
  let res;
  try {
    ls.mode = 'full';
    res = G.offer('mylevels', L, r.rec, r.t, r.x, r.y);
    ls.mode = 'off';
    G.offer('mylevels', L, r.rec, r.t, r.x, r.y);
    G.best('mylevels', L);
    G.forgetLevel('mylevels', 'st');
    G.levelChanged('mylevels', L);
    G.sweep('mylevels', []);
    G.setEnabled(false);
    G.enabled();
  } catch (e) {
    threw = e;
  }
  ls.mode = 'ok';
  ok('storage full or off: nothing kept, nothing thrown, no "New best!"', !threw && res && !res.kept && !res.newBest && !mem.has(KEY), threw ? String(threw) : res);
  for (const junk of ['{', '[]', '{"ghosts":5}', '{"ghosts":[{"s":"x"},null,7,{"s":"mylevels","id":"st","h":"zz","m":"normal","t":1,"at":1,"x":0,"y":0,"d":"A"}]}']) {
    mem.set(KEY, junk);
    let ok2 = true;
    try {
      ok2 = G.best('mylevels', L) === null;
    } catch (e) {
      ok2 = false;
    }
    ok(`damaged storage (${junk.slice(0, 24)}...) is read as no ghost`, ok2);
  }
  mem.set(KEY, JSON.stringify({ schemaVersion: 1, ghosts: [{ s: 'mylevels', id: 'st', h: G.hashOf(L), m: 'normal', t: 5000, at: 1, x: 60, y: 60, d: 'AB?C' }] }));
  ok('a ghost whose path is damaged plays back as nothing', G.playback(G.best('mylevels', L)) === null);
}

// ---------------------------------------------------------------- the switch
{
  mem.clear();
  G.setEnabled(false);
  ok('...and off when switched off, kept', G.enabled() === false && mem.get(G.GHOST_KEY) === '0');
  G.setEnabled(true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
