'use strict';

/**
 * A bot that PLAYS levels 14-16 (js/story.js) through the real controls - key presses, not teleports - so the
 * levels can be proved completable, and the Warden's chase measured, in every difficulty mode.
 * Load into a page opened with ?debug:
 *
 *   const s = document.createElement('script'); s.src = '/tools/story-bot.js'; document.head.appendChild(s);
 *   StoryBot.run({ level: 14, mode: 'normal' })   ->   { cleared, caught, seconds, ... }
 *
 * It walks the shortest way (a BFS over the level's live `blocked` map, so a door that has opened is a way
 * through) towards its current goal, one tile at a time, with the arrow keys. It sends a ripple every
 * `pingEvery` seconds like a player would (it changes nothing about where it goes). On:
 *   14  goal 1 is the key, goal 2 the door (it pushes into it), goal 3 the way out. `tryDoorFirst: true` goes to
 *       the door before the key, to prove it will not open; `skipKey: true` never picks the key up at all.
 *   15  goal 1 is the light (it walks until the reveal takes the controls), then the way out.
 *   16  the way out.
 * `detours: [{ at: [tx, ty], into: [tx, ty] }]` - a MISTAKE: on reaching tile `at`, walk to `into` (a dead end)
 * and come back, as a player taking a wrong turn would. `pauses: [{ at: [tx, ty], seconds }]` stands still there.
 * The result says whether it cleared the level, was caught, how long it took, and how close the Warden came
 * ALONG THE WAY (`minGap`, px of path between their tiles, and `gaps`, the same once a second) - the straight
 * line through the walls says nothing about whether it can reach you.
 */
