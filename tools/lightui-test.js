/*
 * tools/lightui-test.js (v19.1) - the daylight interface, and First Breath's tile. Load it into a ?debug page and run:
 *
 *   LightUiTest.gate()     with the save the page opened with: the option is NOT there before level 26 is reached (and
 *                          a stored '1' does nothing); once it is, it is there, off by default, and on/off at once
 *   LightUiTest.screens()  (a save past 26) every menu and screen with the light look: the filter on, its accents, and
 *                          the contrast of every piece of text on it, worked out through the filter
 *   LightUiTest.tiles()    at the page's width: "First Breath" inside a tile the same size as the numbered ones, a word
 *                          to a line, nothing overflowing - and a longer name too
 *   LightUiTest.play()     with the light look on: a gaol level and First Breath played, the HUD and what is drawn over
 *                          play exactly as ever
 */
window.LightUiTest = (() => {
  const E = () => window.__echo;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
      note: (x) => out.notes.push(x),
      done: () => out,
    };
  }
  const html = () => document.documentElement;
  const settled = () => until(() => !E().ui().transitioning, 3000);
  async function toTitle() {
    if ($('settings') && !$('settings').classList.contains('hidden')) $('btn-settings-back') && $('btn-settings-back').click();
    if (E().info().state !== 'title') E().toTitle();
    await settled();
    for (const id of ['howto', 'replay', 'archive', 'mylevels']) {
      const el = $(id);
      if (el && !el.classList.contains('hidden')) {
        E().toTitle();
        await settled();
      }
    }
  }
  // the colour maths of the filter (invert, then hue-rotate 180deg), on sRGB 0-255
  const M = [[-0.574, 1.43, 0.144], [0.426, 0.43, 0.144], [0.426, 1.43, -0.856]];
  const filt = (c) => {
    const v = c.map((x) => 255 - x);
    return M.map((r) => Math.max(0, Math.min(255, r[0] * v[0] + r[1] * v[1] + r[2] * v[2])));
  };
  const lum = (c) => {
    const f = (x) => {
      x /= 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const rgba = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  /** The worst text contrast on a screen, as it really looks through the filter. */
  function contrastOf(root) {
    let worst = { r: 99, what: '' };
    let n = 0;
    for (const el of root.querySelectorAll('*')) {
      const own = [...el.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim());
      if (!own || !el.offsetParent || el.closest('.hidden') || el.closest('canvas')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const fg = rgba(cs.color);
      // the background behind it: the nearest one that is mostly opaque, else the panels' own dark
      let bg = [4, 9, 16];
      for (let p = el; p && p !== root.parentElement; p = p.parentElement) {
        const b = rgba(getComputedStyle(p).backgroundColor);
        if (b && b.a >= 0.4) {
          bg = b.c;
          break;
        }
      }
      const seen = fg.c.map((x, i) => x * fg.a + bg[i] * (1 - fg.a));
      const r = ratio(filt(seen), filt(bg));
      n++;
      if (r < worst.r) worst = { r, what: `${el.tagName.toLowerCase()}#${el.id || ''}.${el.className || ''} "${el.textContent.trim().slice(0, 24)}"` };
    }
    return { worst, n };
  }

  async function gate() {
    const T = suite('gate');
    await toTitle();
    const L = E().lightUi();
    T.note(L);
    E().openSettings('title');
    await settled();
    const tabs = [...document.querySelectorAll('#settings [data-tab]')];
    const display = tabs.find((t) => /display/i.test(t.textContent));
    if (display) display.click();
    await sleep(80);
    const row = $('lightui-row');
    if (!L.unlocked) {
      T.check('before the outside is reached: the option is not there at all', row.classList.contains('hidden') && $('lightui-toggle').disabled);
      E().setLightUi(true);
      T.check('...and even a stored "on" does nothing until then', !html().dataset.ui && E().lightUi().on === false);
      E().setLightUi(false);
    } else {
      T.check('once the outside is reached: the option is there', !row.classList.contains('hidden') && !$('lightui-toggle').disabled);
      T.check('...off by default', L.chosen === false && !html().dataset.ui);
      $('lightui-toggle').click();
      T.check('switched on: the light look at once, and remembered', html().dataset.ui === 'light' && localStorage.getItem('echomaze.lightui') === '1');
      $('lightui-toggle').click();
      T.check('switched off again: back at once', !html().dataset.ui && localStorage.getItem('echomaze.lightui') === '0');
    }
    $('btn-settings-back') && $('btn-settings-back').click();
    await toTitle();
    return T.done();
  }

  async function screens() {
    const T = suite('screens');
    await toTitle();
    E().setLightUi(true);
    T.check('the light look is on', html().dataset.ui === 'light');
    const look = async (name, open, id) => {
      await open();
      await settled();
      await sleep(60);
      const el = $(id);
      const on = el && !el.classList.contains('hidden');
      const f = on ? getComputedStyle(el).filter : '';
      const { worst, n } = on ? contrastOf(el) : { worst: { r: 0 }, n: 0 };
      T.check(`${name}: light (${f.slice(0, 32)}), its text readable - worst ${worst.r.toFixed(1)}:1 of ${n} (${worst.what})`, on && /invert/.test(f) && worst.r >= 3, worst);
    };
    const click = (id) => async () => $(id).click();
    await look('the title', async () => {}, 'title');
    await look('How to play', click('btn-howto'), 'howto');
    await toTitle();
    await look('Levels & cutscenes', click('btn-replay'), 'replay');
    await toTitle();
    if (!$('btn-archive').classList.contains('hidden')) {
      await look('Fragments', click('btn-archive'), 'archive');
      await toTitle();
    }
    await look('Settings', async () => E().openSettings('title'), 'settings');
    for (const tab of document.querySelectorAll('#settings [data-tab]')) {
      tab.click();
      await sleep(60);
      const { worst } = contrastOf($('settings'));
      T.check(`Settings, ${tab.textContent.trim()}: readable (worst ${worst.r.toFixed(1)}:1, ${worst.what})`, worst.r >= 3, worst);
    }
    $('btn-settings-back') && $('btn-settings-back').click();
    await toTitle();
    await look("What's new", click('btn-whatsnew'), 'whatsnew');
    if (!$('whatsnew').classList.contains('hidden')) $('wn-ok') ? $('wn-ok').click() : E().whatsNew && E().whatsNew.close && E().whatsNew.close();
    await sleep(300);
    await toTitle();
    await look('My Levels', async () => {
      E().openEditorScreens();
      await settled();
      for (const g of ['editor-gate', 'editor-unreleased', 'editor-touch']) {
        const el = $(g);
        if (el && !el.classList.contains('hidden')) {
          const ok = el.querySelector('.primary');
          if (ok) ok.click();
          await settled();
        }
      }
    }, 'mylevels');
    await toTitle();
    // pause, over a level
    E().go(3);
    await sleep(200);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape' }));
    await look('the pause menu', async () => {}, 'pause');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape' }));
    await toTitle();
    T.check('the end screen keeps its own look (white to dark) - not filtered', getComputedStyle($('ending')).filter === 'none');
    E().setLightUi(false);
    T.check('switched off: every screen dark again', !html().dataset.ui && getComputedStyle($('title')).filter === 'none');
    return T.done();
  }

  async function tiles() {
    const T = suite('tiles');
    await toTitle();
    $('btn-replay').click();
    await settled();
    await sleep(80);
    const size = `${innerWidth}x${innerHeight}`;
    const named = [...document.querySelectorAll('#level-grid button.named')];
    const plain = document.querySelector('#level-grid button:not(.named)');
    T.check(`${size}: First Breath is in the level list`, named.length >= 1 && [...named[0].querySelector('.lvl-name').children].map((l) => l.textContent).join(' ') === 'First Breath', named.map((b) => b.textContent));
    for (const b of named) {
      const nm = b.querySelector('.lvl-name');
      const lines = nm.children.length;
      const fits = nm.scrollWidth <= b.clientWidth - 2 && nm.offsetHeight <= b.clientHeight;
      const same = plain ? Math.abs(b.offsetWidth - plain.offsetWidth) <= 1 && Math.abs(b.offsetHeight - plain.offsetHeight) <= 1 : true;
      T.check(`${size}: "${nm.textContent}" - ${lines} lines, inside its tile (${nm.scrollWidth}x${nm.offsetHeight} in ${b.clientWidth}x${b.clientHeight}), the same size as a numbered tile`, lines >= 1 && lines <= 3 && fits && same, { w: b.offsetWidth, h: b.offsetHeight, pw: plain && plain.offsetWidth, ph: plain && plain.offsetHeight, fs: nm.style.fontSize });
      // a longer name, added later, must fit too
      const keep = nm.innerHTML;
      nm.innerHTML = '<span>Somewhere</span><span>Further</span>';
      E().fitLevelNames && E().fitLevelNames();
      T.check(`${size}: a longer name ("Somewhere Further") fits as well (${nm.style.fontSize})`, nm.scrollWidth <= b.clientWidth - 2 && nm.offsetHeight <= b.clientHeight);
      nm.innerHTML = keep;
      E().fitLevelNames && E().fitLevelNames();
    }
    await toTitle();
    return T.done();
  }

  async function play() {
    const T = suite('play');
    await toTitle();
    E().setLightUi(true);
    for (const n of [3, 15, 26]) {
      E().go(n);
      await sleep(400);
      for (let i = 0; i < 20; i++) E().step(0.1);
      await sleep(150);
      const hud = getComputedStyle($('hud'));
      T.check(`level ${n} with the light look on: the game runs, and the HUD and what is over play are as ever (no filter)`, E().info().state === 'play' && hud.filter === 'none' && getComputedStyle($('banner')).filter === 'none' && getComputedStyle($('cue-caption')).filter === 'none');
      await toTitle();
    }
    E().setLightUi(false);
    return T.done();
  }

  return { gate, screens, tiles, play };
})();
