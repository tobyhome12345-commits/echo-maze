'use strict';

/**
 * On-screen touch controls (only shown on touch devices, or when switched on in the pause menu).
 *
 *   left half of the screen   a floating virtual joystick: touch anywhere and drag. The direction is analog, and
 *                             pushing all the way gives the same top speed as WASD (170 px/s).
 *   RIPPLE (big)              sends a ripple: exactly Space, so the same cooldown
 *   CROUCH (smaller)          hold to crouch: exactly holding Shift
 *   ITEM                      drops a sonar decoy you are carrying (E) - only there while you carry one
 *   pause (small, II)         pauses
 *
 * Built on Pointer Events, so several fingers work at once (move with one, ripple with another). Each control
 * captures the pointer that pressed it and lets go of it on pointerup, pointercancel or lostpointercapture, and
 * every control is released when the window loses focus, the page is hidden, or the controls are hidden - a
 * button can never be left stuck down.
 *
 * This module only reports what the fingers are doing; the game reads it (vec(), crouch) and decides what it
 * means. It never touches the game's state itself.
 */
const EchoTouch = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const DEAD = 0.12; // the inner part of the stick that counts as "not pushing"
  const FULL = 0.88; // pushing this far (of the stick's radius) already gives full speed

  function create(env) {
    const $ = (id) => document.getElementById(id);
    const root = $('touch');
    const zone = $('touch-zone');
    const stick = $('touch-stick');
    const knob = $('touch-knob');
    const bRipple = $('tbtn-ripple');
    const bCrouch = $('tbtn-crouch');
    const bItem = $('tbtn-item');
    const bPause = $('tbtn-pause');

    let visible = false;
    let stickId = null; // the pointer moving the stick
    let originX = 0;
    let originY = 0;
    let vx = 0;
    let vy = 0;
    let crouchId = null; // the pointer holding the crouch button
    const held = new Map(); // pointerId -> button element, for the one-shot buttons (so release is clean)

    const radius = () => clamp(Math.min(window.innerWidth, window.innerHeight) * 0.16, 44, 78);

    // ------------------------------------------------------------ joystick
    function placeStick(x, y) {
      stick.style.left = `${x}px`;
      stick.style.top = `${y}px`;
    }

    function moveStick(x, y) {
      const R = radius();
      let dx = x - originX;
      let dy = y - originY;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.hypot(dx, dy) / R; // 0..1
      if (m < DEAD) {
        vx = 0;
        vy = 0;
        return;
      }
      const speed = clamp((m - DEAD) / (FULL - DEAD), 0, 1); // analog: a gentle push walks slowly, a full push is top speed
      vx = (dx / (m * R)) * speed;
      vy = (dy / (m * R)) * speed;
    }

    function endStick() {
      stickId = null;
      vx = 0;
      vy = 0;
      knob.style.transform = 'translate(0px, 0px)';
      stick.classList.remove('active');
      stick.style.left = '';
      stick.style.top = '';
    }

    zone.addEventListener('pointerdown', (e) => {
      if (!visible || stickId !== null) return;
      e.preventDefault();
      stickId = e.pointerId;
      const R = radius();
      // the stick appears where the finger lands, kept a stick's radius away from the screen edges
      originX = clamp(e.clientX, R + 8, window.innerWidth - R - 8);
      originY = clamp(e.clientY, R + 8, window.innerHeight - R - 8);
      stick.classList.add('active');
      placeStick(originX, originY);
      try {
        zone.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture is a nicety: the window-level listeners below release the stick anyway */
      }
      moveStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) {
        e.preventDefault();
        moveStick(e.clientX, e.clientY);
      }
    });

    // ------------------------------------------------------------- buttons
    function press(btn, e) {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('down');
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (err) {
        /* see above */
      }
    }

    function release(btn) {
      btn.classList.remove('down');
    }

    bRipple.addEventListener('pointerdown', (e) => {
      if (!visible) return;
      press(bRipple, e);
      held.set(e.pointerId, bRipple);
      env.ripple(); // exactly what Space does, cooldown and all
    });
    bItem.addEventListener('pointerdown', (e) => {
      if (!visible) return;
      press(bItem, e);
      held.set(e.pointerId, bItem);
      env.item();
    });
    bPause.addEventListener('pointerdown', (e) => {
      if (!visible) return;
      press(bPause, e);
      held.set(e.pointerId, bPause);
      env.pause();
    });
    bCrouch.addEventListener('pointerdown', (e) => {
      if (!visible || crouchId !== null) return;
      press(bCrouch, e);
      crouchId = e.pointerId;
      env.crouchChanged(); // the game reads `crouch`; this makes it wipe the ripple information this instant
    });

    /** A finger has gone (up, cancelled, or the capture was lost): let go of whatever it was holding. */
    function lift(id) {
      if (id === stickId) endStick();
      if (id === crouchId) {
        crouchId = null;
        release(bCrouch);
        env.crouchChanged();
      }
      const b = held.get(id);
      if (b) {
        held.delete(id);
        release(b);
      }
    }

    for (const el of [zone, bRipple, bCrouch, bItem, bPause]) {
      el.addEventListener('pointerup', (e) => lift(e.pointerId));
      el.addEventListener('pointercancel', (e) => lift(e.pointerId));
      el.addEventListener('lostpointercapture', (e) => lift(e.pointerId));
    }
    // backups in case a pointerup is delivered somewhere else (a finger sliding off, a capture that failed)
    window.addEventListener('pointerup', (e) => lift(e.pointerId));
    window.addEventListener('pointercancel', (e) => lift(e.pointerId));
    // no long-press menu, no text selection, no drag ghost on the controls
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    /** Let go of everything: the window lost focus, the page was hidden, the game left the play screen. */
    function releaseAll() {
      const hadCrouch = crouchId !== null;
      endStick();
      crouchId = null;
      release(bCrouch);
      for (const b of held.values()) release(b);
      held.clear();
      if (hadCrouch) env.crouchChanged();
    }

    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseAll();
    });

    // ------------------------------------------------------------- state
    function setVisible(v) {
      v = !!v;
      if (v === visible) return;
      visible = v;
      root.classList.toggle('hidden', !v);
      if (!v) releaseAll();
    }

    return {
      setVisible,
      releaseAll,
      /** The stick, analog: x and y each -1..1 with length up to 1 (1 = top speed). 0,0 when it is not being pushed. */
      vec: () => ({ x: vx, y: vy }),
      get crouch() {
        return crouchId !== null;
      },
      get active() {
        return stickId !== null;
      },
      /** 0..1: how ready the ripple is (1 = ready), drawn as a ring on the RIPPLE button. */
      setCooldown(p) {
        bRipple.style.setProperty('--p', String(clamp(p, 0, 1)));
        bRipple.classList.toggle('ready', p >= 1);
      },
      /** Show the ITEM button only while a sonar decoy is being carried. */
      setItem(has) {
        bItem.classList.toggle('hidden', !has);
      },
      // for tests: press the stick at (x,y) and drag to (x2,y2) without real events
      _debug: { get visible() { return visible; }, get stickId() { return stickId; }, get crouchId() { return crouchId; }, get held() { return held.size; } },
    };
  }

  return { create, DEAD, FULL };
})();
