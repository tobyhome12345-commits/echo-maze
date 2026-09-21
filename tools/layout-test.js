/*
 * Level-generator tests (v10.1). Load into a page that has js/level.js (any served copy of the game), then:
 *
 *   await LayoutTest.compare(oldLevelJsText)   generateLevel of the page vs an OLD level.js, over every level x mode x seed:
 *                                              are the mazes, obstacles, start, exit and every monster's spawn identical,
 *                                              what moved (the mimic, the level-9 decoy), and did the puddles change as
 *                                              intended (identical where kept, none where the mode has no scent monster)
 *   LayoutTest.mimicReport([8, 9])             where the exit and the mimic stand (kind of spot, distance, only route),
 *                                              per level x mode, for the page's generator and (if given) the old one
 *   LayoutTest.puddleReport()                  puddles per level x mode (avg / min / max), spacing, distance from the start
 *
 * Pure functions of generateLevel: no game state, no audio, no random numbers of its own. The old build's level.js is
 * fetched as text and run inside a function (so its top-level consts do not clash with this page's), which needs the
 * server to allow the cross-origin fetch (the scratch serve.ps1 sends Access-Control-Allow-Origin: *).
 */
(function () {
  'use strict';
  const MODE_IDS = ['easy', 'normal', 'hard', 'hardcore'];
  const seedOf = (i) => (1000 + i * 7919) >>> 0;

  function loadOld(text) {
    return new Function(text + '\n;return { generateLevel, levelConfig };')();
  }

  // ---- little helpers that re-implement the placement vocabulary on their own (independent of level.js) ----
  function bfs(blocked, W, H, from) {
    const d = new Int32Array(W * H).fill(-1);
    const q = [from];
    d[from] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= W * H || blocked[n] || d[n] >= 0) continue;
        if ((n === c - 1 && c % W === 0) || (n === c + 1 && n % W === 0)) continue;
        d[n] = d[c] + 1;
        q.push(n);
      }
    }
    return d;
  }
  const tileOf = (lv, o) => ({ tx: o.tx, ty: o.ty, idx: o.ty * lv.W + o.tx });
  const exitTile = (lv) => {
    const tx = Math.floor(lv.exit.x / 40);
    const ty = Math.floor(lv.exit.y / 40);
    return { tx, ty, idx: ty * lv.W + tx };
  };
  function kindAt(lv, rooms, idx) {
    if (rooms.has(idx)) return 'room';
    const W = lv.W;
    const open = [idx - 1, idx + 1, idx - W, idx + W].filter((i) => !lv.walls[i]).length;
    return open === 1 ? 'deadend' : open === 2 ? 'corridor' : 'junction';
  }
  const isCellIdx = (lv, idx) => idx % lv.W % 2 === 1 && Math.floor(idx / lv.W) % 2 === 1;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const monsters = (lv) => lv.enemies.map((e) => ({ kind: e.kind, tx: e.tx, ty: e.ty, sleeper: e.sleeper, pitch: e.pitch }));

  async function compare(oldText, seeds = 200) {
    const old = loadOld(oldText);
    const out = [];
    const tot = { combos: 0, maze: 0, obst: 0, ends: 0, others: 0, pitches: 0, mimicMoved: 0, mimicCount: 0, decoyMoved: 0, decoyCombos: 0, puddlesKept: 0, puddlesGone: 0, puddlesBad: 0 };
    for (let n = 1; n <= 12; n++) {
      for (const mode of MODE_IDS) {
        const row = { n, mode, combos: 0, maze: 0, obst: 0, ends: 0, others: 0, pitches: 0, mimicMoved: 0, mimicCount: 0, decoyMoved: 0, decoyCombos: 0, puddlesKept: 0, puddlesGone: 0, puddlesBad: 0 };
        for (let i = 0; i < seeds; i++) {
          const s = seedOf(i);
          const a = old.generateLevel(n, s, mode);
          const b = generateLevel(n, s, mode);
          row.combos++;
          if (a.W === b.W && a.H === b.H && eq(a.walls, b.walls) && eq(a.blocked, b.blocked)) row.maze++;
          if (same(a.obstacles, b.obstacles)) row.obst++;
          if (same(a.start, b.start) && same(a.exit, b.exit)) row.ends++;
          const ma = monsters(a);
          const mb = monsters(b);
          const nm = (l) => l.filter((e) => e.kind !== 'mimic');
          if (same(nm(ma), nm(mb))) row.others++;
          // every random draw is the same, including the mimic's pitch
          if (same(ma.map((e) => e.pitch), mb.map((e) => e.pitch))) row.pitches++;
          const mimA = ma.filter((e) => e.kind === 'mimic');
          const mimB = mb.filter((e) => e.kind === 'mimic');
          if (mimA.length === mimB.length) row.mimicCount++;
          if (!same(mimA, mimB)) row.mimicMoved++;
          if (a.decoy || b.decoy) {
            row.decoyCombos++;
            if (!same(a.decoy, b.decoy)) row.decoyMoved++;
          }
          const scent = b.enemies.some((e) => e.kind === 'scent');
          if (scent) {
            // kept: every puddle exactly where it was (only the level-9 cap ever removed any, in the version before)
            if (same(a.puddles, b.puddles)) row.puddlesKept++;
            else row.puddlesBad++;
          } else if (b.puddles.length === 0) row.puddlesGone += a.puddles.length > 0 ? 1 : 0; // (counted only when there was something to remove)
          else row.puddlesBad++;
        }
        for (const k of Object.keys(tot)) tot[k] += row[k];
        out.push(row);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return { rows: out, tot };
  }

  // ---- where the exit and the mimic stand ----
  function mimicStats(gen, cmp, level, mode, seeds) {
    const st = { level, mode, seeds, mimics: 0, exitKinds: {}, mimicKinds: {}, kindMatch: 0, offCell: 0, onlyRoute: 0, minToExit: 1e9, underEight: 0, minFromStart: 1e9, nearOther: 0, sameRoomAsExit: 0, sumStartFrac: 0 };
    for (let i = 0; i < seeds; i++) {
      const lv = gen(level, seedOf(i), mode);
      const rooms = new Set(cmp.roomTiles(level, seedOf(i), mode));
      const ex = exitTile(lv);
      const ek = kindAt(lv, rooms, ex.idx);
      st.exitKinds[ek] = (st.exitKinds[ek] || 0) + 1;
      const startIdx = Math.floor(lv.start.y / 40) * lv.W + Math.floor(lv.start.x / 40);
      const dS = bfs(lv.blocked, lv.W, lv.H, startIdx);
      const dE = bfs(lv.blocked, lv.W, lv.H, ex.idx);
      for (const m of lv.enemies.filter((e) => e.kind === 'mimic')) {
        st.mimics++;
        const t = tileOf(lv, m);
        const mk = kindAt(lv, rooms, t.idx);
        st.mimicKinds[mk] = (st.mimicKinds[mk] || 0) + 1;
        if (mk === ek) st.kindMatch++;
        if (!isCellIdx(lv, t.idx)) st.offCell++;
        const b = lv.blocked.slice();
        b[t.idx] = 1;
        if (bfs(b, lv.W, lv.H, startIdx)[ex.idx] < 0) st.onlyRoute++;
        st.minToExit = Math.min(st.minToExit, dE[t.idx]);
        if (dE[t.idx] < 8) st.underEight++;
        st.minFromStart = Math.min(st.minFromStart, dS[t.idx]);
        st.sumStartFrac += dS[t.idx] / dS[ex.idx];
        if (lv.enemies.some((o) => o !== m && Math.hypot(o.tx - t.tx, o.ty - t.ty) < 2)) st.nearOther++;
      }
    }
    return st;
  }

  // the page's own generator tells nothing about rooms, except through roomTiles on the level it returns
  const cmpNew = { roomTiles: (n, s, m) => generateLevel(n, s, m).roomTiles };

  function mimicReport(levels = [8, 9], seeds = 200) {
    const rows = [];
    for (const n of levels) for (const mode of MODE_IDS) rows.push(mimicStats(generateLevel, cmpNew, n, mode, seeds));
    return rows;
  }
  function mimicReportOld(oldText, levels = [8, 9], seeds = 200) {
    const old = loadOld(oldText);
    const rows = [];
    for (const n of levels) for (const mode of MODE_IDS) rows.push(mimicStats(old.generateLevel, cmpNew, n, mode, seeds)); // (same mazes, so the new build's room list serves)
    return rows;
  }

  function puddleReport(seeds = 200) {
    const rows = [];
    for (let n = 1; n <= 12; n++) {
      for (const mode of MODE_IDS) {
        let sum = 0, min = 1e9, max = -1, close = 0, nearStart = 0, scent = 0, onWalls = 0;
        for (let i = 0; i < seeds; i++) {
          const lv = generateLevel(n, seedOf(i), mode);
          sum += lv.puddles.length;
          min = Math.min(min, lv.puddles.length);
          max = Math.max(max, lv.puddles.length);
          scent = lv.enemies.filter((e) => e.kind === 'scent').length;
          for (let a = 0; a < lv.puddles.length; a++) {
            const p = lv.puddles[a];
            if (lv.walls[p.ty * lv.W + p.tx] || lv.blocked[p.ty * lv.W + p.tx]) onWalls++;
            if (Math.max(Math.abs(p.tx - 1), Math.abs(p.ty - 1)) < 4) nearStart++;
            for (let b = a + 1; b < lv.puddles.length; b++) if (Math.hypot(p.tx - lv.puddles[b].tx, p.ty - lv.puddles[b].ty) < 3) close++;
          }
        }
        rows.push({ n, mode, scent, avg: +(sum / seeds).toFixed(2), min, max, close, nearStart, onWalls });
      }
    }
    return rows;
  }

  window.LayoutTest = { compare, mimicReport, mimicReportOld, puddleReport, loadOld, seedOf };
})();
