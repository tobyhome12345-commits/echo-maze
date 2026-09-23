'use strict';

/**
 * The soundtrack: a slow, sparse score played by the Web Audio API, like every other sound in this game.
 * No files, no loops, nothing sampled - a pad that drifts and the odd note from the level's own scale.
 *
 * It replaces nothing: the cave drone (audio.startAmbient) still plays underneath it. Both sit on the
 * AMBIENCE bus (js/audio.js), so Settings -> Audio -> Ambience takes the music down without touching the
 * sounds you need to hear, and a screech or the Singer's countdown ducks that whole bus for a moment.
 *
 * Rules it keeps:
 *   - QUIET AND SPARSE. It is never allowed to mask a gameplay sound; a note comes every few seconds at most.
 *   - IT TELLS YOU NOTHING NEW. The only thing it reacts to is `danger`, the exact number the heartbeat and
 *     the red screen-edge already use (game.js: 1 - distance to the nearest monster / 300). It is never told
 *     which monster that is, so there is no music cue for the mimic, the Muffler or the Singer.
 *   - CALM MODE STAYS FLAT. In calm mode the game passes danger 0, so the music never swells at all.
 *   - NO RANDOM NUMBERS OF THE GAME'S. It has its own little generator, seeded from the level number, so the
 *     score is the same every time you play a level and the simulation's random stream is untouched
 *     (tools/identity-test.js splits Math.random by file - this file never calls it).
 *   - LOOKAHEAD SCHEDULING. Notes are scheduled up to LOOKAHEAD seconds early, straight onto the audio clock,
 *     so nothing clicks, nothing drifts and a slow frame cannot make it stutter. Every gain node is given its
 *     envelope at the moment it is created (a fresh GainNode sits at 1.0 until its first scheduled event).
 */
