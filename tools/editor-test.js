'use strict';

/**
 * EDITOR TESTS (v15.0; kept working on the v15.1 format - the v15.1 suites are in tools/editor-test-2.js). Load into a ?debug page of the game - it drives the real editor with real mouse events,
 * the real store and the real engine:
 *   const s = document.createElement('script'); s.src = 'tools/editor-test.js'; document.head.appendChild(s);
 * Then run the suites one at a time (each is async and returns { name, pass, fail, failed: [...], notes }):
 *   await EditorTest.gate()        the spoiler gate: first click, Back, I understand, kept, auto-unlock
 *   await EditorTest.tools()       every tool, undo / redo, clear all, size, title
 *   await EditorTest.validation()  every error message, and Test play refusing an unfinished level
 *   await EditorTest.storage()     save / load round trip, My Levels: play, edit, rename, delete (with its question)
 *   await EditorTest.untrusted()   corrupt, missing, hostile and newer-version data: nothing throws
 *   await EditorTest.noWrites()    test-play and My Levels play (deaths, wins, retries, pause) write nothing
 *   await EditorTest.soak(levels, frames)   random levels with every monster, random play
 *   await EditorTest.editSoak(ops) random editing with the mouse; the level stays valid data throughout
 *   EditorTest.bot(doc, { mode })  plays a custom level along the shortest way with the real keys (cleared? caught?)
 * Some suites change localStorage (they save levels and set the editor flag): run them on a test page, and clear
 * it after (EditorTest.clearAll()).
 */
