/*
 * tools/cosmetics-test.js (v21.0) - the cosmetics in the real game. Load it into a ?debug page and run one suite at a
 * time (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   CosmeticsTest.unlocks()  with the save the page opened with: every item unlocked exactly when its condition holds
 *                            (worked out here from the save itself), locked ones saying it in plain words - and
 *                            Endless's as "???" while Endless is not open; nothing "unlocked" is stored
 *   CosmeticsTest.draw()     every colour, every shape and every marker drawn on an early level, a gaol story level,
 *                            Endless and an editor level: no error, and never harder to see than the classic look (the
 *                            lit pixels of a ripple and round the marker, measured on the canvas)
 *   CosmeticsTest.same()     the game is the same with every look: a scripted run (the same seeded numbers, pings,
 *                            moves) fingerprints the ripples' rays, their timing and every monster identically
 *   CosmeticsTest.scope()    yours only: a drop's ripple, a cutscene and the daylight levels are drawn as ever
 *   CosmeticsTest.screen()   the Cosmetics tab at the page's size: three rows, locked dimmed with the condition, equipped
 *                            marked, a click equips (a locked one does nothing), the preview moving, nothing wider than
 *                            the panel, 44 px on touch, the daylight interface's filter undone on the canvases
 *   CosmeticsTest.dot()      the "new" dot on Settings and the tab: there for an unseen unlock, gone once the tab is seen
 *   CosmeticsTest.storage()  storage that throws or holds junk: the defaults, and no error
 *   CosmeticsTest.perf()     a frame with three ripples in the busiest looks, well inside 60 fps
 *   CosmeticsTest.live()     the real game loop with every shape and marker in turn: no console error
 */