const EchoMusic = (() => {
  const LOOKAHEAD = 0.9; // seconds of music scheduled in advance
  const MAX_BURST = 6; // never schedule more than this many steps in one update (a long stall must not dump a chord)

  // The scales, as semitones above the root. Minor and dark, which is the game.
  const PENT_MINOR = [0, 3, 5, 7, 10];
  const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
  const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
  const WHOLE_TONE = [0, 2, 4, 6, 8, 10];

  /**
   * One mood per stretch of the game. `root` is the key (Hz), `step` how long one step of the scheduler is,
   * `density` the chance a step plays a note, `cut` where the pad's low-pass sits, `voices` the pad's
   * intervals (as ratios of the root) and `swell` how far danger may open it up.
   */
  const MOODS = {
    title: { root: 55, scale: PENT_MINOR, step: 2.3, density: 0.3, cut: 430, voices: [1, 1.5, 2.005], detune: 0.12, swell: 0, octaves: [2, 3], gain: 0.5 },
    early: { root: 55, scale: PENT_MINOR, step: 2.1, density: 0.24, cut: 380, voices: [1, 1.5, 2.005], detune: 0.1, swell: 1, octaves: [2, 3], gain: 0.45 },
    scent: { root: 58.27, scale: AEOLIAN, step: 1.9, density: 0.27, cut: 400, voices: [1, 1.5, 2.008], detune: 0.16, swell: 1, octaves: [2, 3], gain: 0.5 },
    deep: { root: 49, scale: PHRYGIAN, step: 1.8, density: 0.3, cut: 360, voices: [1, 1.335, 2.006], detune: 0.2, swell: 1.15, octaves: [2, 3], gain: 0.55 },
    // level 11: the Muffler eats your echo, so the score is muffled too - a duller pad, almost no notes
    muffler: { root: 46.25, scale: PHRYGIAN, step: 2.4, density: 0.16, cut: 240, voices: [1, 1.5, 2.004], detune: 0.09, swell: 1.1, octaves: [1, 2], gain: 0.6 },
    // level 12: the Singer's own key. Whole tones: no home note, nothing to settle on
    singer: { root: 51.91, scale: WHOLE_TONE, step: 1.7, density: 0.34, cut: 520, voices: [1, 1.414, 2.01], detune: 0.26, swell: 1.2, octaves: [3, 4], gain: 0.5 },
    // level 13: nothing hunts you here, so there is nothing for the score to swell at. It sits an octave lower
    // than anything else, on a tritone, and almost never plays a note - the drone of the room does the rest.
    warden: { root: 43.65, scale: PHRYGIAN, step: 3.4, density: 0.07, cut: 190, voices: [1, 1.414, 2.003], detune: 0.05, swell: 0, octaves: [1, 2], gain: 0.62 },
  };

  /** Which mood a level plays in. */
  function moodFor(level) {
    if (level >= 13) return 'warden';
    if (level >= 12) return 'singer';
    if (level >= 11) return 'muffler';
    if (level >= 9) return 'deep';
    if (level >= 6) return 'scent';
    return 'early';
  }

  /** A tiny xorshift of its own - deliberately NOT Math.random (see the note at the top). */
  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function create(audio) {
    let out = null; // everything the music makes hangs off this, so one fade kills all of it
    let pad = null; // { oscs, filter, gain, lfo }
    let delay = null;
    let mood = null;
    let key = null; // the mood's name
    let rand = null;
    let running = false;
    let nextTime = 0; // audio-clock time of the next step
    let step = 0;
    let danger = 0; // smoothed, 0..1
    let target = 0; // what the game last told us
    let volume = 1; // the mood's own level

    const ctx = () => audio.ctx;

    /** Semitones -> Hz above the mood's root. */
    const hz = (semi) => mood.root * Math.pow(2, semi / 12);

    function buildPad(t) {
      const c = ctx();
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = mood.cut;
      filter.Q.value = 0.8;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.055 * mood.gain, t + 4); // always fades IN: no click, ever
      filter.connect(gain);
      gain.connect(out);

      const oscs = [];
      mood.voices.forEach((mul, i) => {
        const o = c.createOscillator();
        o.type = i === 2 ? 'triangle' : 'sine';
        o.frequency.value = mood.root * mul;
        o.detune.value = (i - 1) * mood.detune * 100;
        const g = c.createGain();
        g.gain.value = i === 2 ? 0.35 : 1;
        o.connect(g);
        g.connect(filter);
        o.start(t);
        oscs.push(o);
      });

      // a very slow wobble on the cut-off, so the pad breathes instead of sitting still
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.045;
      const lfoAmt = c.createGain();
      lfoAmt.gain.value = mood.cut * 0.35;
      lfo.connect(lfoAmt);
      lfoAmt.connect(filter.frequency);
      lfo.start(t);

      pad = { oscs, filter, gain, lfo, lfoAmt };
    }

    /** One soft note: two sines an octave apart with a long tail, panned a little, into the shared delay. */
    function note(t, freq, vel) {
      const c = ctx();
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel), t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 + 3.2);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400 + 900 * danger;
      [1, 2.002].forEach((mul, i) => {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * mul;
        const og = c.createGain();
        og.gain.value = i ? 0.3 : 1;
        o.connect(og);
        og.connect(lp);
        o.start(t);
        o.stop(t + 4.2);
      });
      lp.connect(g);
      let tail = g;
      if (c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = (rand() * 2 - 1) * 0.55;
        g.connect(p);
        tail = p;
      }
      tail.connect(out);
      if (delay) tail.connect(delay.in);
    }

    /** Schedule every step that falls inside the lookahead window. */
    function pump() {
      const c = ctx();
      if (!c) return;
      const until = c.currentTime + LOOKAHEAD;
      let made = 0;
      while (nextTime < until && made < MAX_BURST) {
        if (rand() < mood.density) {
          const scale = mood.scale;
          const oct = mood.octaves[(rand() * mood.octaves.length) | 0];
          const semi = scale[(rand() * scale.length) | 0] + 12 * oct;
          // louder and a touch more often when something is close - the same `danger` the heartbeat uses
          note(nextTime, hz(semi), (0.035 + 0.03 * danger) * mood.gain * volume);
        }
        nextTime += mood.step * (1 - 0.18 * danger); // it hurries a little as danger rises
        step++;
        made++;
      }
      // if the clock ran away (a long stall, or the tab was hidden), catch up rather than play a burst
      if (nextTime < c.currentTime) nextTime = c.currentTime + 0.25;
    }

    /**
     * Start (or change to) a mood. `kind` is 'title' or a level number. Starting the mood that is already
     * playing does nothing, so walking through the menus never restarts the music.
     */
    function start(kind) {
      const c = ctx();
      if (!c) return; // no AudioContext yet: the game has not had its first click
      const want = kind === 'title' ? 'title' : moodFor(kind | 0);
      if (running && key === want) return;
      stop();
      key = want;
      mood = MOODS[want];
      rand = rng((kind === 'title' ? 7919 : (kind | 0) * 2654435761) >>> 0);
      const t = c.currentTime;
      out = c.createGain();
      out.gain.value = 0.0001;
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(1, t + 2.5);
      out.connect(audio.amb || audio.master);

      // a gentle echo, so a note has somewhere to go (the reverb lives on the effects bus, not this one)
      const d = c.createDelay(2);
      d.delayTime.value = Math.min(1.5, mood.step * 0.62);
      const fb = c.createGain();
      fb.gain.value = 0.28;
      const wet = c.createGain();
      wet.gain.value = 0.5;
      const dlp = c.createBiquadFilter();
      dlp.type = 'lowpass';
      dlp.frequency.value = 900;
      d.connect(dlp);
      dlp.connect(fb);
      fb.connect(d);
      dlp.connect(wet);
      wet.connect(out);
      delay = { in: d, fb, wet, lp: dlp };

      buildPad(t);
      danger = 0;
      target = 0;
      step = 0;
      nextTime = t + 1.2;
      running = true;
    }

    /** Fade out and let go of every node. Safe to call at any time, including when nothing is playing. */
    function stop() {
      running = false;
      const c = ctx();
      if (!c || !out) {
        out = null;
        pad = null;
        delay = null;
        key = null;
        return;
      }
      const t = c.currentTime;
      const dying = out;
      const dyingPad = pad;
      out = null;
      pad = null;
      delay = null;
      key = null;
      dying.gain.cancelScheduledValues(t);
      dying.gain.setTargetAtTime(0, t, 0.25);
      if (dyingPad) {
        dyingPad.oscs.concat([dyingPad.lfo]).forEach((o) => {
          try {
            o.stop(t + 1.6);
          } catch (e) {
            /* already stopped */
          }
        });
      }
      setTimeout(() => {
        try {
          dying.disconnect();
        } catch (e) {
          /* already gone */
        }
      }, 2200);
    }

    /** The game's danger value (0..1). It passes 0 in calm mode, so the music never swells there. */
    function setDanger(d) {
      target = Math.max(0, Math.min(1, +d || 0));
    }

    function update(dt) {
      if (!running || !ctx()) return;
      // ease towards the game's danger so the music never jumps on one frame
      const k = Math.min(1, dt * 0.9);
      danger += (target - danger) * k;
      const t = ctx().currentTime;
      const sw = mood.swell * danger;
      pad.filter.frequency.setTargetAtTime(mood.cut * (1 + 1.5 * sw), t, 0.4);
      pad.gain.gain.setTargetAtTime(0.055 * mood.gain * (1 + 0.85 * sw) * volume, t, 0.5);
      pad.lfoAmt.gain.setTargetAtTime(mood.cut * (0.35 + 0.5 * sw), t, 0.5);
      pump();
    }

    /** Only for the tests: what the music is doing right now. */
    const state = () => ({ running, mood: key, danger: +danger.toFixed(3), target, step, nextTime });

    return { start, stop, update, setDanger, state, moodFor, MOODS, get running() { return running; } };
  }

  return { create, moodFor, MOODS };
})();
