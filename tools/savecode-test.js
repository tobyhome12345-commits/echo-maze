/*
 * tools/savecode-test.js (v22.0) - save codes (js/savecode.js, Settings -> Save code) in the real game. Load it into a
 * ?debug page and run one suite at a time (each is async and returns { suite, pass, fail, failed, notes }). The suites
 * write saves of their own into this page's storage and put the one the page opened with back at the end.
 *
 *   SaveCodeTest.roundTrips()  a fresh save, one part of the way through, a finished one, and one with settings and
 *                              levels and folders: make the code, wipe the save, load the code - everything the same
 *   SaveCodeTest.merge()       Merge keeps the best of both and loses nothing of either; loading it twice counts nothing twice
 *   SaveCodeTest.tamper()      damaged, cut off, the wrong kind, too big, newer, unknown ids, numbers out of range,
 *                              a decompression bomb, 1,500 random payloads: never a throw, never a write
 *   SaveCodeTest.importer()    a level code refused by the save loader and a save code by the level importer, by name
 *   SaveCodeTest.ui()          the tab: the code, Copy, Save as file, Load from file, the preview and its heads-up,
 *                              Merge, Undo, Replace (asked twice), Cancel; every screen that shows progress refreshed
 *   SaveCodeTest.pause()       opened from the pause menu: a code can be made, not loaded
 *   SaveCodeTest.testCopy()    the test copy's save code (its own prefix) reads and writes only its own slot, and back
 *   SaveCodeTest.screen()      the tab at the page's size: both halves inside the panel, no sideways scroll, 44 px on touch
 *   SaveCodeTest.live()        after a load the real game loop runs a level, with no console error
 */
