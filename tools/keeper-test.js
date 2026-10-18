/*
 * tools/keeper-test.js (v16.0) - the keeper scene between level 13's capture and level 14. Load it into a ?debug
 * page and run one suite at a time (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   KeeperTest.handoff()     level 13 played to its capture -> the scene starts in the same black -> level 14's wake
 *   KeeperTest.firstTime()   unskippable: Enter, Space, Esc, a tap (touch on), the Skip button - none of them; the
 *                            Skip button hidden; P pauses (the clock and the sound stand still) and nothing skips it
 *                            while paused; seen only at the very end
 *   KeeperTest.closeMid()    -> { reload: true }: leave the page mid-scene; then KeeperTest.afterReload() checks it is unseen
 *   KeeperTest.seenAfter()   once seen: in the replay screen, plays and skips back there; on the next pass 13 -> 14 it
 *                            plays again and can be skipped
 *   KeeperTest.saves()       Continue and the level list on a save at 13, on 14, on 16 and finished (run on each save)
 *   KeeperTest.settings()    calm mode and the Visual cues' [sound captions]
 *   KeeperTest.noWrites()    the whole thing writes nothing but the seen flag
 *   KeeperTest.soak(n)       capture -> scene (keys mashed, paused, unpaused) -> level 14, n times over the modes
 */
