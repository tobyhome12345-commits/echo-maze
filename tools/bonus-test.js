'use strict';

/**
 * BONUS LEVEL TESTS (v15.2). Load into a ?debug page (no other harness needed):
 *   const s = document.createElement('script'); s.src = 'tools/bonus-test.js?' + Date.now(); document.head.appendChild(s);
 * Each suite is async and returns { name, pass, fail, failed: [...], notes } - run them one at a time:
 *   BonusTest.load()      every bonus level through the real store, loader and checker; every exit and key reachable
 *   BonusTest.routes(seeds)  every level played through with the real keys along written routes (ROUTES), each
 *                         route with several random seeds - says how often each cleared, and how close a hunter came
 *   BonusTest.gates()     the spoiler warning and the touch warning stand in front of the Bonus Levels as well
 *   BonusTest.noWrites()  playing, dying in and finishing bonus levels leaves every campaign save, stat and medal alone
 *   BonusTest.copy()      Copy to My Levels: a new id, in Unsorted, editable, and it plays IDENTICALLY (frame hashes)
 *   BonusTest.readOnly()  bundled levels cannot be saved, renamed, deleted, duplicated or opened in the editor
 *   BonusTest.ticks()     the Done ticks: kept in their own key, read back, never touched by My Levels, hostile data
 *   BonusTest.invalid()   a broken bundled level is listed as such and never stops the game
 *   BonusTest.soak(frames, seeds, { calm, cues })  random keys on every bonus level, drawn every 10th frame - exceptions counted
 *   BonusTest.walk(doc, steps, opts)  plays one route (see walk) - the building block of the above
 * Several suites write to localStorage (ticks, copies): run them on a test page and clear it after (BonusTest.clear()).
 */
