/*
 * tools/twists-test.js (v22.2) - Endless's twists in the real game. Load it into a ?debug page and run one suite at a
 * time (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   TwistsTest.gate()          the toggle: not there before level 25 (a stored "on" does nothing), there after, Off by
 *                              default, On / Off by a click, kept in Endless's own save; a run keeps what it started with
 *   TwistsTest.bot(mode, on)   the real keys through 60 depths on a difficulty, Twists on or off: every depth passes its
 *                              checks, the twists exactly where the schedule says (the HUD's mark with them), none after 50
 *   TwistsTest.mechanics()     every twist level, the real loop running: the sting as it begins, and each rule doing its
 *                              thing - the slow late ripple, a ghost wall coming apart, a hidden wall's thunk, dead air
 *                              swallowing a ray, crumbling floor cracking and falling, the creep's rumble - with their
 *                              captions when Visual cues are on, and no console error
 *   TwistsTest.bests()         the best depth kept apart for Twists on and off (per difficulty), the game-over screen
 *                              saying "Twists on", and a loaded save code keeping the twists' own fields
 *   TwistsTest.perf()          a twist level's frame (the creep, crumbled floor, dead air) at this page's size
 */
window.TwistsTest = (() => {
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
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    key(code, true);
    key(code, false);
  };
  const step = (s) => E().step(s);
  const info = () => E().info();
  const L = () => info().level;
  const P = () => info().player;
  const KEY = 'echomaze.endless';
  const readSave = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  };
  async function toTitle() {
    if (info().state !== 'title') E().toTitle();
    await until(() => info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(40);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
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
    return { errs, frameErrors: () => E().frameErrors() - fe0, stop: () => ((console.error = oe), window.removeEventListener('error', onErr)) };
  }
  /** Walk a list of tiles with the real keys (step by step). */
  function walkTiles(route, maxSecs = 120) {
    const W = L().W;
    let frames = 0;
    for (const i of route) {
      const x = ((i % W) + 0.5) * TILE;
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
  }
  /** The shortest way over what is really open (on a twist level: the way its check proved, through the crumble and ahead of the creep). */
  function routeOf(lv) {
    if (lv.twist && lv.twist.route) return lv.twist.route.slice(1);
    const W = lv.W;
    const s = Math.floor(P().y / TILE) * W + Math.floor(P().x / TILE);
    const goal = Math.floor(lv.exit.y / TILE) * W + Math.floor(lv.exit.x / TILE);
    const prev = new Int32Array(W * lv.H).fill(-1);
    prev[s] = s;
    const q = [s];
    for (let h = 0; h < q.length && prev[goal] < 0; h++) for (const j of [q[h] - 1, q[h] + 1, q[h] - W, q[h] + W]) if (j >= 0 && j < W * lv.H && prev[j] < 0 && !lv.blocked[j]) {
      prev[j] = q[h];
      q.push(j);
    }
    const out = [];
    for (let i = goal; i >= 0 && i !== s; i = prev[i]) out.push(i);
    return out.reverse();
  }
  async function begin(seed) {
    await toTitle();
    E().audio.setMuted(true);
    E().endless.start(seed);
    await until(() => info().state === 'play' && !E().ui().transitioning, 3000);
  }

  // ------------------------------------------------------------------------------------------ the toggle
  async function gate() {
    const T = suite('gate');
    await toTitle();
    const open = E().endless.twistsUnlocked();
    const reached = E().whatsNew.reached();
    const btn = $('btn-twists');
    if (!open) {
      const had = localStorage.getItem(KEY);
      localStorage.setItem(KEY, JSON.stringify(Object.assign(readSave(), { twists: true })));
      E().toTitle();
      await sleep(100);
      T.check(`before level 25 (reached ${reached}): no Twists toggle at all, even with "on" stored`, btn.classList.contains('hidden') && !E().endless.twistsOn());
      if (E().endless.unlocked()) {
        await begin(1234);
        T.check('...and a run has no twists', E().endless.state().twists === false);
        E().endless.goDepth(5);
        T.check('...not even at depth 5', !E().endless.state().twist && $('hud-twist').classList.contains('hidden'));
        await toTitle();
      }
      if (had === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, had);
      return T.done();
    }
    const had = localStorage.getItem(KEY);
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.assign(readSave(), { twists: undefined })));
      E().toTitle();
      await sleep(100);
      T.check(`level 25 reached (${reached}): the toggle is there, beside Endless, and Off by default`, !btn.classList.contains('hidden') && /Off/.test(btn.textContent) && btn.getAttribute('aria-pressed') === 'false');
      btn.click();
      await sleep(60);
      T.check('a click: On - and kept in Endless\'s own save', /On/.test(btn.textContent) && btn.getAttribute('aria-pressed') === 'true' && readSave().twists === true);
      await begin(1234);
      T.check('a run started with it on has twists', E().endless.state().twists === true);
      E().endless.goDepth(4);
      T.check('depth 4: no twist, no mark', !E().endless.state().twist && $('hud-twist').classList.contains('hidden'));
      E().endless.goDepth(5);
      T.check(`depth 5: the late echo, and the mark beside the depth (${(E().endless.state().twist || []).join('+')})`, (E().endless.state().twist || []).join() === 'late' && !$('hud-twist').classList.contains('hidden'));
      await toTitle();
      btn.click();
      await sleep(60);
      T.check('another click: Off again (and gone from the save)', /Off/.test(btn.textContent) && readSave().twists === undefined);
      await begin(1234);
      E().endless.goDepth(5);
      T.check('a run started with it off: depth 5 as ever, no twist', E().endless.state().twists === false && !E().endless.state().twist);
      await toTitle();
    } finally {
      if (had === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, had);
      E().toTitle();
    }
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ 60 depths with the real keys
  async function bot(mode = 'normal', on = true, n = 60) {
    const T = suite('bot');
    const w = errorWatch();
    const had = localStorage.getItem(KEY);
    const t0 = performance.now();
    let reached = 0;
    const stuck = [];
    const seen = {};
    const wrong = [];
    try {
      await toTitle();
      E().setMode(mode);
      E().endless.setTwists(on);
      await begin(20251107);
      for (let d = 1; d <= n; d++) {
        const st = E().endless.state();
        if (!st || st.depth !== d || info().state !== 'play') {
          stuck.push(`depth ${d}: ${info().state}`);
          break;
        }
        if (!st.levelOk) stuck.push(`depth ${d} failed its checks`);
        const want = on && d <= 50 && d % 5 === 0;
        if (!!st.twist !== want) wrong.push(`depth ${d}: twist ${st.twist ? st.twist.join('+') : 'none'}`);
        if (st.twist) seen[d] = st.twist.join('+');
        if (!!st.twist !== !$('hud-twist').classList.contains('hidden')) wrong.push(`depth ${d}: the HUD's mark ${st.twist ? 'missing' : 'there without a twist'}`);
        info().enemies.length = 0; // (the bot cannot see: it walks the way out, the real keys, the real collisions)
        walkTiles(routeOf(L()));
        for (let i = 0; i < 30 && info().state === 'play'; i++) step(1 / 60);
        await until(() => E().endless.state() && E().endless.state().depth === d + 1 && info().state === 'play' && !E().ui().transitioning, 4000);
        if (!E().endless.state() || E().endless.state().depth !== d + 1) {
          stuck.push(`depth ${d}${st.twist ? ` (${st.twist.join('+')})` : ''}: did not go on (${info().state})`);
          break;
        }
        reached = d;
      }
    } finally {
      w.stop();
      for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) key(k, false);
      if (had === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, had);
    }
    T.note(`${mode}, Twists ${on ? 'on' : 'off'}: ${reached} depths in ${((performance.now() - t0) / 1000).toFixed(0)} s; twists ${JSON.stringify(seen)}`);
    T.check(`${mode}, Twists ${on ? 'on' : 'off'}: the bot walked out of ${reached} depths in a row, with the real keys`, reached === n, stuck.slice(0, 4));
    T.check(on ? 'the twists exactly where the schedule says, the mark with them, none after 50' : 'no twist anywhere, no mark', wrong.length === 0, wrong.slice(0, 5));
    T.check('no console error, nothing caught by the loop', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ every rule at work
  async function mechanics() {
    const T = suite('mechanics');
    const cuesOn = !!E().settings().visualCues;
    const w = errorWatch();
    const had = localStorage.getItem(KEY);
    const caps = new Set();
    // every caption the game puts up (each one, even when two come in the same frame), read as it is set
    const obs = new MutationObserver((recs) => take(recs));
    const take = (recs) => {
      for (const r of recs) for (const n of r.addedNodes) caps.add(n.textContent);
    };
    const has = (t) => (take(obs.takeRecords()), caps.has(t));
    const fall0 = E().audio.voidFall;
    let stings = 0;
    const seenRules = new Set();
    const tileMid = (i, W) => ({ x: ((i % W) + 0.5) * TILE, y: (Math.floor(i / W) + 0.5) * TILE });
    try {
      await toTitle();
      E().endless.setTwists(true);
      obs.observe($('cue-caption'), { childList: true, characterData: true, subtree: true });
      E().audio.voidFall = function () {
        stings++;
        return fall0.apply(this, arguments);
      };
      await begin(4242);
      for (const d of Object.keys(EchoTwists.SCHEDULE).map(Number)) {
        stings = 0;
        take(obs.takeRecords());
        caps.clear();
        E().endless.goDepth(d);
        const lv = L();
        const kinds = (lv.twist && lv.twist.kinds) || [];
        T.check(`depth ${d} (${kinds.join(' + ')}): the sting as it begins${cuesOn ? ', with its caption' : ''}, and the mark on the HUD`, stings >= 1 && (!cuesOn || has('[a low sting]')) && !$('hud-twist').classList.contains('hidden'), { stings, caps: (has(""), [...caps]) });
        info().enemies.length = 0;
        const a2 = lv.act2;
        const W = lv.W;
        if (kinds.includes('late')) {
          E().step(2);
          press('Space');
          const rp = E().ripples().find((r) => r.mine);
          T.check(`depth ${d}: your ripple slowed and shown late (${rp && Math.round(rp.v)} px/s, ${rp && rp.lag} s)`, !!rp && rp.v < 300 && rp.lag > 0.3);
          seenRules.add('late');
        }
        if (kinds.includes('liar')) {
          const g = a2.ghosts.find((x) => !x.gone);
          const c = tileMid(g.i, W);
          E().tp(c.x, c.y);
          E().step(0.05);
          T.check(`depth ${d}: a ghost wall walked into comes apart${cuesOn ? ' ("[a glitch]")' : ''}`, g.gone && L().rayWalls[g.i] === 0 && (!cuesOn || has('[a glitch]')));
          const h = a2.hidden.find((x) => !x.shown);
          const nb = [h.i - 1, h.i + 1, h.i - W, h.i + W].find((j) => j >= 0 && !lv.walls[j] && !lv.blocked[j]);
          if (nb !== undefined) {
            const m = tileMid(nb, W);
            const hm = tileMid(h.i, W);
            E().tp(m.x, m.y);
            const dirs = { ArrowRight: hm.x > m.x, ArrowLeft: hm.x < m.x, ArrowDown: hm.y > m.y, ArrowUp: hm.y < m.y };
            for (const k of Object.keys(dirs)) key(k, dirs[k]);
            for (let i = 0; i < 30 && !h.shown; i++) E().step(1 / 60);
            for (const k of Object.keys(dirs)) key(k, false);
            T.check(`depth ${d}: bumping a hidden wall - the thunk${cuesOn ? ' ("[a dull thunk]")' : ''}, and it shows from then on`, h.shown && L().rayWalls[h.i] === 1 && (!cuesOn || has('[a dull thunk]')));
          }
          seenRules.add('liar');
        }
        if (kinds.includes('dead')) {
          let di = -1;
          for (let i = 0; i < a2.dead.length; i++) if (a2.dead[i]) {
            di = i;
            break;
          }
          // stand a little way off along an open line, and ping
          const c = tileMid(di, W);
          const spot = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => [dx, dy, 2]).map(([dx, dy]) => di + dx * 2 + dy * 2 * W).find((j) => j >= 0 && !lv.walls[j] && !a2.dead[j] && !lv.walls[(j + di) >> 1]);
          const from = spot !== undefined ? tileMid(spot, W) : { x: c.x + TILE, y: c.y };
          E().tp(from.x, from.y);
          E().step(2);
          press('Space');
          E().step(0.6);
          T.check(`depth ${d}: dead air - a ray goes in and never comes back (the black patch)`, E().deadSeen() > 0, E().deadSeen());
          seenRules.add('dead');
        }
        if (kinds.includes('crumble')) {
          const cr = a2.crumbles.find((x) => x.state === 0);
          const k = lv.twist.route.indexOf(cr.i);
          const next = lv.twist.route[k + 1];
          const a = tileMid(cr.i, W);
          const b = tileMid(next, W);
          E().tp(a.x, a.y);
          E().step(0.05);
          E().tp(b.x, b.y);
          E().step(0.05);
          E().step(1.2);
          T.check(`depth ${d}: crumbling floor cracks and falls away behind you${cuesOn ? ' ("[stone cracks]", "[it falls away]")' : ''}`, cr.state === 3 && a2.voidGrid[cr.i] === 1 && (!cuesOn || (has('[stone cracks]') && has('[it falls away]'))), { state: cr.state, caps: [...caps] });
          seenRules.add('crumble');
        }
        if (kinds.includes('creep')) {
          const L0 = a2.creep.layers.find((x) => x.tiles.length);
          E().tp(tileMid(lv.twist.route[lv.twist.route.length - 3], W).x, tileMid(lv.twist.route[lv.twist.route.length - 3], W).y); // (somewhere safe: by the way out)
          let guard = 0;
          while (info().levelTime < L0.t + 0.1 && guard++ < 2000 && info().state === 'play') E().step(1 / 30);
          T.check(`depth ${d}: the creep - a ring of the map goes${cuesOn ? ' ("[the edge gives way]")' : ''}, and the ground by the way out stays`, L0.tiles.every((i) => a2.voidGrid[i]) && !a2.voidGrid[lv.twist.route[lv.twist.route.length - 1]] && (!cuesOn || has('[the edge gives way]')), { state: info().state, caps: [...caps] });
          seenRules.add('creep');
        }
        // the real loop, a moment of it
        const t1 = info().levelTime;
        await sleep(350);
        T.check(`depth ${d}: the real loop runs`, info().state !== 'play' || info().levelTime > t1);
        if (info().state !== 'play') await begin(4242 + d);
      }
    } finally {
      obs.disconnect();
      E().audio.voidFall = fall0;
      w.stop();
      for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) key(k, false);
      if (had === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, had);
    }
    T.check(`every rule seen at work (${[...seenRules].join(', ')})`, seenRules.size === 5);
    T.check(`Visual cues ${cuesOn ? 'ON' : 'off'}: no console error, nothing caught by the loop`, w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the bests, apart
  async function bests() {
    const T = suite('bests');
    const had = localStorage.getItem(KEY);
    const mode = E().settings().mode;
    try {
      localStorage.setItem(KEY, JSON.stringify({ best: { [mode]: 3 } }));
      await toTitle();
      E().endless.setTwists(true);
      await begin(77);
      E().endless.goDepth(7);
      E().forceCaught('echo', 'blind', null);
      await until(() => !$('endless-over').classList.contains('hidden'), 3000);
      const s1 = readSave();
      T.check(`Twists on: caught at depth 7 - its own best (${JSON.stringify(s1.bestTwists)}), the plain best untouched (${s1.best[mode]})`, s1.bestTwists && s1.bestTwists[mode] === 7 && s1.best[mode] === 3, s1);
      T.check('the game-over screen says "Twists on", and the twists\' best', !$('eo-twists').classList.contains('hidden') && /with twists: 7/.test($('eo-best').textContent), $('eo-best').textContent);
      await toTitle();
      T.check('the title shows the twists\' best while they are on', /Best 7/.test($('btn-endless').textContent));
      E().endless.setTwists(false);
      T.check('...and the plain best with them off', /Best 3/.test($('btn-endless').textContent));
      await begin(78);
      E().endless.goDepth(5);
      E().forceCaught('echo', 'blind', null);
      await until(() => !$('endless-over').classList.contains('hidden'), 3000);
      const s2 = readSave();
      T.check('Twists off: caught at depth 5 - the plain best (5), the twists\' best untouched (7), no "Twists on"', s2.best[mode] === 5 && s2.bestTwists[mode] === 7 && $('eo-twists').classList.contains('hidden'), s2);
      await toTitle();
      // a save code loaded on this device keeps the twists' own fields (a code does not carry them)
      E().endless.setTwists(true);
      const before = readSave();
      const ctx = E().saveCode.ctx();
      const code = (await EchoSave.encode(EchoSave.gather(ctx, {}))).code;
      const d = await EchoSave.decode(code, ctx);
      EchoSave.load(d.save, ctx, {});
      const after = readSave();
      T.check('a save code loaded here keeps the twists\' best and the toggle', after.bestTwists && after.bestTwists[mode] === before.bestTwists[mode] && after.twists === true, after);
      EchoSave.undo();
    } finally {
      if (had === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, had);
      await toTitle();
    }
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ cost
  async function perf() {
    const T = suite('perf');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    const had = localStorage.getItem(KEY);
    try {
      await toTitle();
      E().endless.setTwists(true);
      await begin(9);
      for (const d of [25, 35, 45, 50]) {
        E().endless.goDepth(d);
        info().enemies.length = 0;
        const lv = L();
        // make it busy: crumble what there is, let the creep take a ring, ping
        if (lv.act2.crumbles.length) for (const c of lv.act2.crumbles) {
          c.state = 3;
          lv.act2.voidGrid[c.i] = 1;
        }
        const at = lv.twist.route.slice(-8).find((i) => !lv.act2.voidGrid[i]); // (on the way out, by the ground the creep keeps, not on the floor just crumbled)
        E().tp(((at % lv.W) + 0.5) * TILE, (Math.floor(at / lv.W) + 0.5) * TILE);
        E().step(2);
        press('Space');
        let played = 0;
        const t0 = performance.now();
        for (let i = 0; i < 90; i++) {
          if (info().state === 'play') played++;
          E().step(1 / 60);
          E().draw();
        }
        const ms = (performance.now() - t0) / 90;
        T.note(`${size} depth ${d} (${lv.twist.kinds.join('+')}): ${ms.toFixed(2)} ms a frame, ${played}/90 frames in play`);
        T.check(`${size}: depth ${d} (${lv.twist.kinds.join(' + ')}) well inside a 60 fps frame (${ms.toFixed(2)} ms), the level still being played`, ms < 8 && played === 90, info().state);
        if (info().state !== 'play') await begin(9 + d);
      }
    } finally {
      if (had === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, had);
      await toTitle();
    }
    return T.done();
  }

  return { gate, bot, mechanics, bests, perf };
})();
