/*
 * tools/endless-test.js (v20.0) - Endless mode in the real game. Load it into a ?debug page and run one suite at a
 * time (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   EndlessTest.unlock()   with whatever save the page opened with: the button is there only once level 12 has been
 *                          cleared in some mode (a fresh save: not there, and a run cannot be started)
 *   EndlessTest.run()      a run: the button starts it at depth 1, the HUD says the depth, no banner, no fragment; the
 *                          depth in play is the one (run seed, depth) builds; a cleared depth goes on to the next
 *                          behind a fade; a milestone chime at 5 and 10; "New best!" when you pass your best
 *   EndlessTest.caught()   caught: Depth N, the best, "New best!", the Caught screen's own line - and (v20.1) on
 *                          Normal Try again is the same depth at once (the same maze), on Hardcore a new run from depth 1
 *                          (a new seed); Enter too; Back to title
 *   EndlessTest.modes()    each difficulty keeps its own best; storage that throws: the mode still works
 *   EndlessTest.noWrites() a run (cleared depths, a catch, Try again, quitting) writes nothing but Endless's own key -
 *                          not progress, medals, stats, lore, seen - and Continue is what it was
 *   EndlessTest.bot(n)     a run played through n depths (default 60) with the real keys along the shortest way out
 *                          (the monsters taken out, so the bot can get there), the real fades between - no error
 *   EndlessTest.live(to)   the REAL game loop at every depth 1..to with its monsters in (every kind, the Alarm too),
 *                          a ripple out at each: no console error, nothing caught by the loop
 *   EndlessTest.fair(to)   every depth 1..to of a run in each mode, built in the page: passes the fairness rules
 *   EndlessTest.screen()   at the page's size: the button, the game-over screen and its buttons fit (44 px on touch),
 *                          the joystick there during a run, a frame of depth 30 and 60 well inside 60 fps
 */
