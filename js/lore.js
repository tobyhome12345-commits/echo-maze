'use strict';

/**
 * LORE FRAGMENTS - notes and recordings left behind by the explorers who came through the maze before you.
 *
 * One per level on levels 1-12, lying somewhere OFF the way to the exit. Nothing marks them: a ripple finds
 * one exactly the way it finds a puddle or a sonar decoy (a flat thing on the floor that the wave passes over
 * and lights up - js/game.js castRipple, the `flats` list), and the moment YOUR wave reaches it, it is read.
 * A written note shows on screen; a recording plays in the same formant voice the cutscenes use, typed out as
 * it speaks. Whatever has been found is kept for good and can be read again on the Fragments screen.
 *
 * They are connective tissue between the seven cutscenes, not a replacement for them, and they lean, quietly
 * and one level at a time, towards what is waiting in level 13. They never name it.
 *
 * THE RULE THIS FILE KEEPS: A FRAGMENT CANNOT MOVE ANYTHING ELSE. It is placed AFTER generateLevel() has
 * finished, from its own random stream (a separate mulberry32 seeded from the run seed and the level with a
 * different constant), and reads the finished level without writing to any of it. The generator's own
 * sequence is never drawn from, Math.random is never called, and so every maze, monster, puddle, decoy and
 * seed on levels 1-12 is exactly what it was (tools/generator-fingerprint.js). It never blocks you, never
 * blocks a ripple, and nothing a monster reads can see it.
 *
 *   place(level, n, modeId, runSeed)  where this level's fragment lies in this maze, or null
 *   createReader(env)                 the line on screen / the voice when one is found
 *   found(), markFound(id), ...       what has been found, kept in localStorage (`echomaze.lore`)
 */
