/*
 * tools/lore-story-test.js (v16.2) - the lore fragments on levels 13-16 and the hidden scene 'kept'. Load it into a
 * ?debug page and run one suite at a time (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   LoreStoryTest.placement()  each one where it was put: reachable from the start, off the way through, before the
 *                              level's point of no return (13: outside the great room; 15: on the start's side of the
 *                              sealed passage, far from the light; 16: before the first gallery), on every seed the
 *                              same tile, the CHANCE table nested by mode (200 seeds), never on Hardcore
 *   LoreStoryTest.discovery()  read by YOUR ripple only: not while crouching, not by a drop of water's ripple, not by
 *                              level 13's involuntary gasp, not by a singer's song (level 12, the same code); and the
 *                              level's own beat is not set off by going to read it (13 still approaching, 15 still
 *                              lit, 16 still sealed)
 *   LoreStoryTest.reading()    the note shows its words; level 14's says it is scratched; level 16's recording types
 *                              out and ends cut off, in static; "N of 16"
 *   LoreStoryTest.archive()    the Fragments screen and the replay screen with 12, 15 and 16 found; the notice when
 *                              the last one is read, and not before; the secret absent until then
 *   LoreStoryTest.scene()      plays from Fragments and from the replay screen and goes back to each; skips (even the
 *                              first time); replays; Calm mode; never plays by itself (Continue, the level list,
 *                              13 -> 14)
 *   LoreStoryTest.saves()      whatever save the page was opened with: it loads, and counts and locks as it should
 *   LoreStoryTest.noWrites()   reading a fragment writes only echomaze.lore; the scene writes only echomaze.seen;
 *                              medals untouched; a custom level has no fragment and finds none
 *   LoreStoryTest.soak(n)      random play on 13-16 in every mode, pinging and crouching, and the scene played and
 *                              skipped at random - counts exceptions
 */