window.KeeperTest = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const key = (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
  };
  const state = () => E().info().state;
  const inKeeper = () => state() === 'cutscene' && E().cutscene.kind === 'keeper';
  const lit = (id) => E().ui().lit.includes(id);
  async function home() {
    E().setCsPaused(false);
    await until(() => !E().ui().transitioning, 4000);
    if (state() !== 'title') E().toTitle();
    await until(() => state() === 'title' && !E().ui().transitioning, 4000);
    await sleep(60);
  }
  /** Level 13, played into the great room and through the capture, to the moment it hands over. */
  async function capture() {
    E().go(13);
    E().tp(820, 380); // (inside the great room: past INSIDE_PX 760, in line with its one gap)
    for (let i = 0; i < 400 && state() === 'play'; i++) E().step(1 / 60);
    for (let i = 0; i < 20 && state() === 'capture'; i++) E().captureStep(0.5);
    await until(() => state() === 'cutscene', 4000);
  }
  /** Run the scene's clock to its end and wait for level 14. */
  async function toEnd() {
    await until(() => !E().ui().transitioning, 3000); // (a screen change still fading ignores everything - the game's own rule)
    E().csTo(E().cutscene.KEEPER_END + 0.2);
    await until(() => state() === 'play' && E().info().levelNum === 14, 5000);
  }

  async function handoff() {
    const T = suite('handoff');
    await home();
    E().setSeen('keeper', false);
    await capture();
    T.check('level 13\'s capture hands over to the keeper scene', inKeeper(), { state: state(), kind: E().cutscene.kind });
    T.check('...which starts in black (nothing lit for its first 2 s)', E().cutscene.keeper && E().cutscene.keeper.lit.warden === 0 && E().ripples().length === 0);
    T.check('...with no level running underneath (state cutscene, the HUD hidden)', $('hud').classList.contains('hidden'));
    T.check('the scene lasts 31.6 s (25-35 asked)', E().cutscene.KEEPER_END >= 25 && E().cutscene.KEEPER_END <= 35, E().cutscene.KEEPER_END);
    await toEnd();
    T.check('at its end: level 14', state() === 'play' && E().info().levelNum === 14, { state: state(), level: E().info().levelNum });
    const ss = E().storyState();
    T.check('...beginning with its own wake-up (the controls taken, the first drop still to come)', ss && ss.phase === 'wake' && E().scriptLock(), ss);
    T.check('the scene is now seen', E().seen().keeper === 1);
    return T.done();
  }

  async function firstTime() {
    const T = suite('firstTime');
    await home();
    E().setSeen('keeper', false);
    E().setTouchControls(true);
    E().intro('keeper');
    E().csTo(3); // (well past the 0.6 s every scene ignores)
    T.check('a first viewing: the Skip button is not shown', $('cs-skip').classList.contains('hidden'));
    T.check('...and the scene says it cannot be skipped', E().cutscene.canSkip === false);
    for (const k of ['Enter', 'Space', 'Escape']) {
      key(k);
      await sleep(60);
      T.check(`${k}: still playing`, inKeeper(), state());
    }
    $('cutscene').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    await sleep(60);
    T.check('a tap (touch controls on): still playing', inKeeper());
    $('cs-skip').click();
    await sleep(60);
    T.check('the (hidden) Skip button pressed by script: still playing', inKeeper());
    E().setTouchControls(false);
    // P pauses
    const t0 = E().cutscene.time;
    key('KeyP');
    await sleep(40);
    T.check('P pauses it', E().csPaused() === true && !$('cs-paused').classList.contains('hidden'));
    await sleep(700); // (real frames run in this browser: a paused scene must not move)
    T.check('...its clock stands still', Math.abs(E().cutscene.time - t0) < 1e-6, { t0, now: E().cutscene.time });
    T.check('...and its sound (the AudioContext is suspended)', !E().audio.ctx || E().audio.ctx.state === 'suspended', E().audio.ctx && E().audio.ctx.state);
    for (const k of ['Enter', 'Space', 'Escape']) key(k);
    $('cutscene').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    await sleep(60);
    T.check('paused: no key or tap skips it', inKeeper());
    key('KeyP');
    await sleep(500);
    T.check('P again: it goes on', E().csPaused() === false && E().cutscene.time > t0 + 0.2 && $('cs-paused').classList.contains('hidden'), E().cutscene.time - t0);
    T.check('it is not seen yet, half way through', !E().seen().keeper);
    await toEnd();
    T.check('played to the end: seen', E().seen().keeper === 1);
    T.check('...and on into level 14', state() === 'play' && E().info().levelNum === 14);
    // and another scene still skips as it always did - and pauses too
    await home();
    E().intro('stalker');
    E().csTo(2);
    key('KeyP');
    await sleep(40);
    key('Enter');
    await sleep(60);
    T.check('another scene, paused: Enter does not skip it either', state() === 'cutscene' && E().cutscene.kind === 'stalker');
    key('KeyP');
    await sleep(40);
    key('Enter');
    await until(() => state() !== 'cutscene', 2000);
    T.check('...and once going again, Enter skips it as always', state() !== 'cutscene');
    await home();
    return T.done();
  }

  /** Part 1 of "closing mid-scene leaves it unseen": start it and stop half way. The caller reloads the page. */
  async function closeMid() {
    const T = suite('closeMid');
    await home();
    E().setSeen('keeper', false);
    E().intro('keeper');
    E().csTo(15);
    T.check('half way through (15 s)', inKeeper() && !E().seen().keeper);
    const out = T.done();
    out.reload = true;
    return out;
  }
  async function afterReload() {
    const T = suite('afterReload');
    T.check('after leaving the page mid-scene, it is still unseen', !E().seen().keeper, E().seen());
    E().intro('keeper');
    T.check('...so it plays from the start, unskippable', inKeeper() && E().cutscene.time < 0.1 && E().cutscene.canSkip === false);
    E().toTitle();
    return T.done();
  }

  async function seenAfter() {
    const T = suite('seenAfter');
    await home();
    E().setSeen('keeper', true);
    E().toTitle(); // (the title redraws its buttons)
    await until(() => state() === 'title' && !E().ui().transitioning, 3000);
    T.check('with only this scene seen, the title offers Levels & cutscenes', !$('btn-replay').classList.contains('hidden'));
    $('btn-replay').click();
    await until(() => lit('replay'), 2000);
    const row = [...document.querySelectorAll('#replay .scene')].find((b) => /Somewhere Deeper/.test(b.textContent));
    T.check('the replay screen lists it as "Somewhere Deeper"', !!row && !row.disabled, row && row.textContent);
    T.check('...a spoiler-free name and line', !!row && !/warden|key|gaol|cell|carr/i.test(row.textContent), row && row.textContent);
    row.click();
    await until(() => inKeeper() && !E().ui().transitioning, 3000);
    T.check('it plays from there', inKeeper());
    E().csTo(2);
    T.check('...and can be skipped (the Skip button shows)', E().cutscene.canSkip && !$('cs-skip').classList.contains('hidden'));
    key('Enter');
    await until(() => lit('replay') && state() === 'title', 3000);
    T.check('Enter skips it, back to the replay screen', lit('replay') && state() === 'title');
    // the next time through 13 -> 14: it plays again, and may be skipped
    await home();
    await capture();
    T.check('a later pass through level 13: it plays again', inKeeper());
    await until(() => !E().ui().transitioning, 3000);
    E().csTo(1.5);
    key('Escape');
    await until(() => state() === 'play' && E().info().levelNum === 14, 3000);
    T.check('...and skipping it goes straight on to level 14', state() === 'play' && E().info().levelNum === 14);
    await home();
    return T.done();
  }

  /** Continue and the level list, on whatever save this page was loaded with. */
  async function saves() {
    const T = suite('saves');
    await home();
    const best = Math.max(...['easy', 'normal', 'hard', 'hardcore'].map((m) => (E().settings().progress || {})[m] || 1));
    const seen = !!E().seen().keeper;
    T.note({ best, seen, mode: E().settings().mode });
    const row = () => [...document.querySelectorAll('#replay .scene')].find((b) => /Somewhere Deeper|\?\?\?/.test(b.textContent) && b === document.querySelectorAll('#replay .scene')[7]);
    // the replay screen
    if (!$('btn-replay').classList.contains('hidden')) {
      $('btn-replay').click();
      await until(() => lit('replay'), 2000);
      const r = document.querySelectorAll('#replay .scene')[7];
      const open = best >= 14 || seen;
      T.check(`replay screen: the scene is ${open ? 'there' : 'locked ("???")'}`, !!r && (open ? !r.disabled && /Somewhere Deeper/.test(r.textContent) : r.disabled && /\?\?\?/.test(r.textContent)), r && r.textContent);
      // the level list: level 14 picked (when it is cleared) plays the scene first if it is unseen
      const lv14 = [...document.querySelectorAll('#replay .lvl')].find((b) => b.firstChild && b.firstChild.textContent === '14');
      if (lv14 && !lv14.disabled) {
        lv14.click();
        await until(() => state() !== 'title', 3000);
        T.check(`level list, level 14: ${seen ? 'straight in' : 'the unseen scene first'}`, seen ? state() === 'play' && E().info().levelNum === 14 : inKeeper(), { state: state(), kind: E().cutscene.kind });
        if (!seen) T.check('...and it cannot be skipped (first viewing)', E().cutscene.canSkip === false);
        await home();
      } else T.note('level 14 is not in the level list on this save (not cleared)');
      const lv15 = [...document.querySelectorAll('#replay .lvl')].find((b) => b.firstChild && b.firstChild.textContent === '15');
      if (!lit('replay')) {
        $('btn-replay').click();
        await until(() => lit('replay'), 2000);
      }
      const l15 = [...document.querySelectorAll('#replay .lvl')].find((b) => b.firstChild && b.firstChild.textContent === '15');
      if (l15 && !l15.disabled) {
        l15.click();
        await until(() => state() !== 'title', 3000);
        T.check('level list, level 15: straight in (the scene belongs before 14)', state() === 'play' && E().info().levelNum === 15, state());
        await home();
      }
      if (lit('replay')) E().toTitle();
    } else T.note('no replay screen on this save');
    // Continue
    await home();
    const cont = $('btn-continue');
    if (!cont.classList.contains('hidden')) {
      const lvl = +((cont.textContent.match(/Level (\d+)/) || [])[1] || 0);
      cont.click();
      await until(() => state() !== 'title', 3000);
      const want = lvl === 14 && !seen ? 'the scene first' : `level ${lvl}`;
      const got = inKeeper() ? 'the scene first' : `level ${E().info().levelNum}`;
      T.check(`Continue (Level ${lvl}): ${want}`, got === want, { got, state: state() });
      if (inKeeper()) {
        T.check('...unskippable, as a first viewing', E().cutscene.canSkip === false);
        await toEnd();
        T.check('...then level 14, and now it is seen', state() === 'play' && E().info().levelNum === 14 && E().seen().keeper === 1);
      }
    } else T.note('no Continue on this save');
    await home();
    return T.done();
  }

  async function settings() {
    const T = suite('settings');
    await home();
    E().setSeen('keeper', true);
    for (const calm of [false, true]) {
      E().setCalm(calm);
      E().setVisualCues(true);
      E().intro('keeper');
      const caps = new Set();
      for (let t = 0.2; t < 31; t += 0.2) {
        E().csTo(t);
        const txt = $('cs-fx').classList.contains('show') ? $('cs-fx').textContent : '';
        if (txt) caps.add(txt);
      }
      T.check(`calm ${calm ? 'on' : 'off'}: it plays through (audio.calm ${E().audio.calm})`, E().audio.calm === calm && inKeeper());
      T.check(`calm ${calm ? 'on' : 'off'}: the Visual cues' [sound captions] (${caps.size})`, caps.size >= 8 && [...caps].every((c) => /^\[.*\]$/.test(c)), [...caps]);
      T.check(`calm ${calm ? 'on' : 'off'}: no other text - no card, no caption, no subtitle`, !$('cs-card').classList.contains('show') && !$('cs-sub').classList.contains('show') && !$('cs-caption').classList.contains('show'));
      E().setVisualCues(false);
      E().intro('keeper');
      E().csTo(10);
      T.check(`calm ${calm ? 'on' : 'off'}, Visual cues off: no captions at all`, !$('cs-fx').classList.contains('show'));
      E().toTitle();
    }
    E().setCalm(false);
    return T.done();
  }

  async function noWrites() {
    const T = suite('noWrites');
    await home();
    const snap = () => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
      return o;
    };
    E().setSeen('keeper', false);
    const before = snap();
    E().intro('keeper');
    await toEnd();
    const after = snap(); // (the moment level 14 begins - before it has been played at all)
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]);
    T.check('the only change to the save: the seen flag', changed.length === 1 && changed[0] === 'echomaze.seen', changed);
    T.check('...which now says keeper: 1, and keeps every other scene', JSON.parse(after['echomaze.seen']).keeper === 1 && Object.keys(JSON.parse(before['echomaze.seen'] || '{}')).every((k) => JSON.parse(after['echomaze.seen'])[k]));
    return T.done();
  }

  async function soak(n = 8, seed = 1) {
    const T = suite('soak');
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    const errors = [];
    const onErr = (e) => errors.push(String(e.message || e));
    window.addEventListener('error', onErr);
    let reached = 0;
    for (let i = 0; i < n; i++) {
      await home();
      E().setMode(['easy', 'normal', 'hard', 'hardcore'][i % 4]);
      E().setCalm(rnd() < 0.4);
      E().setVisualCues(rnd() < 0.5);
      const first = rnd() < 0.5;
      E().setSeen('keeper', !first);
      try {
        await capture();
        let t = 0;
        while (inKeeper() && t < 40) {
          const r = rnd();
          if (r < 0.15) key(['Enter', 'Space', 'Escape'][Math.floor(rnd() * 3)]);
          else if (r < 0.2) key('KeyP');
          else if (r < 0.23) $('cutscene').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
          if (E().csPaused() && rnd() < 0.5) key('KeyP');
          if (!E().csPaused()) E().csTo(E().cutscene.time + 0.5);
          t += 0.5;
          E().draw();
          await sleep(0);
        }
        await until(() => state() === 'play' && E().info().levelNum === 14, 5000);
        if (state() === 'play' && E().info().levelNum === 14) reached++;
        else errors.push(`run ${i}: ended in ${state()} level ${E().info().levelNum} (first ${first})`);
        E().step(3);
      } catch (err) {
        errors.push(String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));
      }
    }
    window.removeEventListener('error', onErr);
    E().setCalm(false);
    E().setVisualCues(false);
    E().setMode('normal');
    await home();
    T.check(`${n} times capture -> scene (keys mashed, paused, unpaused) -> level 14: no exceptions, every one reached 14`, errors.length === 0 && reached === n, errors.slice(0, 4));
    return T.done();
  }

  return { handoff, firstTime, closeMid, afterReload, seenAfter, saves, settings, noWrites, soak };
})();