const EchoLore = (() => {
  const KEY = 'echomaze.lore'; // a JSON array of fragment ids. Global, not per mode: a find is a find.
  const R = 11; // px: how big it is drawn. It is flat and has no collision at all - nothing ever bumps into it.
  const CPS = 20; // characters per second a recording is typed out at (the cutscenes' own subtitle speed)

  /**
   * How likely this level's fragment is to be lying somewhere in a given maze, by difficulty. Easy rewards
   * looking around, so it is always there. Hardcore keeps its harsher tone and has none at all. The roll is
   * made once per maze from the fragment's own stream, so it does not change on a retry, and it is NESTED: a
   * maze that has its fragment on Hard has it on Normal and on Easy too.
   */
  const CHANCE = { easy: 1, normal: 0.8, hard: 0.5, hardcore: 0 };

  /**
   * The fragments, in order. `kind` 'note' is read on screen; 'log' is a recording, spoken by the formant
   * voice while the words are typed out. `voice` shapes who is speaking: pitch (x the cutscenes' explorer),
   * shake (how unsteady), cps (how fast), vol. `cut` ends the recording in static.
   *
   * The explorers are unnamed and ungendered, like every explorer in this game: no names, no pronouns.
   */
  const FRAGMENTS = [
    { id: 'f01', level: 1, kind: 'note', text: 'Day 1. Three of us made it this far. Two now.' },
    // The owner's line was "Don't run when it sings." That is the opposite of how the Singer works - its
    // song marks where you ARE and it leaps there, and its own cutscene ends "If its song finds you, keep
    // moving" - so a player who trusted it on level 12 would die for it. "listening" makes it true of the
    // echo monster, which is also the thing that first appears on level 2. (Owner told; one string to revert.)
    { id: 'f02', level: 2, kind: 'note', text: "Don't run while it's listening. It only finds you if you're moving." },
    { id: 'f03', level: 3, kind: 'note', text: 'Left a decoy against the north wall. Worked once. Use it once.' },
    { id: 'f04', level: 4, kind: 'note', text: "There's a fourth sound in this maze. I haven't given it a name. I don't want to." },
    // the first recording, and the first voice that sounds frightened rather than careful
    { id: 'f05', level: 5, kind: 'log', text: "...testing. If the ripple's catching this, you're already closer than I was.", voice: { pitch: 1.22, shake: 0.1, cps: 21, vol: 0.9 } },
    { id: 'f06', level: 6, kind: 'note', text: "None of them have eyes. That's not comfort, it's the whole problem." },
    { id: 'f07', level: 7, kind: 'note', text: "If you're reading this, don't go past the split corridor. Not yet. It's listening there." },
    { id: 'f08', level: 8, kind: 'note', text: "Found a door that shouldn't be there." },
    { id: 'f09', level: 9, kind: 'note', text: 'Not opening it. Not tonight.' },
    { id: 'f10', level: 10, kind: 'note', text: "It's not hunting. It's waiting. That's worse." },
    // the last explorer, twice: lower, slower, and cut off
    { id: 'f11', level: 11, kind: 'log', text: "There's something that isn't hunting. It's just... waiting.", voice: { pitch: 0.86, shake: 0.03, cps: 17, vol: 0.85 }, cut: true },
    { id: 'f12', level: 12, kind: 'log', text: "If you hear nothing at all, that's when you run.", voice: { pitch: 0.84, shake: 0.04, cps: 15, vol: 0.75 } },
  ];

  /**
   * Found only on the Fragments screen, and only once all twelve are. A DRAFT LINE written for this build (the
   * owner asked for "one small bonus scene or line" and did not supply one): replace freely. It keeps the same
   * rules - it names nothing, and says nothing about where anyone was taken.
   */
  const BONUS = { id: 'f13', level: 0, kind: 'note', bonus: true, text: 'Every one of these stops before the last room. Nobody writes in there.' };

  const TOTAL = FRAGMENTS.length;
  const byId = (id) => FRAGMENTS.find((f) => f.id === id) || (id === BONUS.id ? BONUS : null);
  const forLevel = (n) => FRAGMENTS.find((f) => f.level === n) || null;
  const isId = (id) => FRAGMENTS.some((f) => f.id === id);

  // ------------------------------------------------------------ what is found
  // Every storage access in a try/catch, like everything else that saves: storage can be off, full or blocked.
  // With it blocked, a find still counts for this session (`mem`), and simply is not remembered.
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(v) ? v.filter(isId) : [];
    } catch (e) {
      return [];
    }
  }
  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }
  let mem = load();

  /** Everything found so far, in level order. (Re-reads storage, so another tab's finds show up too.) */
  function found() {
    for (const id of load()) if (!mem.includes(id)) mem.push(id);
    return FRAGMENTS.filter((f) => mem.includes(f.id)).map((f) => f.id);
  }
  const isFound = (id) => mem.includes(id);
  const count = () => found().length;
  const bonusUnlocked = () => count() >= TOTAL;

  /** It has just been read. Returns whether it is new, how many are found now, and whether that was saved. */
  function markFound(id) {
    if (!isId(id)) return { isNew: false, count: count(), saved: false };
    found();
    if (mem.includes(id)) return { isNew: false, count: mem.length, saved: true };
    mem.push(id);
    const saved = save(FRAGMENTS.filter((f) => mem.includes(f.id)).map((f) => f.id));
    return { isNew: true, count: mem.length, saved };
  }

  /** ?debug only: set the found list outright (an empty array forgets everything). */
  function setFound(ids) {
    mem = (ids || []).filter(isId);
    return save(mem);
  }

  // ----------------------------------------------------------------- placement
  /**
   * Where this level's fragment lies in this maze - or null if it has none (no fragment for this level, the
   * difficulty's roll came up empty, or there is simply nowhere suitable).
   *
   * OFF THE WAY TO THE EXIT, measured properly: for every open tile, `extra` = dS + dE - L is how many tiles
   * out of your way it is to walk there and carry on (dS from the start, dE from the exit, L the shortest
   * route). A tile on any shortest route has extra 0. The fragment wants extra >= 4 - at least two tiles off
   * the route and back - and a DEAD END if there is one, because that is where exploring leads. Failing that
   * any tile at extra >= 4, then >= 2. It keeps clear of the start (4 tiles), the exit, and a tile's width of
   * every monster's spawn, puddle and decoy, so finding it is never the same thing as walking into something.
   *
   * Pure: it reads the finished level and returns a new object. It writes nothing to the level and draws only
   * from its OWN stream (see the top of this file).
   */
  function place(level, n, modeId, runSeed) {
    const frag = forLevel(n);
    const chance = CHANCE[modeId] || 0;
    if (!frag || chance <= 0 || !level || level.warden) return null;
    const rand = mulberry32((runSeed ^ Math.imul(n, 0x85ebca6b) ^ 0x10a3f7c1) >>> 0);
    const roll = rand(); // the first draw decides whether it is here at all, whatever the mode...
    if (roll >= chance) return null;
    const W = level.W;
    const H = level.H;
    const blocked = level.blocked;
    const tileOf = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
    const sIdx = tileOf(level.start);
    const eIdx = tileOf(level.exit);
    const dS = bfsDist(blocked, W, H, sIdx);
    const dE = bfsDist(blocked, W, H, eIdx);
    const L = dS[eIdx];
    if (L < 0) return null;

    const avoid = new Uint8Array(W * H);
    const keepClear = (tx, ty, r) => {
      for (let y = ty - r; y <= ty + r; y++) {
        for (let x = tx - r; x <= tx + r; x++) if (x >= 0 && y >= 0 && x < W && y < H) avoid[y * W + x] = 1;
      }
    };
    keepClear(sIdx % W, (sIdx / W) | 0, 0);
    keepClear(eIdx % W, (eIdx / W) | 0, 1);
    for (const p of level.puddles || []) keepClear(Math.floor(p.x / TILE), Math.floor(p.y / TILE), 1);
    if (level.decoy) keepClear(Math.floor(level.decoy.x / TILE), Math.floor(level.decoy.y / TILE), 1);
    for (const e of level.enemies || []) keepClear(Math.floor(e.x / TILE), Math.floor(e.y / TILE), 1);

    const open = (i) => !blocked[i];
    const pools = [[], [], []]; // dead ends well off the route; any tile well off it; any tile off it at all
    for (let i = 0; i < W * H; i++) {
      if (blocked[i] || avoid[i] || dS[i] < 4 || dE[i] < 0) continue;
      const extra = dS[i] + dE[i] - L;
      if (extra < 2) continue;
      const x = i % W;
      const y = (i / W) | 0;
      let nb = 0;
      if (x > 0 && open(i - 1)) nb++;
      if (x < W - 1 && open(i + 1)) nb++;
      if (y > 0 && open(i - W)) nb++;
      if (y < H - 1 && open(i + W)) nb++;
      if (extra >= 4 && nb === 1) pools[0].push(i);
      if (extra >= 4) pools[1].push(i);
      pools[2].push(i);
    }
    const pool = pools.find((p) => p.length);
    if (!pool) return null;
    const i = pool[Math.floor(rand() * pool.length)]; // ...and the second, where
    const tx = i % W;
    const ty = (i / W) | 0;
    return {
      id: frag.id,
      kind: frag.kind,
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      r: R,
      tx,
      ty,
      extra: dS[i] + dE[i] - L, // tiles out of your way (for the tests)
      deadEnd: pool === pools[0],
      read: false, // read on this attempt at the level (it is read at most once per attempt)
    };
  }

  // ------------------------------------------------------------------ reading
  /**
   * The line on screen when one is found. Driven by the GAME's clock (update(dt) from updatePlay), so pausing
   * holds it exactly where it is - and the AudioContext, which pause suspends, holds the voice in step.
   *   env.el = { box, head, line }    env.audio, env.cues
   */
  function createReader(env) {
    const el = env.el;
    let cur = null; // { frag, t, typeFor, total, n, cut }
    let voice = null; // the scheduled recording, so it can be stopped when the line is taken away

    const label = (f) => (f.kind === 'log' ? 'A recording' : 'A note');
    function headOf(f, info) {
      if (!info || !info.isNew) return label(f);
      if (info.count >= TOTAL) return `${label(f)} · all ${TOTAL} found · one more waits in Fragments`;
      return `${label(f)} · ${info.count} of ${TOTAL} found`;
    }

    function show(f, info) {
      hide();
      if (!f || !el.box) return;
      const log = f.kind === 'log';
      const v = f.voice || {};
      const cps = v.cps || CPS;
      const typeFor = log ? f.text.length / cps : 0;
      // notes stay long enough to read at an unhurried pace; recordings stay a moment after the last word -
      // except the one that is cut off, which is cut off
      const hold = log ? (f.cut ? 0.75 : 2.2) : Math.min(8, Math.max(3.8, 2.4 + f.text.length * 0.055));
      cur = { frag: f, t: 0, cps, typeFor, total: typeFor + hold, n: log ? 0 : f.text.length, cut: false };
      el.head.textContent = headOf(f, info);
      el.line.textContent = log ? '' : f.text;
      el.box.classList.remove('cut');
      el.box.classList.toggle('log', log);
      el.box.classList.add('show');
      if (env.audio) {
        if (log) {
          env.audio.loreLog(typeFor + (f.cut ? 0.75 : 0.6));
          voice = env.audio.speak(f.text, v);
        } else env.audio.loreNote();
      }
      if (env.cues) env.cues.caption(log ? '[a recording crackles on]' : '[paper, unfolding]');
    }

    function update(dt) {
      if (!cur) return;
      cur.t += dt;
      const f = cur.frag;
      if (f.kind === 'log' && cur.n < f.text.length) {
        const n = Math.min(f.text.length, Math.floor(cur.t * cur.cps));
        if (n !== cur.n) {
          cur.n = n;
          el.line.textContent = f.text.slice(0, n);
        }
      }
      if (f.cut && !cur.cut && cur.t >= cur.total) {
        // CUT, not faded: the line is gone the instant the static hits
        cur.cut = true;
        if (env.audio) env.audio.loreStatic();
        if (env.cues) env.cues.caption('[static]');
        el.box.classList.add('cut');
        hide();
        return;
      }
      if (cur.t >= cur.total) hide();
    }

    function hide() {
      if (voice) voice.stop();
      voice = null;
      cur = null;
      if (el.box) el.box.classList.remove('show');
    }

    const state = () => (cur ? { id: cur.frag.id, t: +cur.t.toFixed(2), typed: cur.n, of: cur.frag.text.length, total: +cur.total.toFixed(2), head: el.head.textContent, line: el.line.textContent } : null);

    return { show, update, hide, state };
  }

  return { KEY, R, CPS, CHANCE, FRAGMENTS, BONUS, TOTAL, byId, forLevel, place, found, isFound, count, bonusUnlocked, markFound, setFound, createReader };
})();
