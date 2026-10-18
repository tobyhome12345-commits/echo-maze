/*
 * tools/editor-about-test.js (v16.1) - the level editor's monster descriptions. Load it into a ?debug page and run
 * one suite at a time (each is async and returns { suite, pass, fail, failed, notes }):
 *
 *   EditorAboutTest.coverage()   EVERY monster the game has (every MONSTER_TYPES kind, every Warden variant - and so
 *                                any added later) has a description, one to three short sentences, and none names
 *                                the Warden. THIS is the test that stops a monster shipping without one.
 *   EditorAboutTest.canFail()    proves coverage() can fail: takes one description away (in memory), runs it, puts
 *                                it back
 *   EditorAboutTest.numbers()    every number in every description is one of the game's own constants (the two
 *                                Warden speeds as % of yours, SCREECHO_COOLDOWN, the level numbers in the Wardens'
 *                                labels) - nothing typed in that could drift
 *   EditorAboutTest.ui()         every monster: hover, keyboard focus (and what a screen reader is given), picking it,
 *                                a tap; the Unreleased tag; a placed monster's description in the inspector; the
 *                                Level settings tab hides it
 *   EditorAboutTest.layout()     at the page's CURRENT size: the panel is on screen, never over the map, the list, a
 *                                button or the bottom bar, never moves when its text changes, and the page does not
 *                                scroll; the text size and contrast. Run it at several sizes (tools/check.js does)
 *   EditorAboutTest.noLeak()     the descriptions appear nowhere outside the editor (title, How to play, a level)
 *   EditorAboutTest.soak(n)      n random actions (hover, focus, pick, tap, tabs, tools, placing, undo) - the panel
 *                                always shows the right monster, and nothing throws
 */
