/*
 * tools/whatsnew-test.js (v16.3) - the What's new screen. Load it into a ?debug page and run one suite at a time
 * (each is async and returns { suite, pass, fail, failed, notes }). Each suite sets up the storage it needs and asks
 * the game to look again "as if the page had just loaded" (__echo.whatsNew.reload), so they can all run in one page:
 *
 *   WhatsNewTest.decisions()  a brand-new player (nothing shown, the version recorded); a returning one (shown once,
 *                             newest first, then never again); several versions skipped (capped to 5, See all
 *                             updates); a save from before the screen existed; a damaged record; storage that throws;
 *                             a silent version never shown
 *   WhatsNewTest.spoilers()   a player at level 3 and one past level 16 see different lines; the generic line once
 *   WhatsNewTest.dialog()     Got it, Esc, Enter, a tap outside; focus kept inside and given back; the corner button
 *                             opens the whole history; the dot
 *   WhatsNewTest.never()      not during play, not over a cutscene, a fade or another screen - but on the title after
 *   WhatsNewTest.layout()     at the page's CURRENT size: on screen, no scroll on a laptop, the corner button over
 *                             nothing on the title
 *   WhatsNewTest.soak(n)      n random opens, closes, keys and taps - nothing throws, never two at once
 */
window.WhatsNewTest = (() => {
  const E = () => window.__echo;
  const W = () => window.__echo.whatsNew;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const P = EchoWhatsNew.KEY.replace(/whatsnew$/, ''); // 'echomaze.' (or the test copy's 'echomaze.test.')
  const CUR = EchoWhatsNew.current();
  const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
  const shownVersions = () => [...document.querySelectorAll('#wn-list .wn-ver')].map((x) => x.textContent);
  const isOpen = () => W().isOpen() && !$('whatsnew').classList.contains('hidden');
  /** Clear this game's keys (leaving everything else), then set these. */
  function setStorage(o) {
    const del = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(P) && !k.startsWith(P + 'test.')) del.push(k);
    }
    for (const k of del) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(o)) localStorage.setItem(P + k, v);
  }
  async function toTitle() {
    if (W().isOpen()) W().close();
    if (E().info().state !== 'title') E().toTitle();
    await until(() => E().info().state === 'title' && !E().ui().transitioning && $('title').classList.contains('in'), 3000);
    await sleep(80);
  }
  /** As if the page had just been opened with this save: look at storage again and let it decide, on the title. */
  async function load(save, storage) {
    await toTitle();
    if (save) setStorage(save);
    const r = W().reload(storage);
    W().maybe();
    await sleep(40);
    return r;
  }
  const progress = (best) => ({ progress: JSON.stringify({ normal: best }), tutorial: '1' });

  // ------------------------------------------------------------------------------------------ decisions
  async function decisions() {
    const T = suite('decisions');
    // a brand-new player
    await load({});
    T.check('a brand-new player: nothing shown', !isOpen());
    T.check(`...and ${CUR} recorded quietly`, localStorage.getItem(EchoWhatsNew.KEY) === CUR, localStorage.getItem(EchoWhatsNew.KEY));
    W().reload();
    W().maybe();
    T.check('...and the next time too: nothing', !isOpen());
    // a returning player, one version behind
    const prev = EchoWhatsNew.NOTES.find((n) => !n.silent && n.version !== CUR);
    const prevIdx = EchoWhatsNew.NOTES.indexOf(prev);
    const older = EchoWhatsNew.NOTES[prevIdx + 1].version;
    await load(Object.assign(progress(5), { whatsnew: older }));
    const want = EchoWhatsNew.NOTES.slice(0, prevIdx + 1).filter((n) => !n.silent).map((n) => n.version);
    T.check(`a player who last saw ${older}: shown, newest first (${want.join(', ')})`, isOpen() && JSON.stringify(shownVersions()) === JSON.stringify(want), shownVersions());
    T.check('...with "See all updates"', !$('wn-all').classList.contains('hidden'));
    T.check('...and the dot on the corner button while it is unseen', W().state().dot);
    $('wn-ok').click();
    await sleep(40);
    T.check(`Got it: closed, ${CUR} recorded, the dot gone`, !isOpen() && localStorage.getItem(EchoWhatsNew.KEY) === CUR && !W().state().dot);
    W().reload();
    W().maybe();
    T.check('the next load: not again', !isOpen());
    // several versions skipped: capped
    await load(Object.assign(progress(5), { whatsnew: 'v15.0' }));
    const told = EchoWhatsNew.NOTES.filter((n) => !n.silent && EchoWhatsNew.verKey(n.version) > EchoWhatsNew.verKey('v15.0'));
    T.check(`last saw v15.0 (${told.length} newer): the newest ${EchoWhatsNew.CAP}, newest first`, isOpen() && JSON.stringify(shownVersions()) === JSON.stringify(told.slice(0, EchoWhatsNew.CAP).map((n) => n.version)), shownVersions());
    $('wn-all').click();
    await sleep(40);
    const all = EchoWhatsNew.NOTES.filter((n) => !n.silent).map((n) => n.version);
    T.check(`See all updates: every one told (${all.length}), newest first, in a list that can be scrolled`, JSON.stringify(shownVersions()) === JSON.stringify(all) && $('wn-list').tabIndex === 0 && $('wn-all').classList.contains('hidden'), shownVersions());
    T.check('...silent versions never listed', EchoWhatsNew.NOTES.filter((n) => n.silent).every((n) => !shownVersions().includes(n.version)));
    W().close();
    // a save from before this screen existed (no record at all)
    await load(progress(9));
    T.check(`a save from before What's new (no record): shown once, the newest ${EchoWhatsNew.CAP}`, isOpen() && shownVersions().length === Math.min(EchoWhatsNew.CAP, all.length) && shownVersions()[0] === CUR);
    W().close();
    // a damaged record
    await load(Object.assign(progress(9), { whatsnew: '{not a version' }));
    T.check('a damaged record: shown once', isOpen());
    W().close();
    T.check('...and written afresh', localStorage.getItem(EchoWhatsNew.KEY) === CUR);
    // storage that throws on everything: nothing breaks, nothing nags
    const bad = { get length() { throw new Error('blocked'); }, key() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    let threw = null;
    try {
      await load(null, bad);
    } catch (e) {
      threw = e.message;
    }
    T.check('storage that throws: no error, nothing shown', !threw && !isOpen(), threw);
    // storage that can be read but not written: shown once on this load, then not again on it
    const ro = { _d: { [P + 'progress']: '{"normal":5}', [EchoWhatsNew.KEY]: older }, get length() { return Object.keys(this._d).length; }, key(i) { return Object.keys(this._d)[i]; }, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem() { throw new Error('full'); } };
    await load(null, ro);
    const first = isOpen();
    W().close();
    W().maybe();
    await sleep(30);
    T.check('storage that cannot be written: shown once on this page load, and not again on it', first && !isOpen());
    W().reload(window.localStorage);
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ spoilers
  async function spoilers() {
    const T = suite('spoilers');
    const gated = EchoWhatsNew.NOTES.filter((n) => n.lines.some((l) => l.minLevel));
    T.check(`there are lines held back by level (${gated.map((n) => n.version).join(', ')})`, gated.length > 0);
    const texts = () => [...document.querySelectorAll('#wn-list li')].map((x) => x.textContent);
    const generic = () => [...document.querySelectorAll('#wn-list li.wn-generic')].length;
    // level 3
    await load(Object.assign(progress(3), { whatsnew: 'v15.0' }));
    W().close();
    W().open(); // (the whole history)
    await sleep(30);
    const at3 = texts();
    const hidden = gated.flatMap((n) => n.lines.filter((l) => l.minLevel).map((l) => l.text));
    T.check('at level 3: no held-back line is shown', hidden.every((h) => !at3.some((t) => t.includes(h))));
    T.check(`at level 3: "${EchoWhatsNew.GENERIC}" once for each version with held-back lines (${gated.length})`, generic() === gated.length, generic());
    W().close();
    // past level 16 - the same notes for a player who has reached level 17 (the screen, for a real save of each, is
    // checked by loading the page with that save: WhatsNewTest.spoilersHere)
    const h17 = EchoWhatsNew.history(17).flatMap((e) => e.lines);
    const h3 = EchoWhatsNew.history(3).flatMap((e) => e.lines);
    T.check('past level 16: every line, and no stand-in', hidden.every((h) => h17.some((l) => l.text === h)) && !h17.some((l) => l.generic));
    T.check('the two players get different text', JSON.stringify(h3) !== JSON.stringify(h17));
    // the data itself: what a line about levels 13+ must have
    const story = EchoWhatsNew.NOTES.flatMap((n) => n.lines.map((l) => (typeof l === 'string' ? { text: l } : l))).filter((l) => /\blevels? 1[3-6]\b|scene|fragment|story/i.test(l.text) && !/^This!/.test(l.text) && !/cutscene/.test(l.text));
    T.check('every line naming story content has a minimum level', story.every((l) => l.minLevel), story.filter((l) => !l.minLevel).map((l) => l.text));
    T.check('no line names the Warden', !EchoWhatsNew.NOTES.some((n) => n.lines.some((l) => /warden/i.test(typeof l === 'string' ? l : l.text))));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the dialog
  async function dialog() {
    const T = suite('dialog');
    await load(Object.assign(progress(5), { whatsnew: CUR }));
    T.check('(nothing new: not shown)', !isOpen());
    // the corner button: the whole history
    $('btn-whatsnew').focus();
    $('btn-whatsnew').click();
    await sleep(40);
    T.check('the corner button opens the whole history', isOpen() && shownVersions().length === EchoWhatsNew.NOTES.filter((n) => !n.silent).length);
    T.check('a proper dialog: role, modal, labelled', $('whatsnew').getAttribute('role') === 'dialog' && $('whatsnew').getAttribute('aria-modal') === 'true' && $('wn-head').textContent.includes('new'));
    T.check('focus on Got it', document.activeElement === $('wn-ok'));
    // Tab stays inside
    let inside = true;
    for (let i = 0; i < 7; i++) {
      key('Tab');
      if (!$('whatsnew').contains(document.activeElement)) inside = false;
    }
    T.check('Tab goes round inside it, never out', inside);
    // keys reach nothing else while it is up
    const was = E().info().state;
    key('KeyM');
    key('KeyC');
    T.check('other keys do nothing while it is up (no mute, no calm, still on the title)', E().info().state === was && !E().settings().calm);
    // Esc: closed, focus back where it came from
    key('Escape');
    await sleep(30);
    T.check('Esc closes it, and focus goes back to the corner button', !isOpen() && document.activeElement === $('btn-whatsnew'));
    // Enter (with nothing in the dialog focused)
    $('btn-whatsnew').click();
    await sleep(30);
    document.activeElement.blur();
    key('Enter');
    await sleep(30);
    T.check('Enter closes it (and does not start a game)', !isOpen() && E().info().state === 'title');
    // a tap outside the panel
    $('btn-whatsnew').click();
    await sleep(30);
    const bg = $('whatsnew');
    bg.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    bg.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
    bg.click();
    await sleep(30);
    T.check('a tap outside the panel closes it', !isOpen());
    // a tap inside the panel does not
    $('btn-whatsnew').click();
    await sleep(30);
    document.querySelector('#whatsnew .wn-panel').click();
    T.check('a tap on the panel itself does not', isOpen());
    $('wn-ok').click();
    await sleep(30);
    // Begin is not held up: it works straight after
    T.check('Begin works straight after (not blocked)', !$('btn-start').disabled && $('btn-start').offsetParent !== null);
    // the dot
    setStorage(Object.assign(progress(5), { whatsnew: 'v15.0' }));
    W().reload();
    T.check('the dot shows while there are unseen notes', W().state().dot && $('whatsnew-dot-sr').textContent.length > 0);
    $('btn-whatsnew').click();
    await sleep(30);
    $('wn-ok').click();
    await sleep(30);
    T.check('...and goes once they are seen', !W().state().dot);
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ never elsewhere
  async function never() {
    const T = suite('never');
    E().audio.setMuted(true);
    // in a level
    await toTitle();
    setStorage(Object.assign(progress(5), { whatsnew: 'v15.0' }));
    W().reload();
    E().go(3);
    W().maybe();
    await sleep(30);
    T.check('during play: not shown', !isOpen() && E().info().state === 'play');
    // over a cutscene
    E().intro('scent');
    W().maybe();
    await sleep(30);
    T.check('over a cutscene: not shown', !isOpen() && E().info().state === 'cutscene');
    E().toTitle();
    // over another screen on the title
    await until(() => !E().ui().transitioning);
    E().openHowTo();
    await sleep(400);
    W().maybe();
    T.check('over How to play: not shown', !isOpen());
    E().closeHowTo();
    // ...and once the title is alone again, it comes up by itself (once)
    await until(() => isOpen(), 2500);
    T.check('back on the title, alone: it comes up by itself', isOpen());
    W().close();
    E().toTitle();
    await sleep(900);
    T.check('...and not again on this page load', !isOpen());
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ layout
  const rect = (e) => e.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  async function layout() {
    const T = suite('layout');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    T.note(size);
    await toTitle();
    if (innerWidth <= 640) {
      // a phone held upright: no corner link (it would sit on the card's buttons) - What's new is in Settings
      T.check(`${size}: no corner link on a narrow screen`, $('btn-whatsnew').offsetParent === null);
      E().openSettings('title');
      await sleep(350);
      const b = $('btn-settings-whatsnew');
      T.check(`${size}: ...What's new is in Settings instead`, b.offsetParent !== null);
      b.click();
      await sleep(40);
      T.check(`${size}: ...and opens the history`, isOpen());
      W().close();
      key('Escape');
      await sleep(400);
    }
    // the corner button: on screen, and over nothing on the title
    const c = rect($('btn-whatsnew'));
    if (innerWidth > 640) T.check(`${size}: the corner button is on screen`, c.width > 20 && c.left >= 0 && c.right <= innerWidth + 0.5 && c.top >= 0 && c.bottom <= innerHeight + 0.5, c);
    const under = [...document.querySelectorAll('#title button, #title label, #title kbd, #title p, #title h1')].filter((x) => x.offsetParent !== null && !x.closest('.title-corner') && overlap(rect(x), c));
    if (innerWidth > 640) T.check(`${size}: ...over nothing else on the title`, !under.length, under.map((x) => x.id || x.textContent.trim().slice(0, 30)));
    const pane = document.querySelector('#title .panel');
    T.check(`${size}: the title card does not scroll inside (as before)`, !pane || pane.scrollHeight <= pane.clientHeight + 1 || innerHeight < 600, pane && [pane.scrollHeight, pane.clientHeight]);
    // the popup with the most it ever shows
    setStorage(Object.assign(progress(5), { whatsnew: 'v15.0' }));
    W().reload();
    W().maybe();
    await sleep(60);
    const p = rect(document.querySelector('#whatsnew .wn-panel'));
    T.check(`${size}: the popup is on screen`, isOpen() && p.top >= 0 && p.bottom <= innerHeight + 0.5 && p.left >= 0 && p.right <= innerWidth + 0.5, p);
    const list = $('wn-list');
    const scrolls = list.scrollHeight > list.clientHeight + 1;
    if (innerHeight >= 700 && innerWidth >= 1000) T.check(`${size}: on a laptop it does not scroll (${EchoWhatsNew.CAP} versions)`, !scrolls, [list.scrollHeight, list.clientHeight]);
    else T.note(`${size}: ${scrolls ? 'the list scrolls inside the popup (the buttons stay put)' : 'fits without scrolling'}`);
    T.check(`${size}: Got it is on screen`, rect($('wn-ok')).bottom <= innerHeight + 0.5 && rect($('wn-ok')).height >= 30);
    const fs = parseFloat(getComputedStyle(document.querySelector('#wn-list li')).fontSize);
    T.check(`${size}: text at least 14 px (${fs})`, fs >= 14);
    W().close();
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ soak
  async function soak(n = 400, seed = 5) {
    const T = suite('soak');
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const errors = [];
    const onErr = (e) => errors.push(String(e.message || e));
    window.addEventListener('error', onErr);
    await toTitle();
    let two = 0;
    const versions = EchoWhatsNew.NOTES.map((x) => x.version).concat([null, 'junk']);
    for (let k = 0; k < n; k++) {
      const op = Math.floor(rnd() * 9);
      try {
        if (op === 0) {
          const v = versions[Math.floor(rnd() * versions.length)];
          setStorage(Object.assign(rnd() < 0.8 ? progress(1 + Math.floor(rnd() * 17)) : {}, v ? { whatsnew: v } : {}));
          W().reload();
          W().maybe();
        } else if (op === 1) $('btn-whatsnew').click();
        else if (op === 2) $('wn-ok').click();
        else if (op === 3) $('wn-all').click();
        else if (op === 4) key(['Escape', 'Enter', 'Tab', 'KeyM'][Math.floor(rnd() * 4)]);
        else if (op === 5) $('whatsnew').click();
        else if (op === 6) W().maybe();
        else if (op === 7 && !W().isOpen()) {
          E().setCalm(rnd() < 0.5);
        } else if (op === 8) W().open(rnd() < 0.5 ? null : undefined);
      } catch (e) {
        errors.push(e.message);
      }
      if (document.querySelectorAll('#whatsnew').length !== 1) two++;
      if (rnd() < 0.1) await sleep(0);
    }
    window.removeEventListener('error', onErr);
    W().close();
    E().setCalm(false);
    T.check(`${n} random opens, closes, keys and loads: nothing threw`, !errors.length, errors.slice(0, 5));
    T.check('never two at once', two === 0);
    await toTitle();
    return T.done();
  }

  /** The popup as it came up for the save this page was opened with: what it says, for the runner to compare. */
  async function spoilersHere() {
    const T = suite('spoilersHere');
    await until(() => W().isOpen(), 2500);
    const texts = [...document.querySelectorAll('#wn-list li')].map((x) => x.textContent);
    const hidden = EchoWhatsNew.NOTES.flatMap((n) => n.lines.filter((l) => l.minLevel).map((l) => ({ text: l.text, min: l.minLevel })));
    const reached = W().reached();
    T.check(`reached ${reached}: the popup came up`, W().isOpen());
    for (const h of hidden) T.check(`reached ${reached}: "${h.text.slice(0, 40)}..." (level ${h.min}) ${reached >= h.min ? 'shown' : 'held back'}`, texts.some((t) => t.includes(h.text)) === reached >= h.min);
    T.note({ reached, generic: document.querySelectorAll('#wn-list li.wn-generic').length, texts });
    return T.done();
  }

  return { decisions, spoilers, spoilersHere, dialog, never, layout, soak };
})();
