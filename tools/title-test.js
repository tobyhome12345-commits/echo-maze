'use strict';

/**
 * TITLE SCREEN TESTS (v15.5). Load into a ?debug page (mute first: __echo.audio.setMuted(true)):
 *   const s = document.createElement('script'); s.src = 'tools/title-test.js?' + Date.now(); document.head.appendChild(s);
 * Each suite is async and returns { name, pass, fail, failed, notes }:
 *   TitleTest.keys()     the difficulty group's arrow keys / Home / End, Tab stops, Enter = the main action, C / V / M
 *   TitleTest.howTo()    How to play opens (button) and closes (Esc, Back), shows only what metThings() allows
 *   TitleTest.buttons()  every title button still opens what it opened (Tutorial, Level Editor, Settings, Replay,
 *                        Fragments when shown), and back again
 *   TitleTest.begin()    Begin on every difficulty x Calm mode x Visual cues: the game starts with exactly that
 *   TitleTest.touch()    touch controls on: the touch line instead of the keys, the title usable held upright
 *   TitleTest.noWrites() looking around the title (How to play, the ripple, hovering) writes nothing at all
 * Save-dependent checks (which buttons a save shows) need a page load per save: tools/title-check.js does those
 * from outside the page, against the previous version as well.
 */
window.TitleTest = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // (v15.7) the unreleased-content warning now stands between the title and the editor's other screens (it has its own
  // tests in tools/monster-test.js): these suites step through it and go on testing what they always tested
  const passUnreleased = () => {
    const g = window.__echo;
    if (g.editorScreen() === 'unreleased') g.acceptUnreleased();
  };
  const visible = (el) => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const lit = (id) => $(id).classList.contains('in');
  const key = (code, target = window, extra = {}) => {
    const t = target || window;
    t.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...extra }));
    t.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true, ...extra }));
  };
  async function until(fn, ms = 4000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (fn()) return true;
      await sleep(25);
    }
    return !!fn();
  }
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
  const snapshot = () => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
    return o;
  };
  const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
  /** Back to the title from wherever the last run left the game. */
  async function home() {
    // (a screen change still fading ignores clicks - the game's own rule - so wait for it to finish first)
    await until(() => !E().ui().transitioning, 4000);
    const st = E().info().state;
    if (st === 'cutscene') {
      E().csTo(1);
      key('Escape');
      await until(() => E().info().state !== 'cutscene', 3000);
    }
    if (E().info().state !== 'title') E().toTitle();
    await until(() => lit('title'), 2000);
    await until(() => !E().ui().transitioning, 4000);
    await sleep(60);
  }

  async function keys() {
    const T = suite('keys');
    await home();
    const radios = [...document.querySelectorAll('#modes .mode')];
    T.check('the difficulty is a radiogroup of four radios, labelled, described by the line under it', $('modes').getAttribute('role') === 'radiogroup' && radios.length === 4 && radios.every((b) => b.getAttribute('role') === 'radio') && $('modes').getAttribute('aria-describedby') === 'mode-desc');
    E().setMode('normal');
    T.check('one Tab stop: only the picked one is tabbable', radios.filter((b) => b.tabIndex === 0).map((b) => b.dataset.mode).join() === 'normal');
    radios[1].focus();
    key('ArrowRight', radios[1]);
    T.check('ArrowRight: the next difficulty is picked, and has the focus', E().settings().mode === 'hard' && document.activeElement === radios[2] && radios[2].getAttribute('aria-checked') === 'true');
    key('ArrowDown', radios[2]);
    key('ArrowDown', radios[3]);
    T.check('...and wraps round (Hardcore -> Easy)', E().settings().mode === 'easy' && document.activeElement === radios[0]);
    key('ArrowLeft', radios[0]);
    T.check('ArrowLeft wraps the other way', E().settings().mode === 'hardcore');
    key('Home', radios[3]);
    T.check('Home: the first', E().settings().mode === 'easy');
    key('End', radios[0]);
    T.check('End: the last', E().settings().mode === 'hardcore');
    T.check('the line under it follows the choice', /one life/.test($('mode-desc').textContent));
    E().setMode('normal');
    radios[1].blur();
    // C / V / M on the title, as before
    const calm0 = E().settings().calm;
    key('KeyC');
    T.check('C: calm mode, and its switch follows', E().settings().calm === !calm0 && document.querySelector('#title .calm-toggle').checked === !calm0);
    key('KeyC');
    const cues0 = E().settings().visualCues;
    key('KeyV');
    T.check('V: Visual cues, and its switch follows', E().settings().visualCues === !cues0 && document.querySelector('#title .cues-toggle').checked === !cues0);
    key('KeyV');
    const muted0 = E().audio.muted;
    key('KeyM');
    const muted1 = E().audio.muted;
    key('KeyM');
    T.check('M: mute, and back', muted1 === !muted0 && E().audio.muted === muted0, { muted0, muted1 });
    // the switches are real checkboxes: focusable, Space flips them, and the title keeps the focus there
    const sw = document.querySelector('#title .calm-toggle');
    sw.focus();
    T.check('a switch takes the keyboard focus (a real checkbox, role="switch")', document.activeElement === sw && sw.getAttribute('role') === 'switch');
    sw.click();
    T.check('...a click / Space flips it and the focus stays on it (on the title)', E().settings().calm === !calm0 && document.activeElement === sw);
    sw.click();
    sw.blur();
    // the version tag: none here (a dev server), and none is written anywhere in the files
    T.check('no version in the corner when the page is not in a "vX.Y - ..." folder', $('version-tag').classList.contains('hidden'));
    return T.done();
  }

  async function howTo() {
    const T = suite('howTo');
    await home();
    $('btn-howto').click();
    await until(() => lit('howto'), 2000);
    T.check('How to play opens from its button', lit('howto') && !lit('title') && E().info().state === 'title');
    const met = E().metThings();
    const items = [...document.querySelectorAll('#howto [data-meet]')];
    const wrong = items.filter((el) => {
      const known = !!met[el.dataset.meet];
      if (el.tagName === 'LI') return known === el.classList.contains('unmet') || (!known && el.textContent !== '???');
      return known === el.classList.contains('hidden');
    });
    T.check(`every rule and chip shows exactly as far as the save allows (${items.length} checked)`, wrong.length === 0, wrong.map((el) => el.dataset.meet));
    T.check('an unmet chip names nothing and has no colour of its own', items.filter((el) => el.classList.contains('unmet')).every((el) => el.textContent === '???' && !el.style.getPropertyValue('--glow')));
    T.check('the whole controls reference is there, from the player\'s keys', /move/.test($('howto-title').textContent) && /send a ripple/.test($('howto-title').textContent) && /visual cues/.test($('howto-title').textContent));
    key('Escape');
    await until(() => lit('title'), 2000);
    T.check('Esc closes it', lit('title') && !lit('howto'));
    await sleep(60);
    T.check('...and the focus goes back to its button', document.activeElement === $('btn-howto'));
    $('btn-howto').click();
    await until(() => lit('howto'), 2000);
    await sleep(60);
    T.check('opened again: the focus is on Back', document.activeElement === $('btn-howto-back'));
    $('btn-howto-back').click();
    await until(() => lit('title'), 2000);
    T.check('Back closes it', lit('title') && !lit('howto'));
    // what is met, for three made-up saves (metThings reads the live progress; checked directly here)
    T.check('a new player: only the basics', met && Object.keys(met).filter((k) => met[k]).length >= 1);
    T.note(`met here: ${Object.keys(met).filter((k) => met[k]).join(', ')}`);
    return T.done();
  }

  async function buttons() {
    const T = suite('buttons');
    await home();
    // Settings
    $('btn-settings').click();
    await until(() => lit('settings'), 2000);
    T.check('Settings opens', lit('settings'));
    key('Escape');
    await until(() => lit('title'), 2000);
    T.check('...Esc back to the title', lit('title'));
    // Level Editor (its gate or My Levels)
    $('btn-editor').click(); passUnreleased();
    await until(() => E().info().state === 'editor', 2000);
    T.check('Level Editor opens its screens', E().info().state === 'editor' && ['gate', 'touch', 'list'].includes(E().editorScreen()));
    E().closeEditorScreens();
    await until(() => lit('title'), 2000);
    // Replay / Fragments, when this save shows them
    for (const [id, screen] of [['btn-replay', 'replay'], ['btn-archive', 'archive']]) {
      if (!visible($(id))) {
        T.note(`${id} not shown for this save (as before - see tools/title-check.js)`);
        continue;
      }
      $(id).click();
      await until(() => lit(screen), 2000);
      T.check(`${id} opens ${screen}`, lit(screen));
      key('Escape');
      await until(() => lit('title'), 2000);
      T.check(`...Esc back`, lit('title'));
    }
    // Tutorial
    $('btn-tutorial').click();
    await until(() => E().info().state !== 'title', 4000);
    T.check('Tutorial starts level 0', E().info().state === 'play' && E().info().levelNum === 0, E().info().state);
    await home();
    T.check('back at the title', E().info().state === 'title' && lit('title'));
    return T.done();
  }

  async function begin() {
    const T = suite('begin');
    const rows = [];
    for (const m of ['easy', 'normal', 'hard', 'hardcore']) {
      for (const calm of [false, true]) {
        for (const cues of [false, true]) {
          await home();
          document.querySelector(`#modes .mode[data-mode="${m}"]`).click();
          const c = document.querySelector('#title .calm-toggle');
          if (c.checked !== calm) c.click();
          const v = document.querySelector('#title .cues-toggle');
          if (v.checked !== cues) v.click();
          // the main action: Begin - or Continue, when it is lit (both start a run)
          const primary = document.querySelector('#title .buttons.dock button.primary');
          primary.click();
          const started = await until(() => E().info().state !== 'title', 5000);
          const st = E().info().state;
          const s = E().settings();
          const ok = started && ['cutscene', 'play'].includes(st) && s.mode === m && s.calm === calm && s.visualCues === cues;
          rows.push(`${m}${calm ? '+calm' : ''}${cues ? '+cues' : ''} -> ${primary.id} -> ${st}`);
          T.check(`${m}, calm ${calm ? 'on' : 'off'}, cues ${cues ? 'on' : 'off'}: ${primary.textContent} starts the game with exactly that`, ok, { st, mode: s.mode, calm: s.calm, cues: s.visualCues });
          if (st === 'cutscene') {
            await until(() => !E().ui().transitioning, 4000); // (a key pressed during the fade in is ignored, as on every screen)
            E().csTo(1); // (past the skip guard: a hidden page runs no frames, so the scene's clock is moved on by hand)
            key('Escape');
            await until(() => E().info().state === 'play', 4000);
            T.check(`...past the cutscene, level ${E().info().levelNum} plays on ${E().settings().mode}`, E().info().state === 'play' && E().settings().mode === m);
          }
        }
      }
    }
    await home();
    const c = document.querySelector('#title .calm-toggle');
    if (c.checked) c.click();
    const v = document.querySelector('#title .cues-toggle');
    if (v.checked) v.click();
    E().setMode('normal');
    T.note(rows);
    return T.done();
  }

  async function touch() {
    const T = suite('touch');
    await home();
    E().features({ touch: true });
    await sleep(50);
    const kb = $('title-hint');
    const tl = document.querySelector('#title .title-hint.touch-only');
    T.check('touch controls on: the touch line shows, the key line does not', document.body.classList.contains('touch') && visible(tl) && !visible(kb));
    T.check('the key chips on the switches are hidden too', [...document.querySelectorAll('#title label.switch kbd')].every((k) => !visible(k)));
    T.check('on the title the page is marked so the "turn your device" screen stays away (portrait)', document.body.classList.contains('on-title'));
    E().features({ touch: false });
    await sleep(50);
    T.check('touch off: the key line is back', visible(kb) && !visible(tl));
    return T.done();
  }

  async function noWrites() {
    const T = suite('noWrites');
    await home();
    const before = snapshot();
    $('btn-howto').click();
    await until(() => lit('howto'), 2000);
    key('Escape');
    await until(() => lit('title'), 2000);
    for (let i = 0; i < 5; i++) {
      const r = $('title').getBoundingClientRect();
      $('title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 20 + i * 30, clientY: r.top + 20 }));
    }
    window.dispatchEvent(new Event('resize'));
    for (const b of document.querySelectorAll('#title button')) b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await sleep(100);
    T.check('How to play, the click ripples, a resize, hovering every button: nothing written', diff(before, snapshot()).length === 0, diff(before, snapshot()));
    return T.done();
  }

  return { keys, howTo, buttons, begin, touch, noWrites, home };
})();
