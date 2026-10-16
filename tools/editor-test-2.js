'use strict';

/**
 * EDITOR TESTS, PART 2 (v15.1): the touch warning, several exits, the key and locked exits, floor objects, effect
 * zones, the title card and palette, the per-level difficulty (measured), folders, the v15.0 -> v15.1 migration,
 * hostile new content, "writes nothing" with all of it, and soaks. Load tools/editor-test.js FIRST (this reuses its
 * mouse helpers), then this, into a ?debug page:
 *   for (const f of ['tools/editor-test.js', 'tools/editor-test-2.js']) { const s = document.createElement('script'); s.src = f; document.head.appendChild(s); }
 * Each suite is async and returns { name, pass, fail, failed: [...], notes } - run them one at a time:
 *   EditorTest2.touchGate() .exits() .keys() .objects() .effects() .card() .difficulty() .folders() .migration()
 *   .untrusted() .noWrites() .soak(levels, frames, seed) .editSoak(ops, seed)
 *   EditorTest2.bot(doc, { mode, maxSeconds, pingEvery })  plays a level with the real keys - to the key first if it
 *   needs one, then the nearest way out - and says whether it cleared it.
 * Several suites write levels, folders and flags to localStorage: run them on a test page and clear it after
 * (EditorTest.clearAll()).
 */
