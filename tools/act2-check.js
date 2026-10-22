/*
 * tools/act2-check.js (v17.0) - can Act 2's levels (17-20) be finished? Builds each one with the game's own code
 * (js/story.js, in Node - no browser needed), searches from the start to the way out THROUGH that level's broken rule
 * (EchoStory.solve: ghost and hidden walls on 17, every sliding wall's state on 18, the folds on 19), checks that the
 * rule really is needed where it should be, and prints the map with the way through drawn on it.
 *
 *   node tools/act2-check.js            every level; exit code 1 (and FAILED lines) if anything is wrong
 *   node tools/act2-check.js 18         one level
 *   node tools/act2-check.js --quiet    no maps
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);

const warnings = [];
const store = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], key: () => null, length: 0 };
const el = { style: { setProperty() {} }, dataset: {}, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} } };
const ctx = {
  console: { log() {}, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push(a.join(' ')) },
  Math,
  Date,
  JSON,
  localStorage,
  document: { documentElement: el, querySelectorAll: () => [], getElementById: () => null },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/profile.js', 'js/palette.js', 'js/level.js', 'js/tutorial.js', 'js/warden.js', 'js/story.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });

const results = [];
const ok = (name, pass, info) => {
  results.push(pass);
  console.log(`${pass ? 'ok     ' : 'FAILED '} ${name}${info ? '  - ' + info : ''}`);
};

const levels = [17, 18, 19, 20].filter((n) => !only.length || only.includes(n));
for (const n of levels) {
  warnings.length = 0;
  const L = vm.runInContext(`generateLevel(${n}, 12345, 'normal')`, ctx);
  const spec = vm.runInContext(`EchoStory.LEVELS[${n}]`, ctx);
  const W = L.W;
  const a2 = L.act2;
  ok(`level ${n} (${spec.kind}): built with no warnings`, !warnings.length, warnings.join(' / '));
  ok(`level ${n}: every row ${W} tiles`, spec.map.every((r) => r.length === W), spec.map.map((r, y) => (r.length !== W ? `row ${y}: ${r.length}` : '')).filter(Boolean).join(', '));
  ok(`level ${n}: hand-built (no random numbers: two seeds and two modes give the same map)`, JSON.stringify(Array.from(L.walls)) === JSON.stringify(Array.from(vm.runInContext(`generateLevel(${n}, 999, 'hard').walls`, ctx))));
  const sol = vm.runInContext(`EchoStory.solve(generateLevel(${n}, 12345, 'normal'))`, ctx);
  ok(`level ${n}: can be finished (${sol.ok ? `${sol.steps} steps${sol.pings ? `, ${sol.pings} pings` : ''}` : sol.why})`, sol.ok);
  if (!sol.ok) continue;
  const tiles = sol.route.map((r) => r.tile);
  const walk = sol.steps * (40 / 170);
  ok(`level ${n}: a sensible length (${sol.steps} tiles, ${walk.toFixed(0)} s of pure walking - 40-90 s an attempt with the pinging and the listening)`, sol.steps >= 25 && sol.steps <= 110);

  // the broken rule is really needed
  const plain = vm.runInContext(`(() => { const L = generateLevel(${n}, 12345, 'normal'); const s = Math.floor(L.start.y / 40) * L.W + Math.floor(L.start.x / 40); const e = Math.floor(L.exit.y / 40) * L.W + Math.floor(L.exit.x / 40); return bfsDist(L.blocked, L.W, L.H, s)[e]; })()`, ctx);
  if (spec.kind === 'liar') {
    const ghostsOnWay = a2.ghosts.filter((g) => tiles.includes(g.i)).length;
    ok(`17: the way through goes through ghost walls (${ghostsOnWay})`, ghostsOnWay >= 2);
    ok(`17: there are hidden walls (${a2.hidden.length}) - stone the ripple never draws`, a2.hidden.length >= 2);
    // the teaching: within the first few steps, a ghost wall and then a hidden one
    const sx = Math.floor(L.start.x / 40);
    const sy = Math.floor(L.start.y / 40);
    const g0 = a2.ghosts.find((g) => g.ty === sy && g.tx > sx && g.tx - sx <= 5);
    const h0 = a2.hidden.find((h) => h.ty === sy && g0 && h.tx > g0.tx && h.tx - g0.tx <= 5);
    ok('17: it teaches first - a ghost wall a few steps from the start, then a hidden one just past it', !!g0 && !!h0, JSON.stringify({ g0, h0 }));
    const monsters = L.enemies.map((e) => e.kind).join(',');
    ok(`17: one echo monster (${monsters})`, monsters === 'echo');
  }
  if (spec.kind === 'shuffle') {
    ok(`18: the sliding walls must be moved (${sol.pings} pings on the way; without moving any: ${plain < 0 ? 'no way through' : plain + ' tiles'})`, sol.pings >= 2 && plain < 0);
    ok(`18: ${a2.slides.length} sliding walls, every one with its B beside it`, a2.slides.length >= 3 && a2.slides.every((s) => s.b !== undefined));
    ok(`18: one or two hunters, a stalker among them (${L.enemies.map((e) => e.kind).join(',')})`, L.enemies.length >= 1 && L.enemies.length <= 2 && L.enemies.some((e) => e.kind === 'stalker'));
  }
  if (spec.kind === 'loop') {
    const used = a2.folds.filter((f) => tiles.includes(f.a) || tiles.includes(f.b)).length;
    ok(`19: ${a2.folds.length} folds, in pairs`, a2.folds.length >= 2);
    const s = Math.floor(L.start.y / 40) * W + Math.floor(L.start.x / 40);
    const dS = vm.runInContext(`(() => { const L = generateLevel(19, 1, 'normal'); return Array.from(bfsDist(L.blocked, L.W, L.H, ${s})); })()`, ctx);
    const back = a2.folds.some((f) => (dS[f.a] >= 0 && dS[f.a] <= 6) || (dS[f.b] >= 0 && dS[f.b] <= 6));
    ok('19: a fold brings you back near the start (within 6 tiles of it)', back);
    ok(`19: the way out uses a fold (${used})`, used >= 1 && plain < 0, `without folds: ${plain < 0 ? 'no way' : plain + ' tiles'}`);
    const drips = L.story.drips.length;
    ok(`19: one drip to find your way by (${drips})`, drips === 1);
    ok(`19: one hunter (${L.enemies.map((e) => e.kind).join(',')})`, L.enemies.length === 1);
  }
  if (spec.kind === 'behind') {
    ok(`20: ripples slowed (x${L.rippleScale}) and late (${L.rippleLag} s)`, L.rippleScale > 0 && L.rippleScale < 1 && L.rippleLag > 0);
    ok(`20: two hunters, and no upgraded Warden (${L.enemies.map((e) => e.kind + (e.variant ? ':' + e.variant : '')).join(',')})`, L.enemies.length === 2 && !L.enemies.some((e) => e.variant === 'upgraded'));
    // the Warden's head start, along the path: it breaks out `wake` s in (you can move from 0.7 s) and walks at
    // WARDEN_SPEED x yours; for every tile of the way through, how much later than a clean run it could get there
    const h = L.enemies.find((e) => e.kind === 'warden');
    if (h) {
      const wSpeed = vm.runInContext('WARDEN_SPEED', ctx);
      const dW = vm.runInContext(`(() => { const L = generateLevel(20, 1, 'normal'); return Array.from(bfsDist(L.blocked, L.W, L.H, ${Math.floor(h.y / 40) * W + Math.floor(h.x / 40)})); })()`, ctx);
      const steps = sol.route.filter((r) => !r.ping).map((r) => r.tile);
      let slack = Infinity;
      steps.forEach((t, k) => {
        if (dW[t] >= 0) slack = Math.min(slack, spec.wake + (dW[t] * 40) / (wSpeed * 170) - (0.7 + (k * 40) / 170));
      });
      ok(`20: the Warden wakes ${spec.wake} s in at level 15's speed, and a clean run stays ${slack.toFixed(1)} s ahead of it at the closest (3 s at least)`, h.variant === 'regular' && spec.wake > 0 && slack >= 3);
      // ...and it comes from BEHIND: to every tile of the way through, its shortest way is the way you came (so
      // stopping to listen lets it catch up, never meets it head on)
      const t0 = steps[0];
      const ahead = steps.filter((t, k) => dW[t] !== dW[t0] + k).length;
      ok(`20: the Warden only ever reaches you along the way you came (${ahead} tiles of the way through it could reach first by another way)`, ahead === 0);
    }
  }
  // every monster on a floor tile the player can reach (no one stuck in stone)
  const sIdx = Math.floor(L.start.y / 40) * W + Math.floor(L.start.x / 40);
  const reach = vm.runInContext(`(() => { const L = generateLevel(${n}, 1, 'normal'); return Array.from(bfsDist(L.blocked, L.W, L.H, ${sIdx})); })()`, ctx);
  for (const e of L.enemies) {
    const i = Math.floor(e.y / 40) * W + Math.floor(e.x / 40);
    ok(`level ${n}: the ${e.kind} stands on open floor${spec.kind === 'shuffle' || spec.kind === 'loop' ? '' : ' you can reach'}`, !L.blocked[i] && (spec.kind === 'shuffle' || spec.kind === 'loop' || reach[i] >= 0));
    if (e.kind === 'warden') continue; // (20: it is in the stone behind you on purpose - its head start is measured above)
    ok(`level ${n}: the ${e.kind} starts well away from you (${reach[i] < 0 ? 'not by walking' : reach[i] + ' tiles'})`, reach[i] < 0 || reach[i] >= 10);
  }

  if (!QUIET) {
    const on = new Set(tiles);
    const pingAt = new Set(sol.route.filter((r) => r.ping).map((r) => r.tile));
    console.log(`\n  level ${n} - the way through (* a step, ! a ping):`);
    for (let y = 0; y < L.H; y++) {
      let row = '  ';
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const ch = spec.map[y][x];
        row += pingAt.has(i) ? '!' : on.has(i) && '.gB1234'.includes(ch) ? '*' : ch;
      }
      console.log(row);
    }
    console.log('');
  }
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
