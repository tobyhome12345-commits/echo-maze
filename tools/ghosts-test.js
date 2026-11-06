/*
 * tools/ghosts-test.js (v23.0) - ghost runs in the real game. Load it into a ?debug page and run one suite at a time
 * (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   GhostsTest.race()       one of My Levels, played from My Levels with the real keys: no ghost the first time; a
 *                           finished run becomes the ghost ("Your ghost is ready", Race my ghost); the next run shows it,
 *                           walking where the first run was; a faster run is a New best! with how much; a slower one
 *                           never replaces it; the title card and the HUD's clock
 *   GhostsTest.bonus()      the same on a bonus level, kept apart from My Levels
 *   GhostsTest.nothing()    a caught run, a quit and a restart record nothing and leave the ghost as it was
 *   GhostsTest.never()      no ghost, no clock and nothing kept on the campaign, Endless, the tutorial, a daylight level
 *                           or the editor's Test play
 *   GhostsTest.store()      editing a level's maze drops its ghost (renaming does not); deleting it deletes its ghosts;
 *                           each difficulty its own; the cap; storage full or off - quiet; a save code neither carries
 *                           nor is confused by them
 *   GhostsTest.same()       the ghost changes nothing: two scripted runs of a level with monsters, with and without its
 *                           ghost shown, the same random numbers - every monster, ripple and sound the same
 *   GhostsTest.looks()      the ghost drawn in every marker you can wear, in the ghost's tint, faint - and not drawn with
 *                           Ghost off in Settings (the switch is there, on by default)
 *   GhostsTest.screen()     the complete screen and the card at this page's size: the text fits, nothing overflows
 *   GhostsTest.perf()       a frame with a ghost at this page's size
 *   GhostsTest.live()       the real loop running with a ghost, with this page's Visual cues setting: no console error
 */