window.EditorTest2 = (() => {
  const E = () => window.__echo;
  const T = window.EditorTest.T;
  const ET = window.EditorTest;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const F = () => E().levelFormat;
  const C = () => E().levelCheck;
  const key = (code, down = true, opts = {}) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true, ...opts }));
  const tap = (code) => {
    key(code, true);
    key(code, false);
  };

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

  /** From rows: '#' wall, 'S' start, 'X' exit, 'L' locked exit, 'K' key, 'P' puddle, 'D' decoy, 'N' note; monsters as [kind, x, y, variant]. */
  function levelFrom(rows, monsters = [], title = 'Test level', extra = {}) {
    const doc = ET.levelFrom(rows, monsters, title);
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        const k = { K: 'key', P: 'puddle', D: 'decoy', N: 'note' }[r[x]];
        if (k) doc.objects.push(k === 'note' ? { kind: k, x, y, text: extra.note || 'A note left here.', style: extra.noteStyle || 'note' } : { kind: k, x, y });
      }
    });
    return Object.assign(doc, extra.doc || {});
  }
  const cfgOf = () => E().customState().cfg;
  const toTitle = () => {
    const s = E().info().state;
    if (s === 'play' || s === 'paused' || s === 'caught' || s === 'complete' || s === 'card') E().leaveCustom();
    if (E().info().state === 'editor') E().closeEditorScreens();
    if (E().dialog.isOpen()) T.answer('cancel');
  };
  async function openFresh() {
    toTitle();
    localStorage.setItem('echomaze.editor', '1');
    E().features({ touch: false });
    E().openEditorScreens();
    await sleep(20);
    E().openEditor(null);
    window.dispatchEvent(new Event('resize'));
    await sleep(30);
    E().editor.render();
  }
  function storageSnapshot() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = localStorage.getItem(k);
    }
    return out;
  }
  const diffStorage = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
  /** Stand on a tile and run the game for a moment. */
  function standOn(tx, ty, secs = 0.05) {
    E().tp((tx + 0.5) * 40, (ty + 0.5) * 40);
    E().step(secs);
  }
  /** Walk with the real arrow keys in one direction for a while. */
  function walk(code, secs) {
    key(code, true);
    E().step(secs);
    key(code, false);
  }

  // ------------------------------------------------------------------ the touch warning
  async function touchGate() {
    const S = suite('touchGate');
    const e = E();
    toTitle();
    const keep = { editor: localStorage.getItem('echomaze.editor') };
    localStorage.removeItem('echomaze.editor');
    const finished = e.settings().editor.anyModeFinished;
    e.features({ touch: true });
    S.check('touch controls are on (the game\'s own switch)', e.features().touch === true);
    if (finished) S.note('(this page has a finished mode, so the spoiler warning never shows - part A checks only the touch warning)');
    // A: first use, touch on: the spoiler warning first, then the touch warning
    $('btn-editor').click();
    await sleep(40);
    if (!finished) {
      S.check('first: the spoiler warning', e.editorScreen() === 'gate');
      $('btn-gate-ok').click();
      await sleep(40);
    }
    S.check('then: the touch warning', e.editorScreen() === 'touch' && $('editor-touch').classList.contains('in'));
    const text = $('editor-touch').textContent.replace(/\s+/g, ' ');
    S.check('it says the editor is not suitable for touch, and works best with a mouse and keyboard', /isn't suitable for mobile or touch controls/.test(text) && /mouse and keyboard/.test(text), text);
    S.check('it has I understand and Back', /I understand/.test($('btn-touchgate-ok').textContent) && /Back/.test($('btn-touchgate-back').textContent));
    $('btn-touchgate-ok').click();
    await sleep(40);
    S.check('I understand: on into My Levels', e.editorScreen() === 'list');
    S.check('the spoiler warning is remembered; the touch one is not', localStorage.getItem('echomaze.editor') === '1' && Object.keys(storageSnapshot()).every((k) => !/touchgate|touchwarn/i.test(k)));
    e.closeEditorScreens();
    await sleep(40);
    // B: every time - and Back goes back
    $('btn-editor').click();
    await sleep(40);
    S.check('shown again the next time (every time touch is on)', e.editorScreen() === 'touch');
    $('btn-touchgate-back').click();
    await sleep(40);
    S.check('Back: the title', e.info().state === 'title' && e.editorScreen() === null);
    $('btn-editor').click();
    await sleep(40);
    key('Escape');
    await sleep(40);
    S.check('Esc is Back too', e.info().state === 'title');
    // C: not when coming back from a test play
    $('btn-editor').click();
    await sleep(40);
    $('btn-touchgate-ok').click();
    await sleep(40);
    e.openEditor(levelFrom(['#########', '#S.....X#', '#########']));
    await sleep(30);
    const err = e.playCustom(e.editor.doc(), 'editor');
    S.check('test play from the editor', err === null && e.info().state === 'play');
    e.leaveCustom();
    await sleep(30);
    S.check('back from the test play: straight into the editor, no warning', e.editorScreen() === 'editor' && !$('editor-touch').classList.contains('in'));
    // the editor still works with a finger: a tap places, a drag draws
    T.tool('start');
    const p = e.editor.tileToClient(3, 1);
    const pe = (type, q, id = 7) => $('ed-canvas').dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: q.clientX, clientY: q.clientY, bubbles: true, cancelable: true, isPrimary: true }));
    pe('pointerdown', p);
    pe('pointerup', p);
    S.check('touch: a tap places', JSON.stringify(T.s().start) === '{"x":3,"y":1}');
    T.tool('wall');
    pe('pointerdown', e.editor.tileToClient(2, 1));
    pe('pointermove', e.editor.tileToClient(5, 1));
    pe('pointerup', e.editor.tileToClient(5, 1));
    S.check('touch: a drag draws walls (never over the start)', T.wallAt(2, 1) && !T.wallAt(3, 1) && T.wallAt(4, 1) && T.wallAt(5, 1));
    toTitle();
    // D: touch off - straight to My Levels
    e.features({ touch: false });
    $('btn-editor').click();
    await sleep(40);
    S.check('mouse and keyboard: no touch warning, straight to My Levels', e.editorScreen() === 'list');
    toTitle();
    if (keep.editor === null) localStorage.removeItem('echomaze.editor');
    else localStorage.setItem('echomaze.editor', keep.editor);
    return S.done();
  }

  // ------------------------------------------------------------------ several exits
  async function exits() {
    const S = suite('exits');
    const e = E();
    toTitle();
    const rows = ['###############', '#X...........X#', '#.###.#####.#.#', '#.#.....S...#.#', '#.#.###.###.#.#', '#.......X.....#', '###############'];
    const doc = levelFrom(rows);
    S.check('three exits read', F().normalise(doc).doc.exits.length === 3);
    S.check('playable', C().check(F().normalise(doc).doc).playable);
    for (let i = 0; i < 3; i++) {
      e.playCustom(doc, 'editor');
      const ex = e.customState().exits[i];
      standOn(ex.tx, ex.ty);
      S.check(`reaching exit ${i + 1} completes the level`, e.info().state === 'complete');
      e.leaveCustom();
    }
    // every exit chimes, and a ripple shows every one
    e.playCustom(doc, 'editor');
    const beacon = e.audio.beacon;
    let chimes = 0;
    e.audio.beacon = function () {
      chimes++;
      return beacon.apply(this, arguments);
    };
    e.step(2.5);
    e.audio.beacon = beacon;
    S.check('each exit chimes (3 chimes in one beacon round)', chimes === 3, chimes);
    tap('Space');
    e.step(0.02);
    const rp = e.ripples()[e.ripples().length - 1];
    const exitCircles = rp ? rp.circles.filter((c) => c.type === 4).length : 0;
    const P = e.info().player;
    const inReach = e.customState().exits.filter((x) => Math.hypot(x.x - P.x, x.y - P.y) < rp.R + 16).length;
    S.check('a ripple sees every exit in its reach (and none beyond it)', exitCircles === inReach && inReach >= 2, { exitCircles, inReach, R: rp.R });
    e.leaveCustom();
    // an extra exit that cannot be reached: a warning that names it; the level still plays
    const pocket = levelFrom(['###########', '#S.......X#', '#.........#', '#####.#####', '#X.#......#', '###########']);
    const v = C().check(F().normalise(pocket).doc);
    S.check('an unreachable extra exit: a warning, and it is named', v.playable && v.warnings.some((w) => w.code === 'exit-unreachable' && /^Exit 2 /.test(w.text)), v.warnings.map((w) => w.text));
    const none = levelFrom(['###########', '#S..#....X#', '#...#..X..#', '###########']);
    const v2 = C().check(F().normalise(none).doc);
    S.check('no exit reachable: an error', !v2.playable && v2.errors.some((x) => x.code === 'unreachable' && /None of the exits/.test(x.text)));
    // the editor: up to 8, moved, taken away, locked
    await openFresh();
    T.tool('exit');
    for (let i = 0; i < 8; i++) T.click(3 + i * 2, 3);
    S.check('the Exit tool adds exits: 8 of them', T.s().exits.length === 8);
    T.click(3, 6);
    S.check('a 9th is refused, and says why', T.s().exits.length === 8 && /8 exits at most/.test(T.s().hint), T.s().hint);
    T.drag([[3, 3], [3, 5], [3, 7]]);
    S.check('an exit can be dragged', T.s().exits.some((x) => x.x === 3 && x.y === 7) && !T.s().exits.some((x) => x.x === 3 && x.y === 3));
    T.click(5, 3, 2);
    S.check('right-click takes one away', T.s().exits.length === 7 && !T.s().exits.some((x) => x.x === 5 && x.y === 3));
    T.click(7, 3);
    const box = $('ed-inspector').querySelector('input[type=checkbox]');
    S.check('a picked exit shows Locked in the panel', !!box && !box.checked && /Exit \d/.test($('ed-inspector').textContent));
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    S.check('ticking Locked locks it', T.s().exits.find((x) => x.x === 7 && x.y === 3).locked === true);
    S.check('locked with no key: the level says so', T.s().errors.some((t) => /locked, but there is no key/.test(t)), T.s().errors);
    $('ed-undo').click();
    S.check('undo unlocks it', T.s().exits.find((x) => x.x === 7 && x.y === 3).locked === false);
    e.editor.setChoice('exit', 'locked');
    T.click(20, 9);
    S.check('the Locked exit choice places a locked one', T.s().exits.find((x) => x.x === 20 && x.y === 9).locked === true);
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ the key and locked exits
  async function keys() {
    const S = suite('keys');
    const e = E();
    toTitle();
    const doc = levelFrom(['###########', '#S.......L#', '#.#######.#', '#....K....#', '###########']);
    S.check('a locked exit with a key that can be reached: playable', C().check(F().normalise(doc).doc).playable);
    e.playCustom(doc, 'editor');
    const ex = e.customState().exits[0];
    S.check('it starts locked, and its tile is shut to monsters', ex.locked && e.info().level.blocked[ex.ty * e.info().level.W + ex.tx] === 1);
    const rattle = e.audio.doorRattle;
    let rattles = 0;
    e.audio.doorRattle = function () {
      rattles++;
      return rattle.apply(this, arguments);
    };
    standOn(ex.tx - 1, ex.ty);
    walk('ArrowRight', 3);
    e.audio.doorRattle = rattle;
    S.check('without the key it stays shut: no way through, the level goes on', e.info().state === 'play' && e.customState().exits[0].locked && e.info().player.x < ex.x - 20, e.info().player.x);
    S.check('...and it rattles (once every 1.5 s, not every frame)', rattles >= 2 && rattles <= 3, rattles);
    S.check('...and says it is locked', /Locked/.test($('banner-title').textContent));
    const k = e.customState().key;
    e.tp(k.x, k.y);
    e.step(0.05);
    S.check('walk onto the key: it is taken, and carried', e.customState().key.taken && e.customState().hasKey && /Key/.test($('hud-item').textContent));
    standOn(ex.tx - 1, ex.ty);
    key('ArrowRight', true);
    let t = 0;
    while (e.info().state === 'play' && t < 4) {
      e.step(1 / 60);
      t += 1 / 60;
    }
    key('ArrowRight', false);
    S.check('with the key it opens and the level is complete', e.info().state === 'complete');
    S.check('...after the key has turned (about a second, not at once)', t >= 0.85 && t < 2.5, +t.toFixed(2));
    e.leaveCustom();
    // validation
    const noKey = levelFrom(['###########', '#S.......L#', '###########']);
    S.check('locked and no key: an error that says so', C().check(F().normalise(noKey).doc).errors.some((x) => x.code === 'no-key'));
    const behind = levelFrom(['###########', '#S..L..K..#', '###########']);
    S.check('the key only behind the locked exit: an error', C().check(F().normalise(behind).doc).errors.some((x) => x.code === 'key-unreachable'));
    const inWall = levelFrom(['###########', '#S.......L#', '###########']);
    inWall.objects.push({ kind: 'key', x: 3, y: 0 });
    S.check('a key inside a wall: an error', C().check(F().normalise(inWall).doc).errors.some((x) => x.code === 'object-in-wall'));
    // two locked exits and one open one: any of them, and one key opens both
    const two = levelFrom(['#############', '#L....S....L#', '#.....K.....#', '#####...#####', '#X..........#', '#############']);
    for (const i of [0, 1]) {
      e.playCustom(two, 'editor');
      const k2 = e.customState().key;
      e.tp(k2.x, k2.y);
      e.step(0.05);
      const x2 = e.customState().exits[i];
      standOn(x2.tx + (i === 0 ? 1 : -1), x2.ty);
      key(i === 0 ? 'ArrowLeft' : 'ArrowRight', true);
      e.step(2);
      key(i === 0 ? 'ArrowLeft' : 'ArrowRight', false);
      S.check(`one key opens locked exit ${i + 1}`, e.info().state === 'complete');
      e.leaveCustom();
    }
    // the editor: one key only
    await openFresh();
    T.tool('object');
    e.editor.setChoice('object', 'key');
    T.click(4, 4);
    T.click(6, 4);
    S.check('the editor: a second key is refused, and says why', T.s().objects.filter((o) => o.kind === 'key').length === 1 && /one key at most/.test(T.s().hint), T.s().hint);
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ floor objects
  async function objects() {
    const S = suite('objects');
    const e = E();
    toTitle();
    // the format: limits, and words cleaned
    const many = F().normalise({ size: { w: 31, h: 21 }, objects: [...Array.from({ length: 3 }, (_, i) => ({ kind: 'decoy', x: 1 + i, y: 1 })), ...Array.from({ length: 3 }, (_, i) => ({ kind: 'key', x: 1 + i, y: 2 })), ...Array.from({ length: 12 }, (_, i) => ({ kind: 'note', x: 1 + i, y: 3, text: `note ${i}` })), ...Array.from({ length: 50 }, (_, i) => ({ kind: 'puddle', x: 1 + (i % 25), y: 5 + Math.floor(i / 25) }))] }).doc;
    const count = (k) => many.objects.filter((o) => o.kind === k).length;
    S.check('limits: 1 decoy, 1 key, 8 notes, 40 puddles', count('decoy') === 1 && count('key') === 1 && count('note') === 8 && count('puddle') === 40, [count('decoy'), count('key'), count('note'), count('puddle')]);
    const RLO = String.fromCodePoint(0x202e);
    const ZW = String.fromCodePoint(0x200b);
    const dirty = `<b>Hi</b>${RLO}evil${ZW} zero\u0007bell  \n  end`;
    const clean = F().normalise({ objects: [{ kind: 'note', x: 2, y: 2, text: dirty }] }).doc.objects[0].text;
    S.check('note words: markup brackets, direction overrides, zero-width and control characters stripped', clean === 'bHi/bevil zero bell end' && !/[<>]/.test(clean), clean);
    const long = F().normalise({ objects: [{ kind: 'note', x: 2, y: 2, text: 'y'.repeat(5000) }] }).doc.objects[0].text;
    S.check('note words: 140 characters at most', long.length === 140);
    S.check('a note with nothing (left) on it is left out', F().normalise({ objects: [{ kind: 'note', x: 2, y: 2, text: `${ZW}  <>` }] }).doc.objects.length === 0);
    // the editor: each object, the note's question, the panel
    await openFresh();
    T.tool('object');
    for (const [k, x] of [['puddle', 4], ['decoy', 6], ['key', 8]]) {
      e.editor.setChoice('object', k);
      T.click(x, 4);
    }
    S.check('puddle, decoy and key placed', ['puddle', 'decoy', 'key'].every((k) => T.s().objects.some((o) => o.kind === k)));
    e.editor.setChoice('object', 'decoy');
    T.click(10, 4);
    S.check('a second decoy is refused', T.s().objects.filter((o) => o.kind === 'decoy').length === 1);
    T.click(12, 0);
    S.check('objects go on floor, not walls', T.s().objects.length === 3 && /floor/.test(T.s().hint));
    e.editor.setChoice('object', 'note');
    T.click(12, 4);
    await sleep(30);
    S.check('a note asks for its words first', T.dialogOpen() && /Write a note/.test($('dialog-title').textContent));
    $('dialog-input').value = 'Turn back <now>';
    T.answer('recording');
    await sleep(30);
    const note = T.s().objects.find((o) => o.kind === 'note');
    S.check('placed as a recording, its words cleaned', note && note.style === 'recording' && note.text === 'Turn back now', note);
    T.click(14, 4);
    await sleep(30);
    T.answer('cancel');
    await sleep(30);
    S.check('Cancel places nothing', T.s().objects.filter((o) => o.kind === 'note').length === 1);
    T.click(12, 4); // pick the note
    const ta = $('ed-inspector').querySelector('textarea');
    S.check('a picked note shows its words in the panel', ta && ta.value === 'Turn back now');
    ta.dispatchEvent(new Event('focus'));
    ta.value = 'Changed words';
    ta.dispatchEvent(new Event('input'));
    ta.dispatchEvent(new Event('blur'));
    S.check('its words can be changed there (one undo step)', T.s().objects.find((o) => o.kind === 'note').text === 'Changed words');
    const sel = $('ed-inspector').querySelector('select');
    sel.value = 'note';
    sel.dispatchEvent(new Event('change'));
    S.check('...and recording / note', T.s().objects.find((o) => o.kind === 'note').style === 'note');
    T.drag([[4, 4], [4, 6]]);
    S.check('an object can be dragged', T.s().objects.some((o) => o.kind === 'puddle' && o.y === 6));
    T.click(4, 6, 2);
    S.check('right-click takes it away', !T.s().objects.some((o) => o.kind === 'puddle'));
    toTitle();
    // playing: each one does what it does in the game
    const lore0 = localStorage.getItem('echomaze.lore');
    const found0 = JSON.stringify(EchoLore.found());
    const doc = levelFrom(['###############', '#S.P.D.....N.X#', '###############'], [], 'Objects', { note: 'Someone was here.' });
    e.playCustom(doc, 'editor');
    S.check('the level has its puddle, decoy and note', e.info().level.puddles.length === 1 && !!e.info().level.decoy && e.customState().notes.length === 1);
    standOn(3, 1);
    S.check('a puddle makes you smelly', e.info().player.smell > 0);
    standOn(5, 1);
    S.check('the decoy is picked up', e.info().player.hasDecoy);
    standOn(8, 1);
    tap('Space');
    e.step(1.2);
    const reading = e.lore().reading;
    S.check('a ripple reaching the note reads it', e.customState().notes[0].read && reading && reading.line === 'Someone was here.' && /A note/.test(reading.head), reading);
    S.check('...and nothing is kept: no lore fragment found or saved', localStorage.getItem('echomaze.lore') === lore0 && JSON.stringify(EchoLore.found()) === found0);
    e.leaveCustom();
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ effect zones
  /** The sum of the canvas's pixels over a world rectangle, drawn as the game draws it (camera on the player). */
  function brightness(x0, y0, x1, y1) {
    const e = E();
    e.snapCamera();
    e.draw();
    const cv = $('game');
    const g = cv.getContext('2d');
    const dpr = cv.width / window.innerWidth;
    const s = dpr; // (zoom 1)
    const P = e.info().player;
    const sx = (x) => Math.round(cv.width / 2 + (x - P.x) * s);
    const sy = (y) => Math.round(cv.height / 2 + (y - P.y) * s);
    const X0 = Math.max(0, sx(x0));
    const Y0 = Math.max(0, sy(y0));
    const X1 = Math.min(cv.width, sx(x1));
    const Y1 = Math.min(cv.height, sy(y1));
    if (X1 <= X0 || Y1 <= Y0) return -1;
    const d = g.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  }
  async function effects() {
    const S = suite('effects');
    const e = E();
    toTitle();
    // the editor
    await openFresh();
    T.tool('effect');
    T.drag([[3, 3], [5, 4], [7, 6]]);
    let f = T.s().effects[0];
    S.check('drag out a zone', f && f.x === 3 && f.y === 3 && f.w === 5 && f.h === 4 && f.kind === 'light');
    T.drag([[4, 4], [6, 6], [8, 7]]);
    f = T.s().effects[0];
    S.check('drag it to move it', f.x === 7 && f.y === 6 && f.w === 5 && f.h === 4, f);
    T.drag([[11, 9], [13, 10], [14, 12]]);
    f = T.s().effects[0];
    S.check('drag its corner to resize it', f.x === 7 && f.y === 6 && f.w === 8 && f.h === 7, f);
    const sels = $('ed-inspector').querySelectorAll('select');
    const byLabel = (txt) => [...$('ed-inspector').querySelectorAll('label')].find((l) => l.textContent.startsWith(txt)).querySelector('select');
    S.check('its panel: kind, shape, colour, strength', sels.length === 4);
    byLabel('Colour').value = 'cold';
    byLabel('Colour').dispatchEvent(new Event('change'));
    byLabel('Strength').value = 'bright';
    byLabel('Strength').dispatchEvent(new Event('change'));
    byLabel('Shape').value = 'circle';
    byLabel('Shape').dispatchEvent(new Event('change'));
    f = T.s().effects[0];
    S.check('colour, strength and shape set from the fixed lists', f.colour === 'cold' && f.intensity === 'bright' && f.shape === 'circle');
    byLabel('Kind').value = 'glow';
    byLabel('Kind').dispatchEvent(new Event('change'));
    S.check('changing the kind picks one of its own colours', T.s().effects[0].kind === 'glow' && T.s().effects[0].colour === 'red');
    T.click(9, 8, 2);
    S.check('right-click takes it away', T.s().effects.length === 0);
    for (let i = 0; i < 13; i++) T.drag([[1 + (i % 6) * 4, 1 + Math.floor(i / 6) * 4], [2 + (i % 6) * 4, 2 + Math.floor(i / 6) * 4]]);
    S.check('12 zones at most', T.s().effects.length === 12 && /12 effects at most/.test(T.s().hint), T.s().effects.length);
    toTitle();
    // the game: drawn where you could see it, never through walls, never showing a monster
    const rows = ['###############', '#.....#.......#', '#.S...#.......#', '#.....#.......#', '#.....###.#####', '#.............#', '###############'];
    const doc = levelFrom(rows, [], 'Effects');
    doc.exits = [{ x: 13, y: 5, locked: false }];
    doc.effects = [{ kind: 'light', shape: 'rect', x: 7, y: 1, w: 7, h: 3, colour: 'warm', intensity: 'bright' }];
    e.playCustom(doc, 'editor');
    e.zoom(1);
    e.artClock(1);
    S.check('the zone is in the level', e.customState().zones === 1);
    const zone = [7 * 40 + 4, 1 * 40 + 4, 14 * 40 - 4, 4 * 40 - 4];
    const keep = e.fxZones().slice();
    const off = () => {
      e.fxZones().length = 0;
      const b = brightness(...zone);
      e.fxZones().push(...keep);
      return b;
    };
    standOn(2, 2, 0);
    const behindOn = brightness(...zone);
    const behindOff = off();
    S.check('behind a wall: nothing of it shows', behindOn === behindOff, { behindOn, behindOff });
    standOn(9, 2, 0);
    const inOn = brightness(...zone);
    const inOff = off();
    S.check('in sight: it shows', inOn > inOff * 1.05 + 1000, { inOn, inOff });
    // a monster standing in the light is not shown by it
    e.info().enemies.push({ kind: 'echo', x: 11.5 * 40, y: 2.5 * 40, r: 14, state: 'idle', pitch: 50, voice: null, path: null, pi: 0, timer: 0, pause: 99, alertCd: 0, stepDist: 0, aDist: -1, aVr: 0 });
    const withMonster = brightness(...zone);
    e.info().enemies.pop();
    const without = brightness(...zone);
    S.check('a monster in the light is not drawn by it (only a ripple shows it)', withMonster === without, { withMonster, without });
    // a red glow pulses slowly - and holds still in calm mode
    e.fxZones().length = 0;
    e.fxZones().push(...EchoEffects.prepare([{ kind: 'glow', shape: 'circle', x: 7, y: 1, w: 7, h: 3, colour: 'red', intensity: 'medium' }], e.info().level.walls, e.info().level.W, e.info().level.H, 40));
    e.artClock(0.2);
    const a = brightness(...zone);
    e.artClock(1.6);
    const b = brightness(...zone);
    S.check('a red glow pulses', a !== b, { a, b });
    e.setCalm(true);
    e.artClock(0.2);
    const ca = brightness(...zone);
    e.artClock(1.6);
    const cb = brightness(...zone);
    e.setCalm(false);
    S.check('...and holds still in calm mode', ca === cb, { ca, cb });
    e.artClock(null);
    e.leaveCustom();
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ title card, palette, rating shown
  async function card() {
    const S = suite('card');
    const e = E();
    toTitle();
    e.features({ touch: false });
    const doc = levelFrom(['###########', '#S.......X#', '###########'], [], 'Card level', { doc: { titleCard: 'Mind the <dark>.', difficulty: { rating: 'hard', monsterSpeed: 1, rippleRange: 1, hearing: 1 } } });
    e.playCustom(F().normalise(doc).doc, 'mylevels', { card: true });
    const c = e.card();
    S.check('a title card first: the level waits under it', e.info().state === 'card' && !!c);
    S.check('it shows the title, the line (cleaned) and the difficulty', c && c.title === 'Card level' && c.line === 'Mind the dark.' && c.diff === 'Difficulty: Hard', c);
    const p0 = JSON.stringify([e.info().player.x, e.info().player.y, e.info().levelTime]);
    e.step(1);
    S.check('nothing moves while it is up', JSON.stringify([e.info().player.x, e.info().player.y, e.info().levelTime]) === p0);
    tap('KeyQ');
    S.check('any key: the level begins', e.info().state === 'play' && !e.card());
    S.check('...with its banner', $('banner').classList.contains('show'));
    e.leaveCustom();
    e.playCustom(F().normalise(doc).doc, 'mylevels', { card: true });
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    S.check('a click or a tap: the level begins', e.info().state === 'play');
    standOn(0, 0, 0);
    e.tp(e.info().level.exits[0].x - 20, e.info().level.exits[0].y);
    e.info().enemies.length = 0;
    // Try again does not show it again
    e.leaveCustom();
    const caught = levelFrom(['###########', '#S.......X#', '###########'], [['echo', 4, 1]]);
    e.playCustom(caught, 'mylevels', { card: true });
    e.endCard();
    standOn(4, 1);
    await sleep(1000);
    key('KeyR');
    await sleep(500);
    S.check('Try again: straight back in, no card', e.info().state === 'play');
    e.leaveCustom();
    const plain = levelFrom(['###########', '#S.......X#', '###########'], [], 'No line');
    e.playCustom(plain, 'mylevels', { card: true });
    S.check('with no line of its own: the title and the difficulty only', e.card() && e.card().line === '' && $('card-line').classList.contains('hidden') && e.card().diff === 'Difficulty: Normal');
    e.leaveCustom();
    // the palette: the level's over the player's Default; never over a palette the player picked
    const own = EchoProfile.getPalette();
    e.setPalette('default');
    const pal = levelFrom(['###########', '#S.......X#', '###########'], [], 'Palette', { doc: { palette: 'tritan' } });
    e.playCustom(pal, 'editor');
    S.check("the level's palette is shown over the Default one", EchoPalette.id === 'tritan');
    e.leaveCustom();
    S.check("...and the player's own is back after", EchoPalette.id === 'default' && EchoProfile.getPalette() === 'default');
    e.setPalette('protan');
    e.playCustom(pal, 'editor');
    S.check('a player who picked a palette keeps it', EchoPalette.id === 'protan');
    e.leaveCustom();
    e.setPalette(own || 'default');
    // the rating in My Levels
    const res = e.levelStore.save(F().normalise(doc).doc);
    e.openEditorScreens();
    if (e.editorScreen() !== 'list') e.closeEditorScreens(), localStorage.setItem('echomaze.editor', '1'), e.openEditorScreens();
    await sleep(20);
    const row = document.querySelector(`.lv-row[data-id="${res.doc.id}"]`);
    S.check('My Levels shows the difficulty', row && /Hard/.test(row.querySelector('.lv-diff').textContent));
    e.levelStore.delete(res.doc.id);
    toTitle();
    // the editor's settings tab
    await openFresh();
    e.editor.setTab('settings');
    const card_ = $('ed-card');
    card_.dispatchEvent(new Event('focus'));
    card_.value = '  A line\twith junk ';
    card_.dispatchEvent(new Event('input'));
    card_.dispatchEvent(new Event('blur'));
    S.check('settings: the title card line, cleaned', T.s().titleCard === 'A line with junk');
    $('ed-palette').value = 'contrast';
    $('ed-palette').dispatchEvent(new Event('change'));
    S.check('settings: a palette', T.s().palette === 'contrast');
    $('ed-w').value = '25';
    $('ed-w').dispatchEvent(new Event('change'));
    await sleep(20);
    S.check('settings: an exact width', T.s().size.w === 25);
    $('ed-h').value = '999';
    $('ed-h').dispatchEvent(new Event('change'));
    await sleep(20);
    if (T.dialogOpen()) T.answer('resize');
    S.check('settings: a height past the limit is clamped', T.s().size.h === 45);
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ the level's own difficulty, measured
  /**
   * 53 x 6: a long open corridor (rows 1-2: the start at its west end, the exit at its east end) and, below it, a
   * gallery joined to it only at the west end (row 4) - a hunter put at the gallery's far end walks the whole of it
   * towards you, and is too far behind to cut off a run.
   */
  function corridor(monsters, extra) {
    const W = 53;
    const wall = '#'.repeat(W);
    const rows = [wall, `#S${'.'.repeat(W - 3)}#`, `#${'.'.repeat(W - 3)}X#`, `#.${'#'.repeat(W - 2)}`, `#${'.'.repeat(W - 2)}#`, wall];
    return levelFrom(rows, monsters, 'Speed', extra);
  }
  /** px/s: the most a monster moved in one frame, over `secs`, divided by the frame's time. */
  function topSpeed(pick, secs = 2) {
    const e = E();
    let best = 0;
    for (let i = 0; i < secs * 60; i++) {
      const m = pick();
      const x = m.x;
      const y = m.y;
      e.step(1 / 60);
      if (e.info().state !== 'play') break;
      best = Math.max(best, Math.hypot(m.x - x, m.y - y) * 60);
    }
    return best;
  }
  async function difficulty() {
    const S = suite('difficulty');
    const e = E();
    toTitle();
    const mode0 = e.settings().mode;
    const D = (rating, sp = 1, rr = 1, hr = 1) => ({ rating, monsterSpeed: sp, rippleRange: rr, hearing: hr });
    // clamped
    S.check('scales are clamped (custom: 0.5-1.5, 0.6-1.5, 0.5-1.5)', JSON.stringify(F().difficulty(D('custom', 99, -3, 'x'))) === JSON.stringify(D('custom', 1.5, 0.6, 1)));
    S.check('a named rating fixes the scales at 1', JSON.stringify(F().difficulty(D('hard', 1.4, 0.7, 1.3))) === JSON.stringify(D('hard')));
    S.check('an unknown rating reads as Normal', F().difficulty({ rating: 'insane' }).rating === 'normal');
    // a named rating plays exactly as the game's own mode tunes level 12 - whatever the player picked
    for (const r of ['easy', 'normal', 'hard', 'hardcore']) {
      const base = levelConfig(12, r, true);
      for (const pm of ['easy', 'hardcore']) {
        e.setMode(pm);
        e.playCustom(corridor([], { doc: { difficulty: D(r) } }), 'editor');
        const c = cfgOf();
        S.check(`rated ${r}, player on ${pm}: tuned as ${r}`, c.enemySpeed === base.enemySpeed && c.footstepRadius === base.footstepRadius && c.rippleRadius === base.rippleRadius && c.mimicTell === MODES[r].mimicTell, c);
        e.leaveCustom();
      }
    }
    e.setMode(mode0);
    // measured: monster speed (a stalker - it never stands still) and a hunter, at 1 and 1.5 and 0.5
    const measure = (scale) => {
      e.playCustom(corridor([['stalker', 30, 1]], { doc: { difficulty: D('custom', scale) } }), 'editor');
      const st = topSpeed(() => e.info().enemies[0], 3);
      const want = cfgOf().stalkerSpeed;
      e.leaveCustom();
      return { st: +st.toFixed(2), want: +want.toFixed(2) };
    };
    const s1 = measure(1);
    const s15 = measure(1.5);
    const s05 = measure(0.5);
    S.check('measured: a stalker walks at its tuned speed', Math.abs(s1.st - s1.want) < 0.5, s1);
    S.check('measured: x0.5 halves it', Math.abs(s05.st - s1.st * 0.5) < 0.6, { s05, s1 });
    S.check('measured: x1.5 - but never as fast as you (169 px/s at most)', s15.st <= 169.01 && Math.abs(s15.st - Math.min(s1.want * 1.5, 169)) < 0.6, s15);
    S.note(`stalker px/s: x0.5 ${s05.st}, x1 ${s1.st}, x1.5 ${s15.st}`);
    const hunter = (variant, scale) => {
      const err = e.playCustom(corridor([['warden', 50, 4, variant]], { doc: { difficulty: D('custom', scale) } }), 'editor');
      if (err) return { sp: -1, said: -1, err };
      // (at the far end of the gallery: it walks the length of it towards you, at its speed)
      const sp = topSpeed(() => e.info().enemies[0], 1.5);
      const said = e.customState().wardens[0].speed;
      e.leaveCustom();
      return { sp: +sp.toFixed(2), said: +said.toFixed(2) };
    };
    const h1 = hunter('regular', 1);
    const h15 = hunter('regular', 1.5);
    const u15 = hunter('upgraded', 1.5);
    S.check('measured: a Level 15 monster at its own rule (0.75 x your 170 = 127.5)', Math.abs(h1.sp - 127.5) < 0.5, h1);
    S.check('measured: scaled x1.5 by the same setting (191.25)', Math.abs(h15.sp - 191.25) < 0.6, h15);
    S.check('measured: a Level 16 monster x1.5 is capped at 1.25 x your speed (212.5), never uncapped', Math.abs(u15.sp - 212.5) < 0.6, u15);
    S.note(`hunter px/s: regular x1 ${h1.sp}, regular x1.5 ${h15.sp}, upgraded x1.5 ${u15.sp}`);
    // measured: the ripple's reach - in an open room, the rays that hit nothing stop exactly at it
    const room = (rr) => levelFrom(Array.from({ length: 35 }, (_, y) => (y === 0 || y === 34 ? '#'.repeat(51) : `#${'.'.repeat(49)}#`)).map((r, y) => (y === 17 ? `#${'.'.repeat(24)}S${'.'.repeat(23)}X#` : r)), [], 'Room', { doc: { difficulty: D('custom', 1, rr) } });
    const reach = (rr) => {
      e.playCustom(room(rr), 'editor');
      tap('Space');
      e.step(0.02);
      const rp = e.ripples()[e.ripples().length - 1];
      const max = Math.max(...rp.dist);
      const want = cfgOf().rippleRadius;
      e.leaveCustom();
      return { max: +max.toFixed(1), want: +want.toFixed(1) };
    };
    const r1 = reach(1);
    const r06 = reach(0.6);
    const r15 = reach(1.5);
    S.check('measured: the ripple reaches exactly its tuned range', Math.abs(r1.max - r1.want) < 0.5, r1);
    S.check('measured: x0.6 and x1.5 of it', Math.abs(r06.max - r1.max * 0.6) < 1 && Math.abs(r15.max - r1.max * 1.5) < 1, { r06, r1, r15 });
    S.note(`ripple px: x0.6 ${r06.max}, x1 ${r1.max}, x1.5 ${r15.max}`);
    // measured: hearing - the radius at which a stalker hears you standing still
    const hears = (hr) => {
      e.playCustom(corridor([['stalker', 30, 1]], { doc: { difficulty: D('custom', 1, 1, hr) } }), 'editor');
      const st = e.info().enemies[0];
      const r = cfgOf().presenceRadius;
      let edge = 0;
      for (let d = 30; d < 300; d += 1) {
        st.x = 25 * 40;
        st.y = 60;
        st.state = 'patrol';
        st.path = null;
        st.pause = 99;
        e.tp(25 * 40 - d, 60);
        e.step(1 / 60);
        if (st.state === 'hunt') edge = d;
      }
      e.leaveCustom();
      return { edge, want: r };
    };
    const hr1 = hears(1);
    const hr15 = hears(1.5);
    S.check('measured: a stalker hears you standing still out to its tuned radius', Math.abs(hr1.edge - hr1.want) <= 1.5 && Math.abs(hr15.edge - hr15.want) <= 1.5 && hr15.want === Math.round(hr1.want * 1.5), { hr1, hr15 });
    // impossible combinations: a hunter that cuts off even a perfect run
    const close = corridor([['warden', 40, 1, 'upgraded']], { doc: { difficulty: D('custom', 1) } });
    const v = C().check(F().normalise(close).doc);
    S.check('a hunter standing on your way out: an error, the level is not playable', !v.playable && v.errors.some((x) => x.code === 'hunter-cuts-off'), v.errors.map((x) => x.text));
    const behind = levelFrom(['############################', '#S........................X#', '#.##########################', '#..........................#', '############################'], [['warden', 2, 3, 'regular']], 'Behind');
    const vb = C().check(F().normalise(behind).doc);
    const vbFast = C().check(F().normalise({ ...behind, difficulty: D('custom', 1.5) }).doc);
    S.check('behind you and slower: fine; scaled up to catch a perfect run: refused', vb.playable && !vbFast.playable, [vb.errors.map((x) => x.code), vbFast.errors.map((x) => x.code)]);
    toTitle();
    // the editor: the rating, the sliders and Reset
    await openFresh();
    e.editor.setTab('settings');
    const ranges = () => [...$('ed-tuning').querySelectorAll('input[type=range]')];
    S.check('sliders are off unless the rating is Custom', ranges().length === 3 && ranges().every((r) => r.disabled));
    $('ed-rating').value = 'custom';
    $('ed-rating').dispatchEvent(new Event('change'));
    S.check('Custom: they come on', ranges().every((r) => !r.disabled));
    const sp = ranges()[0];
    sp.dispatchEvent(new Event('pointerdown'));
    sp.value = '1.35';
    sp.dispatchEvent(new Event('input'));
    sp.dispatchEvent(new Event('change'));
    S.check('a slider sets its scale', T.s().difficulty.monsterSpeed === 1.35 && /1\.35/.test(sp.closest('.ed-tune').textContent));
    $('ed-tune-reset').click();
    S.check('Reset to defaults', T.s().difficulty.monsterSpeed === 1 && T.s().difficulty.rating === 'custom');
    $('ed-undo').click();
    S.check('...and Undo brings it back', T.s().difficulty.monsterSpeed === 1.35);
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ folders
  async function folders() {
    const S = suite('folders');
    const e = E();
    const st = e.levelStore;
    toTitle();
    const keep = localStorage.getItem(st.FOLDERS_KEY);
    localStorage.removeItem(st.FOLDERS_KEY);
    const mk = (title) => st.save(F().normalise(levelFrom(['###########', '#S.......X#', '###########'], [], title)).doc).doc.id;
    const ids = [mk('Folder test B'), mk('Folder test A'), mk('Folder test C')];
    const a = st.createFolder('  Alpha\u0007 ').folder;
    const b = st.createFolder('beta').folder;
    S.check('create: names tidied', a && a.name === 'Alpha' && b.name === 'beta');
    S.check('create: an empty name is refused', st.createFolder('   ').ok === false);
    st.moveLevel(ids[0], a.id);
    st.moveLevel(ids[1], a.id);
    st.moveLevel(ids[2], b.id);
    const counts = () => Object.fromEntries(st.listFolders().map((f) => [f.name, f.count]));
    S.check('move: counts per folder', counts().Alpha === 2 && counts().beta === 1, counts());
    S.check('folderOf', st.folderOf(ids[0]) === a.id && st.folderOf(ids[2]) === b.id);
    const raw = localStorage.getItem(`echomaze.level.${ids[0]}`);
    S.check('which folder is NOT in the level data', !raw.includes(a.id) && !raw.includes('Alpha') && !Object.keys(JSON.parse(raw)).some((k) => /folder/i.test(k)));
    S.check('rename', st.renameFolder(a.id, 'Alpha one').ok && st.listFolders().find((f) => f.id === a.id).name === 'Alpha one');
    st.moveLevel(ids[2], null);
    S.check('move back to Unsorted', st.folderOf(ids[2]) === null && counts().beta === 0);
    // duplicate lands beside the original
    const dup = st.duplicate(ids[0]);
    S.check('duplicate: a copy, called so, in the same folder', dup.ok && dup.doc.title === 'Copy of Folder test B' && st.folderOf(dup.doc.id) === a.id && dup.doc.id !== ids[0]);
    // the screen
    localStorage.setItem('echomaze.editor', '1');
    e.features({ touch: false });
    e.openEditorScreens();
    await sleep(30);
    const chips = () => [...document.querySelectorAll('.lv-chip')].map((c) => c.textContent);
    S.check('My Levels: All, Unsorted and each folder, with counts', chips().some((t) => t === 'Alpha one3') && chips().some((t) => t === 'beta0') && chips()[0].startsWith('All') && chips()[1].startsWith('Unsorted'), chips());
    e.myLevels.show('all', 'name');
    S.check('sort by name: folders A to Z', chips().slice(2, 4).join() === 'Alpha one3,beta0', chips());
    st.moveLevel(ids[2], b.id);
    st.save(st.get(ids[2]).doc); // (an edit: beta now holds the newest level)
    e.myLevels.show('all', 'recent');
    S.check('sort by recently edited: the folder with the newest edit first', chips()[2].startsWith('beta'), chips());
    document.querySelector(`.lv-chip[data-folder="${a.id}"]`).click();
    await sleep(20);
    S.check('open a folder: its levels only, and its own buttons', document.querySelectorAll('.lv-row').length === 3 && !$('mylevels-folderbar').classList.contains('hidden') && /Play in order/.test($('mylevels-folderbar').textContent));
    // Move from the screen
    document.querySelector(`.lv-row[data-id="${ids[1]}"] button[data-act="move"]`).click();
    await sleep(20);
    S.check('Move asks which folder', T.dialogOpen() && $('dialog-select').options.length === 3);
    $('dialog-select').value = b.id;
    T.answer('move');
    await sleep(20);
    S.check('...and moves it', st.folderOf(ids[1]) === b.id && document.querySelectorAll('.lv-row').length === 2);
    // New level while a folder is open goes into it
    $('btn-mylevels-new').click();
    await sleep(30);
    $('ed-save').click();
    await sleep(30);
    const newId = e.editor.doc().id;
    S.check('a new level made with a folder open is filed in it', st.folderOf(newId) === a.id);
    e.closeEditorScreens();
    // play a folder in order (the unfinished one is stepped over)
    const q1 = mk('Queue 1');
    const q2 = mk('Queue 2');
    const qf = st.createFolder('Queue').folder;
    for (const id of [q1, newId, q2]) st.moveLevel(id, qf.id);
    const err = e.playQueue({ name: 'Queue', ids: [q1, newId, q2] });
    await sleep(500);
    e.endCard();
    S.check('play in order: the first level', err === null && e.customRun().title === 'Queue 1');
    e.tp(e.info().level.exits[0].x, e.info().level.exits[0].y);
    e.step(0.05);
    await sleep(800);
    S.check('cleared: Next level is offered, and says where you are', !$('btn-custom-next').classList.contains('hidden') && /Queue: 1 of 3 done/.test($('complete-note').textContent));
    $('btn-custom-next').click();
    await sleep(500);
    e.endCard();
    S.check('Next level: the next PLAYABLE one (the unfinished one stepped over)', e.customRun().title === 'Queue 2');
    e.tp(e.info().level.exits[0].x, e.info().level.exits[0].y);
    e.step(0.05);
    await sleep(800);
    S.check('the last one: no Next, and it says so', $('btn-custom-next').classList.contains('hidden') && /last level in Queue/.test($('complete-note').textContent));
    e.leaveCustom();
    await sleep(20);
    // delete a folder: its levels kept, back in Unsorted
    e.myLevels.show(b.id);
    [...$('mylevels-folderbar').querySelectorAll('button')].find((b) => b.textContent === 'Delete folder').click(); // (by its label: v15.3 added Share folder to the bar)
    await sleep(20);
    S.check('Delete folder asks, with a separate choice for its levels', T.dialogOpen() && /Delete folder, keep levels/.test($('dialog-buttons').textContent) && /Delete folder and its 2 levels/.test($('dialog-buttons').textContent));
    T.answer('keep');
    await sleep(20);
    S.check('kept: the folder is gone, its levels are in Unsorted', !st.listFolders().some((f) => f.id === b.id) && st.get(ids[1]) && st.folderOf(ids[1]) === null && st.get(ids[2]) && st.folderOf(ids[2]) === null);
    // ...and the other way: the levels too, after a second question
    e.myLevels.show(a.id);
    const inA = st.list().filter((l) => l.folder === a.id).map((l) => l.id);
    [...$('mylevels-folderbar').querySelectorAll('button')].find((b) => b.textContent === 'Delete folder').click(); // (by its label: v15.3 added Share folder to the bar)
    await sleep(20);
    T.answer('all');
    await sleep(20);
    S.check('"and its levels" asks again, plainly', T.dialogOpen() && /for good/.test($('dialog-title').textContent));
    T.answer('cancel');
    await sleep(20);
    S.check('Cancel: nothing deleted', st.listFolders().some((f) => f.id === a.id) && inA.every((id) => st.get(id)));
    [...$('mylevels-folderbar').querySelectorAll('button')].find((b) => b.textContent === 'Delete folder').click(); // (by its label: v15.3 added Share folder to the bar)
    await sleep(20);
    T.answer('all');
    await sleep(20);
    T.answer('delete');
    await sleep(20);
    S.check('deleted: the folder and its levels', !st.listFolders().some((f) => f.id === a.id) && inA.every((id) => !st.get(id)), inA);
    // damaged folder data never throws
    localStorage.setItem(st.FOLDERS_KEY, '{bad json');
    let ok = true;
    try {
      st.listFolders();
      st.list();
      e.myLevels.render();
    } catch (x) {
      ok = false;
    }
    localStorage.setItem(st.FOLDERS_KEY, JSON.stringify({ folders: [{ id: '__proto__', name: 'x' }, { id: 'ok-1', name: 5 }, 7, null], levels: { __proto__: 'ok-1', [ids[1]]: 'ok-1', 'nope!': 'ok-1' } }));
    let fl = null;
    try {
      fl = st.listFolders();
    } catch (x) {
      ok = false;
    }
    S.check('damaged or hostile folder data: read safely, never throws', ok && fl && fl.length === 1 && fl[0].name === 'Folder' && ({}).polluted === undefined, fl);
    // tidy
    for (const id of [ids[1], ids[2], q1, q2, newId]) st.delete(id);
    if (keep === null) localStorage.removeItem(st.FOLDERS_KEY);
    else localStorage.setItem(st.FOLDERS_KEY, keep);
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ v15.0 levels
  async function migration() {
    const S = suite('migration');
    const e = E();
    toTitle();
    const samples = await (await fetch(`tools/sample-levels.json?x=${Date.now()}`)).json();
    const v1 = samples.filter((s) => s.schemaVersion === 1);
    S.check('the v15.0 sample levels are schema 1, with one exit each (or none)', v1.length >= 3 && v1.every((s) => !('exits' in s)), v1.map((s) => s.title));
    for (const s of v1) {
      const r = F().normalise(s);
      const exits = s.exit ? [{ x: s.exit.x, y: s.exit.y, locked: false }] : [];
      S.check(`${s.title}: migrated - version 2, its exit in the list, nothing repaired, not foreign`, r.doc.schemaVersion === 2 && JSON.stringify(r.doc.exits) === JSON.stringify(exits) && r.notes.length === 0 && !r.foreign && r.doc.difficulty.rating === 'normal', r.notes);
      const out = F().toStorable(r.doc);
      S.check(`${s.title}: written back with the old single exit too, for older versions`, JSON.stringify(out.exit) === JSON.stringify(s.exit || null));
      const same = ['walls', 'start', 'enemies', 'title', 'size'].every((k) => JSON.stringify(out[k]) === JSON.stringify(s[k]));
      S.check(`${s.title}: walls, start, monsters, title and size unchanged`, same);
    }
    const fs = v1.find((s) => s.id === 'sample-first-steps');
    const half = v1.find((s) => s.id === 'sample-half-built');
    S.check('playable as before (First Steps yes, Half Built no - no exit)', C().check(F().normalise(fs).doc).playable && !C().check(F().normalise(half).doc).playable);
    // stored the way v15.0 stored them: listed, played, edited, saved
    for (const s of v1) localStorage.setItem(`echomaze.level.${s.id}`, JSON.stringify(s));
    const list = e.levelStore.list();
    S.check('stored as v15.0 left them: listed, with a rating', v1.every((s) => list.some((l) => l.id === s.id && l.rating === 'normal')));
    const b = EditorTest.bot(e.levelStore.get(fs.id).doc, { mode: 'normal' });
    S.check('First Steps (v15.0) plays through and is cleared', b.cleared, b);
    await openFresh();
    e.openEditor(e.levelStore.get(fs.id).doc);
    await sleep(20);
    S.check('opens in the editor, nothing to save', !T.s().dirty && T.s().exits.length === 1);
    T.tool('wall');
    T.click(2, 15);
    $('ed-save').click();
    await sleep(20);
    const saved = JSON.parse(localStorage.getItem(`echomaze.level.${fs.id}`));
    S.check('saved again: version 2, the exits list and the old exit both there', saved.schemaVersion === 2 && saved.exits.length === 1 && JSON.stringify(saved.exit) === JSON.stringify(fs.exit));
    for (const s of v1) localStorage.removeItem(`echomaze.level.${s.id}`);
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ hostile new content
  async function untrusted() {
    const S = suite('untrusted2');
    const bad = [
      { exits: 'many' },
      { exits: [null, 1, 'x', { x: 'a' }, { x: 3, y: 3, locked: 'yes' }, { x: 3, y: 3 }, ...Array.from({ length: 40 }, (_, i) => ({ x: i, y: 2 }))] },
      { objects: 'x' },
      { objects: [null, { kind: 'note', text: 5, x: 2, y: 2 }, { kind: 'note', x: 3, y: 3, text: 'z'.repeat(100000) }, { kind: 'key', x: -1, y: 0 }, { kind: 'key', x: 9999, y: 2 }, { kind: { toString: 1 } }] },
      { effects: [{ kind: 'light', x: 0, y: 0, w: 1e9, h: -5, colour: '<script>', intensity: {} }, { kind: 'glow', x: 'a' }, { kind: 'fog', x: 1, y: 1 }, 5, null] },
      { effects: Array.from({ length: 100 }, () => ({ kind: 'light', x: 1, y: 1, w: 3, h: 3 })) },
      { difficulty: { rating: 'insane', monsterSpeed: 'fast' } },
      { difficulty: { rating: 'custom', monsterSpeed: NaN, rippleRange: 1e9, hearing: -1 } },
      { difficulty: 'hard' },
      JSON.parse('{"difficulty": {"__proto__": {"polluted": 1}, "rating": "custom"}, "walls": ["#S.X#"]}'),
      { titleCard: { a: 1 }, palette: 'evil' },
      { titleCard: 'x'.repeat(100000), palette: 7 },
      { exit: { x: 2, y: 2 }, exits: 'nope' },
      { schemaVersion: 1, exit: 'nope' },
      { schemaVersion: 2, exit: { x: 3, y: 1 } }, // (a version 2 level with only the old field: still read)
    ];
    let threw = 0;
    for (const b of bad) {
      try {
        const r = F().normalise(b);
        if (r.doc) {
          const d = r.doc;
          const ok = d.exits.length <= 8 && d.objects.length <= 60 && d.effects.length <= 12 && d.effects.every((f) => f.x + f.w <= d.size.w && f.y + f.h <= d.size.h && f.w >= 1 && f.h >= 1) && d.titleCard.length <= 80 && F().RATINGS.includes(d.difficulty.rating) && ['monsterSpeed', 'rippleRange', 'hearing'].every((k) => isFinite(d.difficulty[k]) && d.difficulty[k] >= 0.5 && d.difficulty[k] <= 1.5);
          if (!ok) S.check('normalise always clamps the new content', false, b);
          C().check(d);
        }
        const built = buildCustomLevel(b);
        if (!built.level && !(typeof built.error === 'string' && built.error)) S.check('buildCustomLevel: a level or a reason', false, b);
      } catch (x) {
        threw++;
        S.check('nothing throws', false, String(x && x.stack));
      }
    }
    S.check(`${bad.length} hostile inputs with the new content: none threw`, threw === 0);
    S.check('prototype left alone', ({}).polluted === undefined);
    const old = F().normalise({ schemaVersion: 2, exit: { x: 3, y: 1 } }).doc;
    S.check('a level with only the old `exit` field is still read', old.exits.length === 1 && old.exits[0].x === 3);
    const fog = F().normalise({ effects: [{ kind: 'fog', x: 1, y: 1 }] });
    S.check('an effect kind from a newer version is kept aside (foreign), not lost', fog.foreign && fog.doc.extraEffects.length === 1 && F().toStorable(fog.doc).effects.some((f) => f.kind === 'fog'));
    return S.done();
  }

  // ------------------------------------------------------------------ playing all of it writes nothing
  function everythingLevel() {
    const rows = [
      '###########################',
      '#S..P....D.....N.........L#',
      '#.#######.#######.#######.#',
      '#.....K...........P.....X.#',
      '###########################',
      '#.........................#',
      '###########################',
    ];
    const doc = levelFrom(rows, [['echo', 12, 3], ['scent', 20, 3], ['warden', 3, 5, 'regular'], ['singer', 22, 1]], 'Everything', { note: 'They went this way.', noteStyle: 'recording' });
    doc.effects = [{ kind: 'light', shape: 'rect', x: 1, y: 1, w: 8, h: 3, colour: 'warm', intensity: 'medium' }, { kind: 'glow', shape: 'circle', x: 18, y: 1, w: 8, h: 3, colour: 'red', intensity: 'bright' }];
    doc.titleCard = 'Everything at once.';
    doc.palette = 'contrast';
    doc.difficulty = { rating: 'custom', monsterSpeed: 0.8, rippleRange: 1.2, hearing: 0.9 };
    return doc;
  }
  async function noWrites() {
    const S = suite('noWrites2');
    const e = E();
    toTitle();
    const before = storageSnapshot();
    const stats0 = JSON.stringify(e.stats());
    const medals0 = JSON.stringify(e.medals());
    const lore0 = JSON.stringify(EchoLore.found());
    const doc = everythingLevel();
    S.check('the everything level is playable', C().check(F().normalise(doc).doc).playable, C().check(F().normalise(doc).doc).errors);
    e.playCustom(doc, 'mylevels', { card: true });
    tap('Enter');
    S.check('playing: card, then play', e.info().state === 'play');
    standOn(4, 1);
    standOn(9, 1);
    standOn(12, 1);
    tap('Space');
    e.step(1);
    tap('KeyE'); // drop the decoy
    e.step(0.5);
    standOn(6, 3);
    standOn(24, 1, 1);
    const m0 = e.info().enemies.find((m) => m.kind === 'echo');
    e.tp(m0.x, m0.y);
    e.step(0.05);
    await sleep(1000);
    S.check('caught', e.info().state === 'caught');
    key('KeyR');
    await sleep(500);
    const k = e.customState().key;
    e.tp(k.x, k.y);
    e.step(0.05);
    standOn(24, 1);
    key('ArrowRight', true);
    e.step(2);
    key('ArrowRight', false);
    S.check('won through the locked exit', e.info().state === 'complete');
    e.leaveCustom();
    const after = storageSnapshot();
    S.check('nothing in storage changed by playing it', diffStorage(before, after).length === 0, diffStorage(before, after));
    S.check('stats, medals and fragments untouched', JSON.stringify(e.stats()) === stats0 && JSON.stringify(e.medals()) === medals0 && JSON.stringify(EchoLore.found()) === lore0);
    S.check("the player's palette is back", EchoPalette.id === (EchoProfile.getPalette() || 'default'));
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ soaks
  function xorshift(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }
  /** A random level with everything new in it: several exits (some locked, and a key), objects, zones, a difficulty. */
  function randomLevel(rand) {
    const doc = ET.randomLevel(rand);
    if (!doc) return null;
    const w = doc.size.w;
    const h = doc.size.h;
    const free = [];
    const used = new Set([`${doc.start.x},${doc.start.y}`, ...doc.exits.map((x) => `${x.x},${x.y}`), ...doc.enemies.map((m) => `${m.x},${m.y}`)]);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (doc.walls[y][x] === '.' && !used.has(`${x},${y}`)) free.push({ x, y });
    const take = () => (free.length ? free.splice(Math.floor(rand() * free.length), 1)[0] : null);
    const nx = Math.floor(rand() * 4);
    for (let i = 0; i < nx; i++) {
      const p = take();
      if (p) doc.exits.push({ x: p.x, y: p.y, locked: rand() < 0.4 });
    }
    if (rand() < 0.3) doc.exits[0].locked = true;
    if (doc.exits.some((x) => x.locked) || rand() < 0.3) {
      const p = take();
      if (p) doc.objects.push({ kind: 'key', x: p.x, y: p.y });
    }
    for (const k of ['puddle', 'puddle', 'puddle', 'decoy', 'note', 'note']) {
      if (rand() < 0.5) continue;
      const p = take();
      if (p) doc.objects.push(k === 'note' ? { kind: k, x: p.x, y: p.y, text: `Note ${Math.floor(rand() * 1000)}`, style: rand() < 0.5 ? 'note' : 'recording' } : { kind: k, x: p.x, y: p.y });
    }
    const nf = Math.floor(rand() * 4);
    for (let i = 0; i < nf; i++) {
      const x = Math.floor(rand() * (w - 2));
      const y = Math.floor(rand() * (h - 2));
      doc.effects.push({ kind: rand() < 0.5 ? 'light' : 'glow', shape: rand() < 0.5 ? 'rect' : 'circle', x, y, w: 1 + Math.floor(rand() * (w - x)), h: 1 + Math.floor(rand() * (h - y)), colour: 'warm', intensity: ['dim', 'medium', 'bright'][Math.floor(rand() * 3)] });
    }
    for (const f of doc.effects) if (f.kind === 'glow') f.colour = 'red';
    doc.titleCard = rand() < 0.5 ? 'A line.' : '';
    const r = F().RATINGS[Math.floor(rand() * 5)];
    doc.difficulty = { rating: r, monsterSpeed: 0.5 + rand(), rippleRange: 0.6 + rand() * 0.9, hearing: 0.5 + rand() };
    doc.palette = ['', 'default', 'protan', 'tritan', 'contrast'][Math.floor(rand() * 5)];
    return doc;
  }

  async function soak(levels = 6, frames = 1500, seed = 7) {
    const S = suite('soak2');
    const e = E();
    const rand = xorshift(seed);
    const errors = [];
    const onErr = (ev) => errors.push(String(ev.message || ev));
    window.addEventListener('error', onErr);
    const keysDown = new Set();
    const press = (code, on) => {
      key(code, on);
      if (on) keysDown.add(code);
      else keysDown.delete(code);
    };
    let played = 0;
    let refused = 0;
    let caught = 0;
    let cleared = 0;
    let stepped = 0;
    let drawn = 0;
    toTitle();
    const before = storageSnapshot();
    for (let L = 0; L < levels; L++) {
      const doc = randomLevel(rand);
      if (!doc) continue;
      const err = e.playCustom(doc, rand() < 0.5 ? 'editor' : 'mylevels');
      if (err) {
        refused++; // (unreachable ways out, a key behind its own door, a hunter on the way: the checker says no)
        continue;
      }
      played++;
      for (let f = 0; f < frames; f++) {
        try {
          if (f % 20 === 0) {
            for (const k of [...keysDown]) press(k, false);
            const dirs = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            press(dirs[Math.floor(rand() * 4)], true);
            if (rand() < 0.3) press(dirs[Math.floor(rand() * 4)], true);
            if (rand() < 0.12) press('ShiftLeft', true);
          }
          if (rand() < 0.02) tap('Space');
          if (rand() < 0.005) tap('KeyE');
          const st = e.info().state;
          if (st === 'play') {
            e.step(1 / 60);
            stepped++;
            if (f % 100 === 0) {
              e.draw();
              drawn++;
            }
          } else if (st === 'caught') {
            caught++;
            for (const k of [...keysDown]) press(k, false);
            e.playCustom(doc, 'editor');
          } else if (st === 'complete') {
            cleared++;
            e.playCustom(doc, 'editor');
          } else break;
          if (rand() < 0.002) {
            const lv = e.info().level;
            const t = rand() < 0.5 && lv.key ? lv.key : lv.exits[Math.floor(rand() * lv.exits.length)];
            e.tp(t.x, t.y);
          }
        } catch (ex) {
          errors.push(String(ex && ex.stack));
          break;
        }
      }
      for (const k of [...keysDown]) press(k, false);
      e.leaveCustom();
      if (L % 2 === 1) await sleep(0);
    }
    window.removeEventListener('error', onErr);
    const changed = diffStorage(before, storageSnapshot());
    S.check(`soak: ${played} levels, ${stepped} frames, no exceptions`, errors.length === 0, errors.slice(0, 5));
    S.check('soak: storage untouched by all of it', changed.length === 0, changed);
    S.check("soak: the player's palette is back", EchoPalette.id === (EchoProfile.getPalette() || 'default'));
    S.note(`played ${played}, refused ${refused}, frames ${stepped}, drawn ${drawn}, caught ${caught}, cleared ${cleared}`);
    return S.done();
  }

  /** Random editing with every tool and panel. The level stays valid data the whole time. */
  async function editSoak(ops = 2000, seed = 11) {
    const S = suite('editSoak2');
    const rand = xorshift(seed);
    await openFresh();
    const e = E();
    const toolIds = ['wall', 'erase', 'select', 'start', 'exit', 'monster', 'object', 'effect'];
    const errors = [];
    let bad = 0;
    const why = [];
    for (let i = 0; i < ops; i++) {
      try {
        const s = T.s();
        const rx = () => Math.floor(rand() * s.size.w);
        const ry = () => Math.floor(rand() * s.size.h);
        const r = rand();
        if (r < 0.1) T.tool(toolIds[Math.floor(rand() * toolIds.length)]);
        else if (r < 0.13) T.monster(Math.floor(rand() * s.choices.length));
        else if (r < 0.16) e.editor.setChoice('object', ['puddle', 'decoy', 'key', 'note'][Math.floor(rand() * 4)]);
        else if (r < 0.18) e.editor.setChoice('exit', rand() < 0.5 ? 'open' : 'locked');
        else if (r < 0.2) e.editor.setChoice('effect', rand() < 0.5 ? 'light' : 'glow');
        else if (r < 0.23) T.key('KeyZ', { ctrlKey: true });
        else if (r < 0.25) T.key('KeyY', { ctrlKey: true });
        else if (r < 0.27) T.key('Delete');
        else if (r < 0.28) T.key('Escape');
        else if (r < 0.31) {
          // something in the picked thing's panel
          const ins = $('ed-inspector');
          const sels = ins.querySelectorAll('select');
          const box = ins.querySelector('input[type=checkbox]');
          if (sels.length && rand() < 0.7) {
            const sl = sels[Math.floor(rand() * sels.length)];
            sl.value = sl.options[Math.floor(rand() * sl.options.length)].value;
            sl.dispatchEvent(new Event('change'));
          } else if (box) {
            box.checked = !box.checked;
            box.dispatchEvent(new Event('change'));
          }
        } else if (r < 0.33) {
          $('ed-rating').value = F().RATINGS[Math.floor(rand() * 5)];
          $('ed-rating').dispatchEvent(new Event('change'));
        } else if (r < 0.6) T.click(rx(), ry(), rand() < 0.15 ? 2 : 0);
        else {
          const pts = [[rx(), ry()]];
          for (let k = 0; k < 3; k++) pts.push([rx(), ry()]);
          T.drag(pts, rand() < 0.12 ? 2 : 0);
        }
        await sleep(0);
        if (T.dialogOpen()) {
          if ($('dialog-input') && !$('dialog-input').classList.contains('hidden') && rand() < 0.7) {
            $('dialog-input').value = `Words ${i}`;
            T.answer(rand() < 0.5 ? 'note' : 'recording');
          } else T.answer('cancel');
          await sleep(0);
        }
        if (i % 40 === 0) {
          const doc = T.doc();
          const round = F().normalise(F().serialise(doc));
          if (!round.doc || round.notes.length || F().serialise(round.doc) !== F().serialise(doc)) {
            bad++;
            why.push(['round trip', round.notes]);
          }
          const tiles = new Set();
          const things = [...doc.enemies, ...doc.exits, ...doc.objects, ...(doc.start ? [doc.start] : [])];
          for (const t of things) {
            const k = `${t.x},${t.y}`;
            if (tiles.has(k)) {
              bad++;
              why.push(['two on a tile', k]);
            }
            tiles.add(k);
          }
          for (const t of things) {
            if (doc.walls[t.y][t.x] === '#') {
              bad++;
              why.push(['in a wall', t]);
            }
          }
          if (doc.exits.length > 8 || doc.effects.length > 12 || doc.effects.some((f) => f.x + f.w > doc.size.w || f.y + f.h > doc.size.h)) {
            bad++;
            why.push(['limits']);
          }
          C().check(doc);
        }
      } catch (ex) {
        errors.push(String(ex && ex.stack));
        if (errors.length > 3) break;
      }
    }
    if (T.dialogOpen()) T.answer('cancel');
    S.check(`edit soak: ${ops} random actions, no exceptions`, errors.length === 0, errors);
    S.check('the level was valid data every time it was looked at (one per tile, nothing in walls, limits kept, round-trips exactly)', bad === 0, why.slice(0, 5));
    const st = T.s();
    S.note(JSON.stringify({ walls: st.walls, exits: st.exits.length, enemies: st.enemies.length, objects: st.objects.length, effects: st.effects.length, undo: st.undo }));
    toTitle();
    return S.done();
  }

  // ------------------------------------------------------------------ a bot that knows about keys
  /**
   * Plays a level with the real arrow keys: if a locked exit is the only way (or the nearest), to the key first,
   * then along the shortest way to the nearest exit it can use. -> { cleared, caught, seconds, by, minGap }
   */
  function bot(doc, o = {}) {
    const { mode = 'normal', maxSeconds = 120, pingEvery = 0 } = o;
    const e = E();
    const held = new Set();
    const set = (code, on) => {
      if (on && !held.has(code)) {
        held.add(code);
        key(code, true);
      } else if (!on && held.has(code)) {
        held.delete(code);
        key(code, false);
      }
    };
    const mode0 = e.settings().mode;
    e.setMode(mode);
    const err = e.playCustom(doc, 'editor');
    if (err) return { error: err };
    const L = e.info().level;
    const W = L.W;
    const open = L.blocked.slice();
    for (const x of L.exits) open[x.ty * W + x.tx] = 0; // (with the key, every door can be walked to)
    const fieldTo = (tx, ty, grid) => bfsDist(grid, W, L.H, ty * W + tx);
    const out = { mode, cleared: false, caught: false, seconds: 0, by: null, minGap: null };
    let pingT = pingEvery;
    for (let f = 0; f < maxSeconds * 60; f++) {
      const I = e.info();
      if (I.state === 'complete') {
        out.cleared = true;
        break;
      }
      if (I.state !== 'play') {
        out.caught = I.state === 'caught';
        out.by = e.deathTip();
        break;
      }
      const p = I.player;
      const sx = Math.floor(p.x / 40);
      const sy = Math.floor(p.y / 40);
      // where to: the nearest exit it can use now; or the key, if no exit can be used without it
      const cs = e.customState();
      let field = null;
      let best = Infinity;
      for (const x of L.exits) {
        if (x.locked && !cs.hasKey) continue;
        const fd = fieldTo(x.tx, x.ty, cs.hasKey ? open : L.blocked);
        if (fd[sy * W + sx] >= 0 && fd[sy * W + sx] < best) {
          best = fd[sy * W + sx];
          field = fd;
        }
      }
      if (!field && L.key && !L.key.taken) field = fieldTo(Math.floor(L.key.x / 40), Math.floor(L.key.y / 40), L.blocked);
      if (!field) break;
      let next = null;
      let bd = field[sy * W + sx];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = (sy + dy) * W + sx + dx;
        if (field[i] >= 0 && field[i] < bd) {
          bd = field[i];
          next = [sx + dx, sy + dy];
        }
      }
      const tx = next ? (next[0] + 0.5) * 40 : (sx + 0.5) * 40;
      const ty = next ? (next[1] + 0.5) * 40 : (sy + 0.5) * 40;
      // (at the end of the way: push on into whatever is there - the exit, or the door)
      const target = next ? null : L.exits.find((x) => Math.abs(x.tx - sx) + Math.abs(x.ty - sy) <= 1 && (!x.locked || cs.hasKey));
      const gx = target ? target.x : tx;
      const gy = target ? target.y : ty;
      set('ArrowRight', gx - p.x > 2.5);
      set('ArrowLeft', gx - p.x < -2.5);
      set('ArrowDown', gy - p.y > 2.5);
      set('ArrowUp', gy - p.y < -2.5);
      for (const m of I.enemies) {
        if (m.kind !== 'warden') continue;
        const d = bfsDist(L.blocked, W, L.H, Math.floor(m.y / 40) * W + Math.floor(m.x / 40))[sy * W + sx];
        if (d >= 0 && (out.minGap === null || d * 40 < out.minGap)) out.minGap = d * 40;
      }
      if (pingEvery > 0) {
        pingT -= 1 / 60;
        if (pingT <= 0) {
          pingT = pingEvery;
          tap('Space');
        }
      }
      e.step(1 / 60);
      out.seconds += 1 / 60;
    }
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((c) => set(c, false));
    out.seconds = +out.seconds.toFixed(2);
    e.leaveCustom();
    e.setMode(mode0);
    return out;
  }

  return { touchGate, exits, keys, objects, effects, card, difficulty, folders, migration, untrusted, noWrites, soak, editSoak, bot, randomLevel, everythingLevel, levelFrom };
})();
