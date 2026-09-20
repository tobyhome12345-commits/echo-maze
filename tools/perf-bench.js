'use strict';

/**
 * How much does one frame of drawing cost in a busy level-10 scene? (Load tools/stage.js first, in a page opened
 * with ?debug. Works in older builds too, so two builds can be compared in the same window.)
 *
 *   PerfBench.run('hard', 1)   ->   { ripples, msPerDraw: median, batches: [...] }
 *
 * The scene: an open room with the stalker, the scent monster, four obstacles and two puddles all lit by three
 * ripples in flight. Each batch draws 100 frames and then reads a pixel back, which makes the browser finish the
 * drawing it queued - otherwise the timings only measure how fast commands are queued.
 */
window.PerfBench = (() => {
  const E = window.__echo;
  const S = window.Stage;
  function run(mode = 'hard', seed = 1, batches = 9) {
    S.stage(mode, 10, seed);
    const p = S.pl;
    const st = S.en.find((e) => e.kind === 'stalker');
    const sc = S.en.find((e) => e.kind === 'scent');
    [[100, -84], [100, 84], [60, -60], [60, 60]].forEach(([dx, dy]) => {
      const q = S.at(dx, dy);
      S.lv.obstacles.push({ x: q.x, y: q.y, r: 13, tx: 0, ty: 0 });
    });
    S.lv.puddles.push({ x: p.x + 90, y: p.y + 30, r: 14, tx: 0, ty: 0 }, { x: p.x + 90, y: p.y - 30, r: 14, tx: 0, ty: 0 });
    for (let i = 0; i < 3; i++) {
      Object.assign(st, S.at(100, -42));
      Object.assign(sc, S.at(100, 0));
      st.state = 'idle';
      sc.state = 'idle';
      S.ping(1.1);
    }
    E.snapCamera(p.x + 60, p.y);
    const c = document.getElementById('game');
    const cx = c.getContext('2d');
    const times = [];
    for (let k = 0; k < batches; k++) {
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) E.draw();
      cx.getImageData(0, 0, 1, 1); // wait for the queued drawing to finish
      times.push(+((performance.now() - t0) / 100).toFixed(3));
    }
    const sorted = times.slice().sort((a, b) => a - b);
    return { canvas: [c.width, c.height], ripples: E.info().ripples, msPerDraw: sorted[Math.floor(sorted.length / 2)], min: sorted[0], batches: times };
  }
  return { run };
})();