window.EndlessTest = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TILE = 40;
  async function until(fn, ms = 4000) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (fn()) return true;
      await sleep(25);
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
      note: (x) => out.notes.push(x),
      done: () => out,
    };
  }
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const press = (code) => {
    key(code, true);
    key(code, false);
  };
  const step = (s) => E().step(s);
  const info = () => E().info();
  const L = () => info().level;
  const P = () => info().player;
  const shown = (id) => $(id) && !$(id).classList.contains('hidden') && getComputedStyle($(id)).display !== 'none';
  const settled = () => until(() => !E().ui().transitioning, 3000);
  async function toTitle() {
    if (info().state !== 'title') E().toTitle();
    await until(() => info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(40);
  }
  const hashLevel = (lv) => {
    let h = 2166136261;
    const add = (v) => {
      h ^= v & 0xffff;
      h = Math.imul(h, 16777619) >>> 0;
    };
    for (const w of lv.walls) add(w);
    for (const e of lv.enemies) add(Math.round(e.x) * 7 + Math.round(e.y));
    add(lv.exit.x);
    add(lv.exit.y);
    return h.toString(16);
  };
  /** Start a run from the title the way a player does: the Endless button. */
  async function begin(seed) {
    await toTitle();
    E().endless.start(seed);
    await until(() => info().state === 'play', 2000);
    step(0.05);
  }
  /** On to the next depth: stand on the way out, and let the fade play. */
  async function clearDepth() {
    const d = E().endless.state().depth;
    const ex = L().exit;
    E().tp(ex.x, ex.y);
    step(1 / 60);
    step(1 / 60);
    await until(() => E().endless.state() && E().endless.state().depth === d + 1 && info().state === 'play' && !E().ui().transitioning, 4000);
    return E().endless.state() && E().endless.state().depth === d + 1;
  }
  /** Walk with the real keys to (x, y) - tile by tile along the shortest way. Returns whether it got there. */
  function walkPath(lv, tx, ty, maxSecs = 120) {
    const W = lv.W;
    const p0 = P();
    const s = Math.floor(p0.y / TILE) * W + Math.floor(p0.x / TILE);
    const goal = ty * W + tx;
    const prev = new Int32Array(W * lv.H).fill(-1);
    prev[s] = s;
    const q = [s];
    for (let h = 0; h < q.length && prev[goal] < 0; h++) {
      const i = q[h];
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= W * lv.H || prev[j] >= 0 || lv.blocked[j]) continue;
        prev[j] = i;
        q.push(j);
      }
    }
    if (prev[goal] < 0) return false;
    const route = [];
    for (let i = goal; i !== s; i = prev[i]) route.push(i);
    route.reverse();
    let frames = 0;
    for (const i of route) {
      const x = (i % W + 0.5) * TILE;
      const y = (Math.floor(i / W) + 0.5) * TILE;
      for (let t = 0; t < 240; t++) {
        const p = P();
        const dx = x - p.x;
        const dy = y - p.y;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) break;
        key('ArrowRight', dx > 2);
        key('ArrowLeft', dx < -2);
        key('ArrowDown', dy > 2);
        key('ArrowUp', dy < -2);
        step(1 / 60);
        if (++frames > maxSecs * 60 || info().state !== 'play') break;
      }
      if (info().state !== 'play') break;
    }
    for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) key(k, false);
    return true;
  }
  function errorWatch() {
    const errs = [];
    const oe = console.error;
    console.error = (...a) => {
      errs.push(a.map((x) => String((x && x.stack) || x)).join(' ').slice(0, 300));
      oe.apply(console, a);
    };
    const onErr = (e) => errs.push(String(e.message || e));
    window.addEventListener('error', onErr);
    const fe0 = E().frameErrors();
    return {
      errs,
      frameErrors: () => E().frameErrors() - fe0,
      stop() {
        console.error = oe;
        window.removeEventListener('error', onErr);
      },
    };
  }

  // ------------------------------------------------------------------------------------------ unlocking
  async function unlock() {
    const T = suite('unlock');
    await toTitle();
    const best = Math.max(...['easy', 'normal', 'hard', 'hardcore'].map((m) => (E().settings().progress || {})[m] || 1));
    const open = best >= 13;
    await sleep(100);
    T.note({ best, unlocked: E().endless.unlocked() });
    T.check(`best level ${best}: the Endless button is ${open ? 'there' : 'not there at all'}`, shown('btn-endless') === open && E().endless.unlocked() === open);
    if (!open) {
      E().endless.start();
      T.check('...and a run cannot be started', info().state === 'title' && !E().endless.state());
    } else {
      $('btn-endless').click();
      await until(() => info().state === 'play' && E().endless.state(), 3000);
      T.check('...and it starts a run at depth 1', info().state === 'play' && E().endless.state().depth === 1 && info().levelNum === -2);
      T.check(`the Alarm in it only once it has been met (best ${best}: ${E().endless.alarmMet() ? 'met' : 'not met'})`, E().endless.alarmMet() === best >= 22);
    }
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ a run
  async function run() {
    const T = suite('run');
    const w = errorWatch();
    try {
      localStorage.removeItem('echomaze.endless');
      await toTitle();
      $('btn-endless').click();
      await until(() => info().state === 'play' && E().endless.state() && !E().ui().transitioning, 3000);
      const st = E().endless.state();
      await sleep(150);
      T.check('the button starts a run at depth 1', st && st.depth === 1 && info().levelNum === -2);
      T.check(`the HUD says the depth ("${$('hud-level').textContent}")`, /^Depth 1 · /.test($('hud-level').textContent) && shown('hud'));
      T.check('no banner, no hint, no lore fragment', !$('banner').classList.contains('show') && !L().fragment);
      T.check(`depth 1: small, one echo monster (${L().W}x${L().H}, ${L().enemies.map((e) => e.kind).join(',')})`, L().W <= 15 && L().enemies.length === 1 && L().enemies[0].kind === 'echo');
      T.check('the depth in play is the one (run seed, depth) builds - any depth can be built again', hashLevel(L()) === hashLevel(E().endless.build(st.seed, 1)));
      T.check('...and it passed the fairness rules', st.levelOk);
      const chimes = [];
      const orig = E().audio.milestone;
      E().audio.milestone = function () {
        chimes.push(E().endless.state().depth);
        return orig.apply(this, arguments);
      };
      info().enemies.length = 0;
      T.check('a cleared depth goes straight on to the next, behind the fade', await clearDepth());
      T.check(`...depth 2 (${$('hud-level').textContent})`, E().endless.state().depth === 2 && hashLevel(L()) === hashLevel(E().endless.build(st.seed, 2)));
      T.check('...with no Level cleared screen', !shown('complete'));
      E().endless.goDepth(4);
      info().enemies.length = 0;
      await clearDepth();
      await sleep(600);
      E().endless.goDepth(9);
      info().enemies.length = 0;
      await clearDepth();
      await sleep(600);
      E().audio.milestone = orig;
      T.check(`a soft chime reaching depth 5 and 10, no words (${chimes.join(', ')})`, chimes.join() === '5,10' && !$('banner').classList.contains('show'));
      T.check(`the best depth kept as you go (${JSON.stringify(E().endless.save().best)})`, E().endless.save().best[E().settings().mode] === 10);
      // passing your best mid-run
      await toTitle();
      $('btn-endless').click();
      await until(() => info().state === 'play' && E().endless.state() && !E().ui().transitioning, 3000);
      T.check(`a new run starts from your best so far (${E().endless.state().startBest})`, E().endless.state().startBest === 10 && E().endless.state().depth === 1);
      E().endless.goDepth(10);
      info().enemies.length = 0;
      await clearDepth();
      await sleep(80);
      T.check(`past your best mid-run: "New best!" (${$('saved-toast').textContent})`, E().endless.state().passedBest && $('saved-toast').textContent === 'New best!');
      T.check('the title shows the best on the button', await (async () => {
        await toTitle();
        await sleep(100);
        return /Best 11/.test($('btn-endless').textContent);
      })());
    } finally {
      w.stop();
      for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) key(k, false);
    }
    T.check('no console error, nothing caught by the loop', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ caught
  async function caught() {
    const T = suite('caught');
    const w = errorWatch();
    const mode0 = E().settings().mode;
    try {
      for (const m of ['normal', 'hardcore']) {
        localStorage.removeItem('echomaze.endless');
        await toTitle();
        E().setMode(m);
        await begin(4242);
        E().endless.goDepth(3);
        const echo = info().enemies.find((e) => e.kind === 'echo');
        E().tp(echo.x, echo.y);
        step(1 / 60);
        step(1 / 60);
        await until(() => shown('endless-over'), 3000);
        await settled();
        const hc = m === 'hardcore';
        T.check(`${m}: caught - Endless's own screen (not the title, not the campaign's Caught screen)`, info().state === 'caught' && shown('endless-over') && !shown('caught'));
        T.check(`...it says "Depth 3" (${$('eo-depth').textContent})`, $('eo-depth').textContent === 'Depth 3');
        T.check(`...the best for ${m} (${$('eo-best').textContent}) and "New best!"`, /: 3$/.test($('eo-best').textContent) && shown('eo-new'));
        T.check(`...and what caught you, in the Caught screen's own words ("${$('eo-line').textContent}")`, $('eo-line').textContent === 'The echo found you.');
        T.check(`...it says what Try again will do ("${$('eo-again-label').textContent}": ${$('eo-note').textContent})`, hc ? $('eo-again-label').textContent === 'Start again' && /depth 1/.test($('eo-note').textContent) : $('eo-again-label').textContent === 'Try again' && /depth 3 again/.test($('eo-note').textContent));
        const seed0 = E().endless.state().seed;
        const maze0 = hashLevel(L());
        const t0 = performance.now();
        $('btn-endless-again').click();
        const ms = performance.now() - t0;
        if (hc) T.check(`Hardcore, Start again: a new run at depth 1, at once (${ms.toFixed(0)} ms, a new seed)`, info().state === 'play' && E().endless.state().depth === 1 && E().endless.state().seed !== seed0 && ms < 400 && !$('endless-over').classList.contains('in'));
        else T.check(`Normal, Try again: depth 3 again, the same maze, at once (${ms.toFixed(0)} ms)`, info().state === 'play' && E().endless.state().depth === 3 && E().endless.state().seed === seed0 && hashLevel(L()) === maze0 && ms < 400 && !$('endless-over').classList.contains('in'));
        // caught again
        const echo2 = info().enemies.find((e) => e.kind === 'echo');
        E().tp(echo2.x, echo2.y);
        step(1 / 60);
        step(1 / 60);
        await until(() => shown('endless-over'), 3000);
        await settled();
        if (hc) T.check(`...caught at depth 1: no "New best!", the best still 3 (${$('eo-best').textContent})`, !shown('eo-new') && /: 3$/.test($('eo-best').textContent) && $('eo-depth').textContent === 'Depth 1');
        else T.check(`...caught at depth 3 again: still depth 3, the best 3 (${$('eo-best').textContent})`, $('eo-depth').textContent === 'Depth 3' && /: 3$/.test($('eo-best').textContent));
        const seed1 = E().endless.state().seed;
        press('Enter');
        T.check(`Enter on it: ${hc ? 'a new run from depth 1' : 'depth 3 again'}`, info().state === 'play' && E().endless.state() && E().endless.state().depth === (hc ? 1 : 3) && (hc ? E().endless.state().seed !== seed1 : E().endless.state().seed === seed1));
        const echo3 = info().enemies.find((e) => e.kind === 'echo');
        E().tp(echo3.x, echo3.y);
        step(1 / 60);
        step(1 / 60);
        await until(() => shown('endless-over'), 3000);
        await settled();
        $('btn-endless-title').click();
        await until(() => info().state === 'title' && !E().ui().transitioning, 3000);
        T.check('Back to title', info().state === 'title' && !E().endless.state() && !$('title-notice').textContent.includes('Hardcore gives you one life'));
        T.check(`the last run kept (${JSON.stringify(E().endless.save().last && E().endless.save().last.depth)})`, E().endless.save().last && E().endless.save().last.mode === m && E().endless.save().last.depth === (hc ? 1 : 3));
      }
    } finally {
      w.stop();
      E().setMode(mode0);
    }
    T.check('no console error', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ per mode, and no storage
  async function modes() {
    const T = suite('modes');
    const mode0 = E().settings().mode;
    localStorage.removeItem('echomaze.endless');
    try {
      for (const [m, d] of [['easy', 3], ['normal', 5], ['hard', 2], ['hardcore', 4]]) {
        E().setMode(m);
        await begin(77);
        E().endless.goDepth(d - 1);
        info().enemies.length = 0;
        await clearDepth();
        await toTitle();
      }
      const best = E().endless.save().best;
      T.check(`each difficulty keeps its own best (${JSON.stringify(best)})`, best.easy === 3 && best.normal === 5 && best.hard === 2 && best.hardcore === 4);
      E().setMode('hard');
      await sleep(80);
      T.check(`the title's button shows the picked mode's (${$('endless-best').textContent})`, $('endless-best').textContent === 'Best 2');
      E().setMode('normal');
      await sleep(80);
      T.check(`...and changes with it (${$('endless-best').textContent})`, $('endless-best').textContent === 'Best 5');
      // storage that throws: the mode still works, it just forgets
      const set = Storage.prototype.setItem;
      const get = Storage.prototype.getItem;
      Storage.prototype.setItem = () => {
        throw new Error('blocked');
      };
      Storage.prototype.getItem = function (k) {
        if (String(k).includes('endless')) throw new Error('blocked');
        return get.call(this, k);
      };
      let okRun = false;
      try {
        await begin(5);
        info().enemies.length = 0;
        okRun = await clearDepth();
        const echo = E().endless.build(E().endless.state().seed, 2).enemies[0];
        if (info().enemies[0]) E().tp(info().enemies[0].x, info().enemies[0].y);
        step(1 / 60);
      } finally {
        Storage.prototype.setItem = set;
        Storage.prototype.getItem = get;
      }
      T.check('with storage blocked: a run still starts and goes on', okRun);
      await toTitle();
    } finally {
      E().setMode(mode0);
    }
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ nothing else written
  async function noWrites() {
    const T = suite('noWrites');
    await toTitle();
    const snap = () => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== 'echomaze.endless') o[k] = localStorage.getItem(k);
      }
      return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    };
    const before = snap();
    const cont0 = shown('btn-continue') ? $('btn-continue').textContent : null;
    const stats0 = JSON.stringify(EchoProfile.stats ? EchoProfile.stats() : null);
    await begin(31337);
    for (let i = 0; i < 4; i++) {
      info().enemies.length = 0;
      await clearDepth();
    }
    ripple: {
      press('Space');
      step(0.5);
    }
    E().endless.goDepth(12); // (a depth with lots in it: puddles, a decoy, a mimic)
    const victim = info().enemies.find((e) => e.kind !== 'alarm' && e.kind !== 'mimic') || info().enemies[0];
    E().tp(victim.x, victim.y);
    for (let i = 0; i < 4; i++) step(1 / 60);
    await until(() => shown('endless-over'), 3000);
    await settled();
    $('btn-endless-again').click();
    step(0.5);
    key('Escape', true);
    key('Escape', false);
    await until(() => info().state === 'paused', 2000);
    $('btn-quit').click();
    await until(() => info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(100);
    T.check('a run - depths cleared, a ripple, a catch, Try again, quitting - writes nothing but Endless\'s own save', snap() === before);
    T.check('...the stats are untouched', JSON.stringify(EchoProfile.stats ? EchoProfile.stats() : null) === stats0);
    T.check(`...and Continue is what it was (${cont0})`, (shown('btn-continue') ? $('btn-continue').textContent : null) === cont0);
    T.check('Endless kept its own save', !!localStorage.getItem('echomaze.endless'));
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the bot
  async function bot(n = 60) {
    const T = suite('bot');
    const w = errorWatch();
    const t0 = performance.now();
    let reached = 0;
    const stuck = [];
    try {
      await begin(20251025);
      for (let d = 1; d <= n; d++) {
        const st = E().endless.state();
        if (!st || st.depth !== d || info().state !== 'play') {
          stuck.push(`depth ${d}: ${info().state}`);
          break;
        }
        if (!st.levelOk) stuck.push(`depth ${d} failed its checks`);
        info().enemies.length = 0; // (the bot cannot see: it walks the way out, the real keys, the real collisions)
        const lv = L();
        const ex = lv.exit;
        walkPath(lv, Math.floor(ex.x / TILE), Math.floor(ex.y / TILE));
        for (let i = 0; i < 30 && info().state === 'play'; i++) step(1 / 60);
        await until(() => E().endless.state() && E().endless.state().depth === d + 1 && info().state === 'play' && !E().ui().transitioning, 4000);
        if (!E().endless.state() || E().endless.state().depth !== d + 1) {
          stuck.push(`depth ${d}: did not go on (${info().state})`);
          break;
        }
        reached = d;
      }
    } finally {
      w.stop();
      for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) key(k, false);
    }
    T.note(`${reached} depths in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    T.check(`the bot walked out of ${reached} depths in a row, with the real keys`, reached === n, stuck.slice(0, 4));
    T.check('no console error, nothing caught by the loop', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the real loop
  async function live(to = 60) {
    const T = suite('live');
    const on = !!E().settings().visualCues;
    const w = errorWatch();
    const dead = [];
    const kinds = new Set();
    try {
      await begin(8675309);
      for (let d = 1; d <= to; d++) {
        E().endless.goDepth(d);
        for (const e of info().enemies) kinds.add(e.kind);
        const t0 = info().levelTime;
        press('Space');
        await sleep(d % 10 === 0 ? 700 : 260); // (the real loop, requestAnimationFrame - not step())
        if (info().state === 'play' && !(info().levelTime - t0 > 0.05)) dead.push(`depth ${d}: the loop did not run`);
        if (info().state !== 'play') {
          await toTitle();
          await begin(8675309 + d);
        }
      }
    } finally {
      w.stop();
    }
    T.check(`Visual cues ${on ? 'ON' : 'off'}: the real loop ran every depth 1-${to} with its monsters in (${[...kinds].join(', ')})`, dead.length === 0, dead.slice(0, 4));
    T.check('no console error, nothing caught by the loop', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ fairness, in the page
  async function fair(to = 60) {
    const T = suite('fair');
    const bad = [];
    for (const m of ['easy', 'normal', 'hard', 'hardcore']) {
      for (let d = 1; d <= to; d++) {
        const lv = E().endless.build(1000 + d * 17, d, m, { alarm: true });
        if (!lv.endless.ok) bad.push(`${m} ${d}: ${lv.endless.why}`);
      }
    }
    T.check(`every depth 1-${to} in every mode passes the fairness rules`, bad.length === 0, bad.slice(0, 4));
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the screen
  async function screen() {
    const T = suite('screen');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    const touch = document.body.classList.contains('touch');
    await toTitle();
    await sleep(100);
    const b = $('btn-endless').getBoundingClientRect();
    T.check(`${size}: the Endless button on screen (${Math.round(b.top)}-${Math.round(b.bottom)})`, shown('btn-endless') && b.top >= 0 && b.bottom <= innerHeight + 1 && (!touch || b.height >= 44));
    await begin(99);
    await sleep(200);
    if (touch) T.check(`${size}: the joystick and buttons are there during a run`, shown('touch') && shown('tbtn-ripple'));
    for (const d of [30, 60]) {
      E().endless.goDepth(d);
      press('Space');
      step(0.3);
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) {
        step(1 / 60);
        E().draw();
      }
      const ms = (performance.now() - t0) / 120;
      T.note(`${size}: depth ${d} ${ms.toFixed(2)} ms a frame`);
      T.check(`${size}: depth ${d} well inside a 60 fps frame (${ms.toFixed(2)} ms)`, ms < 8);
    }
    const echo = info().enemies.find((e) => e.kind !== 'alarm') || info().enemies[0];
    E().tp(echo.x, echo.y);
    step(1 / 60);
    step(1 / 60);
    await until(() => shown('endless-over'), 3000);
    await settled();
    const panel = $('endless-over').querySelector('.panel').getBoundingClientRect();
    const btns = [$('btn-endless-again'), $('btn-endless-title')].map((x) => x.getBoundingClientRect());
    T.check(`${size}: the game-over screen fits`, panel.top >= 0 && panel.bottom <= innerHeight + 1 && panel.left >= 0 && panel.right <= innerWidth + 1);
    T.check(`${size}: its buttons ${touch ? 'at least 44 px tall' : 'there'} (${btns.map((r) => Math.round(r.height)).join(', ')})`, btns.every((r) => r.height >= (touch ? 44 : 20)));
    await toTitle();
    return T.done();
  }

  return { unlock, run, caught, modes, noWrites, bot, live, fair, screen, walkPath, clearDepth };
})();
