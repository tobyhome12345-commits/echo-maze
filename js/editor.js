'use strict';

/**
 * THE LEVEL EDITOR (v15.0; part 2 of 3 since v15.1). Levels are private (part 3 is sharing).
 *
 * It edits a MODEL of its own - a wall grid and the things placed on it - and turns that into the saved format
 * (js/levelformat.js) only to save it or to test it, so the format never depends on the editor. It never touches
 * the game either: it asks `env` for everything - saving (js/levelstore.js), test-playing, going back, a click's
 * sound. What it shows as wrong comes from js/levelcheck.js, the same rule the engine plays by. The monsters it
 * offers come from the game's own list (monsterChoices / MONSTER_TYPES in js/level.js), so a monster added to the
 * game appears here by itself.
 *
 * Tools (the mouse does everything; a few keys are shortcuts, never the only way; since v15.1 a finger does too):
 *   Wall     drag to draw walls; right-drag rubs walls out. It never builds over something placed.
 *   Erase    drag to clear tiles back to floor - walls, and anything on them.
 *   Select   drag a box around part of the level, then drag the box: its walls and everything in it move. Where
 *            it lands its tiles replace what was there - but never over something placed outside the box (the
 *            box turns red and will not drop there). Dragging one placed thing moves just that.
 *   Start    click a tile (a wall there is cleared) - or drag to slide it.
 *   Exit     click a tile to add a way out - an open one or a locked one, as picked - up to 8 (v15.1); drag one
 *            to move it; right-click one to take it away. A picked exit can be locked or unlocked.
 *   Monster  click a floor tile to place the monster picked in the list; drag one to move it; right-click one
 *            (or select it and press Delete) to take it away.
 *   Object   (v15.1) a puddle, the sonar decoy, the key or a note - the floor objects the game already has. A
 *            note asks for its words first. One decoy and one key per level, at most 8 notes.
 *   Effect   (v15.1) drag out a zone of light or red glow; drag it to move it, drag its corner handle to resize
 *            it; its kind, shape, colour and strength are in the panel when it is picked.
 *   Undo / Redo (Ctrl+Z / Ctrl+Y), Clear all (asks first), the title, the size, and (v15.1) the Level settings tab:
 *   exact size, a title card line, a colour palette, and the level's difficulty with its tuning.
 */
