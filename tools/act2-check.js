/*
 * tools/act2-check.js (v17.0, v18.0) - can Act 2's levels (17-24) be finished? Builds each one with the game's own code
 * (js/story.js, in Node - no browser needed), searches from the start to the way out THROUGH that level's broken rule
 * (EchoStory.solve: ghost and hidden walls on 17, every sliding wall's state on 18, the folds on 19; v18.0: the
 * crumbling floor on 21 - every state of which tiles are gone, so it also finds the places you can get STUCK - and
 * on 23 the void's schedule, in time), checks that the rule really is needed where it should be, and prints the map
 * with the way through drawn on it. Level 24 is checked as its two parts.
 *
 *   node tools/act2-check.js            every level; exit code 1 (and FAILED lines) if anything is wrong
 *   node tools/act2-check.js 18         one level (24: both parts)
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

/**
 * A Warden that breaks out of the stone (20, and 24's second part): its head start along the path, and that it only
 * ever comes from BEHIND - to every tile of the way through, its shortest way is the way you came.
 */
function wardenChecks(tag, n, part, L, sol, spec) {
  const W = L.W;
  const h = L.enemies.find((e) => e.kind === 'warden');
  ok(`${tag}: a Warden of level 15's kind, and no upgraded one`, !!h && h.variant === 'regular' && !L.enemies.some((e) => e.variant === 'upgraded'));
  if (!h) return;
  const wSpeed = vm.runInContext('WARDEN_SPEED', ctx);
  const dW = vm.runInContext(`(() => { const L = generateLevel(${n}, 1, 'normal', ${part}); return Array.from(bfsDist(L.blocked, L.W, L.H, ${Math.floor(h.y / 40) * W + Math.floor(h.x / 40)})); })()`, ctx);
  const steps = sol.route.filter((r) => !r.ping).map((r) => r.tile);
  let slack = Infinity;
  steps.forEach((t, k) => {
    if (dW[t] >= 0) slack = Math.min(slack, spec.wake + (dW[t] * 40) / (wSpeed * 170) - (0.7 + (k * 40) / 170));
  });
  ok(`${tag}: the Warden wakes ${spec.wake} s in at level 15's speed, and a clean run stays ${slack.toFixed(1)} s ahead of it at the closest (3 s at least)`, spec.wake > 0 && slack >= 3);
  const t0 = steps[0];
  const ahead = steps.filter((t, k) => dW[t] !== dW[t0] + k).length;
  ok(`${tag}: the Warden only ever reaches you along the way you came (${ahead} tiles of the way through it could reach first by another way)`, ahead === 0);
}