window.BonusTest = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // (v15.7) the unreleased-content warning now stands between the title and the editor's other screens (it has its own
  // tests in tools/monster-test.js): these suites step through it and go on testing what they always tested
  const passUnreleased = () => {
    const g = window.__echo;
    if (g.editorScreen() === 'unreleased') g.acceptUnreleased();
  };
  const key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
  const tap = (code) => {
    key(code, true);
    key(code, false);
  };
  const B = () => E().bonus;
  const S = () => E().levelStore;
  const docOf = (id) => B().get(id).doc;
  const ids = () => B().list().map((it) => it.id);
  /** A save key in this copy of the game: 'echomaze.' + k (the test copy's are 'echomaze.test.' + k). */
  const KEY = (k) => S().LEVEL_PREFIX.replace('level.', '') + k;

  function suite(name) {
    const results = [];
    const notes = [];
    return {
      check(label, ok, info) {
        results.push({ label, ok: !!ok, info });
        return !!ok;
      },
      note: (s) => notes.push(s),
      done: () => ({ name, pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length, failed: results.filter((r) => !r.ok), notes }),
    };
  }
  function snapshot() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = localStorage.getItem(k);
    }
    return out;
  }
  function diff(a, b, ignore = []) {
    const out = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!ignore.includes(k) && a[k] !== b[k]) out.push(k);
    return out;
  }
  function toTitle() {
    const s = E().info().state;
    if (E().dialog.isOpen()) E().dialog.close && E().dialog.close();
    if (s === 'play' || s === 'paused' || s === 'caught' || s === 'complete' || s === 'card') E().leaveCustom();
    if (E().info().state === 'editor') E().closeEditorScreens();
  }
  async function waitFor(fn, ms = 4000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (fn()) return true;
      await sleep(20);
    }
    return !!fn();
  }

  // ------------------------------------------------------------------ seeded random numbers for one run
  const stream = (seed) => {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /** Run fn with Math.random replaced by two seeded streams (one for audio.js, whose use depends on the clock). */
  function seeded(seed, fn) {
    const real = Math.random;
    const game = stream(seed * 7919 + 13);
    const au = stream(seed * 104729 + 7);
    Math.random = () => (new Error().stack.includes('audio.js') ? au() : game());
    try {
      return fn();
    } finally {
      Math.random = real;
    }
  }

  // ------------------------------------------------------------------ the route player
  /**
   * Plays a level with the real keys along a written route. `steps`, in order:
   *   [x, y]              walk to that tile (the shortest way over the floor, round opts.avoid)
   *   { exit: i }         walk into way out number i (its order in the level's data) - to the key first if it is
   *                       locked and the key is not held yet
   *   { ping: true }      send a ripple             { drop: true }   drop the item (the decoy)
   *   { crouch: bool }    hold / let go of crouch   { wait: secs }   stand still
   *   { until: (I, cs) => bool, max: secs }   stand still until it is true (fails the run after max)
   * opts: { from ('bonus'), seed, avoid: [[x, y]], avoidPuddles, pingEvery (secs), pingBefore (only before that step), maxSeconds,
 *         dodge (walk round every monster where it is right now - what a player knows just after a ping - and step
 *         away when one is in the way), dodgeR (px, 36) }
   * -> { cleared, caught, by, seconds, minGap (px along the path to the nearest hunter), hash (every frame), why }
   */
  function walk(doc, steps, o = {}) {
    return seeded(o.seed || 1, () => walkNow(doc, steps, o));
  }
  function walkNow(doc, steps, o) {
    const e = E();
    const held = new Set();
    const set = (code, on) => {
      if (on && !held.has(code)) {
        held.add(code);
        key(code, true);
      } else if (!on && held.has(code)) {
        held.delete(code);
        key(code, false);
      }
    };
    const err = e.playCustom(doc, o.from || 'bonus');
    if (err) return { error: err };
    const L = e.info().level;
    const W = L.W;
    const H = L.H;
    const avoid = new Set((o.avoid || []).map(([x, y]) => y * W + x));
    if (o.avoidPuddles) for (const p of L.puddles || []) avoid.add(Math.floor(p.y / 40) * W + Math.floor(p.x / 40));
    const ripKey = e.profile.keysFor('ripple')[0] || 'Space';
    const itemKey = e.profile.keysFor('item')[0] || 'KeyE';
    const out = { cleared: false, caught: false, by: null, seconds: 0, minGap: null, hash: 2166136261, why: '', dodged: 0 };
    const mix = (v) => {
      out.hash = Math.imul(out.hash ^ (v | 0), 16777619) >>> 0;
    };
    let si = 0;
    let waitT = 0;
    let pingT = o.pingEvery || 0;
    const maxF = (o.maxSeconds || 150) * 60;
    for (let f = 0; f < maxF; f++) {
      const I = e.info();
      if (I.state === 'complete') {
        out.cleared = true;
        break;
      }
      if (I.state !== 'play') {
        out.caught = I.state === 'caught';
        out.by = e.deathTip ? e.deathTip() : null;
        out.why = `state ${I.state} at step ${si}`;
        break;
      }
      const cs = e.customState();
      const p = I.player;
      const sx = Math.floor(p.x / 40);
      const sy = Math.floor(p.y / 40);
      // the grid to walk on: shut doors are walls until the key is held; avoided tiles are walls (not the one you are on)
      const grid = L.blocked.slice();
      for (const x of cs.exits) grid[x.ty * W + x.tx] = x.locked && !cs.hasKey ? 1 : 0;
      for (const i of avoid) grid[i] = 1;
      // dodge: walk round every monster where it is now (as a player does who has just pinged and seen them)
      const near = [];
      if (o.dodge) {
        for (const m of I.enemies) {
          if (m.kind === 'warden') continue;
          near.push(m);
          const mx = Math.floor(m.x / 40);
          const my = Math.floor(m.y / 40);
          for (let ty = my - 1; ty <= my + 1; ty++) {
            for (let tx = mx - 1; tx <= mx + 1; tx++) {
              if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
              if (Math.hypot((tx + 0.5) * 40 - m.x, (ty + 0.5) * 40 - m.y) < (o.dodgeR || 36)) grid[ty * W + tx] = 1;
            }
          }
        }
      }
      grid[sy * W + sx] = 0;
      let target = null; // [tx, ty, pushInto]
      let st = steps[si];
      // instant steps
      while (st && (st.ping || st.drop || st.crouch !== undefined) && !Array.isArray(st)) {
        if (st.ping) tap(ripKey);
        if (st.drop) tap(itemKey);
        if (st.crouch !== undefined) set('ShiftLeft', !!st.crouch);
        st = steps[++si];
      }
      let still = false;
      if (!st) still = true;
      else if (st.wait !== undefined) {
        still = true;
        waitT += 1 / 60;
        if (waitT >= st.wait) {
          waitT = 0;
          si++;
        }
      } else if (st.until) {
        still = true;
        waitT += 1 / 60;
        if (st.until(I, cs)) {
          waitT = 0;
          si++;
        } else if (waitT > (st.max || 30)) {
          out.why = `waited too long at step ${si}`;
          break;
        }
      } else if (Array.isArray(st)) target = [st[0], st[1], false];
      else if (st.exit !== undefined) {
        const x = cs.exits[st.exit];
        if (x && x.locked && !cs.hasKey && cs.key && !cs.key.taken) target = [Math.floor(cs.key.x / 40), Math.floor(cs.key.y / 40), false];
        else if (x) target = [x.tx, x.ty, true];
      }
      let gx = p.x;
      let gy = p.y;
      if (target) {
        const field = bfsDist(grid, W, H, target[1] * W + target[0]);
        const here = field[sy * W + sx];
        if (here < 0 && o.dodge) {
          // a monster is in the way: step to the free tile next to you that is furthest from them all, or stay
          out.dodged += 1 / 60;
          let best = null;
          let bestD = Math.min(...near.map((m) => Math.hypot(m.x - p.x, m.y - p.y)), Infinity);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const i = (sy + dy) * W + sx + dx;
            if (grid[i]) continue;
            const cx = (sx + dx + 0.5) * 40;
            const cy = (sy + dy + 0.5) * 40;
            const d = Math.min(...near.map((m) => Math.hypot(m.x - cx, m.y - cy)), Infinity);
            if (d > bestD + 8) {
              bestD = d;
              best = [cx, cy];
            }
          }
          gx = best ? best[0] : (sx + 0.5) * 40;
          gy = best ? best[1] : (sy + 0.5) * 40;
        } else if (here < 0) {
          out.why = `no way to ${target[0]},${target[1]} from ${sx},${sy}`;
          break;
        } else if (here === 0) {
          gx = (target[0] + 0.5) * 40;
          gy = (target[1] + 0.5) * 40;
          if (Math.abs(gx - p.x) < 3 && Math.abs(gy - p.y) < 3 && !target[2]) si++;
        } else {
          let next = null;
          let bd = here;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const i = (sy + dy) * W + sx + dx;
            if (field[i] >= 0 && field[i] < bd) {
              bd = field[i];
              next = [sx + dx, sy + dy];
            }
          }
          gx = (next[0] + 0.5) * 40;
          gy = (next[1] + 0.5) * 40;
        }
      }
      set('ArrowRight', !still && gx - p.x > 2.5);
      set('ArrowLeft', !still && gx - p.x < -2.5);
      set('ArrowDown', !still && gy - p.y > 2.5);
      set('ArrowUp', !still && gy - p.y < -2.5);
      for (const m of I.enemies) {
        if (m.kind !== 'warden') continue;
        const d = bfsDist(L.blocked, W, H, Math.floor(m.y / 40) * W + Math.floor(m.x / 40))[sy * W + sx];
        if (d >= 0 && (out.minGap === null || d * 40 < out.minGap)) out.minGap = d * 40;
      }
      if (o.pingEvery > 0 && (o.pingBefore === undefined || si < o.pingBefore)) {
        pingT -= 1 / 60;
        if (pingT <= 0) {
          pingT = o.pingEvery;
          tap(ripKey);
        }
      }
      mix(p.x * 100);
      mix(p.y * 100);
      for (const m of I.enemies) {
        mix(m.x * 100);
        mix(m.y * 100);
        mix(m.state ? m.state.length : 0);
      }
      e.step(1 / 60);
      out.seconds += 1 / 60;
    }
    for (const c of [...held]) set(c, false);
    if (!out.cleared && !out.caught && !out.why) out.why = 'ran out of time';
    out.seconds = +out.seconds.toFixed(2);
    e.leaveCustom();
    return out;
  }

  // ------------------------------------------------------------------ the written routes
  // (tiles are [x, y]; each level's data is in js/bonus-levels.js. These are the ways a careful player would go.)
  const anyTrapped = (I) => I.enemies.some((m) => m.state === 'trapped');
  let sawTrap = false;
  const lureOver = (I) => {
    if (anyTrapped(I)) sawTrap = true;
    return sawTrap && !I.enemies.some((m) => m.state === 'lured' || m.state === 'trapped');
  };
  const ROUTES = {
    'bonus-01-crossroads': [
      { name: 'to the top-left exit', steps: [{ exit: 0 }] },
      { name: 'to the top-right exit', steps: [{ exit: 1 }] },
      { name: 'to the bottom-left exit', steps: [{ exit: 2 }] },
      { name: 'to the bottom-right exit', steps: [{ exit: 3 }] },
      { name: 'to the bottom-right exit, pinging every 1.3 s', steps: [{ exit: 3 }], pingEvery: 1.3 },
    ],
    'bonus-02-shortcut': [
      { name: 'the shortcut, round the guard', steps: [{ exit: 1 }], dodge: true },
      { name: 'the key, then the locked exit', steps: [{ exit: 0 }], dodge: true },
      { name: 'the key, then the locked exit, pinging every 1.5 s', steps: [{ exit: 0 }], dodge: true, pingEvery: 1.5 },
      { name: 'BLIND: the shortcut in the front door, round the top of the room', steps: [[16, 8], [16, 7], [20, 7], { exit: 1 }], info: true },
      { name: 'BLIND: the shortcut in the back door, round the bottom of the room', steps: [[1, 11], [19, 11], [19, 9], [20, 9], { exit: 1 }], info: true },
    ],
    'bonus-03-embers': [
      { name: 'the lit rooms and the east lane', steps: [{ exit: 0 }], dodge: true },
      { name: 'the same, pinging every 2 s', steps: [{ exit: 0 }], dodge: true, pingEvery: 2 },
      { name: 'BLIND: the east lane, round the bottom room by the walls', steps: [[15, 12], [17, 12], [17, 15], { exit: 0 }], info: true },
    ],
    'bonus-04-lure': [
      {
        name: 'decoy into the far room, hide, wait, through the gap, the dry way',
        steps: [[6, 14], [4, 3], { drop: true }, [1, 12], { until: (I) => lureOver(I), max: 40 }, { exit: 0 }],
        avoidPuddles: true,
        dodge: true,
        reset: () => (sawTrap = false),
      },
      {
        name: 'decoy, then the quick (wet) way',
        steps: [[6, 14], [4, 3], { drop: true }, [1, 12], { until: (I) => lureOver(I), max: 40 }, { exit: 0 }],
        dodge: true,
        reset: () => (sawTrap = false),
      },
      { name: 'NO DECOY, NO RIPPLE: wait for the gap to clear (it never does)', steps: [{ exit: 0 }], avoidPuddles: true, dodge: true, info: true, maxSeconds: 40 },
      {
        name: 'no decoy: a ripple at it from the hub (crouch only once the wave has landed - crouching wipes it), away, wait, round it',
        steps: [[8, 8], { ping: true }, { wait: 0.6 }, { crouch: true }, [1, 12], { until: (I) => I.enemies.some((m) => m.kind === 'echo' && m.state === 'idle'), max: 40 }, { crouch: false }, { exit: 0 }],
        avoidPuddles: true,
        dodge: true,
      },
    ],
    'bonus-05-the-long-way': [
      { name: 'a clean run', steps: [{ exit: 0 }] },
      { name: 'pinging every 1.5 s', steps: [{ exit: 0 }], pingEvery: 1.5 },
      { name: 'a 2 s pause at the start', steps: [{ wait: 2 }, { exit: 0 }] },
      { name: 'one wrong turn (the first dead end)', steps: [[20, 16], { exit: 0 }] },
      { name: 'two wrong turns', steps: [[20, 16], [24, 16], { exit: 0 }] },
      { name: 'a 4 s pause at the start', steps: [{ wait: 4 }, { exit: 0 }], info: true },
    ],
    'bonus-06-everything-at-once': [
      { name: 'the key way', steps: [{ exit: 1 }], dodge: true },
      { name: 'the key way, 2 s of hesitation at the start', steps: [{ wait: 2 }, { exit: 1 }], dodge: true },
      { name: 'the open way, dry', steps: [{ exit: 0 }], avoidPuddles: true, dodge: true },
      { name: 'the open way, through the puddles', steps: [{ exit: 0 }], dodge: true },
      { name: 'the open way, dry, pinging every 1.8 s', steps: [{ exit: 0 }], avoidPuddles: true, dodge: true, pingEvery: 1.8 },
      { name: 'BLIND: the key way, the shortest way past the glow in the lit room', steps: [{ exit: 1 }] },
    ],
  };
  function runRoute(id, r, seed, doc) {
    if (r.reset) r.reset();
    return walk(doc || docOf(id), r.steps, { seed, avoid: r.avoid, avoidPuddles: r.avoidPuddles, pingEvery: r.pingEvery, pingBefore: r.pingBefore, dodge: r.dodge, maxSeconds: r.maxSeconds });
  }

  // ------------------------------------------------------------------ suites
  async function load() {
    const T = suite('load');
    toTitle();
    const list = B().list();
    T.check('there are six bonus levels, in their order', list.length === 6 && list.map((it) => it.title).join('|') === 'Crossroads|Shortcut|Embers|Lure|The Long Way|Everything at Once', list.map((it) => it.title).join('|'));
    T.check('ratings escalate: Easy, Easy, Normal, Normal, Hard, Hardcore', list.map((it) => it.rating).join(',') === 'easy,easy,normal,normal,hard,hardcore', list.map((it) => it.rating).join(','));
    T.check('the source is read-only and registered with the store', B().writable === false && S().source('bonus') === B());
    const kinds = new Set();
    for (const it of list) {
      const got = B().get(it.id);
      T.check(`${it.title}: read through the loader with nothing repaired, not foreign`, got.doc && got.notes.length === 0 && !got.foreign && got.readOnly, got.notes);
      const doc = got.doc;
      const v = E().levelCheck.check(doc);
      T.check(`${it.title}: the checker says playable, no warnings`, v.playable && v.warnings.length === 0, { errors: v.errors.map((x) => x.code), warnings: v.warnings.map((x) => x.code) });
      T.check(`${it.title}: every exit can be reached`, v.reach.length === doc.exits.length && v.reach.every(Boolean), v.reach);
      const built = buildCustomLevel(doc);
      T.check(`${it.title}: the engine's loader builds it`, !!built.level, built.error);
      if (!built.level) continue;
      const L = built.level;
      // independently: walk the built level's own grid (shut doors shut until the key)
      const W = L.W;
      const sTile = Math.floor(L.start.y / 40) * W + Math.floor(L.start.x / 40);
      const shut = L.blocked.slice();
      for (const x of L.exits) shut[x.ty * W + x.tx] = x.locked ? 1 : 0;
      const dS = bfsDist(shut, W, L.H, sTile);
      if (L.key) {
        const kTile = Math.floor(L.key.y / 40) * W + Math.floor(L.key.x / 40);
        T.check(`${it.title}: the key can be reached without the key`, dS[kTile] >= 0);
        const open = L.blocked.slice();
        for (const x of L.exits) open[x.ty * W + x.tx] = 0;
        const dK = bfsDist(open, W, L.H, kTile);
        for (const x of L.exits) if (x.locked) T.check(`${it.title}: the locked exit at ${x.tx},${x.ty} can be reached from the key`, dK[x.ty * W + x.tx] >= 0);
      }
      for (const x of L.exits) if (!x.locked) T.check(`${it.title}: the exit at ${x.tx},${x.ty} can be walked to`, dS[x.ty * W + x.tx] >= 0, dS[x.ty * W + x.tx]);
      if (L.decoy) T.check(`${it.title}: the decoy can be reached`, dS[Math.floor(L.decoy.y / 40) * W + Math.floor(L.decoy.x / 40)] >= 0);
      for (const m of doc.enemies) kinds.add(m.kind + (m.variant ? `/${m.variant}` : ''));
      T.check(`${it.title}: no story or lore text (no notes; card <= 80)`, !doc.objects.some((o) => o.kind === 'note') && doc.titleCard.length <= 80);
    }
    T.note(`monster kinds used: ${[...kinds].join(', ')}`);
    T.check('the finale has more than one monster type, two exits, a key and effects', (() => {
      const d = docOf('bonus-06-everything-at-once');
      return new Set(d.enemies.map((m) => m.kind)).size >= 3 && d.exits.length === 2 && d.objects.some((o) => o.kind === 'key') && d.effects.length > 0 && d.enemies.some((m) => m.variant === 'upgraded') && d.enemies.some((m) => m.kind === 'mimic');
    })());
    T.check('level 5 has a regular Level 15 monster', docOf('bonus-05-the-long-way').enemies.some((m) => m.kind === 'warden' && m.variant === 'regular'));
    T.check(`none of them is in the campaign: ${STORY_LAST} levels, no bonus title in the level select`, E().settings().campaignLevels === STORY_LAST && !list.some((it) => $('replay').textContent.includes(it.title)));
    return T.done();
  }

  /** Every route, several seeds. -> per route: cleared n of N, seconds, smallest gap to a hunter. */
  async function routes(seeds = [1, 2, 3, 4, 5, 6], only = null) {
    const T = suite('routes');
    toTitle();
    const table = [];
    for (const id of Object.keys(ROUTES)) {
      if (only && !only.includes(id)) continue;
      for (const r of ROUTES[id]) {
        const res = [];
        for (const seed of seeds) {
          res.push(runRoute(id, r, seed));
          await sleep(0);
        }
        const cleared = res.filter((x) => x.cleared).length;
        const gaps = res.filter((x) => x.minGap !== null).map((x) => x.minGap);
        const row = { level: id, route: r.name, cleared: `${cleared}/${res.length}`, seconds: res.filter((x) => x.cleared).map((x) => x.seconds), minGap: gaps.length ? Math.min(...gaps) : null, fails: res.filter((x) => !x.cleared).map((x) => `${x.caught ? `caught (${x.by || '?'})` : x.why || x.error}`) };
        table.push(row);
        if (!r.info) T.check(`${id}: ${r.name} - cleared ${row.cleared}`, cleared > 0, row);
      }
    }
    T.note(table);
    return Object.assign(T.done(), { table });
  }

  async function gates() {
    const T = suite('gates');
    toTitle();
    const keep = localStorage.getItem(KEY('editor'));
    const progress = localStorage.getItem(KEY('progress'));
    localStorage.removeItem(KEY('editor'));
    localStorage.setItem(KEY('progress'), JSON.stringify({ easy: 3, normal: 3, hard: 1, hardcore: 1 }));
    E().features({ touch: false });
    E().openEditorScreens(); passUnreleased();
    T.check('not unlocked: the spoiler warning comes first', E().editorScreen() === 'gate' && $('editor-gate').classList.contains('in'));
    T.check('...and the Bonus Levels are not on screen behind it (a screen that is up has .in)', !$('mylevels').classList.contains('in'));
    tap('Escape');
    await waitFor(() => E().info().state === 'title');
    T.check('Back from the warning: the title, nothing saved', E().info().state === 'title' && localStorage.getItem(KEY('editor')) === null);
    E().openEditorScreens(); passUnreleased();
    E().acceptGate(); passUnreleased();
    E().myLevels.setView('bonus');
    T.check('I understand: the list, and the Bonus Levels tab', E().editorScreen() === 'list' && E().myLevels.view() === 'bonus' && $('mylevels-list').querySelectorAll('.lv-row.bonus').length === 6);
    E().closeEditorScreens();
    // touch controls on: the touch warning, every time, before the list
    E().features({ touch: true });
    E().openEditorScreens(); passUnreleased();
    T.check('touch controls on: the touch warning comes first', E().editorScreen() === 'touch' && $('editor-touch').classList.contains('in') && !$('mylevels').classList.contains('in'));
    E().acceptTouchGate();
    T.check('...then the list - opened from the title, it is always My Levels first', E().editorScreen() === 'list' && E().myLevels.view() === 'mine');
    E().myLevels.setView('bonus');
    // a bonus level played from the list and left goes back to the list - no warning in that way
    const err = E().playCustom(docOf('bonus-01-crossroads'), 'bonus');
    T.check('a bonus level plays from there', !err && E().customRun().from === 'bonus');
    E().leaveCustom();
    T.check('leaving it: back on Bonus Levels, no warning', E().editorScreen() === 'list' && E().myLevels.view() === 'bonus');
    E().closeEditorScreens();
    E().openEditorScreens(); passUnreleased();
    T.check('touch on: asked again next time from the title', E().editorScreen() === 'touch');
    E().closeEditorScreens();
    E().features({ touch: false });
    if (keep === null) localStorage.removeItem(KEY('editor'));
    else localStorage.setItem(KEY('editor'), keep);
    if (progress === null) localStorage.removeItem(KEY('progress'));
    else localStorage.setItem(KEY('progress'), progress);
    return T.done();
  }

  async function noWrites() {
    const T = suite('noWrites');
    toTitle();
    localStorage.setItem(S().LEVEL_PREFIX.replace('level.', 'editor'), '1');
    const statsBefore = JSON.stringify(E().stats());
    const medalsBefore = JSON.stringify(E().medals());
    const before = snapshot();
    const doneBefore = B().doneIds().slice();
    // every level through to the end (the first route that clears it), and one death on a level with a hunter
    for (const id of Object.keys(ROUTES)) {
      let ok = false;
      for (const r of ROUTES[id]) {
        for (const seed of [1, 2, 3]) {
          const res = runRoute(id, r, seed);
          if (res.cleared) {
            ok = true;
            break;
          }
        }
        if (ok) break;
      }
      T.check(`${id}: finished once`, ok);
      await sleep(0);
    }
    const caught = walk(docOf('bonus-05-the-long-way'), [{ wait: 20 }], { seed: 9 });
    T.check('standing still on The Long Way: caught', caught.caught, caught);
    // through the real screens: caught -> Try again -> pause -> back
    E().openEditorScreens(); passUnreleased();
    E().myLevels.setView('bonus');
    E().playCustom(docOf('bonus-05-the-long-way'), 'bonus');
    for (let i = 0; i < 60 * 20 && E().info().state === 'play'; i++) E().step(1 / 60);
    T.check('caught on a bonus level: Try again is offered (whatever the rating)', E().info().state === 'caught');
    await waitFor(() => !$('caught').classList.contains('hidden'), 3000);
    T.check('the Caught screen goes back to Bonus Levels', $('btn-caught-title').textContent === 'Back to Bonus Levels', $('btn-caught-title').textContent);
    $('btn-retry').click();
    await waitFor(() => E().info().state === 'play' || E().info().state === 'card', 4000);
    T.check('Try again plays it again', E().info().state === 'play' || E().info().state === 'card', E().info().state);
    E().leaveCustom();
    E().closeEditorScreens();
    const after = snapshot();
    const changed = diff(before, after, [S().BONUS_KEY]);
    T.check('localStorage: nothing changed but the Done ticks', changed.length === 0, changed);
    T.check('the ticks key now lists the six levels', B().doneIds().length === 6, { before: doneBefore, after: B().doneIds() });
    T.check('stats identical', JSON.stringify(E().stats()) === statsBefore);
    T.check('medals identical', JSON.stringify(E().medals()) === medalsBefore);
    const P = S().LEVEL_PREFIX.replace('level.', '');
    T.check('campaign progress, seen scenes, fragments untouched', ['progress', 'seen', 'lore', 'medals', 'stats'].every((k) => before[P + k] === after[P + k]));
    T.note(`compared ${Object.keys(before).length} keys: ${Object.keys(before).join(', ')}`);
    return T.done();
  }

  async function copy() {
    const T = suite('copy');
    toTitle();
    localStorage.setItem(KEY('editor'), '1');
    const strip = (d) => {
      const c = JSON.parse(E().levelFormat.serialise(d));
      delete c.id;
      delete c.createdAt;
      delete c.updatedAt;
      return JSON.stringify(c);
    };
    for (const id of ids()) {
      const orig = docOf(id);
      const res = S().copyToMine('bonus', id);
      T.check(`${orig.title}: copied`, res.ok, res.error);
      if (!res.ok) continue;
      const c = res.doc;
      T.check(`${orig.title}: a new id of its own`, c.id !== id && E().levelFormat.validId(c.id) && !S().readOnly(c.id));
      T.check(`${orig.title}: in My Levels, in Unsorted`, !!S().get(c.id) && S().folderOf(c.id) === null && S().list().some((it) => it.id === c.id && !it.folder));
      T.check(`${orig.title}: the same level (everything but id and dates)`, strip(c) === strip(orig));
      // it plays identically: the same route, the same random numbers -> the same frames
      const r = ROUTES[id][0];
      const a = runRoute(id, r, 3, orig);
      const b = runRoute(id, r, 3, S().get(c.id).doc);
      T.check(`${orig.title}: plays identically (frame hash ${a.hash.toString(16)})`, a.hash === b.hash && a.cleared === b.cleared && a.seconds === b.seconds, { a, b });
      // and it can be changed
      T.check(`${orig.title}: the copy opens in the editor`, E().openEditor(S().get(c.id).doc) !== false && E().editorScreen() === 'editor' && E().editor.isOpen());
      E().closeEditorScreens();
      const mine = S().get(c.id).doc;
      mine.title = 'My own version';
      T.check(`${orig.title}: the copy saves changes`, S().save(mine).ok && S().get(c.id).doc.title === 'My own version');
      T.check(`${orig.title}: the bonus level is unchanged`, strip(docOf(id)) === strip(orig) && docOf(id).title === orig.title);
      S().delete(c.id);
      await sleep(0);
    }
    // through the screen: the button, the dialog, the copy in Unsorted
    E().openEditorScreens(); passUnreleased();
    E().myLevels.setView('bonus');
    const n0 = S().list().length;
    const btn = $('mylevels-list').querySelector('.lv-row.bonus [data-act="copy"]');
    btn.click();
    await waitFor(() => E().dialog.isOpen(), 2000);
    T.check('Copy to My Levels (the button): a dialog says where it went', E().dialog.isOpen() && /Unsorted/.test($('dialog').textContent));
    const ok = [...document.querySelectorAll('#dialog button')].find((b) => b.textContent === 'OK');
    if (ok) ok.click();
    await waitFor(() => !E().dialog.isOpen(), 2000);
    const added = S().list().filter((it) => it.title === 'Crossroads');
    T.check('...and My Levels has it', S().list().length === n0 + 1 && added.length >= 1);
    E().myLevels.setView('mine');
    E().myLevels.show('unsorted');
    T.check('...listed in Unsorted', [...$('mylevels-list').querySelectorAll('.lv-row b')].some((b) => b.textContent === 'Crossroads'));
    // the dialog's other button: straight into the editor with the copy
    E().myLevels.setView('bonus');
    $('mylevels-list').querySelectorAll('.lv-row.bonus [data-act="copy"]')[1].click();
    await waitFor(() => E().dialog.isOpen(), 2000);
    const edit = [...document.querySelectorAll('#dialog button')].find((b) => b.textContent === 'Edit the copy');
    if (edit) edit.click();
    await waitFor(() => E().editorScreen() === 'editor', 2000);
    T.check('Edit the copy: the editor opens on it', E().editorScreen() === 'editor' && $('ed-title').value === 'Shortcut');
    for (const it of S().list()) if (it.title === 'Crossroads' || it.title === 'Shortcut') S().delete(it.id);
    E().closeEditorScreens();
    return T.done();
  }

  async function readOnly() {
    const T = suite('readOnly');
    toTitle();
    localStorage.setItem(KEY('editor'), '1');
    const raw = JSON.stringify(ECHO_BONUS_LEVELS);
    const before = snapshot();
    const id = 'bonus-03-embers';
    const doc = docOf(id);
    const r1 = B().save(doc);
    T.check('the bonus source refuses to save', !r1.ok && /cannot be changed/.test(r1.error), r1);
    T.check('...to delete', B().delete(id) === false && !!B().get(id));
    const r2 = B().duplicate(id);
    T.check('...to duplicate', !r2.ok);
    const r3 = S().save(doc);
    T.check('My Levels refuses a level under a bonus level\'s id', !r3.ok && localStorage.getItem(`${S().LEVEL_PREFIX}${id}`) === null, r3);
    const renamed = docOf(id);
    renamed.title = 'Renamed';
    T.check('renaming (a save) is refused the same way', !S().save(renamed).ok && docOf(id).title === 'Embers');
    E().openEditorScreens(); passUnreleased();
    const edTitle = $('ed-title').value;
    T.check('the editor will not open a bonus level', E().openEditor(doc) === false && E().editorScreen() === 'list' && !$('editor').classList.contains('in') && $('ed-title').value === edTitle);
    E().myLevels.setView('bonus');
    const acts = [...$('mylevels-list').querySelectorAll('.lv-row.bonus')].map((r) => [...r.querySelectorAll('button')].map((b) => b.dataset.act).join(','));
    T.check('each bonus row has only Play and Copy to My Levels', acts.length === 6 && acts.every((a) => a === 'play,copy'), acts);
    T.check('no New level / New folder / folders on the Bonus Levels tab', getComputedStyle($('btn-mylevels-new')).display === 'none' && getComputedStyle($('mylevels-bar')).display === 'none');
    const got = B().get(id);
    got.doc.walls[1] = '#'.repeat(got.doc.size.w);
    got.doc.enemies.length = 0;
    T.check('changing what get() handed out changes nothing', JSON.stringify(docOf(id).walls) === JSON.stringify(doc.walls) && docOf(id).enemies.length === 2);
    E().closeEditorScreens();
    T.check('the bundled data itself never changed', JSON.stringify(ECHO_BONUS_LEVELS) === raw);
    T.check('nothing was written', diff(before, snapshot()).length === 0, diff(before, snapshot()));
    return T.done();
  }

  async function ticks() {
    const T = suite('ticks');
    toTitle();
    localStorage.setItem(KEY('editor'), '1');
    const K = S().BONUS_KEY;
    T.check('their own key: echomaze.bonus (apart from progress, stats, medals and My Levels)', /^echomaze.(test.)?bonus$/.test(K) && !K.startsWith(S().LEVEL_PREFIX));
    localStorage.removeItem(K);
    T.check('none done to begin with', B().doneIds().length === 0 && B().list().every((it) => !it.done));
    // not ticked: caught, left half way, test-played as a copy
    walk(docOf('bonus-05-the-long-way'), [{ wait: 20 }], { seed: 2 });
    walk(docOf('bonus-01-crossroads'), [{ wait: 1 }], { seed: 2, maxSeconds: 2 });
    const c = S().copyToMine('bonus', 'bonus-01-crossroads');
    walk(S().get(c.doc.id).doc, [{ exit: 0 }], { from: 'editor', seed: 2 });
    walk(S().get(c.doc.id).doc, [{ exit: 0 }], { from: 'mylevels', seed: 2 });
    T.check('not ticked: caught, left half way, or the COPY finished (test play and from My Levels)', B().doneIds().length === 0, B().doneIds());
    // ticked: finished from Bonus Levels
    const r = walk(docOf('bonus-01-crossroads'), [{ exit: 0 }], { seed: 2 });
    T.check('finished from Bonus Levels: ticked', r.cleared && B().isDone('bonus-01-crossroads') && B().doneIds().length === 1);
    const stored = JSON.parse(localStorage.getItem(K));
    T.check('stored as { schemaVersion: 1, done: { id: date } }', stored.schemaVersion === 1 && Object.keys(stored.done).join() === 'bonus-01-crossroads' && !isNaN(Date.parse(stored.done['bonus-01-crossroads'])));
    const first = stored.done['bonus-01-crossroads'];
    walk(docOf('bonus-01-crossroads'), [{ exit: 1 }], { seed: 3 });
    T.check('finishing it again keeps the first date (no new write)', JSON.parse(localStorage.getItem(K)).done['bonus-01-crossroads'] === first);
    // read back as a fresh page would (a new source over the same data and key)
    const fresh = S().readOnlySource('bonus-check', 'x', ECHO_BONUS_LEVELS, { doneKey: K });
    T.check('read back by a fresh reader (as after a reload)', fresh.isDone('bonus-01-crossroads') && !fresh.isDone('bonus-02-shortcut'));
    // My Levels does not touch them
    S().delete(c.doc.id);
    for (const it of S().list()) S().delete(it.id);
    T.check('deleting every level in My Levels leaves the ticks', B().isDone('bonus-01-crossroads'));
    T.check('no bonus level ever appears in My Levels', !S().list().some((it) => it.id.startsWith('bonus-')));
    // on screen
    E().openEditorScreens(); passUnreleased();
    E().myLevels.setView('bonus');
    const row = $('mylevels-list').querySelector('.lv-row[data-id="bonus-01-crossroads"]');
    T.check('the row shows Done, the tab counts 1/6', row.classList.contains('done') && /Done/.test(row.textContent) && $('lv-bonus-count').textContent === '1/6');
    E().myLevels.setView('mine');
    T.check('the count shows on the My Levels tab too', $('lv-bonus-count').textContent === '1/6');
    E().closeEditorScreens();
    // hostile data under the key: never throws, a bad entry is just not a tick
    const hostile = ['', 'not json', '[]', 'null', '{"done":[1,2]}', '{"done":{"__proto__":"x","bonus-02-shortcut":"yesterday"}}', '{"done":{"bonus-02-shortcut":5,"../x":"2026-01-01"}}', JSON.stringify({ done: { 'bonus-03-embers': '2026-10-01T00:00:00Z' } }), 'x'.repeat(300000)];
    let threw = 0;
    const seen = [];
    for (const h of hostile) {
      localStorage.setItem(K, h);
      try {
        seen.push(B().doneIds().join('+'));
        B().list();
        E().myLevels.render();
      } catch (e) {
        threw++;
      }
    }
    T.check('hostile tick data: nothing threw', threw === 0, seen);
    T.check('...a real date counts, nothing else makes a tick (not a word, not a number, not a bad id)', seen[7] === 'bonus-03-embers' && seen.slice(0, 7).every((s) => s === '') && seen[8] === '', seen);
    localStorage.setItem(K, 'not json');
    T.check('...and the next finish writes a clean list again', B().markDone('bonus-02-shortcut') && JSON.parse(localStorage.getItem(K)).done['bonus-02-shortcut']);
    localStorage.removeItem(K);
    return T.done();
  }

  async function invalid() {
    const T = suite('invalid');
    toTitle();
    localStorage.setItem(KEY('editor'), '1');
    const good = JSON.parse(JSON.stringify(ECHO_BONUS_LEVELS[0]));
    const noExit = Object.assign(JSON.parse(JSON.stringify(good)), { id: 'no-exit', exits: [] });
    const future = Object.assign(JSON.parse(JSON.stringify(good)), { id: 'future', schemaVersion: 99, glitter: true });
    const entries = [null, 'a string', 42, {}, { id: 'walls-wrong', walls: 5 }, Object.assign(JSON.parse(JSON.stringify(good)), { id: 'twice' }), Object.assign(JSON.parse(JSON.stringify(good)), { id: 'twice' }), { id: '__proto__' }, noExit, future, { format: 'something-else', id: 'not-a-level' }];
    let src = null;
    let threw = null;
    try {
      src = S().readOnlySource('broken', 'Broken', entries, {});
    } catch (e) {
      threw = e;
    }
    T.check('a source of broken entries is made without throwing', !threw && !!src, threw && threw.message);
    const list = src.list();
    T.check('each entry is listed, none playable but the good ones', list.length === entries.length && list.filter((it) => it.playable).map((it) => it.id).join() === 'twice,future', list.map((it) => `${it.id}:${it.playable ? 'ok' : it.problem}`));
    T.check('damaged entries say why', list.filter((it) => it.damaged).every((it) => typeof it.problem === 'string' && it.problem.length > 0));
    T.check('the repeated id: only the first keeps it', list.filter((it) => it.id === 'twice').length === 1);
    T.check('get() of a damaged one: damaged, no throw', src.get('broken-entry-1').damaged === true);
    T.check('the unplayable one is refused by the engine\'s loader with a sentence', typeof E().playCustom(src.get('no-exit').doc, 'bonus') === 'string' && E().info().state !== 'play');
    T.check('no data at all: an empty list', S().readOnlySource('none', 'None', undefined).list().length === 0);
    // the screen with a broken source: borrow its calls for a moment
    const real = { list: B().list, get: B().get };
    B().list = src.list;
    B().get = src.get;
    let uiThrew = null;
    try {
      E().openEditorScreens(); passUnreleased();
      E().myLevels.setView('bonus');
    } catch (e) {
      uiThrew = e;
    }
    const rows = [...$('mylevels-list').querySelectorAll('.lv-row.bonus')];
    T.check('the Bonus Levels tab lists them all without throwing', !uiThrew && rows.length === entries.length, uiThrew && uiThrew.message);
    T.check('Play is off on every one that cannot be played', rows.filter((r) => !r.querySelector('[data-act="play"]').disabled).length === 2);
    T.check('a broken one says it cannot be played', rows.some((r) => /can't be played/.test(r.textContent)));
    B().list = () => [];
    E().myLevels.render();
    T.check('no bonus levels at all: the tab says so', /no bonus levels/.test($('mylevels-list').textContent));
    B().list = real.list;
    B().get = real.get;
    E().myLevels.render();
    T.check('back to the real six', $('mylevels-list').querySelectorAll('.lv-row.bonus').length === 6);
    E().closeEditorScreens();
    return T.done();
  }

  /** Random keys on every bonus level; exceptions counted, storage compared (but for the ticks). */
  async function soak(frames = 3000, seeds = [1, 2, 3], opts = {}) {
    const T = suite('soak');
    toTitle();
    const before = snapshot();
    let errors = 0;
    let total = 0;
    const firstErrors = [];
    const onErr = (ev) => {
      errors++;
      if (firstErrors.length < 5) firstErrors.push(String(ev.message || ev));
    };
    window.addEventListener('error', onErr);
    const codes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'KeyE'];
    let caught = 0;
    let cleared = 0;
    if (opts.calm) E().setCalm(true);
    if (opts.cues) E().setVisualCues(true);
    for (const id of ids()) {
      for (const seed of seeds) {
        seeded(seed * 31 + id.length, () => {
          const r = stream(seed);
          const held = new Set();
          try {
            E().playCustom(docOf(id), 'bonus');
            for (let f = 0; f < frames; f++) {
              if (f % 12 === 0) {
                const c = codes[Math.floor(r() * codes.length)];
                if (held.has(c)) {
                  held.delete(c);
                  key(c, false);
                } else {
                  held.add(c);
                  key(c, true);
                }
                if (c === 'Space' || c === 'KeyE') {
                  held.delete(c);
                  key(c, false);
                }
              }
              const st = E().info().state;
              if (st === 'caught' || st === 'complete') {
                if (st === 'caught') caught++;
                else cleared++;
                E().leaveCustom();
                E().playCustom(docOf(id), 'bonus');
              }
              E().step(1 / 60);
              if (f % 10 === 0) E().draw(); // (the picture too: effect zones, the art, the cues)
              total++;
            }
          } catch (e) {
            onErr(e);
          }
          for (const c of held) key(c, false);
          E().leaveCustom();
        });
        await sleep(0);
      }
    }
    window.removeEventListener('error', onErr);
    if (opts.calm) E().setCalm(false);
    if (opts.cues) E().setVisualCues(false);
    // (those two are the player's own settings, which this test switched: put them back as they were)
    for (const k of [KEY('calm'), KEY('visualcues')]) {
      if (before[k] === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, before[k]);
    }
    T.check(`no exceptions in ${total} frames`, errors === 0, firstErrors);
    T.check('storage: nothing but the ticks changed', diff(before, snapshot(), [S().BONUS_KEY]).length === 0, diff(before, snapshot(), [S().BONUS_KEY]));
    T.note(`${total} frames, ${caught} catches, ${cleared} clears`);
    return T.done();
  }

  function clear() {
    for (const k of Object.keys(snapshot())) if (k.startsWith('echomaze.')) localStorage.removeItem(k);
  }

  return { load, routes, gates, noWrites, copy, readOnly, ticks, invalid, soak, walk, ROUTES, runRoute, seeded, clear, snapshot, diff };
})();