window.EditorTest = (() => { // (on window, so it can be loaded again into the same page)
  const E = () => window.__echo;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // (v15.7) the unreleased-content warning now stands between the title and the editor's other screens (it has its own
  // tests in tools/monster-test.js): these suites step through it and go on testing what they always tested
  const passUnreleased = () => {
    const g = window.__echo;
    if (g.editorScreen() === 'unreleased') g.acceptUnreleased();
  };
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ driving the editor like a person would
  const T = {
    cv: () => $('ed-canvas'),
    at: (x, y) => E().editor.tileToClient(x, y),
    down(x, y, button = 0) {
      const p = T.at(x, y);
      T.cv().dispatchEvent(new MouseEvent('mousedown', { clientX: p.clientX, clientY: p.clientY, button, bubbles: true, cancelable: true }));
    },
    move(x, y) {
      const p = T.at(x, y);
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: p.clientX, clientY: p.clientY, bubbles: true }));
    },
    up(x, y) {
      const p = T.at(x, y);
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: p.clientX, clientY: p.clientY, bubbles: true }));
    },
    click(x, y, button = 0) {
      T.down(x, y, button);
      T.up(x, y);
    },
    drag(pts, button = 0) {
      T.down(pts[0][0], pts[0][1], button);
      for (const [x, y] of pts.slice(1)) T.move(x, y);
      const l = pts[pts.length - 1];
      T.up(l[0], l[1]);
    },
    tool: (id) => document.querySelector(`.ed-tool[data-tool="${id}"]`).click(),
    monster: (i) => document.querySelectorAll('.ed-monster')[i].click(),
    s: () => E().editor.state(),
    doc: () => E().editor.doc(),
    wallAt: (x, y) => E().editor.doc().walls[y][x] === '#',
    key: (code, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...opts })),
    dialogOpen: () => E().dialog.isOpen(),
    answer(id) {
      const b = document.querySelector(`#dialog-buttons button[data-id="${id}"]`);
      if (b) b.click();
      return !!b;
    },
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

  /** Everything this origin keeps, as plain data (what "touched no save data" is checked against). */
  function storageSnapshot() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = localStorage.getItem(k);
    }
    return out;
  }
  function diffStorage(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].filter((k) => a[k] !== b[k]);
  }

  async function toEditorList() {
    if (E().info().state === 'play' || E().info().state === 'paused' || E().info().state === 'caught' || E().info().state === 'complete') E().leaveCustom();
    if (E().info().state !== 'editor') {
      if (E().info().state !== 'title') {
        E().leaveCustom();
      }
      localStorage.setItem('echomaze.editor', '1');
      E().openEditorScreens(); passUnreleased();
    }
    await sleep(30);
  }
  /** A fresh, empty level open in the editor. */
  async function openFresh() {
    await toEditorList();
    E().openEditor(null);
    window.dispatchEvent(new Event('resize'));
    await sleep(30);
    E().editor.render();
  }

  /**
   * A level as data, from rows of text: '#' wall, '.' floor, 'S' start, 'X' an exit, 'L' a locked exit (v15.1: a level
   * has a list of them); monsters as [kind, x, y, variant].
   */
  function levelFrom(rows, monsters = [], title = 'Test level') {
    const doc = E().levelFormat.blank({ w: rows[0].length, h: rows.length, title });
    doc.walls = rows.map((r) => r.replace(/[^#]/g, '.'));
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        if (r[x] === 'S') doc.start = { x, y };
        if (r[x] === 'X' || r[x] === 'L') doc.exits.push({ x, y, locked: r[x] === 'L' });
      }
    });
    doc.enemies = monsters.map(([kind, x, y, variant]) => (variant ? { kind, variant, x, y } : { kind, x, y }));
    return doc;
  }

  // ------------------------------------------------------------ the gate
  async function gate() {
    const S = suite('gate');
    const e = E();
    if (e.info().state !== 'title') e.closeEditorScreens();
    const keep = storageSnapshot();
    localStorage.removeItem('echomaze.editor');
    localStorage.removeItem('echomaze.progress');
    location.hash = '';
    // (progress is read at load; the test reloads nothing, so it looks at what the game holds right now)
    S.check('starts locked (no flag, nothing finished)', !e.editorUnlocked() || e.settings().editor.anyModeFinished, e.settings().editor);
    $('btn-editor').click(); passUnreleased();
    await sleep(40);
    S.check('first click shows the warning', e.editorScreen() === 'gate' && $('editor-gate').classList.contains('in'));
    const text = $('editor-gate').textContent;
    S.check('the warning names no monster and no story', !/warden|echo monster|scent|stalker|muffler|singer|mimic|capture|gaol/i.test(text), text.trim().replace(/\s+/g, ' '));
    S.check('it has I understand and Back', !!$('btn-gate-ok') && /I understand/.test($('btn-gate-ok').textContent) && /Back/.test($('btn-gate-back').textContent));
    $('btn-gate-back').click();
    await sleep(40);
    S.check('Back: the title again, nothing saved', e.info().state === 'title' && localStorage.getItem('echomaze.editor') === null);
    $('btn-editor').click(); passUnreleased();
    await sleep(40);
    S.check('asked again after Back', e.editorScreen() === 'gate');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    await sleep(40);
    S.check('Esc is Back too', e.info().state === 'title' && localStorage.getItem('echomaze.editor') === null);
    $('btn-editor').click(); passUnreleased();
    await sleep(40);
    $('btn-gate-ok').click(); passUnreleased();
    await sleep(40);
    S.check('I understand: My Levels, and it is kept', e.editorScreen() === 'list' && localStorage.getItem('echomaze.editor') === '1');
    e.closeEditorScreens();
    await sleep(40);
    $('btn-editor').click(); passUnreleased();
    await sleep(40);
    S.check('never asked again', e.editorScreen() === 'list');
    e.closeEditorScreens();
    // restore whatever was there
    for (const k of ['echomaze.editor', 'echomaze.progress']) {
      if (keep[k] === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, keep[k]);
    }
    return S.done();
  }

  // ------------------------------------------------------------ every tool
  async function tools() {
    const S = suite('tools');
    await openFresh();
    S.check('a new level: 31 x 21, a ring of wall, nothing placed', T.s().size.w === 31 && T.s().size.h === 21 && T.s().walls === 100 && !T.s().start && !T.s().exit && T.s().enemies.length === 0);
    // WALL
    T.tool('wall');
    const w0 = T.s().walls;
    T.drag([[5, 5], [15, 5]]);
    S.check('wall: a drag draws every tile along it', T.s().walls - w0 === 11 && [5, 10, 15].every((x) => T.wallAt(x, 5)));
    S.check('wall: one stroke is one undo step', T.s().undo === 1, T.s().undo);
    T.drag([[8, 5], [10, 5]], 2);
    S.check('wall: right-drag rubs walls out', !T.wallAt(8, 5) && !T.wallAt(9, 5) && !T.wallAt(10, 5) && T.wallAt(7, 5) && T.wallAt(11, 5));
    T.down(3, 8);
    T.move(9, 14);
    T.up(9, 14);
    S.check('wall: a fast diagonal stroke leaves no gaps', [[3, 8], [4, 9], [5, 10], [6, 11], [7, 12], [8, 13], [9, 14]].every(([x, y]) => T.wallAt(x, y)));
    // ERASE
    T.tool('erase');
    T.drag([[11, 5], [12, 5]]);
    S.check('erase: back to floor', !T.wallAt(11, 5) && !T.wallAt(12, 5) && T.wallAt(13, 5));
    // START / EXIT
    T.tool('start');
    T.click(2, 2);
    S.check('start: placed', JSON.stringify(T.s().start) === '{"x":2,"y":2}');
    T.click(7, 5);
    S.check('start: on a wall moves it there and clears the wall', JSON.stringify(T.s().start) === '{"x":7,"y":5}' && !T.wallAt(7, 5));
    T.drag([[7, 5], [6, 6], [3, 3]]);
    S.check('start: dragging slides it', JSON.stringify(T.s().start) === '{"x":3,"y":3}');
    T.tool('exit');
    T.click(28, 18);
    S.check('exit: placed', JSON.stringify(T.s().exit) === '{"x":28,"y":18}');
    T.click(3, 3);
    S.check('exit: refused on the start, with a reason', JSON.stringify(T.s().exit) === '{"x":28,"y":18}' && /start is already there/i.test(T.s().hint), T.s().hint);
    // MONSTERS: every kind the game has
    const n = document.querySelectorAll('.ed-monster').length;
    S.check('monster list: every kind and variant in MONSTER_TYPES', n === E().monsterChoices().length && n >= 8, n);
    for (let i = 0; i < n; i++) {
      T.monster(i);
      T.click(10 + i, 16);
    }
    const kinds = T.s().enemies.map((e) => `${e.kind}${e.variant ? `/${e.variant}` : ''}`);
    S.check('monster: one of each placed', kinds.length === n && kinds.includes('warden/regular') && kinds.includes('warden/upgraded') && kinds.includes('muffler') && kinds.includes('mimic'), kinds);
    T.monster(0);
    const before = T.s().enemies.length;
    T.click(13, 5); // a wall
    S.check('monster: refused on a wall', T.s().enemies.length === before && /floor/i.test(T.s().hint), T.s().hint);
    T.click(3, 3); // the start
    S.check('monster: refused on the start', T.s().enemies.length === before);
    T.drag([[10, 16], [10, 17], [11, 18]]);
    S.check('monster: dragged to a new tile', T.s().enemies.some((e) => e.x === 11 && e.y === 18) && !T.s().enemies.some((e) => e.x === 10 && e.y === 16));
    T.drag([[11, 18], [11, 16]]); // onto another monster: it stops short
    S.check('monster: never dragged onto another', !T.s().enemies.some((e, i, a) => a.findIndex((f) => f.x === e.x && f.y === e.y) !== i));
    T.click(12, 16, 2);
    S.check('monster: right-click takes it away', T.s().enemies.length === before - 1);
    T.click(13, 16); // pick one
    const picked = T.s().picked;
    T.key('Delete');
    S.check('monster: picked + Delete key', picked >= 0 && T.s().enemies.length === before - 2);
    // the Wall tool never builds over something placed
    T.tool('wall');
    T.click(3, 3);
    S.check('wall: never on the start', !T.wallAt(3, 3) && /start/i.test(T.s().hint));
    // SELECT: a box, moved
    T.drag([[24, 3], [26, 3]]);
    T.monster(1);
    T.click(25, 4);
    T.tool('select');
    T.drag([[24, 3], [26, 4]]);
    S.check('select: a box', JSON.stringify(T.s().selection) === '{"x0":24,"y0":3,"x1":26,"y1":4}', T.s().selection);
    T.drag([[25, 3], [25, 5], [25, 7]]);
    const movedOk = [24, 25, 26].every((x) => T.wallAt(x, 7) && !T.wallAt(x, 3)) && T.s().enemies.some((e) => e.kind === 'scent' && e.x === 25 && e.y === 8) && !T.s().enemies.some((e) => e.x === 25 && e.y === 4);
    S.check('select: dragging the box moves its walls and what stands in it', movedOk);
    S.check('select: the box follows', JSON.stringify(T.s().selection) === '{"x0":24,"y0":7,"x1":26,"y1":8}', T.s().selection);
    // a box can never land on something placed outside it
    T.tool('monster');
    T.monster(0);
    T.click(25, 11);
    T.tool('select');
    T.drag([[24, 7], [26, 8]]);
    const snapBefore = JSON.stringify(T.doc());
    T.drag([[25, 7], [25, 10]]); // its monster at (25, 8) would land on (25, 11)
    S.check('select: refused onto something placed, with a reason', JSON.stringify(T.doc()) === snapBefore && /land on something/i.test(T.s().hint), T.s().hint);
    // one thing dragged with Select
    T.key('Escape'); // drop the box
    T.drag([[3, 3], [4, 4]]);
    S.check('select: drags one placed thing', JSON.stringify(T.s().start) === '{"x":4,"y":4}');
    // Delete with a box clears it
    T.drag([[24, 7], [26, 8]]);
    T.key('Delete');
    S.check('select + Delete clears the box', [24, 25, 26].every((x) => !T.wallAt(x, 7)) && !T.s().enemies.some((e) => e.x === 25 && e.y === 8));
    // UNDO all the way back, and REDO all the way forward
    const final = JSON.stringify(T.doc());
    let steps = 0;
    while (T.s().undo && steps < 500) {
      T.key('KeyZ', { ctrlKey: true });
      steps++;
    }
    const blank = T.s();
    S.check('undo: all the way back to the empty level', blank.walls === 100 && !blank.start && !blank.exit && blank.enemies.length === 0, { steps });
    while (T.s().redo) T.key('KeyY', { ctrlKey: true });
    S.check('redo: all the way forward again', JSON.stringify(T.doc()) === final);
    T.key('KeyZ', { ctrlKey: true, shiftKey: false });
    T.key('KeyZ', { ctrlKey: true, shiftKey: true });
    S.check('ctrl+shift+z redoes too', JSON.stringify(T.doc()) === final);
    // CLEAR ALL asks first
    $('ed-clear').click();
    await sleep(20);
    S.check('clear all: asks first', T.dialogOpen() && /clear everything/i.test($('dialog-title').textContent));
    T.answer('cancel');
    await sleep(20);
    S.check('clear all: Cancel changes nothing', JSON.stringify(T.doc()) === final);
    $('ed-clear').click();
    await sleep(20);
    T.answer('clear');
    await sleep(20);
    S.check('clear all: everything gone', T.s().walls === 100 && !T.s().start && !T.s().exit && !T.s().enemies.length);
    document.getElementById('ed-undo').click();
    S.check('clear all: undo brings it back', JSON.stringify(T.doc()) === final);
    // SIZE
    const size = $('ed-size');
    size.value = '21x15';
    size.dispatchEvent(new Event('change'));
    await sleep(20);
    S.check('size: smaller asks first (things would be cut off)', T.dialogOpen());
    T.answer('cancel');
    await sleep(20);
    S.check('size: Cancel keeps it', T.s().size.w === 31 && size.value === '31x21');
    size.value = '21x15';
    size.dispatchEvent(new Event('change'));
    await sleep(20);
    T.answer('resize');
    await sleep(20);
    S.check('size: made smaller, what was outside cut off', T.s().size.w === 21 && T.s().size.h === 15 && !T.s().exit && T.s().enemies.every((e) => e.x < 21 && e.y < 15), T.s());
    document.getElementById('ed-undo').click();
    S.check('size: undo restores it all', JSON.stringify(T.doc()) === final);
    size.value = '41x29';
    size.dispatchEvent(new Event('change'));
    await sleep(20);
    S.check('size: bigger needs no question; the new ground is wall', !T.dialogOpen() && T.s().size.w === 41 && T.wallAt(40, 28) && T.wallAt(35, 5));
    document.getElementById('ed-undo').click();
    // TITLE
    const title = $('ed-title');
    title.dispatchEvent(new Event('focus')); // (a background tab cannot really focus)
    title.value = 'Some  title\twith\u0007junk ';
    title.dispatchEvent(new Event('input'));
    title.dispatchEvent(new Event('blur'));
    S.check('title: typed, cleaned (spaces, control characters)', T.s().title === 'Some title with junk', T.s().title);
    document.getElementById('ed-undo').click();
    S.check('title: one undo step', T.s().title === 'Untitled level');
    title.dispatchEvent(new Event('focus')); // (a background tab cannot really focus)
    title.value = 'x'.repeat(200);
    title.dispatchEvent(new Event('input'));
    title.dispatchEvent(new Event('blur'));
    S.check('title: at most 48 characters', T.s().title.length === 48);
    return S.done();
  }

  // ------------------------------------------------------------ validation
  async function validation() {
    const S = suite('validation');
    const C = E().levelCheck;
    const ring = (w, h) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.')).join(''));
    const base = ring(9, 7);
    const codes = (doc) => C.check(E().levelFormat.normalise(doc).doc).errors.map((e) => e.code);
    let d = levelFrom(base);
    S.check('nothing placed: no start, no exit', JSON.stringify(codes(d)) === '["no-start","no-exit"]', codes(d));
    d = levelFrom(['#########', '#S......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########']);
    S.check('start only: no exit', JSON.stringify(codes(d)) === '["no-exit"]');
    d = levelFrom(['#########', '#S..#..X#', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#########']);
    S.check('walled off: unreachable', JSON.stringify(codes(d)) === '["unreachable"]');
    S.check('unreachable says what to do', /can't be reached/.test(C.check(E().levelFormat.normalise(d).doc).errors[0].text));
    d = levelFrom(['#########', '#S......#', '#.......#', '#.......#', '#.......#', '#......X#', '#########']);
    S.check('start, exit, a way between: playable', C.check(E().levelFormat.normalise(d).doc).playable);
    const inWall = JSON.parse(JSON.stringify(d));
    inWall.start = { x: 0, y: 0 };
    S.check('start inside a wall', codes(inWall).includes('start-in-wall'));
    const exitWall = JSON.parse(JSON.stringify(d));
    exitWall.exits = [{ x: 8, y: 6 }];
    S.check('exit inside a wall', codes(exitWall).includes('exit-in-wall'));
    const same = JSON.parse(JSON.stringify(d));
    same.exits = [{ x: 1, y: 1 }];
    S.check('start and exit on one tile', codes(same).includes('same-tile'));
    const mon = levelFrom(['#########', '#S......#', '#.......#', '#.......#', '#.......#', '#......X#', '#########'], [['echo', 0, 3], ['scent', 1, 1]]);
    S.check('a monster in a wall and one on the start', codes(mon).includes('monster-in-wall') && codes(mon).includes('monster-on-start'));
    const onExit = levelFrom(['#########', '#S......#', '#.......#', '#.......#', '#.......#', '#......X#', '#########'], [['stalker', 7, 5]]);
    const v = C.check(E().levelFormat.normalise(onExit).doc);
    S.check('a monster on the exit is a warning, not an error', v.playable && v.warnings.length === 1);
    // in the editor: the list of problems, and Test play refusing
    await openFresh();
    const shown = $('ed-problems').textContent;
    S.check('the editor shows them in words', /no start yet/.test(shown) && /no exit yet/.test(shown), shown);
    S.check('status: Unfinished', /Unfinished/.test($('ed-status').textContent));
    $('ed-test').click();
    await sleep(30);
    S.check('Test play refuses an unfinished level, and says why', E().info().state === 'editor' && /Fix the problems/.test(T.s().hint), T.s().hint);
    T.tool('start');
    T.click(2, 2);
    T.tool('exit');
    T.click(4, 2);
    S.check('placed: Playable', T.s().playable && /Playable/.test($('ed-status').textContent) && /Ready to play/.test($('ed-problems').textContent));
    T.tool('wall');
    T.drag([[3, 1], [3, 19]]);
    S.check('walled off in the editor: unreachable shown', !T.s().playable && /can't be reached/.test($('ed-problems').textContent));
    return S.done();
  }

  // ------------------------------------------------------------ save / load and My Levels
  async function storage() {
    const S = suite('storage');
    const F = E().levelFormat;
    const store = E().levelStore;
    // a level with one of everything, saved and read back
    // (v15.1: the monsters stand in a sealed gallery - a hunter on the only route would make the level impossible,
    // which the checker now refuses)
    const rows = ['###################', '#S................#', '#.###.#####.#####.#', '#.#.............#.#', '#.#.###.###.###.#.#', '#................X#', '###################', '#.................#', '###################'];
    const mons = E().monsterChoices().map((c, i) => [c.kind, 2 + i, 7, c.variant]); // (along the sealed gallery - one tile apart since v15.7 brought two more)
    const doc = levelFrom(rows, mons, 'Round trip ✓ – ünïcode');
    const res = store.save(doc);
    S.check('save: ok', res.ok, res.error);
    const got = store.get(res.doc.id);
    const strip = (d) => {
      const o = F.toStorable(d);
      delete o.updatedAt;
      return JSON.stringify(o);
    };
    S.check('get: the same level back', got && strip(got.doc) === strip(res.doc) && strip(got.doc) === strip(F.normalise(doc).doc));
    S.check('updatedAt stamped, createdAt kept', got.doc.updatedAt >= doc.createdAt && got.doc.createdAt === doc.createdAt);
    const text = F.serialise(got.doc);
    S.check('serialise -> normalise -> serialise is the same text', F.serialise(F.normalise(text).doc) === text);
    S.check('stored as plain JSON under echomaze.level.<id>', JSON.parse(localStorage.getItem(`echomaze.level.${res.doc.id}`)).schemaVersion === E().levelFormat.SCHEMA_VERSION);
    const listed = store.list().find((l) => l.id === res.doc.id);
    S.check('list: it is there, playable, with its monsters', listed && listed.playable && listed.monsters === mons.length && listed.title === doc.title);
    // the editor round trip: open it, change nothing, the doc is identical
    await toEditorList();
    E().openEditor(got.doc);
    await sleep(20);
    S.check('editor: opens it exactly', strip(T.doc()) === strip(got.doc));
    S.check('editor: nothing to save when nothing changed', !T.s().dirty && /saved/.test(T.s().status));
    T.tool('wall');
    T.click(3, 5);
    S.check('editor: a change is unsaved', T.s().dirty && /unsaved/.test(T.s().status));
    $('ed-save').click();
    await sleep(20);
    S.check('editor: Save writes it', !T.s().dirty && store.get(res.doc.id).doc.walls[5][3] === '#');
    // an unfinished draft can be saved, and is marked so
    E().openEditor(null);
    await sleep(20);
    T.tool('start');
    T.click(2, 2);
    $('ed-title').value = 'A draft';
    $('ed-title').dispatchEvent(new Event('input'));
    $('ed-title').dispatchEvent(new Event('blur'));
    $('ed-save').click();
    await sleep(20);
    const draft = store.list().find((l) => l.title === 'A draft');
    S.check('a draft saves, marked unfinished', draft && !draft.playable && /no exit/.test(draft.problem));
    // leaving with unsaved changes asks
    T.tool('exit');
    T.click(5, 5);
    $('ed-back').click();
    await sleep(20);
    S.check('leaving with changes asks', T.dialogOpen() && /Save your changes/.test($('dialog-title').textContent));
    T.answer('cancel');
    await sleep(20);
    S.check('Cancel stays', E().editorScreen() === 'editor');
    $('ed-back').click();
    await sleep(20);
    T.answer('discard');
    await sleep(20);
    S.check("Don't save: My Levels, the draft as it was", E().editorScreen() === 'list' && !store.list().find((l) => l.title === 'A draft').playable);
    // My Levels: rows, and what each can do
    const row = (id) => document.querySelector(`.lv-row[data-id="${id}"]`);
    const btn = (id, act) => row(id) && row(id).querySelector(`button[data-act="${act}"]`);
    S.check('My Levels: the playable one can be played', btn(res.doc.id, 'play') && !btn(res.doc.id, 'play').disabled);
    S.check('My Levels: the draft cannot be played, only edited', btn(draft.id, 'play').disabled && !btn(draft.id, 'edit').disabled && /Unfinished/.test(row(draft.id).textContent));
    // rename
    btn(res.doc.id, 'rename').click();
    await sleep(20);
    S.check('rename asks for the name', T.dialogOpen() && $('dialog-input').value === doc.title);
    $('dialog-input').value = '  Renamed  level ';
    T.answer('ok');
    await sleep(20);
    S.check('renamed (and tidied)', store.get(res.doc.id).doc.title === 'Renamed level' && /Renamed level/.test(row(res.doc.id).textContent));
    // edit from the list
    btn(draft.id, 'edit').click();
    await sleep(20);
    S.check('Edit opens it in the editor', E().editorScreen() === 'editor' && T.s().title === 'A draft' && T.s().everSaved);
    $('ed-back').click();
    await sleep(20);
    // delete asks first
    btn(draft.id, 'delete').click();
    await sleep(20);
    S.check('delete asks first', T.dialogOpen() && /Delete this level/.test($('dialog-title').textContent));
    T.answer('cancel');
    await sleep(20);
    S.check('Cancel keeps it', !!store.get(draft.id));
    btn(draft.id, 'delete').click();
    await sleep(20);
    T.answer('delete');
    await sleep(20);
    S.check('Delete removes it', !store.get(draft.id) && !row(draft.id) && localStorage.getItem(`echomaze.level.${draft.id}`) === null);
    return S.done();
  }

  // ------------------------------------------------------------ untrusted data
  async function untrusted() {
    const S = suite('untrusted');
    const F = E().levelFormat;
    const bad = [
      null, undefined, 0, 42, true, '', 'garbage', '{', '[]', '{}', [], {}, { format: 'something-else' }, { walls: 5 }, { size: { w: -5, h: 1e9 } },
      { size: { w: 'NaN', h: '7' }, walls: ['#S.X#'] }, { size: { w: 3000, h: 3000 }, walls: [] }, { walls: [123, null, {}, '#####'] },
      { size: { w: 5, h: 5 }, walls: ['#####', '#S.X#', '#####'], start: { x: 1.4, y: '1' }, exit: { x: 3, y: 1 } },
      { start: { x: -1, y: 0 }, exit: { x: 1e12, y: 0 } }, { enemies: 'lots' }, { enemies: [null, 1, 'echo', { kind: 7 }, { kind: 'echo' }, { kind: 'echo', x: 99, y: 99 }] },
      { enemies: Array.from({ length: 500 }, (_, i) => ({ kind: 'echo', x: i % 30, y: 1 + Math.floor(i / 30) })) },
      { enemies: [{ kind: 'echo', x: 2, y: 2 }, { kind: 'scent', x: 2, y: 2 }] }, { enemies: [{ kind: 'warden', x: 2, y: 2 }] },
      { title: 'x'.repeat(100000) }, { title: '\u0000\u0007\n\r\t  ' }, { title: 42 }, { id: '../../etc', createdAt: 'yesterday', updatedAt: -1 },
      JSON.parse('{"__proto__": {"polluted": 1}, "constructor": 5, "walls": ["#S.X#"]}'), { schemaVersion: 999, futureThing: { a: [1, 2] } },
      { schemaVersion: 'one' }, 'x'.repeat(500001),
    ];
    let threw = 0;
    let builtOk = 0;
    let refused = 0;
    for (const b of bad) {
      try {
        const r = F.normalise(b);
        if (r.doc) {
          const d = r.doc;
          const ok = d.size.w >= 5 && d.size.w <= 61 && d.size.h >= 5 && d.size.h <= 45 && d.walls.length === d.size.h && d.walls.every((row) => row.length === d.size.w) && d.title.length >= 1 && d.title.length <= 48 && d.enemies.length <= 40;
          if (!ok) S.check('normalise always gives a level in range', false, b);
          E().levelCheck.check(d);
        }
        const built = buildCustomLevel(b, 'normal');
        if (built.level) builtOk++;
        else if (typeof built.error === 'string' && built.error) refused++;
        else S.check('buildCustomLevel: a level or a reason', false, b);
      } catch (e) {
        threw++;
        S.check('nothing throws', false, String(e && e.stack));
      }
    }
    S.check(`${bad.length} hostile inputs: none threw`, threw === 0, { builtOk, refused });
    S.check('prototype left alone', ({}).polluted === undefined && Object.prototype.polluted === undefined);
    const huge = F.normalise({ size: { w: 3000, h: 3000 } }).doc;
    S.check('sizes clamped to 61 x 45', huge.size.w === 61 && huge.size.h === 45);
    const many = F.normalise({ size: { w: 31, h: 21 }, enemies: Array.from({ length: 500 }, (_, i) => ({ kind: 'echo', x: i % 30, y: 1 + Math.floor(i / 30) })) }).doc;
    S.check('at most 40 monsters', many.enemies.length === 40);
    const dupe = F.normalise({ enemies: [{ kind: 'echo', x: 2, y: 2 }, { kind: 'scent', x: 2, y: 2 }] }).doc;
    S.check('one monster per tile', dupe.enemies.length === 1);
    const w = F.normalise({ enemies: [{ kind: 'warden', x: 2, y: 2 }] }).doc;
    S.check('a warden with no variant reads as the first variant', w.enemies[0].variant === 'regular');
    // a level from a NEWER version: an unknown monster and an unknown field are kept, not lost
    const future = { format: 'echo-maze-level', schemaVersion: 3, id: 'future-1', title: 'From the future', size: { w: 9, h: 5 }, walls: ['#########', '#S.....X#', '#.......#', '#.......#', '#########'], start: { x: 1, y: 1 }, exits: [{ x: 7, y: 1 }], enemies: [{ kind: 'echo', x: 4, y: 3 }, { kind: 'lurker', x: 5, y: 3, mood: 'grim' }], objects: [{ kind: 'lamp', x: 2, y: 2 }], weather: { fog: 0.4 } };
    const once = F.normalise(future);
    const twice = F.normalise(once.doc);
    S.check('read twice: what was kept aside is kept again, once', twice.foreign && twice.doc.extraEnemies.length === 1 && twice.doc.extraObjects.length === 1 && twice.doc.extra.weather && !('extra' in twice.doc.extra) && F.serialise(twice.doc) === F.serialise(once.doc));
    S.check('an in-memory level read again is not "foreign"', !F.normalise(F.blank()).foreign && !F.normalise(E().levelFormat.copy(F.blank())).foreign);
    localStorage.setItem('echomaze.level.future-1', JSON.stringify(future));
    // ...and damaged ones
    localStorage.setItem('echomaze.level.bad-json', '{not json');
    localStorage.setItem('echomaze.level.bad-shape', '[1,2,3]');
    localStorage.setItem('echomaze.level.$$$', '{}'); // not an id this game would write: ignored
    let list = null;
    try {
      list = E().levelStore.list();
    } catch (e) {
      S.check('list with damaged levels', false, String(e));
    }
    const f = list && list.find((l) => l.id === 'future-1');
    S.check('newer-version level listed as foreign and playable', f && f.foreign && f.playable && f.monsters === 2);
    S.check('damaged levels listed as damaged', list && list.filter((l) => l.damaged).map((l) => l.id).sort().join() === 'bad-json,bad-shape');
    S.check('a key this game would not write is ignored', list && !list.some((l) => l.id === '$$$'));
    await toEditorList();
    E().closeEditorScreens();
    await sleep(20);
    $('btn-editor').click(); passUnreleased();
    await sleep(30);
    const row = (id) => document.querySelector(`.lv-row[data-id="${id}"]`);
    const btn = (id, act) => row(id).querySelector(`button[data-act="${act}"]`);
    S.check('My Levels shows them without breaking', !!row('future-1') && !!row('bad-json'));
    S.check('damaged: only Delete', btn('bad-json', 'play').disabled && btn('bad-json', 'edit').disabled && btn('bad-json', 'rename').disabled && !btn('bad-json', 'delete').disabled);
    S.check('newer version: Play yes, Edit no', !btn('future-1', 'play').disabled && btn('future-1', 'edit').disabled);
    // renaming it here keeps what this version does not understand
    btn('future-1', 'rename').click();
    await sleep(20);
    $('dialog-input').value = 'Renamed here';
    T.answer('ok');
    await sleep(20);
    const kept = JSON.parse(localStorage.getItem('echomaze.level.future-1'));
    S.check('rename keeps the unknown monster, object and field, and the version', kept.title === 'Renamed here' && kept.schemaVersion === 3 && kept.enemies.some((e) => e.kind === 'lurker' && e.mood === 'grim') && kept.objects.some((o) => o.kind === 'lamp') && kept.weather && kept.weather.fog === 0.4, kept);
    // playing it plays what is understood (the echo monster), and nothing throws
    btn('future-1', 'play').click();
    await sleep(500);
    S.check('(v15.1) it opens on its title card', E().info().state === 'card' && !!E().card());
    E().endCard();
    S.check('the newer level plays with what this version knows', E().info().state === 'play' && E().info().enemies.length === 1 && E().info().enemies[0].kind === 'echo');
    E().step(1);
    E().leaveCustom();
    await sleep(20);
    // delete the damaged ones
    btn('bad-json', 'delete').click();
    await sleep(20);
    T.answer('delete');
    await sleep(20);
    S.check('a damaged level can be deleted', localStorage.getItem('echomaze.level.bad-json') === null);
    // playCustom with garbage changes nothing
    const st = E().info().state;
    const err = E().playCustom({ walls: 'nope' });
    S.check('playCustom with a broken level: a reason, nothing starts', typeof err === 'string' && E().info().state === st, err);
    // storage that refuses to write
    const realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new Error('QuotaExceededError');
    };
    let res = null;
    try {
      res = E().levelStore.save(F.blank({ title: 'No room' }));
    } catch (e) {
      res = { threw: String(e) };
    } finally {
      Storage.prototype.setItem = realSet;
    }
    S.check('a full / blocked storage: save says so, never throws', res && res.ok === false && /could not be saved/.test(res.error), res);
    for (const k of ['echomaze.level.future-1', 'echomaze.level.bad-shape', 'echomaze.level.$$$']) localStorage.removeItem(k);
    return S.done();
  }

  // ------------------------------------------------------------ test play writes nothing
  /** A small level with every monster in it, far enough from the start to be fair. */
  function everyMonsterLevel() {
    const rows = [
      '#############################',
      '#S..........................#',
      '#.#########.#######.#######.#',
      '#.#.......#.#.....#.#.....#.#',
      '#.#.......#.#.....#.#.....#.#',
      '#...........................#',
      '#.#######.#####.#####.#####.#',
      '#.........................X.#',
      '#############################',
      '#...........................#', // (v15.1: a sealed gallery for the two hunters - on the route they would make
      '#############################', //  the level impossible, which the checker now refuses)
    ];
    const ch = E().monsterChoices();
    const spots = [[5, 3], [8, 4], [14, 3], [16, 4], [22, 3], [24, 4], [12, 9], [20, 9], [26, 1], [5, 5]];
    return levelFrom(rows, ch.map((c, i) => [c.kind, spots[i][0], spots[i][1], c.variant]), 'Every monster');
  }

  async function noWrites() {
    const S = suite('noWrites');
    const e = E();
    // a real save to protect: some progress, a medal, stats, a fragment, a seen scene
    const before = storageSnapshot();
    const stats0 = JSON.stringify(e.stats());
    const medals0 = JSON.stringify(e.medals());
    const doc = everyMonsterLevel();
    await toEditorList();
    e.openEditor(doc);
    await sleep(20);
    const edBefore = JSON.stringify(e.editor.state());
    const docBefore = JSON.stringify(e.editor.doc());
    // test play: dying, retrying, winning, pausing - every way out
    const err = e.playCustom(e.editor.doc(), 'editor');
    S.check('test play starts', err === null && e.info().state === 'play' && e.info().levelNum === -1, err);
    S.check('test play: every monster is there', e.info().enemies.length === E().monsterChoices().length, e.info().enemies.map((m) => m.kind));
    S.check('its Wardens are hunting from the start', e.info().enemies.filter((m) => m.kind === 'warden').every((m) => m.state === 'hunt'));
    S.check('HUD says Test play', /Test play/.test($('hud-level').textContent));
    for (let i = 0; i < 4; i++) e.step(0.5);
    // walk into the first monster that is still alive
    const m0 = e.info().enemies.find((m) => m.kind === 'echo');
    e.tp(m0.x, m0.y);
    e.step(0.05);
    S.check('caught', e.info().state === 'caught');
    await sleep(1000);
    S.check('the Caught screen offers Try again and Back to the editor (even on Hardcore)', $('caught').classList.contains('in') && /Back to the editor/.test($('btn-caught-title').textContent));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
    await sleep(400);
    S.check('Try again restarts it', e.info().state === 'play' && e.info().levelNum === -1);
    // win: straight to the way out
    e.tp(e.info().level.exit.x, e.info().level.exit.y);
    e.step(0.05);
    S.check('won', e.info().state === 'complete');
    await sleep(800);
    S.check('Test complete screen: no medals, back to the editor', /Test complete/.test($('complete-title').textContent) && !$('btn-custom-back').classList.contains('hidden') && $('btn-next').classList.contains('hidden') && $('complete-medals').classList.contains('hidden'));
    $('btn-custom-again').click();
    await sleep(400);
    S.check('Play again', e.info().state === 'play');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    await sleep(50);
    S.check('paused, with Back to the editor', e.info().state === 'paused' && /Back to the editor/.test($('btn-quit').textContent));
    $('btn-quit').click();
    await sleep(400);
    S.check('back in the editor', e.info().state === 'editor' && e.editorScreen() === 'editor');
    S.check('the editor exactly as it was left', JSON.stringify(e.editor.state()) === edBefore && JSON.stringify(e.editor.doc()) === docBefore);
    // and from My Levels, on Hardcore
    const res = e.levelStore.save(doc);
    const stored = storageSnapshot();
    const mode0 = localStorage.getItem('echomaze.mode');
    e.setMode('hardcore');
    const err2 = e.playCustom(e.levelStore.get(res.doc.id).doc, 'mylevels');
    S.check('My Levels play on Hardcore starts', err2 === null && e.info().state === 'play');
    const m1 = e.info().enemies.find((m) => m.kind === 'stalker');
    e.tp(m1.x, m1.y);
    e.step(0.05);
    await sleep(1000);
    S.check('Hardcore: still just Try again (a custom level is not a run)', e.info().state === 'caught' && /Back to My Levels/.test($('btn-caught-title').textContent));
    $('btn-caught-title').click();
    await sleep(400);
    S.check('back to My Levels', e.editorScreen() === 'list');
    if (mode0 === null) localStorage.removeItem('echomaze.mode');
    else localStorage.setItem('echomaze.mode', mode0);
    e.setMode(mode0 || 'normal');
    const after = storageSnapshot();
    const changed = diffStorage(stored, after).filter((k) => k !== 'echomaze.mode');
    S.check('nothing in storage changed by playing (progress, medals, stats, fragments, seen, tutorial...)', changed.length === 0, changed);
    S.check('stats untouched', JSON.stringify(e.stats()) === stats0);
    S.check('medals untouched', JSON.stringify(e.medals()) === medals0);
    const all = diffStorage(before, after).filter((k) => k !== 'echomaze.mode');
    S.check('the only new key is the level that was saved on purpose', all.length === 1 && all[0] === `echomaze.level.${res.doc.id}`, all);
    e.levelStore.delete(res.doc.id);
    return S.done();
  }

  // ------------------------------------------------------------ soak
  /** A random level: random walls, start, exit (made reachable), and random monsters of every kind. */
  function randomLevel(rand) {
    const F = E().levelFormat;
    const w = 9 + Math.floor(rand() * 40);
    const h = 7 + Math.floor(rand() * 30);
    const grid = [];
    for (let y = 0; y < h; y++) {
      let s = '';
      for (let x = 0; x < w; x++) s += x === 0 || y === 0 || x === w - 1 || y === h - 1 || rand() < 0.22 ? '#' : '.';
      grid.push(s);
    }
    const doc = F.blank({ w, h, title: 'soak' });
    doc.walls = grid;
    const floor = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (grid[y][x] === '.') floor.push({ x, y });
    if (floor.length < 4) return null;
    const pick = () => floor.splice(Math.floor(rand() * floor.length), 1)[0];
    doc.start = pick();
    const exit = pick();
    doc.exits = [{ x: exit.x, y: exit.y, locked: false }];
    // carve a straight-ish way from start to exit so it is reachable
    const rows = grid.map((r) => r.split(''));
    let { x, y } = doc.start;
    while (x !== exit.x || y !== exit.y) {
      if (x !== exit.x && (y === exit.y || rand() < 0.5)) x += Math.sign(exit.x - x);
      else y += Math.sign(exit.y - y);
      rows[y][x] = '.';
    }
    doc.walls = rows.map((r) => r.join(''));
    const ch = E().monsterChoices();
    const n = Math.floor(rand() * 9);
    const free = floor.filter((p) => Math.abs(p.x - doc.start.x) + Math.abs(p.y - doc.start.y) > 4);
    for (let i = 0; i < n && free.length; i++) {
      const c = ch[Math.floor(rand() * ch.length)];
      const p = free.splice(Math.floor(rand() * free.length), 1)[0];
      doc.enemies.push(c.variant ? { kind: c.kind, variant: c.variant, x: p.x, y: p.y } : { kind: c.kind, x: p.x, y: p.y });
    }
    return doc;
  }
  function xorshift(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  /** Play random levels with random input. Counts exceptions (anything thrown, and window errors). */
  async function soak(levels = 6, frames = 1500, seed = 7) {
    const S = suite('soak');
    const e = E();
    const rand = xorshift(seed);
    let errors = [];
    const onErr = (ev) => errors.push(String(ev.message || ev));
    window.addEventListener('error', onErr);
    const keysDown = new Set();
    const press = (code, on) => {
      window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
      if (on) keysDown.add(code);
      else keysDown.delete(code);
    };
    let played = 0;
    let impossible = 0;
    let caught = 0;
    let cleared = 0;
    let stepped = 0;
    const before = storageSnapshot();
    await toEditorList();
    for (let L = 0; L < levels; L++) {
      const doc = randomLevel(rand);
      if (!doc) continue;
      const err = e.playCustom(doc, rand() < 0.5 ? 'editor' : 'mylevels');
      if (err && /too close to the way out/.test(err)) {
        impossible++; // (v15.1: a hunter dropped on the way out - the checker refuses it, rightly)
        continue;
      }
      if (err) {
        S.check('a random reachable level plays', false, err);
        continue;
      }
      played++;
      for (let f = 0; f < frames; f++) {
        try {
          if (f % 20 === 0) {
            for (const k of [...keysDown]) press(k, false);
            const dirs = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
            press(dirs[Math.floor(rand() * 4)], true);
            if (rand() < 0.3) press(dirs[Math.floor(rand() * 4)], true);
            if (rand() < 0.15) press('ShiftLeft', true);
          }
          if (rand() < 0.02) press('Space', true), press('Space', false);
          const st = e.info().state;
          if (st === 'play') {
            e.step(1 / 60);
            stepped++;
            if (f % 200 === 0) e.draw();
          } else if (st === 'caught') {
            caught++;
            for (const k of [...keysDown]) press(k, false);
            e.playCustom(doc, 'editor');
          } else if (st === 'complete') {
            cleared++;
            e.playCustom(doc, 'editor');
          } else break;
          if (rand() < 0.0015) e.tp(e.info().level.exit.x, e.info().level.exit.y);
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
    S.note(`played ${played}, frames ${stepped}, caught ${caught}, cleared ${cleared}, refused as impossible ${impossible}`);
    return S.done();
  }

  /** Random editing with the mouse: every tool, undo, redo, delete, move. The level stays valid data. */
  async function editSoak(ops = 3000, seed = 11) {
    const S = suite('editSoak');
    const rand = xorshift(seed);
    await openFresh();
    const F = E().levelFormat;
    const toolIds = ['wall', 'erase', 'select', 'start', 'exit', 'monster'];
    let errors = [];
    let bad = 0;
    for (let i = 0; i < ops; i++) {
      try {
        const s = T.s();
        const rx = () => Math.floor(rand() * s.size.w);
        const ry = () => Math.floor(rand() * s.size.h);
        const r = rand();
        if (r < 0.1) T.tool(toolIds[Math.floor(rand() * toolIds.length)]);
        else if (r < 0.16) T.monster(Math.floor(rand() * s.choices.length));
        else if (r < 0.2) T.key('KeyZ', { ctrlKey: true });
        else if (r < 0.23) T.key('KeyY', { ctrlKey: true });
        else if (r < 0.25) T.key('Delete');
        else if (r < 0.27) T.key('Escape');
        else if (r < 0.6) T.click(rx(), ry(), rand() < 0.2 ? 2 : 0);
        else {
          const pts = [[rx(), ry()]];
          for (let k = 0; k < 3; k++) pts.push([rx(), ry()]);
          T.drag(pts, rand() < 0.15 ? 2 : 0);
        }
        if (T.dialogOpen()) T.answer('cancel');
        if (i % 50 === 0) {
          const doc = T.doc();
          const round = F.normalise(F.serialise(doc));
          if (!round.doc || round.notes.length || F.serialise(round.doc) !== F.serialise(doc)) bad++;
          const tiles = new Set();
          for (const en of doc.enemies) {
            const k = `${en.x},${en.y}`;
            if (tiles.has(k) || doc.walls[en.y][en.x] === '#') bad++;
            tiles.add(k);
          }
          if (doc.start && doc.walls[doc.start.y][doc.start.x] === '#') bad++;
          for (const ex of doc.exits) if (doc.walls[ex.y][ex.x] === '#') bad++;
          E().levelCheck.check(doc);
        }
      } catch (ex) {
        errors.push(String(ex && ex.stack));
        if (errors.length > 3) break;
      }
    }
    if (T.dialogOpen()) T.answer('cancel');
    S.check(`edit soak: ${ops} random actions, no exceptions`, errors.length === 0, errors);
    S.check('the level was valid data every time it was looked at (one per tile, nothing in walls, round-trips exactly)', bad === 0, bad);
    S.note(JSON.stringify({ walls: T.s().walls, enemies: T.s().enemies.length, undo: T.s().undo }));
    return S.done();
  }

  /**
   * Play a custom level the way a player who knows the way would: the real arrow keys, along the shortest path
   * to the exit (a BFS over the live map), never stopping; a ripple every `pingEvery` seconds (0 = none). It
   * proves a level can be finished, and how close the hunters came. -> { cleared, caught, seconds, by, minGap }
   */
  function bot(doc, o = {}) {
    const { mode = 'normal', maxSeconds = 90, pingEvery = 0 } = o;
    const e = E();
    const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code }));
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
    const release = () => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((c) => set(c, false));
    const mode0 = e.settings().mode;
    e.setMode(mode);
    const err = e.playCustom(doc, 'editor');
    if (err) return { error: err };
    const L = e.info().level;
    const ex = Math.floor(L.exit.x / 40);
    const ey = Math.floor(L.exit.y / 40);
    const toExit = bfsDist(L.blocked, L.W, L.H, ey * L.W + ex);
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
      let best = null;
      let bd = toExit[sy * L.W + sx];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = (sy + dy) * L.W + sx + dx;
        if (toExit[i] >= 0 && toExit[i] < bd) {
          bd = toExit[i];
          best = [sx + dx, sy + dy];
        }
      }
      const tx = best ? (best[0] + 0.5) * 40 : L.exit.x;
      const ty = best ? (best[1] + 0.5) * 40 : L.exit.y;
      set('ArrowRight', tx - p.x > 2.5);
      set('ArrowLeft', tx - p.x < -2.5);
      set('ArrowDown', ty - p.y > 2.5);
      set('ArrowUp', ty - p.y < -2.5);
      for (const m of I.enemies) {
        if (m.kind !== 'warden') continue;
        const d = bfsDist(L.blocked, L.W, L.H, Math.floor(m.y / 40) * L.W + Math.floor(m.x / 40))[sy * L.W + sx];
        if (d >= 0 && (out.minGap === null || d * 40 < out.minGap)) out.minGap = d * 40;
      }
      if (pingEvery > 0) {
        pingT -= 1 / 60;
        if (pingT <= 0) {
          pingT = pingEvery;
          key('Space', true);
          key('Space', false);
        }
      }
      e.step(1 / 60);
      out.seconds += 1 / 60;
    }
    release();
    out.seconds = +out.seconds.toFixed(2);
    e.leaveCustom();
    e.setMode(mode0);
    return out;
  }

  function clearAll() {
    const gone = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.indexOf('echomaze.') === 0) {
        gone.push(k);
        localStorage.removeItem(k);
      }
    }
    return gone;
  }

  return { T, gate, tools, validation, storage, untrusted, noWrites, soak, editSoak, bot, randomLevel, everyMonsterLevel, levelFrom, storageSnapshot, diffStorage, clearAll };
})();