const EchoEditor = (() => {
  const TAU = Math.PI * 2;
  const HISTORY_MAX = 200;
  const ART_T = 0.9; // the art's clock: the editor's drawings hold still
  const TOOLS = [
    { id: 'wall', label: 'Wall', tip: 'Drag to draw walls. Right-drag to rub them out.', touchTip: 'Drag to draw walls. Use Erase to clear them.' },
    { id: 'erase', label: 'Erase', tip: 'Drag to clear tiles back to floor: walls, and anything on them.' },
    { id: 'select', label: 'Select', tip: 'Drag a box around part of the level, then drag the box to move it. Or drag one thing to move it.' },
    { id: 'start', label: 'Start', tip: 'Click a tile to put the start there.' },
    { id: 'exit', label: 'Exit', tip: 'Click a tile to add a way out (up to 8). Reaching any one finishes the level. Drag one to move it; right-click one to take it away.', touchTip: 'Tap a tile to add a way out (up to 8). Drag one to move it; tap it and press Delete to take it away.' },
    { id: 'monster', label: 'Monster', tip: 'Click a floor tile to place the monster picked below. Drag one to move it; right-click one to take it away.', touchTip: 'Tap a floor tile to place the monster picked below. Drag one to move it; tap it and press Delete to take it away.' },
    { id: 'object', label: 'Object', tip: 'Click a floor tile to place the object picked below. Drag one to move it; right-click one to take it away.', touchTip: 'Tap a floor tile to place the object picked below. Drag one to move it; tap it and press Delete to take it away.' },
    { id: 'effect', label: 'Effect', tip: 'Drag out a zone of light or red glow. Drag a zone to move it, or its corner to resize it; right-click one to take it away.', touchTip: 'Drag out a zone of light or red glow. Drag a zone to move it, or its corner to resize it; tap it and press Delete to take it away.' },
  ];
  const SIZES = [
    { label: 'Small', w: 21, h: 15 },
    { label: 'Medium', w: 31, h: 21 },
    { label: 'Large', w: 41, h: 29 },
    { label: 'Huge', w: 51, h: 35 },
  ];
  /** What the Exit, Object and Effect tools can place (v15.1). */
  const EXIT_CHOICES = [
    { id: 'open', label: 'Exit', art: 'exit', tip: 'An open way out.' },
    { id: 'locked', label: 'Locked exit', art: 'door', tip: 'A way out that needs the key.' },
  ];
  const OBJECT_CHOICES = [
    { id: 'puddle', label: 'Puddle', art: 'puddle', tip: 'Stepping in it makes you smelly for a while.' },
    { id: 'decoy', label: 'Sonar decoy', art: 'decoy', tip: 'One per level. Walk onto it to pick it up.' },
    { id: 'key', label: 'Key', art: 'key', tip: 'One per level. It opens every locked exit.' },
    { id: 'note', label: 'Note', art: 'note', tip: 'Words you write, read when a ripple finds it.' },
  ];
  const OBJECT_NAMES = { puddle: 'a puddle', decoy: 'the sonar decoy', key: 'the key', note: 'a note' };
  const EFFECT_CHOICES = [
    { id: 'light', label: 'Light', tip: 'A pool of light: the stone in it shows, where you could see it.' },
    { id: 'glow', label: 'Red glow', tip: 'A slow red glow over the floor.' },
  ];
  const INTENSITY_NAMES = { dim: 'Dim', medium: 'Medium', bright: 'Bright' };
  const SHAPE_NAMES = { rect: 'Rectangle', circle: 'Circle' };
  const INK = '207,233,245';

  /**
   * One placeable thing's picture, centred on (x, y) at radius r - the very art a ripple lights it up with in the
   * game (js/art.js, and js/warden.js for the hunters). Used for the map and for the lists to pick from.
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

  /** A small swatch of an effect zone's colour, for the lists. */
  function drawSwatch(ctx, rgb, w, h, glow) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
    g.addColorStop(0, `rgba(${rgb},${glow ? 0.75 : 0.9})`);
    g.addColorStop(1, `rgba(${rgb},0.08)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function create(env) {
    const el = env.el;
    const cv = el.canvas;
    const g = cv.getContext('2d');
    const LIMITS = EchoLevelFormat.LIMITS;
    const F = EchoLevelFormat;

    let m = null; // the level being edited (see fromDoc)
    let tool = 'wall';
    let choices = []; // what the Monster tool can place (monsterChoices)
    let choice = 0;
    let exitChoice = 'open'; // (v15.1) what the Exit tool adds
    let objectChoice = 'puddle'; // ...the Object tool
    let effectChoice = 'light'; // ...and the Effect tool
    let effectShape = 'rect';
    let past = []; // undo: snapshots, oldest first
    let future = []; // redo
    let pending = null; // the snapshot taken when the current change began
    let saved = null; // the level as it was when last saved or opened
    let everSaved = false;
    let sel = null; // the Select tool's box: { x0, y0, x1, y1 } in tiles
    let pick = null; // (v15.1) the thing picked out: { what: 'start' | 'exit' | 'enemy' | 'object' | 'effect', index }
    let drag = null;
    let hover = null; // the tile under the mouse
    let verdict = { playable: false, errors: [], warnings: [] };
    let view = { tile: 20, ox: 0, oy: 0, dpr: 1 };
    let message = '';
    let messageTimer = 0;
    let flashTimer = 0;
    let tab = 'build';

    // ---------------------------------------------------------------- the model
    const dif = (d) => ({ rating: d.rating, monsterSpeed: d.monsterSpeed, rippleRange: d.rippleRange, hearing: d.hearing });
    function fromDoc(doc) {
      return {
        id: doc.id,
        title: doc.title,
        authorName: doc.authorName || '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        w: doc.size.w,
        h: doc.size.h,
        walls: F.wallGrid(doc),
        start: doc.start ? { x: doc.start.x, y: doc.start.y } : null,
        exits: (doc.exits || []).map((e) => ({ x: e.x, y: e.y, locked: !!e.locked })),
        enemies: doc.enemies.map((e) => ({ kind: e.kind, variant: e.variant || null, x: e.x, y: e.y })),
        objects: (doc.objects || []).map((o) => ({ ...o })),
        effects: (doc.effects || []).map((f) => ({ ...f })),
        titleCard: doc.titleCard || '',
        palette: doc.palette || '',
        difficulty: dif(doc.difficulty || F.difficulty(null)),
      };
    }

    /** The level as saved data (js/levelformat.js) - what Save stores and Test play is given. */
    function toDoc() {
      return {
        format: F.FORMAT,
        schemaVersion: F.SCHEMA_VERSION,
        id: m.id,
        title: F.cleanTitle(m.title),
        authorName: m.authorName,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        size: { w: m.w, h: m.h },
        walls: F.encodeWalls(m.walls, m.w, m.h),
        start: m.start ? { x: m.start.x, y: m.start.y } : null,
        exits: m.exits.map((e) => ({ x: e.x, y: e.y, locked: !!e.locked })),
        enemies: m.enemies.map((e) => (e.variant ? { kind: e.kind, variant: e.variant, x: e.x, y: e.y } : { kind: e.kind, x: e.x, y: e.y })),
        objects: m.objects.map((o) => ({ ...o })),
        effects: m.effects.map((f) => ({ ...f })),
        titleCard: m.titleCard,
        palette: m.palette,
        difficulty: F.difficulty(m.difficulty),
        extra: {},
        extraEnemies: [],
        extraObjects: [],
        extraEffects: [],
      };
    }

    // ---------------------------------------------------------------- history
    const pt = (p) => (p ? { x: p.x, y: p.y } : null);
    const samePt = (a, b) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y);
    const snap = () => ({
      w: m.w,
      h: m.h,
      walls: m.walls.slice(),
      start: pt(m.start),
      exits: m.exits.map((e) => ({ ...e })),
      enemies: m.enemies.map((e) => ({ ...e })),
      objects: m.objects.map((o) => ({ ...o })),
      effects: m.effects.map((f) => ({ ...f })),
      title: m.title,
      titleCard: m.titleCard,
      palette: m.palette,
      difficulty: { ...m.difficulty },
    });
    // everything but the walls, as text: what is placed, in order, and the settings
    const restOf = (s) => JSON.stringify([s.w, s.h, s.start, s.exits, s.enemies, s.objects, s.effects, s.title, s.titleCard, s.palette, s.difficulty]);
    function same(a, b) {
      if (a.w !== b.w || a.h !== b.h || !samePt(a.start, b.start)) return false;
      if (restOf(a) !== restOf(b)) return false;
      for (let i = 0; i < a.walls.length; i++) if (a.walls[i] !== b.walls[i]) return false;
      return true;
    }
    function restore(s) {
      m.w = s.w;
      m.h = s.h;
      m.walls = s.walls.slice();
      m.start = pt(s.start);
      m.exits = s.exits.map((e) => ({ ...e }));
      m.enemies = s.enemies.map((e) => ({ ...e }));
      m.objects = s.objects.map((o) => ({ ...o }));
      m.effects = s.effects.map((f) => ({ ...f }));
      m.title = s.title;
      m.titleCard = s.titleCard;
      m.palette = s.palette;
      m.difficulty = { ...s.difficulty };
      el.title.value = m.title;
      sel = null;
      pick = null;
      settingsUi();
      sizeUi();
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
    const exitAt = (x, y) => m.exits.findIndex((e) => e.x === x && e.y === y);
    const objectAt = (x, y) => m.objects.findIndex((o) => o.x === x && o.y === y);
    const isAt = (p, x, y) => !!p && p.x === x && p.y === y;
    /** The one thing on a tile (one per tile): the start, an exit, a monster or an object - or null. */
    function thingAt(x, y) {
      if (isAt(m.start, x, y)) return { what: 'start' };
      let i = exitAt(x, y);
      if (i >= 0) return { what: 'exit', index: i };
      i = enemyAt(x, y);
      if (i >= 0) return { what: 'enemy', index: i };
      i = objectAt(x, y);
      return i >= 0 ? { what: 'object', index: i } : null;
    }
    const sameThing = (a, b) => !!a && !!b && a.what === b.what && (a.what === 'start' || a.index === b.index);
    const choiceOf = (e) => choices.find((c) => c.kind === e.kind && (c.variant || null) === (e.variant || null)) || { kind: e.kind, variant: e.variant, label: e.kind, art: null, role: 'wall' };
    const exitLabel = (i) => (m.exits.length > 1 ? `Exit ${i + 1}` : 'The exit');
    function nameOf(t) {
      if (!t) return '';
      if (t.what === 'start') return 'the start';
      if (t.what === 'exit') return m.exits.length > 1 ? `exit ${t.index + 1}` : 'the exit';
      if (t.what === 'object') return OBJECT_NAMES[m.objects[t.index].kind] || 'an object';
      if (t.what === 'effect') return 'an effect';
      return 'a monster';
    }
    const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
    /** The effect zone under a tile: the topmost one (the last drawn), or -1. */
    function effectAt(x, y) {
      for (let i = m.effects.length - 1; i >= 0; i--) {
        const f = m.effects[i];
        if (x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h) return i;
      }
      return -1;
    }
    const isCorner = (f, x, y) => x === f.x + f.w - 1 && y === f.y + f.h - 1;
    function pickedObj() {
      if (!pick) return null;
      if (pick.what === 'start') return m.start;
      const list = pick.what === 'exit' ? m.exits : pick.what === 'enemy' ? m.enemies : pick.what === 'object' ? m.objects : m.effects;
      return list[pick.index] || null;
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
    /** Take something away by kind and index, keeping what is picked pointing at the right thing. */
    function removeAt(what, i) {
      const list = what === 'exit' ? m.exits : what === 'enemy' ? m.enemies : what === 'object' ? m.objects : what === 'effect' ? m.effects : null;
      if (!list || !list[i]) return;
      list.splice(i, 1);
      if (pick && pick.what === what) {
        if (pick.index === i) pick = null;
        else if (pick.index > i) pick = { what, index: pick.index - 1 };
      }
    }
    const removeEnemy = (i) => removeAt('enemy', i);
    function eraseTile(x, y) {
      if (!inGrid(x, y)) return;
      m.walls[y * m.w + x] = 0;
      let i = enemyAt(x, y);
      if (i >= 0) removeEnemy(i);
      i = exitAt(x, y);
      if (i >= 0) removeAt('exit', i);
      i = objectAt(x, y);
      if (i >= 0) removeAt('object', i);
      if (isAt(m.start, x, y)) {
        m.start = null;
        if (pick && pick.what === 'start') pick = null;
      }
    }
    /** The Start tool: put it here. A wall here is cleared; anything else here is in the way. */
    function placeStart(x, y) {
      if (!inGrid(x, y) || isAt(m.start, x, y)) return false;
      const t = thingAt(x, y);
      if (t) {
        say(`${cap(nameOf(t))} is already there.`);
        return false;
      }
      m.walls[y * m.w + x] = 0;
      m.start = { x, y };
      return true;
    }
    /** The Exit tool (v15.1): add a way out here - open or locked, as picked. */
    function addExit(x, y) {
      if (!inGrid(x, y)) return -1;
      if (m.exits.length >= LIMITS.exits) {
        say(`A level can have ${LIMITS.exits} exits at most.`);
        return -1;
      }
      const t = thingAt(x, y);
      if (t) {
        say(`${cap(nameOf(t))} is already there.`);
        return -1;
      }
      m.walls[y * m.w + x] = 0;
      m.exits.push({ x, y, locked: exitChoice === 'locked' });
      return m.exits.length - 1;
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
        say(`${cap(nameOf(t))} is already there.`);
        return -1;
      }
      m.enemies.push({ kind: c.kind, variant: c.variant || null, x, y });
      return m.enemies.length - 1;
    }
    /** Could an object of this kind go on this tile? -> '' or why not. */
    function objectRefusal(kind, x, y) {
      if (!inGrid(x, y)) return ' ';
      if (wallAt(x, y)) return 'Objects go on floor tiles.';
      const t = thingAt(x, y);
      if (t) return `${cap(nameOf(t))} is already there.`;
      const max = F.OBJECTS[kind].max;
      if (m.objects.filter((o) => o.kind === kind).length >= max) return max === 1 ? `A level has one ${kind === 'decoy' ? 'sonar decoy' : kind} at most. Drag it to move it.` : `A level can have ${max} ${kind}s at most.`;
      if (m.objects.length >= LIMITS.objects) return `A level can hold ${LIMITS.objects} objects at most.`;
      return '';
    }
    /** The Object tool (v15.1). A note asks for its words first; nothing is placed if none are given. */
    async function addObject(x, y) {
      const kind = objectChoice;
      const why = objectRefusal(kind, x, y);
      if (why) {
        if (why.trim()) say(why);
        return;
      }
      const o = { kind, x, y };
      if (kind === 'note') {
        const r = await env.dialog.open({
          title: 'Write a note',
          text: 'Whatever you write is read when a ripple finds it. A recording is spoken; a note is shown.',
          input: { value: '', max: LIMITS.noteText, label: 'The note' },
          buttons: [{ id: 'note', label: 'Place note', primary: true }, { id: 'recording', label: 'Place recording' }, { id: 'cancel', label: 'Cancel' }],
          cancel: 'cancel',
        });
        if (r.id === 'cancel' || !m) return;
        o.text = F.cleanNote(r.value);
        o.style = r.id === 'recording' ? 'recording' : 'note';
        if (!o.text) {
          say('A note needs something written on it.');
          return;
        }
        if (objectRefusal(kind, x, y)) return; // (something changed while the question was up)
      }
      begin();
      m.objects.push(o);
      pick = { what: 'object', index: m.objects.length - 1 };
      commit();
    }
    /** Slide one placed thing to a tile: only onto empty floor (or where it already is). */
    function moveThing(t, x, y) {
      if (!inGrid(x, y)) return false;
      const here = thingAt(x, y);
      if (here && !sameThing(here, t)) return false;
      if (t.what === 'start' || t.what === 'exit') {
        // (the start and the ways out may go onto a wall: it is cleared, as when they are placed)
        if (t.what === 'start') m.start = { x, y };
        else {
          m.exits[t.index].x = x;
          m.exits[t.index].y = y;
        }
        m.walls[y * m.w + x] = 0;
        return true;
      }
      if (wallAt(x, y)) return false;
      const list = t.what === 'enemy' ? m.enemies : m.objects;
      list[t.index].x = x;
      list[t.index].y = y;
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
      m.exits.forEach((e, i) => {
        if (inRect(r, e.x, e.y)) block.things.push({ what: 'exit', index: i, e: { ...e }, dx: e.x - r.x0, dy: e.y - r.y0 });
      });
      m.enemies.forEach((e, i) => {
        if (inRect(r, e.x, e.y)) block.things.push({ what: 'enemy', index: i, e: { ...e }, dx: e.x - r.x0, dy: e.y - r.y0 });
      });
      m.objects.forEach((o, i) => {
        if (inRect(r, o.x, o.y)) block.things.push({ what: 'object', index: i, e: { ...o }, dx: o.x - r.x0, dy: o.y - r.y0 });
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
      const outside = (p) => !inRect(r, p.x, p.y) && blocked(p.x, p.y);
      if (m.start && outside(m.start)) return false;
      return !m.exits.some(outside) && !m.enemies.some(outside) && !m.objects.some(outside);
    }
    function dropBlock(r, block, ox, oy) {
      // what it leaves behind is floor, with nothing on it
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) m.walls[y * m.w + x] = 0;
      if (m.start && inRect(r, m.start.x, m.start.y)) m.start = null;
      const stay = (p) => !inRect(r, p.x, p.y);
      m.exits = m.exits.filter(stay);
      m.enemies = m.enemies.filter(stay);
      m.objects = m.objects.filter(stay);
      // where it lands, its tiles take over
      for (let y = 0; y < block.h; y++) for (let x = 0; x < block.w; x++) m.walls[(oy + y) * m.w + ox + x] = block.walls[y * block.w + x];
      for (const t of block.things) {
        const x = ox + t.dx;
        const y = oy + t.dy;
        if (t.what === 'start') m.start = { x, y };
        else if (t.what === 'exit') m.exits.push({ ...t.e, x, y });
        else if (t.what === 'enemy') m.enemies.push({ ...t.e, x, y });
        else m.objects.push({ ...t.e, x, y });
      }
      sel = { x0: ox, y0: oy, x1: ox + block.w - 1, y1: oy + block.h - 1 };
      pick = null;
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
      if (pick) {
        begin();
        if (pick.what === 'start') m.start = null;
        else removeAt(pick.what, pick.index);
        pick = null;
        commit();
      } else if (sel) {
        begin();
        clearRect(sel);
        commit();
      }
    }

    // ---------------------------------------------------------------- effect zones (v15.1)
    /** A zone from tile a to tile b, made inside the level. */
    function zoneFrom(a, b) {
      const r = rectOf(a, b);
      return { x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1 };
    }
    function addEffect(a, b) {
      if (m.effects.length >= LIMITS.effects) {
        say(`A level can have ${LIMITS.effects} effects at most.`);
        return -1;
      }
      const z = zoneFrom(a, b);
      m.effects.push({ kind: effectChoice, shape: effectShape, x: z.x, y: z.y, w: z.w, h: z.h, colour: F.EFFECTS[effectChoice].colours[0], intensity: 'medium' });
      return m.effects.length - 1;
    }

    // ---------------------------------------------------------------- whole-level actions
    async function clearAll() {
      env.click();
      const r = await env.dialog.open({
        title: 'Clear everything?',
        text: 'Every wall, the start, every exit, monster, object and effect will be removed. Undo brings it all back.',
        buttons: [{ id: 'clear', label: 'Clear all', primary: true, danger: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id !== 'clear' || !m) return;
      begin();
      m.walls = F.wallGrid(F.blank({ w: m.w, h: m.h }));
      m.start = null;
      m.exits = [];
      m.enemies = [];
      m.objects = [];
      m.effects = [];
      sel = null;
      pick = null;
      commit();
      say('Cleared. Undo brings it back.');
    }

    async function setSize(w, h) {
      w = Math.max(LIMITS.minW, Math.min(LIMITS.maxW, Math.round(w) || m.w));
      h = Math.max(LIMITS.minH, Math.min(LIMITS.maxH, Math.round(h) || m.h));
      if (!m || (w === m.w && h === m.h)) {
        sizeUi();
        return;
      }
      const outside = (p) => !!p && (p.x >= w || p.y >= h);
      let lost = outside(m.start) || m.exits.some(outside) || m.enemies.some(outside) || m.objects.some(outside) || m.effects.some(outside);
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
      m.exits = m.exits.filter((e) => !outside(e));
      m.enemies = m.enemies.filter((e) => !outside(e));
      m.objects = m.objects.filter((o) => !outside(o));
      // a zone that still starts inside is cut down to fit; one that does not is gone
      m.effects = m.effects.filter((f) => !outside(f)).map((f) => ({ ...f, w: Math.min(f.w, w - f.x), h: Math.min(f.h, h - f.y) }));
      sel = null;
      pick = null;
      commit();
      sizeUi();
      if (grew) say('The new space is solid wall. Use Erase to open it up.');
    }

    async function save() {
      commit();
      m.title = F.cleanTitle(m.title);
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

    // ---------------------------------------------------------------- the mouse (and, v15.1, a finger)
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

    /** Pick a placed thing out, and start dragging it (or, for a zone, moving or resizing it). */
    function grab(t, p) {
      pick = t.what === 'start' ? { what: 'start' } : { what: t.what, index: t.index };
      begin();
      drag = { kind: 'thing', thing: t, from: p };
    }

    function onDown(ev) {
      if (!m || !env.visible() || (ev.button !== 0 && ev.button !== 2)) return;
      ev.preventDefault();
      // (finishes a title, a card line or a note being typed: its own undo step)
      if (document.activeElement && document.activeElement !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) document.activeElement.blur();
      if (drag) return;
      const p = tileAt(ev);
      const right = ev.button === 2;
      if (!p.inside) {
        if (tool === 'select' || tool === 'effect') {
          sel = null;
          pick = null;
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
          if (right) break;
          begin();
          drag = { kind: 'place-start' };
          placeStart(p.x, p.y);
          break;
        case 'exit': {
          const i = exitAt(p.x, p.y);
          if (right) {
            if (i >= 0) {
              begin();
              removeAt('exit', i);
              commit();
            }
            break;
          }
          if (i >= 0) {
            grab({ what: 'exit', index: i }, p);
            break;
          }
          begin();
          const k = addExit(p.x, p.y);
          if (k >= 0) {
            pick = { what: 'exit', index: k };
            drag = { kind: 'thing', thing: { what: 'exit', index: k }, from: p };
          } else commit();
          break;
        }
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
            grab({ what: 'enemy', index: i }, p);
            break;
          }
          const c = choices[choice];
          if (!c) break;
          begin();
          const k = addEnemy(c, p.x, p.y);
          if (k >= 0) pick = { what: 'enemy', index: k };
          commit();
          break;
        }
        case 'object': {
          const i = objectAt(p.x, p.y);
          if (right) {
            if (i >= 0) {
              begin();
              removeAt('object', i);
              commit();
            }
            break;
          }
          if (i >= 0) {
            grab({ what: 'object', index: i }, p);
            break;
          }
          addObject(p.x, p.y); // (a note asks for its words first)
          break;
        }
        case 'effect': {
          const i = effectAt(p.x, p.y);
          if (right) {
            if (i >= 0) {
              begin();
              removeAt('effect', i);
              commit();
            }
            break;
          }
          if (i >= 0) {
            const f = m.effects[i];
            pick = { what: 'effect', index: i };
            begin();
            // (its corner tile resizes it - a one-tile zone is all corner, so it grows; anywhere else moves it)
            drag = isCorner(f, p.x, p.y) ? { kind: 'resize', index: i, anchor: { x: f.x, y: f.y } } : { kind: 'zone', index: i, from: p, at: { x: f.x, y: f.y } };
            break;
          }
          pick = null;
          drag = { kind: 'new-zone', from: p, to: p };
          break;
        }
        case 'select': {
          if (right) {
            const t = thingAt(p.x, p.y);
            if (t && t.what !== 'start') {
              begin();
              removeAt(t.what, t.index);
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
            grab(t, p);
            break;
          }
          sel = null;
          pick = null;
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
      hover = p.inside && !ev.fromTouch ? { x: p.x, y: p.y } : null;
      if (drag) {
        const q = { x: Math.max(0, Math.min(m.w - 1, p.x)), y: Math.max(0, Math.min(m.h - 1, p.y)) };
        if (drag.kind === 'paint') {
          if (p.inside) line(drag.last, q, (x, y) => setWall(x, y, drag.on));
          drag.last = q;
        } else if (drag.kind === 'erase') {
          if (p.inside) line(drag.last, q, eraseTile);
          drag.last = q;
        } else if (drag.kind === 'place-start') {
          if (p.inside) placeStart(q.x, q.y);
        } else if (drag.kind === 'thing') {
          if (p.inside) moveThing(drag.thing, q.x, q.y);
        } else if (drag.kind === 'box' || drag.kind === 'new-zone') {
          drag.to = q;
        } else if (drag.kind === 'move') {
          drag.to = dropAt(drag.rect, drag.from, q);
        } else if (drag.kind === 'zone') {
          const f = m.effects[drag.index];
          if (f) {
            f.x = Math.max(0, Math.min(m.w - f.w, drag.at.x + q.x - drag.from.x));
            f.y = Math.max(0, Math.min(m.h - f.h, drag.at.y + q.y - drag.from.y));
          }
        } else if (drag.kind === 'resize') {
          const f = m.effects[drag.index];
          if (f) {
            f.w = Math.max(1, q.x - drag.anchor.x + 1);
            f.h = Math.max(1, q.y - drag.anchor.y + 1);
          }
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
      } else if (d.kind === 'new-zone') {
        begin();
        const k = addEffect(d.from, d.to);
        if (k >= 0) pick = { what: 'effect', index: k };
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
      if (tool === 'exit' && exitAt(p.x, p.y) >= 0) return 'grab';
      if (tool === 'object' && objectAt(p.x, p.y) >= 0) return 'grab';
      if (tool === 'effect') {
        const i = effectAt(p.x, p.y);
        if (i >= 0) return isCorner(m.effects[i], p.x, p.y) ? 'nwse-resize' : 'move';
      }
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
    // TOUCH (v15.1, best effort): a finger or a pen works as the left mouse button does - tap to place, drag to
    // draw or to move. (There is no right button: Erase, and Delete on what is picked, do its jobs.) The mouse keeps
    // its own events above; these take only touch and pen, and stop the browser making mouse events out of them.
    let finger = null;
    const asMouse = (ev) => ({ button: 0, clientX: ev.clientX, clientY: ev.clientY, fromTouch: true, preventDefault() {} });
    cv.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' || finger !== null) return;
      ev.preventDefault();
      finger = ev.pointerId;
      try {
        cv.setPointerCapture(ev.pointerId);
      } catch (e) {
        /* capture is a nicety */
      }
      onDown(asMouse(ev));
    });
    cv.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== finger) return;
      ev.preventDefault();
      onMove(asMouse(ev));
    });
    const lift_ = (ev) => {
      if (ev.pointerId !== finger) return;
      finger = null;
      onUp();
    };
    cv.addEventListener('pointerup', lift_);
    cv.addEventListener('pointercancel', lift_);
    cv.addEventListener('lostpointercapture', lift_);

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
        } else if (sel || pick) {
          sel = null;
          pick = null;
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

    /** An effect zone as the editor shows it: a wash of its colour inside its outline (v15.1). */
    function drawZone(f, a, picked) {
      const T = view.tile;
      const rgb = EchoEffects.COLOURS[f.colour] || INK;
      const k = (EchoEffects.STRENGTH[f.intensity] || 0.7) * a;
      const X = view.ox + f.x * T;
      const Y = view.oy + f.y * T;
      const Wd = f.w * T;
      const Ht = f.h * T;
      g.save();
      g.beginPath();
      if (f.shape === 'circle') g.ellipse(X + Wd / 2, Y + Ht / 2, Wd / 2, Ht / 2, 0, 0, TAU);
      else g.rect(X, Y, Wd, Ht);
      g.fillStyle = `rgba(${rgb},${(f.kind === 'glow' ? 0.16 : 0.13) * k})`;
      g.fill();
      g.strokeStyle = `rgba(${rgb},${picked ? 0.95 : 0.55 * a})`;
      g.lineWidth = picked ? 2 : 1.2;
      g.setLineDash(f.kind === 'glow' ? [3, 4] : [7, 4]);
      g.stroke();
      g.setLineDash([]);
      if (picked) {
        // the corner handle: drag it to resize
        const s = Math.max(6, T * 0.36);
        g.fillStyle = `rgba(${rgb},0.95)`;
        g.fillRect(X + Wd - s, Y + Ht - s, s, s);
      }
      g.restore();
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
    function drawExit(e, x, y, a, n) {
      if (e && e.locked) drawArt(g, { art: 'door' }, cx(x), cy(y), view.tile * 0.46, a);
      else drawArt(g, { art: 'exit' }, cx(x), cy(y), view.tile * 0.42, a);
      if (n && view.tile >= 12) {
        // which one it is, when there are several (the problems list names them so)
        g.save();
        g.font = `600 ${Math.max(9, Math.round(view.tile * 0.34))}px system-ui, sans-serif`;
        g.fillStyle = `rgba(${EchoPalette.rgb('exit')},${0.95 * a})`;
        g.textAlign = 'right';
        g.textBaseline = 'top';
        g.fillText(String(n), view.ox + (x + 1) * view.tile - 2, view.oy + y * view.tile + 1);
        g.restore();
      }
    }
    const drawEnemy = (e, x, y, a) => drawArt(g, choiceOf(e), cx(x), cy(y), view.tile * (e.kind === 'warden' ? 0.46 : 0.38), a);
    const objectArt = (o) => (o.kind === 'note' ? (o.style === 'recording' ? 'log' : 'note') : o.kind);
    const drawObject = (o, x, y, a) => drawArt(g, { art: objectArt(o) }, cx(x), cy(y), view.tile * (o.kind === 'puddle' ? 0.36 : 0.3), a);
    function drawThing(t, x, y, a) {
      if (t.what === 'start') drawStart(x, y, a);
      else if (t.what === 'exit') drawExit(t.e || m.exits[t.index], x, y, a, 0);
      else if (t.what === 'object') drawObject(t.e || m.objects[t.index], x, y, a);
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
      // (v15.1) the effect zones, under everything else - brighter while the Effect tool is in hand
      m.effects.forEach((f, i) => drawZone(f, tool === 'effect' ? 1 : 0.6, !!pick && pick.what === 'effect' && pick.index === i));
      if (drag && drag.kind === 'new-zone') {
        const z = zoneFrom(drag.from, drag.to);
        drawZone({ ...z, kind: effectChoice, shape: effectShape, colour: F.EFFECTS[effectChoice].colours[0], intensity: 'medium' }, 0.9, true);
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
      m.objects.forEach((o) => {
        if (!hidden(o.x, o.y)) drawObject(o, o.x, o.y, 1);
      });
      m.exits.forEach((e, i) => {
        if (!hidden(e.x, e.y)) drawExit(e, e.x, e.y, 1, m.exits.length > 1 ? i + 1 : 0);
      });
      m.enemies.forEach((e) => {
        if (!hidden(e.x, e.y)) drawEnemy(e, e.x, e.y, 1);
      });
      if (m.start && !hidden(m.start.x, m.start.y)) drawStart(m.start.x, m.start.y, 1);

      // what is wrong, pointed at
      for (const p of verdict.errors) for (const at of p.at || []) if (at) ring(at.x, at.y, danger, true, true);
      for (const p of verdict.warnings) for (const at of p.at || []) if (at) ring(at.x, at.y, EchoPalette.rgb('key'), true, false);
      const po = pick && pick.what !== 'effect' ? pickedObj() : null;
      if (po) ring(po.x, po.y, INK, false, true);

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
        else if (tool === 'select' || tool === 'effect') tileOutline(x, y, INK, 0.35);
        else if (tool === 'start') {
          if (t && t.what !== 'start') tileOutline(x, y, danger, 0.9);
          else if (!t) drawStart(x, y, 0.4);
        } else if (tool === 'exit') {
          if (t && t.what === 'exit') ring(x, y, INK, false, false);
          else if (t) tileOutline(x, y, danger, 0.9);
          else drawExit({ locked: exitChoice === 'locked' }, x, y, 0.4, 0);
        } else if (tool === 'monster') {
          const c = choices[choice];
          if (t && t.what === 'enemy') ring(x, y, INK, false, false);
          else if (t || wallAt(x, y)) tileOutline(x, y, danger, 0.9);
          else if (c) drawArt(g, c, cx(x), cy(y), T * (c.kind === 'warden' ? 0.46 : 0.38), 0.4);
        } else if (tool === 'object') {
          if (t && t.what === 'object') ring(x, y, INK, false, false);
          else if (objectRefusal(objectChoice, x, y)) tileOutline(x, y, danger, 0.9);
          else drawObject({ kind: objectChoice }, x, y, 0.45);
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
        let what = wallAt(hover.x, hover.y) ? 'Wall' : 'Floor';
        if (t) what = t.what === 'enemy' ? choiceOf(m.enemies[t.index]).label : t.what === 'start' ? 'Start' : t.what === 'exit' ? `${exitLabel(t.index).replace('The exit', 'Exit')}${m.exits[t.index].locked ? ' (locked)' : ''}` : cap(nameOf(t).replace(/^(a|the) /, ''));
        const z = effectAt(hover.x, hover.y);
        if (z >= 0) what += ` · ${EchoEffects.KIND_NAMES[m.effects[z].kind]}`;
        s = `${hover.x}, ${hover.y} · ${what}`;
      }
      if (!s) {
        const t = TOOLS.find((x) => x.id === tool) || TOOLS[0];
        s = env.touch && env.touch() && t.touchTip ? t.touchTip : t.tip; // (v15.1: no right button on a touch screen)
      }
      el.hint.textContent = s;
    }
    function flashProblems() {
      el.problems.classList.remove('flash');
      void el.problems.offsetWidth;
      el.problems.classList.add('flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => el.problems.classList.remove('flash'), 900);
    }

    const icon = (paint, size = 28) => {
      const c = document.createElement('canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
      c.style.width = `${size}px`;
      c.style.height = `${size}px`;
      paint(c.getContext('2d'), c.width, c.height, dpr);
      return c;
    };
    function listButton(cls, label, tip, paint, onPick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.title = tip || label;
      if (paint) b.append(icon(paint));
      const name = document.createElement('span');
      name.textContent = label;
      b.append(name);
      b.addEventListener('click', () => {
        env.click();
        onPick();
      });
      return b;
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
        const b = listButton('ed-monster', c.label, c.label, (ig, w, h, dpr) => drawArt(ig, c, w / 2, h / 2, (c.kind === 'warden' ? 12.5 : 10.5) * dpr, 1), () => {
          choice = i;
          setTool('monster');
        });
        b.dataset.index = i;
        if (c.unreleased) {
          // (v15.7) not in the main game yet - see UNRELEASED_CONTENT in js/level.js
          const tag = document.createElement('small');
          tag.className = 'ed-tag';
          tag.textContent = 'Unreleased';
          b.append(tag);
          b.title = c.label + ' - unreleased: not in the main game yet';
        }
        el.monsters.appendChild(b);
      });
    }
    /** (v15.1) The list for the Exit, Object or Effect tool - whichever is in hand. */
    function buildChoices() {
      el.choices.textContent = '';
      const head = { exit: 'Exits', object: 'Objects', effect: 'Effects' }[tool];
      el.choicesHead.textContent = head || '';
      el.choicesHead.classList.toggle('hidden', !head);
      el.choices.classList.toggle('hidden', !head);
      if (tool === 'exit') {
        for (const c of EXIT_CHOICES) {
          const b = listButton('ed-choice', c.label, c.tip, (ig, w, h, dpr) => drawArt(ig, { art: c.art }, w / 2, h / 2, (c.art === 'door' ? 12 : 10.5) * dpr, 1), () => {
            exitChoice = c.id;
            refreshUi();
          });
          b.dataset.choice = c.id;
          el.choices.appendChild(b);
        }
      } else if (tool === 'object') {
        for (const c of OBJECT_CHOICES) {
          const b = listButton('ed-choice', c.label, c.tip, (ig, w, h, dpr) => drawArt(ig, { art: c.art }, w / 2, h / 2, (c.art === 'puddle' ? 11 : 9.5) * dpr, 1), () => {
            objectChoice = c.id;
            refreshUi();
          });
          b.dataset.choice = c.id;
          el.choices.appendChild(b);
        }
      } else if (tool === 'effect') {
        for (const c of EFFECT_CHOICES) {
          const rgb = EchoEffects.COLOURS[F.EFFECTS[c.id].colours[0]];
          const b = listButton('ed-choice', c.label, c.tip, (ig, w, h) => drawSwatch(ig, rgb, w, h, c.id === 'glow'), () => {
            effectChoice = c.id;
            refreshUi();
          });
          b.dataset.choice = c.id;
          el.choices.appendChild(b);
        }
        const row = document.createElement('div');
        row.className = 'ed-seg';
        for (const s of F.SHAPES) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'ed-shape';
          b.dataset.shape = s;
          b.textContent = SHAPE_NAMES[s];
          b.addEventListener('click', () => {
            env.click();
            effectShape = s;
            refreshUi();
          });
          row.appendChild(b);
        }
        el.choices.appendChild(row);
      }
    }

    /** (v15.1) What can be changed about the thing picked out: an exit's lock, a note's words, a zone's look. */
    function buildInspector() {
      const box_ = el.inspector;
      box_.textContent = '';
      const t = pick;
      const o = pickedObj();
      if (!t || !o) {
        box_.classList.add('hidden');
        return;
      }
      box_.classList.remove('hidden');
      const h = document.createElement('h3');
      box_.appendChild(h);
      const field = (label, input) => {
        const l = document.createElement('label');
        l.className = 'ed-prop';
        const s = document.createElement('span');
        s.textContent = label;
        l.append(s, input);
        box_.appendChild(l);
        return input;
      };
      const select = (label, options, value, onChange) => {
        const s = document.createElement('select');
        for (const [v, text] of options) {
          const op = document.createElement('option');
          op.value = v;
          op.textContent = text;
          s.appendChild(op);
        }
        s.value = value;
        s.addEventListener('change', () => {
          begin();
          onChange(s.value);
          commit();
          s.blur();
        });
        return field(label, s);
      };
      if (t.what === 'start') h.textContent = 'Start';
      else if (t.what === 'enemy') h.textContent = choiceOf(o).label;
      else if (t.what === 'exit') {
        h.textContent = exitLabel(t.index).replace('The exit', 'Exit');
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.checked = !!o.locked;
        c.addEventListener('change', () => {
          begin();
          o.locked = c.checked;
          commit();
          c.blur();
        });
        const l = field('Locked: it needs the key', c);
        l.classList.add('ed-check');
      } else if (t.what === 'object') {
        h.textContent = cap(OBJECT_NAMES[o.kind].replace(/^(a|the) /, ''));
        if (o.kind === 'note') {
          const ta = document.createElement('textarea');
          ta.maxLength = LIMITS.noteText;
          ta.rows = 3;
          ta.spellcheck = false;
          ta.value = o.text;
          ta.addEventListener('focus', () => begin());
          ta.addEventListener('input', () => {
            o.text = ta.value;
          });
          ta.addEventListener('blur', () => {
            const clean = F.cleanNote(ta.value);
            if (clean) o.text = clean;
            else if (pending) {
              o.text = pending.objects[t.index] ? pending.objects[t.index].text : o.text; // (a note cannot be left with nothing written on it)
              say('A note needs something written on it.');
            }
            ta.value = o.text;
            commit();
          });
          field(`Words (${LIMITS.noteText} at most)`, ta);
          select('It is', [['note', 'A note (shown)'], ['recording', 'A recording (spoken)']], o.style || 'note', (v) => {
            o.style = v;
          });
        }
      } else if (t.what === 'effect') {
        h.textContent = `${EchoEffects.KIND_NAMES[o.kind]} · ${o.w} × ${o.h}`;
        select('Kind', EFFECT_CHOICES.map((c) => [c.id, c.label]), o.kind, (v) => {
          o.kind = v;
          if (!F.EFFECTS[v].colours.includes(o.colour)) o.colour = F.EFFECTS[v].colours[0];
        });
        select('Shape', F.SHAPES.map((s) => [s, SHAPE_NAMES[s]]), o.shape, (v) => {
          o.shape = v;
        });
        select('Colour', F.EFFECTS[o.kind].colours.map((c) => [c, EchoEffects.COLOUR_NAMES[c]]), o.colour, (v) => {
          o.colour = v;
        });
        select('Strength', F.INTENSITIES.map((s) => [s, INTENSITY_NAMES[s]]), o.intensity, (v) => {
          o.intensity = v;
        });
        const p = document.createElement('p');
        p.className = 'fine';
        p.textContent = 'Drag the zone to move it; drag its corner to resize it.';
        box_.appendChild(p);
      }
    }

    function setTool(id) {
      tool = TOOLS.some((t) => t.id === id) ? id : 'wall';
      if (tool !== 'select') sel = null;
      message = '';
      buildChoices();
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
      if (m) {
        s.value = `${m.w}x${m.h}`;
        if (el.width) el.width.value = m.w;
        if (el.height) el.height.value = m.h;
      }
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
      m.title = F.cleanTitle(el.title.value);
      el.title.value = m.title;
      commit();
    });
    const enterBlurs = (input) =>
      input.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
          e.preventDefault();
          input.blur();
        }
      });
    enterBlurs(el.title);

    // ---------------------------------------------------------------- Level settings (v15.1)
    function buildSettings() {
      // the exact size
      for (const [inp, lo, hi] of [[el.width, LIMITS.minW, LIMITS.maxW], [el.height, LIMITS.minH, LIMITS.maxH]]) {
        inp.min = lo;
        inp.max = hi;
        inp.addEventListener('change', () => {
          if (!m) return;
          setSize(+el.width.value, +el.height.value);
        });
        enterBlurs(inp);
      }
      // the title card's line
      el.card.maxLength = LIMITS.titleCard;
      el.card.addEventListener('focus', () => begin());
      el.card.addEventListener('input', () => {
        if (m) m.titleCard = el.card.value;
      });
      el.card.addEventListener('blur', () => {
        if (!m) return;
        m.titleCard = F.cleanCard(el.card.value);
        el.card.value = m.titleCard;
        commit();
      });
      enterBlurs(el.card);
      // the palette: the player's own, or one of the game's
      el.palette.textContent = '';
      const own = document.createElement('option');
      own.value = '';
      own.textContent = "The player's own colours";
      el.palette.appendChild(own);
      for (const p of EchoPalette.list()) {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.label;
        el.palette.appendChild(o);
      }
      el.palette.addEventListener('change', () => {
        if (!m) return;
        begin();
        m.palette = el.palette.value;
        commit();
        el.palette.blur();
      });
      // the difficulty: a rating, and (Custom only) three scales
      el.rating.textContent = '';
      for (const r of F.RATINGS) {
        const o = document.createElement('option');
        o.value = r;
        o.textContent = F.ratingLabel(r);
        el.rating.appendChild(o);
      }
      el.rating.addEventListener('change', () => {
        if (!m) return;
        begin();
        m.difficulty = F.difficulty({ ...m.difficulty, rating: el.rating.value });
        commit();
        el.rating.blur();
      });
      el.tuning.textContent = '';
      for (const k of Object.keys(F.TUNING)) {
        const t = F.TUNING[k];
        const row = document.createElement('label');
        row.className = 'ed-tune';
        const name = document.createElement('span');
        name.textContent = t.label;
        const val = document.createElement('b');
        val.className = 'ed-tune-val';
        const r = document.createElement('input');
        r.type = 'range';
        r.min = t.min;
        r.max = t.max;
        r.step = t.step;
        r.dataset.key = k;
        r.addEventListener('pointerdown', () => begin());
        r.addEventListener('focus', () => begin());
        r.addEventListener('input', () => {
          if (!m) return;
          begin();
          m.difficulty = F.difficulty({ ...m.difficulty, rating: 'custom', [k]: +r.value });
          val.textContent = `× ${m.difficulty[k].toFixed(2)}`;
        });
        r.addEventListener('change', () => commit());
        row.append(name, val, r);
        el.tuning.appendChild(row);
      }
      el.tuneReset.addEventListener('click', () => {
        if (!m) return;
        env.click();
        begin();
        m.difficulty = F.difficulty({ rating: m.difficulty.rating });
        commit();
        say('The tuning is back to its defaults.');
      });
      const tabTo = (which) => {
        tab = which;
        refreshTabs();
        render();
      };
      el.tabBuild.addEventListener('click', () => {
        env.click();
        tabTo('build');
      });
      el.tabSettings.addEventListener('click', () => {
        env.click();
        tabTo('settings');
      });
    }
    function refreshTabs() {
      el.paneBuild.classList.toggle('hidden', tab !== 'build');
      el.paneSettings.classList.toggle('hidden', tab !== 'settings');
      el.tabBuild.classList.toggle('on', tab === 'build');
      el.tabSettings.classList.toggle('on', tab === 'settings');
      el.tabBuild.setAttribute('aria-selected', tab === 'build' ? 'true' : 'false');
      el.tabSettings.setAttribute('aria-selected', tab === 'settings' ? 'true' : 'false');
    }
    /** Put the model's settings into the Level settings tab. */
    function settingsUi() {
      if (!m) return;
      if (document.activeElement !== el.card) el.card.value = m.titleCard;
      el.palette.value = m.palette || '';
      el.rating.value = m.difficulty.rating;
      const custom = m.difficulty.rating === 'custom';
      el.tuning.querySelectorAll('input[type=range]').forEach((r) => {
        const k = r.dataset.key;
        r.value = m.difficulty[k];
        r.disabled = !custom;
        r.closest('.ed-tune').classList.toggle('off', !custom);
        r.closest('.ed-tune').querySelector('.ed-tune-val').textContent = `× ${Number(m.difficulty[k]).toFixed(2)}`;
      });
      el.tuneReset.disabled = !custom || Object.keys(F.TUNING).every((k) => m.difficulty[k] === 1);
    }

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
      const current = tool === 'exit' ? exitChoice : tool === 'object' ? objectChoice : tool === 'effect' ? effectChoice : null;
      el.choices.querySelectorAll('.ed-choice').forEach((b) => {
        const onNow = b.dataset.choice === current;
        b.classList.toggle('on', onNow);
        b.setAttribute('aria-pressed', onNow ? 'true' : 'false');
      });
      el.choices.querySelectorAll('.ed-shape').forEach((b) => {
        const onNow = b.dataset.shape === effectShape;
        b.classList.toggle('on', onNow);
        b.setAttribute('aria-pressed', onNow ? 'true' : 'false');
      });
      el.undo.disabled = !past.length && !pending;
      el.redo.disabled = !future.length;
      el.del.disabled = !(pick || sel);
      el.del.textContent = pick ? `Delete ${pick.what === 'enemy' ? 'monster' : pick.what === 'effect' ? 'effect' : pick.what === 'object' ? 'object' : pick.what}` : sel ? 'Clear selection' : 'Delete';
      // the problems: each one says what to do about it
      el.problems.textContent = '';
      if (verdict.playable) {
        const li = document.createElement('p');
        li.className = 'ok';
        li.textContent = m.exits.length > 1 ? 'Ready to play: it has a start, exits and a way to one of them.' : 'Ready to play: it has a start, an exit and a way between them.';
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
      // (the inspector is rebuilt only when something else is not being typed into it)
      const typing = document.activeElement && el.inspector.contains(document.activeElement) && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
      if (!typing) buildInspector();
      settingsUi();
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
    buildSettings();
    refreshTabs();

    return {
      TOOLS,
      SIZES,
      /** Open a level (a normalised doc) - or a new, empty one when there is none. */
      open(doc) {
        m = fromDoc(doc || F.blank());
        everSaved = !!doc;
        past = [];
        future = [];
        pending = null;
        sel = null;
        pick = null;
        drag = null;
        hover = null;
        message = '';
        tool = 'wall';
        tab = 'build';
        // (every level starts with the plain choices - a locked exit picked for the last one is not carried over)
        exitChoice = 'open';
        objectChoice = 'puddle';
        effectChoice = 'light';
        effectShape = 'rect';
        saved = snap();
        buildMonsters();
        buildChoices();
        refreshTabs();
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
      /** ?debug / tests (v15.1): pick what the Exit / Object / Effect tools place, and which tab is showing. */
      setChoice(kind, id) {
        if (kind === 'exit') exitChoice = id;
        else if (kind === 'object') objectChoice = id;
        else if (kind === 'effect') effectChoice = id;
        else if (kind === 'shape') effectShape = id;
        refreshUi();
      },
      setTab(which) {
        tab = which === 'settings' ? 'settings' : 'build';
        refreshTabs();
        render();
      },
      state: () =>
        m
          ? {
              tool,
              tab,
              choice: choices[choice] ? { kind: choices[choice].kind, variant: choices[choice].variant, label: choices[choice].label } : null,
              choices: choices.map((c) => c.label),
              exitChoice,
              objectChoice,
              effectChoice,
              effectShape,
              title: m.title,
              size: { w: m.w, h: m.h },
              walls: m.walls.reduce((a, v) => a + v, 0),
              start: pt(m.start),
              exit: m.exits[0] ? pt(m.exits[0]) : null, // (v15.0's tests read the one exit)
              exits: m.exits.map((e) => ({ ...e })),
              enemies: m.enemies.map((e) => ({ ...e })),
              objects: m.objects.map((o) => ({ ...o })),
              effects: m.effects.map((f) => ({ ...f })),
              titleCard: m.titleCard,
              palette: m.palette,
              difficulty: { ...m.difficulty },
              selection: sel ? { ...sel } : null,
              pick: pick ? { ...pick } : null,
              picked: pick && pick.what === 'enemy' ? pick.index : -1, // (v15.0's name for a picked monster)
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