window.StoryBot = (() => {
  const E = window.__echo;
  const TILE = 40;
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code }));

  function run(o) {
    const { level: n, mode = 'normal', maxSeconds = 120, pingEvery = 1.6, detours = [], pauses = [] } = o;
    E.audio.setMuted(true);
    E.setMode(mode);
    E.go(n);
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
    const info = () => E.info();
    const lv = () => info().level;
    const st = () => E.storyState();
    const tileOf = (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)];

    /** The next tile centre on the shortest way from (x, y) to tile (gx, gy), over the live map. */
    function nextStep(x, y, gx, gy) {
      const L = lv();
      const W = L.W;
      const [sx, sy] = tileOf(x, y);
      if (sx === gx && sy === gy) return { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE, left: 0 };
      const d = bfsDist(L.blocked, W, L.H, gy * W + gx);
      let best = null;
      let bd = d[sy * W + sx] >= 0 ? d[sy * W + sx] : 1e9;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = (sy + dy) * W + sx + dx;
        if (d[i] >= 0 && d[i] < bd) {
          bd = d[i];
          best = [sx + dx, sy + dy];
        }
      }
      if (!best) return null;
      return { x: (best[0] + 0.5) * TILE, y: (best[1] + 0.5) * TILE, left: bd };
    }

    function steerTo(tx, ty) {
      const p = info().player;
      const dx = tx - p.x;
      const dy = ty - p.y;
      set('ArrowRight', dx > 2.5);
      set('ArrowLeft', dx < -2.5);
      set('ArrowDown', dy > 2.5);
      set('ArrowUp', dy < -2.5);
    }

    const out = { level: n, mode, cleared: false, caught: false, seconds: 0, minGap: Infinity, gapAtExit: null, gaps: [], phases: [], keyFirstLocked: null, events: [] };
    let goal = null;
    let stage = 0;
    let pingT = 0.8;
    let detour = null; // { into, back }
    let pausing = 0;
    const doneDetours = new Set();
    const donePauses = new Set();
    let lastPhase = null;
    let lastGap = null;
    const dt = 1 / 60;
    const startLevel = n;
    for (let f = 0; f < maxSeconds * 60; f++) {
      const I = info();
      if (I.state !== 'play') {
        if (I.state === 'ending') out.cleared = true; // level 16's way out: the end of the game so far
        else if (I.state === 'caught' || I.state === 'title') out.caught = true;
        break;
      }
      if (I.levelNum !== startLevel) {
        out.cleared = true;
        break;
      }
      const S = st();
      if (S.phase !== lastPhase) {
        out.phases.push(`${S.phase}@${out.seconds.toFixed(2)}`);
        lastPhase = S.phase;
      }
      const p = I.player;
      const h = E.hunter();
      if (h && h.state === 'hunt') {
        // the gap that matters is ALONG THE WAY, not through the walls: tiles of path between the two, in px
        const L0 = I.level;
        const ht = tileOf(h.x, h.y);
        const pt = tileOf(p.x, p.y);
        const d = bfsDist(L0.blocked, L0.W, L0.H, ht[1] * L0.W + ht[0])[pt[1] * L0.W + pt[0]];
        const gap = d >= 0 ? d * TILE : Infinity;
        out.minGap = Math.min(out.minGap, gap);
        lastGap = gap;
        if (f % 60 === 0) out.gaps.push(gap === Infinity ? null : gap);
      }
      // ---- what to walk to
      const L = I.level;
      if (n === 14) {
        if (o.tryDoorFirst && stage === 0) goal = [L.story.door.tx - 1, L.story.door.ty];
        else if (!S.key.taken && !o.skipKey && stage <= 1) {
          stage = 1;
          goal = [Math.floor(L.story.key.x / TILE), Math.floor(L.story.key.y / TILE)];
        } else if (L.story.door.solid) {
          stage = 2;
          goal = [L.story.door.tx - 1, L.story.door.ty];
        } else {
          stage = 3;
          goal = tileOf(L.exit.x, L.exit.y);
        }
        if (o.tryDoorFirst && stage === 0 && S.door.tried > 0) {
          out.keyFirstLocked = { tried: S.door.tried, solid: S.door.solid, seconds: +out.seconds.toFixed(2) };
          stage = 1;
        }
      } else if (n === 15) {
        if (S.phase === 'dark' || S.phase === 'lure') goal = [29, 11];
        else goal = tileOf(L.exit.x, L.exit.y);
      } else goal = tileOf(L.exit.x, L.exit.y);
      // ---- mistakes on purpose
      const here = tileOf(p.x, p.y);
      for (const d of detours) {
        const k = d.at.join(',');
        if (!doneDetours.has(k) && here[0] === d.at[0] && here[1] === d.at[1]) {
          doneDetours.add(k);
          detour = { into: d.into, back: d.at, leg: 0 };
          out.events.push(`detour ${k}@${out.seconds.toFixed(2)}`);
        }
      }
      for (const q of pauses) {
        const k = q.at.join(',');
        if (!donePauses.has(k) && here[0] === q.at[0] && here[1] === q.at[1]) {
          donePauses.add(k);
          pausing = q.seconds;
          out.events.push(`pause ${k}@${out.seconds.toFixed(2)}`);
        }
      }
      if (detour) {
        const tgt = detour.leg === 0 ? detour.into : detour.back;
        if (here[0] === tgt[0] && here[1] === tgt[1]) {
          if (detour.leg === 0) detour.leg = 1;
          else detour = null;
        }
        if (detour) goal = detour.leg === 0 ? detour.into : detour.back;
      }
      // ---- move
      if (pausing > 0) {
        pausing -= dt;
        release();
      } else if (S.locked) release();
      else {
        const s = nextStep(p.x, p.y, goal[0], goal[1]);
        if (s) {
          // push on into the door / the light / the goal tile's centre
          if (s.left === 0) steerTo(n === 14 && stage === 2 ? L.story.door.x : s.x, n === 14 && stage === 2 ? L.story.door.y : s.y);
          else steerTo(s.x, s.y);
        } else release();
      }
      pingT -= dt;
      if (pingT <= 0 && !S.locked) {
        pingT = pingEvery;
        key('Space', true);
        key('Space', false);
      }
      if (h && h.state === 'hunt' && Math.hypot(L.exit.x - p.x, L.exit.y - p.y) < L.exit.r + 12 && out.gapAtExit === null) out.gapAtExit = lastGap;
      E.step(dt);
      out.seconds += dt;
    }
    release();
    out.seconds = +out.seconds.toFixed(2);
    out.minGap = out.minGap === Infinity ? null : +out.minGap.toFixed(1);
    out.endState = info().state;
    out.endLevel = info().levelNum;
    return out;
  }

  return { run };
})();
