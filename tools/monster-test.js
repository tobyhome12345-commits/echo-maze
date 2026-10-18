/*
 * tools/monster-test.js (v15.7) - the two UNRELEASED monsters, the Alarm and the Screecho, and the unreleased-content
 * warning in front of the level editor. Load it into a ?debug page and run one suite at a time (each is async and
 * returns { suite, pass, fail, failed, notes }):
 *
 *   MonsterTest.alarm()      only a ripple sets it off (not touching it, walking past, crouching, a decoy's call or
 *                            a singer's song); one scream; every monster but the Warden goes to where you were;
 *                            the spot stays put; spent, silent and dim afterwards; the hum before it
 *   MonsterTest.screecho()   hunts like an echo monster (speed MEASURED), listens, locks on, kills on touch, screams
 *                            when a ripple reaches it, and the cooldown MEASURED
 *   MonsterTest.tuning()     the monster-speed scale, measured; Calm mode; Visual cues; a Hardcore-rated level
 *   MonsterTest.gate()       the unreleased-content warning (order, every time, Back / Esc / keyboard, not inside)
 *   MonsterTest.gateFinished()  the same on a finished save (run it on one)
 *   MonsterTest.sharing()    codes with the new monsters round-trip; the sample codes still decode -> { code } too
 *   MonsterTest.editor()     the list (tags), placing both with the mouse, validation, test play
 *   MonsterTest.campaign()   neither ever appears in levels 0-16 (generated, all modes) or the bonus levels
 *   MonsterTest.noWrites()   a custom level full of screams writes nothing to the save
 *   MonsterTest.soak(levels, seconds, seed)  random levels with both, random keys - counts exceptions
 *
 * It plays custom levels through __echo.playCustom, which is the real path (buildCustomLevel -> startLevel).
 */
