'use strict';

/**
 * SHARE CODE TESTS (v15.3). Load tools/editor-test.js, tools/editor-test-2.js and tools/bonus-test.js first (their
 * level makers and route player are used), then this, into a ?debug page:
 *   for (const f of ['tools/editor-test.js', 'tools/editor-test-2.js', 'tools/bonus-test.js', 'tools/share-test.js'])
 *     await new Promise((r) => { const s = document.createElement('script'); s.src = f + '?' + Date.now(); s.onload = r; document.head.appendChild(s); });
 * Each suite is async and returns { name, pass, fail, failed, notes }:
 *   ShareTest.format()      base 62, the check, inflate against the browser's own, determinism, the fallback
 *   ShareTest.roundTrips()  every sample and bonus level, a level with everything, random levels, folders of 5 and 20
 *   ShareTest.lengths()     how long codes really are
 *   ShareTest.bad()         typos, cut-off, garbage, empty, pasted with junk, newer versions, a bomb, oversized,
 *                           crafted payloads, hostile text - all refused or cleaned, nothing saved
 *   ShareTest.screens()     Share / Copy / Share folder / Enter code / Preview / Import through the real buttons,
 *                           duplicates, name clashes, the warnings in front of it all
 *   ShareTest.authors()     the creator name: into codes, onto imported levels, kept on re-share, gone on an edit
 *   ShareTest.plays()       imported levels play frame-for-frame like the originals
 *   ShareTest.noWrites()    no campaign data read into a code or written by any of it
 *   ShareTest.soak(n)       fuzzing: n mutated / random / crafted codes, and n random levels round-tripped
 * Suites write levels and folders: run them on a test page and clear it after.
 */
