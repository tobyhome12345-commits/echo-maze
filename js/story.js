'use strict';

/**
 * LEVELS 14, 15 AND 16 - AFTER THE CAPTURE.
 *
 * Level 13 ends with the player taken. These three follow on from it, and they are built the way 13 is: each is
 * hand-drawn, the same every time and in every difficulty mode, and never touches the level generator's random
 * numbers (mulberry32) or Math.random - so nothing on levels 1-12 can move because of them.
 *
 *   14  THE GAOL. You wake in a cell. Nothing in here can hurt you; the gaol's door is locked, and somewhere
 *       inside is the key. Water drips from the roof, and every drop is a small ripple of its own that lights a
 *       little of the stone and the bars around it. Find the key, open the door, walk out.
 *   15  THE FALSE EXIT. Partway through, there is LIGHT at the end of a long straight passage - warm, and with a
 *       softer sound than anything down here, as if the maze opens onto the world. It is the Warden. When you
 *       are close it puts the light out and wakes, a sealed passage behind you cracks open in the shaking, and
 *       it comes after you for the rest of the level. It is slower than you (WARDEN_SPEED).
 *   16  THE DEEP. Another one, sealed into the wall behind where you start. It breaks out when you reach the
 *       first gallery, and this one is FASTER than you (WARDEN_UPGRADED_SPEED): it gains a little every second,
 *       so every wrong turn and every pause is ground it takes back. Water drips along the way out.
 *
 * THE SECOND DELIBERATE EXCEPTION TO "YOU NEVER SEE WITHOUT A RIPPLE": the false light on level 15 shines on its
 * own, like level 13's room. It is held to the same standard - walls block it completely: it is drawn only
 * inside what the player could really see from where they stand (their own line-of-sight polygon), and scaled
 * by how much of the light itself is in view. Written down in CLAUDE.md beside level 13's.
 *
 * Two halves, the same shape as js/tutorial.js and js/warden.js:
 *   build(n, cfg)   the maze, in exactly the shape generateLevel() returns. Draws no random numbers at all.
 *   create(env)     the scripted beats - the wake-up, the key, the door, the light, the reveal, the release and
 *                   the walk out of each level - and the drawing and sound that go with them. It can do only
 *                   what `env` lets it: take and give back the controls, walk the player for a beat, open a
 *                   tile, wake a Warden, send a drop of water, speak a line, and say that the level is done.
 *
 * The Warden itself - what each one is and how it is drawn - lives in js/warden.js (VARIANTS); how it hunts is
 * in js/game.js (updateWardenHunt). Its two speeds are WARDEN_SPEED and WARDEN_UPGRADED_SPEED in js/level.js.
 */