window.EditorAboutTest = (() => {
  const E = () => window.__echo;
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

  // ------------------------------------------------------------------------------------------ the data
  /** Every monster the game has, straight from the definitions (not from the editor). */
  function everyMonster() {
    const out = [];
    for (const t of MONSTER_TYPES) {
      if (t.variants) {
        const vs = t.variants();
        if (!vs.length) out.push({ id: `${t.kind} (no variants found)`, about: '' });
        for (const v of vs) out.push({ id: `${t.kind}/${v.id}`, label: v.label, about: aboutText(v.about) });
      } else out.push({ id: t.kind, label: t.name, about: aboutText(t.about) });
    }
    return out;
  }
  const sentences = (s) => (s.match(/[.!?](\s|$)/g) || []).length;

  async function coverage() {
    const T = suite('coverage');
    const all = everyMonster();
    T.check(`the game has ${all.length} monsters to describe (every kind and every Warden variant)`, all.length >= 10, all.map((m) => m.id));
    for (const m of all) {
      T.check(`${m.id}: has a description`, typeof m.about === 'string' && m.about.length >= 20, m.about);
      T.check(`${m.id}: short - one to three sentences, at most 220 characters`, m.about.length <= 220 && sentences(m.about) >= 1 && sentences(m.about) <= 3, `${m.about.length} chars, ${sentences(m.about)} sentences`);
      T.check(`${m.id}: never names the Warden (the game never does)`, !/warden/i.test(m.about), m.about);
    }
    // the editor's own list is the same set, with the same words
    const ch = monsterChoices();
    T.check('the editor lists every one of them, with the same words', ch.length === all.length && ch.every((c, i) => c.about === all[i].about), ch.map((c) => c.label));
    return T.done();
  }

  async function canFail() {
    const T = suite('canFail');
    const singer = MONSTER_TYPES.find((t) => t.kind === 'singer');
    const was = singer.about;
    const wasV = EchoWarden.VARIANTS.upgraded.about;
    try {
      singer.about = '';
      let r = await coverage();
      T.check('the Singer without a description: coverage FAILS', r.fail > 0 && JSON.stringify(r.failed).includes('singer: has a description'), r.failed);
      singer.about = was;
      delete EchoWarden.VARIANTS.upgraded.about;
      r = await coverage();
      T.check('the Level 16 monster without one: coverage FAILS', r.fail > 0 && JSON.stringify(r.failed).includes('warden/upgraded: has a description'), r.failed);
    } finally {
      singer.about = was;
      EchoWarden.VARIANTS.upgraded.about = wasV;
    }
    const r = await coverage();
    T.check('put back: coverage passes again', r.fail === 0, r.failed);
    return T.done();
  }

  async function numbers() {
    const T = suite('numbers');
    const pct = (f) => String(Math.round(f * 100));
    const labelNums = Object.keys(EchoWarden.VARIANTS).flatMap((id) => EchoWarden.VARIANTS[id].label.match(/\d+/g) || []);
    const allowed = new Set([pct(WARDEN_SPEED), pct(WARDEN_UPGRADED_SPEED), String(SCREECHO_COOLDOWN), ...labelNums]);
    for (const m of everyMonster()) {
      const nums = m.about.match(/\d+(\.\d+)?/g) || [];
      T.check(`${m.id}: every number in it comes from a constant`, nums.every((n) => allowed.has(n)), { nums, allowed: [...allowed] });
    }
    const about = (id) => everyMonster().find((m) => m.id === id).about;
    T.check(`Level 15 monster: ${pct(WARDEN_SPEED)}% = WARDEN_SPEED ${WARDEN_SPEED}`, about('warden/regular').includes(`(${pct(WARDEN_SPEED)}% of your speed)`), about('warden/regular'));
    T.check(`Level 16 monster: ${pct(WARDEN_UPGRADED_SPEED)}% = WARDEN_UPGRADED_SPEED ${WARDEN_UPGRADED_SPEED}`, about('warden/upgraded').includes(`(${pct(WARDEN_UPGRADED_SPEED)}% of your speed)`), about('warden/upgraded'));
    T.check(`...and the words agree with it: ${WARDEN_SPEED < 1 ? 'slower' : 'faster'} / ${WARDEN_UPGRADED_SPEED > 1 ? 'faster' : 'not faster'}`, (WARDEN_SPEED < 1) === /slowly/.test(about('warden/regular')) && (WARDEN_UPGRADED_SPEED > 1) === /faster than you/.test(about('warden/upgraded')));
    T.check(`Screecho: ${SCREECHO_COOLDOWN} seconds = SCREECHO_COOLDOWN`, about('screecho').includes(`${SCREECHO_COOLDOWN} seconds`), about('screecho'));
    T.check('Alarm and Screecho name the Wardens by the labels the editor shows', ['alarm', 'screecho'].every((k) => Object.keys(EchoWarden.VARIANTS).every((id) => about(k).includes(EchoWarden.VARIANTS[id].label.replace(/ monster$/, '')))));
    // the hunt itself uses the same numbers (the variant's speed IS the constant)
    T.check('the hunt runs on the same constants (VARIANTS speed)', EchoWarden.VARIANTS.regular.speed === WARDEN_SPEED && EchoWarden.VARIANTS.upgraded.speed === WARDEN_UPGRADED_SPEED);
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the editor
  const screen = () => E().settings().editor.screen;
  async function toTitle() {
    if (E().info().state !== 'title') E().toTitle();
    await until(() => E().info().state === 'title' && !E().ui().transitioning, 3000);
    await sleep(80);
  }
  /** Open a new, empty level in the editor, through the warnings, as a player would. */
  async function openEditor() {
    await toTitle();
    $('btn-editor').click();
    await sleep(400);
    for (let i = 0; i < 4 && screen() !== 'list'; i++) {
      const s = screen();
      if (s === 'gate') $('btn-gate-ok').click();
      else if (s === 'unreleased') $('btn-unreleased-ok').click();
      else if (s === 'touch' || s === 'editor-touch') $('btn-touchgate-ok').click();
      else break;
      await sleep(400);
    }
    $('btn-mylevels-new').click();
    await sleep(600);
    return screen() === 'editor';
  }
  const buttons = () => [...document.querySelectorAll('#editor .ed-monster')];
  const panel = () => ({ index: $('ed-about').dataset.index, name: $('ed-about-name').textContent, text: $('ed-about-text').textContent, tag: !$('ed-about-tag').classList.contains('hidden'), shown: !$('ed-about').classList.contains('hidden') });
  // (a page that is not the focused window gets no focus/blur EVENTS from focus()/blur() - a real one does - so the
  // test sends them too; the editor's handlers do the same thing twice harmlessly)
  const focusOn = (b) => {
    b.focus();
    b.dispatchEvent(new FocusEvent('focus'));
  };
  const blurOff = (b) => {
    if (!b || !b.blur) return;
    b.blur();
    b.dispatchEvent(new FocusEvent('blur'));
  };
  const pe = (b, type, pointerType) => b.dispatchEvent(new PointerEvent(type, { pointerType, bubbles: type !== 'pointerenter' && type !== 'pointerleave' }));
  const shows = (ch, i) => {
    const p = panel();
    return p.shown && p.index === String(i) && p.name === ch[i].label && p.text === ch[i].about && p.tag === !!ch[i].unreleased;
  };
  const tile = (x, y) => {
    const p = E().editor.tileToClient(x, y);
    const cv = $('ed-canvas');
    cv.dispatchEvent(new MouseEvent('mousedown', { clientX: p.clientX, clientY: p.clientY, button: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: p.clientX, clientY: p.clientY, bubbles: true }));
  };

  async function ui() {
    const T = suite('ui');
    T.check('the editor is open on a new level', await openEditor(), screen());
    const ch = monsterChoices();
    const bs = buttons();
    T.check('one button per monster', bs.length === ch.length, bs.length);
    for (let i = 0; i < ch.length; i++) {
      const b = bs[i];
      const c = ch[i];
      // hover
      pe(b, 'pointerenter', 'mouse');
      T.check(`${c.label}: hover shows it`, shows(ch, i), panel());
      pe(b, 'pointerleave', 'mouse');
      // keyboard focus, and what a screen reader is given
      focusOn(b);
      T.check(`${c.label}: keyboard focus shows it`, document.activeElement === b && shows(ch, i), panel());
      const d = $(b.getAttribute('aria-describedby') || '-');
      T.check(`${c.label}: a screen reader gets the same words (aria-describedby)`, !!d && d.textContent === (c.unreleased ? 'Unreleased. ' : '') + c.about, d && d.textContent);
      T.check(`${c.label}: ...and its name stays just its name`, b.querySelector('span').textContent === c.label);
      blurOff(b);
      // picked (click / Enter / Space all click a button)
      b.click();
      await sleep(20);
      const st = E().editor.state();
      T.check(`${c.label}: picking it shows it, and it stays after the pointer and focus have gone`, st.tool === 'monster' && st.choice && st.choice.label === c.label && b.getAttribute('aria-pressed') === 'true' && shows(ch, i), { choice: st.choice, panel: panel() });
      T.check(`${c.label}: ${c.unreleased ? 'the Unreleased tag is shown' : 'no Unreleased tag'}`, panel().tag === !!c.unreleased);
    }
    // a tap: a touch never "hovers", it picks
    const j = ch.findIndex((c) => c.kind === 'singer');
    pe(bs[0], 'pointerenter', 'touch');
    T.check('a touch passing over a monster does not change the panel', panel().index !== '0' || E().editor.state().choice.label === ch[0].label);
    pe(bs[j], 'pointerdown', 'touch');
    pe(bs[j], 'pointerup', 'touch');
    bs[j].click();
    await sleep(20);
    T.check('a tap on the Singer picks it and shows it', shows(ch, j) && E().editor.state().choice.label === 'Singer', panel());
    // hovering one while another is picked, then leaving: back to the picked one
    pe(bs[2], 'pointerenter', 'mouse');
    const hov = shows(ch, 2);
    pe(bs[2], 'pointerleave', 'mouse');
    T.check('hover another, leave it: back to the picked one', hov && shows(ch, j), panel());
    // a placed monster: its description in the inspector
    let x = 3;
    for (let i = 0; i < ch.length; i++) {
      bs[i].click();
      await sleep(10);
      tile(x, 5);
      await sleep(20);
      const ins = $('ed-inspector');
      const p = ins.querySelector('.ed-about-inline');
      T.check(`${ch[i].label}: placed and picked on the map, the inspector says what it does`, !ins.classList.contains('hidden') && ins.querySelector('h3').textContent === ch[i].label && !!p && p.textContent === (ch[i].unreleased ? 'Unreleased. ' : '') + ch[i].about, p && p.textContent);
      x += 2;
    }
    T.check('...all of them placed', E().editor.doc().enemies.length === ch.length, E().editor.doc().enemies.length);
    // the Level settings tab hides it; Build brings it back
    E().editor.setTab('settings');
    T.check('Level settings tab: the panel is hidden', !panel().shown);
    E().editor.setTab('build');
    T.check('Build tab: the panel is back', panel().shown);
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ the layout
  const rect = (e) => e.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => {
    const a = fg.length > 3 ? fg[3] : 1;
    return [0, 1, 2].map((k) => fg[k] * a + bg[k] * (1 - a));
  };
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  async function layout() {
    const T = suite('layout');
    const size = `${innerWidth}x${innerHeight}${document.body.classList.contains('touch') ? ' touch' : ''}`;
    T.note(size);
    T.check(`${size}: the editor is open`, screen() === 'editor' || (await openEditor()), screen());
    await sleep(200);
    const ch = monsterChoices();
    const bs = buttons();
    const about = $('ed-about');
    const A = rect(about);
    T.check(`${size}: the panel is on screen`, A.height > 40 && A.top >= 0 && A.bottom <= innerHeight + 0.5 && A.left >= 0 && A.right <= innerWidth + 0.5, A);
    T.check(`${size}: never over the map`, !overlap(A, rect($('ed-stage'))), [A, rect($('ed-stage'))]);
    T.check(`${size}: never over the bottom bar (Save, Test play, problems)`, !overlap(A, rect(document.querySelector('#editor .ed-bottom'))));
    T.check(`${size}: never over the top bar (title, size)`, !overlap(A, rect(document.querySelector('#editor .ed-top'))));
    T.check(`${size}: never over the list's own box (it sits below it)`, !overlap(A, rect($('ed-pane-build'))) && !overlap(A, rect(document.querySelector('#editor .ed-tabs'))));
    const doc = document.scrollingElement;
    T.check(`${size}: the page itself does not scroll`, doc.scrollHeight <= innerHeight + 1 && doc.scrollWidth <= innerWidth + 1, [doc.scrollWidth, doc.scrollHeight]);
    // every monster button and every control can be reached in the list, and is never under the panel
    const pane = $('ed-pane-build');
    let hidden = [];
    for (const b of [...bs, ...document.querySelectorAll('#ed-tools button, #ed-undo, #ed-redo, #ed-delete, #ed-clear')]) {
      b.scrollIntoView({ block: 'nearest' });
      const r = rect(b);
      const P = rect(pane);
      if (overlap(r, rect(about)) || r.top < P.top - 0.5 || r.bottom > P.bottom + 0.5) hidden.push(b.textContent.trim());
    }
    T.check(`${size}: every monster and every control can be scrolled to, and none is under the panel`, !hidden.length, hidden);
    pane.scrollTop = 0;
    // it does not move or change size whatever it says
    const boxes = new Set();
    let scrolls = [];
    for (let i = 0; i < ch.length; i++) {
      bs[i].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      const r = rect(about);
      boxes.add(`${r.left},${r.top},${r.width},${r.height}`);
      if (about.scrollHeight > about.clientHeight + 1) scrolls.push(ch[i].label);
      bs[i].dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    }
    T.check(`${size}: it never moves or changes size, whichever monster it shows`, boxes.size === 1, [...boxes]);
    T.note(scrolls.length ? `${size}: these scroll inside the panel (it keeps its place): ${scrolls.join(', ')}` : `${size}: every description fits without scrolling`);
    // text size and contrast
    const cs = getComputedStyle($('ed-about-text'));
    T.check(`${size}: text at least 13 px`, parseFloat(cs.fontSize) >= 13, cs.fontSize);
    const page = parse(getComputedStyle($('editor')).backgroundColor).slice(0, 3);
    const bg = over(parse(getComputedStyle(about).backgroundColor), page.length === 3 ? page : [1, 2, 6]);
    const textC = contrast(parse(cs.color).slice(0, 3), bg);
    const nameC = contrast(parse(getComputedStyle($('ed-about-name')).color).slice(0, 3), bg);
    T.note(`${size}: contrast text ${textC.toFixed(1)}:1, name ${nameC.toFixed(1)}:1, ${cs.fontSize}`);
    T.check(`${size}: contrast - text ${textC.toFixed(1)}:1, name ${nameC.toFixed(1)}:1 (at least 4.5:1)`, textC >= 4.5 && nameC >= 4.5);
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ nowhere else
  async function noLeak() {
    const T = suite('noLeak');
    const texts = everyMonster().map((m) => m.about);
    const outside = () => {
      const copy = document.body.cloneNode(true);
      const ed = copy.querySelector('#editor');
      if (ed) ed.remove();
      return copy.textContent;
    };
    await toTitle();
    T.check('the title screen (and every other screen in the page) holds none of the descriptions', !texts.some((t) => outside().includes(t)));
    T.check('How to play holds none of them', !texts.some((t) => $('howto').textContent.includes(t)));
    T.check('...and no description is even partly there (the first six words of each)', !texts.some((t) => outside().includes(t.split(' ').slice(0, 6).join(' '))));
    E().go(12);
    await sleep(200);
    T.check('playing a level: none of them in the page outside the editor', !texts.some((t) => outside().includes(t)));
    await toTitle();
    return T.done();
  }

  // ------------------------------------------------------------------------------------------ soak
  async function soak(n = 400, seed = 7) {
    const T = suite('soak');
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const errors = [];
    const onErr = (e) => errors.push(String(e.message || e));
    window.addEventListener('error', onErr);
    T.check('the editor is open', await openEditor());
    const ch = monsterChoices();
    let hover = -1;
    let lastFocus = null;
    let bad = 0;
    let firstBad = null;
    for (let k = 0; k < n; k++) {
      const bs = buttons();
      const i = Math.floor(rnd() * bs.length);
      const op = pick(['hover', 'unhover', 'focus', 'blur', 'click', 'tap', 'tab', 'tool', 'place', 'undo', 'redo', 'key']);
      try {
        if (op === 'hover') {
          if (hover >= 0) pe(bs[hover], 'pointerleave', 'mouse');
          pe(bs[i], 'pointerenter', 'mouse');
          hover = i;
        } else if (op === 'unhover' && hover >= 0) {
          pe(bs[hover], 'pointerleave', 'mouse');
          hover = -1;
        } else if (op === 'focus') focusOn(bs[i]);
        else if (op === 'blur') blurOff(document.activeElement);
        else if (op === 'click') bs[i].click();
        else if (op === 'tap') {
          pe(bs[i], 'pointerenter', 'touch');
          bs[i].click();
        } else if (op === 'tab') E().editor.setTab(rnd() < 0.7 ? 'build' : 'settings');
        else if (op === 'tool') pick([...document.querySelectorAll('#ed-tools button')]).click();
        else if (op === 'place') tile(1 + Math.floor(rnd() * 29), 1 + Math.floor(rnd() * 19));
        else if (op === 'undo') $('ed-undo').click();
        else if (op === 'redo') $('ed-redo').click();
        else if (op === 'key') window.dispatchEvent(new KeyboardEvent('keydown', { code: pick(['Delete', 'Escape']), bubbles: true }));
      } catch (e) {
        errors.push(`${op}: ${e.message}`);
      }
      if (rnd() < 0.15) await sleep(0);
      // (a real browser sends blur when an action takes focus away; this hidden page does not - so send it)
      if (lastFocus && lastFocus !== document.activeElement) lastFocus.dispatchEvent(new FocusEvent('blur'));
      lastFocus = buttons().includes(document.activeElement) ? document.activeElement : null;
      // what it should show: the hovered one, else the focused one, else the picked one
      const focused = buttons().indexOf(document.activeElement);
      const st = E().editor.state();
      const chosen = st && st.choice ? ch.findIndex((c) => c.label === st.choice.label) : -1;
      const want = hover >= 0 ? hover : focused >= 0 ? focused : chosen;
      const p = panel();
      const tabOk = p.shown === (st.tab === 'build');
      if (!tabOk || (st.tab === 'build' && want >= 0 && !shows(ch, want))) {
        bad++;
        if (!firstBad) firstBad = { k, op, want, panel: p, tab: st.tab };
      }
    }
    window.removeEventListener('error', onErr);
    T.check(`${n} random actions: the panel always showed the right monster`, bad === 0, { bad, firstBad });
    T.check('...and nothing threw', !errors.length, errors.slice(0, 5));
    await toTitle();
    return T.done();
  }

  return { coverage, canFail, numbers, ui, layout, noLeak, soak, openEditor, everyMonster };
})();