window.ShareTest = (() => {
  const E = () => window.__echo;
  const S = () => E().share;
  const F = () => E().levelFormat;
  const ST = () => E().levelStore;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  /** A level's data without the things a code never carries (id, dates) - to compare two levels. */
  const strip = (d) => {
    const c = JSON.parse(F().serialise(d));
    delete c.id;
    delete c.createdAt;
    delete c.updatedAt;
    return JSON.stringify(c);
  };
  const snapshot = () => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
    return o;
  };
  const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
  const P = () => ST().LEVEL_PREFIX.replace('level.', '');
  const clearLevels = () => {
    for (const k of Object.keys(snapshot())) if (k.startsWith(ST().LEVEL_PREFIX) || k === ST().FOLDERS_KEY) localStorage.removeItem(k);
  };
  const samples = async () => (await (await fetch('tools/sample-levels.json?' + Date.now())).json()).map((s) => F().normalise(s).doc);
  const playable = (d) => E().levelCheck.check(d).playable;
  const rnd = (seed) => {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /** A big level: 61 x 45 (the biggest size) - a full maze over all of it (a seeded depth-first maze, with loops). */
  function bigLevel() {
    const W0 = 61;
    const H0 = 45;
    const d = F().blank({ w: W0, h: H0, title: 'Big Maze' });
    const g = new Uint8Array(W0 * H0).fill(1);
    const r = rnd(12345);
    const stack = [[1, 1]];
    g[W0 + 1] = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => cx + dx > 0 && cy + dy > 0 && cx + dx < W0 - 1 && cy + dy < H0 - 1 && g[(cy + dy) * W0 + cx + dx]);
      if (!nb.length) {
        stack.pop();
        continue;
      }
      const [dx, dy] = nb[Math.floor(r() * nb.length)];
      g[(cy + dy / 2) * W0 + cx + dx / 2] = 0;
      g[(cy + dy) * W0 + cx + dx] = 0;
      stack.push([cx + dx, cy + dy]);
    }
    for (let k = 0; k < 120; k++) {
      const x = 1 + Math.floor(r() * (W0 - 2));
      const y = 1 + Math.floor(r() * (H0 - 2));
      if ((x + y) % 2 === 1) g[y * W0 + x] = 0; // knock a few walls through: loops
    }
    d.walls = F().encodeWalls(g, W0, H0);
    const free = [];
    for (let y = 1; y < 44; y++) for (let x = 1; x < 60; x++) if (!g[y * 61 + x]) free.push({ x, y });
    // start and exit far apart on the same open ground
    const W = 61;
    const dist = bfsDist(g, W, 45, free[0].y * W + free[0].x);
    let far = free[0];
    for (const p of free) if (dist[p.y * W + p.x] > dist[far.y * W + far.x]) far = p;
    d.start = { x: free[0].x, y: free[0].y };
    d.exits = [{ x: far.x, y: far.y, locked: false }];
    const kinds = ['echo', 'scent', 'stalker', 'echo', 'mimic', 'singer'];
    let n = 0;
    for (let i = 40; i < free.length && n < 6; i += Math.floor(free.length / 7)) {
      const p = free[i];
      if (dist[p.y * W + p.x] > 12 && !(p.x === far.x && p.y === far.y)) d.enemies.push({ kind: kinds[n++], x: p.x, y: p.y });
    }
    return F().normalise(F().toStorable(d)).doc;
  }
  /** A plain level written straight into a code - no cleaning, no checks: what a stranger could send. */
  async function crafted(plain, kind = 'L') {
    const bytes = S()._.packLevel(plain);
    return (await S()._.wrap(kind, bytes)).code;
  }
  async function craftedFolder(name, plains) {
    const w = S()._.writer();
    w.str(name);
    w.uint(plains.length);
    for (const p of plains) {
      const b = S()._.packLevel(p);
      w.uint(b.length);
      w.bytes(b);
    }
    return (await S()._.wrap('F', w.done())).code;
  }
  /** Any payload bytes, with a correct check: it passes the checksum and goes all the way to the parser. */
  function payloadCode(kind, payload) {
    const head = `ECHO1${kind}`;
    const ascii = Uint8Array.from(head, (c) => c.charCodeAt(0));
    return head + S()._.toBase62(payload) + S()._.checkChars(S()._.crc32([ascii, payload]));
  }
  const withMethod = (method, data) => {
    const p = new Uint8Array(data.length + 1);
    p[0] = method;
    p.set(data, 1);
    return p;
  };
  async function deflate(bytes) {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(bytes);
    w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }

  // ------------------------------------------------------------------ dialogs, through the real buttons
  const dlgOpen = () => E().dialog.isOpen();
  async function waitDialog(ms = 3000) {
    const t0 = performance.now();
    while (!dlgOpen() && performance.now() - t0 < ms) await sleep(10);
    await sleep(10);
    return dlgOpen();
  }
  function press(label) {
    const b = [...document.querySelectorAll('#dialog-buttons button')].find((x) => x.textContent === label);
    if (b) b.click();
    return !!b;
  }
  const dlg = () => ({ title: $('dialog-title').textContent, text: $('dialog-text').textContent, area: $('dialog-area').classList.contains('hidden') ? null : $('dialog-area').value, readonly: $('dialog-area').readOnly, status: $('dialog-status').textContent, buttons: [...document.querySelectorAll('#dialog-buttons button')].map((b) => b.textContent) });
  async function toList() {
    const s = E().info().state;
    if (dlgOpen()) press(dlg().buttons[dlg().buttons.length - 1]);
    if (s === 'play' || s === 'paused' || s === 'caught' || s === 'complete' || s === 'card') E().leaveCustom();
    if (E().info().state === 'editor') E().closeEditorScreens();
    localStorage.setItem(P() + 'editor', '1');
    E().features({ touch: false });
    E().openEditorScreens();
    await sleep(30);
  }

  // ------------------------------------------------------------------ suites
  async function format() {
    const T = suite('format');
    const r = rnd(7);
    let ok = true;
    for (let n = 0; n < 300; n++) {
      const b = Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
      const t = S()._.toBase62(b);
      const back = S()._.fromBase62(t);
      if (!/^[0-9A-Za-z]*$/.test(t) || back.length !== b.length || back.some((v, i) => v !== b[i])) ok = false;
    }
    T.check('base 62: 300 random lengths 0-299 round-trip, letters and digits only', ok);
    T.check('base 62: 8 bytes are 11 characters', S()._.toBase62(new Uint8Array(8).fill(255)).length === 11);
    T.check('CRC-32 is the standard one ("123456789" -> cbf43926)', S()._.crc32([Uint8Array.from('123456789', (c) => c.charCodeAt(0))]).toString(16) === 'cbf43926');
    // the fallback inflate against the browser's own compressor
    let same = 0;
    let tries = 0;
    for (let i = 0; i < 60; i++) {
      const n = Math.floor(r() * 5000);
      const b = Uint8Array.from({ length: n }, (_, j) => (i % 3 === 0 ? Math.floor(r() * 256) : i % 3 === 1 ? (j * 7) % 13 : r() < 0.8 ? 46 : 35));
      const z = await deflate(b);
      const back = S()._.inflate(z, 1 << 20);
      tries++;
      if (back.length === b.length && back.every((v, k) => v === b[k])) same++;
    }
    T.check(`the game's own inflate reads what the browser's deflate wrote: ${same}/${tries} (random, patterned, maze-like)`, same === tries);
    T.check("...and stops at its cap (no unbounded output)", (() => {
      try {
        S()._.inflate(new Uint8Array([0x63, 0x18, 0x05, 0xa3, 0x60, 0x14, 0x8c, 0x54, 0x00, 0x00]), 10);
        return false;
      } catch (e) {
        return e.why === 'tooBig' || e.why === 'damaged';
      }
    })());
    // determinism
    const d = (await samples())[6];
    const a1 = await S().encodeLevel(d);
    const a2 = await S().encodeLevel(d);
    const other = F().copy(d);
    other.id = 'some-other-id';
    other.createdAt = '2030-01-01T00:00:00.000Z';
    other.updatedAt = '2031-01-01T00:00:00.000Z';
    const a3 = await S().encodeLevel(other);
    const reread = F().normalise(F().serialise(d)).doc;
    const a4 = await S().encodeLevel(reread);
    T.check('the same level always makes the same code (twice; another id and dates; read back from storage)', a1.code === a2.code && a1.code === a3.code && a1.code === a4.code);
    T.check('a code starts ECHO1L (a folder ECHO1F) and is letters and digits only', /^ECHO1L[0-9A-Za-z]+$/.test(a1.code));
    // without the browser's compressor: a stored code, readable everywhere; a deflate code read by the fallback
    const big = bigLevel();
    const z = await S().encodeLevel(big);
    S()._.useBuiltIn(false);
    const st = await S().encodeLevel(big);
    const stSmall = await S().encodeLevel(d);
    const back1 = await S().decode(z.code);
    S()._.useBuiltIn(true);
    const back2 = await S().decode(st.code);
    T.check('no built-in compression: a big level is stored (method 0) and longer than with it', st.ok && st.code !== z.code && st.code.length > z.code.length, { stored: st.code.length, deflate: z.code.length });
    T.check('a small level: stored either way (deflate would only make it longer), so the same code', stSmall.code === a1.code);
    T.check('no built-in decompression: a deflate code is read by the fallback, the same level', back1.ok && strip(back1.levels[0]) === strip(big));
    T.check('a stored code reads back in a browser that has compression', back2.ok && strip(back2.levels[0]) === strip(big));
    T.check('the interface: decode / encodeLevel / encodeFolder / clean / contentKey / register, and v1 resolved offline', typeof S().register === 'function' && S().resolvers().some((x) => x.versions.includes(1)));
    // a later resolver for another version is used for that version only
    S().register({ id: 'test-v9', versions: [9], resolve: async () => ({ kind: 'level', folderName: '', levels: [JSON.parse(F().serialise(d))] }) });
    const v9 = await S().decode('ECHO9Labc');
    T.check('a registered resolver handles its own version (how short online codes could be added)', v9.ok && strip(v9.levels[0]) === strip(d));
    const v8 = await S().decode('ECHO8Labcdefghijkl');
    T.check('a version nobody resolves, newer than 1: "made in a newer version"', !v8.ok && v8.code === 'newer');
    return T.done();
  }

  async function roundTrips() {
    const T = suite('roundTrips');
    const all = [];
    for (const d of await samples()) if (playable(d)) all.push(['sample', d]);
    for (const it of E().bonus.list()) all.push(['bonus', E().bonus.get(it.id).doc]);
    const every = F().normalise(F().serialise(EditorTest2.everythingLevel())).doc;
    every.titleCard = 'Ünïcödé, "quotes" & emoji 🦇 in the card';
    every.objects.filter((o) => o.kind === 'note').forEach((o, i) => (o.text = `Note ${i}: a long-ish line with ünïcödé and 🦇 ${'x'.repeat(80)}`.slice(0, 140)));
    every.difficulty = { rating: 'custom', monsterSpeed: 0.75, rippleRange: 1.35, hearing: 0.6 };
    every.palette = 'contrast';
    every.authorName = 'Sam';
    all.push(['everything', every]);
    all.push(['big', bigLevel()]);
    for (const [what, d] of all) {
      const enc = await S().encodeLevel(d);
      const dec = enc.ok ? await S().decode(enc.code) : enc;
      T.check(`${what} "${d.title}": export -> import gives the same level (${enc.chars} chars)`, dec.ok && strip(dec.levels[0]) === strip(d), dec.ok ? null : dec.error);
    }
    const e = every;
    T.check('the everything level really has everything', e.exits.length >= 2 && e.exits.some((x) => x.locked) && ['puddle', 'decoy', 'key', 'note'].every((k) => e.objects.some((o) => o.kind === k)) && e.effects.length >= 2 && e.enemies.some((m) => m.variant) && e.titleCard && e.palette && e.difficulty.rating === 'custom');
    // random levels
    let rOk = 0;
    let rN = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const made = EditorTest2.randomLevel(rnd(seed));
      const d = made && F().normalise(F().serialise(made)).doc;
      if (!d || !playable(d)) continue;
      rN++;
      const dec = await S().decode((await S().encodeLevel(d)).code);
      if (dec.ok && strip(dec.levels[0]) === strip(d)) rOk++;
    }
    T.check(`random levels: ${rOk}/${rN} round-trip exactly`, rOk === rN && rN > 10);
    // folders, and the store's import
    const five = all.slice(0, 5).map((x) => x[1]);
    const fe = await S().encodeFolder('Five of them', five);
    const fd = await S().decode(fe.code);
    T.check(`a folder of five: same name, same levels in the same order (${fe.chars} chars)`, fd.ok && fd.kind === 'folder' && fd.folderName === 'Five of them' && fd.levels.length === 5 && fd.levels.every((l, i) => strip(l) === strip(five[i])));
    const twenty = [];
    for (let i = 0; i < 20; i++) twenty.push(all[i % all.length][1]);
    const te = await S().encodeFolder('Twenty', twenty);
    const td = te.ok ? await S().decode(te.code) : te;
    T.check(`a folder of twenty (the most): round-trips (${te.chars} chars)`, td.ok && td.levels.length === 20);
    clearLevels();
    const t0 = new Date().toISOString();
    const imp = ST().importShared(fd);
    const stored = imp.ok ? imp.ids.map((id) => ST().get(id).doc) : [];
    T.check('imported through the store: a new folder, five levels, each the same as its original', imp.ok && imp.folder && imp.folder.name === 'Five of them' && stored.length === 5 && stored.every((l, i) => strip(l) === strip(five[i])) && imp.ids.every((id) => ST().folderOf(id) === imp.folder.id));
    T.check('...with new ids and new dates', stored.every((l, i) => l.id !== five[i].id && l.createdAt >= t0 && l.updatedAt >= t0));
    const one = ST().importShared(await S().decode((await S().encodeLevel(every)).code));
    T.check('one level imported: in Unsorted, same content, creator name kept', one.ok && !one.folder && ST().folderOf(one.ids[0]) === null && strip(ST().get(one.ids[0]).doc) === strip(every) && ST().get(one.ids[0]).doc.authorName === 'Sam');
    T.check('the imported levels are ordinary levels: playable, not foreign, editable (no read-only flag)', ST().list().every((it) => it.playable && !it.foreign && !it.readOnly));
    clearLevels();
    // the test copy's sample codes (tools/sample-codes.txt) still read
    const lines = (await (await fetch('tools/sample-codes.txt?' + Date.now())).text()).split(/\r?\n/).filter((l) => / \| ECHO1/.test(l));
    const got = [];
    for (const l of lines) {
      const r = await S().decode(l.split(' | ')[1]);
      got.push(r.ok ? `${r.kind}:${r.folderName || r.levels[0].title}:${r.levels.length}` : r.error);
    }
    T.check('the sample codes in tools/sample-codes.txt read: Postcard, Postcards (3), Showcase (3)', got.join('|') === 'level:Postcard:1|folder:Postcards:3|folder:Showcase:3', got);
    return T.done();
  }

  async function lengths() {
    const T = suite('lengths');
    const s = await samples();
    const small = s.find((d) => d.title === 'First Steps');
    const tiny = F().normalise(F().toStorable(Object.assign(F().blank({ w: 11, h: 9, title: 'Tiny' }), { start: { x: 1, y: 1 }, exits: [{ x: 9, y: 7, locked: false }] }))).doc;
    const big = bigLevel();
    const every = F().normalise(F().serialise(EditorTest2.everythingLevel())).doc;
    const everyFull = F().copy(every);
    everyFull.objects.filter((o) => o.kind === 'note').forEach((o, i) => (o.text = `This is note ${i}, written out to the full hundred and forty characters a note may hold, so that the code is as long as one can be.`.slice(0, 140)));
    everyFull.titleCard = 'A title card line written out to the whole eighty characters it can have, too.';
    const bonus5 = E().bonus.list().slice(0, 5).map((it) => E().bonus.get(it.id).doc);
    const rows = [];
    const add = async (label, p) => {
      const r = await p;
      rows.push([label, r.ok ? r.chars : r.error]);
      return r;
    };
    await add(`tiny (11 x 9, nothing in it)`, S().encodeLevel(tiny));
    await add(`small: "First Steps" (21 x 17, one monster)`, S().encodeLevel(small));
    await add(`a bonus level: "Everything at Once" (35 x 25)`, S().encodeLevel(E().bonus.get('bonus-06-everything-at-once').doc));
    await add(`large: a 61 x 45 maze (the biggest size), six monsters`, S().encodeLevel(big));
    await add(`a level using everything (${every.size.w} x ${every.size.h})`, S().encodeLevel(every));
    await add('...with every note and the card written out in full', S().encodeLevel(everyFull));
    await add('a folder of five (bonus levels 1-5)', S().encodeFolder('Five', bonus5));
    S()._.useBuiltIn(false);
    await add('(no built-in compression) small', S().encodeLevel(small));
    await add('(no built-in compression) large 61 x 45', S().encodeLevel(big));
    await add('(no built-in compression) folder of five', S().encodeFolder('Five', bonus5));
    S()._.useBuiltIn(true);
    T.note(rows);
    T.check('every one fits the limit', rows.every((r) => typeof r[1] === 'number' && r[1] <= S().LIMITS.codeChars));
    return Object.assign(T.done(), { rows });
  }

  async function bad() {
    const T = suite('bad');
    clearLevels();
    localStorage.setItem(P() + 'editor', '1');
    const before = snapshot();
    const s = await samples();
    const good = (await S().encodeLevel(s[0])).code;
    const goodF = (await S().encodeFolder('Pair', [s[0], s[1]])).code;
    const expect = async (label, text, code, extra) => {
      const t0 = performance.now();
      const r = await S().decode(text);
      const ms = performance.now() - t0;
      T.check(`${label} -> ${code}`, !r.ok && r.code === code && typeof r.error === 'string' && r.error.length > 10 && ms < 2000, { got: r.code, error: r.error, ms: Math.round(ms) });
      if (extra) extra(r);
      return r;
    };
    const accept = async (label, text) => {
      const r = await S().decode(text);
      T.check(`${label} -> read`, r.ok && strip(r.levels[0]) === strip(s[0]), r.error);
    };
    // pasting
    await accept('surrounding spaces and line breaks', `\n\n   ${good}  \r\n`);
    await accept('broken over lines every 40 characters (as a chat app wraps it)', good.replace(/(.{40})/g, '$1\n'));
    await accept('spaces inside it', good.replace(/(.{7})/g, '$1 '));
    await accept('zero-width and other invisible characters inside it', good.replace(/(.{9})/g, '$1​').replace(/(.{13})/g, '$1﻿'));
    await accept('wrapped in backticks, quotes and a sentence', `here you go: \`${good}\` "enjoy"`.replace(/"enjoy"/, ''));
    await accept('wrapped in a code block', '```\n' + good + '\n```');
    await accept('the prefix in lower case (an app changed it)', 'echo1l' + good.slice(6));
    await accept('a soft hyphen where an app broke the word', good.slice(0, 50) + '­' + good.slice(50));
    // damage
    const flip = (str, i) => str.slice(0, i) + (str[i] === 'a' ? 'b' : 'a') + str.slice(i + 1);
    for (const i of [7, 20, Math.floor(good.length / 2), good.length - 3]) await expect(`one character mistyped at ${i}`, flip(good, i), 'damaged');
    for (const cut of [10, Math.floor(good.length / 2), good.length - 1]) await expect(`cut off after ${cut} characters`, good.slice(0, cut), 'damaged');
    await expect('two codes pasted together', good + good, 'damaged');
    await expect('the start missing', good.slice(6), 'notCode');
    await expect('empty', '', 'empty');
    await expect('only spaces', '   \n\t ', 'empty');
    await expect('garbage', 'hello this is not a code at all', 'notCode');
    await expect('ECHO and nothing else', 'ECHO1L', 'damaged');
    await expect('a folder code cut short', goodF.slice(0, goodF.length - 10), 'damaged');
    // versions
    await expect('a newer format version (ECHO2)', 'ECHO2' + good.slice(5), 'newer');
    await expect('a much newer one (ECHO37)', 'ECHO37' + good.slice(5), 'newer');
    await expect('an unknown kind letter', 'ECHO1X' + good.slice(6), 'damaged');
    const plain = JSON.parse(F().serialise(s[0]));
    await expect('a level of a newer schema inside', await crafted(Object.assign({}, plain, { schemaVersion: 3 })), 'newer');
    await expect('a monster this version has never heard of', await crafted(Object.assign({}, plain, { enemies: [{ kind: 'gargoyle', x: 3, y: 3 }] })), 'newer');
    {
      // a word number past the end of a list: written by hand (the encoder never does this)
      const b = S()._.packLevel(plain);
      const code = payloadCode('L', withMethod(0, b));
      T.check('control: a hand-wrapped stored code of a good level reads', (await S().decode(code)).ok);
    }
    // sizes
    await expect(`a code longer than ${S().LIMITS.codeChars} characters`, 'ECHO1L' + '0'.repeat(S().LIMITS.codeChars), 'tooBig');
    const zeros = new Uint8Array(8 * 1024 * 1024);
    const bomb = payloadCode('L', withMethod(1, await deflate(zeros)));
    T.note(`decompression bomb: ${bomb.length} characters that would unpack to 8 MB`);
    await expect('a decompression bomb (8 MB of zeros in a valid code)', bomb, bomb.length > S().LIMITS.codeChars ? 'tooBig' : 'tooBig');
    const smallBomb = payloadCode('L', withMethod(1, await deflate(new Uint8Array(400 * 1024))));
    await expect(`a smaller bomb (400 KB in ${smallBomb.length} characters)`, smallBomb, 'tooBig');
    const stored = payloadCode('L', withMethod(0, new Uint8Array(300 * 1024)));
    T.check(`(a stored 300 KB payload is ${stored.length} characters - over the length limit already)`, stored.length > S().LIMITS.codeChars);
    await expect('an unknown compression method', payloadCode('L', withMethod(7, new Uint8Array(20))), 'newer');
    const many = await craftedFolder('Too many', Array.from({ length: 21 }, () => plain));
    await expect('a folder code holding 21 levels', many, 'folderTooBig');
    T.check('encoding refuses 21 levels too', (await S().encodeFolder('x', Array.from({ length: 21 }, () => s[0]))).code === 'folderTooBig');
    // crafted payloads that pass the check
    const r = rnd(99);
    let refusedOk = 0;
    for (let i = 0; i < 200; i++) {
      const n = 1 + Math.floor(r() * 400);
      const bytes = Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
      const res = await S().decode(payloadCode(i % 2 ? 'F' : 'L', withMethod(i % 3 === 0 ? 1 : 0, bytes)));
      if (!res.ok && typeof res.error === 'string') refusedOk++;
    }
    T.check(`200 random payloads with a correct check (they reach the parser): ${refusedOk} refused cleanly`, refusedOk === 200);
    {
      const w = S()._.writer();
      w.uint(2);
      w.str('Huge');
      w.str('');
      w.uint(9999);
      w.uint(9999);
      await expect('a size far out of range (9999 x 9999, refused before anything is made)', payloadCode('L', withMethod(0, w.done())), 'damaged');
    }
    const lots = Object.assign({}, plain, { enemies: Array.from({ length: 41 }, (_, i) => ({ kind: 'echo', x: 1 + (i % 15), y: 1 + Math.floor(i / 15) })) });
    await expect('41 monsters (one over the limit)', await crafted(lots), 'damaged');
    // unplayable
    const noExit = Object.assign({}, plain, { exits: [] });
    await expect('a level that cannot be played', await crafted(noExit), 'unplayable', (res) => T.check('...says why', /can't be played: There is no exit/.test(res.error)));
    await expect('a folder with one level that cannot be played', await craftedFolder('Mixed', [plain, noExit, plain]), 'unplayable', (res) => T.check('...names it, and imports none', /Level 2 in this code/.test(res.error) && /Nothing was imported/.test(res.error), res.error));
    // hostile text
    const evil = '<img src=x onerror="window.__pwned=1">‮​malicious<script>window.__pwned=1</script>';
    const hostile = Object.assign({}, plain, {
      title: evil,
      authorName: '<b>Sam</b>‮gnp.exe',
      titleCard: evil,
      objects: [{ kind: 'note', x: 3, y: 1, text: evil, style: 'note' }],
    });
    const hostileCode = await crafted(hostile);
    const hr = await S().decode(hostileCode);
    const lv = hr.ok ? hr.levels[0] : null;
    const clean = (t) => typeof t === 'string' && !/[<>‪-‮​-‏⁦-⁩]/.test(t);
    T.check('hostile title, creator name, card and note: read, with every < > and direction / zero-width character gone', !!lv && clean(lv.title) && clean(lv.authorName) && clean(lv.titleCard) && lv.objects.every((o) => o.kind !== 'note' || clean(o.text)), lv && { title: lv.title, author: lv.authorName });
    const hf = await S().decode(await craftedFolder('<script>alert(1)</script>‮Folder', [hostile]));
    T.check('a hostile folder name: cleaned too', hf.ok && clean(hf.folderName), hf.folderName);
    // shown in the preview: plain text only, nothing ran
    await toList();
    window.__pwned = 0;
    const p = E().myLevels.enterCode(hostileCode);
    await waitDialog();
    $('dialog-area').value = hostileCode;
    press('Preview');
    await sleep(150);
    await waitDialog();
    T.check('the preview shows it as plain text: no element inside the dialog text, nothing ran', $('dialog-text').children.length === 0 && $('dialog-title').children.length === 0 && !window.__pwned && /malicious/.test(dlg().title), dlg().title);
    press('Cancel');
    await p;
    T.check('nothing at all was saved by any of it', diff(before, snapshot()).length === 0, diff(before, snapshot()));
    E().closeEditorScreens();
    return T.done();
  }

  async function screens() {
    const T = suite('screens');
    clearLevels();
    E().setCreatorName('');
    // the warnings: no way to Enter code without passing them
    localStorage.removeItem(P() + 'editor');
    const prog = localStorage.getItem(P() + 'progress');
    localStorage.setItem(P() + 'progress', JSON.stringify({ normal: 3 }));
    if (E().info().state === 'editor') E().closeEditorScreens();
    E().features({ touch: false });
    E().openEditorScreens();
    await sleep(20);
    T.check('locked editor: the spoiler warning first - My Levels (and Enter code) not on screen', E().editorScreen() === 'gate' && !$('mylevels').classList.contains('in'));
    E().closeEditorScreens();
    E().features({ touch: true });
    localStorage.setItem(P() + 'editor', '1');
    E().openEditorScreens();
    await sleep(20);
    T.check('touch controls on: the touch warning first', E().editorScreen() === 'touch' && !$('mylevels').classList.contains('in'));
    E().acceptTouchGate();
    E().closeEditorScreens();
    E().features({ touch: false });
    if (prog === null) localStorage.removeItem(P() + 'progress');
    else localStorage.setItem(P() + 'progress', prog);
    // a level to share
    const s = await samples();
    const mine = s.filter(playable).slice(0, 3);
    for (const d of mine) ST().save(d);
    ST().save(s.find((d) => !playable(d))); // an unfinished one
    await toList();
    E().myLevels.show('all', 'name');
    const row = [...$('mylevels-list').querySelectorAll('.lv-row')].find((r) => r.querySelector('b').textContent === mine[0].title);
    T.check('a playable level has Share; an unfinished one has it off', row && !row.querySelector('[data-act="share"]').disabled && [...$('mylevels-list').querySelectorAll('.lv-row.unfinished [data-act="share"]')].every((b) => b.disabled));
    row.querySelector('[data-act="share"]').click();
    await waitDialog();
    await sleep(100);
    const d1 = dlg();
    T.check('Share: the code in a read-only box, how long it is, Copy and Done', d1.area && /^ECHO1L/.test(d1.area) && d1.readonly && new RegExp(`${d1.area.length.toLocaleString('en-GB')} characters`).test(d1.text) && d1.buttons.join() === 'Copy,Done', d1);
    T.check('...and says what the code holds (no creator name set)', /holds the level and its title - nothing else/.test(d1.text));
    press('Copy');
    await sleep(200);
    const d2 = dlg();
    T.check('Copy: it says it copied - or that the code is selected for copying by hand - and stays open', dlgOpen() && /Copied|selected/.test(d2.status), d2.status);
    T.check('...and the whole code is selected in the box', $('dialog-area').selectionStart === 0 && $('dialog-area').selectionEnd === d1.area.length);
    T.note(`Copy said: "${d2.status}"`);
    press('Done');
    await sleep(30);
    // Enter code -> preview -> Cancel: nothing saved
    const before = snapshot();
    let p = E().myLevels.enterCode();
    await waitDialog();
    T.check('Enter code: an empty box to paste into, Preview and Cancel', dlg().area === '' && !dlg().readonly && dlg().buttons.join() === 'Preview,Cancel');
    $('dialog-area').value = `\n  ${d1.area.replace(/(.{50})/g, '$1\n')}  `;
    press('Preview');
    await sleep(150);
    await waitDialog();
    const pv = dlg();
    T.check('Preview: title, creator, size, monsters, exits, difficulty - and you already have it', /A level: "/.test(pv.title) && /No creator name/.test(pv.text) && / × /.test(pv.text) && /monster/.test(pv.text) && /exit/.test(pv.text) && /You already have this level/.test(pv.text) && pv.buttons.join() === 'Import anyway,Cancel', pv);
    press('Cancel');
    await p;
    T.check('Cancel: nothing saved', diff(before, snapshot()).length === 0);
    // import anyway
    p = E().myLevels.enterCode(d1.area);
    await waitDialog();
    press('Preview');
    await sleep(150);
    await waitDialog();
    press('Import anyway');
    await sleep(100);
    await waitDialog();
    T.check('Import anyway: "Imported", in Unsorted', /in Unsorted/.test(dlg().text));
    press('OK');
    const res = await p;
    T.check('...a second copy, a new id, shown in Unsorted', res && res.imported && ST().list().filter((it) => it.title === mine[0].title).length === 2 && E().myLevels.state().open === 'unsorted');
    // a folder: share it, with an unfinished draft skipped
    const fold = ST().createFolder('Mixed bag').folder;
    for (const it of ST().list()) ST().moveLevel(it.id, fold.id);
    await toList();
    E().myLevels.show(fold.id);
    const fb = [...$('mylevels-folderbar').querySelectorAll('button')].find((b) => b.textContent === 'Share folder');
    T.check('a folder has Share folder', !!fb && !fb.disabled);
    fb.click();
    await waitDialog();
    await sleep(100);
    const fd = dlg();
    T.check('Share folder: a folder code; which levels; the unfinished one skipped and why', /^ECHO1F/.test(fd.area) && /Not included/.test(fd.text) && /Half Built" - unfinished: There is no exit/.test(fd.text), fd.text);
    const folderCode = fd.area;
    press('Done');
    await sleep(30);
    // import it: the name is taken -> "Mixed bag (2)"
    p = E().myLevels.enterCode(folderCode);
    await waitDialog();
    press('Preview');
    await sleep(150);
    await waitDialog();
    const fp = dlg();
    T.check('folder preview: its name, a list of its levels, the new name because the name is taken', /A folder: "Mixed bag"/.test(fp.title) && /4 levels:/.test(fp.text) && /"Mixed bag \(2\)"/.test(fp.text) && /You already have 4 of these levels/.test(fp.text), fp.text);
    press('Import anyway');
    await sleep(100);
    await waitDialog();
    press('OK');
    const fr = await p;
    const f2 = ST().listFolders().find((f) => f.name === 'Mixed bag (2)');
    T.check('...a new folder "Mixed bag (2)" with the 4 levels, the first one untouched', !!f2 && f2.count === 4 && ST().listFolders().find((f) => f.name === 'Mixed bag').count === 5 && fr.folder.id === f2.id);
    // a folder too big to share
    const big = ST().createFolder('Huge').folder;
    for (let i = 0; i < 21; i++) {
      const d = F().copy(mine[i % 3]);
      d.id = F().newId();
      d.title = `Copy ${i}`;
      const r = ST().save(d);
      ST().moveLevel(r.doc.id, big.id);
    }
    await toList();
    E().myLevels.show(big.id);
    [...$('mylevels-folderbar').querySelectorAll('button')].find((b) => b.textContent === 'Share folder').click();
    await waitDialog();
    T.check('21 playable levels: too big to share, share it in smaller folders', /too big to share/.test(dlg().title) && /up to 20 levels/.test(dlg().text) && /smaller folders/.test(dlg().text), dlg());
    press('OK');
    // a bonus level: no Share; its copy: Share
    E().myLevels.setView('bonus');
    T.check('bonus levels have no Share button', !$('mylevels-list').querySelector('[data-act="share"]'));
    const c = ST().copyToMine('bonus', 'bonus-01-crossroads');
    E().myLevels.setView('mine');
    E().myLevels.show('unsorted');
    const crow = $('mylevels-list').querySelector(`.lv-row[data-id="${c.doc.id}"] [data-act="share"]`);
    T.check('...a copy made with Copy to My Levels has one', !!crow && !crow.disabled);
    // "by Sam" on an imported level
    E().setCreatorName('Sam');
    const samCode = (await S().encodeLevel(Object.assign(F().copy(mine[1]), { authorName: E().creatorName() }))).code;
    p = E().myLevels.enterCode(samCode);
    await waitDialog();
    press('Preview');
    await sleep(150);
    await waitDialog();
    T.check('preview names the creator', /By Sam/.test(dlg().text));
    press(dlg().buttons[0]);
    await sleep(100);
    await waitDialog();
    press('OK');
    await p;
    E().myLevels.show('unsorted');
    T.check('My Levels shows "by Sam" on it', [...$('mylevels-list').querySelectorAll('.lv-row')].some((r) => /^by Sam · /.test(r.querySelector('small').textContent)));
    // a bad code on screen: the friendly words, Try again keeps what was pasted
    p = E().myLevels.enterCode(samCode.slice(0, 60));
    await waitDialog();
    press('Preview');
    await sleep(150);
    await waitDialog();
    T.check('a cut-off code: "looks incomplete or damaged", Try again / Close', /incomplete or damaged/.test(dlg().text) && dlg().buttons.join() === 'Try again,Close');
    press('Try again');
    await waitDialog();
    T.check('...Try again: the box again, with what was pasted', dlg().area === samCode.slice(0, 60));
    press('Cancel');
    await p;
    E().setCreatorName('');
    E().closeEditorScreens();
    clearLevels();
    return T.done();
  }

  async function authors() {
    const T = suite('authors');
    clearLevels();
    const s = (await samples()).filter(playable);
    const read = async (code) => (await S().decode(code)).levels[0];
    E().setCreatorName('');
    T.check('the creator name is empty to begin with', E().creatorName() === '');
    E().setCreatorName('  Sam‮<b>  ');
    T.check('set: cleaned (no < >, no direction marks), kept in its own key', E().creatorName() === 'Samb' || E().creatorName() === 'Sam b' || E().creatorName() === 'Sam' || /^Sam/.test(E().creatorName()), E().creatorName());
    E().setCreatorName('Sam');
    T.check('stored under echomaze.creator, nowhere else', localStorage.getItem(P() + 'creator') === 'Sam');
    await toList();
    const mineDoc = ST().save(F().copy(s[0])).doc;
    E().openEditor(mineDoc);
    await sleep(20);
    T.check('the editor\'s Level settings show it, with the warning that it goes into every code', $('ed-creator').value === 'Sam' && /every code you share/.test($('ed-pane-settings').textContent));
    E().closeEditorScreens();
    // the player's own level: shared with their name; the level itself does not get it
    let code = (await (async () => {
      await toList();
      const pr = E().myLevels.share(mineDoc.id);
      await waitDialog();
      await sleep(80);
      const c = dlg().area;
      press('Done');
      await pr;
      return c;
    })());
    T.check('own level shared: the code carries "Sam"; the stored level does not', (await read(code)).authorName === 'Sam' && ST().get(mineDoc.id).doc.authorName === '');
    // imported, then re-shared after the player changed their own name: keeps Sam
    const imp = ST().importShared(await S().decode(code));
    E().setCreatorName('Alex');
    let pr = E().myLevels.share(imp.ids[0]);
    await waitDialog();
    await sleep(80);
    code = dlg().area;
    press('Done');
    await pr;
    T.check('imported from Sam, re-shared by Alex: still "Sam"', (await read(code)).authorName === 'Sam');
    // renamed: still Sam
    const r1 = ST().get(imp.ids[0]).doc;
    r1.title = 'Renamed it';
    ST().save(r1);
    T.check('renamed: still "Sam"', ST().get(imp.ids[0]).doc.authorName === 'Sam');
    // edited in the editor and saved: it is Alex's now
    E().openEditor(ST().get(imp.ids[0]).doc);
    await sleep(30);
    const st = E().editor.state ? E().editor.state() : null;
    const doc = E().editor.doc();
    // change one wall tile through the editor's own model, then save through the editor's store
    const tx = doc.size.w - 2;
    const ty = doc.size.h - 2;
    const rows = doc.walls.slice();
    rows[ty] = rows[ty].slice(0, tx) + (rows[ty][tx] === '#' ? '.' : '#') + rows[ty].slice(tx + 1);
    const changed = Object.assign(F().copy(doc), { walls: rows });
    E().closeEditorScreens();
    E().openEditor(changed);
    await sleep(20);
    $('ed-save').click();
    await sleep(50);
    T.check('its content changed in the editor and saved: no longer "Sam" (it is the player\'s now)', ST().get(imp.ids[0]).doc.authorName === '', { st, author: ST().get(imp.ids[0]).doc.authorName });
    E().closeEditorScreens();
    pr = E().myLevels.share(imp.ids[0]);
    await waitDialog();
    await sleep(80);
    code = dlg().area;
    press('Done');
    await pr;
    T.check('...so re-shared now, it carries "Alex"', (await read(code)).authorName === 'Alex');
    // what is in a code: no id, no date, nothing from the save
    const bytes = S()._.packLevel(Object.assign(F().copy(mineDoc), { authorName: 'Sam' }));
    const txt = new TextDecoder('latin1').decode(bytes);
    T.check('the packed level holds no id, no date, no save key', !txt.includes(mineDoc.id) && !/20\d\d-\d\d-\d\d/.test(txt) && !txt.includes('echomaze') && !txt.includes(mineDoc.createdAt));
    E().setCreatorName('');
    T.check('cleared: empty, the key gone', E().creatorName() === '' && localStorage.getItem(P() + 'creator') === null);
    clearLevels();
    return T.done();
  }

  async function plays() {
    const T = suite('plays');
    clearLevels();
    for (const it of E().bonus.list()) {
      const orig = E().bonus.get(it.id).doc;
      const imp = ST().importShared(await S().decode((await S().encodeLevel(orig)).code));
      const copy = ST().get(imp.ids[0]).doc;
      const route = BonusTest.ROUTES[it.id][0];
      const a = BonusTest.runRoute(it.id, route, 5, orig);
      const b = BonusTest.runRoute(it.id, route, 5, copy);
      T.check(`"${it.title}": the imported copy plays identically (frame hash ${a.hash.toString(16)}, ${a.cleared ? 'cleared' : 'not cleared'})`, a.hash === b.hash && a.cleared === b.cleared && a.seconds === b.seconds, { a: a.hash, b: b.hash });
      await sleep(0);
    }
    const every = F().normalise(F().serialise(EditorTest2.everythingLevel())).doc;
    const imp = ST().importShared(await S().decode((await S().encodeLevel(every)).code));
    const a = BonusTest.walk(every, [{ wait: 6 }, { exit: 0 }], { seed: 3, from: 'mylevels', dodge: true });
    const b = BonusTest.walk(ST().get(imp.ids[0]).doc, [{ wait: 6 }, { exit: 0 }], { seed: 3, from: 'mylevels', dodge: true });
    T.check('the everything level: imported copy identical frame for frame', a.hash === b.hash && a.seconds === b.seconds);
    clearLevels();
    return T.done();
  }

  async function noWrites() {
    const T = suite('noWrites');
    clearLevels();
    // a save with campaign data in it
    localStorage.setItem(P() + 'progress', JSON.stringify({ easy: 5, normal: 9, hard: 3, hardcore: 2 }));
    localStorage.setItem(P() + 'seen', JSON.stringify({ intro: 1, scent: 1 }));
    localStorage.setItem(P() + 'lore', JSON.stringify(['f01', 'f04']));
    const before = snapshot();
    const statsBefore = JSON.stringify(E().stats());
    const medalsBefore = JSON.stringify(E().medals());
    // reading: what does encode/decode touch? spy on localStorage
    const reads = [];
    const realGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      reads.push(k);
      return realGet.call(this, k);
    };
    const s = (await samples()).filter(playable);
    let codes;
    try {
      codes = [await S().encodeLevel(s[0]), await S().encodeFolder('F', s.slice(0, 3))];
      for (const c of codes) await S().decode(c.code);
    } finally {
      Storage.prototype.getItem = realGet;
    }
    T.check('making and reading codes reads nothing from storage at all', reads.length === 0, reads);
    const imp = ST().importShared(await S().decode(codes[1].code));
    const mid = snapshot();
    const changed = diff(before, mid);
    T.check('importing a folder writes only the new levels and the folder list', changed.every((k) => k.startsWith(ST().LEVEL_PREFIX) || k === ST().FOLDERS_KEY) && changed.length === 4, changed);
    // play an imported level: caught and finished
    const doc = ST().get(imp.ids[0]).doc;
    BonusTest.walk(doc, [{ exit: 0 }], { seed: 1, from: 'mylevels', dodge: true });
    BonusTest.walk(doc, [{ wait: 30 }], { seed: 2, from: 'mylevels', maxSeconds: 30 });
    T.check('playing it (finished, and left standing): nothing else written', diff(mid, snapshot()).length === 0, diff(mid, snapshot()));
    T.check('campaign progress, seen scenes, fragments, stats and medals untouched', ['progress', 'seen', 'lore', 'stats', 'medals'].every((k) => before[P() + k] === snapshot()[P() + k]) && JSON.stringify(E().stats()) === statsBefore && JSON.stringify(E().medals()) === medalsBefore);
    clearLevels();
    for (const k of ['progress', 'seen', 'lore']) localStorage.removeItem(P() + k);
    return T.done();
  }

  /** Fuzzing: mutated, random and crafted codes never throw or hang; random levels round-trip exactly. */
  async function soak(n = 2000, seed = 1) {
    const T = suite('soak');
    clearLevels();
    const before = snapshot();
    const r = rnd(seed);
    const s = (await samples()).filter(playable);
    const base = [];
    for (const d of s) base.push((await S().encodeLevel(d)).code);
    base.push((await S().encodeFolder('Soak', s.slice(0, 4))).code);
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz \n-_.<>"​';
    let threw = 0;
    let slow = 0;
    let accepted = 0;
    let refused = 0;
    let wrong = 0;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const c = base[Math.floor(r() * base.length)];
      let m = c;
      const kind = i % 6;
      if (kind === 0) for (let k = 0, x = 1 + Math.floor(r() * 4); k < x; k++) {
        const at = Math.floor(r() * m.length);
        m = m.slice(0, at) + chars[Math.floor(r() * chars.length)] + m.slice(at + 1);
      }
      else if (kind === 1) m = m.slice(0, Math.floor(r() * m.length));
      else if (kind === 2) {
        const at = Math.floor(r() * m.length);
        m = m.slice(0, at) + m.slice(at + 1 + Math.floor(r() * 5));
      } else if (kind === 3) m = Array.from({ length: Math.floor(r() * 400) }, () => chars[Math.floor(r() * chars.length)]).join('');
      else if (kind === 4) m = payloadCode(r() < 0.5 ? 'L' : 'F', withMethod(r() < 0.5 ? 0 : 1, Uint8Array.from({ length: Math.floor(r() * 600) }, () => Math.floor(r() * 256))));
      else {
        // a real payload with a few bytes changed, and a correct check: deep into the parser
        const body = c.slice(6, c.length - 6);
        let bytes;
        try {
          bytes = S()._.fromBase62(body);
        } catch (e) {
          bytes = new Uint8Array(1);
        }
        const raw = bytes[0] === 1 ? S()._.inflate(bytes.subarray(1), 1 << 20) : bytes.subarray(1);
        const mut = raw.slice();
        for (let k = 0; k < 1 + Math.floor(r() * 3); k++) mut[Math.floor(r() * mut.length)] = Math.floor(r() * 256);
        m = payloadCode(c[5], withMethod(0, mut));
      }
      const a = performance.now();
      let res;
      try {
        res = await S().decode(m);
      } catch (e) {
        threw++;
        continue;
      }
      if (performance.now() - a > 1000) slow++;
      if (res && res.ok) {
        accepted++;
        // accepted: then it is a real, checked, playable level - every one
        if (!res.levels.every((d) => E().levelCheck.check(d).playable && !/[<>]/.test(d.title))) wrong++;
      } else if (res && typeof res.error === 'string') refused++;
      else threw++;
      if (i % 200 === 0) await sleep(0);
    }
    T.check(`${n} fuzzed codes: none threw, none took over a second`, threw === 0 && slow === 0, { threw, slow });
    T.check(`...${refused} refused with a sentence, ${accepted} accepted (crafted with a correct check) - and every accepted one is a real, playable, clean level`, wrong === 0 && refused + accepted === n);
    T.note(`fuzz: ${n} codes in ${Math.round(performance.now() - t0)} ms; ${refused} refused, ${accepted} accepted`);
    // random levels round trip
    let rt = 0;
    let rn = 0;
    for (let k = 0; k < Math.min(n / 10, 300); k++) {
      const made = EditorTest2.randomLevel(rnd(seed * 1000 + k));
      const d = made && F().normalise(F().serialise(made)).doc;
      if (!d || !playable(d)) continue;
      rn++;
      const dec = await S().decode((await S().encodeLevel(d)).code);
      if (dec.ok && strip(dec.levels[0]) === strip(d)) rt++;
    }
    T.check(`${rn} random levels: all round-trip exactly`, rt === rn && rn > 0);
    T.check('nothing saved by any of it', diff(before, snapshot()).length === 0);
    return T.done();
  }

  return { format, roundTrips, lengths, bad, screens, authors, plays, noWrites, soak, crafted, craftedFolder, payloadCode, strip };
})();