window.GhostsTest = (() => {
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
  const ARROWS = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'];
  const release = () => ARROWS.forEach((k) => key(k, false));
  const info = () => E().info();
  const L = () => info().level;
  const P = () => info().player;
  const GK = EchoGhosts.GHOSTS_KEY;
  const shown = (id) => !$(id).classList.contains('hidden');
  const ghosts = () => EchoGhosts._.read();
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
  async function toTitle() {
    if (info().state !== 'title') E().toTitle();
    await until(() => info().state === 'title' && !E().ui().transitioning, 3000);
    if (E().whatsNew.isOpen()) E().whatsNew.close(); // (a save that has not seen this version's notes: they take the keys)
    await sleep(40);
  }
  /** Keep what was stored; put it back after. */
  function keepStorage(keys) {
    const had = keys.map((k) => [k, localStorage.getItem(k)]);
    return () => had.forEach(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)));
  }

  // ------------------------------------------------------------------ levels to race on
  function myLevel(id, o = {}) {
    return {
        format: 'echo-maze-level',
        schemaVersion: 2,
        id,
        title: o.title || 'Ghost Track',
        authorName: '',
        createdAt: '2026-11-07T12:00:00.000Z',
        updatedAt: '2026-11-07T12:00:00.000Z',
        size: { w: 13, h: 9 },
        walls: o.walls || ['#############', '#...........#', '#.#########.#', '#.#.......#.#', '#.#.#####.#.#', '#...#...#...#', '###.#.#.#####', '#.....#.....#', '#############'],
        start: { x: 1, y: 1 },
        exits: [{ x: 11, y: 7, locked: false }],
        enemies: o.enemies || [],
        objects: [],
        effects: [],
        titleCard: '',
        palette: 'default',
        difficulty: o.difficulty || { rating: 'normal', monsterSpeed: 1, rippleRange: 1, hearing: 1 },
    };
  }
  function saveMine(doc) {
    const r = EchoLevelStore.save(doc);
    if (!r.ok) throw new Error(`could not save ${doc.id}: ${r.error}`);
    return r.doc;
  }
  async function play(doc, from = 'mylevels', card = false) {
    await toTitle();
    E().audio.setMuted(true);
    const err = E().playCustom(doc, from, { card });
    if (err) throw new Error(err);
    await until(() => (info().state === 'play' || info().state === 'card') && !E().ui().transitioning, 3000);
  }
  /** The shortest way to the nearest open way out, over what is really open. */
  function routeOut() {
    const lv = L();
    const W = lv.W;
    const s = Math.floor(P().y / TILE) * W + Math.floor(P().x / TILE);
    const goals = new Set((lv.exits || [lv.exit]).filter((x) => x && !x.locked).map((x) => Math.floor(x.y / TILE) * W + Math.floor(x.x / TILE)));
    const prev = new Int32Array(W * lv.H).fill(-1);
    prev[s] = s;
    const q = [s];
    let goal = -1;
    for (let h = 0; h < q.length && goal < 0; h++) {
      if (goals.has(q[h])) goal = q[h];
      for (const j of [q[h] - 1, q[h] + 1, q[h] - W, q[h] + W]) if (j >= 0 && j < W * lv.H && prev[j] < 0 && !lv.blocked[j]) {
        prev[j] = q[h];
        q.push(j);
      }
    }
    const out = [];
    for (let i = goal; i >= 0 && i !== s; i = prev[i]) out.push(i);
    return out.reverse();
  }
  /** Walk to the way out with the real keys, a frame at a time; `wait` s standing still first. -> the path, frame by frame. */
  function walkOut(wait = 0) {
    const trail = [];
    const lvlT = () => info().levelTime;
    for (let i = 0; i < Math.round(wait * 60) && info().state === 'play'; i++) {
      E().step(1 / 60);
      trail.push([lvlT(), P().x, P().y]);
    }
    const W = L().W;
    for (const i of routeOut()) {
      const x = ((i % W) + 0.5) * TILE;
      const y = (Math.floor(i / W) + 0.5) * TILE;
      for (let t = 0; t < 240 && info().state === 'play'; t++) {
        const dx = x - P().x;
        const dy = y - P().y;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) break;
        key('ArrowRight', dx > 2);
        key('ArrowLeft', dx < -2);
        key('ArrowDown', dy > 2);
        key('ArrowUp', dy < -2);
        E().step(1 / 60);
        trail.push([lvlT(), P().x, P().y]);
      }
      if (info().state !== 'play') break;
    }
    release();
    return trail;
  }
  const stats = () => $('complete-stats').textContent;
  const again = () => $('btn-custom-again').textContent.trim();
  async function finish(wait = 0) {
    info().enemies.length = 0;
    const trail = walkOut(wait);
    const t = info().levelTime;
    await until(() => shown('complete') && !E().ui().transitioning, 3000);
    return { trail, t, done: info().state === 'complete' };
  }

  // ------------------------------------------------------------------ racing
  async function race() {
    const T = suite('race');
    const w = errorWatch();
    const undo = keepStorage([GK]);
    try {
      localStorage.removeItem(GK);
      const doc = saveMine(myLevel('ghost-race'));
      await play(doc, 'mylevels', true);
      T.check(`the title card says there is a ghost to race once it is finished (${$('card-ghost').textContent})`, shown('card-ghost') && /Finish it once/.test($('card-ghost').textContent));
      E().endCard();
      T.check('the first time: no ghost shown, the run recorded', !E().ghost.state().shown && E().ghost.state().recording && E().ghost.eligible());
      E().step(0.5);
      T.check(`...and the HUD's clock running on a ghost run (Show timer off: ${$('hud-time').textContent})`, /^0:0\d$/.test($('hud-time').textContent) && !E().settings().showTimer);
      const r1 = await finish(2); // (a slow first run: two seconds stood still)
      T.check(`a finished run becomes the ghost (${stats()})`, r1.done && ghosts().length === 1 && /Your ghost is ready to race/.test(stats()) && /^Time \d:\d\d/.test(stats()), stats());
      T.check(`Play again is now "${again()}"`, again() === 'Race my ghost');
      // the second run: the ghost walks where the first run was
      await play(doc, 'mylevels', true);
      T.check(`the card: "${$('card-ghost').textContent}"`, /^Race my ghost · Best \d:\d\d$/.test($('card-ghost').textContent));
      E().endCard();
      T.check('the next run shows the ghost', E().ghost.state().shown && E().ghost.state().bestMs === ghosts()[0].t);
      let worst = 0;
      let sum = 0;
      for (const [t, x, y] of r1.trail) {
        const p = E().ghost.at(t);
        const e = p ? Math.hypot(p.x - x, p.y - y) : 99;
        worst = Math.max(worst, e);
        sum += e;
      }
      const mean = sum / r1.trail.length;
      // (10 samples a second, joined by straight lines: at a corner it cuts across - by at most half of what you walk in
      // a tenth of a second, 170 px/s x 0.05 s = 8.5 px - and is on your line everywhere else)
      T.check(`the ghost walks where the first run was: on average ${mean.toFixed(2)} px off, at most ${worst.toFixed(2)} px (a corner)`, worst <= 8.5 && mean < 2, { worst, mean });
      const atEnd = E().ghost.at(r1.t);
      const last = r1.trail[r1.trail.length - 1];
      T.check('at the run\'s time it is at the way out, then fades and goes', atEnd && Math.hypot(atEnd.x - last[1], atEnd.y - last[2]) < 1 && E().ghost.at(r1.t + EchoGhosts.FADE + 0.05) === null);
      const r2 = await finish(0); // faster: no standing still
      const d = Math.round((r1.t - r2.t) * 10) / 10;
      T.check(`a faster run: New best!, and by how much (${stats()})`, r2.done && /New best! -\d/.test(stats()) && /Best \d:\d\d/.test(stats()) && ghosts().length === 1 && Math.abs(ghosts()[0].t - r2.t * 1000) < 20, { stats: stats(), d });
      const best2 = ghosts()[0];
      await play(doc, 'mylevels');
      const r3 = await finish(1.5); // slower again
      T.check(`a slower run never replaces the ghost (${stats()})`, r3.done && !/New best/.test(stats()) && ghosts()[0].t === best2.t && ghosts()[0].at === best2.at && /Best \d:\d\d/.test(stats()));
      T.note(`runs: ${r1.t.toFixed(2)} s, ${r2.t.toFixed(2)} s (new best), ${r3.t.toFixed(2)} s; ghost ${ghosts()[0].d.length} characters`);
      await toTitle();
      EchoLevelStore.delete('ghost-race');
    } finally {
      release();
      w.stop();
      undo();
    }
    T.check('no console error, nothing caught by the loop', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    return T.done();
  }

  // ------------------------------------------------------------------ a bonus level
  async function bonus() {
    const T = suite('bonus');
    const undo = keepStorage([GK, 'echomaze.bonus']);
    try {
      localStorage.removeItem(GK);
      const doc = EchoLevelStore.bonus.get('bonus-01-crossroads').doc;
      await play(doc, 'bonus');
      const r1 = await finish(1);
      T.check(`a bonus level: the finished run becomes its ghost (${stats()})`, r1.done && ghosts().length === 1 && ghosts()[0].s === 'bonus' && ghosts()[0].id === doc.id);
      await play(doc, 'bonus');
      T.check('the next run shows it', E().ghost.state().shown);
      T.check('...kept apart from My Levels (a level of mine with that id would have none)', EchoGhosts.best('mylevels', doc) === null && !!EchoGhosts.best('bonus', doc));
      const r2 = await finish(0);
      T.check(`and it is raced like any other (${stats()})`, r2.done && /New best!/.test(stats()));
      await toTitle();
    } finally {
      release();
      undo();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ runs that are not finished
  async function nothing() {
    const T = suite('nothing');
    const undo = keepStorage([GK]);
    try {
      localStorage.removeItem(GK);
      const doc = saveMine(myLevel('ghost-none', { enemies: [{ kind: 'echo', x: 11, y: 1 }] }));
      // caught
      await play(doc);
      E().step(1);
      E().forceCaught('echo', 'blind', null);
      await until(() => shown('caught'), 3000);
      T.check('caught: nothing recorded', ghosts().length === 0);
      // Try again, then quit half-way
      $('btn-retry').click();
      await until(() => info().state === 'play' && !E().ui().transitioning, 3000);
      E().step(1.5);
      E().leaveCustom();
      await until(() => info().state !== 'play', 3000);
      T.check('quit half-way: nothing recorded', ghosts().length === 0);
      // a ghost, then a restart and a caught run must leave it alone
      await play(doc);
      await finish(0);
      const g = ghosts()[0];
      await play(doc);
      E().step(1);
      await play(doc); // (started again)
      E().step(0.5);
      E().forceCaught('echo', 'blind', null);
      await until(() => shown('caught'), 3000);
      T.check('started again, then caught: the ghost as it was', ghosts().length === 1 && ghosts()[0].at === g.at && ghosts()[0].t === g.t);
      await toTitle();
      EchoLevelStore.delete('ghost-none');
    } finally {
      release();
      undo();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ never anywhere else
  async function never() {
    const T = suite('never');
    const undo = keepStorage([GK]);
    const w = errorWatch();
    try {
      localStorage.removeItem(GK);
      const before = localStorage.getItem(GK);
      const where = [];
      const look = (name) => {
        const st = E().ghost.state();
        where.push(name);
        return !E().ghost.eligible() && !st.recording && !st.shown;
      };
      await toTitle();
      E().go(3);
      await until(() => info().state === 'play', 3000);
      E().step(1);
      T.check('the campaign (level 3): no ghost, no recording', look('level 3'));
      T.check('...and no clock unless Show timer is on', E().settings().showTimer || $('hud-time').textContent === '');
      await toTitle();
      E().go(0);
      E().step(1);
      T.check('the tutorial: none', look('tutorial'));
      await toTitle();
      E().go(26);
      E().step(1);
      T.check('a daylight level (First Breath): none', look('26'));
      await toTitle();
      if (E().endless.unlocked()) {
        E().endless.start(5);
        await until(() => info().state === 'play', 3000);
        E().step(1);
        T.check('Endless: none', look('endless'));
        await toTitle();
      }
      // the editor's Test play - played to the end
      const doc = myLevel('ghost-test-play');
      await play(doc, 'editor');
      T.check("the editor's Test play: none", look('test play'));
      const r = await finish(0);
      T.check('...not even when it is finished', r.done && ghosts().length === 0 && /Play again/.test(again()));
      T.check('nothing kept anywhere', localStorage.getItem(GK) === before);
      T.note(`looked at: ${where.join(', ')}`);
      await toTitle();
    } finally {
      release();
      w.stop();
      undo();
    }
    T.check('no console error', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    return T.done();
  }

  // ------------------------------------------------------------------ what is kept
  async function store() {
    const T = suite('store');
    const undo = keepStorage([GK]);
    try {
      localStorage.removeItem(GK);
      let doc = saveMine(myLevel('ghost-edit'));
      await play(doc);
      await finish(0);
      T.check('a ghost for the level', ghosts().length === 1);
      doc = saveMine(Object.assign(doc, { title: 'Renamed Track' }));
      T.check('renamed in the editor: the ghost stays', ghosts().length === 1);
      // each difficulty its own (the level's own difficulty is what changes its monsters)
      doc = saveMine(Object.assign(doc, { difficulty: { rating: 'hard', monsterSpeed: 1, rippleRange: 1, hearing: 1 } }));
      await play(doc);
      T.check('at another difficulty: no ghost yet', !E().ghost.state().shown);
      await finish(0);
      T.check('...then one of its own - two, one per difficulty', ghosts().length === 2 && new Set(ghosts().map((g) => g.m)).size === 2);
      doc = saveMine(Object.assign(doc, { difficulty: { rating: 'normal', monsterSpeed: 1, rippleRange: 1, hearing: 1 } }));
      await play(doc);
      T.check('back at Normal: Normal\'s ghost again', E().ghost.state().shown && E().ghost.state().bestMs === ghosts().find((g) => g.m === 'normal').t);
      await toTitle();
      // the maze edited: both go
      const walls = doc.walls.slice();
      walls[1] = '#.....#.....#';
      walls[3] = '#.#.......#.#';
      doc = saveMine(Object.assign(doc, { walls }));
      T.check('its maze edited: its old ghosts are gone (at every difficulty)', ghosts().length === 0);
      await play(doc);
      await finish(0);
      await toTitle();
      const dup = EchoLevelStore.duplicate('ghost-edit');
      T.check('a duplicate has no ghost of its own', dup.ok && EchoGhosts.best('mylevels', dup.doc) === null);
      EchoLevelStore.delete('ghost-edit');
      T.check('deleted: its ghosts are deleted too', ghosts().filter((g) => g.id === 'ghost-edit').length === 0);
      EchoLevelStore.delete(dup.doc.id);
      // imported from a share code: its own ghost
      const sample = EchoLevelStore.bonus.get('bonus-03-embers').doc;
      const sc = await EchoShare.encodeLevel(sample);
      const dec = sc && sc.code ? await EchoShare.decode(sc.code) : null;
      if (dec && dec.ok) {
        const imp = EchoLevelStore.importShared(dec);
        const idNow = imp && imp.ok ? (imp.ids || [])[0] || (imp.doc && imp.doc.id) : null;
        T.check(`a level imported from a share code gets its own ghost (${idNow})`, !!idNow);
        if (idNow) {
          const d2 = EchoLevelStore.get(idNow).doc;
          await play(d2);
          await finish(0);
          T.check('...kept like any other', !!EchoGhosts.best('mylevels', d2));
          const code2 = await EchoShare.encodeLevel(d2);
          T.check('a share code of it holds no ghost (the same code as before it had one)', code2.code === sc.code);
          await toTitle();
          EchoLevelStore.delete(idNow);
        }
      } else T.note('share code round trip not available here');
      // the cap
      localStorage.removeItem(GK);
      const big = { schemaVersion: 1, ghosts: [] };
      for (let i = 0; i < EchoGhosts.MAX_GHOSTS; i++) big.ghosts.push({ s: 'mylevels', id: `old${i}`, h: '00000000', m: 'normal', t: 9000, at: 1000 + i, x: 60, y: 60, d: 'ff' });
      localStorage.setItem(GK, JSON.stringify(big));
      doc = saveMine(myLevel('ghost-cap'));
      await play(doc);
      await finish(0);
      const ids = ghosts().map((g) => g.id);
      T.check(`the cap: still ${EchoGhosts.MAX_GHOSTS}, the oldest (old0) gone, the new one kept`, ids.length === EchoGhosts.MAX_GHOSTS && !ids.includes('old0') && ids.includes('ghost-cap'), ids.length);
      // storage full, then off: quiet
      const w = errorWatch();
      const setItem = Storage.prototype.setItem;
      localStorage.removeItem(GK);
      Storage.prototype.setItem = function (k, v) {
        if (k === GK) throw new DOMException('full', 'QuotaExceededError');
        return setItem.call(this, k, v);
      };
      try {
        await play(doc);
        const r = await finish(0);
        T.check(`storage full: the run finishes, nothing kept, no "New best!" (${stats()})`, r.done && localStorage.getItem(GK) === null && !/New best|ready/.test(stats()) && /^Time \d:\d\d/.test(stats()));
      } finally {
        Storage.prototype.setItem = setItem;
      }
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) {
        if (k === GK) throw new DOMException('off', 'SecurityError');
        return getItem.call(this, k);
      };
      Storage.prototype.setItem = function (k, v) {
        if (k === GK) throw new DOMException('off', 'SecurityError');
        return setItem.call(this, k, v);
      };
      try {
        await play(doc);
        const r = await finish(0);
        T.check('storage off: the same - it simply does not record', r.done && !E().ghost.state().shown);
      } finally {
        Storage.prototype.getItem = getItem;
        Storage.prototype.setItem = setItem;
      }
      w.stop();
      T.check('...and no error shown or logged', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
      // save codes: not in them, and a load is not confused by them
      await play(doc);
      await finish(0);
      await toTitle();
      const ctx = E().saveCode.ctx();
      const gathered = EchoSave.gather(ctx, { settings: true, levels: true });
      const gj = JSON.stringify(gathered);
      T.check('a save code holds no ghosts (not even with settings and My Levels ticked)', !gj.includes(GK) && !gj.includes('"ghosts"') && !ghosts().some((g) => g.d.length > 12 && gj.includes(g.d)), gj.slice(0, 200));
      const enc = await EchoSave.encode(gathered);
      const dec2 = await EchoSave.decode(enc.code, ctx);
      T.check('...and one made with ghosts stored reads back fine', dec2 && dec2.ok !== false && !!dec2.save);
      EchoSave.load(dec2.save, ctx, {});
      T.check('...and loads without touching them', !!EchoGhosts.best('mylevels', doc));
      EchoSave.undo();
      EchoLevelStore.delete('ghost-cap');
    } finally {
      release();
      undo();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ it changes nothing
  async function same() {
    const T = suite('same');
    const undo = keepStorage([GK]);
    const doc = saveMine(EchoLevelStore.bonus.get('bonus-04-lure') ? Object.assign(JSON.parse(JSON.stringify(EchoLevelStore.bonus.get('bonus-04-lure').doc)), { id: 'ghost-same' }) : myLevel('ghost-same'));
    const sounds = [];
    const A = E().audio;
    const spied = [...new Set(Object.getOwnPropertyNames(Object.getPrototypeOf(A)).concat(Object.keys(A)))].filter((k) => k !== 'constructor').filter((k) => typeof A[k] === 'function' && !/^(init|setMuted|setBusVolume|resume|suspend|_)/.test(k));
    const orig = {};
    function seeded(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    async function scripted() {
      await toTitle();
      const mr = Math.random;
      Math.random = seeded(99);
      const prints = [];
      try {
        E().playCustom(doc, 'mylevels', {});
        sounds.length = 0;
        // the same keys every time: right, down, a ping, left...
        const plan = [['ArrowRight', 50], ['Space', 1], ['ArrowDown', 40], ['ArrowLeft', 30], ['Space', 1], ['ArrowDown', 60], ['ArrowRight', 70], ['Space', 1], ['', 90]];
        for (const [k, n] of plan) {
          if (k) key(k, true);
          for (let i = 0; i < n && info().state === 'play'; i++) {
            E().step(1 / 60);
            E().draw();
            if (i % 5 === 0) prints.push([info().levelTime.toFixed(3), P().x.toFixed(2), P().y.toFixed(2), info().enemies.map((e) => `${e.kind}:${e.x.toFixed(2)},${e.y.toFixed(2)}:${e.state}`).join('|'), E().ripples().length, E().ripples().map((r) => `${r.x.toFixed(1)},${(r.rays && r.rays.length) || 0}`).join('|')].join(' '));
          }
          if (k) key(k, false);
        }
      } finally {
        Math.random = mr;
        release();
      }
      return { prints, sounds: sounds.slice(), state: info().state };
    }
    try {
      for (const k of spied) {
        orig[k] = A[k];
        A[k] = function () {
          sounds.push(k);
          return orig[k].apply(this, arguments);
        };
      }
      localStorage.removeItem(GK);
      const a = await scripted(); // no ghost
      // now give the level a ghost (a run walked out), and run the same script with it shown
      await play(doc);
      await finish(0);
      const b = await scripted();
      T.check(`a ghost was shown in the second scripted run (${EchoGhosts.best('mylevels', doc) ? 'kept' : 'none'})`, !!EchoGhosts.best('mylevels', doc));
      const firstDiff = a.prints.findIndex((p, i) => p !== b.prints[i]);
      T.check(`with and without the ghost: the player, every monster and every ripple identical, frame by frame (${a.prints.length} snapshots)`, a.prints.length > 50 && firstDiff < 0 && a.prints.length === b.prints.length, firstDiff >= 0 ? [a.prints[firstDiff], b.prints[firstDiff]] : a.prints.length);
      T.check(`...and every sound the same (${a.sounds.length} sound calls)`, a.sounds.join() === b.sounds.join(), [a.sounds.length, b.sounds.length]);
      T.note(`${a.prints.length} snapshots, ${a.sounds.length} sounds, monsters: ${info().enemies.map((e) => e.kind).join(',')}`);
    } finally {
      for (const k of Object.keys(orig)) A[k] = orig[k];
      await toTitle();
      EchoLevelStore.delete('ghost-same');
      undo();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ how it looks
  async function looks() {
    const T = suite('looks');
    const undo = keepStorage([GK, EchoGhosts.GHOST_KEY]);
    const cos0 = E().cosmetics.look();
    const calls = [];
    const dm = EchoCosmetics.drawMarker;
    try {
      localStorage.removeItem(GK);
      await toTitle();
      E().openSettings('title');
      await sleep(450);
      E().cosmetics.ui().showTab('display');
      await sleep(100);
      const tg = $('ghost-toggle');
      T.check('Settings -> Display has the Ghost switch, on by default', !!tg && tg.checked && EchoGhosts.enabled() && tg.getBoundingClientRect().height > 0);
      tg.click();
      T.check('...and switching it off is kept', !EchoGhosts.enabled() && localStorage.getItem(EchoGhosts.GHOST_KEY) === '0');
      tg.click();
      E().cosmetics.ui().close();
      await sleep(450);
      await toTitle();
      const doc = saveMine(myLevel('ghost-looks'));
      await play(doc);
      await finish(0);
      EchoCosmetics.drawMarker = function (ctx, id, x, y, size, low, t, calm, tint) {
        calls.push({ id, tint, a: ctx.globalAlpha });
        return dm.apply(this, arguments);
      };
      const markers = EchoCosmetics.LISTS.marker.filter((m) => EchoCosmetics.isUnlocked(m, E().cosmetics.facts())).map((m) => m.id);
      for (const m of markers) {
        E().cosmetics.equip('marker', m);
        await play(doc);
        E().step(0.4);
        calls.length = 0;
        E().draw();
        const g = calls.find((c) => c.tint);
        const me = calls.find((c) => !c.tint);
        T.check(`wearing ${m}: the ghost is your ${m}, in the ghost's cool tint, faint (alpha ${g && g.a.toFixed(2)}) - and you are drawn as ever`, g && g.id === m && g.tint === E().ghost.rgb && g.a > 0.2 && g.a <= 0.5 && me && me.id === m && !me.tint);
      }
      // off in Settings
      EchoGhosts.setEnabled(false);
      await play(doc, 'mylevels', true);
      T.check('Ghost off: the card says nothing of it', !shown('card-ghost'));
      E().endCard();
      E().step(0.4);
      calls.length = 0;
      E().draw();
      T.check('...and no ghost is drawn', !calls.some((c) => c.tint));
      await finish(0);
      T.check(`...the time still kept and shown (${stats()}), Play again as before`, /Best \d:\d\d/.test(stats()) && again() === 'Play again');
      EchoGhosts.setEnabled(true);
      T.note(`markers: ${markers.join(', ')}`);
    } finally {
      EchoCosmetics.drawMarker = dm;
      if (cos0) E().cosmetics.equip('marker', cos0.marker);
      EchoGhosts.setEnabled(true);
      await toTitle();
      EchoLevelStore.delete('ghost-looks');
      undo();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ the screens at this size
  async function screen() {
    const T = suite('screen');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}${document.documentElement.dataset.ui === 'light' ? ' daylight' : ''}`;
    const undo = keepStorage([GK]);
    try {
      localStorage.removeItem(GK);
      const doc = saveMine(myLevel('ghost-screen', { title: 'A Rather Long Level Name Here' }));
      await play(doc);
      await finish(2);
      await play(doc, 'mylevels', true);
      const card = $('card-ghost').getBoundingClientRect();
      T.check(`${size}: the card's "${$('card-ghost').textContent}" on screen`, card.width > 0 && card.left >= 0 && card.right <= innerWidth + 1);
      E().endCard();
      await finish(0);
      await sleep(500);
      const panel = $('complete').querySelector('.panel');
      const st = $('complete-stats');
      const sr = st.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      T.check(`${size}: the complete screen's "${stats()}" fits its panel`, sr.left >= pr.left - 1 && sr.right <= pr.right + 1 && st.scrollWidth <= st.clientWidth + 1 && /New best! -/.test(stats()));
      T.check(`${size}: the panel fits the screen, Race my ghost on it`, pr.top >= -1 && pr.bottom <= innerHeight + 1 && pr.right <= innerWidth + 1 && $('btn-custom-again').getBoundingClientRect().bottom <= innerHeight + 1 && again() === 'Race my ghost', [pr.top, pr.bottom, innerHeight]);
      T.check(`${size}: the HUD's clock`, $('hud-time').textContent !== '');
      await toTitle();
      EchoLevelStore.delete('ghost-screen');
    } finally {
      undo();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ cost
  async function perf() {
    const T = suite('perf');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    const undo = keepStorage([GK]);
    try {
      localStorage.removeItem(GK);
      const doc = saveMine(myLevel('ghost-perf'));
      await play(doc);
      await finish(1);
      await play(doc);
      let inPlay = 0;
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) {
        if (info().state === 'play' && E().ghost.at()) inPlay++;
        E().step(1 / 60);
        E().draw();
      }
      const withG = (performance.now() - t0) / 120;
      EchoGhosts.setEnabled(false);
      await play(doc);
      const t1 = performance.now();
      for (let i = 0; i < 120; i++) {
        E().step(1 / 60);
        E().draw();
      }
      const without = (performance.now() - t1) / 120;
      EchoGhosts.setEnabled(true);
      T.note(`${size}: ${withG.toFixed(2)} ms a frame with the ghost, ${without.toFixed(2)} ms without`);
      T.check(`${size}: a frame with the ghost well inside 60 fps (${withG.toFixed(2)} ms; without ${without.toFixed(2)} ms), the level being played with its ghost (${inPlay}/120)`, withG < 8 && inPlay === 120);
      await toTitle();
      EchoLevelStore.delete('ghost-perf');
    } finally {
      EchoGhosts.setEnabled(true);
      undo();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ the real loop
  async function live() {
    const T = suite('live');
    const cuesOn = !!E().settings().visualCues;
    const undo = keepStorage([GK]);
    const w = errorWatch();
    try {
      localStorage.removeItem(GK);
      const doc = saveMine(myLevel('ghost-live', { enemies: [{ kind: 'echo', x: 11, y: 3 }] }));
      await play(doc);
      await finish(0);
      await play(doc);
      info().enemies.length = 0;
      const t0 = info().levelTime;
      key('ArrowRight', true);
      await sleep(900);
      key('ArrowRight', false);
      key('Space', true);
      key('Space', false);
      await sleep(700);
      T.check(`Visual cues ${cuesOn ? 'ON' : 'off'}: the real loop runs a ghost run (${(info().levelTime - t0).toFixed(2)} s), the ghost moving`, info().levelTime - t0 > 0.5 && E().ghost.state().shown && !!E().ghost.at());
      await toTitle();
      EchoLevelStore.delete('ghost-live');
    } finally {
      release();
      w.stop();
      undo();
    }
    T.check('no console error, nothing caught by the loop', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    return T.done();
  }

  return { race, bonus, nothing, never, store, same, looks, screen, perf, live };
})();
