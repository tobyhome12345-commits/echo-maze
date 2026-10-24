/*
 * tools/act2-test.js (v17.0) - Act 2, levels 17-20, in the real game. Load it into a ?debug page and run one suite at
 * a time (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   Act2Test.liar()      17: the first ping stutters; a ghost wall is drawn (and shimmers) but is not there - it comes
 *                        apart when walked into; a hidden wall is not drawn, stops you, thunks, and shows from then on
 *   Act2Test.shuffle()   18: a ping grinds every sliding wall in range FIRST, and moves it SLIDE_DELAY later; out of
 *                        range nothing; two pings and it is back (no randomness); never onto you
 *   Act2Test.loop()      19: a fold takes you to its pair (and the long corridor brings you back beside the start);
 *                        it does not take you straight back; your wave comes out of the pair too; the drip drips
 *   Act2Test.behind()    20: the ripple slowed and shown late; the Warden in the stone behind you, the stone splitting
 *                        before it wakes, a clean run and a slow start both getting out ahead of it; 16 and before
 *                        exactly as ever
 *   Act2Test.walk(n, monsters, mode, seed, wait)   plays level n along the way EchoStory.solve finds - with the real
 *                        keys, pinging where it pings, after standing still `wait` s - and says whether it got out
 *                        (monsters: leave them in, or take them out)
 *   Act2Test.walkAll(monsters)   17-20 one after another;  Act2Test.walkMonsters()  17, 19 and 20 with their monsters
 *                        in, in every mode
 *   Act2Test.firstTime() a save that finished 16 carries on to 17 (not "Finished"), and (v18.0) one that finished 20 on
 *                        to 21; one past 24 is Finished; the editor stays unlocked for whoever has cleared 16; a fresh
 *                        save still starts with the tutorial
 *   Act2Test.perf()      at the page's current size: how long a frame of each of 16-24 takes, a ripple out
 *   (v18.0) Act2Test.crumble()   21: off a crumbling tile, it cracks CRUMBLE_CRACK later and is gone soon after; back onto
 *                        it is a fall ("The void took you."); a monster over the void falls and is gone, with its sound
 *   Act2Test.deadair()   22: a ray from outside goes into dead air and nothing comes back (a black patch); your steps in
 *                        it are heard by nothing; a ripple from inside it never sets the Alarm off - one from outside does,
 *                        and sends the monsters; a wave from outside never touches a monster inside it
 *   Act2Test.creep()     23: the rings go on the schedule, the same every time; Easy later; Hardcore = Normal; standing
 *                        still at the start, the void takes you; a hunter on a ring that goes falls with it
 *   (v18.1) Act2Test.cues()  with whatever Visual cues setting the page was opened with (run it with
 *                        echomaze.visualcues = '1' AND without): THE REAL GAME LOOP running (not step()) - 21's bridge
 *                        crossed with the keys, every tile cracking and falling; 18's walls slid by a ping; 23's first
 *                        rings gone; every level 0-24 started and running - with no console error and the loop alive
 *   (v18.2) Act2Test.light()  25: the light seen from the start and growing as you come; past the trip point the
 *                        stone splits and the faster Warden comes; the floor behind goes; reaching the light it stops,
 *                        falls silent, the white floods in - and the end screen, "More to come soon.", back to the title
 *   Act2Test.wrongway()  24: its first way out leads to the second part (nothing saved); caught there, Try again is the
 *                        second part again; the level from the list or Continue is the first part; the second part's way
 *                        out is the end of the game so far
 */
