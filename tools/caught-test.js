/*
 * tools/caught-test.js (v16.4) - the Caught screen names what caught you. Load it into a ?debug page and run one
 * suite at a time (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   CaughtTest.custom()     caught by every kind there is, one at a time, in a custom level (both Wardens, the
 *                           mimic disguised and revealed, the singer by touch and by landing): the right line; the
 *                           Alarm never catches anyone
 *   CaughtTest.campaign()   caught on levels 3, 6, 8, 10, 11, 12, 15 and 16 (the Warden, and level 16's) and on
 *                           Hardcore (the title's notice); the tutorial has nothing that can catch you
 *   CaughtTest.shared()     a level read from a share code: the same lines
 *   CaughtTest.fallback()   an unknown kind, no kind, no monster: "The echo found me." and nothing breaks
 *   CaughtTest.together()   two monsters touching you on the same frame: the one that got there first
 *   CaughtTest.layout()     at the page's CURRENT size: the Caught screen holds the longest line on screen
 */
window.CaughtTest = (() => {
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
  const L = () => E().caughtLines();
  const line = () => $('caught-text').textContent;
  async function toTitle() {
    if (E().info().state !== 'title') E().toTitle();
    await until(() => E().info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(60);
  }
  /** A small open room: the start at (1,1) with the way out beside it, and these monsters far across the room. */
  function room(enemies) {
    const W = 15;
    const H = 9;
    const walls = [];
    for (let y = 0; y < H; y++) walls.push(y === 0 || y === H - 1 ? '#'.repeat(W) : '#' + '.'.repeat(W - 2) + '#');
    return { format: 'echo-maze-level', schemaVersion: 2, id: 'caught-test', title: 'Caught test', size: { w: W, h: H }, walls, start: { x: 1, y: 1 }, exits: [{ x: 2, y: 1 }], enemies, objects: [], effects: [], difficulty: { rating: 'normal' } };
  }
  /** Play `doc`, then stand the player on monster `pick` (or on its spot), step until caught or `secs` pass. */
  async function caughtBy(doc, pick = (e) => true, prep = null, secs = 1) {
    await toTitle();
    const err = E().playCustom(doc, 'editor');
    if (err) return { err };
    await until(() => E().info().state === 'play', 3000);
    const en = E().info().enemies;
    const e = en.find(pick);
    if (!e) return { err: 'no such monster' };
    if (prep) prep(e, en);
    E().tp(e.x, e.y);
    for (let t = 0; t < secs * 60 && E().info().state === 'play'; t++) E().step(1 / 60);
    return { state: E().info().state, line: line() };
  }

  async function custom() {
    const T = suite('custom');
    const cases = [
      ['echo', { kind: 'echo', x: 11, y: 5 }, 'echo'],
      ['scent', { kind: 'scent', x: 11, y: 5 }, 'scent'],
      ['mimic (disguised)', { kind: 'mimic', x: 11, y: 5 }, 'mimic'],
      ['stalker', { kind: 'stalker', x: 11, y: 5 }, 'stalker'],
      ['muffler', { kind: 'muffler', x: 11, y: 5 }, 'muffler'],
      ['singer', { kind: 'singer', x: 11, y: 5 }, 'singer'],
      ['screecho', { kind: 'screecho', x: 11, y: 5 }, 'screecho'],
      ['Level 15 monster', { kind: 'warden', variant: 'regular', x: 12, y: 6 }, 'warden'],
      ['Level 16 monster', { kind: 'warden', variant: 'upgraded', x: 12, y: 6 }, 'warden:upgraded'],
    ];
    for (const [name, m, key] of cases) {
      const r = await caughtBy(room([m]), (e) => e.kind === m.kind);
      T.check(`${name}: "${L()[key]}"`, r.state === 'caught' && r.line === L()[key], r);
    }
    // a mimic a ripple has turned: it is an echo monster now, and still counts as the mimic
    const rv = await caughtBy(room([{ kind: 'mimic', x: 11, y: 5 }]), (e) => e.kind === 'mimic', (e) => {
      e.kind = 'echo';
      e.fromMimic = true;
    });
    T.check(`a revealed mimic: "${L().mimic}"`, rv.state === 'caught' && rv.line === L().mimic, rv);
    // the singer's landing (marked, then it leaps onto the spot you are standing on)
    await toTitle();
    E().playCustom(room([{ kind: 'singer', x: 12, y: 6 }]), 'editor');
    await until(() => E().info().state === 'play');
    const sg = E().info().enemies.find((e) => e.kind === 'singer');
    E().tp(px(6), px(4));
    E().markBy(sg);
    let t = 0;
    while (E().info().state === 'play' && t < 8) {
      E().step(1 / 60);
      t += 1 / 60;
    }
    T.check(`marked, and the singer lands on you: "${L().singer}"`, E().info().state === 'caught' && line() === L().singer, { state: E().info().state, line: line(), t });
    // the Alarm: harmless
    const al = await caughtBy(room([{ kind: 'alarm', x: 11, y: 5 }]), (e) => e.kind === 'alarm', null, 1.5);
    T.check('standing on an Alarm: not caught (it never catches anyone)', al.state === 'play', al);
    await toTitle();
    return T.done();
  }

  /** Start level n on a seed where its `kind` stands alone (no other monster within 120 px), and return that monster. */
  function alone(n, kind) {
    for (let seed = 321; seed < 360; seed++) {
      E().seed(seed);
      E().go(n);
      const en = E().info().enemies;
      const e = en.find((x) => x.kind === kind);
      if (e && en.every((o) => o === e || Math.hypot(o.x - e.x, o.y - e.y) > 120)) return e;
    }
    return null;
  }

  async function campaign() {
    const T = suite('campaign');
    const cases = [
      [3, 'echo', 'echo'],
      [6, 'scent', 'scent'],
      [8, 'mimic', 'mimic'],
      [10, 'stalker', 'stalker'],
      [11, 'muffler', 'muffler'],
      [12, 'singer', 'singer'],
    ];
    for (const [n, kind, key] of cases) {
      await toTitle();
      E().setMode('normal');
      const e = alone(n, kind);
      if (!T.check(`level ${n} has a ${kind}`, !!e)) continue;
      E().tp(e.x, e.y);
      E().step(1 / 60);
      T.check(`level ${n}, caught by the ${kind}: "${L()[key]}"`, E().info().state === 'caught' && line() === L()[key], { state: E().info().state, line: line() });
      await sleep(1100); // (let the Caught screen come up, as a player would)
    }
    for (const [n, key] of [[15, 'warden'], [16, 'warden:upgraded']]) {
      await toTitle();
      E().setMode('normal');
      E().go(n);
      E().wakeHunter();
      const h = E().hunter();
      E().tp(h.x, h.y);
      E().step(1 / 60);
      T.check(`level ${n}, caught by its hunter: "${L()[key]}"`, E().info().state === 'caught' && line() === L()[key], { state: E().info().state, line: line() });
      await sleep(1100);
    }
    // Hardcore: no Caught screen - the title's notice says it
    await toTitle();
    E().setMode('hardcore');
    const st = alone(10, 'stalker');
    E().tp(st.x, st.y);
    E().step(1 / 60);
    await until(() => E().info().state === 'title' && !$('title-notice').classList.contains('hidden'), 4000);
    T.check(`Hardcore: the title's notice quotes it ("${L().stalker}")`, $('title-notice').textContent.includes(L().stalker), $('title-notice').textContent);
    E().setMode('normal');
    // the tutorial has nothing that can catch you
    await toTitle();
    E().go(0);
    T.check('the tutorial (level 0): no monsters at all', E().info().enemies.length === 0);
    await toTitle();
    return T.done();
  }

  async function shared() {
    const T = suite('shared');
    for (const [m, key] of [[{ kind: 'stalker', x: 11, y: 5 }, 'stalker'], [{ kind: 'warden', variant: 'upgraded', x: 12, y: 6 }, 'warden:upgraded'], [{ kind: 'screecho', x: 11, y: 5 }, 'screecho']]) {
      const enc = await E().share.encodeLevel(room([m]));
      const d = await E().share.decode(enc.code);
      const doc = d && d.ok && d.levels && d.levels[0];
      if (!T.check(`a ${key} level -> a code -> read back`, !!doc, d)) continue;
      const r = await caughtBy(doc, (e) => e.kind === m.kind);
      T.check(`...caught in it: "${L()[key]}"`, r.state === 'caught' && r.line === L()[key], r);
    }
    await toTitle();
    return T.done();
  }

  async function fallback() {
    const T = suite('fallback');
    const FB = 'The echo found me.';
    T.check('an unknown kind: the fallback', E().caughtLine('something-new') === FB);
    T.check('no kind: the fallback', E().caughtLine(undefined) === FB && E().caughtLine(null) === FB);
    T.check("names that are not kinds ('__proto__', 'toString', 'constructor'): the fallback", ['__proto__', 'toString', 'constructor'].every((k) => E().caughtLine(k) === FB));
    T.check('a Warden with no monster given: the Level 15 line', E().caughtLine('warden') === L().warden && E().caughtLine('warden', null) === L().warden);
    T.check('every kind the game has has its own line', MONSTER_TYPES.every((t) => E().caughtLines()[t.kind]) && E().caughtLines()['warden:upgraded']);
    // a real catch with an unknown kind and no monster: the screen still comes up
    await toTitle();
    E().setMode('normal');
    E().go(3);
    let threw = null;
    try {
      E().forceCaught('something-new', 'blind', null);
    } catch (e) {
      threw = e.message;
    }
    T.check('caught by "something-new", no monster: no error, the fallback line', !threw && E().info().state === 'caught' && line() === FB, { threw, line: line() });
    await until(() => !$('caught').classList.contains('hidden'), 2500);
    T.check('...and the Caught screen comes up as always', !$('caught').classList.contains('hidden'));
    await toTitle();
    return T.done();
  }

  async function together() {
    const T = suite('together');
    // both inside their reach on the same frame: the one deeper in got there first
    for (const [near, far] of [['echo', 'stalker'], ['stalker', 'echo']]) {
      await toTitle();
      E().playCustom(room([{ kind: 'echo', x: 9, y: 5 }, { kind: 'stalker', x: 11, y: 5 }]), 'editor');
      await until(() => E().info().state === 'play');
      const en = E().info().enemies;
      const a = en.find((e) => e.kind === near);
      const b = en.find((e) => e.kind === far);
      const P = { x: px(6), y: px(4) };
      a.x = P.x + 6;
      a.y = P.y;
      b.x = P.x - 16;
      b.y = P.y;
      for (const e of en) e.pause = 99;
      E().tp(P.x, P.y);
      E().step(1 / 60);
      T.check(`${near} (6 px) and ${far} (16 px) on the same frame: "${L()[near]}"`, E().info().state === 'caught' && line() === L()[near], line());
    }
    await toTitle();
    return T.done();
  }

  async function layout() {
    const T = suite('layout');
    const size = `${innerWidth}x${innerHeight}`;
    const longest = Object.values(L()).sort((a, b) => b.length - a.length)[0];
    await toTitle();
    E().setMode('normal');
    E().go(3);
    E().forceCaught('stalker', 'blind', null);
    $('caught-text').textContent = longest;
    await until(() => !$('caught').classList.contains('hidden') && $('caught').classList.contains('in'), 3000);
    await sleep(300);
    const p = document.querySelector('#caught .panel').getBoundingClientRect();
    const t = $('caught-text');
    T.check(`${size}: the Caught screen is on screen with "${longest}"`, p.top >= 0 && p.left >= 0 && p.right <= innerWidth + 0.5 && p.bottom <= innerHeight + 0.5, p.toJSON());
    T.check(`${size}: the line does not overflow`, t.scrollWidth <= t.clientWidth + 1, [t.scrollWidth, t.clientWidth]);
    T.check(`${size}: Try again is on screen`, $('btn-retry').getBoundingClientRect().bottom <= innerHeight + 0.5);
    await toTitle();
    return T.done();
  }

  return { custom, campaign, shared, fallback, together, layout };
})();