window.LoreStoryTest = (() => {
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
  const STORY = EchoLore.FRAGMENTS.filter((f) => f.level >= 13);
  const ALL = EchoLore.FRAGMENTS.map((f) => f.id);
  async function toTitle() {
    if (E().info().state !== 'title') E().toTitle();
    await until(() => E().info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(60);
  }
  /** Start story level n on Easy (a fragment is always there), past its opening beat, with the controls back. */
  async function enter(n, mode = 'easy') {
    await toTitle();
    E().setMode(mode);
    E().seed(4242);
    E().go(n);
    for (let i = 0; i < 40 && E().scriptLock().locked; i++) step(0.25);
    step(0.5);
    return E().info().level;
  }

  // ------------------------------------------------------------------------------------------ placement
  function bfs(blocked, W, H, from) {
    return bfsDist(blocked, W, H, from);
  }
  async function placement() {
    const T = suite('placement');
    for (const f of STORY) {
      const L = generateLevel(f.level, 1, 'easy');
      const W = L.W;
      const [tx, ty] = f.at;
      const i = ty * W + tx;
      const t = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
      T.check(`${f.id} (level ${f.level}): on a floor tile`, !L.blocked[i] && !L.walls[i]);
      // the way through, with every door opened (so "off the route" means off the whole level's route)
      const open = Uint8Array.from(L.blocked);
      if (L.story && L.story.door) open[t(L.story.door)] = 0;
      const goal = f.level === 13 ? 9 * W + 16 : f.level === 15 ? 11 * W + 28 : t(L.exit);
      const s = t(L.start);
      const dS = bfs(open, W, H(L), s);
      const dE = bfs(open, W, H(L), goal);
      const extra = dS[i] + dE[i] - dS[goal];
      T.check(`${f.id}: reachable from the start (path ${dS[i]} tiles)`, dS[i] > 0, dS[i]);
      T.check(`${f.id}: not on the way through (${extra} tiles out of the way)`, extra >= 4, extra);
      // ...and reachable as the level STARTS: before anything has opened or woken
      const before = bfs(L.blocked, W, H(L), s);
      T.check(`${f.id}: reachable before anything opens (no door, seal or passage needed)`, before[i] > 0, before[i]);
      if (f.level === 13) T.check('s13: outside the great room, below its wall (found before the point of no return)', ty >= 10 && !(tx >= 17 && ty <= 9));
      if (f.level === 15) {
        const light = { x: px(28), y: px(11) };
        T.check(`s15: far from the light (${Math.round(Math.hypot(px(tx) - light.x, px(ty) - light.y))} px; the reveal needs 150)`, Math.hypot(px(tx) - light.x, px(ty) - light.y) > 400);
      }
      if (f.level === 16) T.check('s16: before the first gallery (the release is stepping into it, x >= 14)', tx < 14);
    }
    // the same tile on every seed; the CHANCE table, nested by mode; never on Hardcore
    for (const f of STORY) {
      const n = f.level;
      const count = { easy: 0, normal: 0, hard: 0, hardcore: 0 };
      let nested = true;
      let moved = false;
      for (let seed = 1; seed <= 200; seed++) {
        const has = {};
        for (const m of Object.keys(count)) {
          const p = E().placeFragment(n, seed, m);
          has[m] = !!p;
          if (p) {
            count[m]++;
            if (p.tx !== f.at[0] || p.ty !== f.at[1]) moved = true;
          }
        }
        if ((has.hard && !has.normal) || (has.normal && !has.easy)) nested = false;
      }
      T.note(`level ${n}: present in 200 mazes - easy ${count.easy}, normal ${count.normal}, hard ${count.hard}, hardcore ${count.hardcore}`);
      T.check(`level ${n}: always on Easy, never on Hardcore`, count.easy === 200 && count.hardcore === 0);
      T.check(`level ${n}: Normal ~80% and Hard ~50% (the CHANCE table)`, count.normal > 140 && count.normal < 185 && count.hard > 75 && count.hard < 125, count);
      T.check(`level ${n}: nested (on Hard means on Normal means on Easy)`, nested);
      T.check(`level ${n}: always the same tile`, !moved);
    }
    return T.done();
  }
  const H = (L) => L.H;

  // ------------------------------------------------------------------------------------------ discovery
  async function discovery() {
    const T = suite('discovery');
    E().setLoreFound([]);
    const near = { 13: [17, 13], 14: [13, 4], 15: [9, 16], 16: [2, 2] };
    for (const f of STORY) {
      const n = f.level;
      const L = await enter(n);
      const fr = L.fragment;
      T.check(`level ${n}: its fragment is here on Easy (${f.id})`, !!fr && fr.id === f.id, fr);
      if (!fr) continue;
      const [nx, ny] = near[n];
      E().tp(px(nx), px(ny));
      step(0.1);
      // crouching: no ripple of yours, so nothing read
      key('ShiftLeft', true);
      step(0.05);
      ping();
      step(1.2);
      key('ShiftLeft', false);
      step(0.1);
      T.check(`level ${n}: crouched and pressing ripple - not read`, !fr.read && !EchoLore.isFound(f.id));
      // a drop of water's ripple, right over it: it lights it, and does not read it
      E().castRipple(fr.x + 20, fr.y, 120, { ambient: true });
      step(1.0);
      T.check(`level ${n}: a drop of water's ripple over it - not read`, !fr.read && !EchoLore.isFound(f.id));
      // the level's own beat did not start just from going there
      const st = E().storyState ? E().storyState() : null;
      if (n === 13) T.check('level 13: still approaching (no capture)', E().wardenState().phase === 'approach', E().wardenState().phase);
      if (n === 15) T.check('level 15: the light not revealed', E().hunter() && E().hunter().state === 'dormant', E().hunter() && E().hunter().state);
      if (n === 16) T.check('level 16: the Warden still sealed in', E().hunter() && E().hunter().state === 'dormant', E().hunter() && E().hunter().state);
      // your own ripple
      step(1.0); // (the recharge)
      ping();
      let t = 0;
      while (!fr.read && t < 2) {
        step(1 / 60);
        t += 1 / 60;
      }
      T.check(`level ${n}: your ripple reads it (${t.toFixed(2)} s after the press)`, fr.read && EchoLore.isFound(f.id));
      T.check(`level ${n}: ...and the game goes on (state play)`, E().info().state === 'play');
      if (n === 15) T.check('level 15: still dormant after reading it', E().hunter().state === 'dormant');
      if (n === 16) T.check('level 16: still sealed after reading it', E().hunter().state === 'dormant');
    }
    // level 13's involuntary gasp (walking into the great room) cannot reach it
    E().setLoreFound([]);
    const L13 = await enter(13);
    E().tp(px(18), px(5));
    step(0.05);
    E().tp(px(20), px(5)); // past INSIDE_PX: the room has you
    step(0.05);
    for (let i = 0; i < 40 && E().wardenState().phase !== 'done'; i++) E().captureStep(0.25);
    T.check('level 13: the capture played, and its gasp did not read the fragment', L13.fragment && !L13.fragment.read && !EchoLore.isFound('s13'), E().wardenState().phase);
    // a singer's song (the same code as levels 1-12: level 12, Easy, a maze with a fragment)
    E().setLoreFound([]);
    await toTitle();
    E().setMode('easy');
    let sang = null;
    for (let seed = 1; seed < 30 && !sang; seed++) {
      E().seed(seed);
      E().go(12);
      const L = E().info().level;
      const singer = E().info().enemies.find((e) => e.kind === 'singer');
      if (L.fragment && singer) sang = { L, singer };
    }
    if (sang) {
      const fr = sang.L.fragment;
      E().tp(px(1), px(1));
      E().castRipple(fr.x + 30, fr.y, 160, { singer: sang.singer });
      step(1.0);
      T.check("a singer's song over a fragment (level 12): lit, not read", !fr.read && !EchoLore.isFound(fr.id));
    } else T.note('no level 12 maze with a fragment and a singer found in 30 seeds');
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ reading
  async function reading() {
    const T = suite('reading');
    E().setLoreFound(ALL.slice(0, 12));
    const head = () => $('lore-head').textContent;
    const line = () => $('lore-line').textContent;
    for (const f of STORY) {
      const L = await enter(f.level);
      const statics = [];
      const was = E().audio.loreStatic;
      E().audio.loreStatic = function (...a) {
        statics.push(a);
        return was.apply(this, a);
      };
      E().readFragment();
      const shown = $('lore').classList.contains('show');
      const h = head();
      if (f.kind === 'note') {
        T.check(`${f.id}: the note shows its words at once`, shown && line() === f.text, line());
        T.check(`${f.id}: "${h}"`, h.includes(`of ${EchoLore.TOTAL} found`) && (f.label ? h.startsWith(f.label) : h.startsWith('A note')));
      } else {
        T.check(`${f.id}: the recording starts typing`, shown && line().length < f.text.length && h.startsWith('A recording'));
        let t = 0;
        let full = false;
        while (t < 12 && $('lore').classList.contains('show')) {
          step(0.1);
          t += 0.1;
          if (line() === f.text) full = true;
        }
        T.check(`${f.id}: typed out in full`, full);
        T.check(`${f.id}: and cut off in static (${t.toFixed(1)} s)`, statics.length === 1 && $('lore').classList.contains('cut') && !$('lore').classList.contains('show'), statics.length);
      }
      E().audio.loreStatic = was;
      step(9);
      void L;
    }
    T.check(`all ${EchoLore.TOTAL} found now`, EchoLore.count() === EchoLore.TOTAL);
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the screens
  const replayHasKept = () => [...document.querySelectorAll('#scene-list .scene b')].some((b) => b.textContent === 'Kept');
  async function archive() {
    const T = suite('archive');
    for (const [n, label] of [[12, 'the twelve of levels 1-12'], [15, 'all but level 16']]) {
      E().setLoreFound(ALL.slice(0, n));
      await toTitle();
      E().showArchive();
      await sleep(350);
      const sub = $('archive-sub').textContent;
      T.check(`${label}: "${n} of ${EchoLore.TOTAL} found"`, sub.includes(`${n} of ${EchoLore.TOTAL} found`), sub);
      const rows = [...document.querySelectorAll('#fragment-list .scene')];
      T.check(`${label}: ${EchoLore.TOTAL} fragments listed and the bonus, locked`, rows.length === EchoLore.TOTAL + 1 && rows[rows.length - 1].classList.contains('locked') && rows[rows.length - 1].textContent.includes(`Find all ${EchoLore.TOTAL}`), rows.length);
      T.check(`${label}: the hidden scene is not there at all`, !$('fragment-secret') && !document.querySelector('#fragment-list .secret'));
      $('btn-archive-back') ? $('btn-archive-back').click() : E().toTitle();
      await sleep(350);
      E().toTitle();
      await sleep(200);
      if (!$('btn-replay').classList.contains('hidden')) {
        $('btn-replay').click();
        await sleep(350);
        T.check(`${label}: not in Levels & cutscenes either (not even a ???)`, !replayHasKept() && document.querySelectorAll('#scene-list .scene').length === 9); // (the nine story scenes - v18.0 added the Alarm's)
        await toTitle();
      }
    }
    // the last one: the notice, then it is there
    E().setLoreFound(ALL.filter((id) => id !== 's15'));
    const L = await enter(15);
    T.check('(level 15 has its fragment)', !!L.fragment);
    const toast = $('saved-toast');
    // the 15th find must not say it: try the notice's absence first on a different fragment
    E().setLoreFound(ALL.filter((id) => id !== 's15' && id !== 'f01'));
    toast.classList.remove('show'); // (a notice left over from an earlier suite)
    toast.textContent = '';
    E().readFragment();
    T.check('the fifteenth: no notice', !toast.classList.contains('show') || !/Fragments/.test(toast.textContent), toast.textContent);
    await sleep(100);
    // the sixteenth
    E().setLoreFound(ALL.filter((id) => id !== 's15'));
    const L2 = await enter(15);
    E().readFragment();
    await sleep(60);
    T.check('the sixteenth: "Something has changed in Fragments." in the corner', toast.classList.contains('show') && toast.textContent === 'Something has changed in Fragments.', toast.textContent);
    T.check('...and play goes on (the scene is not played)', E().info().state === 'play' && !(E().cutscene.active && E().cutscene.kind === 'kept'), { state: E().info().state, cs: E().cutscene.active, kind: E().cutscene.kind });
    T.check(`...the line says all ${EchoLore.TOTAL} found`, $('lore-head').textContent.includes(`all ${EchoLore.TOTAL} found`), $('lore-head').textContent);
    void L2;
    await toTitle();
    E().showArchive();
    await sleep(350);
    const rows = [...document.querySelectorAll('#fragment-list .scene')];
    T.check('Fragments: 16 of 16, the bonus line readable, and "Kept" at the end to play', $('archive-sub').textContent.includes(`${EchoLore.TOTAL} of ${EchoLore.TOTAL}`) && !rows[EchoLore.TOTAL].classList.contains('locked') && !!$('fragment-secret') && rows[rows.length - 1] === $('fragment-secret'));
    T.check("Fragments: level 14's row says it is scratched", rows.some((r) => r.textContent.startsWith('Level 14 · scratched into the wall')));
    E().toTitle();
    await sleep(250);
    $('btn-replay').click();
    await sleep(350);
    T.check('Levels & cutscenes: "Kept" is there, playable', replayHasKept());
    await toTitle();
    return T.done();
  }

  async function scene() {
    const T = suite('scene');
    E().setLoreFound(ALL);
    E().setSeen('kept', false);
    // from Fragments, and back to Fragments
    await toTitle();
    E().showArchive();
    await sleep(350);
    $('fragment-secret').click();
    await until(() => E().cutscene.active && E().cutscene.kind === 'kept' && !E().ui().transitioning);
    T.check('Fragments -> Kept: it plays', E().cutscene.active && E().cutscene.kind === 'kept');
    T.check('...skippable the very first time (it is optional)', E().cutscene.canSkip === true && !$('cs-skip').classList.contains('hidden'));
    E().csTo(2);
    key('Enter', true);
    key('Enter', false);
    await until(() => !E().cutscene.active && !E().ui().transitioning);
    T.check('...Enter skips it, back to the Fragments screen', !E().cutscene.active && E().ui().lit && E().ui().lit.includes('archive'), E().ui().lit);
    T.check('...and it counts as seen', !!E().seen().kept);
    // from the replay screen, to the end, and back there
    await toTitle();
    $('btn-replay').click();
    await sleep(350);
    [...document.querySelectorAll('#scene-list .scene')].find((b) => b.textContent.startsWith('Kept')).click();
    await until(() => E().cutscene.active && !E().ui().transitioning);
    E().csTo(E().cutscene.KEPT_END + 0.2);
    await until(() => !E().cutscene.active && !E().ui().transitioning);
    T.check('Levels & cutscenes -> Kept, to its end: back to Levels & cutscenes', E().ui().lit && E().ui().lit.includes('replay'), E().ui().lit);
    // replayable; Calm mode
    await toTitle();
    E().setCalm(true);
    E().showArchive();
    await sleep(350);
    $('fragment-secret').click();
    await until(() => E().cutscene.active && !E().ui().transitioning);
    E().freeze(true);
    E().csTo(20);
    const calmLit = E().cutscene.kept.lit.warden;
    E().setCalm(false);
    E().csTo(20);
    const lit = E().cutscene.kept.lit.warden;
    E().freeze(false);
    T.check(`played again; Calm mode softens it (the light ${calmLit.toFixed(2)} vs ${lit.toFixed(2)}) and plays it all the same`, calmLit < lit && calmLit > 0);
    const k = E().cutscene.kept;
    T.check(`at 20 s: laying them down (${k.laid} of ${k.notes} laid), the limbs out`, k.laid > 8 && k.laid < k.notes && k.notes === EchoLore.TOTAL);
    E().cutscene.skip();
    await until(() => !E().cutscene.active && !E().ui().transitioning);
    // it never plays by itself: Continue, the level list, 13 -> 14
    const started = [];
    const cs = E().cutscene;
    const was = cs.start;
    cs.start = function (k) {
      started.push(k);
      return was.apply(this, arguments);
    };
    await toTitle();
    E().setMode('normal');
    E().go(13);
    E().onCaptured(); // the capture hands on to the keeper scene, as always
    await sleep(100);
    E().toTitle();
    await sleep(300);
    cs.start = was;
    T.check(`never played for you (scenes started: ${started.join(', ') || 'none'})`, !started.includes('kept'));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ saves
  async function saves() {
    const T = suite('saves');
    const raw = localStorage.getItem(EchoLore.KEY);
    const n = EchoLore.count();
    T.note({ stored: raw, count: n, progress: E().settings().progress });
    T.check('the save loaded with no error', !window.__loreErrors || !window.__loreErrors.length);
    T.check(`counts ${n} of ${EchoLore.TOTAL}`, E().settings().lore.found === n && E().settings().lore.total === EchoLore.TOTAL);
    T.check(`the bonus line and the hidden scene: ${n >= EchoLore.TOTAL ? 'open' : 'locked'}`, EchoLore.bonusUnlocked() === (n >= EchoLore.TOTAL) && EchoLore.secretUnlocked() === (n >= EchoLore.TOTAL));
    await toTitle();
    if (n > 0) {
      E().showArchive();
      await sleep(350);
      T.check(`Fragments says "${n} of ${EchoLore.TOTAL} found"`, $('archive-sub').textContent.includes(`${n} of ${EchoLore.TOTAL} found`), $('archive-sub').textContent);
      T.check(`...the hidden scene ${n >= EchoLore.TOTAL ? 'there' : 'not there'}`, !!$('fragment-secret') === n >= EchoLore.TOTAL);
      await toTitle();
    }
    T.check('Levels & cutscenes: Kept only when open', replayAvailableKept() === (n >= EchoLore.TOTAL));
    return T.done();
  }
  const replayAvailableKept = () => {
    // (read the list the replay screen is built from, without opening it)
    E().toTitle();
    const b = $('btn-replay');
    if (b.classList.contains('hidden')) return false;
    b.click();
    const has = replayHasKept();
    E().toTitle();
    return has;
  };

  // ------------------------------------------------------------------------------------------ nothing else
  async function noWrites() {
    const T = suite('noWrites');
    const snap = () => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        o[k] = localStorage.getItem(k);
      }
      return o;
    };
    const diff = (a, b) => [...new Set(Object.keys(a).concat(Object.keys(b)))].filter((k) => a[k] !== b[k]);
    E().setLoreFound(ALL.slice(0, 12));
    const medals = JSON.stringify(E().medals());
    await enter(14);
    const s0 = snap();
    E().readFragment();
    const d1 = diff(s0, snap());
    T.check('reading a fragment writes echomaze.lore and nothing else', d1.length === 1 && d1[0] === EchoLore.KEY, d1);
    await toTitle();
    E().setLoreFound(ALL);
    const s1 = snap();
    E().setSeen('kept', false);
    const s2 = snap();
    E().showArchive();
    await sleep(350);
    $('fragment-secret').click();
    await until(() => E().cutscene.active && !E().ui().transitioning);
    E().cutscene.skip();
    await until(() => !E().cutscene.active && !E().ui().transitioning);
    const d2 = diff(s2, snap());
    T.check('playing the hidden scene writes echomaze.seen and nothing else', d2.length === 1 && d2[0] === 'echomaze.seen' && JSON.parse(localStorage.getItem('echomaze.seen')).kept === 1, d2);
    void s1;
    T.check('medals untouched', JSON.stringify(E().medals()) === medals);
    // the editor: a custom level never has a fragment, and finds none
    await toTitle();
    E().setLoreFound(ALL.slice(0, 3));
    const doc = { format: 'echo-maze-level', schemaVersion: 2, id: 'lore-test', title: 'Lore test', size: { w: 9, h: 7 }, walls: ['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########'], start: { x: 1, y: 3 }, exits: [{ x: 7, y: 3 }], enemies: [], objects: [], effects: [] };
    const err = E().playCustom(doc, 'editor');
    T.check('a custom level plays', !err, err);
    T.check('...with no fragment', !E().info().level.fragment);
    step(0.2);
    ping();
    step(1.5);
    T.check('...and finds none', EchoLore.count() === 3);
    E().leaveCustom();
    await sleep(500);
    E().closeEditorScreens && E().closeEditorScreens();
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ soak
  async function soak(levels = 16, seconds = 30, seed = 3) {
    const T = suite('soak');
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const errors = [];
    const onErr = (e) => errors.push(String(e.message || e));
    window.addEventListener('error', onErr);
    const modes = ['easy', 'normal', 'hard', 'hardcore'];
    const dirs = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    let frames = 0;
    let reads = 0;
    let scenes = 0;
    for (let k = 0; k < levels; k++) {
      E().setLoreFound(rnd() < 0.5 ? [] : ALL.slice(0, Math.floor(rnd() * ALL.length)));
      const before = EchoLore.count();
      await toTitle();
      E().setMode(modes[k % 4]);
      E().seed(1 + Math.floor(rnd() * 1e6));
      E().go(13 + (k % 4));
      const L = E().info().level;
      if (L.fragment && rnd() < 0.7) E().tp(L.fragment.x + 40, L.fragment.y);
      let held = null;
      for (let f = 0; f < seconds * 60 && E().info().state === 'play'; f++) {
        if (f % 30 === 0) {
          if (held) key(held, false);
          held = dirs[Math.floor(rnd() * 4)];
          key(held, true);
        }
        if (rnd() < 0.02) ping();
        if (rnd() < 0.005) key('ShiftLeft', true);
        if (rnd() < 0.01) key('ShiftLeft', false);
        try {
          E().step(1 / 60);
          if (f % 6 === 0) E().draw();
        } catch (e) {
          errors.push(e.message);
        }
        frames++;
      }
      if (held) key(held, false);
      key('ShiftLeft', false);
      if (EchoLore.count() > before) reads++;
      // the hidden scene, now and then: played a little and skipped
      if (rnd() < 0.3) {
        E().setLoreFound(ALL);
        await toTitle();
        E().intro('kept');
        for (let i = 0; i < 60; i++) {
          E().cutscene.update(1 / 20);
          if (i % 4 === 0) E().draw();
        }
        E().cutscene.skip();
        scenes++;
        await until(() => !E().cutscene.active && !E().ui().transitioning);
      }
    }
    window.removeEventListener('error', onErr);
    T.note(`${frames} frames on levels 13-16 over 4 modes, ${reads} levels where a fragment was read, the scene played ${scenes} times`);
    T.check('no exceptions', !errors.length, errors.slice(0, 5));
    await toTitle();
    return T.done();
  }

  return { placement, discovery, reading, archive, scene, saves, noWrites, soak };
})();
