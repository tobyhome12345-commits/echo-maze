'use strict';

/**
 * A test helper for the ?debug hook (window.__echo): stage a clean, open room in a real level, put things in it,
 * send a ripple and freeze the picture into an overlay, so the art can be looked at (screenshots) without the game
 * moving on between tool calls. Not part of the game and not exported with a version; load it into a page opened
 * with ?debug:
 *
 *   const s = document.createElement('script'); s.src = '/tools/stage.js'; document.head.appendChild(s);
 *
 * Then (window.Stage):
 *   Stage.stage(mode, level, seed)   a level with every monster / the exit parked far away and no obstacles, and the
 *                                    player at the left of a big open room (returns { room, k })
 *   Stage.at(dx, dy)                 a point relative to the player
 *   Stage.ping(seconds)              press SPACE, then run the game that long
 *   Stage.snap(zoom, camX, camY)     draw one frame, magnified, and pin a copy of it over the page
 *   Stage.unsnap()                   take the pinned picture down
 * Everything it moves is test state (positions of things in the level it made); nothing is saved.
 */
window.Stage = (() => {
  const E = window.__echo;
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code }));
  /** the top-left corner and size (px) of the first k x k block of open tiles, or null */
  const findRoom = (lv, k) => {
    for (let ty = 1; ty + k <= lv.H - 1; ty++) {
      for (let tx = 1; tx + k <= lv.W - 1; tx++) {
        let ok = true;
        for (let y = ty; y < ty + k && ok; y++) for (let x = tx; x < tx + k; x++) if (lv.walls[y * lv.W + x]) { ok = false; break; }
        if (ok) return { x: tx * 40, y: ty * 40, w: k * 40, h: k * 40 };
      }
    }
    return null;
  };
  const api = {
    E,
    key,
    findRoom,
    stage(mode, n, seed) {
      E.setMode(mode);
      E.seed(seed);
      E.go(n);
      const inf = E.info();
      const lv = inf.level;
      let room = null;
      let k = 6;
      while (!room && k > 2) room = findRoom(lv, --k);
      lv.obstacles.length = 0;
      lv.puddles.length = 0;
      if (lv.decoy) lv.decoy.taken = true;
      lv.exit.x = -9999;
      lv.exit.y = -9999;
      inf.enemies.forEach((e, i) => {
        e.x = -3000 - i * 50;
        e.y = -3000;
        e.state = 'idle';
        e.sleeper = true;
      });
      inf.player.x = room.x + 22;
      inf.player.y = room.y + room.h / 2;
      api.room = room;
      api.lv = lv;
      api.en = inf.enemies;
      api.pl = inf.player;
      return { room, k };
    },
    at: (dx, dy) => ({ x: api.pl.x + dx, y: api.pl.y + dy }),
    ping(steps = 0.4) {
      key('Space', true);
      key('Space', false);
      E.step(steps);
    },
    snap(zoom = 2.2, cx, cy) {
      E.snapCamera(cx, cy);
      E.zoom(zoom);
      E.draw();
      const c = document.getElementById('game');
      let o = document.getElementById('snap');
      if (!o) {
        o = document.createElement('canvas');
        o.id = 'snap';
        o.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:99';
        document.body.appendChild(o);
      }
      o.width = c.width;
      o.height = c.height;
      o.getContext('2d').drawImage(c, 0, 0);
    },
    unsnap() {
      const o = document.getElementById('snap');
      if (o) o.remove();
    },
  };
  return api;
})();
