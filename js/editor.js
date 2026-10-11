'use strict';

/**
 * THE LEVEL EDITOR (v15.0) - part 1 of 3: the core editor. Mouse only, and levels are private (part 2 adds more
 * objects, effects and polish; part 3 sharing).
 *
 * It edits a MODEL of its own - a wall grid and the things placed on it - and turns that into the saved format
 * (js/levelformat.js) only to save it or to test it, so the format never depends on the editor. It never touches
 * the game either: it asks `env` for everything - saving (js/levelstore.js), test-playing, going back, a click's
 * sound. What it shows as wrong comes from js/levelcheck.js, the same rule the engine plays by. The monsters it
 * offers come from the game's own list (monsterChoices / MONSTER_TYPES in js/level.js), so a monster added to the
 * game appears here by itself.
 *
 * Tools (the mouse does everything; a few keys are shortcuts, never the only way):
 *   Wall     drag to draw walls; right-drag rubs walls out. It never builds over something placed.
 *   Erase    drag to clear tiles back to floor - walls and anything standing on them.
 *   Select   drag a box around part of the level, then drag the box: its walls and everything in it move. Where
 *            it lands its tiles replace what was there - but never over something placed outside the box (the
 *            box turns red and will not drop there). Dragging one placed thing moves just that.
 *   Start / Exit   click a tile (a wall there is cleared) - or drag to slide it.
 *   Monster  click a floor tile to place the monster picked in the list; drag one to move it; right-click one
 *            (or select it and press Delete) to take it away.
 *   Undo / Redo (Ctrl+Z / Ctrl+Y), Clear all (asks first), the title, the size.
 */