window.Act2Test = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TILE = 40;
  const px = (t) => (t + 0.5) * TILE;
  async function until(fn, ms = 4000) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (fn()) return true;
      await sleep(30);
    }
    return !!fn();
  }
  function suite(name) {
    const out = { suite: name, pass: 0, fail: 0, failed: [], notes: [] };
    return {
      check(label, ok, info) {
        if (ok) out.pass++;
        else {
          out.fail++;
          out.failed.push(info === undefined ? label : [label, info]);
        }
        return ok;
      },
      note(x) {
        out.notes.push(x);
      },
      done: () => out,
    };
  }
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const ping = () => {
    key('Space', true);
    key('Space', false);
  };
  const step = (s) => E().step(s);
  const L = () => E().info().level;
  const P = () => E().info().player;
  function spy(name) {
    const a = E().audio;
    const orig = a[name];
    const calls = [];
    a[name] = function (...args) {
      calls.push(args);
      return orig.apply(this, args);
    };
    calls.restore = () => (a[name] = orig);
    return calls;
  }
  async function toTitle() {
    if (E().info().state !== 'title') E().toTitle();
    await until(() => E().info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(40);
  }
  /** Level n, past its opening beat, the controls yours, the monsters taken out unless `monsters`. */
  async function enter(n, monsters = false, mode = 'normal') {
    await toTitle();
    E().setMode(mode);
    E().go(n);
    for (let i = 0; i < 30 && E().scriptLock().locked; i++) step(0.25);
    step(0.2);
    if (!monsters) E().info().enemies.length = 0;
    return L();
  }
  /** Walk with the real keys towards (x, y) until there (or `secs` pass). */
  function walkTo(x, y, secs = 4) {
    for (let t = 0; t < secs * 60; t++) {
      const p = P();
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) break;
      key('ArrowRight', dx > 2);
      key('ArrowLeft', dx < -2);
      key('ArrowDown', dy > 2);
      key('ArrowUp', dy < -2);
      step(1 / 60);
      if (E().info().state !== 'play' || E().scriptLock().locked) break; // (the game has taken the controls: let go)
    }
    for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) key(k, false);
  }
  /** The ray of ripple `rp` closest to the direction (dx, dy). */
  const rayToward = (rp, dx, dy) => {
    const a = Math.atan2(dy, dx);
    const n = rp.dist.length;
    return ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
  };

  // ------------------------------------------------------------------------------------------ 17
  async function liar() {
    const T = suite('liar');
    const lv = await enter(17);
    const a2 = lv.act2;
    const g = a2.ghosts.find((x) => x.ty === 2 && x.tx === 4);
    const h = a2.hidden.find((x) => x.ty === 2 && x.tx === 7);
    T.check('17: the lesson is there - a ghost wall at (4,2), a hidden wall at (7,2)', !!g && !!h);
    T.check('17: its opening glitch has played (the rumble and the tear)', E().storyState().act2 && E().storyState().act2.glitch >= 0);
    // the first ping stutters
    E().tp(px(2), px(2));
    const st = spy('loreStatic');
    ping();
    step(0.05);
    T.check('the first ping stutters (a glitch and its static)', E().storyState().act2.firstPing && E().storyState().act2.glitch > 0 && st.length === 1, E().storyState().act2);
    const rp = E().ripples()[E().ripples().length - 1];
    const i = rayToward(rp, 1, 0);
    T.check(`the ripple draws a wall where the ghost is (${Math.round(rp.dist[i])} px east of you; it is 80 px)`, rp.type[i] === 1 && Math.abs(rp.dist[i] - (4 * 40 - 2 * 40 - 20)) < 4, [rp.type[i], rp.dist[i]]);
    T.check('...and marks it as a ghost (it shimmers)', !!rp.ghost && rp.ghost[i] === 1);
    step(1.2);
    ping();
    step(0.05);
    T.check('a second ping does not stutter', st.length === 1);
    st.restore();
    // walk into it: it is not there
    const gl = spy('loreStatic');
    walkTo(px(5), px(2), 3);
    gl.restore();
    T.check('walked into the ghost wall: through it (you are past it)', P().x > px(4) + 5, P().x);
    T.check('...it came apart (a glitch) and is gone, to the ripple too', g.gone && lv.rayWalls[g.i] === 0 && gl.length >= 1);
    // the hidden wall: not drawn, but stone
    step(1.2);
    ping();
    step(0.05);
    const rp2 = E().ripples()[E().ripples().length - 1];
    const j = rayToward(rp2, 1, 0);
    T.check(`the ripple sees nothing at the hidden wall (its ray goes ${Math.round(rp2.dist[j])} px east; the stone is ${Math.round(px(7) - 20 - P().x)} px away)`, rp2.dist[j] > px(7) - 20 - P().x + 30, rp2.dist[j]);
    const thunk = spy('wardenStep');
    walkTo(px(8), px(2), 2);
    thunk.restore();
    T.check('walking at it: stopped before the stone', P().x < px(7) - 20 - 8, P().x);
    T.check('...a dull thunk, and from now on it shows', h.shown && lv.rayWalls[h.i] === 1 && thunk.length >= 1);
    step(1.2);
    ping();
    step(0.05);
    const rp3 = E().ripples()[E().ripples().length - 1];
    const k = rayToward(rp3, 1, 0);
    T.check('the next ripple stops at it', Math.abs(rp3.dist[k] - (px(7) - 20 - P().x)) < 4, [rp3.dist[k], px(7) - 20 - P().x]);
    T.check('the monsters, footsteps and bumps are untouched: the real walls are the same as the map (hidden in, ghost out)', lv.walls[h.i] === 1 && lv.walls[g.i] === 0 && lv.blocked[h.i] === 1 && lv.blocked[g.i] === 0);
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ 18
  async function shuffle() {
    const T = suite('shuffle');
    const lv = await enter(18);
    const a2 = lv.act2;
    const g1 = a2.slides[0];
    T.check(`18: ${a2.slides.length} sliding walls, every one in A to begin with`, a2.slides.every((s) => s.on === 0 && lv.walls[s.a] === 1 && lv.walls[s.b] === 0));
    const grind = spy('stoneGrind');
    E().tp(px(1), px(2));
    ping();
    step(1 / 60);
    T.check('a ping: the first gate GRINDS at once - before it moves', grind.length >= 1 && g1.on === 0 && lv.walls[g1.a] === 1);
    step(0.3);
    T.check('...still in place a moment later (you can hear it coming)', g1.on === 0);
    step(0.4);
    T.check('...then it slides: A open, B stone', g1.on === 1 && lv.walls[g1.a] === 0 && lv.walls[g1.b] === 1 && lv.blocked[g1.a] === 0);
    T.check('only the walls in range moved', a2.slides.slice(1).every((s) => s.on === 0));
    grind.restore();
    step(1.2);
    ping();
    step(1);
    T.check('a second ping: back where it was (nothing random)', g1.on === 0 && lv.walls[g1.a] === 1 && lv.walls[g1.b] === 0);
    // never onto you: stand on its B and ping
    step(1.2);
    E().tp(px(g1.b % lv.W), px(Math.floor(g1.b / lv.W)));
    ping();
    step(1);
    T.check('standing where it would go: it does not move onto you', g1.on === 0 && lv.walls[g1.b] === 0);
    // the same sequence twice gives the same walls
    const run = async () => {
      const l2 = await enter(18);
      E().tp(px(1), px(2));
      for (let i = 0; i < 3; i++) {
        ping();
        step(1.5);
      }
      return Array.from(l2.walls).join('');
    };
    T.check('the same pings, twice over: the same walls (deterministic)', (await run()) === (await run()));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ 19
  async function loop() {
    const T = suite('loop');
    const lv = await enter(19);
    const a2 = lv.act2;
    const pairs = a2.folds.map((f) => [f.a % lv.W, Math.floor(f.a / lv.W), f.b % lv.W, Math.floor(f.b / lv.W)]);
    T.note({ folds: pairs });
    // the long corridor east: its fold puts you back beside the start
    const f1 = a2.folds.find((f) => Math.floor(f.a / lv.W) === 3 && Math.floor(f.b / lv.W) === 3);
    const east = Math.max(f1.a, f1.b);
    const west = Math.min(f1.a, f1.b);
    E().tp(px((east % lv.W) - 2), px(3));
    const wh = spy('singerWhoosh');
    for (let t = 0; t < 120 && !wh.length; t++) {
      key('ArrowRight', true);
      step(1 / 60);
    }
    key('ArrowRight', false);
    wh.restore();
    const ti = Math.floor(P().y / TILE) * lv.W + Math.floor(P().x / TILE);
    T.check(`walked into the far fold: back at (${west % lv.W},3), beside the start - with a whoosh and a flicker`, ti === west && wh.length === 1 && E().storyState().act2.flicker > 0, { ti, west });
    step(0.3);
    const ti2 = Math.floor(P().y / TILE) * lv.W + Math.floor(P().x / TILE);
    T.check('standing on the fold you came out of: it does not take you straight back', ti2 === west);
    // the drip is there, and drips
    T.check('the drip by the start drips', E().storyState().drips.length === 1 && E().storyState().drips[0].on);
    // a wave goes through: ping beside a fold, and a second ripple comes out of its pair
    E().tp(px(3), px(3));
    step(1.2);
    const before = E().ripples().length;
    ping();
    step(0.6);
    const pair = E().ripples().slice(before).filter((r) => Math.hypot(r.x - px(west % lv.W), r.y - px(3)) > 5);
    T.check(`a ping near a fold: a wave comes out of its pair too (${pair.length})`, pair.length >= 1, E().ripples().slice(before).map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.R)]));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ 20
  async function behind() {
    const T = suite('behind');
    await enter(20);
    ping();
    step(0.02);
    const rp = E().ripples()[E().ripples().length - 1];
    T.check(`20: the ripple is slow (${Math.round(rp.v)} px/s, was 520) and shows what it found ${rp.lag} s late`, rp.v < 300 && rp.lag > 0.3);
    T.check('...its echoes come back late too', rp.echoes.every((e) => e.t >= rp.lag));
    // the Warden in the stone behind you: still, and stone to a ripple, until it wakes; the stone splits first
    await enter(20, true);
    const wake = EchoStory.LEVELS[20].wake;
    const h0 = E().hunter();
    T.check(`20: a Warden of level 15's kind, in the stone (${h0 && h0.variant}, ${h0 && h0.state}, hidden ${h0 && h0.hidden})`, h0 && h0.variant === 'regular' && h0.state !== 'hunt' && h0.hidden);
    while (E().info().levelTime < wake - 0.3 && E().info().state === 'play') step(1 / 30);
    T.check(`...the stone behind you splits before it comes (${E().captionText ? E().captionText() : ''})`, E().hunter().state !== 'hunt');
    while (E().info().levelTime < wake + 0.2 && E().info().state === 'play') step(1 / 30);
    T.check(`...and at ${wake} s it hunts`, E().hunter().state === 'hunt' && !E().hunter().hidden);
    const clean = await walk(20, true, 'normal', 1);
    T.check(`20: a clean run gets out ahead of it (${clean.seconds} s)`, clean.cleared, clean);
    const slow = await walk(20, true, 'normal', 1, wake - 1);
    T.check(`20: so does one that stands still for ${wake - 1} s first (${slow.seconds} s)`, slow.cleared, slow);
    for (const n of [1, 12, 16]) {
      await toTitle();
      E().go(n);
      for (let i = 0; i < 30 && E().scriptLock().locked; i++) step(0.25);
      step(1.5);
      ping();
      step(0.02);
      const r = E().ripples().find((x) => !x.ambient);
      T.check(`level ${n}: the ripple exactly as ever (520 px/s, no lag)`, r && r.v === 520 && r.lag === 0, r && [r.v, r.lag]);
    }
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ (v18.0) 21-24
  /** Walk from where you are onto tile (tx, ty) - a step at a time along a straight line of tiles. */
  function stepTo(tx, ty) {
    walkTo(px(tx), px(ty), 3);
  }
  async function crumble() {
    const T = suite('crumble');
    let lv = await enter(21);
    const a2 = lv.act2;
    const W = lv.W;
    // the teaching bridge: the first crumbling tile east of the start
    const sx = Math.floor(P().x / TILE);
    const sy = Math.floor(P().y / TILE);
    const c0 = a2.crumbles.find((c) => Math.floor(c.i / W) === sy && c.i % W > sx);
    T.check('21: crumbling floor right after the start', !!c0 && (c0.i % W) - sx <= 3);
    const cx = c0.i % W;
    stepTo(cx, sy); // onto it...
    T.check('...it holds you', c0.state === 0 && !a2.voidGrid[c0.i] && E().info().state === 'play');
    const cracks = spy('stoneSplit');
    const falls = spy('voidFall');
    stepTo(cx + 1, sy); // ...and off it
    const t0 = E().info().levelTime;
    T.check('stepping off it starts it going', c0.state === 1, c0.state);
    while (E().info().levelTime - t0 < 0.45) step(1 / 60);
    T.check('0.45 s later: still there, no crack yet', c0.state === 1 && cracks.length === 0);
    while (E().info().levelTime - t0 < 0.7) step(1 / 60);
    T.check('0.7 s: it has cracked - you hear it', c0.state === 2 && cracks.length === 1);
    while (E().info().levelTime - t0 < 1.1) step(1 / 60);
    T.check('1.1 s: it is gone - void, and the fall that never lands', c0.state === 3 && a2.voidGrid[c0.i] === 1 && lv.blocked[c0.i] === 1 && falls.length >= 1);
    cracks.restore();
    // back onto it: you fall
    const youFall = spy('voidFall');
    key('ArrowLeft', true);
    for (let i = 0; i < 40 && !E().info().falling && E().info().state === 'play'; i++) step(1 / 60);
    key('ArrowLeft', false);
    T.check('stepping back onto where it was: you fall', E().info().falling && youFall.length === 1);
    for (let i = 0; i < 90 && E().info().state === 'play'; i++) step(1 / 60);
    T.check('...and are caught by the void', E().info().state === 'caught', E().info().state);
    await until(() => !$('caught').classList.contains('hidden'), 2500);
    T.check('the Caught screen: "The void took you."', $('caught-text').textContent === 'The void took you.', $('caught-text').textContent);
    youFall.restore();
    falls.restore();
    // a monster over the void falls, and is gone - you hear it from where it was
    lv = await enter(21, true);
    const e = E().info().enemies[0];
    const vi = Array.from(lv.act2.voidGrid).findIndex((v) => v === 1);
    const its = spy('voidFall');
    e.x = px(vi % lv.W);
    e.y = px(Math.floor(vi / lv.W));
    step(1 / 60);
    T.check('a monster over the void falls, and is gone for this attempt', E().info().enemies.length === 0 && its.length === 1 && its[0][1] > 0);
    its.restore();
    await toTitle();
    return T.done();
  }

  async function deadair() {
    const T = suite('deadair');
    let lv = await enter(22, true);
    const a2 = lv.act2;
    const W = lv.W;
    const dead = (x, y) => a2.dead[y * W + x] === 1;
    // from the start, ping east: the first patch of dead air is in the way
    const sy = Math.floor(P().y / TILE);
    let zx = Math.floor(P().x / TILE);
    while (zx < W && !dead(zx, sy)) zx++;
    T.check('22: dead air just along from the start', zx < W && zx - Math.floor(P().x / TILE) <= 6, zx);
    ping();
    step(0.02);
    const rp = E().ripples()[E().ripples().length - 1];
    const d0 = zx * TILE - P().x;
    const east = 0; // the ray straight east
    T.check(`a ray that reaches it goes in and stops there (${Math.round(rp.dist[east])} px, the edge is ${Math.round(d0)})`, Math.abs(rp.dist[east] - d0) < 3 && rp.type[east] === 0);
    step(1.0);
    T.check('...and what is left on the map is a black patch where it went in', E().deadSeen().includes(sy * W + zx), E().deadSeen());
    // the Alarm: a ripple from inside dead air does not set it off; one from outside, within reach, does
    const al = E().info().enemies.find((e) => e.kind === 'alarm');
    const atx = Math.floor(al.x / TILE);
    const aty = Math.floor(al.y / TILE);
    let hide = -1;
    let open = -1;
    for (let i = 0; i < a2.dead.length; i++) {
      const x = i % W;
      const y = Math.floor(i / W);
      const d = Math.hypot(px(x) - al.x, px(y) - al.y);
      if (lv.walls[i] || lv.blocked[i] || d > 200 || d < 60) continue;
      if (a2.dead[i] && hide < 0) hide = i;
      if (!a2.dead[i] && open < 0 && Math.abs(x - atx) <= 1) open = i;
    }
    const screams = spy('scream');
    E().tp(px(hide % W), px(Math.floor(hide / W)));
    step(1.6); // (the recharge)
    ping();
    for (let i = 0; i < 90; i++) step(1 / 60);
    T.check('a ripple sent from INSIDE dead air, the Alarm in its reach: no scream', screams.length === 0 && !al.spent, { hide: [hide % W, Math.floor(hide / W)], spent: al.spent });
    E().tp(px(open % W), px(Math.floor(open / W)));
    step(1.6);
    const before = E().info().enemies.filter((e) => e.kind === 'echo').map((e) => e.state);
    ping();
    for (let i = 0; i < 90; i++) step(1 / 60);
    const after = E().info().enemies.filter((e) => e.kind === 'echo').map((e) => e.state);
    T.check(`the same from outside it: it screams, and the monsters come (${before.join(',')} -> ${after.join(',')})`, screams.length === 1 && al.spent && after.some((s) => s === 'hunt'));
    screams.restore();
    // your footsteps in dead air: nothing hears them - outside it, they do
    for (const inDead of [true, false]) {
      lv = await enter(22, true);
      const e = E().info().enemies.find((x) => x.kind === 'echo');
      const spot = inDead ? [zx, sy] : [2, sy];
      E().tp(px(spot[0]), px(spot[1]));
      e.x = P().x;
      e.y = P().y - 60;
      e.state = 'search';
      e.timer = 30;
      e.path = null;
      key(inDead ? 'ArrowDown' : 'ArrowRight', true);
      for (let i = 0; i < 24; i++) step(1 / 60);
      key(inDead ? 'ArrowDown' : 'ArrowRight', false);
      if (inDead) T.check('walking in dead air, a listening monster close by: it hears nothing', e.state === 'search', e.state);
      else T.check('walking outside it, the same monster: it hears you', e.state === 'track', e.state);
    }
    // a wave from outside never touches a monster inside dead air
    lv = await enter(22, true);
    const m = E().info().enemies.find((x) => x.kind === 'echo');
    E().tp(px(zx - 3), px(sy));
    step(1.6); // (the recharge)
    // placed after the wait, and held still: an idle monster wanders off after its pause (a flaky test in v18.0)
    m.x = px(zx);
    m.y = px(sy);
    m.state = 'idle';
    m.path = null;
    m.pause = 99;
    ping();
    for (let i = 0; i < 60; i++) step(1 / 60);
    T.check('a monster standing in dead air: a ripple from outside never reaches it', m.state === 'idle', m.state);
    await toTitle();
    return T.done();
  }

  async function creep() {
    const T = suite('creep');
    const times = {};
    for (const mode of ['normal', 'easy', 'hardcore', 'normal']) {
      const lv = await enter(23, false, mode);
      const cr = lv.act2.creep;
      const first = cr.layers[0];
      const grind = spy('stoneGrind');
      while (E().info().levelTime < first.t - 0.05) step(1 / 30);
      const beforeOk = first.tiles.every((i) => !lv.act2.voidGrid[i]);
      while (E().info().levelTime < first.t + 0.05) step(1 / 60);
      const afterOk = first.tiles.every((i) => lv.act2.voidGrid[i] === 1);
      grind.restore();
      (times[mode] = times[mode] || []).push(cr.layers.map((l) => l.t).join());
      T.check(`${mode}: the outer ring goes at ${first.t} s - not before, all of it, with a rumble`, beforeOk && afterOk && grind.length >= 1);
    }
    T.check('the same schedule every attempt', times.normal[0] === times.normal[1]);
    T.check(`Easy goes slower (${times.easy[0].split(',').slice(0, 3).join(', ')} s...) and Hardcore is Normal's`, +times.easy[0].split(',')[1] > +times.normal[0].split(',')[1] && times.hardcore[0] === times.normal[0]);
    // standing still at the start: the void takes you when your ring goes
    let lv = await enter(23);
    const ring1 = lv.act2.creep.layers[1].t;
    for (let i = 0; i < 400 && E().info().state === 'play'; i++) step(0.1);
    T.check(`standing still at the start: the void takes you as your ring goes (${ring1} s)`, E().info().state === 'caught' && E().info().levelTime >= ring1 && E().info().levelTime < ring1 + 1.2, E().info().levelTime);
    // a hunter on a ring that goes falls with it (you wait in the middle, where the void never comes)
    lv = await enter(23, true);
    const n0 = E().info().enemies.length;
    const W = lv.W;
    const safe = lv.act2.creep.voidAt.findIndex((t, i) => t === Infinity && !lv.blocked[i] && Math.hypot(px(i % W) - lv.exit.x, px(Math.floor(i / W)) - lv.exit.y) > 100);
    E().tp(px(safe % W), px(Math.floor(safe / W)));
    const falls = spy('voidFall');
    for (let i = 0; i < 300 && E().info().state === 'play' && E().info().enemies.length === n0; i++) step(0.25);
    falls.restore();
    T.check(`a hunter whose ring goes falls with it (${n0} -> ${E().info().enemies.length})`, E().info().enemies.length < n0 && falls.length >= 1);
    await toTitle();
    return T.done();
  }

  async function wrongway() {
    const T = suite('wrongway');
    const prog = () => (E().settings().progress || {}).normal || 0;
    const p0 = prog();
    let lv = await enter(24);
    T.check('24: the first part', E().info().part === 1 && lv.W === 31);
    // walk into its way out
    const ex = Math.floor(lv.exit.x / TILE);
    const ey = Math.floor(lv.exit.y / TILE);
    E().tp(px(ex), px(ey - 1));
    key('ArrowDown', true);
    for (let i = 0; i < 30 && E().info().state === 'play' && !E().scriptLock().locked; i++) step(1 / 60);
    key('ArrowDown', false);
    for (let i = 0; i < 40 && E().info().part !== 2; i++) step(0.1);
    T.check('its way out feels like any other - and leads into the second part', E().info().levelNum === 24 && E().info().part === 2 && L().W < 31);
    T.check('...and nothing is saved for it', prog() === p0, [p0, prog()]);
    for (let i = 0; i < 30 && E().scriptLock().locked; i++) step(0.25);
    // caught in the second part: Try again is the second part
    const h = E().hunter();
    T.check('the second part: one Warden, in the stone', !!h && h.variant === 'regular' && h.state !== 'hunt');
    for (let i = 0; i < 200 && E().info().state === 'play'; i++) step(0.1);
    T.check('standing still there: it comes for you', E().info().state === 'caught');
    await until(() => !$('caught').classList.contains('hidden'), 2500);
    $('btn-retry').click();
    await until(() => E().info().state === 'play', 3000);
    T.check('Try again: the second part again, from its own start', E().info().levelNum === 24 && E().info().part === 2 && L().W < 31 && Math.hypot(P().x - L().start.x, P().y - L().start.y) < 2);
    // the level from the list (or Continue, or a reload - nothing is kept): the first part
    E().toTitle();
    E().go(24);
    T.check('starting 24 again (Continue, the level list, a reload): the first part', E().info().part === 1 && L().W === 31);
    await toTitle();
    // the second part's way out: the end of the game so far
    const r = await walk(24, false);
    T.check(`walked through both parts (${r.part1} s + ${(r.seconds - r.part1).toFixed(1)} s): on into 25 (v18.2)`, r.cleared && E().info().levelNum === 25, r);
    T.check('...and only now is it saved', prog() >= 25, prog());
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ (v18.2) 25: the light
  async function light() {
    const T = suite('light');
    const lv = await enter(25, true);
    const st = () => E().storyState();
    T.check('25: the light, seen from the start, far off and faint', st().light && st().light.sight > 0.5 && st().light.k < 0.35, st().light);
    const k0 = st().light.k;
    const day = spy('setDaylight');
    // walk on down the hall to just short of the trip point: it grows, and the outside sound with it
    walkTo(lv.story.spec.tripX - 60, lv.start.y, 8);
    step(1.0);
    T.check(`...it grows and warms as you come (${k0} -> ${st().light.k})`, st().light.k > k0 + 0.1);
    T.check('...and the sound of outside with it', day.length > 10 && day[day.length - 1][0] > day[0][0]);
    day.restore();
    T.check('before the trip point: the Warden still in the stone', E().hunter().state !== 'hunt');
    const splits = spy('stoneSplit');
    walkTo(lv.story.spec.tripX + 30, lv.start.y, 3);
    T.check('past the trip point: the stone splits behind you', splits.length === 1 && st().phase === 'chase');
    splits.restore();
    step(lv.story.spec.wake + 0.1);
    T.check("...and level 16's Warden comes", E().hunter().state === 'hunt' && E().hunter().variant === 'upgraded');
    const cr = L().act2.creep;
    step(cr.layers[0].t + 0.6 - lv.story.spec.wake);
    T.check(`the floor behind you starts to go (${cr.layers[0].t} s after)`, cr.layers[0].tiles.every((i) => L().act2.voidGrid[i] === 1));
    await toTitle();
    // the whole way, with the real keys - to the light, the silence and the white, and the end screen
    const r = await walk(25, true);
    T.check(`walked to the light with it behind you (${r.seconds} s)`, r.cleared && E().info().state === 'ending', r);
    T.check('the end screen: "More to come soon."', $('ending-text').textContent === 'More to come soon.' && !$('ending').classList.contains('hidden'));
    T.check('...and only now is the whole story saved', ((E().settings().progress || {}).normal || 0) >= 26);
    $('btn-ending-title').click();
    await until(() => E().info().state === 'title', 3000);
    T.check('its button: back to the title', E().info().state === 'title');
    // the last beat, step by step: it stops at the edge, its hum fades, the white floods in
    await enter(25, true);
    E().tp(L().exit.x - 60, L().exit.y - 40);
    E().wakeHunter && E().wakeHunter();
    const ex = L().exit;
    E().tp(ex.x, ex.y - 30);
    key('ArrowDown', true);
    for (let i = 0; i < 30 && st().phase !== 'leaving'; i++) step(1 / 60);
    key('ArrowDown', false);
    T.check('at the light: the way out is real', st().phase === 'leaving');
    step(2.0);
    T.check(`...it stops, and its hum fades (${st().outside.hush})`, E().hunter().held && st().outside.hush < 0.1);
    step(3.5);
    T.check(`...then the white floods in (${st().outside.white})`, st().outside.white > 0.5);
    for (let i = 0; i < 40 && E().info().state === 'play'; i++) step(0.25);
    T.check('...and the end screen', E().info().state === 'ending');
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ (v18.1) Visual cues
  async function cues() {
    const T = suite('cues');
    const on = !!E().settings().visualCues;
    const tag = on ? 'cues ON' : 'cues OFF';
    const errs = [];
    const oe = console.error;
    console.error = (...a) => {
      errs.push(a.map((x) => String((x && x.stack) || x)).join(' ').slice(0, 300));
      oe.apply(console, a);
    };
    const onErr = (e) => errs.push(String(e.message || e));
    window.addEventListener('error', onErr);
    const fe = () => (E().frameErrors ? E().frameErrors() : 0); // (an older build has no such hook)
    const fe0 = fe();
    // the real loop (requestAnimationFrame) advancing the level while we wait - not step()
    const live = async (ms) => {
      const t0 = E().info().levelTime;
      await sleep(ms);
      return E().info().levelTime - t0;
    };
    const captions = new Set();
    const watch = async (ms) => {
      const end = performance.now() + ms;
      while (performance.now() < end) {
        const c = E().captionText();
        if (c) captions.add(c);
        await sleep(25);
      }
    };
    try {
      // 21: across the teaching bridge, keys held, the real loop running
      let lv = await enter(21, true);
      const W = lv.W;
      const sy = Math.floor(P().y / TILE);
      const row = new Set(lv.act2.crumbles.filter((c) => Math.floor(c.i / W) === sy).map((c) => c.i));
      const bridge = [];
      let b0 = sy * W + Math.floor(P().x / TILE) + 1;
      while (!row.has(b0) && b0 % W < W - 1) b0++;
      for (let i = b0; row.has(i); i++) bridge.push(i); // (the first run of it east of the start: the teaching bridge)
      const land = px((bridge[bridge.length - 1] % W) + 1);
      key('ArrowRight', true);
      const end = performance.now() + 5000;
      while (performance.now() < end && P().x < land - 3 && E().info().state === 'play') {
        const c = E().captionText();
        if (c) captions.add(c);
        await sleep(25);
      }
      key('ArrowRight', false);
      await watch(1600);
      const gone = bridge.filter((i) => lv.act2.voidGrid[i] === 1).length;
      T.check(`${tag} 21: crossed the bridge with the real loop - every tile cracked and fell (${gone}/${bridge.length})`, gone === bridge.length && bridge.length >= 3);
      T.check(`${tag} 21: ...and the game is still running`, E().info().state === 'play' && (await live(600)) > 0.3);
      if (on) T.check(`${tag} 21: the crack and the fall were captioned (${[...captions].join(' ')})`, captions.has('[stone cracks]') || captions.has('[it falls away]'));
      // 18: a ping slides the walls in range
      lv = await enter(18);
      const sl = lv.act2.slides[0];
      E().tp(sl.x, sl.y + TILE * 2);
      let near = null;
      for (let i = 0; i < lv.W * lv.H && !near; i++) {
        const x = (i % lv.W) * TILE + TILE / 2;
        const y = Math.floor(i / lv.W) * TILE + TILE / 2;
        if (!lv.blocked[i] && Math.hypot(x - sl.x, y - sl.y) < 120 && Math.hypot(x - sl.x, y - sl.y) > 50) near = [x, y];
      }
      E().tp(near[0], near[1]);
      await sleep(300);
      const was = sl.on;
      ping();
      await watch(1500);
      T.check(`${tag} 18: a ping slid the wall, the real loop running`, sl.on !== was && E().info().state === 'play' && (await live(500)) > 0.2);
      // 23: wait in the middle while the first rings go
      lv = await enter(23);
      const safe = lv.act2.creep.voidAt.findIndex((t, i) => t === Infinity && !lv.blocked[i] && Math.hypot(px(i % lv.W) - lv.exit.x, px(Math.floor(i / lv.W)) - lv.exit.y) > 100);
      E().tp(px(safe % lv.W), px(Math.floor(safe / lv.W)));
      const L0 = lv.act2.creep.layers;
      while (E().info().levelTime < L0[0].t - 0.6) step(0.25);
      await watch(1400); // the first ring goes with the real loop running
      while (E().info().levelTime < L0[1].t - 0.6) step(0.25);
      await watch(1400); // ...and the second
      const eaten = L0[0].tiles.concat(L0[1].tiles).every((i) => lv.act2.voidGrid[i] === 1);
      T.check(`${tag} 23: the first two rings went, the real loop running`, eaten && E().info().state === 'play' && (await live(500)) > 0.2);
      if (on) T.check(`${tag} 23: ...captioned`, captions.has('[the edge gives way]'));
      // every level starts and runs
      const dead = [];
      for (let n = 0; n <= 25; n++) {
        await toTitle();
        E().go(n);
        const adv = await live(700);
        if (!(adv > 0.2)) dead.push(`${n}: ${E().info().state} +${adv.toFixed(2)}`);
      }
      T.check(`${tag}: every level 0-25 starts and runs`, dead.length === 0, dead);
    } finally {
      console.error = oe;
      window.removeEventListener('error', onErr);
      for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) key(k, false);
    }
    T.check(`${tag}: no console error, no exception, and the loop caught nothing`, errs.length === 0 && fe() === fe0, errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the way through
  /**
   * Play level n along the way the solver found, with the real keys: walking tile to tile, pinging where it pings
   * (and waiting for the walls to move), stepping into the folds it uses. Crouches when a stalker is near, as a
   * careful player would. `wait`: seconds to stand still first (how long a player can spend not moving - on 20,
   * looking for the way while the Warden is in the stone, and after). Returns { cleared, caught, seconds, state }.
   */
  async function walk(n, monsters = false, mode = 'normal', seed = 1, wait = 0) {
    E().seed(seed);
    let lv = await enter(n, monsters, mode);
    const first = await walkRoute(n, lv, monsters, wait);
    // (v18.0) 24: its first way out leads into its second part - walk that too
    if (first.part2) {
      for (let i = 0; i < 40 && (E().info().part !== 2 || E().scriptLock().locked) && E().info().state === 'play'; i++) step(0.25);
      step(0.2);
      if (!monsters) E().info().enemies.length = 0;
      lv = L();
      const second = await walkRoute(n, lv, monsters, 0);
      second.seconds = +(first.seconds + second.seconds).toFixed(1);
      second.part1 = first.seconds;
      return second;
    }
    return first;
  }
  async function walkRoute(n, lv, monsters, wait) {
    const mode = E().settings().mode;
    const sol = EchoStory.solve(lv);
    const W = lv.W;
    const out = { level: n, mode, monsters, cleared: false, caught: false, seconds: 0, part: E().info().part };
    if (!sol.ok) return Object.assign(out, { error: sol.why });
    let cur = Math.floor(P().y / TILE) * W + Math.floor(P().x / TILE);
    for (let i = 0; i < wait * 60 && E().info().state === 'play'; i++) step(1 / 60);
    const t0 = E().info().levelTime;
    for (const r of sol.route) {
      if (E().info().state !== 'play' || E().info().levelNum !== n) break;
      const crouch = monsters && E().info().enemies.some((e) => e.kind === 'stalker' && Math.hypot(e.x - P().x, e.y - P().y) < 190);
      key('ShiftLeft', crouch);
      if (r.ping) {
        key('ShiftLeft', false);
        for (let i = 0; i < 120 && E().info().state === 'play'; i++) {
          if (E().ripples().length === 0 || true) break;
        }
        // wait out the recharge, ping, and let the walls move
        for (let i = 0; i < 150; i++) {
          const before = E().ripples().length;
          ping();
          step(1 / 60);
          if (E().ripples().length > before) break;
        }
        step(0.75);
        continue;
      }
      let target = r.tile;
      // a fold: the route lands on its pair - walk into the fold beside you that leads there
      const near = [cur - 1, cur + 1, cur - W, cur + W];
      if (!near.includes(target)) {
        const via = near.find((j) => lv.act2 && lv.act2.foldPair[j] === target);
        if (via !== undefined) target = via;
      }
      walkTo(px(target % W), px(Math.floor(target / W)), 3);
      cur = Math.floor(P().y / TILE) * W + Math.floor(P().x / TILE);
      if (E().info().levelNum === n && E().info().part === out.part) out.seconds = +(E().info().levelTime - t0).toFixed(1);
    }
    // the way out: keep walking at it (its last beat takes the controls)
    for (let i = 0; i < 900 && E().info().state === 'play' && E().info().levelNum === n && E().info().part === out.part; i++) step(1 / 60);
    for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ShiftLeft']) key(k, false);
    const s = E().info();
    out.cleared = (s.levelNum === n + 1 && s.state === 'play') || s.state === 'ending' || (s.state === 'cutscene' && s.levelNum === n); // (21 -> the Alarm's scene)
    out.part2 = n === 24 && out.part === 1 && s.levelNum === 24 && s.part === 2 && s.state === 'play';
    out.caught = s.state === 'caught' || (s.state === 'title' && mode === 'hardcore');
    out.state = s.state;
    out.levelNow = s.levelNum;
    return out;
  }
  async function walkAll(monsters = false) {
    const T = suite('walkAll');
    for (const n of [17, 18, 19, 20, 21, 22, 23, 24, 25]) {
      const r = await walk(n, monsters);
      T.check(`level ${n}: walked through to the way out${monsters ? ' (monsters in)' : ' (monsters out)'}`, r.cleared, r);
      T.note(r);
      await toTitle();
    }
    return T.done();
  }
  /**
   * With their monsters in, in every mode: 17, 19, 20 and (v18.0) 21-24 (on 20, a clean run and one that stands still for a second
   * less than the Warden's wake first). Not 18: its stalker patrols where it likes, and a bot that cannot hear it
   * walks into it about one run in four - see CLAUDE.md, v17.0.
   */
  async function walkMonsters() {
    const T = suite('walkMonsters');
    for (const mode of ['easy', 'normal', 'hard', 'hardcore']) {
      for (const n of [17, 19, 20, 21, 22, 23, 24, 25]) {
        const r = await walk(n, true, mode, 1);
        T.check(`level ${n} on ${mode}: walked through with its monsters in`, r.cleared, r);
        await toTitle();
      }
    }
    const wake = EchoStory.LEVELS[20].wake;
    const r = await walk(20, true, 'hard', 2, wake - 1);
    T.check(`level 20 on hard: through, after standing still for ${wake - 1} s first`, r.cleared, r);
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ saves
  async function firstTime() {
    const T = suite('firstTime');
    await toTitle();
    const best = Math.max(...['easy', 'normal', 'hard', 'hardcore'].map((m) => (E().settings().progress || {})[m] || 1));
    const cont = $('btn-continue');
    const tag = document.querySelector('#modes .mode.on .mode-tag, #modes [aria-checked="true"] .tag') || null;
    T.note({ best, continue: cont.classList.contains('hidden') ? null : cont.textContent.trim(), editor: E().settings().editor.unlocked, newPlayer: E().newPlayer() });
    if (best === 17) T.check('a save that finished 16 (best 17): Continue (Level 17), not Finished', !cont.classList.contains('hidden') && /17/.test(cont.textContent) && !document.getElementById('title').textContent.includes('Finished'));
    if (best === 17) T.check('...and the level editor stays unlocked (no warning flag needed)', E().settings().editor.unlocked);
    if (best === 16) T.check('a save on 16: Continue (Level 16), the editor not unlocked by it', /16/.test(cont.textContent) && !E().settings().editor.unlocked);
    if (best === 21) T.check('(v18.0) a save that finished 20 (best 21): Continue (Level 21), not Finished', !cont.classList.contains('hidden') && /21/.test(cont.textContent) && !document.getElementById('title').textContent.includes('Finished'));
    if (best === 25) T.check('(v18.2) a save that finished 24 (best 25): Continue (Level 25), not Finished', !cont.classList.contains('hidden') && /25/.test(cont.textContent) && !document.getElementById('title').textContent.includes('Finished'));
    if (best >= 26) T.check('a save past 25: Finished', cont.classList.contains('hidden') && document.getElementById('title').textContent.includes('Finished'));
    if (best <= 1) T.check('a fresh save: Begin starts with the tutorial (level 0)', E().newPlayer());
    if (best === 17) {
      $('btn-continue').click();
      await until(() => E().info().state === 'play' && E().info().levelNum === 17, 4000);
      T.check('Continue from that save: level 17, the broken gaol', E().info().levelNum === 17 && E().info().level.story.kind === 'liar');
      T.check('...its progress intact', ((E().settings().progress || {}).normal || 0) >= 17);
    }
    if (best === 21) {
      $('btn-continue').click();
      await until(() => E().info().state === 'play' && E().info().levelNum === 21, 4000);
      T.check('Continue from that save: level 21, the crumble', E().info().levelNum === 21 && E().info().level.story.kind === 'crumble');
      T.check('...its progress intact', ((E().settings().progress || {}).normal || 0) >= 21);
    }
    if (best === 25) {
      $('btn-continue').click();
      await until(() => E().info().state === 'play' && E().info().levelNum === 25, 4000);
      T.check('Continue from that save: level 25, the light', E().info().levelNum === 25 && E().info().level.story.kind === 'outside');
    }
    T.check(`the campaign is ${STORY_LAST} levels (17-25 are story levels)`, E().settings().campaignLevels === 25 && isStoryLevel(17) && isStoryLevel(25) && !isStoryLevel(26));
    T.note({ progress: E().settings().progress, editor: E().settings().editor.unlocked, title: $('mode-tag-' + E().settings().mode) ? $('mode-tag-' + E().settings().mode).textContent : null, cont: $('btn-continue').classList.contains('hidden') ? null : $('btn-continue').textContent });
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ cost
  async function perf() {
    const T = suite('perf');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    for (const n of [16, 17, 18, 19, 20, 21, 22, 23, 24, 25]) {
      await enter(n, true);
      ping();
      step(0.3);
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) {
        step(1 / 60);
        E().draw();
      }
      const ms = (performance.now() - t0) / 120;
      T.note(`${size}: level ${n} ${ms.toFixed(2)} ms a frame (simulation + drawing)`);
      T.check(`${size}: level ${n} well inside a 60 fps frame (${ms.toFixed(2)} ms)`, ms < 8);
    }
    await toTitle();
    return T.done();
  }

  return { liar, shuffle, loop, behind, walk, walkAll, walkMonsters, firstTime, perf, crumble, deadair, creep, wrongway, cues, light };
})();
