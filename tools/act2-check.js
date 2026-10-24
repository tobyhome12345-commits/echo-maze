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

const levels = [[17, 1], [18, 1], [19, 1], [20, 1], [21, 1], [22, 1], [23, 1], [24, 1], [24, 2], [25, 1]].filter(([n]) => !only.length || only.includes(n));
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
  // ============================================================== (v18.2) 25: THE LIGHT
  if (spec.kind === 'outside') {
    const tau = 40 / 170; // s a tile, at your walking speed
    const steps = sol.route.map((r) => r.tile);
    const kTrip = steps.findIndex((t) => ((t % W) + 0.5) * 40 >= spec.tripX);
    const tRelease = 0.7 + kTrip * tau; // a clean run reaches the trip point then
    const h = L.enemies.find((e) => e.kind === 'warden');
    ok(`25: level 16's Warden (upgraded, ${vm.runInContext('WARDEN_UPGRADED_SPEED', ctx)} x your speed) and nothing else (${kinds})`, kinds === 'warden' && h.variant === 'upgraded');
    const tw = 40 / (vm.runInContext('WARDEN_UPGRADED_SPEED', ctx) * 170);
    const hIdx = Math.floor(h.y / 40) * W + Math.floor(h.x / 40);
    const dW = vm.runInContext(`(() => { const L = generateLevel(25, 1, 'normal', 1); const B = L.blocked.slice(); for (const s of L.story.seals) B[s.ty * L.W + s.tx] = 0; return Array.from(bfsDist(B, L.W, L.H, ${hIdx})); })()`, ctx);
    let slack = Infinity;
    for (let k = kTrip; k < steps.length; k++) slack = Math.min(slack, tRelease + spec.wake + dW[steps[k]] * tw - (0.7 + k * tau));
    ok(`25: the trip point is on the way, after the long arrival (${kTrip} steps in: ${(kTrip * tau).toFixed(1)} s of clean walking)`, kTrip >= 15);
    ok(`25: a clean run stays ${slack.toFixed(1)} s ahead of it all the way to the light (at least 1.5 s)`, slack >= 1.5);
    const run = (steps.length - kTrip) * tau;
    ok(`25: the run, release to light: ${run.toFixed(1)} s of clean walking (25-40 s for a player who pings and turns)`, run >= 12 && run <= 30);
    // the floor behind: it never catches a player who keeps moving, and never the Warden
    const cr = a2.creep;
    let cl = Infinity;
    steps.forEach((t, k) => {
      const d = cr.dist[t];
      if (k < kTrip || d < 0 || d >= cr.layers.length) return;
      cl = Math.min(cl, tRelease + cr.layers[d].t - (0.7 + (k + 1) * tau));
    });
    ok(`25: the floor behind you never catches a player who keeps moving (${cl.toFixed(1)} s to spare at the closest)`, cl > 1);
    const every = cr.layers[1].t - cr.layers[0].t;
    const sIdx0 = Math.floor(L.start.y / 40) * W + Math.floor(L.start.x / 40);
    const wardenPastStart = spec.wake + (dW[sIdx0] + 3) * tw;
    ok(`25: ...and never the Warden: it starts ${cr.layers[0].t} s after the release (the Warden is past the start at ${wardenPastStart.toFixed(1)} s), one tile every ${every.toFixed(2)} s (it walks one every ${tw.toFixed(2)} s)`, every > tw && cr.layers[0].t > wardenPastStart);
    const ex = Math.floor(L.exit.y / 40) * W + Math.floor(L.exit.x / 40);
    ok(`25: the floor stops going ${spec.collapse.stopShort} tiles short of the light`, cr.dist[ex] - (cr.layers.length - 1) === spec.collapse.stopShort);
    // the light is in sight from the start, down the long line (walls only - the bars are seen through)
    const sees = vm.runInContext(`(() => { const L = generateLevel(25, 1, 'normal', 1); const W = L.W; const a = L.start, b = L.exit; const d = Math.hypot(b.x - a.x, b.y - a.y); for (let s = 0; s < d; s += 4) { const x = a.x + (b.x - a.x) * s / d, y = a.y + (b.y - a.y) * s / d; if (L.walls[Math.floor(y / 40) * W + Math.floor(x / 40)]) return false; } return true; })()`, ctx);
    ok('25: the light can be seen from the start, far off down the hall', sees);
    let turns = 0;
    for (let k = 2; k < steps.length; k++) if (steps[k] - steps[k - 1] !== steps[k - 1] - steps[k - 2]) turns++;
    ok(`25: a winding way to it (${turns} turns)`, turns >= 10);
  }

  // every monster on a floor tile the player can reach (no one stuck in stone)
  const sIdx = Math.floor(L.start.y / 40) * W + Math.floor(L.start.x / 40);
  // (21: walking over crumbling floor - it is there until you have crossed it)
  const reach = vm.runInContext(`(() => { const L = generateLevel(${n}, 1, 'normal', ${part}); const B = L.blocked.slice(); for (const c of (L.act2 && L.act2.crumbles) || []) B[c.i] = 0; for (const s of (L.story && L.story.seals) || []) B[s.ty * L.W + s.tx] = 0; return Array.from(bfsDist(B, L.W, L.H, ${sIdx})); })()`, ctx);
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
// (v19.2) 27, Fresh Air: the village - a way through, solid houses, and people whose day stays off the stone
if (!only.length || only.includes(27)) {
  warnings.length = 0;
  const L = vm.runInContext(`generateLevel(27, 12345, 'normal')`, ctx);
  const W = L.W;
  const f = L.field;
  ok('level 27 (village): built with no warnings', !warnings.length, warnings.join(' / '));
  ok('27: daylight, nothing on screen, movement only (the flags of 26)', ['daylight', 'noRipple', 'noCrouch', 'noHud', 'movementOnly'].every((k) => L.flags[k]));
  ok('27: hand-built (two seeds and two modes give the same map)', JSON.stringify(Array.from(L.walls)) === JSON.stringify(Array.from(vm.runInContext(`generateLevel(27, 999, 'hard').walls`, ctx))));
  const s = Math.floor(L.start.y / 40) * W + Math.floor(L.start.x / 40);
  const e = Math.floor(L.exit.y / 40) * W + Math.floor(L.exit.x / 40);
  const d = vm.runInContext(`bfsDist(generateLevel(27, 12345, 'normal').blocked, ${W}, ${L.H}, ${s})`, ctx)[e];
  ok(`27: the way through is open (${d} tiles), with no puzzle in it`, d > 40 && d < 120 && !L.enemies.length);
  const inHouse = (x, y) => f.props.houses.some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
  let solidHouses = true;
  for (const h of f.props.houses) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) if (!L.walls[y * W + x]) solidHouses = false;
  ok(`27: the cottages (${f.props.houses.length}), fences (${f.props.fences.length}) and stalls are solid`, solidHouses && f.props.fences.every(([x, y]) => L.walls[y * W + x]) && f.props.stalls.every((st) => L.walls[st.y * W + st.x]));
  ok(`27: every door and garden gate can be walked to`, f.props.houses.every((h) => { const [x, y] = h.door; return !L.walls[y * W + x]; }));
  const P = f.people;
  ok(`27: ${P.length} villagers (8-12)`, P.length >= 8 && P.length <= 12);
  const at = (v, t) => {
    let k = 0;
    while (k < v.kf.length - 1 && v.kf[k + 1].t <= t) k++;
    const a = v.kf[k];
    const b = v.kf[Math.min(k + 1, v.kf.length - 1)];
    const u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    return [a.x + (b.x - a.x) * u + 0.5, a.y + (b.y - a.y) * u + 0.5];
  };
  const bad = [];
  for (const [i, v] of P.entries()) {
    for (let t = 0; t <= 40; t += 0.1) {
      const [x, y] = at(v, t);
      for (const [ox, oy] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) if (L.walls[Math.floor(y + oy) * W + Math.floor(x + ox)]) { bad.push(`${i} (${v.what}) at ${t.toFixed(1)} s`); t = 99; break; }
    }
  }
  ok('27: no villager\'s day ever takes it into a wall, a house, a fence, a stall or the well', !bad.length, bad.slice(0, 4).join(', '));
  ok('27: every day fits the loop exactly (keyframes and sounds within 0-40 s)', P.every((v) => v.kf.every((k) => k.t >= 0 && k.t <= 40) && v.ev.every((ev) => ev.t >= 0 && ev.t < 40)));
  const kinds = new Set(P.map((v) => v.what));
  ok(`27: each villager has a task (${[...kinds].join(', ')})`, ['water', 'ball', 'washing', 'broom', 'bench'].every((k) => kinds.has(k)));
  const sounds = new Set(P.flatMap((v) => v.ev.map((ev) => ev.snd)).concat(P.filter((v) => v.every).map((v) => v.every.snd)));
  ok(`27: the village makes its sounds (${[...sounds].join(', ')})`, ['bucket', 'ball', 'sweep', 'murmur'].every((k) => sounds.has(k)));
  const near = P.filter((v) => { const [x, y] = at(v, 0); return Math.hypot(x - L.start.x / 40, y - L.start.y / 40) < 3; });
  ok('27: nobody stands where you come in', !near.length);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