const levels = [[17, 1], [18, 1], [19, 1], [20, 1], [21, 1], [22, 1], [23, 1], [24, 1], [24, 2]].filter(([n]) => !only.length || only.includes(n));
for (const [n, part] of levels) {
  warnings.length = 0;
  const L = vm.runInContext(`generateLevel(${n}, 12345, 'normal', ${part})`, ctx);
  const spec = L.story.spec; // (24's second part: its own map and Warden, over the level's settings)
  const tag = part === 2 ? `${n} part 2` : `${n}`;
  const W = L.W;
  const a2 = L.act2;
  ok(`level ${tag} (${spec.kind}): built with no warnings`, !warnings.length, warnings.join(' / '));
  ok(`level ${tag}: every row ${W} tiles`, spec.map.every((r) => r.length === W), spec.map.map((r, y) => (r.length !== W ? `row ${y}: ${r.length}` : '')).filter(Boolean).join(', '));
  ok(`level ${tag}: hand-built (no random numbers: two seeds and two modes give the same map)`, JSON.stringify(Array.from(L.walls)) === JSON.stringify(Array.from(vm.runInContext(`generateLevel(${n}, 999, 'hard', ${part}).walls`, ctx))));
  const sol = vm.runInContext(`EchoStory.solve(generateLevel(${n}, 12345, 'normal', ${part}))`, ctx);
  ok(`level ${tag}: can be finished (${sol.ok ? `${sol.steps} steps${sol.pings ? `, ${sol.pings} pings` : ''}` : sol.why})`, sol.ok);
  if (!sol.ok) continue;
  const tiles = sol.route.map((r) => r.tile);
  const walk = sol.steps * (40 / 170);
  ok(`level ${tag}: a sensible length (${sol.steps} tiles, ${walk.toFixed(0)} s of pure walking - 40-90 s an attempt with the pinging and the listening)`, sol.steps >= 25 && sol.steps <= 110);

  // the broken rule is really needed
  const plain = vm.runInContext(`(() => { const L = generateLevel(${n}, 12345, 'normal', ${part}); const s = Math.floor(L.start.y / 40) * L.W + Math.floor(L.start.x / 40); const e = Math.floor(L.exit.y / 40) * L.W + Math.floor(L.exit.x / 40); return bfsDist(L.blocked, L.W, L.H, s)[e]; })()`, ctx);
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
    wardenChecks('20', n, part, L, sol, spec);
  }
  // ============================================================== (v18.0) ACT 2 PART 2
  const kinds = L.enemies.map((e) => e.kind).join(',');
  if (spec.kind === 'crumble') {
    const onWay = a2.crumbles.filter((c) => tiles.includes(c.i)).length;
    ok(`21: crumbling floor (${a2.crumbles.length} tiles, ${onWay} of them on the way through)`, a2.crumbles.length >= 10 && onWay >= 6);
    ok(`21: a player who rushes can get stuck - places the way out can no longer be reached from (${sol.stuck} of ${sol.states})`, sol.stuck > 0);
    const first = tiles.findIndex((t) => a2.crumbles.some((c) => c.i === t));
    ok(`21: it teaches first - crumbling floor ${first} steps from the start`, first >= 1 && first <= 4);
    ok(`21: one echo monster (${kinds})`, kinds === 'echo');
  }
  if (spec.kind === 'deadair') {
    const dead = Array.from(a2.dead || []);
    const zones = new Set();
    tiles.forEach((t) => dead[t] && zones.add(t));
    const al = L.enemies.find((e) => e.kind === 'alarm');
    ok(`22: dead air (${dead.filter(Boolean).length} tiles; ${zones.size} of them on the way through)`, zones.size >= 4);
    ok(`22: an Alarm, and something for it to call (${kinds})`, !!al && L.enemies.some((e) => e.kind === 'echo'));
    if (al) {
      const R0 = vm.runInContext("levelConfig(22, 'normal').rippleRadius", ctx);
      const los = (i) => vm.runInContext(`(() => { const L = generateLevel(22, 1, 'normal', 1); const W = L.W; const x0 = ((${i} % W) + 0.5) * 40, y0 = (Math.floor(${i} / W) + 0.5) * 40; const x1 = ${al.x}, y1 = ${al.y}; const d = Math.hypot(x1 - x0, y1 - y0); for (let s = 0; s < d; s += 4) { const x = x0 + (x1 - x0) * s / d, y = y0 + (y1 - y0) * s / d; if (L.walls[Math.floor(y / 40) * W + Math.floor(x / 40)]) return false; } return d <= ${R0}; })()`, ctx);
      const exposed = tiles.filter((t) => !dead[t] && los(t));
      const hides = tiles.filter((t) => dead[t] && los(t));
      ok(`22: avoiding it is the puzzle - ${exposed.length} tiles of the way through are in its reach, and ${hides.length} tiles of dead air in its reach to hide in`, exposed.length >= 4 && hides.length >= 2);
      ok('22: the Alarm is off the way through', !tiles.includes(Math.floor(al.y / 40) * W + Math.floor(al.x / 40)));
    }
  }
  if (spec.kind === 'creep') {
    ok(`23: the void comes in from the edges - ${a2.creep.layers.length} rings, the first at ${a2.creep.layers[0].t} s, then every ${a2.creep.layers[1].t - a2.creep.layers[0].t} s (Normal)`, a2.creep.layers.length >= 4);
    ok(`23: a clean walk has ${(sol.spare * 100).toFixed(0)}% time to spare on Normal (at least 30%; this level aims for 100%: an average player at half the speed still gets out)`, sol.spare >= 1.0);
    const easy = vm.runInContext("EchoStory.solve(generateLevel(23, 1, 'easy'))", ctx);
    const hc = vm.runInContext("generateLevel(23, 1, 'hardcore').act2.creep.layers.map((l) => l.t).join()", ctx);
    ok(`23: Easy is slower (${(easy.spare * 100).toFixed(0)}% to spare); Hardcore's schedule is Normal's`, easy.ok && easy.spare > sol.spare && hc === a2.creep.layers.map((l) => l.t).join());
    const ex = Math.floor(L.exit.y / 40) * W + Math.floor(L.exit.x / 40);
    ok('23: the way out is in the middle, where the void never gets', a2.creep.voidAt[ex] === Infinity);
    ok(`23: one or two hunters (${kinds})`, L.enemies.length >= 1 && L.enemies.length <= 2 && !L.enemies.some((e) => e.kind === 'warden'));
    const doomed = L.enemies.filter((e) => a2.creep.voidAt[Math.floor(e.y / 40) * W + Math.floor(e.x / 40)] !== Infinity).length;
    ok(`23: the hunters stand where the void will come (${doomed} of ${L.enemies.length})`, doomed === L.enemies.length);
  }
  if (spec.kind === 'wrong' && part === 1) {
    ok(`24 part 1: an ordinary maze with one or two hunters (${kinds})`, L.enemies.length >= 1 && L.enemies.length <= 2 && !L.enemies.some((e) => e.kind === 'warden'));
  }
  if (spec.kind === 'wrong' && part === 2) {
    const P1 = vm.runInContext("generateLevel(24, 1, 'normal', 1)", ctx);
    const d1 = P1.exit.x - P1.start.x;
    const d2 = L.exit.x - L.start.x;
    ok(`24 part 2: its way out is the other way from the first part's (${d1 > 0 ? 'east' : 'west'}, then ${d2 > 0 ? 'east' : 'west'})`, Math.sign(d1) === -Math.sign(d2) && d2 !== 0);
    ok(`24 part 2: smaller than the first part, and half eaten (${L.W}x${L.H} against ${P1.W}x${P1.H}; ${Array.from(a2.voidGrid).filter(Boolean).length} tiles of void)`, L.W * L.H < P1.W * P1.H && Array.from(a2.voidGrid).filter(Boolean).length >= 20);
    ok(`24 part 2: only the Warden (${kinds})`, kinds === 'warden');
    wardenChecks('24 part 2', n, part, L, sol, spec);
  }
  // every monster on a floor tile the player can reach (no one stuck in stone)
  const sIdx = Math.floor(L.start.y / 40) * W + Math.floor(L.start.x / 40);
  // (21: walking over crumbling floor - it is there until you have crossed it)
  const reach = vm.runInContext(`(() => { const L = generateLevel(${n}, 1, 'normal', ${part}); const B = L.blocked.slice(); for (const c of (L.act2 && L.act2.crumbles) || []) B[c.i] = 0; return Array.from(bfsDist(B, L.W, L.H, ${sIdx})); })()`, ctx);
  for (const e of L.enemies) {
    const i = Math.floor(e.y / 40) * W + Math.floor(e.x / 40);
    ok(`level ${tag}: the ${e.kind} stands on open floor${spec.kind === 'shuffle' || spec.kind === 'loop' ? '' : ' you can reach'}`, !L.blocked[i] && (spec.kind === 'shuffle' || spec.kind === 'loop' || reach[i] >= 0));
    if (e.kind === 'warden') continue; // (20: it is in the stone behind you on purpose - its head start is measured above)
    ok(`level ${tag}: the ${e.kind} starts well away from you (${reach[i] < 0 ? 'not by walking' : reach[i] + ' tiles'})`, reach[i] < 0 || reach[i] >= 10);
  }

  if (!QUIET) {
    const on = new Set(tiles);
    const pingAt = new Set(sol.route.filter((r) => r.ping).map((r) => r.tile));
    console.log(`\n  level ${tag} - the way through (* a step, ! a ping):`);
    for (let y = 0; y < L.H; y++) {
      let row = '  ';
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const ch = spec.map[y][x];
        row += pingAt.has(i) ? '!' : on.has(i) && '.gB1234cz'.includes(ch) ? '*' : ch;
      }
      console.log(row);
    }
    console.log('');
  }
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