window.CosmeticsTest = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const C = () => EchoCosmetics;
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
  const ping = () => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); // (a button left focused by a screen takes Space for itself)
    key('Space', true);
    key('Space', false);
  };
  const info = () => E().info();
  async function toTitle() {
    if (info().state !== 'title') E().toTitle();
    await until(() => info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(30);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  // Settings opens and closes with a fade, and a press during a fade is ignored (v11.5): wait it out, and check
  const settingsOpen = () => !$('settings').classList.contains('hidden');
  async function openSettings() {
    $('btn-settings').click();
    await until(() => settingsOpen() && !E().ui().transitioning, 3000);
    await sleep(E().ui().fadeMs + 80);
  }
  async function closeSettings() {
    for (let i = 0; i < 3 && settingsOpen(); i++) {
      $('btn-settings-back').click();
      await until(() => !settingsOpen() && info().state === 'title', 1500);
    }
    await sleep(E().ui().fadeMs + 80);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (settingsOpen()) throw new Error('Settings would not close');
  }
  const KINDS = ['color', 'shape', 'marker'];
  const equipAll = (color, shape, marker) => {
    // (straight into the save: some tests wear a look the save has not unlocked - the game must then show the default)
    localStorage.setItem(C().KEY, JSON.stringify({ color, shape, marker, seen: C().state.seen }));
    C().reload();
    E().cosmetics.refresh();
  };
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
  /** Lit pixels in a square of the game canvas round (sx, sy) in CSS px - how much there is to see there. */
  function litAround(cssX, cssY, half) {
    const cv = $('game');
    const k = cv.width / cv.clientWidth;
    const x0 = Math.max(0, Math.round((cssX - half) * k));
    const y0 = Math.max(0, Math.round((cssY - half) * k));
    const w = Math.min(cv.width - x0, Math.round(half * 2 * k));
    const h = Math.min(cv.height - y0, Math.round(half * 2 * k));
    const d = cv.getContext('2d').getImageData(x0, y0, w, h).data;
    let n = 0;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (l > 40) n++;
      sum += l;
    }
    return { n, sum };
  }

  // ------------------------------------------------------------------------------------------ unlocks
  async function unlocks() {
    const T = suite('unlocks');
    await toTitle();
    const s = E().settings();
    const prog = s.progress || {};
    const best = (m) => prog[m] || 1;
    const furthest = Math.max(...['easy', 'normal', 'hard', 'hardcore'].map(best));
    let eb = 0;
    try {
      const e = JSON.parse(localStorage.getItem('echomaze.endless')) || {};
      eb = Math.max(0, ...Object.values(e.best || {}).filter(Number.isFinite));
    } catch (e) {
      eb = 0;
    }
    const endlessOpen = furthest >= 13;
    const expect = {
      'color:classic': true, 'color:amber': furthest > 5, 'color:mint': furthest > 10, 'color:rose': furthest > 15, 'color:violet': furthest > 20, 'color:gold': furthest > 25, 'color:whitehot': eb >= 10,
      'shape:classic': true, 'shape:double': furthest > 8, 'shape:dotted': furthest > 12, 'shape:soft': furthest > 18, 'shape:heartbeat': eb >= 5, 'shape:glitch': furthest > 20,
      'marker:dot': true, 'marker:ring': furthest > 3, 'marker:diamond': best('hard') >= 2, 'marker:star': furthest > 25, 'marker:ember': best('hardcore') >= 2,
    };
    const f = E().cosmetics.facts();
    const wrong = [];
    const words = [];
    for (const k of KINDS) {
      for (const it of C().LISTS[k]) {
        const got = C().isUnlocked(it, f);
        if (got !== expect[`${k}:${it.id}`]) wrong.push(`${k}:${it.id} ${got}`);
        if (!got) words.push(`${it.name}: ${C().condition(it, f)}`);
      }
    }
    const n = Object.values(expect).filter(Boolean).length;
    T.note({ furthest, endlessBest: eb, unlocked: n, locked: words });
    T.check(`every item unlocked exactly when its condition holds (best level ${furthest}, Endless ${eb}: ${n} of 18)`, wrong.length === 0, wrong);
    const endlessWords = words.filter((w) => /White-hot|Heartbeat/.test(w));
    T.check(`Endless's conditions: ${endlessOpen ? 'said plainly' : '"???" - Endless is not open yet'} (${endlessWords.join('; ')})`, endlessWords.every((w) => (endlessOpen ? /Reach depth \d+ in Endless/.test(w) : /: \?\?\?$/.test(w))));
    T.check('every other locked one in plain words ("Clear level N" / "Clear a level on Hard")', words.filter((w) => !/White-hot|Heartbeat/.test(w)).every((w) => /: Clear (level \d+|a level on (Hard|Hardcore))$/.test(w)));
    T.check('nothing about a level past 25 is ever named', words.every((w) => !/level (2[6-9]|[3-9]\d)/.test(w)));
    const stored = localStorage.getItem(C().KEY) || '';
    T.check('nothing "unlocked" is stored - only what is worn and what has been seen', !/unlock/i.test(stored));
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ drawing and readability
  const LEVELS = [
    { name: 'level 3', go: () => E().go(3) },
    { name: 'the gaol (14)', go: () => E().go(14) },
    { name: 'Endless depth 8', go: () => (E().endless.unlocked() ? (E().endless.start(77), E().endless.goDepth(8)) : E().go(8)) },
    { name: 'an editor level', go: () => E().playCustom(ECHO_BONUS_LEVELS[2], 'bonus') },
  ];
  async function frameWith(look) {
    equipAll(look[0], look[1], look[2]);
    info().enemies.length = 0;
    E().step(2.2); // (the recharge from the last one)
    E().ripples().length = 0;
    ping();
    E().step(0.32);
    const rs = E().ripples();
    for (let i = rs.length - 1; i >= 0; i--) if (!rs[i].mine) rs.splice(i, 1); // (only yours: a drop's would vary)
    E().snapCamera();
    E().draw();
    const cv = $('game');
    const p = info().player;
    // what there is to see: the whole frame's ripple, and the 30 px round you
    const all = litAround(cv.clientWidth / 2, cv.clientHeight / 2, Math.min(cv.clientWidth, cv.clientHeight) / 2 - 2);
    const me = litAround(cv.clientWidth / 2, cv.clientHeight / 2, 9);
    return { all, me, p, sent: rs.length };
  }
  async function draw() {
    const T = suite('draw');
    const w = errorWatch();
    const shortfalls = [];
    let drawn = 0;
    try {
      for (const L of LEVELS) {
        await toTitle();
        L.go();
        for (let i = 0; i < 40 && E().scriptLock().locked; i++) E().step(0.25);
        if (info().state === 'card') key('Enter', true), key('Enter', false);
        E().step(0.1);
        E().audio.setMuted(true);
        const base = await frameWith(['classic', 'classic', 'dot']);
        const looks = [];
        for (const c of C().COLORS) looks.push([c.id, 'classic', 'dot']);
        for (const s of C().SHAPES) looks.push(['classic', s.id, 'dot']);
        for (const m of C().MARKERS) looks.push(['classic', 'classic', m.id]);
        for (const lk of looks) {
          // the look must really be worn: everything is unlocked for this test by the save the suite runs on
          const r = await frameWith(lk);
          drawn++;
          const ripple = r.all.n / Math.max(1, base.all.n);
          const marker = r.me.sum / Math.max(1, base.me.sum);
          if (!r.sent || ripple < 0.5 || marker < 0.8) shortfalls.push(`${L.name} ${lk.join('/')}: ripple ${ripple.toFixed(2)}, marker ${marker.toFixed(2)}`);
        }
        T.note(`${L.name}: classic ${base.all.n} lit px, marker ${Math.round(base.me.sum)}`);
      }
    } finally {
      w.stop();
      equipAll('classic', 'classic', 'dot');
    }
    T.check(`every colour, shape and marker drawn on ${LEVELS.length} kinds of level (${drawn} frames)`, drawn === LEVELS.length * 18);
    T.check('none harder to see than the classic look (at least half its lit ripple, its marker as bright)', shortfalls.length === 0, shortfalls.slice(0, 6));
    T.check('no console error, nothing caught by the loop', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ (v22.1) every look SEEN to differ
  /** How many pixels of two images differ by a clear step of brightness (luminance > 24 apart). */
  function differ(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      const la = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
      const lb = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
      if (Math.abs(la - lb) > 24) n++;
    }
    return n;
  }
  /** The wavefront as it really is on screen: the game's canvas round you, with one of your ripples `secs` old. */
  async function gameShot(look, secs) {
    equipAll(look[0], look[1], look[2]);
    info().enemies.length = 0;
    E().step(2.2);
    E().ripples().length = 0;
    ping();
    E().step(secs);
    const rs = E().ripples();
    for (let i = rs.length - 1; i >= 0; i--) if (!rs[i].mine) rs.splice(i, 1);
    E().snapCamera();
    E().draw();
    const cv = $('game');
    return cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  }
  function previewShot(look, age) {
    const cv = document.createElement('canvas');
    cv.width = 240;
    cv.height = 150;
    const c = cv.getContext('2d');
    C().drawPreview(c, cv.width, cv.height, C().look({ color: C().COLORS.find((x) => x.id === look[0]), shape: C().SHAPES.find((x) => x.id === look[1]), marker: C().MARKERS.find((x) => x.id === look[2]) }), { still: age, paletteWall: '95,212,255', size: 5, calm: !!E().settings().calm });
    return c.getImageData(0, 0, cv.width, cv.height).data;
  }
  async function visible() {
    const T = suite('visible');
    const shapes = C().SHAPES.map((s) => s.id);
    // the preview: the wave at seven moments of its way out
    const ages = [0.35, 0.6, 0.85, 1.1, 1.35, 1.6, 1.85].map((k) => (k / 2.2) * C().RIPPLE_EVERY);
    const pv = {};
    for (const s of shapes) pv[s] = ages.map((a) => previewShot(['classic', s, 'dot'], a));
    const pvDiff = {};
    for (const s of shapes) pvDiff[s] = ages.reduce((sum, _, i) => sum + differ(pv.classic[i], pv[s][i]), 0);
    T.note({ preview: pvDiff });
    // the game, level 3: the wave at three moments (lub, dub, and later)
    await toTitle();
    E().go(3);
    E().step(0.1);
    const moments = [0.19, 0.29, 0.45];
    const gm = {};
    for (const s of shapes) gm[s] = [];
    for (const m of moments) for (const s of shapes) gm[s].push(await gameShot(['classic', s, 'dot'], m));
    const gmDiff = {};
    for (const s of shapes) gmDiff[s] = moments.reduce((sum, _, i) => sum + differ(gm.classic[i], gm[s][i]), 0);
    T.note({ game: gmDiff });
    const pairs = [];
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];
      const g = moments.reduce((sum, _, k) => sum + differ(gm[a][k], gm[b][k]), 0);
      const p = ages.reduce((sum, _, k) => sum + differ(pv[a][k], pv[b][k]), 0);
      if (g < VISIBLE_MIN || p < VISIBLE_MIN) pairs.push(`${a}/${b}: game ${g}, preview ${p}`);
    }
    T.check(`every two ripple shapes look plainly different on screen - in a level and in the preview (at least ${VISIBLE_MIN} pixels apart)`, pairs.length === 0, pairs);
    const hb = gmDiff.heartbeat;
    T.check(`the Heartbeat stands out from Classic as much as any other shape does (${hb} pixels in the level)`, hb >= Math.min(...shapes.filter((s) => s !== 'classic' && s !== 'heartbeat').map((s) => gmDiff[s])) * 0.6 && hb >= VISIBLE_MIN * 3, gmDiff);
    // the Heartbeat everywhere it is worn - the gaol, Endless, an editor level - in other colours and with other markers
    const weak = [];
    for (const L of LEVELS) {
      await toTitle();
      L.go();
      for (let i = 0; i < 40 && E().scriptLock().locked; i++) E().step(0.25);
      if (info().state === 'card') key('Enter', true), key('Enter', false);
      E().step(0.1);
      for (const [col, mk] of [['gold', 'star'], ['mint', 'ring'], ['whitehot', 'ember']]) {
        let d = 0;
        for (const m of [0.19, 0.29]) {
          const a = await gameShot([col, 'classic', mk], m);
          const b = await gameShot([col, 'heartbeat', mk], m);
          d += differ(a, b);
        }
        if (d < VISIBLE_MIN * 2) weak.push(`${L.name} ${col}/${mk}: ${d}`);
        else T.note(`${L.name} ${col}/${mk}: ${d}`);
      }
    }
    T.check(`the Heartbeat plainly different from Classic on ${LEVELS.map((l) => l.name).join(', ')}, in three colours with three markers`, weak.length === 0, weak);
    equipAll('classic', 'classic', 'dot');
    await toTitle();
    return T.done();
  }
  const VISIBLE_MIN = 400;

  // ------------------------------------------------------------------------------------------ the game is the same
  async function same() {
    const T = suite('same');
    if (!window.IdentityTest) {
      await new Promise((r) => {
        const s = document.createElement('script');
        s.src = '/tools/identity-test.js?' + Date.now();
        s.onload = r;
        document.head.appendChild(s);
      });
    }
    // (1) a whole scripted game - the same keys, the same random numbers (tools/identity-test.js), drawn every frame
    // (2) one ripple sent from a fixed spot and run on: every ray, its reach, its speed, its life, where its wave is
    const rippleHash = () => {
      let h = 2166136261;
      const add = (v) => {
        h ^= Math.round(v * 1000) & 0xffffffff;
        h = Math.imul(h, 16777619) >>> 0;
      };
      E().seed(4242);
      E().go(9);
      E().ripples().length = 0;
      const p = info().player;
      ping();
      const rp = E().ripples()[0];
      for (let f = 0; f < 90; f++) {
        E().step(1 / 60);
        if (f % 2 === 0) E().draw();
      }
      add(E().ripples().length);
      if (!rp) return 'none';
      if (rp) {
        add(p.x);
        add(p.y);
        add(rp.R);
        add(rp.t);
        add(rp.life);
        add(rp.v || 0);
        add(rp.lag || 0);
        for (let j = 0; j < rp.dist.length; j++) add(rp.dist[j] + rp.type[j] * 10000);
      }
      return h.toString(16);
    };
    const runWith = async (look) => {
      equipAll(look[0], look[1], look[2]);
      await toTitle();
      const game = IdentityTest.run({ mode: 'normal', level: 9, seed: 7, frames: 900, draw: 1, reveal: 150 }).hash;
      await toTitle();
      const ripple = rippleHash();
      await toTitle();
      return `${game}/${ripple}`;
    };
    const base = await runWith(['classic', 'classic', 'dot']);
    const diff = [];
    for (const look of [['gold', 'glitch', 'ember'], ['whitehot', 'heartbeat', 'star'], ['mint', 'double', 'ring'], ['rose', 'dotted', 'diamond'], ['violet', 'soft', 'dot'], ['amber', 'classic', 'ring']]) {
      const got = await runWith(look);
      if (got !== base) diff.push(`${look.join('/')}: ${got}`);
    }
    T.check(`a scripted game (level 9, pings, moves, mimic reveals) and one ripple's rays, reach and timing identical in every look (${base})`, diff.length === 0 && !/undefined|none/.test(base), diff);
    equipAll('classic', 'classic', 'dot');
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ yours only
  async function scope() {
    const T = suite('scope');
    equipAll('gold', 'glitch', 'ember');
    const calls = { wave: 0, marker: 0 };
    const sw = C().strokeWave;
    const dm = C().drawMarker;
    // (the game calls them through EchoCosmetics: counted here by wrapping)
    EchoCosmetics.strokeWave = function () {
      calls.wave++;
      return sw.apply(this, arguments);
    };
    EchoCosmetics.drawMarker = function () {
      calls.marker++;
      return dm.apply(this, arguments);
    };
    try {
      // the gaol's drops: not yours
      await toTitle();
      E().go(14);
      for (let i = 0; i < 40 && E().scriptLock().locked; i++) E().step(0.25);
      E().ripples().length = 0;
      E().castRipple(info().player.x + 40, info().player.y, 76, { ambient: true });
      const dripRp = E().ripples().find((rp) => rp.ambient);
      T.check('a drop of water\'s ripple is not yours', !!dripRp && !dripRp.mine);
      ping();
      E().step(0.2);
      calls.wave = 0;
      E().draw();
      T.check('your own ripple there is drawn in your look', calls.wave > 0 && E().ripples().some((rp) => rp.mine));
      // a cutscene
      await toTitle();
      calls.wave = 0;
      calls.marker = 0;
      E().intro();
      E().csTo(26);
      E().draw();
      E().csTo(40);
      E().draw();
      T.check(`a cutscene: drawn as ever (your look ${calls.wave + calls.marker} times)`, calls.wave === 0 && calls.marker === 0);
      // the daylight levels
      for (const n of [26, 27, 28]) {
        await toTitle();
        E().go(n);
        E().step(6);
        calls.wave = 0;
        calls.marker = 0;
        E().draw();
        T.check(`level ${n} (daylight): you drawn as ever, no ripple (your look ${calls.wave + calls.marker} times)`, calls.wave === 0 && calls.marker === 0);
      }
      // and the dark: the marker
      await toTitle();
      E().go(3);
      calls.marker = 0;
      E().draw();
      T.check('a dark level: your marker drawn in your look', calls.marker > 0);
    } finally {
      EchoCosmetics.strokeWave = sw;
      EchoCosmetics.drawMarker = dm;
      equipAll('classic', 'classic', 'dot');
    }
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the screen
  async function screen() {
    const T = suite('screen');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    const light = document.documentElement.dataset.ui === 'light';
    const touch = document.body.classList.contains('touch');
    await toTitle();
    await openSettings();
    const tabBtn = document.querySelector('#settings .tab[data-tab="cosmetics"]');
    tabBtn.click();
    await sleep(150);
    const rows = ['cos-colors', 'cos-shapes', 'cos-markers'].map((id) => $(id).querySelectorAll('.cos-tile').length);
    T.check(`${size}: the Cosmetics tab - three rows (${rows.join(', ')})`, rows.join() === '7,6,5' && !document.querySelector('[data-pane="cosmetics"]').classList.contains('hidden'));
    const f = E().cosmetics.facts();
    const tiles = [...document.querySelectorAll('#settings .cos-tile')];
    const locked = tiles.filter((b) => b.classList.contains('locked'));
    T.check(`${size}: locked ones dimmed, with what unlocks them (${locked.length})`, locked.every((b) => b.getAttribute('aria-disabled') === 'true' && b.querySelector('.cos-why') && b.querySelector('.cos-why').textContent.length > 2 && parseFloat(getComputedStyle(b).opacity) < 0.8));
    const on = tiles.filter((b) => b.classList.contains('on'));
    T.check(`${size}: one equipped in each row, marked`, on.length === 3 && on.every((b) => b.getAttribute('aria-pressed') === 'true'));
    // equip by clicking an unlocked one; a locked one does nothing
    const pick = tiles.find((b) => !b.classList.contains('locked') && !b.classList.contains('on') && b.dataset.kind === 'shape') || tiles.find((b) => !b.classList.contains('locked') && !b.classList.contains('on'));
    if (pick) {
      const kind = pick.dataset.kind;
      pick.click();
      await sleep(60);
      T.check(`${size}: a click equips it (${kind} ${pick.dataset.id})`, C().state[kind] === pick.dataset.id && document.querySelector(`#settings .cos-tile.on[data-kind="${kind}"]`).dataset.id === pick.dataset.id);
    }
    const lockedOne = document.querySelector('#settings .cos-tile.locked');
    if (lockedOne) {
      const before = JSON.stringify(C().state);
      lockedOne.click();
      await sleep(40);
      T.check(`${size}: a click on a locked one does nothing`, JSON.stringify(C().state) === before);
    }
    // the preview: moving, and not blank
    const pv = $('cos-preview');
    const lit = () => {
      const d = pv.getContext('2d').getImageData(0, 0, pv.width, pv.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
      return n;
    };
    await sleep(300);
    const a = lit();
    T.check(`${size}: the preview draws your marker and ripple (${a} lit px)`, a > 20 && E().cosmetics.ui().previewRunning() === true);
    // fits: nothing wider than the panel, the tiles big enough to tap
    const panel = $('settings').querySelector('.panel').getBoundingClientRect();
    const now = [...document.querySelectorAll('#settings .cos-tile')]; // (a click re-renders the rows)
    const wide = now.filter((b) => b.getBoundingClientRect().right > panel.right + 1 || b.getBoundingClientRect().left < panel.left - 1).map((b) => b.dataset.id);
    const short = touch ? now.filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.dataset.id) : [];
    T.check(`${size}: nothing wider than the panel${touch ? ', every tile at least 44 px tall' : ''}`, wide.length === 0 && short.length === 0 && document.documentElement.scrollWidth <= innerWidth + 1, { wide, short, scrollWidth: document.documentElement.scrollWidth });
    if (light) {
      const fl = getComputedStyle(pv).filter;
      T.check(`${size}, daylight interface: the game's own look on the canvases (the filter undone: ${fl})`, /invert\(1\)/.test(fl));
    }
    await closeSettings();
    await sleep(80);
    T.check(`${size}: closing Settings stops the preview`, !E().cosmetics.ui().previewRunning());
    E().cosmetics.equip('shape', 'classic');
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the dot
  async function dot() {
    const T = suite('dot');
    localStorage.setItem(C().KEY, JSON.stringify({ color: 'classic', shape: 'classic', marker: 'dot', seen: [] }));
    C().reload();
    await toTitle();
    E().cosmetics.refresh();
    const f = E().cosmetics.facts();
    const fresh = C().fresh(f).length;
    const shown = (id) => !$(id).classList.contains('hidden');
    if (!fresh) {
      T.check('nothing unlocked yet: no dot', !shown('settings-dot') && !shown('cos-dot'));
      return T.done();
    }
    T.check(`${fresh} unlocked and unseen: a dot on Settings and on its Cosmetics tab`, shown('settings-dot') && shown('cos-dot'));
    await openSettings();
    document.querySelector('#settings .tab[data-tab="stats"]').click();
    await sleep(60);
    T.check('...still there on another tab', shown('cos-dot'));
    document.querySelector('#settings .tab[data-tab="cosmetics"]').click();
    await sleep(80);
    T.check(`...the tab opened: "New" on the ${fresh} new ones, and the dot gone`, document.querySelectorAll('#settings .cos-new').length === fresh && !shown('cos-dot'));
    T.check('...remembered as seen (in its own key)', C().fresh(f).length === 0 && JSON.parse(localStorage.getItem(C().KEY)).seen.length >= fresh);
    await closeSettings();
    await sleep(60);
    T.check('...and gone from Settings on the title', !shown('settings-dot'));
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ storage
  async function storage() {
    const T = suite('storage');
    const w = errorWatch();
    const set = Storage.prototype.setItem;
    const get = Storage.prototype.getItem;
    try {
      localStorage.setItem(C().KEY, '{"color":"<b>","shape":42,"marker":"__proto__","seen":[1,"color:amber","x:y"]}');
      C().reload();
      T.check('junk in its key: the defaults, and only the well-formed "seen"', C().state.color === 'classic' && C().state.shape === 'classic' && C().state.marker === 'dot' && C().state.seen.join() === 'color:amber');
      localStorage.setItem(C().KEY, 'not json');
      C().reload();
      T.check('not even JSON: the defaults', C().state.color === 'classic');
      Storage.prototype.getItem = function (k) {
        if (String(k).includes('cosmetics')) throw new Error('blocked');
        return get.call(this, k);
      };
      Storage.prototype.setItem = function (k, v) {
        if (String(k).includes('cosmetics')) throw new Error('blocked');
        return set.call(this, k, v);
      };
      C().reload();
      T.check('storage that throws: the defaults', C().state.color === 'classic' && C().state.marker === 'dot');
      const f = E().cosmetics.facts();
      const it = C().MARKERS.find((m) => m.id !== 'dot' && C().isUnlocked(m, f));
      if (it) {
        E().cosmetics.equip('marker', it.id);
        T.check(`...equipping still works for now (${it.id}), it just is not kept`, E().cosmetics.look().marker === it.id);
      }
      await toTitle();
      E().go(3);
      E().step(0.1);
      E().draw();
    } finally {
      Storage.prototype.setItem = set;
      Storage.prototype.getItem = get;
      w.stop();
      localStorage.removeItem(C().KEY);
      C().reload();
      E().cosmetics.refresh();
    }
    T.check('no error', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ cost
  async function perf() {
    const T = suite('perf');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    for (const look of [['classic', 'classic', 'dot'], ['gold', 'glitch', 'ember'], ['violet', 'heartbeat', 'star'], ['mint', 'soft', 'ring'], ['rose', 'double', 'diamond'], ['amber', 'dotted', 'dot']]) {
      equipAll(look[0], look[1], look[2]);
      await toTitle();
      E().go(10);
      for (let i = 0; i < 3; i++) {
        ping();
        E().step(0.9);
      }
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) {
        E().step(1 / 60);
        E().draw();
      }
      const ms = (performance.now() - t0) / 120;
      T.note(`${size}: ${look.join('/')} ${ms.toFixed(2)} ms a frame`);
      T.check(`${size}: ${look.join('/')} well inside a 60 fps frame (${ms.toFixed(2)} ms)`, ms < 8);
    }
    equipAll('classic', 'classic', 'dot');
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the real loop
  async function live() {
    const T = suite('live');
    const on = !!E().settings().visualCues;
    const w = errorWatch();
    const dead = [];
    try {
      const looks = C().SHAPES.map((s, i) => [C().COLORS[i % C().COLORS.length].id, s.id, C().MARKERS[i % C().MARKERS.length].id]);
      for (const look of looks) {
        equipAll(look[0], look[1], look[2]);
        await toTitle();
        E().go(6);
        const t0 = info().levelTime;
        ping();
        await sleep(500); // (requestAnimationFrame - not step())
        key('ShiftLeft', true);
        await sleep(150);
        key('ShiftLeft', false);
        if (!(info().levelTime - t0 > 0.2)) dead.push(look.join('/'));
      }
    } finally {
      w.stop();
      key('ShiftLeft', false);
      equipAll('classic', 'classic', 'dot');
    }
    T.check(`Visual cues ${on ? 'ON' : 'off'}: the real loop ran with every shape and marker worn`, dead.length === 0, dead);
    T.check('no console error, nothing caught by the loop', w.errs.length === 0 && w.frameErrors() === 0, w.errs.slice(0, 3));
    await toTitle();
    return T.done();
  }

  return { unlocks, draw, visible, same, scope, screen, dot, storage, perf, live };
})();