window.MonsterTest = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TILE = 40;
  const px = (t) => (t + 0.5) * TILE;
  async function until(fn, ms = 3000) {
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
  const tap = (code) => {
    key(code, true);
    key(code, false);
  };
  /** One of YOUR ripples (as the Space key sends it). */
  const ping = () => tap('Space');
  const step = (s) => E().step(s);
  const P = () => E().info().player;
  const en = () => E().info().enemies;
  const find = (k) => en().find((e) => e.kind === k);
  const cfg = () => E().info().level.cfg;
  const screams = () => E().screams();

  /** A level of open floor w x h with a ring of wall; `walls` adds wall tiles, everything else by tile. */
  function field(w, h, o = {}) {
    const grid = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) row += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.';
      grid.push(row.split(''));
    }
    for (const [x, y] of o.walls || []) grid[y][x] = '#';
    const now = new Date().toISOString();
    return {
      format: 'echo-maze-level',
      schemaVersion: 2,
      id: o.id || 'monster-test',
      title: o.title || 'Monster test',
      authorName: '',
      createdAt: now,
      updatedAt: now,
      size: { w, h },
      walls: grid.map((r) => r.join('')),
      start: o.start || { x: 2, y: Math.floor(h / 2) },
      exits: [{ x: (o.exit || { x: w - 2 }).x, y: (o.exit || { y: Math.floor(h / 2) }).y, locked: false }],
      enemies: o.enemies || [],
      objects: o.objects || [],
      effects: [],
      titleCard: '',
      palette: '',
      difficulty: o.difficulty || { rating: 'normal', monsterSpeed: 1, rippleRange: 1, hearing: 1 },
    };
  }
  async function play(doc) {
    E().setCalm(false);
    const err = E().playCustom(doc, 'editor');
    if (err) throw new Error('playCustom: ' + err);
    await until(() => E().info().state === 'play', 3000);
    step(0.05);
  }
  /** Wrap audio.<name> to count its calls (and keep its arguments). */
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
  const pathEnd = (e) => (e.path && e.path.length ? e.path[e.path.length - 1] : null);
  const near = (p, q, d) => !!p && !!q && Math.hypot(p.x - q.x, p.y - q.y) <= d;

  // ------------------------------------------------------------------------------------------- the Alarm
  // a 31 x 15 field: the start at (2, 7); an Alarm at (6, 7); every other kind of monster far off; a Level 15 monster
  // sealed in a pocket in the top-right corner (so it can never reach you, and the checker lets the level through)
  const ALARM_LEVEL = () =>
    field(31, 15, {
      walls: [[27, 1], [27, 2], [28, 2], [29, 2]],
      enemies: [
        { kind: 'alarm', x: 6, y: 7 },
        { kind: 'echo', x: 24, y: 3 },
        { kind: 'scent', x: 24, y: 12 },
        { kind: 'mimic', x: 20, y: 9 },
        { kind: 'stalker', x: 17, y: 2 },
        { kind: 'muffler', x: 17, y: 12 },
        { kind: 'singer', x: 27, y: 7 },
        { kind: 'warden', variant: 'regular', x: 28, y: 1 },
      ],
    });

  async function alarm() {
    const T = suite('alarm');
    await play(ALARM_LEVEL());
    const a = find('alarm');
    T.check('the level has an Alarm, harmless and still', !!a && a.state === 'idle');
    // (v16.0) the roaming monsters wander at random (Math.random) and now and then one reached the test player
    // standing still in the open before the ripple was sent (about 1 run in 6). Put them back where they started
    // before each long wait, so the test is about the Alarm and never about where they happened to wander.
    const homes = en().filter((e) => e.kind !== 'alarm' && e.kind !== 'warden').map((e) => ({ e, x: e.x, y: e.y }));
    const rehome = () => {
      for (const h of homes) {
        h.e.x = h.x;
        h.e.y = h.y;
        h.e.path = null;
        h.e.pi = 0;
      }
    };
    // touching it
    E().tp(a.x, a.y);
    step(1.5);
    T.check('standing ON it: not caught, no scream', E().info().state === 'play' && screams().length === 0, { state: E().info().state, screams: screams().length });
    // walking past and through it
    E().tp(a.x - 60, a.y);
    key('ArrowRight', true);
    step(0.8);
    key('ArrowRight', false);
    T.check('walking through it: no scream, still playing', E().info().state === 'play' && screams().length === 0 && P().x > a.x);
    // crouching beside it, pressing the ripple key
    E().tp(a.x - 80, a.y);
    key('ShiftLeft', true);
    step(0.1);
    ping();
    step(1.5);
    key('ArrowLeft', true);
    step(0.4);
    key('ArrowLeft', false);
    key('ShiftLeft', false);
    step(0.1);
    const mine = E().ripples().filter((r) => !r.singer && !r.ambient).length; // (the singer's own songs are ripples too - not yours)
    T.check('crouching (and pressing ripple while crouched): no ripple of yours, no scream', screams().length === 0 && mine === 0, { screams: screams().length, mine });
    T.check('the Alarm never moved', Math.abs(find('alarm').x - a.x) < 0.01 && Math.abs(find('alarm').y - a.y) < 0.01);

    // its hum, before it is set off: positional, and a glyph with Visual cues on
    E().setVisualCues(true);
    rehome();
    const hums = spy('alarmHum');
    E().tp(a.x - 200, a.y);
    let sawCue = false;
    for (let i = 0; i < 40; i++) {
      step(0.1);
      if (E().cues().some((c) => c.kind === 'alarm')) sawCue = true;
    }
    hums.restore();
    const g = hums.map((c) => c[1]);
    T.check('it hums - a regular tick, about every 1.15 s', hums.length >= 3 && hums.length <= 5, hums.length);
    T.check('the hum is placed (gain > 0 at 200 px, panned to its side)', g.every((v) => v > 0.05) && hums.every((c) => c[0] > 0), hums.map((c) => [+c[0].toFixed(2), +c[1].toFixed(3)]));
    T.check('...with its own glyph in the Visual cues', sawCue);

    // THE RIPPLE
    T.check('(still playing - nothing has caught you)', E().info().state === 'play', E().info().state);
    rehome();
    E().tp(a.x - 160, a.y);
    step(0.05);
    const at = { x: P().x, y: P().y };
    const before = en().map((e) => ({ kind: e.kind, d: Math.hypot(e.x - at.x, e.y - at.y) }));
    const screamSpy = spy('scream');
    ping();
    let t = 0;
    while (!screams().length && t < 2) {
      step(1 / 60);
      t += 1 / 60;
    }
    screamSpy.restore();
    const s = screams()[0];
    T.check('one of your ripples reaching it: it screams', !!s && s.by === 'alarm' && screamSpy.length === 1, { s, calls: screamSpy.length, crouch: E().crouch(), mine: E().ripples().filter((r) => !r.singer && !r.ambient).map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.R)]), player: [Math.round(P().x), Math.round(P().y)], alarm: [a.x, a.y], state: E().info().state });
    T.note(`wave reached it ${t.toFixed(2)} s after the ping (160 px)`);
    T.check('...from the spot where you were at that moment', !!s && Math.hypot(s.x - at.x, s.y - at.y) < 0.01, s);
    const wanted = ['echo', 'scent', 'stalker', 'muffler', 'singer'];
    const sent = {};
    for (const e of en()) {
      if (e.kind === 'alarm' || e.kind === 'warden') continue;
      const k = e.fromMimic ? 'mimic' : e.kind;
      sent[k] = { state: e.state, end: pathEnd(e), d: Math.round(Math.hypot(e.x - at.x, e.y - at.y)) };
    }
    for (const k of wanted.concat(['mimic'])) {
      const r = sent[k];
      const ok = !!r && (r.state === 'hunt' || r.state === 'summoned') && near(r.end, at, TILE);
      T.check(`${k}: sent to that spot (from ${r ? r.d : '?'} px away)`, ok, r);
    }
    T.check('the mimic lost its disguise (it is an echo monster now)', !!en().find((e) => e.fromMimic && e.kind === 'echo'));
    const w = find('warden');
    T.check('the Level 15 monster ignored it (still hunting you, never summoned)', w.state === 'hunt' && !near(pathEnd(w), at, 1), { state: w.state });
    T.check('the scream sent 6 monsters (everything but the Warden and the Alarm)', !!s && s.sent === 6, s && s.sent);
    T.note(`farthest monster sent: ${Math.max(...before.filter((b) => b.kind !== 'warden' && b.kind !== 'alarm').map((b) => Math.round(b.d)))} px`);

    // the spot is FIXED: move away, and they keep going to where you were
    E().tp(px(2), px(13));
    step(1.5);
    const still = en().filter((e) => e.state === 'hunt' || e.state === 'summoned').filter((e) => e.kind !== 'warden');
    T.check('you moved away: they still go to the old spot, not to you', still.length >= 5 && still.every((e) => near(pathEnd(e), at, TILE) || !e.path), still.map((e) => [e.kind, e.state, pathEnd(e)]));
    // spent
    const ae = find('alarm');
    T.check('it is spent', ae.spent === true);
    const hums2 = spy('alarmHum');
    E().tp(a.x - 160, a.y);
    step(1.6);
    ping();
    step(2);
    hums2.restore();
    T.check('a second ripple reaching it: no second scream', screams().length === 1, screams().length);
    T.check('...and it is silent now (no hum)', hums2.length === 0, hums2.length);
    E().setVisualCues(false);
    // heard only near it - on a level with nothing else in it (a monster parked beside you could catch you)
    await play(field(31, 9, { start: { x: 2, y: 4 }, enemies: [{ kind: 'alarm', x: 3, y: 1 }] }));
    const far = spy('alarmHum');
    E().tp(px(3) + 700, px(1));
    step(2.5);
    far.restore();
    T.check('heard only near it (at 700 px the hum has no loudness at all)', far.length >= 1 && far.every((c) => c[1] === 0), far.map((c) => c[1]));
    return T.done();
  }

  /** A decoy's call and a singer's song are not your ripples: neither sets an Alarm off. */
  async function alarmOthers() {
    const T = suite('alarmOthers');
    // the decoy: picked up, dropped right beside the Alarm, and its call goes out
    await play(field(25, 11, { enemies: [{ kind: 'alarm', x: 12, y: 5 }, { kind: 'echo', x: 20, y: 2 }], objects: [{ kind: 'decoy', x: 4, y: 5 }] }));
    E().tp(px(4), px(5));
    step(0.3);
    E().tp(px(11), px(5));
    step(0.1);
    tap('KeyE');
    step(0.1);
    const d = E().decoys();
    T.check('the decoy was dropped beside the Alarm', d.length === 1, d);
    E().tp(px(3), px(9));
    step(7);
    T.check('its call went out', E().decoys().length === 0 || E().decoys().some((x) => x.phase === 'active' || x.phase === 'done'), E().decoys());
    T.check('...and the Alarm did not scream (a decoy sends no ripple)', screams().length === 0 && find('alarm').spent === false);
    // a singer singing next to it
    await play(field(31, 13, { start: { x: 2, y: 6 }, enemies: [{ kind: 'alarm', x: 24, y: 6 }, { kind: 'singer', x: 26, y: 6 }] }));
    let sung = 0;
    for (let i = 0; i < 160; i++) {
      step(0.1);
      if (E().ripples().some((r) => r.singer)) sung++;
      if (E().info().state !== 'play') break;
    }
    T.check('the singer sang beside it', sung > 0, sung);
    T.check('...and the Alarm did not scream (only YOUR ripples set it off)', screams().length === 0 && find('alarm').spent === false);
    return T.done();
  }

  // ------------------------------------------------------------------------------------------- the Screecho
  const SCREECHO_LEVEL = (difficulty) => field(31, 15, { enemies: [{ kind: 'screecho', x: 20, y: 7 }], difficulty });

  /** Its walking speed, measured over `secs` while it walks a straight line to where it was sent. */
  async function measureSpeed(difficulty) {
    await play(SCREECHO_LEVEL(difficulty));
    const e = find('screecho');
    E().tp(e.x - 220, e.y);
    step(0.05);
    ping();
    for (let i = 0; i < 120 && e.state !== 'hunt'; i++) step(1 / 60);
    for (let i = 0; i < 9; i++) step(1 / 60); // (under way)
    const x0 = e.x;
    const y0 = e.y;
    for (let i = 0; i < 30; i++) step(1 / 60); // exactly 30 frames = 0.5 s (step(0.5) can run a 31st)
    const out = { speed: Math.hypot(e.x - x0, e.y - y0) / 0.5, want: cfg().enemySpeed, state: e.state };
    E().tp(px(2), px(13)); // out of its way: the spot it was sent to is where you WERE
    return out;
  }

  async function screecho() {
    const T = suite('screecho');
    const m = await measureSpeed();
    T.check(`it hunts at the echo monster's speed: ${m.speed.toFixed(1)} px/s measured, cfg.enemySpeed ${m.want.toFixed(1)}`, Math.abs(m.speed - m.want) < m.want * 0.03, m);
    T.check('its first ripple made it scream', screams().length === 1 && screams()[0].by === 'screecho');
    const e = find('screecho');
    T.check(`...and its cooldown started (${e.screamCd.toFixed(2)} s left)`, e.screamCd > SCREECHO_COOLDOWN - 1 && e.screamCd <= SCREECHO_COOLDOWN);
    // it walks to the spot, then listens (the echo monster's search), and your footsteps lock it on
    let t = 0;
    while (e.state === 'hunt' && t < 6) {
      step(0.1);
      t += 0.1;
    }
    T.check('it reached the spot and listens there (search)', e.state === 'search', e.state);
    E().tp(e.x - cfg().footstepRadius * 0.6, e.y);
    key('ArrowUp', true);
    step(0.4);
    key('ArrowUp', false);
    T.check('your footsteps while it listens: it locks on (track)', e.state === 'track', e.state);
    E().tp(e.x, e.y);
    step(0.05);
    T.check('touching it kills you', E().info().state === 'caught', E().info().state);
    T.check('...as an echo monster would ("The echo found you.")', $('caught-text').textContent === 'The echo found you.', $('caught-text').textContent);

    // the cooldown, measured: it is put back where it was every quarter second (test scaffolding), and pinged as
    // often as the ripple's recharge allows - when does the second scream come?
    await play(SCREECHO_LEVEL());
    const s = find('screecho');
    const home = { x: s.x, y: s.y };
    const times = [];
    let last = 0;
    for (let i = 0; i < 4 * 26; i++) {
      s.x = home.x;
      s.y = home.y;
      s.state = 'idle';
      s.path = null;
      E().tp(home.x - 200, home.y);
      ping();
      step(0.25);
      if (screams().length > last) {
        last = screams().length;
        times.push(+screams()[last - 1].at.toFixed(2));
      }
    }
    const gap = times.length >= 2 ? times[1] - times[0] : null;
    T.check(`it screams again only after the cooldown: screams at ${times.join(', ')} s`, gap !== null && gap >= SCREECHO_COOLDOWN && gap < SCREECHO_COOLDOWN + 1.8, times);
    T.note(`cooldown measured: ${gap !== null ? gap.toFixed(2) : '?'} s (SCREECHO_COOLDOWN ${SCREECHO_COOLDOWN}; the rest is the ripple recharge and the wave's travel)`);
    T.check('exactly two screams in 26 s of being pinged every 1.5 s', times.length === 2, times.length);
    return T.done();
  }

  // ------------------------------------------------------------------------------------- tuning and settings
  async function tuning() {
    const T = suite('tuning');
    const slow = await measureSpeed({ rating: 'custom', monsterSpeed: 0.5, rippleRange: 1, hearing: 1 });
    const fast = await measureSpeed({ rating: 'custom', monsterSpeed: 1.5, rippleRange: 1, hearing: 1 });
    const norm = await measureSpeed({ rating: 'custom', monsterSpeed: 1, rippleRange: 1, hearing: 1 });
    T.check(`monster speed x0.5: ${slow.speed.toFixed(1)} px/s (x1: ${norm.speed.toFixed(1)})`, Math.abs(slow.speed - norm.speed * 0.5) < 2, { slow, norm });
    T.check(`monster speed x1.5: ${fast.speed.toFixed(1)} px/s (capped at 169 like every monster)`, Math.abs(fast.speed - Math.min(norm.speed * 1.5, 169)) < 2.5, fast);
    const hard = await measureSpeed({ rating: 'hardcore', monsterSpeed: 1, rippleRange: 1, hearing: 1 });
    T.check(`a Hardcore-rated level: faster (${hard.speed.toFixed(1)} px/s)`, hard.speed > norm.speed);
    // a Hardcore-rated custom level still offers Try again (a custom level is not a run)
    const e = find('screecho');
    E().tp(e.x, e.y);
    step(0.05);
    await sleep(400);
    T.check('caught on a Hardcore-rated level: the Caught screen with Try again (not the title)', E().info().state === 'caught' && !$('btn-retry').classList.contains('hidden'), E().info().state);

    // Calm mode and the screen shake
    for (const calm of [false, true]) {
      await play(ALARM_LEVEL());
      E().setCalm(calm);
      E().setVisualCues(true);
      const a = find('alarm');
      E().tp(a.x - 160, a.y);
      step(0.05);
      const sc = spy('scream');
      ping();
      let peak = 0;
      let sawCue = false;
      for (let i = 0; i < 90; i++) {
        step(1 / 60);
        peak = Math.max(peak, E().shake());
        if (E().cues().some((c) => c.kind === 'alarm')) sawCue = true;
      }
      sc.restore();
      T.check(`calm ${calm ? 'on' : 'off'}: it screamed`, sc.length === 1);
      T.check(`calm ${calm ? 'on' : 'off'}: the screen ${calm ? 'does not shake' : 'shakes'} (peak ${peak.toFixed(1)})`, calm ? peak < 0.01 : peak >= 4.9);
      T.check(`calm ${calm ? 'on' : 'off'}: the audio is ${calm ? 'softened' : 'at full strength'} (audio.calm ${E().audio.calm})`, E().audio.calm === calm);
      T.check(`calm ${calm ? 'on' : 'off'}: the Visual cue is shown (calm never weakens the cues)`, sawCue);
      T.check(`calm ${calm ? 'on' : 'off'}: the caption says what happened`, /shriek/.test(E().captionText ? E().captionText() : $('cue-caption').textContent), E().captionText && E().captionText());
    }
    E().setCalm(false);
    E().setVisualCues(false);
    return T.done();
  }

  // ------------------------------------------------------------------------------------- the warning
  const screen = () => E().settings().editor.screen;
  async function clickEditor() {
    $('btn-editor').click();
    await sleep(380);
  }
  async function toTitle() {
    if (E().info().state !== 'title') E().toTitle();
    await until(() => E().info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(80);
  }
  async function gate() {
    const T = suite('gate');
    await toTitle();
    E().setTouchControls(false);
    const accepted = E().settings().editor.accepted;
    T.check('(this save has not accepted the spoiler warning and has not finished the game)', !accepted && !E().settings().editor.anyModeFinished);
    await clickEditor();
    T.check('first time: the spoiler warning first', screen() === 'gate', screen());
    $('btn-gate-ok').click();
    await sleep(380);
    T.check('...then the unreleased-content warning', screen() === 'unreleased' && E().ui().lit.includes('editor-unreleased'), screen());
    const txt = $('editor-unreleased').textContent;
    T.check('its words: unreleased content, aren\'t in the main game yet, may change or be unfinished', /unreleased content/.test(txt) && /aren't in the main game yet/.test(txt) && /may change or be unfinished/.test(txt));
    T.check('...and they name no monster', !/alarm|screecho/i.test(txt));
    T.check('"I understand" has the keyboard focus (Enter or Space presses it)', document.activeElement === $('btn-unreleased-ok'), document.activeElement && document.activeElement.id);
    T.check('there is no "don\'t show again" anywhere on it', $('editor-unreleased').querySelectorAll('input, label').length === 0);
    $('btn-unreleased-ok').click();
    await sleep(380);
    T.check('I understand: into the editor (My Levels; touch is off)', screen() === 'list', screen());
    key('Escape', true);
    await sleep(380);
    T.check('Esc from My Levels: the title', E().info().state === 'title');
    // again: the spoiler warning is not asked again, this one is
    await clickEditor();
    T.check('second time: straight to the unreleased warning (spoiler already accepted)', screen() === 'unreleased', screen());
    key('Escape', true);
    await sleep(380);
    T.check('Esc is Back: the title', E().info().state === 'title' && screen() === null);
    await clickEditor();
    T.check('third time: it is asked again', screen() === 'unreleased');
    $('btn-unreleased-back').click();
    await sleep(380);
    T.check('Back: the title', E().info().state === 'title');
    // with touch controls on: unreleased, then touch
    E().setTouchControls(true);
    await clickEditor();
    T.check('touch controls on: the unreleased warning first...', screen() === 'unreleased', screen());
    $('btn-unreleased-ok').click();
    await sleep(380);
    T.check('...then the touch warning', screen() === 'touch', screen());
    $('btn-touchgate-ok').click();
    await sleep(380);
    T.check('...then My Levels', screen() === 'list', screen());
    E().setTouchControls(false);
    // moving about inside the editor's screens: never asked
    const seen = new Set();
    const watch = setInterval(() => seen.add(screen()), 20);
    $('lv-tab-bonus').click();
    await sleep(300);
    $('lv-tab-mine').click();
    await sleep(300);
    $('btn-mylevels-code').click();
    await sleep(300);
    key('Escape', true);
    await sleep(300);
    if (screen() !== 'list') {
      // (the code dialog takes Esc first; make sure we are back on the list)
      key('Escape', true);
      await sleep(300);
    }
    $('btn-mylevels-new').click();
    await sleep(500);
    T.check('New level: the editor', screen() === 'editor', screen());
    // a test play and back
    const doc = field(15, 9, { enemies: [{ kind: 'alarm', x: 7, y: 4 }] });
    E().playCustom(doc, 'editor');
    await until(() => E().info().state === 'play', 3000);
    step(0.2);
    E().leaveCustom();
    await until(() => screen() === 'editor' && !E().ui().transitioning, 3000);
    clearInterval(watch);
    T.check('test play and back: straight back to the editor', screen() === 'editor', screen());
    T.check('none of that showed the warning (tabs, Enter code, New level, test play)', !seen.has('unreleased') && !seen.has('gate') && !seen.has('touch'), [...seen]);
    // emptying the list turns it off, and nothing else is needed
    await toTitle();
    const saved = UNRELEASED_CONTENT.splice(0, UNRELEASED_CONTENT.length);
    await clickEditor();
    T.check('with UNRELEASED_CONTENT emptied: no warning at all (straight to My Levels)', screen() === 'list', screen());
    T.check('...and no monster is tagged Unreleased', monsterChoices().every((c) => !c.unreleased));
    UNRELEASED_CONTENT.push(...saved);
    await toTitle();
    await clickEditor();
    T.check('put back: the warning again', screen() === 'unreleased');
    await toTitle();
    return T.done();
  }
  async function gateFinished() {
    const T = suite('gateFinished');
    await toTitle();
    E().setTouchControls(false);
    T.check('(this save has finished the game)', E().settings().editor.anyModeFinished);
    await clickEditor();
    T.check('a finished save: no spoiler warning, the unreleased warning still', screen() === 'unreleased', screen());
    $('btn-unreleased-ok').click();
    await sleep(380);
    T.check('...then My Levels', screen() === 'list');
    await toTitle();
    await clickEditor();
    T.check('and again the next time', screen() === 'unreleased');
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------- share codes
  async function sharing() {
    const T = suite('sharing');
    const doc = ALARM_LEVEL();
    doc.enemies.push({ kind: 'screecho', x: 12, y: 3 });
    doc.title = 'Both of them';
    const enc = await EchoShare.encodeLevel(doc);
    T.check('a level with an Alarm and a Screecho makes a code', enc.ok, enc);
    const dec = await EchoShare.decode(enc.code);
    const back = dec.ok ? dec.levels[0] : null;
    const sig = (d) => d.enemies.map((m) => `${m.kind}${m.variant ? '/' + m.variant : ''}@${m.x},${m.y}`).sort().join(' ');
    T.check('...which decodes to the same monsters', !!back && sig(back) === sig(doc), back ? sig(back) : dec);
    T.check('...and the same walls, start and exit', !!back && back.walls.join('') === doc.walls.join('') && back.start.x === doc.start.x && back.exits[0].x === doc.exits[0].x);
    T.check('...and it can be played', !!back && !!buildCustomLevel(back).level);
    const enc2 = await EchoShare.encodeLevel(doc);
    T.check('codes are deterministic', enc2.code === enc.code);
    // the codes made before this version still decode
    const txt = await (await fetch('/tools/sample-codes.txt?' + Date.now())).text();
    const codes = txt.split(/\s+/).filter((w) => /^ECHO1[LF]/.test(w));
    const oldOk = [];
    for (const c of codes) oldOk.push((await EchoShare.decode(c)).ok);
    T.check(`the ${codes.length} sample codes from v15.3 still decode`, codes.length >= 3 && oldOk.every(Boolean), oldOk);
    T.note(`code with both: ${enc.code.length} characters`);
    const out = T.done();
    out.code = enc.code;
    return out;
  }

  // ------------------------------------------------------------------------------------- the editor
  const MT = {
    cv: () => $('ed-canvas'),
    click(x, y) {
      const p = E().editor.tileToClient(x, y);
      MT.cv().dispatchEvent(new MouseEvent('mousedown', { clientX: p.clientX, clientY: p.clientY, button: 0, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: p.clientX, clientY: p.clientY, bubbles: true }));
    },
  };
  async function editor() {
    const T = suite('editor');
    await toTitle();
    E().setTouchControls(false);
    await clickEditor();
    if (screen() === 'gate') {
      $('btn-gate-ok').click();
      await sleep(380);
    }
    if (screen() === 'unreleased') {
      $('btn-unreleased-ok').click();
      await sleep(380);
    }
    $('btn-mylevels-new').click();
    await sleep(600);
    T.check('the editor is open', screen() === 'editor', screen());
    const btns = [...document.querySelectorAll('#editor .ed-monster')];
    const named = (n) => btns.find((b) => b.querySelector('span') && b.querySelector('span').textContent === n);
    T.check('the monster list has the Alarm and the Screecho (from MONSTER_TYPES)', !!named('Alarm') && !!named('Screecho'));
    T.check('...each tagged "Unreleased"', ['Alarm', 'Screecho'].every((n) => named(n) && named(n).querySelector('.ed-tag') && named(n).querySelector('.ed-tag').textContent === 'Unreleased'));
    T.check('...and no other monster is', btns.filter((b) => b.querySelector('.ed-tag')).length === 2);
    T.check('...each with its picture drawn', ['Alarm', 'Screecho'].every((n) => named(n).querySelector('canvas')));
    // place them with the mouse
    named('Alarm').click();
    await sleep(60);
    MT.click(10, 5);
    named('Screecho').click();
    await sleep(60);
    MT.click(14, 9);
    MT.click(1, 1); // (on the outer wall: refused, as for any monster)
    const doc = E().editor.doc();
    const kinds = doc.enemies.map((m) => `${m.kind}@${m.x},${m.y}`);
    T.check('placed with the mouse: an Alarm and a Screecho', kinds.includes('alarm@10,5') && kinds.includes('screecho@14,9'), kinds);
    T.check('...and not inside a wall', !kinds.some((k) => k.endsWith('@1,1')) || doc.walls[1][1] === '.', kinds);
    // validation: the same rules as every monster
    const onStart = field(15, 9, { enemies: [{ kind: 'alarm', x: 2, y: 4 }] });
    const inWall = field(15, 9, { enemies: [{ kind: 'screecho', x: 0, y: 4 }] });
    const ok = field(15, 9, { enemies: [{ kind: 'alarm', x: 7, y: 2 }, { kind: 'screecho', x: 9, y: 6 }] });
    const v1 = EchoLevelCheck.check(EchoLevelFormat.normalise(onStart).doc);
    const v2 = EchoLevelCheck.check(EchoLevelFormat.normalise(inWall).doc);
    const v3 = EchoLevelCheck.check(EchoLevelFormat.normalise(ok).doc);
    T.check('an Alarm on the start: refused, like any monster', !v1.playable, v1.errors.map((e) => e.text));
    T.check('a Screecho inside a wall: refused, like any monster', !v2.playable, v2.errors.map((e) => e.text));
    T.check('both on the floor: playable', v3.playable, v3.errors.map((e) => e.text));
    T.check('the format reads them as known kinds (not "from a newer version")', !EchoLevelFormat.normalise(ok).foreign);
    // test play from the editor
    E().playCustom(ok, 'editor');
    await until(() => E().info().state === 'play', 3000);
    step(0.2);
    T.check('test play: both are in the level', !!find('alarm') && !!find('screecho'));
    E().leaveCustom();
    await until(() => screen() === 'editor' && !E().ui().transitioning, 3000);
    T.check('...and back to the editor', screen() === 'editor');
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------- never in the campaign
  async function campaign() {
    const T = suite('campaign');
    const bad = [];
    let built = 0;
    for (const mode of ['easy', 'normal', 'hard', 'hardcore']) {
      for (let n = 0; n <= 16; n++) {
        for (const seed of [1, 7, 4242]) {
          const lv = generateLevel(n, seed, mode);
          built++;
          for (const m of lv.enemies || []) if (m.kind === 'alarm' || m.kind === 'screecho') bad.push(`${mode} L${n} s${seed}`);
        }
      }
    }
    T.check(`no Alarm or Screecho in any of ${built} levels 0-16 (4 modes x 3 seeds)`, bad.length === 0, bad);
    const bonus = (window.ECHO_BONUS_LEVELS || (typeof ECHO_BONUS_LEVELS !== 'undefined' ? ECHO_BONUS_LEVELS : [])).flatMap((l) => (l.enemies || []).map((m) => m.kind));
    T.check(`no Alarm or Screecho in the ${typeof ECHO_BONUS_LEVELS !== 'undefined' ? ECHO_BONUS_LEVELS.length : '?'} bonus levels`, bonus.length > 0 && !bonus.includes('alarm') && !bonus.includes('screecho'));
    // play the real levels for a while: nothing of theirs ever turns up
    const seenKinds = new Set();
    for (const n of [0, 3, 8, 10, 11, 12, 13, 15, 16]) {
      E().go(n);
      step(4);
      for (const e of en()) seenKinds.add(e.kind);
      E().toTitle();
    }
    T.check('played levels 0, 3, 8, 10-13, 15, 16: neither kind ever made', !seenKinds.has('alarm') && !seenKinds.has('screecho'), [...seenKinds]);
    T.check('UNRELEASED_CONTENT holds exactly the two', UNRELEASED_CONTENT.join() === 'alarm,screecho');
    return T.done();
  }

  // ------------------------------------------------------------------------------------- writes nothing
  async function noWrites() {
    const T = suite('noWrites');
    const snap = () => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
      return JSON.stringify(o);
    };
    const before = snap();
    const doc = ALARM_LEVEL();
    doc.enemies.push({ kind: 'screecho', x: 9, y: 7 });
    await play(doc);
    const a = find('alarm');
    E().tp(a.x - 160, a.y);
    ping();
    step(1);
    const sc = find('screecho');
    E().tp(sc.x, sc.y);
    step(0.1);
    T.check('screams, then caught', screams().length >= 1 && E().info().state === 'caught', { s: screams().length, st: E().info().state });
    $('btn-retry').click();
    await until(() => E().info().state === 'play', 3000);
    step(0.5);
    E().toTitle();
    await sleep(300);
    T.check('localStorage is exactly as it was (no progress, stats, medals or anything)', snap() === before);
    return T.done();
  }

  // ------------------------------------------------------------------------------------- soak
  async function soak(levels = 20, seconds = 40, seed = 1) {
    const T = suite('soak');
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    const kinds = ['alarm', 'screecho', 'alarm', 'screecho', 'echo', 'scent', 'mimic', 'stalker', 'muffler', 'singer'];
    const errors = [];
    const onErr = (e) => errors.push(String(e.message || e));
    window.addEventListener('error', onErr);
    let frames = 0;
    let totalScreams = 0;
    let caught = 0;
    let played = 0;
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    for (let L = 0; L < levels; L++) {
      const w = 15 + Math.floor(rnd() * 20);
      const h = 9 + Math.floor(rnd() * 12);
      const walls = [];
      for (let i = 0; i < w * h * 0.12; i++) walls.push([1 + Math.floor(rnd() * (w - 2)), 1 + Math.floor(rnd() * (h - 2))]);
      const start = { x: 1, y: 1 };
      const exit = { x: w - 2, y: h - 2 };
      const occupied = new Set([`1,1`, `${w - 2},${h - 2}`]);
      const free = (x, y) => !walls.some(([a, b]) => a === x && b === y) && !occupied.has(`${x},${y}`);
      const enemies = [];
      const n = 2 + Math.floor(rnd() * 7);
      for (let i = 0; i < n; i++) {
        const x = 3 + Math.floor(rnd() * (w - 4));
        const y = 1 + Math.floor(rnd() * (h - 2));
        if (!free(x, y)) continue;
        occupied.add(`${x},${y}`);
        enemies.push({ kind: kinds[Math.floor(rnd() * kinds.length)], x, y });
      }
      const ratings = ['easy', 'normal', 'hard', 'hardcore'];
      const doc = field(w, h, { walls: walls.filter(([x, y]) => free(x, y) || true).filter(([x, y]) => !(x === 1 && y === 1) && !(x === w - 2 && y === h - 2)), start, exit, enemies, difficulty: { rating: ratings[Math.floor(rnd() * 4)], monsterSpeed: 1, rippleRange: 1, hearing: 1 } });
      doc.enemies = doc.enemies.filter((m) => doc.walls[m.y][m.x] === '.');
      if (!buildCustomLevel(doc).level) continue;
      played++;
      try {
        await play(doc);
        E().setCalm(rnd() < 0.3);
        E().setVisualCues(rnd() < 0.5);
        let held = null;
        for (let f = 0; f < seconds * 60; f++) {
          if (f % 20 === 0) {
            if (held) key(held, false);
            held = rnd() < 0.85 ? keys[Math.floor(rnd() * 4)] : null;
            if (held) key(held, true);
            if (rnd() < 0.35) ping();
            if (rnd() < 0.08) key('ShiftLeft', true);
            else key('ShiftLeft', false);
          }
          step(1 / 60);
          frames++;
          if (f % 10 === 0) E().draw();
          if (E().info().state === 'caught') {
            caught++;
            totalScreams += screams().length;
            $('btn-retry').click();
            await until(() => E().info().state === 'play', 2000);
          } else if (E().info().state !== 'play') break;
        }
        if (held) key(held, false);
        key('ShiftLeft', false);
        totalScreams += screams().length;
      } catch (err) {
        errors.push(String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));
      }
      await sleep(0);
    }
    window.removeEventListener('error', onErr);
    E().setCalm(false);
    E().setVisualCues(false);
    if (E().info().state !== 'title') E().toTitle();
    T.check(`${played} random levels, ${frames} frames: no exceptions`, errors.length === 0, errors.slice(0, 5));
    T.note({ played, frames, screams: totalScreams, caught });
    return T.done();
  }

  return { alarm, alarmOthers, screecho, tuning, gate, gateFinished, sharing, editor, campaign, noWrites, soak, field };
})();