const EchoStory = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (u) => {
    const t = clamp(u, 0, 1);
    return t * t * (3 - 2 * t);
  };

  /**
   * The maps, one character per 40 px tile.
   *   #  wall                    .  floor               S  where you start        X  the way out
   *   b  a row of iron bars across the middle of the tile: you cannot pass, a ripple can (between them)
   *   o  a cell door, standing open
   *   D  the gaol door - a floor tile with a heavy, LOCKED door in it until the key turns
   *   K  the key                 d  water drips here (a small ripple of its own, every few seconds)
   *   W  where a Warden stands   P  a passage sealed with stone, until something cracks it open
   *   p  a pillar (an ordinary obstacle, like the generated levels' boulders and pillars)
   */
  // ------------------------------------------------------------ (v19.0) ACT 3: OUTSIDE 1 - the field
  /**
   * The first level outside (26, shown as "Outside 1"): one big open field in daylight, walled only by its edge.
   * Built once, the same every time, from a small xorshift of its own (never Math.random, never the generator's
   * numbers): the map, a worn path from where you come out to the gap in the trees you leave by, the grass's light
   * and dark patches, flowers, and trees - all of it DRAWING (js/game.js drawDaylight): you walk under the trees.
   */
  const FIELD = (() => {
    const W = 84;
    const H = 56;
    let q = 0x0ff1e1d;
    const r = () => {
      q ^= q << 13;
      q >>>= 0;
      q ^= q >>> 17;
      q ^= q << 5;
      q >>>= 0;
      return q / 4294967296;
    };
    const S = [4, 30]; // where you come out of the light
    const X = [W - 2, 18]; // the way on: past a gap in the trees at the far side
    // the worn path: one slow curve between them
    const pathY = (x) => {
      const u = (x - S[0]) / (X[0] - S[0]);
      return S[1] + (X[1] - S[1]) * u + 6 * Math.sin(u * Math.PI * 2);
    };
    const path = new Float32Array(W * H); // 0..1: how worn
    for (let x = S[0]; x <= X[0]; x++) {
      const y = pathY(x);
      for (let dy = -2; dy <= 2; dy++) {
        const ty = Math.round(y) + dy;
        if (ty < 1 || ty > H - 2) continue;
        const i = ty * W + x;
        path[i] = Math.max(path[i], Math.max(0, 1 - Math.abs(ty - y) / 2.2));
      }
    }
    // light and dark patches of grass: a smooth noise over a coarse grid
    const G = 7;
    const gw = Math.ceil(W / G) + 2;
    const gv = Array.from({ length: gw * (Math.ceil(H / G) + 2) }, r);
    const shade = new Uint8Array(W * H);
    const flower = new Uint8Array(W * H); // 0 none, 1-3 a colour
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const fx = x / G;
        const fy = y / G;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
        const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
        const a = gv[iy * gw + ix] + (gv[iy * gw + ix + 1] - gv[iy * gw + ix]) * sx;
        const b = gv[(iy + 1) * gw + ix] + (gv[(iy + 1) * gw + ix + 1] - gv[(iy + 1) * gw + ix]) * sx;
        shade[y * W + x] = Math.min(4, Math.floor((a + (b - a) * sy) * 4.6 + r() * 0.5));
        if (path[y * W + x] < 0.15 && r() < 0.035) flower[y * W + x] = 1 + Math.floor(r() * 3);
      }
    }
    // trees: a line of them across the far side with one gap where the path goes through, and others scattered -
    // never on the path, never right where you come out
    const trees = [];
    const c = (t) => (t + 0.5) * TILE;
    const clear = (x, y, d) => trees.every((t) => Math.hypot(t.x - x, t.y - y) > d);
    for (let x = W - 9; x <= W - 6; x += 1.5) {
      for (let y = 1.5; y < H - 1.5; y += 1.6 + r() * 0.6) {
        if (Math.abs(y - pathY(Math.round(x))) < 3.4) continue; // the gap
        trees.push({ x: c(x + (r() - 0.5) * 0.8), y: c(y), r: 44 + r() * 16, tone: r() });
      }
    }
    for (let k = 0; k < 400 && trees.length < 190; k++) {
      const x = 3 + r() * (W - 15);
      const y = 2 + r() * (H - 4);
      if (Math.abs(y - pathY(Math.round(x))) < 4 || Math.hypot(x - S[0], y - S[1]) < 9) continue;
      const tx = c(x);
      const ty = c(y);
      if (!clear(tx, ty, 92)) continue;
      trees.push({ x: tx, y: ty, r: 34 + r() * 30, tone: r() });
    }
    const map = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) row += x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : x === S[0] && y === S[1] ? 'S' : x === X[0] && y === X[1] ? 'X' : '.';
      map.push(row);
    }
    return { W, H, map, path, shade, flower, trees };
  })();

  // ------------------------------------------------------------ (v19.2) FRESH AIR: the village
  /**
   * Level 27, "Fresh Air": a small, warm, ordinary village in daylight - and an echo. Built once, the same every time
   * (its own xorshift): cottages, two fenced gardens, a square with a well and two stalls, a bench, a washing line,
   * paths and trees; the cottages, fences, stalls and the well are solid (`map`), everything else is drawing. And its
   * people: each one's day is a fixed list of keyframes over VILLAGE_LOOP seconds - and then, every one of them at the
   * same instant, it starts again (create(): updateVillage).
   */
  const VILLAGE_LOOP = 40; // s: one day of the village, before it starts again
  const VILLAGE = (() => {
    const W = 64;
    const H = 42;
    let q = 0x7111a9e;
    const r = () => {
      q ^= q << 13;
      q >>>= 0;
      q ^= q >>> 17;
      q ^= q << 5;
      q >>>= 0;
      return q / 4294967296;
    };
    const solid = new Uint8Array(W * H);
    const built = new Uint8Array(W * H); // solid, but a made thing (drawn as itself, not as the hedge at the edge)
    const set = (x, y) => {
      solid[y * W + x] = 1;
      built[y * W + x] = 1;
    };
    for (let x = 0; x < W; x++) solid[x] = solid[(H - 1) * W + x] = 1;
    for (let y = 0; y < H; y++) solid[y * W] = solid[y * W + W - 1] = 1;
    // cottages: [x, y, w, h, the tile in front of the door, roof tone]
    const houses = [
      [7, 9, 6, 5, [9, 14], 0], [17, 9, 6, 5, [20, 14], 1], [41, 9, 6, 5, [44, 14], 2], [51, 9, 6, 5, [53, 14], 0],
      [9, 28, 6, 5, [11, 27], 1], [41, 28, 6, 5, [43, 27], 2], [51, 28, 6, 5, [54, 27], 1],
    ].map(([x, y, w, h, door, roof]) => ({ x, y, w, h, door, roof }));
    for (const h of houses) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) set(x, y);
    // fenced gardens: [x0, y0, x1, y1, the gap in the fence]
    const gardens = [[21, 28, 28, 34, [24, 28]], [33, 6, 38, 11, [35, 11]]].map(([x0, y0, x1, y1, gap]) => ({ x0, y0, x1, y1, gap }));
    const fences = [];
    for (const g of gardens) {
      for (let x = g.x0; x <= g.x1; x++) for (const y of [g.y0, g.y1]) if (!(x === g.gap[0] && y === g.gap[1])) fences.push([x, y]);
      for (let y = g.y0 + 1; y < g.y1; y++) for (const x of [g.x0, g.x1]) if (!(x === g.gap[0] && y === g.gap[1])) fences.push([x, y]);
    }
    for (const [x, y] of fences) set(x, y);
    // the square: the well (solid), two stalls, a bench
    const well = { x: 32, y: 18 };
    const stalls = [{ x: 28, y: 23, w: 2, tone: 0 }, { x: 36, y: 23, w: 2, tone: 1 }];
    for (const st of stalls) for (let x = st.x; x < st.x + st.w; x++) set(x, st.y);
    const bench = { x: 35.5, y: 15.1 };
    const line = { x0: 18.4, x1: 23.6, y: 6.6 }; // the washing line, behind the second cottage
    const S = [2, 20];
    const X = [W - 2, 20];
    // paths: the street end to end, the square, and one to every door and garden gate
    const path = new Float32Array(W * H);
    const wear = (x, y, w) => {
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return;
      path[y * W + x] = Math.max(path[y * W + x], w);
    };
    for (let x = 1; x < W - 1; x++) {
      wear(x, 20, 1);
      wear(x, 19, 0.6);
      wear(x, 21, 0.6);
    }
    for (let y = 16; y <= 25; y++) for (let x = 26; x <= 38; x++) wear(x, y, 0.85);
    for (const h of houses) {
      const [dx, dy] = h.door;
      for (let y = Math.min(dy, 20); y <= Math.max(dy, 20); y++) wear(dx, y, 0.8);
    }
    for (const g of gardens) for (let y = Math.min(g.gap[1], 20); y <= Math.max(g.gap[1], 20); y++) wear(g.gap[0], y, 0.7);
    // the ground: patches, and flowers in the gardens and the verges
    const G = 7;
    const gw = Math.ceil(W / G) + 2;
    const gv = Array.from({ length: gw * (Math.ceil(H / G) + 2) }, r);
    const shade = new Uint8Array(W * H);
    const flower = new Uint8Array(W * H);
    const inGarden = (x, y) => gardens.some((g) => x > g.x0 && x < g.x1 && y > g.y0 && y < g.y1);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const fx = x / G;
        const fy = y / G;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
        const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
        const a = gv[iy * gw + ix] + (gv[iy * gw + ix + 1] - gv[iy * gw + ix]) * sx;
        const b = gv[(iy + 1) * gw + ix] + (gv[(iy + 1) * gw + ix + 1] - gv[(iy + 1) * gw + ix]) * sx;
        shade[y * W + x] = Math.min(4, Math.floor((a + (b - a) * sy) * 4.6 + r() * 0.5));
        if (!solid[y * W + x] && path[y * W + x] < 0.15 && r() < (inGarden(x, y) ? 0.3 : 0.03)) flower[y * W + x] = 1 + Math.floor(r() * 3);
      }
    }
    // trees: round the outside of the village, never on a path, a building or in the square
    const trees = [];
    const c = (t) => (t + 0.5) * TILE;
    const near = (x, y, d) => {
      for (let yy = Math.floor(y - d); yy <= Math.ceil(y + d); yy++) for (let xx = Math.floor(x - d); xx <= Math.ceil(x + d); xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (built[yy * W + xx] || path[yy * W + xx] > 0.3) return true;
      }
      return false;
    };
    for (let k = 0; k < 600 && trees.length < 70; k++) {
      const x = 1.5 + r() * (W - 3);
      const y = 1.5 + r() * (H - 3);
      if (near(x, y, 2.2) || Math.hypot(x - well.x, y - well.y) < 8 || (x > 25 && x < 39 && y > 15 && y < 26)) continue;
      const tx = c(x);
      const ty = c(y);
      if (trees.some((t) => Math.hypot(t.x - tx, t.y - ty) < 90)) continue;
      trees.push({ x: tx, y: ty, r: 34 + r() * 26, tone: r() });
    }
    // THE PEOPLE. Each: clothes, and a day - a route of [x, y] (tiles) walked at `speed` tiles/s, and stops
    // { wait, snd } - repeated to fill VILLAGE_LOOP. `every`: a sound it makes over and over while it is there.
    const people = [];
    const person = (o) => {
      const kf = [];
      const ev = [];
      let t = 0;
      let [x, y] = o.route[0];
      const once = [];
      once.push({ t: 0, x, y });
      for (const st of o.route.slice(1)) {
        if (Array.isArray(st)) {
          t += Math.hypot(st[0] - x, st[1] - y) / (o.speed || 1.4);
          x = st[0];
          y = st[1];
          once.push({ t, x, y });
        } else {
          if (st.snd) ev.push({ t: t + (st.at || 0.3), snd: st.snd });
          t += st.wait;
          once.push({ t, x, y, face: st.face });
        }
      }
      const T = Math.max(t, 1);
      // the same day, again and again, until the village starts over
      for (let k = 0; k * T < VILLAGE_LOOP; k++) {
        for (const p of once) if (k * T + p.t <= VILLAGE_LOOP && !(k > 0 && p.t === 0)) kf.push({ ...p, t: k * T + p.t });
      }
      const evs = [];
      for (let k = 0; k * T < VILLAGE_LOOP; k++) for (const e of ev) if (k * T + e.t < VILLAGE_LOOP) evs.push({ t: k * T + e.t, snd: e.snd });
      people.push({ kf, ev: evs, every: o.every || null, clothes: o.clothes, hair: o.hair, pitch: o.pitch || 1, small: !!o.small, what: o.what, face: o.face });
    };
    const C = (body, edge) => ({ body, edge });
    person({ what: 'water', clothes: C('#9b5b3a', '#6d3f28'), hair: '#3a2a1e', speed: 1.5, route: [[20, 15], [20, 19.2], [31, 19.2], { wait: 2.6, snd: 'bucket', at: 0.8, face: -Math.PI / 4 }, [20, 19.2], [20, 15], { wait: 2.2 }] });
    person({ what: 'ball', small: true, clothes: C('#d8a23a', '#a5781f'), hair: '#6b4a2b', pitch: 1.4, route: [[44, 25.7], { wait: 1.7, snd: 'ball', at: 0.2, face: Math.PI / 2 }] });
    person({ what: 'washing', clothes: C('#7f9fbf', '#56738f'), hair: '#c9b27a', speed: 0.9, route: [[18.9, 7.3], { wait: 3.2, snd: 'cloth', at: 1.2, face: -Math.PI / 2 }, [20.5, 7.3], { wait: 3.2, snd: 'cloth', at: 1.2 }, [22.1, 7.3], { wait: 3.2, snd: 'cloth', at: 1.2 }, [23.3, 7.3], { wait: 3.2, snd: 'cloth', at: 1.2 }, { wait: 22 }] });
    person({ what: 'broom', clothes: C('#6f8f5a', '#4d6a3c'), hair: '#8a8a8a', speed: 0.55, every: { snd: 'sweep', dt: 1.1 }, route: [[29.5, 24.5], [34.5, 24.5], [29.5, 24.5]] });
    person({ what: 'bench', clothes: C('#8c6fa3', '#634b78'), hair: '#ddd6c8', pitch: 0.8, route: [[35.5, 15.4], { wait: 5.5, face: Math.PI / 2 }, [35.5, 15.9], { wait: 2.8, snd: 'murmur', at: 0.6 }, [35.5, 15.4], { wait: 0.1 }] });
    person({ what: 'talk', clothes: C('#b95f6a', '#86414a'), hair: '#2e2018', route: [[27.6, 21.6], { wait: 2.8, snd: 'murmur', at: 0.4, face: 0 }, { wait: 2.8, face: 0 }] });
    person({ what: 'talk', clothes: C('#4f7d8c', '#365864'), hair: '#5d4a33', pitch: 0.85, route: [[29.0, 21.6], { wait: 2.8, face: Math.PI }, { wait: 2.8, snd: 'murmur', at: 0.4, face: Math.PI }] });
    person({ what: 'walk', clothes: C('#c7b28f', '#97835f'), hair: '#4a3626', speed: 1.3, route: [[26.5, 16.8], [38.4, 16.8], [38.4, 25.6], [26.5, 25.6], [26.5, 16.8]] });
    person({ what: 'garden', clothes: C('#a3824f', '#765c33'), hair: '#2f2a24', every: { snd: 'cloth', dt: 2.4 }, route: [[24.5, 31.2], { wait: 6, face: Math.PI / 2 }, [26, 31.6], { wait: 6, face: Math.PI / 2 }, [24.5, 31.2]] });
    person({ what: 'walk', clothes: C('#5c6f99', '#3f4f70'), hair: '#c8c8c8', pitch: 0.75, speed: 0.7, route: [[46, 21.1], [57, 21.1], { wait: 2.2, snd: 'murmur', at: 1 }, [46, 21.1], { wait: 2.2 }] });
    person({ what: 'stall', clothes: C('#d07a3c', '#9c5726'), hair: '#3b2b20', route: [[36.6, 22.2], { wait: 4.6, snd: 'murmur', at: 2.2, face: -Math.PI / 2 }] });
    person({ what: 'walk', clothes: C('#9a4f8f', '#6e3767'), hair: '#1f1a17', speed: 1.4, route: [[9, 15], [9, 20.2], [11, 20.2], [11, 26.6], { wait: 3 }, [11, 20.2], [9, 20.2], [9, 15], { wait: 3 }] });
    const map = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) row += x === S[0] && y === S[1] ? 'S' : x === X[0] && y === X[1] ? 'X' : x === well.x && y === well.y ? 'p' : solid[y * W + x] ? '#' : '.';
      map.push(row);
    }
    return { W, H, map, path, shade, flower, trees, built, props: { houses, gardens, fences, well, stalls, bench, line, gate: { x: X[0], y: X[1] } }, people };
  })();

  // ------------------------------------------------------------ (v19.3) DUSK: the walk into the dark
  /**
   * Level 28, "Dusk": a long meadow on from the village, in Fresh Air's daylight - and the further along it you walk,
   * the more the light drains out of it (js/game.js drawDaylight, story `dusk()`): dusk, night, then nothing at all,
   * the ground gone, you alone in black. Far along, a single Warden stands in a faint pale glow. It does not move and
   * it cannot hurt you; close to it you can talk to it (the 'interact' key), and that is the scene "Nothing Listens".
   * The edge of the map is a wall you cannot see once it is dark. Built once, the same every time (its own xorshift).
   */
  const DUSK = (() => {
    const W = 150;
    const H = 13;
    let q = 0x0d05c;
    const r = () => {
      q ^= q << 13;
      q >>>= 0;
      q ^= q >>> 17;
      q ^= q << 5;
      q >>>= 0;
      return q / 4294967296;
    };
    const S = [3, 6];
    const KEEPER = [W - 14, 6]; // where it stands
    const X = [W - 2, 6]; // (a way out the level has, past it, that does nothing: nothing happens here but the talk)
    const path = new Float32Array(W * H);
    for (let x = 1; x < W - 1; x++) {
      const y = 6 + 1.6 * Math.sin(x / 11);
      const wearK = clamp(1 - (x - 70) / 40, 0, 1); // the path fades out before the light does
      for (let dy = -2; dy <= 2; dy++) {
        const ty = Math.round(y) + dy;
        if (ty < 1 || ty > H - 2) continue;
        const i = ty * W + x;
        path[i] = Math.max(path[i], wearK * Math.max(0, 1 - Math.abs(ty - y) / 2));
      }
    }
    const G = 6;
    const gw = Math.ceil(W / G) + 2;
    const gv = Array.from({ length: gw * (Math.ceil(H / G) + 2) }, r);
    const shade = new Uint8Array(W * H);
    const flower = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const fx = x / G;
        const fy = y / G;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
        const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
        const a = gv[iy * gw + ix] + (gv[iy * gw + ix + 1] - gv[iy * gw + ix]) * sx;
        const b = gv[(iy + 1) * gw + ix] + (gv[(iy + 1) * gw + ix + 1] - gv[(iy + 1) * gw + ix]) * sx;
        shade[y * W + x] = Math.min(4, Math.floor((a + (b - a) * sy) * 4.6 + r() * 0.5));
        if (path[y * W + x] < 0.15 && x < 90 && r() < 0.04) flower[y * W + x] = 1 + Math.floor(r() * 3);
      }
    }
    // trees along both sides of the meadow, thinning out ahead - none in the last of it
    const trees = [];
    for (let x = 8; x < 104; x += 3 + r() * 5) {
      for (const side of [0, 1]) {
        if (r() < 0.25 + x / 300) continue;
        const y = side ? H - 1.2 - r() * 1.6 : 1.2 + r() * 1.6;
        trees.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, r: 32 + r() * 24, tone: r() });
      }
    }
    const map = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        row += edge ? '#' : x === S[0] && y === S[1] ? 'S' : x === X[0] && y === X[1] ? 'X' : x === KEEPER[0] && y === KEEPER[1] ? 'p' : '.';
      }
      map.push(row);
    }
    // how far along the way you are: 0 where you come in, 1 a little short of it
    const from = (S[0] + 0.5) * TILE;
    const to = (KEEPER[0] - 3 + 0.5) * TILE;
    return { W, H, map, path, shade, flower, trees, dusk: { keeper: { x: (KEEPER[0] + 0.5) * TILE, y: (KEEPER[1] + 0.5) * TILE }, from, to } };
  })();

  const LEVELS = {
    14: {
      kind: 'gaol',
      map: [
        '###########################',
        '##...##...##...##...#######',
        '##.S.##...##...##...#######',
        '##bob##bbb##bob##bbb#######',
        '#d......d..........d...D..#',
        '##bbb##bob##bob##bbb#####.#',
        '##...##...##.K.##...#####.#',
        '##...##...##...##...#####.#',
        '#########################X#',
        '#########################.#',
        '###########################',
      ],
      // the drop that wakes you, in your own cell beside you (px)
      wakeDrip: { x: 126, y: 72 },
    },
    15: {
      kind: 'light',
      map: [
        '###############################',
        '##########.####################',
        '##########.####################',
        '#..........##.#################',
        '####.#####.##.#################',
        '####.#####.......##############',
        '####.###########.##############',
        '####.###########........#######',
        '####.##############.###.#######',
        '####....X##########.###.#######',
        '####.##################P#######',
        '####.#######.................W#',
        '############.##################',
        '########.....##################',
        '########.######################',
        '########.######################',
        '########....###################',
        '########.######################',
        '####.###.######################',
        '####.###.######################',
        '####.###.######################',
        '#S.......######################',
        '###############################',
      ],
      // the reveal: once you are this close to the light (px, to the Warden's front edge)
      revealDist: 150,
    },
    16: {
      kind: 'deep',
      map: [
        '#####################################',
        '#....#########.......################',
        '#.S..................################',
        '#....#########..p.p..################',
        '##P###########.........##############',
        '#.W.##########..p.p..################',
        '#...##########.......################',
        '##############.......################',
        '###########.#####d###################',
        '###########.#####.###################',
        '#####..d..........###################',
        '#####.###############################',
        '#####d###############################',
        '#####.......d........################',
        '#########.##########.################',
        '#########.##########d################',
        '##################.........##########',
        '##################..........d......##',
        '##################..p.p.p..#######.##',
        '##################.........#######.##',
        '################......p....#######d##',
        '##################.........#######.##',
        '#######################.##########.##',
        '#######################.##########.##',
        '##################################X##',
        '#####################################',
      ],
      // the release: when you step into the first gallery (px)
      tripX: 14 * 40 + 12,
    },
    // ================================================================== ACT 2 (v17.0): THE BROKEN GAOL
    // The gaol is being unmade, drifting into a void. Each level breaks ONE rule of the maze. No words but a hint.
    // Story-only tiles (never in the editor, its format or share codes):
    //   g  GHOST WALL  - a ripple draws it like stone; it is not there. Walk into it and it comes apart (a glitch).
    //   h  HIDDEN WALL - real stone a ripple does NOT draw. Bump it and it thunks - and from then on it shows.
    //   A / B          - a SLIDING WALL: in A to begin with; every ping of yours within `slideRange` sends it
    //                    to its B (the tile beside it), and back. Ground before it moves.
    //   1 2 3 4        - FOLDS, in pairs: step onto one and you are on its pair. A ripple goes through as well.
    //   E  an echo monster      T  a stalker      d  a drip (19: the one sound you can find your way by)
    //   W  (20) a Warden at level 15's speed, in the stone behind you until `wake` s in - then it always knows
    //      where you are, and comes after you
    // (v18.0) ACT 2 PART 2 - the void is real now, and it is taking the maze:
    //   v  VOID - the floor is gone. Step onto it and you fall; so does a monster. Always shown (drawVoid).
    //   c  (21) CRUMBLING FLOOR - it holds you, but a moment after you step OFF it, it cracks and falls into the void
    //   z  (22) DEAD AIR - walkable. A ripple that goes in never comes back; your footsteps in it are lost (nothing
    //      hears them); and a ripple you send from INSIDE it does not set an Alarm off
    //   L  an Alarm (js/game.js, exactly as in the editor) - in the campaign from 22
    // 23 has `creep` (the void eating the map from the edges in, ring by ring, on a fixed schedule) and 24 has
    // `part2` (what you reach through its first way out - js/game.js starts it as level 24, part 2).
    17: {
      kind: 'liar',
      act2: true,
      void: 1,
      map: [
        '#############################',
        '#############################',
        '#S..g..h....#################',
        '######.######################',
        '######.......h............###',
        '##########.########.#####.###',
        '##########.########.#####.###',
        '##########.########.#####.###',
        '#.............g.....#####g###',
        '#.#######.###############.###',
        '#.#######.###############.###',
        '#.#######.###############.###',
        '#.......E.........h......X###',
        '#############################',
      ],
    },
    18: {
      kind: 'shuffle',
      act2: true,
      void: 2,
      slideRange: 240, // px from where you ping to a sliding wall: about six tiles
      map: [
        '###########################',
        '###B########B##############',
        '#S.A........A....##########',
        '################.##########',
        '################.##########',
        '#######..........##########',
        '#######..........###B######',
        '#######....T........A..X###',
        '#######..........######.###',
        '#########.#####A#######.###',
        '#########......B........###',
        '###########################',
      ],
    },
    19: {
      kind: 'loop',
      act2: true,
      void: 3,
      map: [
        '##########################',
        '####################2...X#',
        '##########################',
        '#1.S.d..................1#',
        '########.#################',
        '####.....#...............#',
        '####.###.#.#############.#',
        '####.#...#.#...........#.#',
        '####.#.###.#.#########.#.#',
        '####.......#.#..E......#.#',
        '########.###.#.#######.#.#',
        '########.....#.#########2#',
        '##########################',
      ],
    },
    20: {
      kind: 'behind',
      act2: true,
      void: 4,
      // the ripple, here: it travels at this fraction of its usual speed, and what it finds shows this much later
      ripple: { speed: 0.42, lag: 0.45 },
      // s into the level when the Warden breaks out of the stone just behind where you start (you can move from
      // 0.7 s). It only ever reaches you along the way you came, so this is your head start: about 10 s of standing
      // still in all, more for every stretch you walk (tools/act2-check.js measures it - and fails under 3 s)
      wake: 10.0,
      map: [
        '#############################',
        '#W.S..#.........#...........#',
        '#####.#.#######.#.#########.#',
        '#.....#.#.....#...#.......#.#',
        '#.#####.#.###.#####.#####.#.#',
        '#.#.....#.#.#.......#...#...#',
        '#.#.#####.#.#########.#.###.#',
        '#...#.....#...........#.....#',
        '#####.#############.#######.#',
        '#.....#......E....#.#.......#',
        '#.#####.#########.#.#.#.#####',
        '#.......#.........#...#....X#',
        '#############################',
      ],
    },
    // ================================================================== ACT 2 PART 2 (v18.0): THE VOID IS REAL
    21: {
      kind: 'crumble',
      act2: true,
      void: 5,
      map: [
        // <map21>
        '##################################',
        '#S.cccc.##############vvccccc.Xvv#',
        '###vvvv.##############vvcvvvvvvvv#',
        '#######.#############.cccccccv..v#',
        '#######.vvvvv...#####.vvvvvvcc..v#',
        '#######.ccccc...#####.vvvvvvvvvvv#',
        '#######.vvvvv...####vcv###########',
        '#######.############vcv###########',
        '#######.############vcv###########',
        '##..............p....cvvvv...#####',
        '##.E......p...........cccc...#####',
        '##...................#vvvv...#####',
        '##################################',
        // </map21>
      ],
    },
    22: {
      kind: 'deadair',
      act2: true,
      void: 6,
      map: [
        // <map22>
        '#################################',
        '##.E....#########################',
        '##......#################......##',
        '####.####################.####.##',
        '####.#######....L....####.####.##',
        '####.#######.........####.###zz##',
        '####.#zz####zz.....zz####.###zz##',
        '#S....zz....zz.p...zz.....####.##',
        '##....zz....zz.....zz#########.##',
        '######zz#.##zz...p.zz#########.##',
        '#########.##.........#########.##',
        '#########.################X....##',
        '########.....####################',
        '########...E.####################',
        '#################################',
        // </map22>
      ],
    },
    23: {
      kind: 'creep',
      act2: true,
      void: 7,
      // the void comes in from the edges: ring 0 (the outer wall) goes at `start` s, the next ring `every` s later,
      // and so on for `rings` rings - the same every attempt. Easy: every time x `easy`. Hardcore = Normal.
      creep: { start: 10, every: 6, rings: 8, easy: 1.35 },
      map: [
        // <map23>
        '###################################',
        '#.................................#',
        '#.#######.#######.#######.#######.#',
        '#S#.............................#.#',
        '#.#.###########################.#.#',
        '#.#.#.........................#.#.#',
        '#.#.#.#######################...#.#',
        '#.#.#.#.....................#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#......X#############.#...#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.....................#.#.#.#',
        '#.#.#.#####.#####.######.####...#.#',
        '#.#.#.........................#.#.#',
        '#.#.###########################.#.#',
        '#.#E............................#.#',
        '#.###############################.#',
        '#................................E#',
        '###################################',
        // </map23>
      ],
    },
    24: {
      kind: 'wrong',
      act2: true,
      void: 8,
      map: [
        // <map24>
        '###############################',
        '#S......#...#.....#...........#',
        '#.#####.#.#######.#.#########.#',
        '#.#...#...#.....#...#.......#.#',
        '#.#.#.#####.###.#####.#####.###',
        '#...#.......#.#.......#...#...#',
        '#.###.#####.#.#######.#.#.###.#',
        '#.#...#...#...#.....#...#...#.#',
        '#.#.###.#.#####.###.#######.#.#',
        '#...#...#.E.....#...#.......#.#',
        '###.#.###########.###.#####.#.#',
        '#.....#.......E...#.......#..X#',
        '###############################',
        // </map24>
      ],
      // through the first way out: a smaller copy of it, half eaten, whose real way out is the other way
      part2: {
        wake: 10.0,
        map: [
          // <map24b>
          '#####################',
          '#X.#######....#vvvvv#',
          '##.#######.####vvvvv#',
          '##.###.........vvvvv#',
          '##.vv#.#######.######',
          '##.v##.vvvvvv#.....S#',
          '##.###.#######.vvvv.#',
          '##.....###.....vvvv.#',
          '####.####vvvvv#vvvv.#',
          '####.....vvvvv#W....#',
          '#####################',
          // </map24b>
        ],
      },
    },
    // ================================================================== (v18.2) 25: THE LIGHT - the end of Act 2
    // Level 15's mirror. A light at the end of a long way, the faster Warden let out behind you - and this time the
    // light is real: the way out IS outside. No words, no scene: only the light, the sound of outside and the chase.
    // The bars (b) along the middle are the sight line to it: seen through, never walked.
    25: {
      kind: 'outside',
      act2: true,
      void: 2,
      hunter: 'upgraded', // level 16's: 105% of your speed, its own low voice
      tripX: 26 * 40 + 12, // px: past this, the stone behind you splits and it is let out
      wake: 1.6, // s after that before it is out of the wall and coming (16's head start: RELEASE_WAKE - 1.4)
      lightFar: 2000, // px from the light at which it is at its faintest (it grows and warms as you come)
      // the floor behind you goes, on a fixed schedule from the moment it is let out: `delay` s, then one more tile
      // of path from the start every `every` s (slower than it walks - it is always behind it), stopping `stopShort`
      // tiles of path before the way out
      collapse: { delay: 6.0, every: 0.28, stopShort: 14 },
      map: [
        // <map25>
        '########################################################',
        '#############################.....###.....###.....######',
        '#############################.#.#.###.###.###.#.#.######',
        '#############################.###.###.###.###.###.######',
        '#############################.###.###.###.###.###.######',
        '#############################.###.#.#.###.###.###.#.####',
        '#############################.###.....###.....###.....##',
        '#..#....p.......p.......p.....bbbbbbbbbbbbbbbbbbbbbbb..#',
        '#W.P.S.......................bbbbbbbbbbbbbbbbbbbbbbbbbX#',
        '#..#........p.......p........###########################',
        '########################################################',
        // </map25>
      ],
    },
    // ================================================================== (v19.0) ACT 3, THE OUTSIDE
    // 26, "Outside 1": the field. Daylight, grass and trees, nothing to fight and nothing to solve - the breather
    // after twenty-five levels of dark. Its flags (read by js/game.js, for any level that sets them): daylight (no
    // darkness, no sonar: the field is drawn), noRipple, noCrouch, noHud (nothing on screen while you play),
    // movementOnly (only the movement keys and pause do anything).
    26: {
      kind: 'field',
      daylight: true,
      noRipple: true,
      noCrouch: true,
      noHud: true,
      movementOnly: true,
      map: FIELD.map,
    },
    // (v19.2) 27, "Fresh Air": the village. The same flags as the field; its people are drawing and sound only - not
    // solid, never in your way, never looking at you.
    27: {
      kind: 'village',
      daylight: true,
      noRipple: true,
      noCrouch: true,
      noHud: true,
      movementOnly: true,
      map: VILLAGE.map,
    },
    // (v19.3) 28, "Dusk": the flags of the outside, and one more - a key to talk with (only near the one it is for)
    28: {
      kind: 'dusk',
      daylight: true,
      noRipple: true,
      noCrouch: true,
      noHud: true,
      movementOnly: true,
      interact: true,
      map: DUSK.map,
    },
  };
  /**
   * (v17.0) THE VOID, by `void` level (17: 1 ... 20: 4). Drawing and sound only - nothing in it is read by anything
   * that decides anything. band: tiles of black creeping in from each edge of the map; staticA: how strong its
   * static is; flick: how much that static flickers; fallEvery: [min, spread] seconds between the distant falls.
   */
  const VOID = {
    1: { band: 1.4, staticA: 0.05, flick: 0.25, fallEvery: [34, 22] },
    2: { band: 2.0, staticA: 0.08, flick: 0.35, fallEvery: [28, 18] },
    3: { band: 2.7, staticA: 0.11, flick: 0.45, fallEvery: [22, 16] },
    4: { band: 3.5, staticA: 0.15, flick: 0.6, fallEvery: [16, 14] },
    // (v18.0) 21-24: the void is real - the static thicker, the falls closer together (the band of black grows less:
    // the void is inside the map now, and the edges must still be readable)
    5: { band: 3.7, staticA: 0.17, flick: 0.65, fallEvery: [14, 12] },
    6: { band: 3.9, staticA: 0.19, flick: 0.7, fallEvery: [12, 10] },
    7: { band: 4.1, staticA: 0.21, flick: 0.75, fallEvery: [11, 9] },
    8: { band: 4.3, staticA: 0.23, flick: 0.8, fallEvery: [10, 8] },
  };
  /** (v17.0) Act 2's levels: hand-drawn like 13-16, each breaking one rule of the maze. */
  const isAct2 = (n) => !!(LEVELS[n] && LEVELS[n].act2);

  const ALARM_PITCH = 1380; // (v18.0) an Alarm's hum: the middle of its range in MONSTER_TYPES (js/level.js)
  const BAR_R = 3.4; // px: an iron bar, seen from above
  const BAR_AT = [7, 20, 33]; // px across its tile: gaps of 6-7 px, and you are 18 px across
  const DOOR_R = 20; // px: the gaol door fills its 40 px doorway (this is the size it is DRAWN at)
  // ...and what is solid of it: a slab across the doorway, as three overlapping circles - the shape a ripple
  // finds and the shape that stops you are the shape that is drawn (it is not a round thing)
  const DOOR_PARTS = [-12, 0, 12];
  const DOOR_PART_R = 8;
  const KEY_R = 11; // px: as big as a lore fragment
  const DRIP_R = 76; // px: how far one drop's ripple reaches
  const LIGHT_RGB = '255,214,160'; // the false light: warm - nothing else down here is
  const LIGHT_REACH = 340; // px: how far it lights the stone around it
  // s into level 16's release beat: you have the controls back at 1.6 s, and it comes out of the wall at this
  const RELEASE_WAKE = 3.0;
  // s into level 15's reveal beat: you have the controls back at 1.9 s, and it starts after you at this
  const REVEAL_WAKE = 2.6;
  // (v17.0) s before level 20's Warden comes out (its `wake`) that the stone behind you splits: the warning
  const ACT2_WARN = 1.5;

  // ------------------------------------------------------------ the maze
  function build(n, cfg, part = 1) {
    // (v18.0) level 24 is played in two parts: the second is its `part2` laid over the level's own settings
    const base = LEVELS[n];
    const spec = part === 2 && base.part2 ? Object.assign({}, base, base.part2, { part: 2, part2: null }) : base;
    const map = spec.map;
    const H = map.length;
    const W = map[0].length;
    const walls = new Uint8Array(W * H);
    const obstacles = [];
    const drips = [];
    const seals = [];
    const barTiles = [];
    let start = null;
    let exit = null;
    let key = null;
    let door = null;
    let hunter = null;
    // (v17.0) Act 2's story-only tiles, and its monsters
    const ghosts = [];
    const hidden = [];
    const slideA = [];
    const slideB = new Set();
    const foldTiles = {};
    const monsters = [];
    // (v18.0) Act 2 part 2's
    const voids = [];
    const crumbleTiles = [];
    const deadTiles = [];
    const c = (tx) => (tx + 0.5) * TILE;
    for (let y = 0; y < H; y++) {
      if (map[y].length !== W) console.warn(`EchoStory: level ${n} row ${y} is ${map[y].length} tiles, not ${W}`);
      for (let x = 0; x < W; x++) {
        const ch = map[y][x];
        const i = y * W + x;
        walls[i] = ch === '#' || ch === 'P' || ch === 'h' || ch === 'A' ? 1 : 0; // (a hidden wall and a sliding wall in A are stone; the void, crumbling floor and dead air are not)
        if (ch === 'S') start = { x: c(x), y: c(y) };
        else if (ch === 'X') exit = { x: c(x), y: c(y), r: EXIT_R };
        else if (ch === 'K') key = { x: c(x), y: c(y), r: KEY_R, taken: false };
        else if (ch === 'D') door = { x: c(x), y: c(y), r: DOOR_R, tx: x, ty: y, solid: true, swing: 0, parts: DOOR_PARTS.map((dy) => ({ x: c(x), y: c(y) + dy, r: DOOR_PART_R })) };
        else if (ch === 'W') hunter = { x: c(x), y: c(y) };
        else if (ch === 'P') seals.push({ tx: x, ty: y });
        else if (ch === 'd') drips.push({ x: c(x), y: c(y) });
        else if (ch === 'p') obstacles.push({ x: c(x), y: c(y), r: spec.kind === 'dusk' ? 18 : OBSTACLE_R }); // (v19.3: on 28, the Warden standing there - its own size)
        else if (ch === 'g') ghosts.push({ i, tx: x, ty: y, gone: false });
        else if (ch === 'h') hidden.push({ i, tx: x, ty: y, shown: false });
        else if (ch === 'A') slideA.push(i);
        else if (ch === 'B') slideB.add(i);
        else if (ch >= '1' && ch <= '4') (foldTiles[ch] = foldTiles[ch] || []).push(i);
        else if (ch === 'E') monsters.push({ kind: 'echo', x: c(x), y: c(y), pitch: 52 });
        else if (ch === 'T') monsters.push({ kind: 'stalker', x: c(x), y: c(y), pitch: 64 });
        else if (ch === 'v') voids.push(i);
        else if (ch === 'c') crumbleTiles.push(i);
        else if (ch === 'z') deadTiles.push(i);
        else if (ch === 'L') monsters.push({ kind: 'alarm', x: c(x), y: c(y), pitch: ALARM_PITCH });
        else if (ch === 'b') {
          barTiles.push(y * W + x);
          for (const bx of BAR_AT) obstacles.push({ x: x * TILE + bx, y: c(y), r: BAR_R, bar: true });
        }
      }
    }
    if (!start || !exit) console.warn(`EchoStory: level ${n} needs a start (S) and a way out (X)`);

    // what cannot be walked through: walls, every tile with a pillar or a row of bars in it, and the gaol door
    const blocked = walls.slice();
    for (const o of obstacles) blocked[Math.floor(o.y / TILE) * W + Math.floor(o.x / TILE)] = 1;
    // (v18.0) no monster ever walks onto the void on purpose - nor onto crumbling floor, so a bridge over the void is
    // the edge of its world (it still falls if the void comes to it)
    for (const i of voids) blocked[i] = 1;
    for (const i of crumbleTiles) blocked[i] = 1;
    if (door) blocked[door.ty * W + door.tx] = 1;

    // Assert what the level depends on (cheap, and the reason a broken map is a warning rather than a mystery):
    // the way out must be reachable once everything has opened - and NOT before, where something has to open it.
    const sIdx = Math.floor(start.y / TILE) * W + Math.floor(start.x / TILE);
    const eIdx = Math.floor(exit.y / TILE) * W + Math.floor(exit.x / TILE);
    const opened = blocked.slice();
    if (door) opened[door.ty * W + door.tx] = 0;
    for (const s of seals) opened[s.ty * W + s.tx] = 0;
    const dOpen = bfsDist(opened, W, H, sIdx);
    const dShut = bfsDist(blocked, W, H, sIdx);
    if (!spec.act2 && dOpen[eIdx] < 0) console.warn(`EchoStory: level ${n}'s way out cannot be reached even with everything open`);
    // 14 (the door) and 15 (the sealed passage): the way out must NOT be reachable until the story opens it -
    // on 14 that is the whole of "the key cannot be skipped"
    if (!spec.act2 && spec.kind !== 'deep' && !spec.daylight && dShut[eIdx] >= 0) console.warn(`EchoStory: level ${n}'s way out can be reached without opening anything`);
    // 16: the seal is the Warden's - nothing may reach it, and it may reach nothing, until it breaks out
    if (spec.kind === 'deep' && hunter && dShut[Math.floor(hunter.y / TILE) * W + Math.floor(hunter.x / TILE)] >= 0) console.warn(`EchoStory: level ${n}'s Warden is not sealed in`);
    if (key && dShut[Math.floor(key.y / TILE) * W + Math.floor(key.x / TILE)] < 0) console.warn(`EchoStory: level ${n}'s key cannot be reached`);

    const enemies = [];
    const fast = n === 16 || spec.hunter === 'upgraded'; // (v18.2: 25's is level 16's)
    if (hunter) enemies.push({ kind: 'warden', x: hunter.x, y: hunter.y, variant: fast ? 'upgraded' : 'regular', pitch: fast ? 41.2 : 46.25 });
    for (const m of monsters) enemies.push(m); // (v17.0: Act 2's ordinary monsters, where the map puts them)

    // (v17.0) ACT 2: what each level's broken rule needs to know (js/game.js reads it; nothing else does)
    let act2 = null;
    if (spec.act2) {
      const slides = slideA.map((a) => {
        const b = [a - 1, a + 1, a - W, a + W].find((j) => slideB.has(j));
        if (b === undefined) console.warn(`EchoStory: level ${n}'s sliding wall at ${a % W},${(a / W) | 0} has no B beside it`);
        return { a, b, on: 0, pending: null, x: (c(a % W) + c(b % W)) / 2, y: (c((a / W) | 0) + c((b / W) | 0)) / 2 };
      });
      const folds = [];
      const foldPair = {};
      for (const k of Object.keys(foldTiles).sort()) {
        const t = foldTiles[k];
        if (t.length !== 2) console.warn(`EchoStory: level ${n}'s fold ${k} has ${t.length} ends, not 2`);
        else {
          folds.push({ a: t[0], b: t[1] });
          foldPair[t[0]] = t[1];
          foldPair[t[1]] = t[0];
        }
      }
      // what a ripple sees, where it is not what is there: a ghost wall is drawn, a hidden one is not
      let rayWalls = null;
      if (ghosts.length || hidden.length) {
        rayWalls = walls.slice();
        for (const g of ghosts) rayWalls[g.i] = 1;
        for (const h of hidden) rayWalls[h.i] = 0;
      }
      // (v18.0) the void (1 = the floor is gone), the crumbling floor, dead air, and 23's schedule
      const voidGrid = new Uint8Array(W * H);
      for (const i of voids) voidGrid[i] = 1;
      let dead = null;
      if (deadTiles.length) {
        dead = new Uint8Array(W * H);
        for (const i of deadTiles) dead[i] = 1;
      }
      const crumbles = crumbleTiles.map((i) => ({ i, state: 0, at: 0 })); // 0 whole, 1 stepped off, 2 cracked, 3 gone
      act2 = { kind: spec.kind, void: spec.void || 1, ghosts, hidden, slides, slideRange: spec.slideRange || 240, folds, foldPair, rayWalls, voidGrid, crumbles, dead, creep: spec.creep ? creepSchedule(W, H, walls, spec.creep, cfg.mode) : spec.collapse ? collapseSchedule(W, H, blocked, start, exit, spec.collapse) : null, part: spec.part || 1 };
    }

    const built = {
      cfg,
      W,
      H,
      walls,
      blocked,
      roomTiles: [],
      obstacles,
      puddles: [],
      decoy: null,
      trails: [],
      enemies,
      start,
      exit,
      pathTiles: dOpen[eIdx],
      pxW: W * TILE,
      pxH: H * TILE,
      story: {
        n,
        kind: spec.kind,
        key, // 14: the key, lying on the floor until you take it
        door, // 14: the gaol door, solid and locked until the key turns
        seals, // 15 and 16: passages of stone that open when the story says
        drips, // where water drips (a small ripple of its own)
        barTiles,
        hunterAt: hunter,
        exitMuted: spec.kind === 'light' || !!spec.daylight, // 15: no chime from the real way out while it is sealed off (v19.0: and none outside - the wind tells you)
        spec,
      },
      act2,
      // (v19.0) per-level flags (js/game.js): every story level has them, all false but where a level says
      flags: { daylight: !!spec.daylight, noRipple: !!spec.noRipple, noCrouch: !!spec.noCrouch, noHud: !!spec.noHud, movementOnly: !!spec.movementOnly, interact: !!spec.interact },
      field: spec.kind === 'field' ? FIELD : spec.kind === 'village' ? VILLAGE : spec.kind === 'dusk' ? DUSK : null, // (v19.0) what the field looks like (drawing only; v19.2: and the village)
      rayWalls: act2 ? act2.rayWalls : null, // (17: what a ripple's rays meet instead of level.walls)
      rippleScale: spec.ripple ? spec.ripple.speed : 0, // (20: the ripple's speed, as a fraction of its usual)
      rippleLag: spec.ripple ? spec.ripple.lag : 0, // (20: seconds before what it found is shown)
    };
    if (act2) {
      // Act 2's levels are puzzles of their broken rules: the way out must be reachable THROUGH them (solve)
      const sol = solve(built);
      if (!sol.ok) console.warn(`EchoStory: level ${n} cannot be finished: ${sol.why}`);
      built.pathTiles = sol.ok ? sol.steps : -1;
    }
    return built;
  }

  /**
   * (v18.0) 23: when each tile goes. Ring k (0 = the outer wall, k tiles in from the edge) goes into the void at
   * start + k x every seconds (x `easy` on Easy; Hardcore is Normal), for `rings` rings - fixed, the same every time.
   * Returns { layers: [{ t, tiles }], voidAt: seconds per tile (Infinity: never) }.
   */
  function creepSchedule(W, H, walls, cr, mode) {
    const k = mode === 'easy' ? cr.easy || 1 : 1;
    const voidAt = new Float32Array(W * H).fill(Infinity);
    const layers = [];
    for (let r = 0; r < cr.rings; r++) layers.push({ t: (cr.start + r * cr.every) * k, tiles: [] });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (r >= cr.rings) continue;
        layers[r].tiles.push(y * W + x);
        voidAt[y * W + x] = layers[r].t;
      }
    }
    return { layers, voidAt };
  }

  /**
   * (v18.2) 25: the floor behind you going. Tiles go in order of their walking distance from the start - one more
   * tile of it every `every` s, from `delay` s after the Warden is let out (`relative`: the times count from
   * `base`, which js/game.js sets at the release; until then, Infinity: nothing goes) - and stop `stopShort` tiles
   * before the way out. The same every attempt.
   */
  function collapseSchedule(W, H, blocked, start, exit, co) {
    const at = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
    const d = bfsDist(blocked, W, H, at(start));
    const last = d[at(exit)] - co.stopShort;
    const layers = [];
    for (let k = 0; k <= last; k++) layers.push({ t: co.delay + k * co.every, tiles: [] });
    for (let i = 0; i < d.length; i++) if (d[i] >= 0 && d[i] <= last) layers[d[i]].tiles.push(i);
    return { layers, relative: true, base: Infinity, dist: d };
  }

  /**
   * (v17.0) Can Act 2's level be finished, through its own broken rule? A search over where you stand AND every
   * sliding wall's state (18: a ping of yours toggles each one in range, exactly as the game does - and one never
   * slides onto the tile you are on), stepping through folds (19) and walking through ghost walls but not hidden
   * ones (17). Monsters are left out: this is about the shape of the level. Returns { ok, steps, pings, route, why }.
   * Pure: it reads the level and changes nothing. tools/act2-check.js runs it for 17-20 and fails loudly.
   */
  function solve(level) {
    const W = level.W;
    const H = level.H;
    const a2 = level.act2;
    if (a2 && a2.crumbles && a2.crumbles.length) return solveCrumble(level);
    if (a2 && a2.creep && !a2.creep.relative) return solveCreep(level); // (25's collapse is checked by tools/act2-check.js against the release)
    const tileOf = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
    const s0 = tileOf(level.start);
    const goal = tileOf(level.exit);
    const slides = a2 ? a2.slides : [];
    if (slides.length > 14) return { ok: false, why: 'too many sliding walls to search' };
    const slideOf = new Map(); // tile -> [slide index, is it the A tile]
    slides.forEach((sl, k) => {
      slideOf.set(sl.a, [k, true]);
      slideOf.set(sl.b, [k, false]);
    });
    const blockedAt = (i, bits) => {
      const sl = slideOf.get(i);
      if (sl) return ((bits >> sl[0]) & 1) === 1 ? !sl[1] : sl[1]; // A is stone in state 0, B in state 1
      return level.blocked[i] === 1;
    };
    const fold = a2 ? a2.foldPair : {};
    const range = a2 ? a2.slideRange : 0;
    const pingMask = (i) => {
      const x = ((i % W) + 0.5) * TILE;
      const y = (((i / W) | 0) + 0.5) * TILE;
      let m = 0;
      slides.forEach((sl, k) => {
        if (Math.hypot(sl.x - x, sl.y - y) <= range && sl.a !== i && sl.b !== i) m |= 1 << k;
      });
      return m;
    };
    const N = 1 << slides.length;
    const seen = new Int32Array(W * H * N).fill(-1); // the state it was reached from
    const how = new Int8Array(W * H * N); // 0 a step, 1 a ping
    const q = [s0 * N];
    seen[s0 * N] = s0 * N;
    let head = 0;
    let found = -1;
    while (head < q.length) {
      const key = q[head++];
      const i = Math.floor(key / N);
      const bits = key % N;
      if (i === goal) {
        found = key;
        break;
      }
      const x = i % W;
      const y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || blockedAt(j, bits)) continue;
        const to = fold[j] !== undefined ? fold[j] : j; // a fold puts you on its pair
        const k2 = to * N + bits;
        if (seen[k2] >= 0) continue;
        seen[k2] = key;
        how[k2] = 0;
        q.push(k2);
      }
      if (slides.length) {
        const m = pingMask(i);
        if (m) {
          const k2 = i * N + (bits ^ m);
          if (seen[k2] < 0) {
            seen[k2] = key;
            how[k2] = 1;
            q.push(k2);
          }
        }
      }
    }
    if (found < 0) return { ok: false, why: 'no way from the start to the way out', steps: -1 };
    const route = [];
    let pings = 0;
    for (let k = found; k !== seen[k] || k !== s0 * N; k = seen[k]) {
      route.push({ tile: Math.floor(k / N), ping: how[k] === 1 });
      if (how[k] === 1) pings++;
      if (k === s0 * N) break;
    }
    route.reverse();
    return { ok: true, steps: route.length - pings, pings, route, why: '' };
  }

  /**
   * (v18.0) 21: the crumbling floor. A crumbling tile holds you once: the moment you step off it, it is gone. So the
   * search is over where you stand AND which crumbling tiles are gone (a set, kept as a bit mask - every crumbling
   * tile you have left). It searches EVERY state it can reach, so it can also say whether there is a way to get
   * STUCK - somewhere the way out can no longer be reached from (`stuck`: how many such places).
   */
  function solveCrumble(level) {
    const W = level.W;
    const H = level.H;
    const cr = level.act2.crumbles;
    const bit = new Map(cr.map((c, k) => [c.i, 1n << BigInt(k)]));
    const tileOf = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
    const s0 = tileOf(level.start);
    const goal = tileOf(level.exit);
    const open = (i, mask) => {
      const b = bit.get(i);
      if (b !== undefined) return (mask & b) === 0n; // a crumbling tile: there until you have left it
      return level.blocked[i] !== 1;
    };
    const key = (i, mask) => i + ':' + mask.toString(36);
    const from = new Map([[key(s0, 0n), null]]);
    const states = [[s0, 0n]];
    const next = new Map(); // state -> the states it leads to (for the stuck count)
    for (let h = 0; h < states.length; h++) {
      if (states.length > 400000) return { ok: false, why: 'too many states to search', steps: -1 };
      const [i, mask] = states[h];
      const k0 = key(i, mask);
      const outs = [];
      if (i !== goal) {
        const x = i % W;
        const y = (i / W) | 0;
        const left = bit.has(i) ? mask | bit.get(i) : mask; // stepping off a crumbling tile: gone
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
          if (j < 0 || !open(j, left)) continue;
          const k2 = key(j, left);
          outs.push(k2);
          if (from.has(k2)) continue;
          from.set(k2, k0);
          states.push([j, left]);
        }
      }
      next.set(k0, outs);
    }
    // which states can still get out (backwards from every state on the way out)
    const back = new Map();
    for (const [k, outs] of next) for (const o of outs) (back.get(o) || back.set(o, []).get(o)).push(k);
    const canOut = new Set();
    const q = [];
    for (const k of next.keys()) if (+k.split(':')[0] === goal) {
      canOut.add(k);
      q.push(k);
    }
    while (q.length) {
      const k = q.pop();
      for (const p of back.get(k) || []) if (!canOut.has(p)) {
        canOut.add(p);
        q.push(p);
      }
    }
    let stuck = 0;
    for (const k of next.keys()) if (!canOut.has(k)) stuck++;
    // the shortest way out (the states were searched breadth-first, so the first one at the goal is it)
    const end = states.find(([i]) => i === goal);
    if (!end) return { ok: false, why: 'no way from the start to the way out', steps: -1, stuck };
    const route = [];
    for (let k = key(end[0], end[1]); k !== null; k = from.get(k)) route.push({ tile: +k.split(':')[0], ping: false });
    route.reverse();
    return { ok: true, steps: route.length - 1, pings: 0, route, why: '', stuck, states: states.length };
  }

  /**
   * (v18.0) 23: the creep. Every tile is there until its ring goes (voidAt); walking at your speed from the moment you
   * can move, can you always be off a tile before it goes? A breadth-first search in time (waiting never helps: the
   * void only grows). `spare` is how much slower than a clean walk you could go along the way it found and still
   * get out (0.3 = 30% slower), counting from when the level gives you the controls.
   */
  const CREEP_CONTROLS_AT = 0.7; // s: when the level hands you the controls (startAct2)
  function solveCreep(level) {
    const W = level.W;
    const H = level.H;
    const voidAt = level.act2.creep.voidAt;
    const tileOf = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
    const s0 = tileOf(level.start);
    const goal = tileOf(level.exit);
    const tau = TILE / 170; // s a tile, at walking speed
    const steps = new Int32Array(W * H).fill(-1);
    const from = new Int32Array(W * H).fill(-1);
    steps[s0] = 0;
    const q = [s0];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i === goal) break;
      const t = CREEP_CONTROLS_AT + steps[i] * tau;
      const x = i % W;
      const y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || steps[j] >= 0 || level.blocked[j] === 1) continue;
        if (t + tau >= voidAt[j] || t + tau >= voidAt[i]) continue; // it would be gone before you got there - or under you as you left
        steps[j] = steps[i] + 1;
        from[j] = i;
        q.push(j);
      }
    }
    if (steps[goal] < 0) return { ok: false, why: 'the void gets there first', steps: -1 };
    const route = [];
    for (let i = goal; i >= 0; i = from[i]) route.push({ tile: i, ping: false });
    route.reverse();
    // the tightest tile of the way: (time you leave it) / (time it goes)
    let use = 0;
    route.forEach((r, k) => {
      if (voidAt[r.tile] === Infinity) return;
      use = Math.max(use, (CREEP_CONTROLS_AT + (k + 1) * tau) / voidAt[r.tile]);
    });
    return { ok: true, steps: route.length - 1, pings: 0, route, why: '', spare: use > 0 ? 1 / use - 1 : Infinity };
  }

  // ------------------------------------------------------------ the beats
  /**
   * env (all functions unless said otherwise):
   *   player()              the player                    level()      the level being played
   *   audio, cues           the sound engine and the visual cues (cues.caption only shows with Visual cues on)
   *   calm()                calm mode                     playerR      the player's radius (px)
   *   los(x0, y0, x1, y1)   a clear line between two points (walls only - the game's own hasLOS)
   *   raycast(x, y, dx, dy, max)   distance along a unit direction to the first wall
   *   lock(on)              take the controls away / give them back (the game keeps running underneath)
   *   walk(vx, vy)          move the player at this velocity (px/s) while the controls are taken (0, 0 stops)
   *   openTile(tx, ty)      turn a sealed tile into floor
   *   hunter()              the Warden on this level (a monster in the game's list), or null
   *   wake(e, why)          the Warden starts hunting      hold(on)     freeze every Warden where it is
   *   reveal(e, rp)         the Warden is shown for what it is (rp: the ripple whose rays found it, re-coloured)
   *   gasp()                the involuntary ripple from the player (returns it)
   *   drip(x, y, R, metal)  a drop of water: a small ripple of its own, and its sound
   *   setKey(on)            the player is carrying the key (the HUD shows it)
   *   music(mood)           change the soundtrack's mood ('hope', 'hunt', ...)
   *   banner()              show this level's hint      notify(title, text)   a short message in the same place
   *   ready()               the controls are the player's for the first time this level
   *   finish()              this level is done: on to the next one (or the end)
   *   el                    { box, head, line } - the line on screen when the player speaks
   */
  function create(env) {
    let lv = null; // the level being played, or null
    let S = null; // its story block
    let kind = 'off';
    let phase = 'off';
    let clock = 0; // seconds since the level started (the game's clock: pausing stops it)
    let tl = null; // the scripted beat running now
    let timers = []; // things to do a little later that are not part of a beat (see after)
    let locked = false;
    let veil = 0; // 0..1 of black over everything
    let veilFrom = 0;
    let veilTo = 0;
    let veilT = 0;
    let veilDur = 0;
    let flare = 0; // the reveal's flash, fading
    let quake = 0; // px of extra shake, fading
    let focus = null; // { x, y, k, to, rate }: where the camera is drawn towards for a beat
    let drips = []; // { x, y, period, next, on, metal, rnd }
    let speech = null;
    let doorCd = 0; // seconds before trying the locked door says so again
    let tried = 0; // times the locked door has been tried
    let keyRevealed = false;
    let light = null; // 15: { x, y, k, sight, seen, near, rays }
    let chirpCd = 0;
    let chirpRnd = null;
    let readyDone = false;
    // (v17.0) Act 2
    let glitchT = 0; // s of the screen's glitch still to run
    let glitchBig = false;
    let firstPing = false; // 17: the first ripple stutters
    let fallIn = 0; // s to the next distant fall
    let voidRnd = null;
    let staticCanvas = null; // the void's static: drawn once, moved about
    let foldFlick = 0;
    // (v18.2) 25
    let white = 0; // 0..1 of white over everything: the light, flooding in at the end
    let whiteTo = 0;
    let hushK = 1; // the Warden's hum, fading out once you are through
    let carryDaylight = false; // (v19.0) 25 -> 26: the outside sound is not stopped between them
    let birdCd = 0;

    const P = () => env.player();
    const calm = () => !!env.calm();
    const audio = env.audio;
    const caption = (text) => env.cues && env.cues.caption(text);

    // ----------------------------------------------------------- helpers
    /** A small xorshift of its own (drips, chirps): never Math.random, never the generator's numbers. */
    function rng(seed) {
      let s = seed >>> 0 || 0x9e3779b9;
      return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
      };
    }

    /** Run a beat: [[seconds, fn], ...] on the game's clock. Only one runs at a time. */
    function play(events, onEnd) {
      tl = { t: 0, ev: events.slice().sort((a, b) => a[0] - b[0]), i: 0, onEnd };
    }
    function runBeat(dt) {
      if (!tl) return;
      const me = tl;
      me.t += dt;
      while (tl === me && me.i < me.ev.length && me.ev[me.i][0] <= me.t) me.ev[me.i++][1]();
      if (tl === me && me.i >= me.ev.length) {
        tl = null;
        if (me.onEnd) me.onEnd();
      }
    }

    function setLock(on) {
      locked = !!on;
      env.lock(locked);
      if (!locked) env.walk(0, 0);
    }

    /** Give the player the controls, and the first time this level, everything that waited for that. */
    function release() {
      setLock(false);
      if (!readyDone) {
        readyDone = true;
        env.ready();
      }
    }

    /** Fade to (or from) black over `dur` seconds. */
    function fade(to, dur) {
      veilFrom = veil;
      veilTo = to;
      veilT = 0;
      veilDur = Math.max(0.001, dur * (calm() ? 1.25 : 1));
    }

    function shakeBy(px) {
      if (!calm()) quake = Math.max(quake, px);
    }

    /** The player says something: typed out on the game's clock while the explorers' voice says it. */
    function speak(text, o = {}) {
      const cps = o.cps || 15;
      if (speech && speech.voice) speech.voice.stop();
      speech = {
        text,
        t: 0,
        shown: -1,
        cps,
        hold: o.hold === undefined ? 1.7 : o.hold,
        voice: audio ? audio.speak(text, { pitch: 0.94, shake: o.shake || 0.02, vol: o.vol || 0.8, cps }) : null,
      };
      env.hideBanner(); // (the two share the bottom of the screen, and what you say is the one worth reading)
      if (env.el && env.el.box) {
        env.el.head.textContent = 'You';
        env.el.line.textContent = '';
        env.el.box.classList.add('show');
      }
    }
    function updateSpeech(dt) {
      if (!speech) return;
      speech.t += dt;
      const n = Math.min(speech.text.length, Math.floor(speech.t * speech.cps));
      if (n !== speech.shown) {
        speech.shown = n;
        if (env.el && env.el.line) env.el.line.textContent = speech.text.slice(0, n);
      }
      if (speech.t > speech.text.length / speech.cps + speech.hold) hideSpeech();
    }
    function hideSpeech() {
      if (speech && speech.voice) speech.voice.stop();
      speech = null;
      if (env.el && env.el.box) env.el.box.classList.remove('show');
    }

    // ---------------------------------------------------------- the drips
    function setDrips(list, opts = {}) {
      drips = list.map((d, i) => {
        const rnd = rng(0x2f6b1 + i * 7919 + (S ? S.n * 104729 : 0));
        return { x: d.x, y: d.y, period: opts.period || 4.2, next: (opts.first || 0.8) + rnd() * (opts.spread || 3), on: d.on !== false, metal: !!d.metal, rnd, key: !!d.key };
      });
    }
    function updateDrips(dt) {
      for (const d of drips) {
        if (!d.on) continue;
        d.next -= dt;
        if (d.next <= 0) {
          d.next = d.period * (0.75 + 0.5 * d.rnd());
          env.drip(d.x, d.y, DRIP_R, d.metal);
        }
      }
    }

    // ------------------------------------------------------------- start
    function start(level) {
      stop();
      lv = level && level.story ? level : null;
      if (!lv) return;
      S = lv.story;
      kind = S.kind;
      clock = 0;
      tl = null;
      timers = [];
      flare = 0;
      quake = 0;
      focus = null;
      doorCd = 0;
      tried = 0;
      keyRevealed = false;
      readyDone = false;
      light = null;
      chirpCd = 2;
      chirpRnd = rng(0x5eed15);
      veil = 1; // every one of these begins in the dark the last one ended in
      veilFrom = 1;
      veilTo = 1;
      veilDur = 0.001;
      if (kind === 'gaol') startGaol();
      else if (kind === 'light') startLight();
      else if (kind === 'outside') startOutside(); // (v18.2)
      else if (kind === 'field' || kind === 'village' || kind === 'dusk') startField(); // (v19.0; v19.2 the village; v19.3 dusk)
      else if (S.spec.act2) startAct2();
      else startDeep();
    }

    function stop() {
      hideSpeech();
      if (dkVoice && audio) audio.destroyEnemyVoice(dkVoice); // (v19.3)
      dkVoice = null;
      if (audio) {
        if (!carryDaylight) audio.stopDaylight(true); // (v19.0: kept from 25's end into the field)
        audio.stopCistern();
        audio.stopVoid(); // (v17.0)
      }
      glitchT = 0;
      foldFlick = 0;
      white = 0;
      whiteTo = 0;
      lv = null;
      S = null;
      kind = 'off';
      phase = 'off';
      tl = null;
      drips = [];
      timers = [];
      locked = false;
      veil = 0;
      veilTo = 0;
      flare = 0;
      quake = 0;
      focus = null;
      light = null;
    }

    // ============================================================ 14: THE GAOL
    function startGaol() {
      phase = 'wake';
      setLock(true);
      // the drops: the corridor's, and one over the key that only starts once you know you need it
      const list = S.drips.map((d) => ({ x: d.x, y: d.y }));
      list.push({ x: S.key.x, y: S.key.y, on: false, metal: true, key: true });
      setDrips(list, { period: 4.6, first: 5, spread: 4 });
      const wd = S.spec.wakeDrip;
      // THE WAKE. Black; your own breath and a ringing in your ears; the dark lifts a little; one drop of water
      // lands beside you and its ripple shows you the stone and the bars; then you speak, and you can move.
      play(
        [
          [0, () => {
            if (audio) audio.wakeUp();
            caption('[ringing in your ears]');
          }],
          [1.1, () => fade(0, 2.6)],
          [1.3, () => audio && audio.breath(0.9)],
          [2.2, () => env.drip(wd.x, wd.y, DRIP_R + 36, false)], // (a little further than most: it shows you the whole cell)
          [3.0, () => speak('...Still breathing.', { cps: 12 })],
          [4.6, () => {
            phase = 'explore';
            after(1.8, () => env.banner()); // the level's hint, once the line has had its moment
          }],
        ],
        release
      );
    }

    /** The key has been lit by a wave (yours or a drop's). The first time you can SEE it from here, the beat. */
    function onKeyLit() {
      if (kind !== 'gaol' || keyRevealed || S.key.taken || tl || locked) return;
      const p = P();
      const k = S.key;
      if (Math.hypot(p.x - k.x, p.y - k.y) > 380 || !env.los(p.x, p.y, k.x, k.y)) return;
      keyRevealed = true;
      setLock(true);
      if (audio) audio.dripMetal(0, 0.7);
      caption('[metal glints]');
      focus = { x: k.x, y: k.y, k: 0, to: calm() ? 0.45 : 0.7, rate: calm() ? 1.6 : 2.6 };
      play(
        [
          [0.35, () => speak('A key.', { cps: 10, hold: 1.2 })],
          [1.35, () => {
            focus.to = 0;
          }],
        ],
        release
      );
    }

    function tryDoor() {
      const p = P();
      const d = S.door;
      if (!d.solid || locked || tl) return;
      // pressed up against it (the slab, not the doorway round it)
      if (!d.parts.some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= q.r + env.playerR + 4)) return;
      if (S.hasKey) return unlockDoor();
      if (doorCd > 0) return;
      doorCd = 1.5;
      tried++;
      if (audio) audio.doorRattle(0, 0.9);
      if (env.cues) env.cues.pulse('exit', d.x, d.y, 0.9, { key: d, sub: 'rattle' });
      caption('[the door rattles: locked]');
      if (tried === 1) {
        speak('Locked.', { cps: 11, hold: 1.2 });
        // ...and somewhere back there, water starts landing on metal
        for (const dr of drips) {
          if (dr.key) {
            dr.on = true;
            dr.next = 1.4;
          }
        }
      }
    }

    function unlockDoor() {
      const d = S.door;
      setLock(true);
      if (audio) audio.doorUnlock();
      caption('[the key turns]');
      play(
        [
          [0.85, () => caption('[a bolt draws back]')],
          [1.15, () => {
            if (audio) audio.doorOpen();
            caption('[the door grinds open]');
            d.opening = true;
            shakeBy(3);
          }],
          [2.0, () => {
            d.solid = false; // the way is open from here
            env.openTile(d.tx, d.ty);
          }],
          [2.5, () => {
            S.hasKey = false;
            env.setKey(false);
            phase = 'out';
            for (const dr of drips) dr.on = dr.key ? false : dr.on;
          }],
        ],
        release
      );
    }

    function updateGaol(dt) {
      const p = P();
      doorCd = Math.max(0, doorCd - dt);
      if (S.door.opening) S.door.swing = Math.min(1, S.door.swing + dt / 1.1); // it swings back over a second
      if (phase === 'explore' || phase === 'out') {
        // the key: walk onto it
        const k = S.key;
        if (!k.taken && Math.hypot(p.x - k.x, p.y - k.y) < k.r + env.playerR + 2) {
          k.taken = true;
          S.hasKey = true;
          env.setKey(true);
          if (audio) audio.keyPickup();
          caption('[you take the key]');
          for (const dr of drips) if (dr.key) dr.on = false;
        }
        if (S.door.solid) tryDoor();
      }
    }

    // ===================================================== 15: THE FALSE EXIT
    function startLight() {
      phase = 'dark';
      setLock(true);
      const h = env.hunter();
      // The light is where the Warden stands, just in front of it, down the passage it is facing.
      const lx = S.hunterAt.x - 9;
      const ly = S.hunterAt.y;
      // where its own light falls: the stone round it, worked out once (it never moves while it is a light)
      const rays = [];
      const N = 240;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        rays.push(env.raycast(lx, ly, Math.cos(a), Math.sin(a), LIGHT_REACH));
      }
      light = { x: lx, y: ly, k: 1, sight: 0, seen: false, near: false, rays, N, flick: 0 };
      if (h) h.lure = 1;
      play(
        [
          [0, () => fade(0, 1.4)],
          [0.7, () => env.banner()],
        ],
        release
      );
    }

    /** How much of the light is in view from here, 0..1 - a row of points across it, each tested for line of sight. */
    function lightSight(p) {
      let n = 0;
      const pts = [[0, 0], [-10, -12], [-10, 12], [-16, 0], [4, -7], [4, 7]];
      for (const [dx, dy] of pts) if (env.los(p.x, p.y, light.x + dx, light.y + dy)) n++;
      return n / pts.length;
    }

    function updateLight(dt) {
      const p = P();
      const h = env.hunter();
      if (!light) return;
      if (h && h.reachGoal !== undefined) h.reach = (h.reach || 0) + (h.reachGoal - (h.reach || 0)) * Math.min(1, 5 * dt);
      const see = lightSight(p);
      // up gently as it comes into view, and straight down to whatever can be seen when a wall gets in the way
      light.sight = see < light.sight ? see : light.sight + (see - light.sight) * Math.min(1, 6 * dt);
      const d = Math.hypot(p.x - light.x, p.y - light.y);
      if (phase === 'dark' || phase === 'lure') {
        // HOPE, ON PURPOSE. The first sight of it, a softer sound than anything down here, and a line.
        if (!light.seen && see > 0.3 && !locked) {
          light.seen = true;
          phase = 'lure';
          if (audio) audio.startDaylight();
          env.music('hope');
          speak('...Light?', { cps: 10, hold: 1.4 });
        }
        if (light.seen) {
          // the closer, the warmer the air sounds - and only while it is in view
          const near = clamp(1 - (d - 160) / 640, 0, 1);
          if (audio) audio.setDaylight(0.25 + 0.75 * near * Math.max(0.35, light.sight));
          chirpCd -= dt;
          if (chirpCd <= 0 && near > 0.25) {
            chirpCd = 2.8 + 3 * chirpRnd();
            if (audio) audio.birdChirp(clamp((light.x - p.x) / 600, -0.6, 0.6), 0.25 + 0.5 * near);
            caption('[birdsong, far off]');
          }
          if (!light.near && d < 420 && see > 0.3 && !speech) {
            light.near = true;
            speak('Is that... outside?', { cps: 13, hold: 1.4 });
          }
        }
        // the reveal: close enough, and standing in the passage that leads to it
        const front = h ? Math.hypot(p.x - h.x, p.y - h.y) - h.r : d;
        if (!locked && front <= S.spec.revealDist && see > 0.2) revealWarden();
      }
    }

    /**
     * IT WAS NEVER A WAY OUT. The light flickers and goes out, the soft sound is cut off dead, you flinch - a
     * ripple goes out of you whether you want one or not, the same gasp as level 13 - and the wave finds stone
     * that moves. It reaches for you, the floor shakes, and somewhere behind you a sealed passage cracks open.
     */
    function revealWarden() {
      const h = env.hunter();
      phase = 'reveal';
      setLock(true);
      if (audio) audio.stopDaylight(true);
      env.music(null);
      caption('[the light flickers]');
      let rp = null;
      play(
        [
          [0, () => {
            light.flick = 1;
          }],
          [0.55, () => {
            light.k = 0;
            light.flick = 0;
            if (h) h.lure = 0;
            rp = env.gasp(); // you flinch: the ripple goes out on its own
            // ...and the wall answers when the wave really reaches it (well before the next beat, at 1.0 s)
            const p = P();
            const arrive = h ? clamp((Math.hypot(h.x - p.x, h.y - p.y) - h.r) / env.rippleSpeed, 0, 0.4) : 0.25;
            setTimeoutBeat(0.55 + arrive, () => {
              if (h) {
                env.reveal(h, rp);
                h.reachGoal = 0.55; // and it reaches for you - the same limbs as level 13's, not yet all the way
              }
              flare = 1;
              shakeBy(5);
              if (audio) {
                audio.wardenReveal();
                audio.wardenTake(0.65, 0.9);
              }
              caption('[the light moves]');
            });
          }],
          [1.55, () => {
            if (h) h.reachGoal = 0;
          }],
          [1.0, () => {
            for (const s of S.seals) env.openTile(s.tx, s.ty);
            const s0 = S.seals[0];
            const pan = s0 ? clamp(((s0.tx + 0.5) * TILE - P().x) / 300, -0.8, 0.8) : 0;
            if (audio) audio.stoneGrind(pan, 0.8);
            shakeBy(9);
            caption('[stone grinds open behind you]');
          }],
          [1.85, () => {
            S.exitMuted = false; // and now, somewhere, the way out can be heard
            env.music('hunt');
            speak('Run.', { cps: 14, hold: 0.9, shake: 0.12 });
          }],
          [REVEAL_WAKE, () => {
            if (h) env.wake(h, 'hunt'); // a moment for you to turn round, and it is coming
            phase = 'chase';
          }],
        ],
        null
      );
      // the controls come back while it is still gathering itself (the beat goes on to 2.6 s)
      setTimeoutBeat(1.9, release);
    }

    /** Something to do a little later, on the game's clock, without holding a beat open (a banner, a message). */
    function after(seconds, fn) {
      timers.push({ t: seconds, fn });
    }
    function runTimers(dt) {
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt;
        if (timers[i].t <= 0) timers.splice(i, 1)[0].fn();
      }
    }

    /** Something to do partway through the running beat without ending it (it shares the beat's clock). */
    function setTimeoutBeat(at, fn) {
      if (tl) {
        tl.ev.push([at, fn]);
        tl.ev.sort((a, b) => a[0] - b[0]);
      }
    }

    // ======================================================== 16: THE DEEP
    function startDeep() {
      phase = 'calm';
      setLock(true);
      setDrips(S.drips, { period: 3.4, first: 0.6, spread: 2.2 });
      if (audio) audio.startCistern();
      play(
        [
          [0, () => fade(0, 1.4)],
          [0.7, () => env.banner()],
        ],
        release
      );
    }

    function updateDeep() {
      const p = P();
      if (phase === 'calm' && !locked && p.x >= S.spec.tripX) releaseWarden();
    }

    /** ANOTHER ONE. Stone splits far behind you, the seal it was set into falls open, and it comes. */
    function releaseWarden() {
      const h = env.hunter();
      phase = 'release';
      setLock(true);
      env.music(null);
      const s0 = S.seals[0];
      const p = P();
      const sx = s0 ? (s0.tx + 0.5) * TILE : p.x - 400;
      if (audio) audio.stoneSplit(clamp((sx - p.x) / 500, -0.9, 0.9), 0.75);
      caption('[stone splits, far behind you]');
      shakeBy(7);
      for (const s of S.seals) env.openTile(s.tx, s.ty);
      if (h) h.hidden = false; // there is nothing left to pretend to be
      play(
        [
          [0.7, () => speak('Another one.', { cps: 12, hold: 1.1 })],
          [1.6, () => {
            env.music('hunt');
            phase = 'chase';
            release(); // you can move...
            after(1.4, () => env.notify('Faster than you', 'This one gains on you all the time. Keep moving, follow the water, and do not go back.'));
          }],
          // ...and it is still tearing itself out of the wall for a moment longer. That moment is the head start
          // that makes this fair: a clean run reaches the way out well ahead of it, and every wrong turn and
          // every pause spends some of that lead (measured with tools/story-bot.js - see CLAUDE.md, v14.0).
          [RELEASE_WAKE, () => {
            if (audio) audio.stoneGrind(0, 0.45);
            if (h) env.wake(h, 'upgraded');
          }],
        ],
        null
      );
    }

    // ===================================================== (v19.0) 26: OUTSIDE 1, THE FIELD
    // It begins in the white 25 ended in, and the colour comes in slowly. No words, no hint, no title: wind and birds
    // (25's sound of outside, carried on and swelling), louder towards the way on.
    function startField() {
      phase = 'calm';
      dk = { p: 0, k: 0, s1: 0, s2: 0, s3: 0, h: 0, hum: 0, d: Infinity, talked: false, murmurCd: 3, echo: [] };
      if (kind === 'dusk' && audio) dkVoice = audio.createEnemyVoice(46.25, 'warden'); // its own low voice (15-16's)
      vPhase = 0;
      vCycle = 0;
      vHush = 0;
      vEchoes = [];
      vSeen = [];
      vResets = 0;
      setLock(true);
      veil = 0; // (not the dark every other story level opens in: the light it ended in)
      veilFrom = 0;
      veilTo = 0;
      white = 1;
      whiteTo = 0;
      birdCd = 2.5;
      if (audio) {
        audio.startDaylight(); // (already going, if you came from 25)
        audio.setDaylight(0.7);
      }
      carryDaylight = false;
      play([[1.4, () => {}]], release);
    }
    function updateField(dt) {
      if (whiteTo < white) white = Math.max(whiteTo, white - dt / 4.5); // the colour, coming in slowly
      else if (whiteTo > white) white = Math.min(whiteTo, white + dt / 2.2);
      const p = P();
      const ex = lv.exit;
      const near = clamp(1 - Math.hypot(p.x - ex.x, p.y - ex.y) / 3000, 0, 1);
      if (audio && phase !== 'leaving') audio.setDaylight(0.5 + 0.5 * near); // the wind and the birds louder towards the way on
      birdCd -= dt;
      if (birdCd <= 0) {
        birdCd = 1.6 + 3.6 * chirpRnd();
        const fewer = kind === 'dusk' ? clamp(1 - dk.k / 0.4, 0, 1) : 1; // (v19.3: the birds go quiet as it darkens)
        if (audio && fewer > 0) audio.birdChirp(chirpRnd() * 1.6 - 0.8, (0.25 + 0.4 * chirpRnd()) * fewer);
      }
      if (kind === 'village') updateVillage(dt, near);
      if (kind === 'dusk') updateDusk(dt);
    }

    // ===================================================== (v19.2) 27: FRESH AIR, THE VILLAGE
    // Its people go about their day - and every VILLAGE_LOOP seconds, all at once, it starts again: they fade a little,
    // for a moment, and are back where they began, under a half-second hush. Every sound the village makes comes again
    // a beat later, quieter (ECHO_*) - never the player's, and never an echo of an echo.
    const ECHO_DELAY = 0.45; // s
    const ECHO_GAIN = 0.4; // of the sound it echoes
    const ECHO_MAX = 14; // echoes waiting at once, at most
    const RESET_FADE = 0.35; // s either side of the moment it starts again
    const HUSH = 0.5; // s of the hush
    const KEEP_AWAY = 34; // px: how close a villager comes to you (they make room, without looking)
    let vPhase = 0;
    let vCycle = 0;
    let vHush = 0;
    let vEchoes = [];
    let vSeen = [];
    let vResets = 0;
    function villagePlay(snd, x, y, gain, who, echo) {
      const p = P();
      const d = Math.hypot(x - p.x, y - p.y);
      const g = gain * Math.pow(clamp(1 - d / 760, 0, 1), 1.5);
      if (g < 0.015 || !audio) return;
      const pan = clamp((x - p.x) / 520, -0.9, 0.9);
      if (snd === 'step') audio.grassStep(g * 0.55, pan);
      else if (snd === 'bucket') audio.dripMetal(pan, g * 0.7);
      else if (snd === 'ball') audio.ballKick(pan, g);
      else if (snd === 'sweep') audio.sweep(pan, g);
      else if (snd === 'cloth') audio.sweep(pan, g * 0.45);
      else if (snd === 'murmur') audio.murmur(pan, g, who ? who.pitch : 1);
      // ...and again, a beat later, quieter - once
      if (!echo && vEchoes.length < ECHO_MAX) vEchoes.push({ at: clock + ECHO_DELAY, snd, x, y, gain: gain * ECHO_GAIN, who });
    }
    /** Where a villager is at this moment of the day (tiles -> px), which way it faces, and whether it is walking. */
    function villagerAt(v, t) {
      const kf = v.kf;
      let k = 0;
      while (k < kf.length - 1 && kf[k + 1].t <= t) k++;
      const a = kf[k];
      const b = kf[Math.min(k + 1, kf.length - 1)];
      const u = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      const moving = (b.x !== a.x || b.y !== a.y) && u > 0 && u < 1;
      const face = moving ? Math.atan2(b.y - a.y, b.x - a.x) : b.face !== undefined ? b.face : a.face !== undefined ? a.face : v.face || 0;
      return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, face, moving };
    }
    function updateVillage(dt, near) {
      const people = lv.field.people;
      const T = clock;
      const cycle = Math.floor(T / VILLAGE_LOOP);
      const prev = vPhase;
      vPhase = T - cycle * VILLAGE_LOOP;
      const restarted = cycle !== vCycle;
      if (restarted) {
        vCycle = cycle;
        vHush = HUSH; // every one of them, at the same instant - and the wind holds its breath
        vResets++;
        if (vSeen.length) for (const s0 of vSeen) s0.acc = 0;
      }
      vHush = Math.max(0, vHush - dt);
      if (audio && phase !== 'leaving') audio.setDaylight((0.5 + 0.5 * near) * (1 - 0.65 * Math.sin(Math.PI * (vHush / HUSH)))); // (a hush: down and back up, softly)
      if (vSeen.length !== people.length) vSeen = people.map(() => ({ acc: 0, every: 0, x: 0, y: 0 }));
      const p = P();
      people.forEach((v, i) => {
        const at = villagerAt(v, vPhase);
        const me = vSeen[i];
        // the day's own sounds, as they come round (from where it is)
        for (const e of v.ev) if ((restarted ? e.t <= vPhase : e.t > prev && e.t <= vPhase)) villagePlay(e.snd, at.x, at.y, 0.9, v, false);
        if (v.every) {
          me.every -= dt;
          if (me.every <= 0) {
            me.every = v.every.dt;
            villagePlay(v.every.snd, at.x, at.y, 0.8, v, false);
          }
        }
        // making room: never on you, never in your way - and not a look your way
        let x = at.x;
        let y = at.y;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < KEEP_AWAY && d > 0.01) {
          x = p.x + ((x - p.x) / d) * KEEP_AWAY;
          y = p.y + ((y - p.y) / d) * KEEP_AWAY;
        }
        if (!restarted && me.x) me.acc += Math.hypot(x - me.x, y - me.y);
        if (me.acc >= 26) {
          me.acc = 0;
          villagePlay('step', x, y, 0.55, v, false);
        }
        // fading a little, for a moment, either side of the moment it all starts again (never a flash)
        const edge = Math.min(vPhase, VILLAGE_LOOP - vPhase);
        me.alpha = 0.12 + 0.88 * smooth(clamp(edge / RESET_FADE, 0, 1));
        me.x = x;
        me.y = y;
        me.face = at.face;
        me.moving = at.moving;
        me.stride = at.moving ? Math.sin(clock * 9 + i) : 0;
      });
      for (let k = vEchoes.length - 1; k >= 0; k--) {
        const e = vEchoes[k];
        if (clock < e.at) continue;
        vEchoes.splice(k, 1);
        villagePlay(e.snd, e.x, e.y, e.gain, e.who, true);
      }
    }
    // ===================================================== (v19.3) 28: DUSK
    // The light goes with how far you have come (never with time: standing still changes nothing), and it does not
    // come back if you turn round. Four stretches: day; dusk (a warm, then violet, dimming); night (deep blue); and
    // then black - the ground and everything on it gone. The sound goes with it: the wind and the birds fade, the
    // village's last murmurs (and their echoes) behind you die away, and your steps turn to the gaol's dry ones
    // (js/game.js). Far along, the Warden in its faint glow - harmless, still, its hum coming up as you come near;
    // close to, it turns to face you; closer, you can talk to it.
    const DUSK_TALK = 92; // px from it: the Talk prompt
    const DUSK_TURN = 165; // px: it turns to you
    let dk = { p: 0, k: 0, s1: 0, s2: 0, s3: 0, h: 0, hum: 0, d: Infinity, talked: false, murmurCd: 3, echo: [] };
    let dkVoice = null;
    function updateDusk(dt) {
      const D = lv.field.dusk;
      const p = P();
      dk.p = Math.max(dk.p, clamp((p.x - D.from) / (D.to - D.from), 0, 1)); // as far as you have come - and kept
      dk.s1 = smooth((dk.p - 0.1) / 0.28); // dusk
      dk.s2 = smooth((dk.p - 0.34) / 0.3); // night
      dk.s3 = smooth((dk.p - 0.6) / 0.22); // nothing
      dk.k = smooth((dk.p - 0.08) / 0.7); // how much of the day has gone (the sound)
      if (audio && phase !== 'leaving') audio.setDaylight(0.6 * (1 - dk.k));
      // the village behind you: a murmur now and then, and its echo, dying away
      dk.murmurCd -= dt;
      if (dk.murmurCd <= 0) {
        dk.murmurCd = 2.6 + 3 * chirpRnd();
        const g = 0.16 * clamp(1 - dk.k / 0.3, 0, 1);
        if (audio && g > 0.01) {
          audio.murmur(-0.8, g, 0.8 + 0.4 * chirpRnd());
          dk.echo.push({ at: clock + 0.45, g: g * 0.4 });
        }
      }
      for (let i = dk.echo.length - 1; i >= 0; i--) {
        if (clock < dk.echo[i].at) continue;
        if (audio) audio.murmur(-0.7, dk.echo[i].g, 0.9);
        dk.echo.splice(i, 1);
      }
      // the Warden: it never moves. Its hum comes up as you come near; close to, it turns to face you
      const K = D.keeper;
      dk.d = Math.hypot(p.x - K.x, p.y - K.y);
      const want = dk.d < DUSK_TURN ? Math.atan2(p.y - K.y, p.x - K.x) : 0;
      let dh = want - dk.h;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      dk.h += dh * Math.min(1, dt * 1.4); // slowly
      dk.hum = 0.16 * Math.pow(clamp(1 - dk.d / 1500, 0, 1), 1.5);
      if (dkVoice) audio.updateEnemyVoice(dkVoice, { gain: dk.hum * (calm() ? 0.6 : 1), pan: clamp((K.x - p.x) / 420, -0.9, 0.9), mood: 0.05, muffle: false });
    }
    const duskTalkable = () => kind === 'dusk' && !dk.talked && phase !== 'leaving' && !locked && dk.d < DUSK_TALK;
    /** (js/game.js) the dark, the Warden and the Talk prompt, as they are now. */
    function dusk() {
      if (!lv || kind !== 'dusk') return null;
      return { p: dk.p, k: dk.k, s1: dk.s1, s2: dk.s2, s3: dk.s3, keeper: lv.field.dusk.keeper, h: dk.h, hum: dk.hum, d: dk.d, talkable: duskTalkable(), talked: dk.talked };
    }
    /** Talk to it (the interact key, or the Talk button): the scene "Nothing Listens" (js/game.js onTalk). */
    function talk() {
      if (!duskTalkable()) return false;
      dk.talked = true;
      setLock(true);
      env.walk(0, 0);
      if (env.talk) env.talk();
      return true;
    }

    /** (js/game.js drawDaylight) the villagers as they are now: where, facing, walking, how faded, what they wear. */
    function villagers() {
      if (!lv || kind !== 'village') return [];
      const people = lv.field.people;
      return vSeen.map((m, i) => ({ x: m.x, y: m.y, face: m.face, stride: m.stride || 0, alpha: m.alpha === undefined ? 1 : m.alpha, clothes: people[i].clothes, hair: people[i].hair, small: people[i].small, what: people[i].what, ev: people[i].ev, moving: !!m.moving, phase: vPhase }));
    }

    // ===================================================== (v18.2) 25: THE LIGHT
    // Arrival: a long quiet hall, and far off down it a faint warm pinpoint - level 15's light, drawn the same way and
    // held to the same rule (clipped to what you could really see), but at the way out, and real. The sound of outside
    // (level 15's daylight, without its birds: it is night out there) grows as you come. Past tripX the stone behind
    // you splits and level 16's Warden is let out; the floor behind starts to go. The way out is the light.
    function startOutside() {
      phase = 'calm';
      setLock(true);
      white = 0;
      whiteTo = 0;
      hushK = 1;
      const x = lv.exit;
      const rays = [];
      const N = 240;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        rays.push(env.raycast(x.x, x.y, Math.cos(a), Math.sin(a), LIGHT_REACH));
      }
      light = { x: x.x, y: x.y, k: 0.18, sight: 0, seen: false, near: false, rays, N, flick: 0 };
      if (audio) {
        audio.startVoid(S.spec.void);
        audio.startDaylight();
        audio.setDaylight(0.06);
      }
      play(
        [
          [0, () => fade(0, 1.6)],
          [0.8, () => env.banner()],
        ],
        release
      );
    }
    function updateOutside(dt) {
      if (!light) return;
      const p = P();
      const see = lightSight(p);
      light.sight = see < light.sight ? see : light.sight + (see - light.sight) * Math.min(1, 6 * dt);
      const near = clamp(1 - Math.hypot(p.x - light.x, p.y - light.y) / S.spec.lightFar, 0, 1);
      // it grows and warms the nearer you are - drawing only, never a light anything else reads
      light.k += (0.18 + 0.82 * near - light.k) * Math.min(1, 1.5 * dt);
      if (phase === 'leaving') {
        hushK = Math.max(0, hushK - dt / 1.8); // its steps have stopped; now its hum goes
        env.hush(hushK);
      } else if (audio) audio.setDaylight(0.08 + 0.62 * near);
      if (whiteTo > white) white = Math.min(whiteTo, white + dt / 3.2);
      if (phase === 'calm' && !locked && p.x >= S.spec.tripX) releaseOutside();
    }
    /** Behind you, the stone splits: it is out - and the floor behind you starts to go. Nothing is said. */
    function releaseOutside() {
      const h = env.hunter();
      phase = 'chase';
      const s0 = S.seals[0];
      const p = P();
      const sx = s0 ? (s0.tx + 0.5) * TILE : p.x - 400;
      if (audio) audio.stoneSplit(clamp((sx - p.x) / 500, -0.9, 0.9), 0.75);
      caption('[stone splits, far behind you]');
      shakeBy(7);
      for (const sl of S.seals) env.openTile(sl.tx, sl.ty);
      if (h) h.hidden = false;
      env.music('hunt');
      env.collapse(); // (the schedule starts now - its first tile goes collapse.delay s later)
      after(S.spec.wake, () => {
        if (!lv || phase === 'leaving') return;
        if (audio) audio.stoneGrind(0, 0.45);
        if (h) env.wake(h, 'upgraded');
      });
    }

    // ===================================================== 17-20: ACT 2, THE BROKEN GAOL
    // No words, no cutscene: each level opens in the dark the last one ended in, with its hint, and the void around it.
    function startAct2() {
      phase = 'calm';
      setLock(true);
      firstPing = false;
      glitchT = 0;
      foldFlick = 0;
      voidRnd = rng(0x51ab1e + S.n * 7919);
      const V = VOID[S.spec.void] || VOID[1];
      fallIn = V.fallEvery[0] * 0.5 + voidRnd() * V.fallEvery[1];
      setDrips(S.drips, { period: 3.6, first: 0.8, spread: 1.2 }); // (19: the one drip you can find your way by)
      if (audio) audio.startVoid(S.spec.void);
      const ev = [
        [0, () => fade(0, 1.4)],
        [0.7, () => env.banner()],
      ];
      // 16 -> 17: the same fade as 15 -> 16 - and as 17 begins, a low rumble and the picture glitching, once.
      // (v18.0) 24's second part opens the same way, without its hint: the "way out" was not one.
      if (S.spec.part === 2) ev.splice(1, 1);
      if (S.n === 17 || S.spec.part === 2) {
        ev.push([0.15, () => {
          if (audio) {
            audio.stoneGrind(0, 0.35);
            audio.wardenStep(0, 0.6, false, true);
          }
          caption('[a low rumble]');
          glitch(true);
        }]);
      }
      play(ev, release);
      // 20: a Warden in the stone, far off. A moment after you can move, the stone splits and it comes - and from
      // then on it always knows where you are (level 15's, at level 15's speed: you are faster, if you keep going)
      const h = env.hunter();
      if (h && S.spec.wake) {
        // the stone splits first (a warning, as on 16) - and a moment later it is out and coming
        after(S.spec.wake - ACT2_WARN, () => {
          if (!lv || phase === 'leaving') return;
          if (audio) audio.stoneSplit(clamp((h.x - P().x) / 500, -0.9, 0.9), 0.6);
          caption('[stone splits, behind you]');
          shakeBy(4);
          env.music('hunt');
        });
        after(S.spec.wake, () => {
          if (!lv || phase === 'leaving') return;
          if (audio) audio.stoneGrind(clamp((h.x - P().x) / 500, -0.9, 0.9), 0.4);
          env.wake(h, 'hunt');
        });
      }
    }
    function updateAct2(dt) {
      glitchT = Math.max(0, glitchT - dt);
      foldFlick = Math.max(0, foldFlick - dt);
      fallIn -= dt;
      if (fallIn <= 0) {
        // far off, something falls - and never lands
        const V = VOID[S.spec.void] || VOID[1];
        fallIn = V.fallEvery[0] + voidRnd() * V.fallEvery[1];
        if (audio) audio.voidFall(voidRnd() * 1.6 - 0.8, 0.55, S.spec.void);
        caption('[something falls, far away]');
      }
    }
    /** The picture stutters for a moment (a glitch) - and its sound: a burst of static. */
    function glitch(big) {
      glitchT = big ? 0.55 : 0.4;
      glitchBig = !!big;
      if (audio) audio.loreStatic();
    }
    /** (js/game.js) a ripple of yours has gone out. On 17 the first one stutters - the first sign it cannot be trusted. */
    function onPing() {
      if (!lv || kind !== 'liar' || firstPing) return;
      firstPing = true;
      glitch(false);
      caption('[the echo stutters]');
    }
    /** (js/game.js) a fold has just taken you: a brief flicker. */
    function flicker() {
      foldFlick = 0.22;
    }
    /**
     * World space, over everything in the maze: the void eating the edges of the map - bands of black creeping in
     * from every side, and a slow static in them that flickers. Stronger each level (VOID). Drawing only.
     */
    function drawVoid(ctx, artT, now = clock) {
      if (!lv || !S.spec.act2) return;
      drawVoidTiles(ctx, artT, now); // (v18.0: the void inside the map)
      const V = VOID[S.spec.void] || VOID[1];
      const W = lv.pxW;
      const H = lv.pxH;
      const b = V.band * TILE;
      const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(0,0,0,0.92)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      };
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      edge(0, 0, b, 0, 0, 0, b, H);
      edge(W, 0, W - b, 0, W - b, 0, b, H);
      edge(0, 0, 0, b, 0, 0, W, b);
      edge(0, H, 0, H - b, 0, H - b, W, b);
      // the static: one small tile of specks, drawn once, laid along the edges and moved on a few times a second
      if (!staticCanvas) {
        staticCanvas = document.createElement('canvas');
        staticCanvas.width = 96;
        staticCanvas.height = 96;
        const g = staticCanvas.getContext('2d');
        const r = rng(0x5747);
        for (let i = 0; i < 420; i++) {
          const v = 120 + Math.floor(r() * 120);
          g.fillStyle = `rgba(${v},${v + 10},${v + 20},${0.25 + r() * 0.6})`;
          g.fillRect(Math.floor(r() * 96), Math.floor(r() * 96), 1 + Math.floor(r() * 2), 1);
        }
      }
      const step = Math.floor(artT * (calm() ? 3 : 6)); // a few new arrangements a second - slow, never a strobe
      const flick = 1 - V.flick * (0.5 + 0.5 * Math.sin(artT * 1.7)) * (calm() ? 0.5 : 1);
      ctx.globalAlpha = V.staticA * flick * (calm() ? 0.6 : 1);
      const pat = ctx.createPattern(staticCanvas, 'repeat');
      if (pat) {
        const ox = (step * 37) % 96;
        const oy = (step * 61) % 96;
        ctx.translate(-ox, -oy);
        ctx.fillStyle = pat;
        ctx.fillRect(ox, oy, b * 0.8, H);
        ctx.fillRect(ox + W - b * 0.8, oy, b * 0.8, H);
        ctx.fillRect(ox, oy, W, b * 0.8);
        ctx.fillRect(ox, oy + H - b * 0.8, W, b * 0.8);
      }
      ctx.restore();
    }

    /**
     * (v18.0) The void INSIDE the map: every tile whose floor is gone, black with the same slow static - always shown,
     * like the void at the edges (it is not something a ripple finds: it is where there is nothing to find). On 23 the
     * next ring to go shows a thin static over it for the last 2 s before it goes. Drawing only.
     */
    const CREEP_WARN = 2.0;
    function drawVoidTiles(ctx, artT, now) {
      const a2 = lv.act2;
      if (!a2 || !a2.voidGrid) return;
      const W = lv.W;
      const g = a2.voidGrid;
      let any = false;
      const path = new Path2D();
      for (let i = 0; i < g.length; i++) {
        if (!g[i]) continue;
        any = true;
        path.rect((i % W) * TILE, Math.floor(i / W) * TILE, TILE, TILE);
      }
      const warn = [];
      if (a2.creep) {
        for (const L of a2.creep.layers) {
          const left = L.t + (a2.creep.relative ? a2.creep.base : 0) - now; // (v18.2: 25's counts from the release)
          if (left > 0 && left < CREEP_WARN) warn.push({ L, k: 1 - left / CREEP_WARN });
        }
      }
      if (!any && !warn.length) return;
      ensureStatic();
      const V = VOID[S.spec.void] || VOID[1];
      const step = Math.floor(artT * (calm() ? 3 : 6));
      ctx.save();
      if (any) {
        ctx.fillStyle = 'rgba(0,0,0,0.94)';
        ctx.fill(path);
        const pat = ctx.createPattern(staticCanvas, 'repeat');
        if (pat) {
          try {
            pat.setTransform(new DOMMatrix([1, 0, 0, 1, -((step * 37) % 96), -((step * 61) % 96)])); // the static moves; the void does not
          } catch (e) {
            /* an old browser: the static simply stands still */
          }
          ctx.globalAlpha = Math.min(0.5, V.staticA * 2.2) * (calm() ? 0.6 : 1);
          ctx.fillStyle = pat;
          ctx.fill(path);
        }
      }
      // 23: the next ring, about to go - a faint static over it, thickening (never a flash)
      for (const w of warn) {
        const wp = new Path2D();
        for (const i of w.L.tiles) if (!g[i]) wp.rect((i % W) * TILE, Math.floor(i / W) * TILE, TILE, TILE);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(0,0,0,${0.45 * w.k})`;
        ctx.fill(wp);
        const pat = ctx.createPattern(staticCanvas, 'repeat');
        if (pat) {
          ctx.globalAlpha = 0.35 * w.k * (calm() ? 0.6 : 1);
          ctx.fillStyle = pat;
          ctx.fill(wp);
        }
      }
      ctx.restore();
    }
    function ensureStatic() {
      if (staticCanvas) return;
      staticCanvas = document.createElement('canvas');
      staticCanvas.width = 96;
      staticCanvas.height = 96;
      const g = staticCanvas.getContext('2d');
      const r = rng(0x5747);
      for (let i = 0; i < 420; i++) {
        const v = 120 + Math.floor(r() * 120);
        g.fillStyle = `rgba(${v},${v + 10},${v + 20},${0.25 + r() * 0.6})`;
        g.fillRect(Math.floor(r() * 96), Math.floor(r() * 96), 1 + Math.floor(r() * 2), 1);
      }
    }

    // ===================================================== the way out of each
    /** The player has reached this level's way out (js/game.js asks, instead of finishing the level itself). */
    function atExit() {
      if (kind === 'dusk') return; // (v19.3) nothing happens at the far end of the dark: only the talk
      if (!lv || phase === 'leaving' || phase === 'wake' || phase === 'reveal' || phase === 'release') return;
      if (kind === 'gaol' && S.door && S.door.solid) return; // (cannot happen: the door is in the way)
      phase = 'leaving';
      hideSpeech();
      setLock(true);
      env.hold(true); // whatever was behind you stops where it is
      if (kind === 'gaol') {
        // THE LAST BEAT OF THE GAOL: you keep walking, the cold comes up the passage, and the dark closes in
        env.walk(0, 55);
        if (audio) audio.draught();
        caption('[cold air]');
        play(
          [
            [0.4, () => speak('Out. Not free. Just out.', { cps: 13, hold: 1.2 })],
            [1.0, () => fade(1, 2.0)],
            [3.4, () => env.walk(0, 0)],
            [3.6, () => env.finish()],
          ],
          null
        );
      } else if (kind === 'field' || kind === 'village') {
        // (v19.0) the way on: the light again, softly - into the next level outside (v19.2), or the end of the story so far
        env.walk(0, 0);
        whiteTo = 1;
        play([[2.6, () => {
          carryDaylight = !!LEVELS[S.n + 1]; // (the wind and the birds go on into the next one - not past the last)
          env.finish();
        }]], null);
      } else if (kind === 'outside') {
        // (v18.2) THE REAL WAY OUT. Behind you it stops at the edge and comes no further: its steps stop, then its hum
        // fades, a few seconds of nothing - and then the light floods in, the sound of outside rises, and it is over.
        env.walk(0, 0);
        env.music(null);
        play(
          [
            [3.2, () => {
              whiteTo = 1;
              if (audio) audio.setDaylight(1);
              caption('[the wind, outside]');
            }],
            [7.4, () => {
              carryDaylight = true; // (v19.0) the sound of outside carries on, into the field
              env.finish();
            }],
          ],
          null
        );
      } else {
        env.walk(0, 0);
        if (audio) audio.breath(1);
        env.music(null);
        // (v18.0) 24: its first way out feels exactly like any other - and leads into its second part, not out
        const onward = kind === 'wrong' && S.spec.part !== 2;
        play(
          [
            [0.2, () => fade(1, 1.1)],
            [1.5, () => (onward ? env.nextPart() : env.finish())],
          ],
          null
        );
      }
    }

    // --------------------------------------------------------------- update
    function update(dt) {
      if (!lv) return;
      clock += dt;
      if (veilT < veilDur) {
        veilT = Math.min(veilDur, veilT + dt);
        veil = veilFrom + (veilTo - veilFrom) * smooth(veilT / veilDur);
      } else veil = veilTo;
      flare = Math.max(0, flare - dt / 0.9);
      quake = Math.max(0, quake - dt * 14);
      if (focus) {
        focus.k += (focus.to - focus.k) * Math.min(1, focus.rate * dt);
        if (focus.to === 0 && focus.k < 0.01) focus = null;
      }
      if (light && light.flick > 0) {
        // two slow dips and out - under two a second, nowhere near anything that could flash
        light.flick = Math.max(0, light.flick - dt / 0.55);
        const u = 1 - light.flick;
        light.k = calm() ? 1 - 0.6 * u : 0.65 + 0.35 * Math.cos(u * 4 * Math.PI) * (1 - u * 0.4);
      }
      updateDrips(dt);
      updateSpeech(dt);
      runTimers(dt);
      runBeat(dt);
      if (!lv) return; // (the beat may have finished the level)
      if (kind === 'gaol') updateGaol(dt);
      else if (kind === 'light') updateLight(dt);
      else if (kind === 'outside') updateOutside(dt); // (v18.2)
      else if (kind === 'field' || kind === 'village' || kind === 'dusk') updateField(dt); // (v19.0; v19.2 the village; v19.3 dusk)
      else if (S.spec.act2) updateAct2(dt);
      else updateDeep(dt);
    }

    // -------------------------------------------------------------- drawing
    /** World space, under the ripples: level 15's light, and everything it falls on. */
    function draw(ctx, artT) {
      if (!lv || (kind !== 'light' && kind !== 'outside') || !light) return;
      const sc = kind === 'outside' ? 0.3 + 0.7 * light.k : 1; // (v18.2: 25's grows from a pinpoint)
      const p = P();
      const g = light.k * light.sight * (0.9 + 0.1 * Math.sin(artT * 0.8));
      if (g <= 0.004) return;
      ctx.save();
      // OCCLUSION: only what the player could really see from where they stand. The light is an exception to
      // the ripple, never to the walls.
      const vis = env.visible(p.x, p.y);
      ctx.beginPath();
      for (let i = 0; i < vis.length; i += 2) {
        if (i) ctx.lineTo(vis[i], vis[i + 1]);
        else ctx.moveTo(vis[i], vis[i + 1]);
      }
      ctx.closePath();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      // 1. a pool of warm light that is simply there
      const pool = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, LIGHT_REACH * sc);
      pool.addColorStop(0, `rgba(${LIGHT_RGB},${0.2 * g})`);
      pool.addColorStop(0.35, `rgba(${LIGHT_RGB},${0.07 * g})`);
      pool.addColorStop(1, `rgba(${LIGHT_RGB},0)`);
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(light.x, light.y, LIGHT_REACH * sc, 0, TAU);
      ctx.fill();
      // 2. the stone it falls on, brighter the nearer the light
      ctx.lineCap = 'round';
      for (let band = 0; band < 5; band++) {
        ctx.beginPath();
        for (let i = 0; i < light.N; i++) {
          const d = light.rays[i];
          if (d >= LIGHT_REACH) continue;
          const b = Math.min(4, Math.floor((1 - d / LIGHT_REACH) * 5));
          if (b !== band) continue;
          const j = (i + 1) % light.N;
          const d2 = light.rays[j];
          const a = (i / light.N) * TAU;
          const a2 = (j / light.N) * TAU;
          ctx.moveTo(light.x + Math.cos(a) * d, light.y + Math.sin(a) * d);
          if (d2 < LIGHT_REACH && Math.abs(d2 - d) < 18) ctx.lineTo(light.x + Math.cos(a2) * d2, light.y + Math.sin(a2) * d2);
        }
        const al = ((band + 1) / 5) * ((band + 1) / 5);
        ctx.strokeStyle = `rgba(${LIGHT_RGB},${0.14 * al * g})`;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,236,206,${0.7 * al * g})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      // 3. the glare at the heart of it - the "opening"
      const glare = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, 54 * sc);
      glare.addColorStop(0, `rgba(255,246,228,${0.6 * g})`);
      glare.addColorStop(1, `rgba(${LIGHT_RGB},0)`);
      ctx.fillStyle = glare;
      ctx.beginPath();
      ctx.arc(light.x, light.y, 54 * sc, 0, TAU);
      ctx.fill();
      // 4. and where it comes from: a crack of light in what looks like stone (it is the Warden's seam)
      const h = env.hunter();
      if (h && h.lure > 0) EchoWarden.drawHunter(ctx, h.x, h.y, h.r, { a: 0, lure: h.lure * light.k * light.sight, h: Math.PI, lureRgb: LIGHT_RGB, variant: h.variant, t: artT });
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }

    /** Screen space, over everything: the fades, and the reveal's flash. */
    function veilDraw(ctx, cw, ch) {
      if (!lv) return;
      // (v17.0) a glitch: the picture tears into a few bands, offset, for a moment - just once, never a strobe.
      // Calm mode: only a slight dimming.
      if (glitchT > 0) {
        const k = glitchT / (glitchBig ? 0.55 : 0.4);
        if (calm()) {
          ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`;
          ctx.fillRect(0, 0, cw, ch);
        } else {
          const r = rng(0x6c17 + Math.floor(glitchT * 30));
          for (let i = 0; i < (glitchBig ? 7 : 4); i++) {
            const y = Math.floor(r() * ch);
            const h = Math.floor(ch * (0.01 + r() * 0.05));
            const dx = Math.floor((r() - 0.5) * cw * 0.06 * k);
            try {
              ctx.drawImage(ctx.canvas, 0, y, cw, h, dx, y, cw, h);
            } catch (e) {
              /* a canvas that cannot be read back: no tear, just the tint */
            }
            ctx.fillStyle = `rgba(95,212,255,${0.06 * k})`;
            ctx.fillRect(0, y, cw, h);
          }
        }
      }
      if (foldFlick > 0) {
        ctx.fillStyle = `rgba(0,0,0,${(calm() ? 0.35 : 0.7) * (foldFlick / 0.22)})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      // (v18.2) 25: the light flooding in - slowly, never a flash
      if (white > 0.002) {
        ctx.fillStyle = `rgba(255,250,240,${white})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      if (flare > 0.01) {
        const f = flare * flare * (calm() ? 0.3 : 1);
        const grad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.5);
        grad.addColorStop(0, `rgba(${EchoPalette.rgb('warden')},${0.18 * f})`);
        grad.addColorStop(1, `rgba(${EchoPalette.rgb('warden')},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
      }
      if (veil > 0.001) {
        ctx.fillStyle = `rgba(0,0,0,${veil})`;
        ctx.fillRect(0, 0, cw, ch);
      }
    }

    const shake = () => (lv && !calm() ? quake : 0);
    const camera = () => (focus && focus.k > 0.001 ? focus : null);

    const state = () => ({
      on: !!lv,
      level: S ? S.n : null,
      kind,
      phase,
      clock: +clock.toFixed(3),
      beat: tl ? +tl.t.toFixed(3) : null,
      locked,
      veil: +veil.toFixed(3),
      key: S && S.key ? { taken: S.key.taken, carried: !!S.hasKey, revealed: keyRevealed, x: S.key.x, y: S.key.y } : null,
      door: S && S.door ? { solid: S.door.solid, swing: +S.door.swing.toFixed(3), tried } : null,
      light: light ? { k: +light.k.toFixed(3), sight: +light.sight.toFixed(3), seen: light.seen, x: light.x, y: light.y } : null,
      exitMuted: S ? !!S.exitMuted : false,
      drips: drips.map((d) => ({ x: d.x, y: d.y, on: d.on, metal: d.metal })),
      speaking: speech ? speech.text : null,
      act2: S && S.spec.act2 ? { glitch: +glitchT.toFixed(3), firstPing, fallIn: +fallIn.toFixed(2), flicker: +foldFlick.toFixed(3) } : null, // (v17.0)
      outside: kind === 'outside' || kind === 'field' || kind === 'village' || kind === 'dusk' ? { white: +white.toFixed(3), hush: +hushK.toFixed(3) } : null, // (v18.2; v19.0 the field too; v19.2 the village)
      dusk: kind === 'dusk' ? { p: +dk.p.toFixed(3), k: +dk.k.toFixed(3), s3: +dk.s3.toFixed(3), h: +dk.h.toFixed(3), hum: +dk.hum.toFixed(4), d: Math.round(dk.d), talkable: duskTalkable(), talked: dk.talked, keeper: lv.field.dusk.keeper } : null, // (v19.3)
      village: kind === 'village' ? { phase: +vPhase.toFixed(3), cycle: vCycle, resets: vResets, echoes: vEchoes.length, hush: +vHush.toFixed(3), loop: VILLAGE_LOOP, echoDelay: ECHO_DELAY, echoGain: ECHO_GAIN, echoMax: ECHO_MAX, people: villagers(), queue: vEchoes.map((e) => ({ snd: e.snd, x: e.x, y: e.y, at: +e.at.toFixed(3), gain: +e.gain.toFixed(4), from: e.who ? lv.field.people.indexOf(e.who) : -1 })) } : null, // (v19.2)
    });

    return {
      start,
      stop,
      update,
      draw,
      veil: veilDraw,
      shake,
      camera,
      atExit,
      onKeyLit,
      onPing, // (v17.0)
      flicker,
      drawVoid,
      villagers, // (v19.2)
      dusk, // (v19.3)
      talk,
      state,
      get on() {
        return !!lv;
      },
      get locked() {
        return locked;
      },
    };
  }

  return { LEVELS, BAR_R, DOOR_R, KEY_R, DRIP_R, LIGHT_RGB, build, create, solve, isAct2, creepSchedule };
})();