window.SaveCodeTest = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = () => EchoSave;
  const P = 'echomaze.';
  const TEST = 'echomaze.test.';
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
  const ctx = () => E().saveCode.ctx();
  const allKeys = () => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
    return out;
  };
  /** This copy's own keys (never the test copy's), but not the undo copy. */
  function mine() {
    const o = {};
    for (const k of allKeys()) if (k.startsWith(P) && !k.startsWith(TEST) && k !== S().UNDO_KEY) o[k] = localStorage.getItem(k);
    return o;
  }
  function slot(prefix) {
    const o = {};
    for (const k of allKeys()) if (k.startsWith(prefix) && (prefix === TEST || !k.startsWith(TEST))) o[k] = localStorage.getItem(k);
    return o;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let kept = null;
  function keep() {
    if (!kept) kept = mine();
  }
  function wipe() {
    for (const k of allKeys()) if (k.startsWith(P) && !k.startsWith(TEST)) localStorage.removeItem(k);
  }
  function setSave(keys) {
    wipe();
    for (const k of Object.keys(keys)) localStorage.setItem(P + k, typeof keys[k] === 'string' ? keys[k] : JSON.stringify(keys[k]));
    E().saveCode.afterLoad();
  }
  function restore() {
    if (!kept) return;
    wipe();
    for (const k of Object.keys(kept)) localStorage.setItem(k, kept[k]);
    kept = null;
    E().saveCode.afterLoad();
  }

  // ------------------------------------------------------------------ the saves
  const FRAGS = () => EchoLore.FRAGMENTS.map((f) => f.id);
  const SCENES = () => ctx().scenes;
  const MID = () => ({
    tutorial: '1',
    progress: { normal: 14, hard: 6 },
    seen: { intro: 1, scent: 1, mimic: 1, decoy: 1, stalker: 1, muffler: 1, singer: 1, keeper: 1 },
    lore: FRAGS().slice(0, 10),
    medals: { normal: { 3: { time: 3, ripples: 2, flawless: 1, bestTime: 41.3, bestRipples: 9 }, 7: { time: 1, ripples: 3, flawless: 0, bestTime: 120.5, bestRipples: 14 } } },
    stats: { cleared: 21, deaths: 9, ripples: 400, crouches: 12, decoys: 1, marked: 0, nearMisses: 3, playTime: 2400, distance: 90000, deathsBy: { echo: 6, scent: 3 }, byMode: { normal: { cleared: 18, deaths: 7 }, hard: { cleared: 3, deaths: 2 } } },
    endless: { best: { normal: 7 }, last: { mode: 'normal', depth: 7, line: 'The echo found you.', at: '2026-10-01T10:00:00.000Z' } },
    cosmetics: { color: 'amber', shape: 'double', marker: 'ring', seen: ['color:amber', 'shape:double'] },
    whatsnew: 'v20.0',
  });
  const FINISHED = () => {
    const top = ctx().campaignLevels + 1;
    const seen = {};
    for (const k of SCENES()) seen[k] = 1;
    const medals = { normal: {}, hard: {} };
    for (let n = 1; n <= ctx().medalLevels; n++) {
      medals.normal[n] = { time: 3, ripples: 3, flawless: 1, bestTime: 30 + n, bestRipples: 5 + n };
      medals.hard[n] = { time: 2, ripples: 1, flawless: 0, bestTime: 60 + n, bestRipples: 9 + n };
    }
    const ids = ctx().bonusIds;
    return {
      tutorial: '1',
      editor: '1',
      lightui: '1',
      progress: { easy: top, normal: top, hard: top, hardcore: top },
      seen,
      lore: FRAGS(),
      medals,
      endless: { best: { easy: 20, normal: 12, hard: 11, hardcore: 10 } },
      cosmetics: { color: 'gold', shape: 'glitch', marker: 'ember', seen: ['color:gold', 'shape:glitch', 'marker:ember'] },
      bonus: { schemaVersion: 1, done: { [ids[0]]: '2026-10-02T10:00:00.000Z', [ids[1]]: '2026-10-03T10:00:00.000Z' } },
      whatsnew: 'v21.0',
    };
  };
  const SETTINGS = () => ({
    mode: 'hard',
    calm: '1',
    visualcues: localStorage.getItem(P + 'visualcues') === '1' ? '1' : '0', // (the page's own Visual cues choice stays as it was)
    touch: '0',
    keys: Object.assign({}, EchoProfile.DEFAULT_KEYS, { ripple: ['KeyQ'], crouch: ['KeyX', 'ShiftLeft'] }),
    volumes: { master: 0.5, effects: 0.7, ambience: 0.3 },
    palette: 'protan',
    showtimer: '1',
    creator: 'Night Owl',
  });
  /** Three of the bonus levels as the player's own, one of them unfinished, two in a folder. */
  function addLevels(n = 3, vary = false) {
    const ids = [];
    let seed = 99;
    const rnd = () => {
      seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const src = ECHO_BONUS_LEVELS[i % ECHO_BONUS_LEVELS.length];
      const d = EchoLevelFormat.copy(EchoLevelFormat.normalise(src).doc);
      d.id = EchoLevelFormat.newId();
      d.title = `${d.title} ${i + 1}`;
      if (i === 2) d.exits = []; // (a draft)
      // (levels unlike each other, so they do not simply compress away)
      if (vary) d.walls = d.walls.map((row, y) => (y === 0 || y === d.walls.length - 1 ? row : [...row].map((ch, x) => (x === 0 || x === row.length - 1 || rnd() > 0.3 ? ch : ch === '#' ? '.' : ch === '.' ? '#' : ch)).join('')));
      const r = EchoLevelStore.save(d);
      if (r.ok) ids.push(r.doc.id);
    }
    const f = EchoLevelStore.createFolder('Mine');
    if (f.ok) for (const id of ids.slice(0, 2)) EchoLevelStore.moveLevel(id, f.folder.id);
    return ids;
  }
  /** What matters about a save, in a form that is the same whatever the ids and dates. */
  function canon() {
    const s = S().gather(ctx(), { settings: true, levels: true });
    const key = (d) => `${d.title}|${EchoShare.contentKey(d)}`;
    const levels = s.levels.levels.map(key).sort();
    const folders = s.levels.folders.map((f) => `${f.name}:${f.levels.map((i) => key(s.levels.levels[i])).sort().join(',')}`).sort();
    delete s.levels;
    return { s, levels, folders, endlessLast: (JSON.parse(localStorage.getItem(P + 'endless') || 'null') || {}).last || null };
  }
  async function codeOf(opts) {
    const r = await S().encode(S().gather(ctx(), opts));
    return r.ok ? r.code : '';
  }

  // ------------------------------------------------------------------ round trips
  async function roundTrips() {
    const T = suite('roundTrips');
    keep();
    try {
      const cases = [
        ['a fresh save', {}, {}],
        ['part of the way through', MID(), {}],
        ['a finished save', FINISHED(), {}],
        ['with settings, levels and folders', Object.assign(MID(), SETTINGS()), { settings: true, levels: true }, true],
        ['a save from before difficulty modes (only "best")', { best: '9' }, {}],
      ];
      for (const [name, keys, opts, levels] of cases) {
        setSave(keys);
        if (levels) addLevels(3);
        const before = canon();
        const code = await codeOf(opts);
        T.note(`${name}: ${code.length} characters`);
        wipe();
        E().saveCode.afterLoad();
        const d = await S().decode(code, ctx());
        const r = d.ok ? S().load(d.save, ctx(), { replace: true }) : d;
        E().saveCode.afterLoad();
        const after = canon();
        // (a code holds the best only - the last Endless run stays on the device it was played on)
        before.endlessLast = null;
        after.endlessLast = null;
        T.check(`${name}: made, wiped, loaded - everything the same (${code.length} characters)`, d.ok && r.ok && same(before, after), d.ok ? JSON.stringify(after).slice(0, 300) : d.error);
        if (name === 'part of the way through') {
          T.check('...and the game holds it too: Normal level 14, the tutorial done', E().saveCode.progress().normal === 14 && E().saveCode.tutorialDone());
          T.check('...a progress-only code is short (under 200 characters)', code.length < 200, code.length);
        }
        if (levels) T.check('...the levels came back as levels (3, one a draft) in their folder', after.levels.length === 3 && after.folders.length === 1 && EchoLevelStore.list().filter((l) => !l.playable).length === 1, after);
        if (name.startsWith('a save from before')) T.check('...its old best is Normal\'s progress in the code', after.s.progress.normal === 9);
      }
    } finally {
      restore();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ merging
  async function merge() {
    const T = suite('merge');
    keep();
    try {
      const B = {
        progress: { normal: 6, hard: 9, easy: 3 },
        seen: { intro: 1, scent: 1, alarm: 1 },
        lore: FRAGS().slice(8, 14),
        medals: { normal: { 3: { time: 1, ripples: 3, flawless: 0, bestTime: 35.2, bestRipples: 12 }, 5: { time: 2, ripples: 2, flawless: 1, bestTime: 50, bestRipples: 8 } } },
        stats: { cleared: 5, deaths: 30, ripples: 100, playTime: 9000, deathsBy: { echo: 20 }, byMode: { hard: { cleared: 5, deaths: 30 } } },
        endless: { best: { normal: 3, hard: 15 } },
        cosmetics: { color: 'mint', shape: 'classic', marker: 'dot', seen: ['color:mint'] },
        whatsnew: 'v21.0',
        tutorial: '1',
      };
      setSave(B);
      const codeB = await codeOf({});
      const A = MID();
      delete A.tutorial;
      setSave(A);
      const d = await S().decode(codeB, ctx());
      const r = S().load(d.save, ctx(), {});
      E().saveCode.afterLoad();
      const g = S().gather(ctx(), {});
      T.check('merged', d.ok && r.ok);
      T.check('the furthest level in each difficulty (Normal 14 kept, Hard 9 and Easy 3 taken)', g.progress.normal === 14 && g.progress.hard === 9 && g.progress.easy === 3, g.progress);
      T.check('every scene either save had', ['intro', 'scent', 'mimic', 'keeper', 'alarm'].every((k) => g.seen.includes(k)) && g.seen.length === 9, g.seen);
      T.check('every fragment either save had (10 + 6, 2 shared = 14)', g.lore.length === 14, g.lore.length);
      const m3 = g.medals.normal[3];
      T.check('medals: the better of each (time 3, ripples 3, flawless kept, the lower best time and ripples)', m3.time === 3 && m3.ripples === 3 && m3.flawless === 1 && m3.bestTime === 35.2 && m3.bestRipples === 9, m3);
      T.check('...and a level only one side had (5 and 7) kept', !!g.medals.normal[5] && !!g.medals.normal[7]);
      T.check('Endless: the higher best in each mode', g.endless.normal === 7 && g.endless.hard === 15, g.endless);
      T.check('stats: the higher of each, never the sum', g.stats.cleared === 21 && g.stats.deaths === 30 && g.stats.playTime === 9000 && g.stats.deathsBy.echo === 20, g.stats);
      T.check('the look this device wears kept, the looks seen from both', g.cosmetics.color === 'amber' && g.cosmetics.seen.includes('color:mint'), g.cosmetics);
      T.check('the newer What\'s new seen, and the tutorial done', g.whatsnew === 'v21.0' && g.tutorial);
      T.check('the last Endless run on this device kept', !!JSON.parse(localStorage.getItem(P + 'endless')).last);
      const once = JSON.stringify(mine());
      const d2 = await S().decode(codeB, ctx());
      S().load(d2.save, ctx(), {});
      T.check('loading the same code again changes nothing (nothing counted twice)', JSON.stringify(mine()) === once);
      // the other way round: nothing of the code's side lost either
      setSave(A);
      const codeA = await codeOf({});
      setSave(B);
      S().load((await S().decode(codeA, ctx())).save, ctx(), {});
      const g2 = S().gather(ctx(), {});
      T.check('the other way round, the same best of both', g2.progress.normal === 14 && g2.progress.hard === 9 && g2.lore.length === 14 && g2.seen.length === 9 && g2.medals.normal[3].bestTime === 35.2, g2.progress);
    } finally {
      restore();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ untrusted codes
  async function craft(fn) {
    const w = EchoShare._.writer();
    fn(w);
    const r = await EchoShare._.wrap('S', w.done(), 1e7);
    return r.code;
  }
  async function tamper() {
    const T = suite('tamper');
    keep();
    const errs = [];
    const onErr = (e) => errs.push(String(e.message || e));
    window.addEventListener('error', onErr);
    try {
      setSave(MID());
      const good = await codeOf({ settings: true });
      const before = JSON.stringify(mine());
      const level = (await EchoShare.encodeLevel(EchoLevelFormat.normalise(ECHO_BONUS_LEVELS[0]).doc)).code;
      const folder = (await EchoShare.encodeFolder('Two', ECHO_BONUS_LEVELS.slice(0, 2).map((d) => EchoLevelFormat.normalise(d).doc))).code;
      const flip = (c, i) => c.slice(0, i) + (c[i] === 'A' ? 'B' : 'A') + c.slice(i + 1);
      const bad = [
        ['empty', '', 'empty'],
        ['plain words', 'my save please', 'notCode'],
        ['a level code', level, 'level'],
        ['a folder code', folder, 'folder'],
        ['cut off', good.slice(0, good.length - 7), 'damaged'],
        ['one character changed', flip(good, 20), 'damaged'],
        ['the wrong kind letter', `ECHO1X${good.slice(6)}`, 'damaged'],
        ['a newer format version (ECHO2S)', `ECHO2S${good.slice(6)}`, 'newer'],
        ['far too long', `ECHO1S${'A'.repeat(3100000)}`, 'tooBig'],
        ['a newer save format inside', await craft((w) => w.uint(2)), 'newer'],
        ['a record this version does not know', await craft((w) => { w.uint(1); w.uint(0); w.uint(99); w.uint(1); w.byte(1); }), 'newer'],
        ['a record twice', await craft((w) => { w.uint(1); w.uint(0); w.uint(4); w.uint(1); w.byte(1); w.uint(4); w.uint(1); w.byte(1); }), 'damaged'],
        ['a record cut short', await craft((w) => { w.uint(1); w.uint(0); w.uint(1); w.uint(9); w.uint(4); }), 'damaged'],
      ];
      // a decompression bomb: 9 MB of zeros squeezed small
      const bomb = await craft((w) => w.bytes(new Uint8Array(9 * 1024 * 1024)));
      bad.push([`a decompression bomb (${bomb.length} characters)`, bomb, 'tooBig']);
      for (const [name, text, want] of bad) {
        let r;
        try {
          r = await S().decode(text, ctx());
        } catch (e) {
          r = { threw: String(e) };
        }
        T.check(`${name}: refused (${want})`, r && r.ok === false && r.code === want && typeof r.error === 'string' && r.error.length > 10, r && (r.threw || r.code));
      }
      T.check('the words for them are friendly', /damaged/.test(S().ERR.damaged) && /level code/.test(S().ERR.level) && /newer version/.test(S().ERR.newer));
      // out of range and unknown: read, but only what this game knows, every number in range
      const odd = await craft((w) => {
        w.uint(1);
        w.uint(1);
        const rec = (tag, f) => {
          const b = EchoShare._.writer();
          f(b);
          const bytes = b.done();
          w.uint(tag);
          w.uint(bytes.length);
          w.bytes(bytes);
        };
        rec(1, (b) => { b.uint(6); b.uint(99999); b.uint(0); b.uint(5); b.uint(7); b.uint(8); b.uint(9); });
        rec(2, (b) => { b.uint(4); b.bytes(new Uint8Array([255, 255, 255, 255])); b.uint(2); b.str('__proto__'); b.str('<b>scene</b>'); });
        rec(3, (b) => { b.uint(1); b.bytes(new Uint8Array([1])); b.uint(1); b.str('zz99'); });
        rec(5, (b) => { b.uint(1); b.uint(1); b.uint(2); b.uint(999); b.uint(255); b.uint(0); b.uint(0); b.uint(3); b.uint(255); b.uint(5e6); b.uint(0); });
        rec(6, (b) => { b.uint(4); b.uint(9e6); b.uint(0); b.uint(0); b.uint(0); });
        rec(7, (b) => { b.str('nope'); b.str('glitch'); b.str('<img>'); b.uint(2); b.str('color:nope'); b.str('shape:glitch'); });
        rec(9, (b) => b.str('v<99>'));
        rec(11, (b) => { b.uint(2); b.str('not-a-bonus'); b.str(ctx().bonusIds[0]); });
        rec(24, (b) => { b.uint(2); b.str('__proto__'); b.uint(1); b.str('KeyZ'); b.str('ripple'); b.uint(2); b.str('Escape'); b.str('KeyR'); });
        rec(25, (b) => { b.uint(1); b.uint(0); b.uint(900); });
        rec(26, (b) => b.str('sparkly'));
        rec(28, (b) => b.str('<script>x</script>‮evil'));
      });
      const o = await S().decode(odd, ctx());
      const s = o.ok ? o.save : null;
      T.check('a code with odd values is read (not thrown over)', !!s, o.error);
      if (s) {
        const top = ctx().campaignLevels + 1;
        T.check(`levels clamped to the real campaign (99999 -> ${top}), a sixth mode ignored`, s.progress.easy === top && !s.progress.normal && s.progress.hard === 5 && s.progress.hardcore === 7, s.progress);
        T.check('only known cutscenes (the bits past the list, "__proto__" and markup dropped)', s.seen.every((k) => ctx().scenes.includes(k)) && s.seen.length === Math.min(ctx().scenes.length, 32), s.seen);
        T.check('only known fragments ("zz99" dropped)', s.lore.length === 1 && s.lore[0] === FRAGS()[0], s.lore);
        T.check(`medals: a level past ${ctx().medalLevels} dropped, tiers and times in range`, !s.medals.normal[999] && s.medals.normal[3] && s.medals.normal[3].time <= 3 && s.medals.normal[3].bestTime <= 360000, s.medals);
        T.check('Endless depth capped', s.endless.easy <= 99999, s.endless);
        T.check('cosmetics: unknown looks become the classic ones, unknown "seen" dropped', s.cosmetics.color === 'classic' && s.cosmetics.shape === 'glitch' && s.cosmetics.marker === 'dot' && s.cosmetics.seen.join() === 'shape:glitch', s.cosmetics);
        T.check('a What\'s new version that is not one: dropped', s.whatsnew === null);
        T.check('only real bonus levels', s.bonus.length === 1 && s.bonus[0] === ctx().bonusIds[0]);
        T.check('keys: "__proto__" and Escape dropped, the rest kept', s.settings.keys && !Object.prototype.hasOwnProperty.call(s.settings.keys, '__proto__') && s.settings.keys.ripple.join() === 'KeyR' && Object.getPrototypeOf(s.settings.keys) === Object.prototype, s.settings.keys);
        T.check('volume clamped to 1, an unknown palette dropped, the creator name cleaned', s.settings.volumes.master === 1 && s.settings.palette === undefined && !/[<>‮]/.test(s.settings.creator), s.settings);
      }
      // random payloads with a correct check: never a throw, anything accepted is in range
      let thrown = 0;
      let accepted = 0;
      let outOfRange = 0;
      let seed = 7;
      const rnd = () => {
        seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < 1500; i++) {
        const n = 1 + Math.floor(rnd() * 60);
        const bytes = new Uint8Array(n);
        for (let j = 0; j < n; j++) bytes[j] = Math.floor(rnd() * 256);
        if (i % 3 === 0) bytes[0] = 1; // (often a real format number, so the records are read)
        if (i % 3 === 0 && n > 1) bytes[1] = 0;
        const code = (await EchoShare._.wrap('S', bytes, 1e7)).code;
        try {
          const r = await S().decode(code, ctx());
          if (r.ok) {
            accepted++;
            const v = r.save;
            const top = ctx().campaignLevels + 1;
            if (Object.values(v.progress).some((x) => x > top) || v.seen.some((k) => !ctx().scenes.includes(k)) || v.lore.some((k) => !FRAGS().includes(k))) outOfRange++;
          }
        } catch (e) {
          thrown++;
        }
      }
      T.note(`random payloads: ${accepted} of 1500 read as saves`);
      T.check('1,500 random payloads: none threw, none read out of range', thrown === 0 && outOfRange === 0, { thrown, outOfRange });
      T.check('nothing was written by any of it', JSON.stringify(mine()) === before);
      // and through the screen: a bad code loads nothing, opens no question
      await openTab();
      $('sc-in').value = good.slice(0, 40);
      $('btn-sc-load').click();
      await until(() => /damaged/.test($('sc-msg').textContent), 3000);
      T.check('through the screen: a damaged code says so, asks nothing, writes nothing', /damaged/.test($('sc-msg').textContent) && $('dialog').classList.contains('hidden') && JSON.stringify(mine()) === before, $('sc-msg').textContent);
      await closeSettings();
    } finally {
      window.removeEventListener('error', onErr);
      restore();
    }
    T.check('no error on the page', errs.length === 0, errs.slice(0, 3));
    return T.done();
  }

  // ------------------------------------------------------------------ the other loader
  async function importer() {
    const T = suite('importer');
    keep();
    try {
      setSave(MID());
      const save = await codeOf({});
      const r = await EchoShare.decode(save);
      T.check('a save code in the level importer: "That\'s a save code. Load it in Settings -> Save code."', !r.ok && r.code === 'saveCode' && /save code/.test(r.error) && /Settings -> Save code/.test(r.error), r.error);
      const level = (await EchoShare.encodeLevel(EchoLevelFormat.normalise(ECHO_BONUS_LEVELS[1]).doc)).code;
      const back = await S().decode(level, ctx());
      T.check('a level code in the save loader: "That\'s a level code... My Levels"', !back.ok && back.code === 'level' && /My Levels/.test(back.error), back.error);
      const lv = await EchoShare.decode(level);
      T.check('level codes still read as levels (ECHO1L unchanged)', lv.ok && lv.kind === 'level' && /^ECHO1L/.test(level));
      const sc = await EchoShare.decode('ECHO1S');
      T.check('even a bare ECHO1S is a save code to the level importer', !sc.ok && sc.code === 'saveCode');
    } finally {
      restore();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ the screen
  async function toTitle() {
    if (E().info().state !== 'title') E().toTitle();
    await until(() => E().info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(40);
  }
  async function openTab(from = 'title') {
    if (from === 'title') {
      await toTitle();
      $('btn-settings').click();
    } else $('btn-pause-settings').click();
    await until(() => !$('settings').classList.contains('hidden') && !E().ui().transitioning, 3000);
    await sleep(E().ui().fadeMs + 60);
    document.querySelector('#settings .tab[data-tab="savecode"]').click();
    await until(() => /^ECHO1S/.test($('sc-out').value), 3000);
  }
  async function closeSettings() {
    for (let i = 0; i < 3 && !$('settings').classList.contains('hidden'); i++) {
      $('btn-settings-back').click();
      await until(() => $('settings').classList.contains('hidden'), 1500);
    }
    await sleep(E().ui().fadeMs + 60);
  }
  const dialogUp = () => !$('dialog').classList.contains('hidden');
  async function press(label) {
    await until(dialogUp, 3000);
    const b = [...document.querySelectorAll('#dialog-buttons button')].find((x) => x.textContent.trim() === label);
    if (!b) return false;
    b.click();
    await sleep(80);
    return true;
  }
  async function ui() {
    const T = suite('ui');
    keep();
    const errs = [];
    const onErr = (e) => errs.push(String(e.message || e));
    window.addEventListener('error', onErr);
    const click0 = HTMLAnchorElement.prototype.click;
    try {
      setSave(MID());
      await openTab();
      const c1 = $('sc-out').value;
      T.check(`the tab: the code in its box (ECHO1S, ${c1.length} characters) and its length`, /^ECHO1S[0-9A-Za-z]+$/.test(c1) && new RegExp(`${c1.length} characters`).test($('sc-out-info').textContent), $('sc-out-info').textContent);
      $('sc-settings').click();
      await until(() => $('sc-out').value !== c1, 3000);
      T.check('"Include my settings" makes a longer code (off by default)', $('sc-out').value.length > c1.length);
      $('sc-settings').click();
      await until(() => $('sc-out').value === c1, 3000);
      // a long code: many levels
      addLevels(14, true);
      $('sc-levels').click();
      await until(() => $('sc-out').value.length > 2000, 4000);
      T.check(`with 14 levels it is long (${$('sc-out').value.length} characters): it says so and suggests the file`, $('sc-out').value.length > 2000 && /Save as file/.test($('sc-out-info').textContent) && $('sc-out-info').classList.contains('warn'), $('sc-out-info').textContent);
      $('sc-levels').click();
      await until(() => $('sc-out').value === c1, 3000);
      // Copy
      $('btn-sc-copy').click();
      await until(() => /Copied|Select the code/.test($('sc-out-info').textContent), 2000);
      T.check(`Copy code (${$('sc-out-info').textContent})`, /Copied|Select the code/.test($('sc-out-info').textContent));
      // Save as file: the download, caught
      let dl = null;
      HTMLAnchorElement.prototype.click = function () {
        dl = { name: this.download, href: this.href };
      };
      $('btn-sc-file').click();
      HTMLAnchorElement.prototype.click = click0;
      const fileText = dl ? await (await fetch(dl.href)).text() : '';
      T.check('Save as file: echo-maze-save.txt, holding the code', dl && dl.name === 'echo-maze-save.txt' && fileText.trim() === c1, dl);
      // Load from file, on a fresh device: the preview, the heads-up, Merge
      setSave({ tutorial: '1' });
      await sleep(60);
      const dt = new DataTransfer();
      dt.items.add(new File([fileText], 'echo-maze-save.txt', { type: 'text/plain' }));
      $('sc-file').files = dt.files;
      $('sc-file').dispatchEvent(new Event('change'));
      await until(dialogUp, 3000);
      const pv = $('dialog-text').textContent;
      T.check('Load from file: a preview first, in plain words', /Normal: level 14/.test(pv) && /Hard: level 6/.test(pv) && /10 fragments/.test(pv) && /8 cutscenes seen/.test(pv), pv);
      T.check('...with the heads-up: it is further along than this device', /further along/.test(pv) && /unlock levels and scenes/.test(pv));
      T.check('...nothing changed before an answer', E().saveCode.progress().normal === undefined || E().saveCode.progress().normal <= 1);
      await press('Merge (recommended)');
      await until(() => /Loaded/.test($('sc-msg').textContent), 3000);
      T.check('Merge: loaded, and it says so', /merged/.test($('sc-msg').textContent), $('sc-msg').textContent);
      T.check('...the game holds it at once (Normal 14, Hard 6)', E().saveCode.progress().normal === 14 && E().saveCode.progress().hard === 6);
      T.check('...Undo last load offered', !$('btn-sc-undo').classList.contains('hidden'));
      await closeSettings();
      T.check('...the title refreshed: Continue (Level 14), Levels & cutscenes, Fragments', !$('btn-continue').classList.contains('hidden') && /14/.test($('btn-continue').textContent) && !$('btn-replay').classList.contains('hidden') && !$('btn-archive').classList.contains('hidden'), $('btn-continue').textContent);
      // Undo
      await openTab();
      $('btn-sc-undo').click();
      await press('Undo it');
      await until(() => /back to how it was/.test($('sc-msg').textContent), 3000);
      T.check('Undo last load: back to the fresh save, and Undo gone', !(E().saveCode.progress().normal > 1) && $('btn-sc-undo').classList.contains('hidden'), E().saveCode.progress());
      await closeSettings();
      T.check('...the title too: no Continue', $('btn-continue').classList.contains('hidden'));
      // Replace (asked twice), and Cancel
      setSave(FINISHED());
      const fin = await codeOf({});
      setSave(MID());
      const midKeys = JSON.stringify(mine());
      await openTab();
      $('sc-in').value = `  here it is:\n${fin.slice(0, 30)}\n${fin.slice(30)}  `; // (pasted with junk round it and a line break)
      $('btn-sc-load').click();
      await press('Cancel');
      await until(() => /Nothing was changed/.test($('sc-msg').textContent), 2000);
      T.check('Cancel: nothing changed', JSON.stringify(mine()) === midKeys);
      $('sc-in').value = fin;
      $('btn-sc-load').click();
      await press('Replace my save');
      await until(() => /Replace your save/.test($('dialog-title').textContent), 2000);
      T.check('Replace asks a second time', /Replace your save/.test($('dialog-title').textContent));
      await press('Cancel');
      await sleep(100);
      T.check('...and Cancel there changes nothing', JSON.stringify(mine()) === midKeys);
      $('sc-in').value = fin;
      $('btn-sc-load').click();
      await press('Replace my save');
      await press('Yes, replace it');
      await until(() => /replaced/.test($('sc-msg').textContent), 3000);
      const g = S().gather(ctx(), {});
      T.check('Replace: the code\'s save instead (finished everywhere, Hard\'s medals; Normal\'s only-mine medals gone)', g.progress.easy === ctx().campaignLevels + 1 && !!g.medals.hard && g.medals.normal[3].time === 3 && g.medals.normal[3].bestTime === 33, g.medals.normal[3]);
      await closeSettings();
      T.check('...the title says Finished', /Finished/.test(document.querySelector('#title .modes').textContent));
    } finally {
      HTMLAnchorElement.prototype.click = click0;
      window.removeEventListener('error', onErr);
      await closeSettings();
      restore();
    }
    T.check('no error on the page', errs.length === 0, errs.slice(0, 3));
    return T.done();
  }

  async function pause() {
    const T = suite('pause');
    keep();
    try {
      setSave(MID());
      await toTitle();
      E().go(3);
      await sleep(60);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP', key: 'p', bubbles: true }));
      await until(() => E().info().state === 'paused' && !E().ui().transitioning, 3000);
      await openTab('pause');
      T.check('from the pause menu: a code can still be made', /^ECHO1S/.test($('sc-out').value));
      T.check('...but not loaded (and it says where)', $('btn-sc-load').disabled && $('btn-sc-fromfile').disabled && /title screen/.test($('sc-msg').textContent), $('sc-msg').textContent);
      const r = await E().saveCode.ui().load($('sc-out').value);
      T.check('...not even by its own call', !r.ok);
      await closeSettings();
      T.check('...and back to the paused game', E().info().state === 'paused');
    } finally {
      await toTitle();
      restore();
    }
    return T.done();
  }

  // ------------------------------------------------------------------ the test copy's own slot
  async function testCopy() {
    const T = suite('testCopy');
    keep();
    const testKeys = slot(TEST);
    try {
      // the test copy's builder turns 'echomaze.' into 'echomaze.test.' in every file: make that copy of this one
      const src = (await (await fetch(`/js/savecode.js?${Date.now()}`)).text()).replace(/echomaze\./g, TEST);
      const TS = new Function(`${src}\nreturn EchoSave;`)();
      T.check(`the test copy's save codes use its own prefix (${TS.PREFIX})`, TS.PREFIX === TEST && S().PREFIX === P);
      setSave(MID());
      await sleep(1000); // (anything the game itself has waiting to write - a fade's end, the What's new record - first)
      const real0 = JSON.stringify(slot(P));
      for (const k of Object.keys(testKeys)) localStorage.removeItem(k);
      const fin = FINISHED();
      for (const k of Object.keys(fin)) localStorage.setItem(TEST + k, typeof fin[k] === 'string' ? fin[k] : JSON.stringify(fin[k]));
      const testFull = JSON.stringify(slot(TEST));
      const code = (await TS.encode(TS.gather(ctx(), { settings: true }))).code;
      T.check('the test copy\'s code is of its own (finished) save', /^ECHO1S/.test(code) && (await TS.decode(code, ctx())).save.progress.easy === ctx().campaignLevels + 1);
      for (const k of Object.keys(slot(TEST))) localStorage.removeItem(k);
      const r = TS.load((await TS.decode(code, ctx())).save, ctx(), { replace: true });
      T.check('loaded in the test copy: its own slot has it back', r.ok && JSON.parse(localStorage.getItem(`${TEST}progress`)).easy === ctx().campaignLevels + 1);
      const real1 = slot(P);
      const r0 = JSON.parse(real0);
      const moved = Object.keys(Object.assign({}, r0, real1)).filter((k) => r0[k] !== real1[k]);
      T.check('...and the real game\'s save was not touched at all', moved.length === 0, moved);
      TS.undo();
      // and the other way: the real game loads into its own slot, never the test copy's
      const now = JSON.stringify(slot(TEST));
      const d = await S().decode(code, ctx());
      S().load(d.save, ctx(), {});
      T.check('loaded in the real game: the test copy\'s slot not touched', JSON.stringify(slot(TEST)) === now);
      T.check('...the real save has it (merged)', JSON.parse(localStorage.getItem(`${P}progress`)).easy === ctx().campaignLevels + 1);
      T.note(`test slot keys: ${Object.keys(JSON.parse(testFull)).length}`);
    } finally {
      for (const k of Object.keys(slot(TEST))) localStorage.removeItem(k);
      for (const k of Object.keys(testKeys)) localStorage.setItem(k, testKeys[k]);
      restore();
    }
    return T.done();
  }

  async function screen() {
    const T = suite('screen');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}${document.documentElement.dataset.ui === 'light' ? ' daylight' : ''}`;
    const touch = document.body.classList.contains('touch');
    keep();
    try {
      setSave(Object.assign(MID(), document.documentElement.dataset.ui === 'light' ? { progress: { normal: 29 } } : {}));
      await openTab();
      const pane = document.querySelector('[data-pane="savecode"]');
      T.check(`${size}: the Save code tab is up, with both halves`, !pane.classList.contains('hidden') && pane.querySelectorAll('.sc-half').length === 2);
      const panel = $('settings').querySelector('.panel').getBoundingClientRect();
      const items = [...pane.querySelectorAll('.sc-half, textarea, button:not(.hidden), label')];
      const outside = items.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && (r.left < panel.left - 1 || r.right > panel.right + 1);
      }).map((el) => el.id || el.className);
      T.check(`${size}: nothing wider than the panel, no sideways scroll`, outside.length === 0 && document.documentElement.scrollWidth <= innerWidth + 1, outside);
      const btns = [...pane.querySelectorAll('button:not(.hidden)')];
      T.check(`${size}: every button${touch ? ' at least 44 px tall' : ' a real size'}`, btns.every((b) => b.getBoundingClientRect().height >= (touch ? 44 : 24)), btns.map((b) => Math.round(b.getBoundingClientRect().height)));
      const tabs = [...document.querySelectorAll('#settings .tab')];
      T.check(`${size}: every Settings tab on screen`, tabs.every((b) => b.getBoundingClientRect().right <= innerWidth + 1 && b.getBoundingClientRect().width > 20));
      const fs = parseFloat(getComputedStyle($('sc-out')).fontSize);
      T.check(`${size}: the code readable (${fs} px)`, fs >= 12);
      if (document.documentElement.dataset.ui === 'light') T.check(`${size}: in the daylight interface`, /invert/.test(getComputedStyle($('settings')).filter));
      await closeSettings();
    } finally {
      restore();
    }
    return T.done();
  }

  async function live() {
    const T = suite('live');
    keep();
    const errs = [];
    const oe = console.error;
    console.error = (...a) => {
      errs.push(a.map(String).join(' ').slice(0, 200));
      oe.apply(console, a);
    };
    const onErr = (e) => errs.push(String(e.message || e));
    window.addEventListener('error', onErr);
    const fe0 = E().frameErrors();
    try {
      setSave(FINISHED());
      const code = await codeOf({ settings: true });
      setSave({ tutorial: '1' });
      const d = await S().decode(code, ctx());
      S().load(d.save, ctx(), {});
      E().saveCode.afterLoad();
      await toTitle();
      E().go(2);
      const t0 = E().info().levelTime;
      await sleep(600); // (the real loop - requestAnimationFrame)
      T.check(`after a load the real loop runs a level (Visual cues ${E().settings().visualCues ? 'ON' : 'off'})`, E().info().levelTime - t0 > 0.2 && E().info().state === 'play');
      await toTitle();
    } finally {
      console.error = oe;
      window.removeEventListener('error', onErr);
      restore();
    }
    T.check('no console error, nothing caught by the loop', errs.length === 0 && E().frameErrors() === fe0, errs.slice(0, 3));
    return T.done();
  }

  return { roundTrips, merge, tamper, importer, ui, pause, testCopy, screen, live };
})();
