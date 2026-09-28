// The generator fingerprint, done PROPERLY this time: generateLevel(n, runSeed, modeId).
// (v12.2 and v12.3 called it as generateLevel(cfg, seed) - which is n = an object - and so hashed the same
// degenerate level over and over. Both builds agreed, and it proved nothing.)
window.GENFP = function (opts) {
  opts = opts || {};
  const seeds = opts.seeds || 50;
  function h32(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); }
  const real = Math.random;
  Math.random = () => { throw new Error('generator touched Math.random'); };
  try {
    const rows = [];
    let sanity = null;
    for (let n = 1; n <= 12; n++) for (const m of ['easy', 'normal', 'hard', 'hardcore']) {
      let s = '';
      for (let seed = 1; seed <= seeds; seed++) {
        const lv = generateLevel(n, seed * 7919, m);
        if (!sanity && n === 12 && m === 'normal') sanity = { W: lv.W, H: lv.H, enemies: lv.enemies.map((e) => e.kind).join(','), pathTiles: lv.pathTiles };
        s += lv.W + 'x' + lv.H + '|' + Array.from(lv.walls).join('') + '|' + Array.from(lv.blocked).join('') + '|';
        s += lv.obstacles.map((o) => o.x + ',' + o.y + ',' + o.r).join(';') + '|';
        s += lv.puddles.map((o) => o.x + ',' + o.y + ',' + o.r).join(';') + '|';
        s += (lv.decoy ? lv.decoy.x + ',' + lv.decoy.y : '-') + '|';
        s += lv.enemies.map((e) => [e.kind, e.tx, e.ty, e.x, e.y, e.sleeper, e.pitch].join(',')).join(';') + '|';
        s += lv.start.x + ',' + lv.start.y + '|' + lv.exit.x + ',' + lv.exit.y + ',' + lv.exit.r + '|';
        s += lv.pathTiles + '|' + (lv.roomTiles ? lv.roomTiles.join(',') : '') + '|' + JSON.stringify(lv.cfg) + '\n';
      }
      rows.push(n + ':' + m + ':' + h32(s));
    }
    return { rows, combined: h32(rows.join('\n')), sanity };
  } finally { Math.random = real; }
};
