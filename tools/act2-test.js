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
 *   Act2Test.firstTime() a save that finished 16 carries on to 17 (not "Finished"); one past 20 is Finished; the editor
 *                        stays unlocked for whoever has cleared 16; a fresh save still starts with the tutorial
 *   Act2Test.perf()      at the page's current size: how long a frame of each of 17-20 takes, a ripple out
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
      if (E().info().state !== 'play') break;
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

  // ------------------------------------------------------------------------------------------ the way through
  /**
   * Play level n along the way the solver found, with the real keys: walking tile to tile, pinging where it pings
   * (and waiting for the walls to move), stepping into the folds it uses. Crouches when a stalker is near, as a
   * careful player would. `wait`: seconds to stand still first (how long a player can spend not moving - on 20,
   * looking for the way while the Warden is in the stone, and after). Returns { cleared, caught, seconds, state }.
   */
  async function walk(n, monsters = false, mode = 'normal', seed = 1, wait = 0) {
    E().seed(seed);
    const lv = await enter(n, monsters, mode);
    const sol = EchoStory.solve(lv);
    const W = lv.W;
    const out = { level: n, mode, monsters, cleared: false, caught: false, seconds: 0 };
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
      if (E().info().levelNum === n) out.seconds = +(E().info().levelTime - t0).toFixed(1);
    }
    // the way out: keep walking at it (its last beat takes the controls)
    for (let i = 0; i < 400 && E().info().state === 'play' && E().info().levelNum === n; i++) step(1 / 60);
    for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ShiftLeft']) key(k, false);
    const s = E().info();
    out.cleared = (s.levelNum === n + 1 && s.state === 'play') || s.state === 'ending';
    out.caught = s.state === 'caught' || (s.state === 'title' && mode === 'hardcore');
    out.state = s.state;
    out.levelNow = s.levelNum;
    return out;
  }
  async function walkAll(monsters = false) {
    const T = suite('walkAll');
    for (const n of [17, 18, 19, 20]) {
      const r = await walk(n, monsters);
      T.check(`level ${n}: walked through to the way out${monsters ? ' (monsters in)' : ' (monsters out)'}`, r.cleared, r);
      T.note(r);
      await toTitle();
    }
    return T.done();
  }
  /**
   * With their monsters in, in every mode: 17, 19 and 20 (on 20, a clean run and one that stands still for a second
   * less than the Warden's wake first). Not 18: its stalker patrols where it likes, and a bot that cannot hear it
   * walks into it about one run in four - see CLAUDE.md, v17.0.
   */
  async function walkMonsters() {
    const T = suite('walkMonsters');
    for (const mode of ['easy', 'normal', 'hard', 'hardcore']) {
      for (const n of [17, 19, 20]) {
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
    if (best >= 21) T.check('a save past 20: Finished', cont.classList.contains('hidden') && document.getElementById('title').textContent.includes('Finished'));
    if (best <= 1) T.check('a fresh save: Begin starts with the tutorial (level 0)', E().newPlayer());
    if (best === 17) {
      $('btn-continue').click();
      await until(() => E().info().state === 'play' && E().info().levelNum === 17, 4000);
      T.check('Continue from that save: level 17, the broken gaol', E().info().levelNum === 17 && E().info().level.story.kind === 'liar');
      T.check('...its progress intact', ((E().settings().progress || {}).normal || 0) >= 17);
    }
    T.check(`the campaign is ${STORY_LAST} levels (17-20 are story levels)`, E().settings().campaignLevels === 20 && isStoryLevel(17) && isStoryLevel(20) && !isStoryLevel(21));
    T.note({ progress: E().settings().progress, editor: E().settings().editor.unlocked, title: $('mode-tag-' + E().settings().mode) ? $('mode-tag-' + E().settings().mode).textContent : null, cont: $('btn-continue').classList.contains('hidden') ? null : $('btn-continue').textContent });
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ cost
  async function perf() {
    const T = suite('perf');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    for (const n of [16, 17, 18, 19, 20]) {
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

  return { liar, shuffle, loop, behind, walk, walkAll, walkMonsters, firstTime, perf };
})();
