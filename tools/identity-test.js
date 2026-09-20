'use strict';

/**
 * "Visual changes must not change the game": run the same seeded, scripted game and fingerprint every frame of it.
 * Load this into a page opened with ?debug (in the build to test AND in the build to compare it with; the same
 * script works on both) and compare the fingerprints:
 *
 *   const s = document.createElement('script'); s.src = '/tools/identity-test.js'; document.head.appendChild(s);
 *   IdentityTest.run({ mode: 'hard', level: 9, seed: 7, frames: 900 })   ->   { hash, frames, restarts, artRandomCalls, ... }
 *
 * What makes two runs comparable: the same maze seed, the same scripted keys (movement, ripples, crouching, the
 * decoy), and the same random numbers. Math.random is replaced by two seeded streams - one for audio.js (whose
 * polyphony limit depends on the wall clock, so its draw count differs from run to run) and one for everything else -
 * so the simulation sees exactly the same sequence every time. The fingerprint covers the player, every enemy
 * (kind, position, state) and the level clock after every step. `draw` (default 3) also renders every Nth frame, so
 * the drawing code runs between steps; `artRandomCalls` counts Math.random calls made from art.js (it must be 0).
 * `noArt: true` swaps the art for no-ops, to show the game plays out the same with the art switched off.
 * `reveal: N` also, every N frames, stands the player beside a disguised mimic and pings it, so the mimic really does
 * turn into an echo monster during the run (`mimicRevealed` counts how often); `cues: true` runs with Visual cues on.
 */
window.IdentityTest = (() => {
  const E = window.__echo;
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code }));
  const lcg = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };
  const stream = (seed) => {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function run(o) {
    const { mode = 'normal', level = 9, seed = 1, frames = 900, draw = 3, noArt = false, cues = false } = o;
    const realRandom = Math.random;
    const gameRnd = stream(seed * 7919 + 13);
    const audioRnd = stream(seed * 104729 + 29);
    let artCalls = 0;
    Math.random = function () {
      const st = new Error().stack || '';
      if (st.includes('art.js')) artCalls++;
      return st.includes('audio.js') ? audioRnd() : gameRnd();
    };
    const ART = typeof EchoArt !== 'undefined' ? EchoArt : null; // (a top-level const is not a window property)
    const realDraw = ART && ART.draw;
    const realMorph = ART && ART.mimicMorph;
    if (noArt && ART) {
      ART.draw = () => {};
      ART.mimicMorph = () => {};
    }
    try {
      E.features({ cues });
      E.setMode(mode);
      E.seed(seed);
      E.go(level);
      const keysDown = new Set();
      const set = (code, on) => {
        if (on && !keysDown.has(code)) {
          keysDown.add(code);
          key(code, true);
        } else if (!on && keysDown.has(code)) {
          keysDown.delete(code);
          key(code, false);
        }
      };
      const pick = lcg(seed * 31 + level);
      let h = 2166136261 >>> 0;
      const mix = (str) => {
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 16777619) >>> 0;
        }
      };
      const r6 = (v) => (Math.round(v * 1e6) / 1e6).toString();
      let restarts = 0;
      let echoNow = 0;
      let mimicsNow = 0;
      const mimicsStart = E.info().enemies.filter((e) => e.kind === 'mimic').length;
      let mimicRevealed = 0; // how many times a disguised mimic turned into an echo monster during the run (the level restarts when you are caught)
      let heading = [0, 0];
      const stats = { pings: 0, crouches: 0, drops: 0 };
      for (let f = 0; f < frames; f++) {
        // scripted inputs: pick a new heading now and then, ping and crouch at random, drop the decoy sometimes
        if (f % 40 === 0) {
          const r = pick();
          heading = r < 0.15 ? [0, 0] : [Math.round(pick() * 2) - 1, Math.round(pick() * 2) - 1];
        }
        set('KeyD', heading[0] > 0);
        set('KeyA', heading[0] < 0);
        set('KeyS', heading[1] > 0);
        set('KeyW', heading[1] < 0);
        if (f % 25 === 0 && pick() < 0.5) {
          key('Space', true);
          key('Space', false);
          stats.pings++;
        }
        if (f % 90 === 0) {
          const c = pick() < 0.25;
          set('ShiftLeft', c);
          if (c) stats.crouches++;
        }
        if (f % 150 === 75 && pick() < 0.6) {
          key('KeyE', true);
          key('KeyE', false);
          stats.drops++;
        }
        if (o.reveal && f % o.reveal === 5) {
          // stand a little way from a disguised mimic (in an open neighbouring tile) and ping it, so it turns into an echo monster
          const inf0 = E.info();
          const mm = inf0.enemies.find((e) => e.kind === 'mimic');
          if (mm && inf0.state === 'play') {
            const lv = inf0.level;
            const open = (x, y) => {
              const tx = Math.floor(x / 40);
              const ty = Math.floor(y / 40);
              return tx >= 0 && ty >= 0 && tx < lv.W && ty < lv.H && !lv.walls[ty * lv.W + tx];
            };
            for (const [dx, dy] of [[-34, 0], [34, 0], [0, -34], [0, 34]]) {
              if (open(mm.x + dx, mm.y + dy)) {
                E.tp(mm.x + dx, mm.y + dy);
                key('Space', true);
                key('Space', false);
                stats.pings++;
                break;
              }
            }
          }
        }
        E.step(1 / 60);
        const inf = E.info();
        if (inf.state !== 'play') {
          mix('|restart|' + inf.state);
          restarts++;
          for (const c of [...keysDown]) set(c, false);
          E.go(level);
          continue;
        }
        const p = inf.player;
        mix(`|${f}|${r6(p.x)},${r6(p.y)},${p.crouching ? 1 : 0},${r6(p.smell)}|${r6(inf.levelTime)}|${inf.ripples}`);
        for (const e of inf.enemies) mix(`;${e.kind},${r6(e.x)},${r6(e.y)},${e.state},${r6(e.timer)}`);
        if (draw && f % draw === 0) E.draw();
        const m = inf.enemies.filter((e) => e.kind === 'mimic').length;
        if (m < mimicsNow) mimicRevealed += mimicsNow - m;
        mimicsNow = m;
        echoNow = inf.enemies.filter((e) => e.kind === 'echo').length;
      }
      for (const c of [...keysDown]) set(c, false);
      return { mode, level, seed, frames, hash: h.toString(16), restarts, artRandomCalls: artCalls, mimicsStart, mimicRevealed, echoMonstersAtEnd: echoNow, ...stats, artLoaded: !!ART, noArt };
    } finally {
      Math.random = realRandom;
      if (noArt && ART) {
        ART.draw = realDraw;
        ART.mimicMorph = realMorph;
      }
    }
  }
  return { run };
})();