const EchoEditor = (() => {
  const TAU = Math.PI * 2;
  const HISTORY_MAX = 200;
  const ART_T = 0.9; // the art's clock: the editor's drawings hold still
  const TOOLS = [
    { id: 'wall', label: 'Wall', tip: 'Drag to draw walls. Right-drag to rub them out.' },
    { id: 'erase', label: 'Erase', tip: 'Drag to clear tiles back to floor: walls, and anything on them.' },
    { id: 'select', label: 'Select', tip: 'Drag a box around part of the level, then drag the box to move it. Or drag one thing to move it.' },
    { id: 'start', label: 'Start', tip: 'Click a tile to put the start there.' },
    { id: 'exit', label: 'Exit', tip: 'Click a tile to put the exit there.' },
    { id: 'monster', label: 'Monster', tip: 'Click a floor tile to place the monster picked below. Drag one to move it; right-click one to take it away.' },
  ];
  const SIZES = [
    { label: 'Small', w: 21, h: 15 },
    { label: 'Medium', w: 31, h: 21 },
    { label: 'Large', w: 41, h: 29 },
    { label: 'Huge', w: 51, h: 35 },
  ];
  const INK = '207,233,245';

  /**
   * One placeable thing's picture, centred on (x, y) at radius r - the very art a ripple lights it up with in the
   * game (js/art.js, and js/warden.js for the hunters). Used for the map and for the list of monsters.
   */
  function drawArt(ctx, c, x, y, r, a = 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (c.art === 'hunter') {
      EchoWarden.drawHunter(ctx, x, y, r, { a, t: ART_T, h: 0, variant: c.variant });
    } else if (c.art === 'mimic') {
      EchoArt.mimicMorph(ctx, x, y, r, 0.5, { a, t: ART_T }); // half way between the way out and what it really is
    } else if (c.art) {
      EchoArt.draw(ctx, c.art, x, y, r, { a, t: ART_T, h: 0, seed: EchoArt.seedOf(17, 5) });
    } else {
      // never drawn in the game: a hollow ring with a dash through it, in its colour - the shape of its sound cue
      const rgb = EchoPalette.rgb(c.role || 'wall');
      ctx.strokeStyle = `rgba(${rgb},${0.9 * a})`;
      ctx.lineWidth = Math.max(1.2, r * 0.14);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.6, 0, TAU);
      ctx.moveTo(x - r * 0.95, y);
      ctx.lineTo(x + r * 0.95, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function create(env) {
    const el = env.el;
    const cv = el.canvas;
    const g = cv.getContext('2d');
    const LIMITS = EchoLevelFormat.LIMITS;

    let m = null; // the level being edited (see fromDoc)
    let tool = 'wall';
    let choices = []; // what the Monster tool can place (monsterChoices)
    let choice = 0;
    let past = []; // undo: snapshots, oldest first
    let future = []; // redo
    let pending = null; // the snapshot taken when the current change began
    let saved = null; // the level as it was when last saved or opened
    let everSaved = false;
    let sel = null; // the Select tool's box: { x0, y0, x1, y1 } in tiles
    let picked = -1; // the monster picked out (its index), or -1
    let drag = null;
    let hover = null; // the tile under the mouse
    let verdict = { playable: false, errors: [], warnings: [] };
    let view = { tile: 20, ox: 0, oy: 0, dpr: 1 };
    let message = '';
    let messageTimer = 0;
    let flashTimer = 0;

    // ---------------------------------------------------------------- the model
    function fromDoc(doc) {
      return {
        id: doc.id,
        title: doc.title,
        authorName: doc.authorName || '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        w: doc.size.w,
        h: doc.size.h,
        walls: EchoLevelFormat.wallGrid(doc),
        start: doc.start ? { x: doc.start.x, y: doc.start.y } : null,
        exit: doc.exit ? { x: doc.exit.x, y: doc.exit.y } : null,
        enemies: doc.enemies.map((e) => ({ kind: e.kind, variant: e.variant || null, x: e.x, y: e.y })),
      };
    }

    /** The level as saved data (js/levelformat.js) - what Save stores and Test play is given. */
    function toDoc() {
      return {
        format: EchoLevelFormat.FORMAT,
        schemaVersion: EchoLevelFormat.SCHEMA_VERSION,
        id: m.id,
        title: EchoLevelFormat.cleanTitle(m.title),
        authorName: m.authorName,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        size: { w: m.w, h: m.h },
        walls: EchoLevelFormat.encodeWalls(m.walls, m.w, m.h),
        start: m.start ? { x: m.start.x, y: m.start.y } : null,
        exit: m.exit ? { x: m.exit.x, y: m.exit.y } : null,
        enemies: m.enemies.map((e) => (e.variant ? { kind: e.kind, variant: e.variant, x: e.x, y: e.y } : { kind: e.kind, x: e.x, y: e.y })),
        extra: {},
        extraEnemies: [],
      };
    }

    // ---------------------------------------------------------------- history
    const pt = (p) => (p ? { x: p.x, y: p.y } : null);
    const samePt = (a, b) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y);
    const snap = () => ({ w: m.w, h: m.h, walls: m.walls.slice(), start: pt(m.start), exit: pt(m.exit), enemies: m.enemies.map((e) => ({ ...e })), title: m.title });
    function same(a, b) {
      if (a.w !== b.w || a.h !== b.h || a.title !== b.title || !samePt(a.start, b.start) || !samePt(a.exit, b.exit)) return false;
      if (a.enemies.length !== b.enemies.length) return false;
      for (let i = 0; i < a.enemies.length; i++) {
        const p = a.enemies[i];
        const q = b.enemies[i];
        if (p.kind !== q.kind || p.variant !== q.variant || p.x !== q.x || p.y !== q.y) return false;
      }
      for (let i = 0; i < a.walls.length; i++) if (a.walls[i] !== b.walls[i]) return false;
      return true;
    }
    function restore(s) {
      m.w = s.w;
      m.h = s.h;
      m.walls = s.walls.slice();
      m.start = pt(s.start);
      m.exit = pt(s.exit);
      m.enemies = s.enemies.map((e) => ({ ...e }));
      m.title = s.title;
      el.title.value = m.title;
      sel = null;
      picked = -1;
    }
    /** A change is about to start (a stroke, a click, a move...): remember how it was. */
    function begin() {
      if (!pending) pending = snap();
    }
    /** ...and it is finished: one step of undo, if anything really changed. */
    function commit() {
      if (!pending) return;
      const before = pending;
      pending = null;
      if (!same(before, snap())) {
        past.push(before);
        if (past.length > HISTORY_MAX) past.shift();
        future = [];
      }
      changed();
    }
    function cancelChange() {
      if (!pending) return;
      restore(pending);
      pending = null;
      changed();
    }
    function undo() {
      commit();
      if (!past.length) return;
      future.push(snap());
      restore(past.pop());
      changed();
    }
    function redo() {
      commit();
      if (!future.length) return;
      past.push(snap());
      restore(future.pop());
      changed();
    }
    const dirty = () => !!m && !!saved && !same(saved, snap());

    // ---------------------------------------------------------------- what is where
    const inGrid = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
    const wallAt = (x, y) => m.walls[y * m.w + x] === 1;
    const enemyAt = (x, y) => m.enemies.findIndex((e) => e.x === x && e.y === y);
    const isAt = (p, x, y) => !!p && p.x === x && p.y === y;
    function thingAt(x, y) {
      if (isAt(m.start, x, y)) return { what: 'start' };
      if (isAt(m.exit, x, y)) return { what: 'exit' };
      const i = enemyAt(x, y);
      return i >= 0 ? { what: 'enemy', index: i } : null;
    }
    const sameThing = (a, b) => !!a && !!b && a.what === b.what && (a.what !== 'enemy' || a.index === b.index);
    const choiceOf = (e) => choices.find((c) => c.kind === e.kind && (c.variant || null) === (e.variant || null)) || { kind: e.kind, variant: e.variant, label: e.kind, art: null, role: 'wall' };
    function nameOf(t) {
      if (!t) return '';
      if (t.what === 'start') return 'the start';
      if (t.what === 'exit') return 'the exit';
      return 'a monster';
    }

    // ---------------------------------------------------------------- edits
    function setWall(x, y, on) {
      if (!inGrid(x, y) || wallAt(x, y) === !!on) return;
      if (on && thingAt(x, y)) {
        say(`Can't build a wall on ${nameOf(thingAt(x, y))}.`);
        return;
      }
      m.walls[y * m.w + x] = on ? 1 : 0;
    }
    function eraseTile(x, y) {
      if (!inGrid(x, y)) return;
      m.walls[y * m.w + x] = 0;
      const i = enemyAt(x, y);
      if (i >= 0) removeEnemy(i);
      if (isAt(m.start, x, y)) m.start = null;
      if (isAt(m.exit, x, y)) m.exit = null;
    }
    /** The Start / Exit tools: put it here. A wall here is cleared; a monster or the other one is in the way. */
    function placePoint(what, x, y) {
      if (!inGrid(x, y) || isAt(m[what], x, y)) return false;
      const t = thingAt(x, y);
      if (t) {
        say(`${nameOf(t).replace(/^./, (c) => c.toUpperCase())} is already there.`);
        return false;
      }
      m.walls[y * m.w + x] = 0;
      m[what] = { x, y };
      return true;
    }
    function addEnemy(c, x, y) {
      if (!inGrid(x, y)) return -1;
      if (m.enemies.length >= LIMITS.enemies) {
        say(`A level can hold ${LIMITS.enemies} monsters at most.`);
        return -1;
      }
      if (wallAt(x, y)) {
        say('Monsters go on floor tiles.');
        return -1;
      }
      const t = thingAt(x, y);
      if (t) {
        say(`${nameOf(t).replace(/^./, (ch) => ch.toUpperCase())} is already there.`);
        return -1;
      }
      m.enemies.push({ kind: c.kind, variant: c.variant || null, x, y });
      return m.enemies.length - 1;
    }
    function removeEnemy(i) {
      m.enemies.splice(i, 1);
      if (picked === i) picked = -1;
      else if (picked > i) picked--;
    }
    /** Slide one placed thing to a tile: only onto empty floor (or where it already is). */
    function moveThing(t, x, y) {
      if (!inGrid(x, y) || wallAt(x, y)) return false;
      const here = thingAt(x, y);
      if (here && !sameThing(here, t)) return false;
      if (t.what === 'enemy') {
        m.enemies[t.index].x = x;
        m.enemies[t.index].y = y;
      } else m[t.what] = { x, y };
      return true;
    }

    // the Select tool's box
    const inRect = (r, x, y) => !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    const rectOf = (a, b) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
    /** What the box holds: its walls, and every placed thing inside it (relative to its corner). */
    function lift(r) {
      const bw = r.x1 - r.x0 + 1;
      const bh = r.y1 - r.y0 + 1;
      const block = { w: bw, h: bh, walls: new Uint8Array(bw * bh), things: [] };
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) block.walls[y * bw + x] = m.walls[(r.y0 + y) * m.w + r.x0 + x];
      if (m.start && inRect(r, m.start.x, m.start.y)) block.things.push({ what: 'start', dx: m.start.x - r.x0, dy: m.start.y - r.y0 });
      if (m.exit && inRect(r, m.exit.x, m.exit.y)) block.things.push({ what: 'exit', dx: m.exit.x - r.x0, dy: m.exit.y - r.y0 });
      m.enemies.forEach((e, i) => {
        if (inRect(r, e.x, e.y)) block.things.push({ what: 'enemy', index: i, e: { ...e }, dx: e.x - r.x0, dy: e.y - r.y0 });
      });
      return block;
    }
    /** Can the lifted box land with its corner at (ox, oy)? Never on top of something placed outside it. */
    function canDrop(r, block, ox, oy) {
      const blocked = (x, y) => {
        if (x < ox || y < oy || x >= ox + block.w || y >= oy + block.h) return false;
        if (block.walls[(y - oy) * block.w + (x - ox)]) return true;
        return block.things.some((t) => ox + t.dx === x && oy + t.dy === y);
      };
      if (m.start && !inRect(r, m.start.x, m.start.y) && blocked(m.start.x, m.start.y)) return false;
      if (m.exit && !inRect(r, m.exit.x, m.exit.y) && blocked(m.exit.x, m.exit.y)) return false;
      return !m.enemies.some((e) => !inRect(r, e.x, e.y) && blocked(e.x, e.y));
    }
    function dropBlock(r, block, ox, oy) {
      // what it leaves behind is floor, with nothing on it
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) m.walls[y * m.w + x] = 0;
      if (m.start && inRect(r, m.start.x, m.start.y)) m.start = null;
      if (m.exit && inRect(r, m.exit.x, m.exit.y)) m.exit = null;
      m.enemies = m.enemies.filter((e) => !inRect(r, e.x, e.y));
      // where it lands, its tiles take over
      for (let y = 0; y < block.h; y++) for (let x = 0; x < block.w; x++) m.walls[(oy + y) * m.w + ox + x] = block.walls[y * block.w + x];
      for (const t of block.things) {
        const x = ox + t.dx;
        const y = oy + t.dy;
        if (t.what === 'enemy') m.enemies.push({ ...t.e, x, y });
        else m[t.what] = { x, y };
      }
      sel = { x0: ox, y0: oy, x1: ox + block.w - 1, y1: oy + block.h - 1 };
      picked = -1;
    }
    /** Where the box would land, dragged from tile `from` to tile `to` (kept inside the level). */
    function dropAt(r, from, to) {
      const bw = r.x1 - r.x0 + 1;
      const bh = r.y1 - r.y0 + 1;
      return { ox: Math.max(0, Math.min(m.w - bw, r.x0 + to.x - from.x)), oy: Math.max(0, Math.min(m.h - bh, r.y0 + to.y - from.y)) };
    }
    function clearRect(r) {
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) eraseTile(x, y);
    }

    function deleteSelected() {
      if (picked >= 0) {
        begin();
        removeEnemy(picked);
        commit();
      } else if (sel) {
        begin();
        clearRect(sel);
        commit();
      }
    }

    // ---------------------------------------------------------------- whole-level actions
    async function clearAll() {
      env.click();
      const r = await env.dialog.open({
        title: 'Clear everything?',
        text: 'Every wall, the start, the exit and every monster will be removed. Undo brings it all back.',
        buttons: [{ id: 'clear', label: 'Clear all', primary: true, danger: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id !== 'clear' || !m) return;
      begin();
      m.walls = EchoLevelFormat.wallGrid(EchoLevelFormat.blank({ w: m.w, h: m.h }));
      m.start = null;
      m.exit = null;
      m.enemies = [];
      sel = null;
      picked = -1;
      commit();
      say('Cleared. Undo brings it back.');
    }

    async function setSize(w, h) {
      if (!m || (w === m.w && h === m.h)) return;
      const outside = (p) => !!p && (p.x >= w || p.y >= h);
      let lost = outside(m.start) || outside(m.exit) || m.enemies.some(outside);
      for (let y = 0; y < m.h && !lost; y++) {
        for (let x = 0; x < m.w; x++) {
          const ring = x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1;
          if ((x >= w || y >= h) && wallAt(x, y) && !ring) {
            lost = true;
            break;
          }
        }
      }
      if (lost) {
        const r = await env.dialog.open({
          title: 'Make it smaller?',
          text: 'Anything outside the new size will be cut off. Undo brings it back.',
          buttons: [{ id: 'resize', label: 'Make it smaller', primary: true }, { id: 'cancel', label: 'Cancel' }],
          cancel: 'cancel',
        });
        if (r.id !== 'resize') {
          sizeUi();
          return;
        }
      }
      begin();
      // anchored at the top left; new ground is solid wall, ready to be dug into
      const walls = new Uint8Array(w * h).fill(1);
      for (let y = 0; y < Math.min(h, m.h); y++) for (let x = 0; x < Math.min(w, m.w); x++) walls[y * w + x] = m.walls[y * m.w + x];
      const grew = w > m.w || h > m.h;
      m.w = w;
      m.h = h;
      m.walls = walls;
      if (outside(m.start)) m.start = null;
      if (outside(m.exit)) m.exit = null;
      m.enemies = m.enemies.filter((e) => !outside(e));
      sel = null;
      picked = -1;
      commit();
      if (grew) say('The new space is solid wall. Use Erase to open it up.');
    }

    async function save() {
      commit();
      m.title = EchoLevelFormat.cleanTitle(m.title);
      el.title.value = m.title;
      const res = env.store.save(toDoc());
      if (!res.ok) {
        await env.dialog.open({ title: "Couldn't save", text: res.error, buttons: [{ id: 'ok', label: 'OK', primary: true }] });
        return false;
      }
      m.id = res.doc.id;
      m.createdAt = res.doc.createdAt;
      m.updatedAt = res.doc.updatedAt;
      saved = snap();
      everSaved = true;
      say(verdict.playable ? 'Saved.' : 'Saved as unfinished. It can be played once the problems below are fixed.');
      refreshUi();
      return true;
    }

    function testPlay() {
      commit();
      if (!verdict.playable) {
        flashProblems();
        say('Fix the problems below first, then test it.');
        return;
      }
      const err = env.testPlay(toDoc());
      if (err) say(err);
    }

    async function leave() {
      commit();
      if (dirty()) {
        const r = await env.dialog.open({
          title: 'Save your changes?',
          text: everSaved ? 'This level has changes that have not been saved.' : 'This level has not been saved yet.',
          buttons: [{ id: 'save', label: 'Save', primary: true }, { id: 'discard', label: "Don't save" }, { id: 'cancel', label: 'Cancel' }],
          cancel: 'cancel',
        });
        if (r.id === 'cancel') return;
        if (r.id === 'save' && !(await save())) return;
      }
      env.back();
    }

    // ---------------------------------------------------------------- the mouse
    function tileAt(ev) {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((ev.clientX - r.left - view.ox) / view.tile);
      const y = Math.floor((ev.clientY - r.top - view.oy) / view.tile);
      return { x, y, inside: inGrid(x, y) };
    }

    /** Every tile on the straight line between two tiles, so a fast stroke leaves no gaps. */
    function line(a, b, fn) {
      let x = a.x;
      let y = a.y;
      const dx = Math.abs(b.x - x);
      const dy = -Math.abs(b.y - y);
      const sx = x < b.x ? 1 : -1;
      const sy = y < b.y ? 1 : -1;
      let err = dx + dy;
      for (let guard = 0; guard < 400; guard++) {
        fn(x, y);
        if (x === b.x && y === b.y) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
    }

    function onDown(ev) {
      if (!m || !env.visible() || (ev.button !== 0 && ev.button !== 2)) return;
      ev.preventDefault();
      if (document.activeElement === el.title) el.title.blur(); // (finishes a title being typed: its own undo step)
      if (drag) return;
      const p = tileAt(ev);
      const right = ev.button === 2;
      if (!p.inside) {
        if (tool === 'select') {
          sel = null;
          picked = -1;
          render();
          refreshUi();
        }
        return;
      }
      switch (tool) {
        case 'wall':
          begin();
          drag = { kind: 'paint', on: !right, last: p };
          setWall(p.x, p.y, !right);
          break;
        case 'erase':
          begin();
          drag = { kind: 'erase', last: p };
          eraseTile(p.x, p.y);
          break;
        case 'start':
        case 'exit':
          if (right) break;
          begin();
          drag = { kind: 'place', what: tool };
          placePoint(tool, p.x, p.y);
          break;
        case 'monster': {
          const i = enemyAt(p.x, p.y);
          if (right) {
            if (i >= 0) {
              begin();
              removeEnemy(i);
              commit();
            }
            break;
          }
          if (i >= 0) {
            picked = i;
            begin();
            drag = { kind: 'thing', thing: { what: 'enemy', index: i } };
            break;
          }
          const c = choices[choice];
          if (!c) break;
          begin();
          const k = addEnemy(c, p.x, p.y);
          if (k >= 0) picked = k;
          commit();
          break;
        }
        case 'select': {
          if (right) {
            const i = enemyAt(p.x, p.y);
            if (i >= 0) {
              begin();
              removeEnemy(i);
              commit();
            }
            break;
          }
          if (sel && inRect(sel, p.x, p.y)) {
            drag = { kind: 'move', from: p, rect: sel, block: lift(sel), to: dropAt(sel, p, p) };
            break;
          }
          const t = thingAt(p.x, p.y);
          if (t) {
            sel = null;
            picked = t.what === 'enemy' ? t.index : -1;
            begin();
            drag = { kind: 'thing', thing: t };
            break;
          }
          sel = null;
          picked = -1;
          drag = { kind: 'box', from: p, to: p };
          break;
        }
        default:
          break;
      }
      render();
      refreshUi();
    }

    function onMove(ev) {
      if (!m || !env.visible()) return;
      const p = tileAt(ev);
      const was = hover;
      hover = p.inside ? { x: p.x, y: p.y } : null;
      if (drag) {
        const q = { x: Math.max(0, Math.min(m.w - 1, p.x)), y: Math.max(0, Math.min(m.h - 1, p.y)) };
        if (drag.kind === 'paint') {
          if (p.inside) line(drag.last, q, (x, y) => setWall(x, y, drag.on));
          drag.last = q;
        } else if (drag.kind === 'erase') {
          if (p.inside) line(drag.last, q, eraseTile);
          drag.last = q;
        } else if (drag.kind === 'place') {
          if (p.inside) placePoint(drag.what, q.x, q.y);
        } else if (drag.kind === 'thing') {
          if (p.inside) moveThing(drag.thing, q.x, q.y);
        } else if (drag.kind === 'box') {
          drag.to = q;
        } else if (drag.kind === 'move') {
          drag.to = dropAt(drag.rect, drag.from, q);
        }
        render();
        refreshUi();
      } else if (!samePt(was, hover)) {
        render();
        refreshHint();
        cv.style.cursor = cursorFor(hover);
      }
    }

    function onUp() {
      if (!drag || !m) return;
      const d = drag;
      drag = null;
      if (d.kind === 'box') {
        sel = rectOf(d.from, d.to);
      } else if (d.kind === 'move') {
        const { ox, oy } = d.to;
        if (ox !== d.rect.x0 || oy !== d.rect.y0) {
          if (canDrop(d.rect, d.block, ox, oy)) {
            begin();
            dropBlock(d.rect, d.block, ox, oy);
          } else say('It would land on something placed. Move that first, or drop the box somewhere else.');
        }
      }
      commit();
      render();
      refreshUi();
    }

    function cursorFor(p) {
      if (!p) return 'default';
      if (tool === 'select') return sel && inRect(sel, p.x, p.y) ? 'move' : thingAt(p.x, p.y) ? 'grab' : 'crosshair';
      if (tool === 'monster' && enemyAt(p.x, p.y) >= 0) return 'grab';
      return 'crosshair';
    }

    cv.addEventListener('mousedown', onDown);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mouseleave', () => {
      if (!m || drag) return;
      hover = null;
      render();
      refreshHint();
    });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', () => {
      if (drag) onUp(); // the mouse went up somewhere this page never heard about
    });
    window.addEventListener('resize', () => {
      if (m && env.visible()) render();
    });

    // ---------------------------------------------------------------- keys (shortcuts only)
    function key(e) {
      if (!m) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.code === 'KeyY') {
        e.preventDefault();
        redo();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (drag) {
          drag = null;
          cancelChange();
        } else if (sel || picked >= 0) {
          sel = null;
          picked = -1;
          render();
          refreshUi();
        } else leave();
      }
    }

    // ---------------------------------------------------------------- drawing
    function layout() {
      const r = el.stage.getBoundingClientRect();
      const cssW = Math.floor(r.width);
      const cssH = Math.floor(r.height);
      if (cssW < 40 || cssH < 40) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.floor(cssW * dpr) || cv.height !== Math.floor(cssH * dpr)) {
        cv.width = Math.floor(cssW * dpr);
        cv.height = Math.floor(cssH * dpr);
        cv.style.width = `${cssW}px`;
        cv.style.height = `${cssH}px`;
      }
      const pad = 12;
      const tile = Math.max(4, Math.min(44, Math.floor(Math.min((cssW - 2 * pad) / m.w, (cssH - 2 * pad) / m.h))));
      view = { tile, ox: Math.floor((cssW - tile * m.w) / 2), oy: Math.floor((cssH - tile * m.h) / 2), dpr };
      return true;
    }
    const cx = (x) => view.ox + (x + 0.5) * view.tile;
    const cy = (y) => view.oy + (y + 0.5) * view.tile;

    /** Walls as the game shows them: dim stone, with a bright line along every face that meets floor. */
    function drawWalls(walls, w, h, bx, by, a) {
      const T = view.tile;
      const rgb = EchoPalette.rgb('wall');
      g.fillStyle = `rgba(${rgb},${0.22 * a})`;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (walls[y * w + x]) g.fillRect(view.ox + (bx + x) * T, view.oy + (by + y) * T, T, T);
      g.strokeStyle = `rgba(${rgb},${0.85 * a})`;
      g.lineWidth = Math.max(1, T * 0.07);
      g.beginPath();
      const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !walls[y * w + x];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!walls[y * w + x]) continue;
          const X = view.ox + (bx + x) * T;
          const Y = view.oy + (by + y) * T;
          if (open(x, y - 1)) {
            g.moveTo(X, Y);
            g.lineTo(X + T, Y);
          }
          if (open(x, y + 1)) {
            g.moveTo(X, Y + T);
            g.lineTo(X + T, Y + T);
          }
          if (open(x - 1, y)) {
            g.moveTo(X, Y);
            g.lineTo(X, Y + T);
          }
          if (open(x + 1, y)) {
            g.moveTo(X + T, Y);
            g.lineTo(X + T, Y + T);
          }
        }
      }
      g.stroke();
    }

    function drawStart(x, y, a) {
      const T = view.tile;
      g.save();
      g.globalAlpha = a;
      g.strokeStyle = `rgba(${INK},0.85)`;
      g.lineWidth = Math.max(1.2, T * 0.06);
      g.beginPath();
      g.arc(cx(x), cy(y), T * 0.34, 0, TAU);
      g.stroke();
      g.shadowColor = `rgba(${INK},0.9)`;
      g.shadowBlur = T * 0.35;
      g.fillStyle = '#eef8ff';
      g.beginPath();
      g.arc(cx(x), cy(y), Math.max(2, T * 0.16), 0, TAU);
      g.fill();
      g.restore();
    }
    const drawExit = (x, y, a) => drawArt(g, { art: 'exit' }, cx(x), cy(y), view.tile * 0.42, a);
    const drawEnemy = (e, x, y, a) => drawArt(g, choiceOf(e), cx(x), cy(y), view.tile * (e.kind === 'warden' ? 0.46 : 0.38), a);
    function drawThing(t, x, y, a) {
      if (t.what === 'start') drawStart(x, y, a);
      else if (t.what === 'exit') drawExit(x, y, a);
      else drawEnemy(t.e || m.enemies[t.index], x, y, a);
    }
    function ring(x, y, rgb, dash, wide) {
      g.save();
      g.strokeStyle = `rgba(${rgb},0.95)`;
      g.lineWidth = Math.max(1.5, view.tile * (wide ? 0.09 : 0.06));
      if (dash) g.setLineDash([Math.max(2, view.tile * 0.16), Math.max(2, view.tile * 0.1)]);
      g.beginPath();
      g.arc(cx(x), cy(y), view.tile * 0.52, 0, TAU);
      g.stroke();
      g.restore();
    }
    function box(r, rgb, fill) {
      const T = view.tile;
      g.save();
      g.fillStyle = `rgba(${rgb},${fill})`;
      g.fillRect(view.ox + r.x0 * T, view.oy + r.y0 * T, (r.x1 - r.x0 + 1) * T, (r.y1 - r.y0 + 1) * T);
      g.strokeStyle = `rgba(${rgb},0.95)`;
      g.lineWidth = 1.5;
      g.setLineDash([6, 4]);
      g.strokeRect(view.ox + r.x0 * T + 0.75, view.oy + r.y0 * T + 0.75, (r.x1 - r.x0 + 1) * T - 1.5, (r.y1 - r.y0 + 1) * T - 1.5);
      g.restore();
    }
    function tileOutline(x, y, rgb, a) {
      const T = view.tile;
      g.strokeStyle = `rgba(${rgb},${a})`;
      g.lineWidth = 1.5;
      g.strokeRect(view.ox + x * T + 0.75, view.oy + y * T + 0.75, T - 1.5, T - 1.5);
    }

    function render() {
      if (!m || !env.visible() || !layout()) return;
      const T = view.tile;
      const wall = EchoPalette.rgb('wall');
      const danger = EchoPalette.rgb('echo');
      const good = EchoPalette.rgb('exit');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#010206';
      g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      // the floor, and a faint grid on it
      g.fillStyle = `rgba(${wall},0.045)`;
      g.fillRect(view.ox, view.oy, T * m.w, T * m.h);
      if (T >= 8) {
        g.strokeStyle = `rgba(${wall},0.08)`;
        g.lineWidth = 1;
        g.beginPath();
        for (let x = 1; x < m.w; x++) {
          g.moveTo(view.ox + x * T + 0.5, view.oy);
          g.lineTo(view.ox + x * T + 0.5, view.oy + m.h * T);
        }
        for (let y = 1; y < m.h; y++) {
          g.moveTo(view.ox, view.oy + y * T + 0.5);
          g.lineTo(view.ox + m.w * T, view.oy + y * T + 0.5);
        }
        g.stroke();
      }
      const moving = drag && drag.kind === 'move' ? drag : null;
      // while a box is being dragged, what it holds is drawn where it would land, not where it was
      let walls = m.walls;
      if (moving) {
        walls = m.walls.slice();
        const r = moving.rect;
        for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) walls[y * m.w + x] = 0;
      }
      drawWalls(walls, m.w, m.h, 0, 0, 1);
      g.strokeStyle = `rgba(${wall},0.3)`;
      g.lineWidth = 1;
      g.strokeRect(view.ox - 0.5, view.oy - 0.5, T * m.w + 1, T * m.h + 1);

      // the things placed
      const hidden = (x, y) => moving && inRect(moving.rect, x, y);
      if (m.exit && !hidden(m.exit.x, m.exit.y)) drawExit(m.exit.x, m.exit.y, 1);
      m.enemies.forEach((e) => {
        if (!hidden(e.x, e.y)) drawEnemy(e, e.x, e.y, 1);
      });
      if (m.start && !hidden(m.start.x, m.start.y)) drawStart(m.start.x, m.start.y, 1);

      // what is wrong, pointed at
      for (const p of verdict.errors) for (const at of p.at || []) ring(at.x, at.y, danger, true, true);
      for (const p of verdict.warnings) for (const at of p.at || []) ring(at.x, at.y, EchoPalette.rgb('key'), true, false);
      if (picked >= 0 && m.enemies[picked]) ring(m.enemies[picked].x, m.enemies[picked].y, INK, false, true);

      // the box, and a box on the move
      if (moving) {
        const { ox, oy } = moving.to;
        const ok = canDrop(moving.rect, moving.block, ox, oy);
        drawWalls(moving.block.walls, moving.block.w, moving.block.h, ox, oy, 0.8);
        for (const t of moving.block.things) drawThing(t, ox + t.dx, oy + t.dy, 0.85);
        box({ x0: ox, y0: oy, x1: ox + moving.block.w - 1, y1: oy + moving.block.h - 1 }, ok ? wall : danger, ok ? 0.08 : 0.16);
      } else if (drag && drag.kind === 'box') {
        box(rectOf(drag.from, drag.to), wall, 0.08);
      } else if (sel) {
        box(sel, wall, 0.06);
      }

      // the tile under the mouse, and what the tool would do there
      if (hover && !drag) {
        const { x, y } = hover;
        const t = thingAt(x, y);
        if (tool === 'wall') tileOutline(x, y, t ? danger : wall, 0.9);
        else if (tool === 'erase') tileOutline(x, y, INK, 0.6);
        else if (tool === 'select') tileOutline(x, y, INK, 0.35);
        else if (tool === 'start' || tool === 'exit') {
          if (t && t.what !== tool) tileOutline(x, y, danger, 0.9);
          else if (!t) {
            if (tool === 'start') drawStart(x, y, 0.4);
            else drawExit(x, y, 0.4);
          }
        } else if (tool === 'monster') {
          const c = choices[choice];
          if (t && t.what === 'enemy') ring(x, y, INK, false, false);
          else if (t || wallAt(x, y)) tileOutline(x, y, danger, 0.9);
          else if (c) drawArt(g, c, cx(x), cy(y), T * (c.kind === 'warden' ? 0.46 : 0.38), 0.4);
        }
      }
      // (good) a quiet green edge round the level when it is ready to play
      if (verdict.playable) {
        g.strokeStyle = `rgba(${good},0.35)`;
        g.lineWidth = 2;
        g.strokeRect(view.ox - 3, view.oy - 3, T * m.w + 6, T * m.h + 6);
      }
    }

    // ---------------------------------------------------------------- the panels
    function say(text) {
      message = text;
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => {
        message = '';
        refreshHint();
      }, 2800);
      refreshHint();
    }
    function refreshHint() {
      if (!m) return;
      let s = message;
      if (!s && hover) {
        const t = thingAt(hover.x, hover.y);
        const what = t ? (t.what === 'enemy' ? choiceOf(m.enemies[t.index]).label : t.what === 'start' ? 'Start' : 'Exit') : wallAt(hover.x, hover.y) ? 'Wall' : 'Floor';
        s = `${hover.x}, ${hover.y} · ${what}`;
      }
      if (!s) s = (TOOLS.find((t) => t.id === tool) || TOOLS[0]).tip;
      el.hint.textContent = s;
    }
    function flashProblems() {
      el.problems.classList.remove('flash');
      void el.problems.offsetWidth;
      el.problems.classList.add('flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => el.problems.classList.remove('flash'), 900);
    }

    function buildTools() {
      el.tools.textContent = '';
      for (const t of TOOLS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ed-tool';
        b.dataset.tool = t.id;
        b.textContent = t.label;
        b.title = t.tip;
        b.addEventListener('click', () => {
          env.click();
          setTool(t.id);
        });
        el.tools.appendChild(b);
      }
    }
    function buildMonsters() {
      choices = monsterChoices();
      if (choice >= choices.length) choice = 0;
      el.monsters.textContent = '';
      choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ed-monster';
        b.dataset.index = i;
        b.title = c.label;
        const icon = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        icon.width = Math.round(28 * dpr);
        icon.height = Math.round(28 * dpr);
        icon.style.width = '28px';
        icon.style.height = '28px';
        const ig = icon.getContext('2d');
        drawArt(ig, c, icon.width / 2, icon.height / 2, (c.kind === 'warden' ? 12.5 : 10.5) * dpr, 1);
        const name = document.createElement('span');
        name.textContent = c.label;
        b.append(icon, name);
        b.addEventListener('click', () => {
          env.click();
          choice = i;
          setTool('monster');
        });
        el.monsters.appendChild(b);
      });
    }
    function setTool(id) {
      tool = TOOLS.some((t) => t.id === id) ? id : 'wall';
      if (tool !== 'select') sel = null;
      message = '';
      render();
      refreshUi();
    }
    function sizeUi() {
      const s = el.size;
      s.textContent = '';
      let found = false;
      for (const z of SIZES) {
        const o = document.createElement('option');
        o.value = `${z.w}x${z.h}`;
        o.textContent = `${z.label} (${z.w} × ${z.h})`;
        if (m && z.w === m.w && z.h === m.h) found = true;
        s.appendChild(o);
      }
      if (m && !found) {
        const o = document.createElement('option');
        o.value = `${m.w}x${m.h}`;
        o.textContent = `This level (${m.w} × ${m.h})`;
        s.insertBefore(o, s.firstChild);
      }
      if (m) s.value = `${m.w}x${m.h}`;
    }
    el.size.addEventListener('change', () => {
      const [w, h] = el.size.value.split('x').map(Number);
      el.size.blur();
      setSize(w, h);
    });
    el.title.addEventListener('focus', () => begin());
    el.title.addEventListener('input', () => {
      if (!m) return;
      m.title = el.title.value;
      refreshStatus();
    });
    el.title.addEventListener('blur', () => {
      if (!m) return;
      m.title = EchoLevelFormat.cleanTitle(el.title.value);
      el.title.value = m.title;
      commit();
    });
    el.title.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
        e.preventDefault();
        el.title.blur();
      }
    });
    const on = (b, fn) =>
      b.addEventListener('click', () => {
        env.click();
        fn();
      });
    on(el.undo, undo);
    on(el.redo, redo);
    on(el.del, deleteSelected);
    el.clear.addEventListener('click', clearAll);
    on(el.save, save);
    on(el.test, testPlay);
    on(el.back, leave);

    function refreshStatus() {
      const state = verdict.playable ? 'Playable' : 'Unfinished';
      const kept = !everSaved ? 'not saved yet' : dirty() ? 'unsaved changes' : 'saved';
      el.status.textContent = `${state} · ${kept}`;
      el.status.classList.toggle('ok', verdict.playable);
      el.status.classList.toggle('dirty', !everSaved || dirty());
    }
    function refreshUi() {
      if (!m) return;
      el.tools.querySelectorAll('.ed-tool').forEach((b) => {
        const onNow = b.dataset.tool === tool;
        b.classList.toggle('on', onNow);
        b.setAttribute('aria-pressed', onNow ? 'true' : 'false');
      });
      el.monsters.querySelectorAll('.ed-monster').forEach((b) => {
        const onNow = tool === 'monster' && +b.dataset.index === choice;
        b.classList.toggle('on', onNow);
        b.setAttribute('aria-pressed', onNow ? 'true' : 'false');
      });
      el.undo.disabled = !past.length && !pending;
      el.redo.disabled = !future.length;
      el.del.disabled = !(picked >= 0 || sel);
      el.del.textContent = picked >= 0 ? 'Delete monster' : sel ? 'Clear selection' : 'Delete';
      // the problems: each one says what to do about it
      el.problems.textContent = '';
      if (verdict.playable) {
        const li = document.createElement('p');
        li.className = 'ok';
        li.textContent = 'Ready to play: it has a start, an exit and a way between them.';
        el.problems.appendChild(li);
      }
      for (const p of verdict.errors) {
        const li = document.createElement('p');
        li.textContent = p.text;
        el.problems.appendChild(li);
      }
      for (const p of verdict.warnings) {
        const li = document.createElement('p');
        li.className = 'warn';
        li.textContent = p.text;
        el.problems.appendChild(li);
      }
      el.test.disabled = false; // (always pressable: pressing it when the level is not ready says why)
      el.test.classList.toggle('not-ready', !verdict.playable);
      refreshStatus();
      refreshHint();
    }
    /** After any change: check the level again and show it. */
    function changed() {
      verdict = EchoLevelCheck.check(toDoc());
      render();
      refreshUi();
    }

    buildTools();

    return {
      TOOLS,
      SIZES,
      /** Open a level (a normalised doc) - or a new, empty one when there is none. */
      open(doc) {
        m = fromDoc(doc || EchoLevelFormat.blank());
        everSaved = !!doc;
        past = [];
        future = [];
        pending = null;
        sel = null;
        picked = -1;
        drag = null;
        hover = null;
        message = '';
        tool = 'wall';
        saved = snap();
        buildMonsters();
        el.title.value = m.title;
        sizeUi();
        changed();
      },
      /** Back from a test play: everything exactly as it was left. */
      resume() {
        drag = null;
        hover = null;
        render();
        refreshUi();
      },
      render,
      key,
      leave,
      isOpen: () => !!m,
      isDirty: dirty,
      /** ?debug / tests: where the middle of a tile is on the screen, to aim a real mouse event at. */
      tileToClient(x, y) {
        const r = cv.getBoundingClientRect();
        return { clientX: r.left + view.ox + (x + 0.5) * view.tile, clientY: r.top + view.oy + (y + 0.5) * view.tile };
      },
      doc: () => (m ? toDoc() : null),
      state: () =>
        m
          ? {
              tool,
              choice: choices[choice] ? { kind: choices[choice].kind, variant: choices[choice].variant, label: choices[choice].label } : null,
              choices: choices.map((c) => c.label),
              title: m.title,
              size: { w: m.w, h: m.h },
              walls: m.walls.reduce((a, v) => a + v, 0),
              start: pt(m.start),
              exit: pt(m.exit),
              enemies: m.enemies.map((e) => ({ ...e })),
              selection: sel ? { ...sel } : null,
              picked,
              dirty: dirty(),
              everSaved,
              playable: verdict.playable,
              errors: verdict.errors.map((p) => p.text),
              warnings: verdict.warnings.map((p) => p.text),
              undo: past.length,
              redo: future.length,
              hint: el.hint.textContent,
              status: el.status.textContent,
              tile: view.tile,
            }
          : null,
    };
  }

  return { create, drawArt, TOOLS, SIZES };
})();
