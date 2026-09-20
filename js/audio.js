'use strict';

/**
 * Procedural sound engine.
 *
 * Every sound in the game is synthesised at runtime with the native Web Audio
 * API (AudioContext). No .mp3 / .wav (or any other audio) files are loaded.
 *
 * The AudioContext is only created in init(), which the game calls from a
 * button click so that browser autoplay restrictions are satisfied.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverbIn = null;
    this.noiseBuf = null;
    this.ambient = null;
    this.volume = 0.8;
    this.muted = false;
    this.active = 0; // live one-shot voices, used to cap polyphony
    // Calm mode: no heartbeat, and the startling sounds (screeches, growls,
    // the "caught" crash, the intro's lunge) are much quieter.
    this.calm = false;
  }

  get ready() {
    return !!this.ctx;
  }

  /** Create the AudioContext. Must be called from a user gesture. */
  init() {
    if (this.ctx) {
      this.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this._buildReverb();
    this._buildNoise();
    this.resume();
    return true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  setVolume(v) {
    this.volume = v;
    this._applyMaster();
  }

  setMuted(m) {
    this.muted = m;
    this._applyMaster();
  }

  _applyMaster() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  // ---------------------------------------------------------------- plumbing

  /** Cave-like reverb from a procedurally generated impulse response. */
  _buildReverb() {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 3.2);
        prev = prev * 0.62 + (Math.random() * 2 - 1) * 0.38; // darken the tail
        data[i] = prev * decay;
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.reverbIn = ctx.createGain();
    const out = ctx.createGain();
    out.gain.value = 0.55;
    this.reverbIn.connect(conv);
    conv.connect(out);
    out.connect(this.master);
  }

  _buildNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  _busy(limit = 80) {
    return !this.ctx || this.active > limit;
  }

  _osc(type, freq, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur);
    return o;
  }

  _noise(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur);
    return s;
  }

  _filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Gain node with an exponential attack/decay envelope starting at t. */
  _env(t, attack, peak, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Send a node to the master bus with stereo pan and a reverb send. */
  _route(node, pan = 0, wet = 0.2) {
    const ctx = this.ctx;
    let out = node;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      out = p;
    }
    out.connect(this.master);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      out.connect(send);
      send.connect(this.reverbIn);
    }
  }

  _track(src) {
    this.active++;
    src.onended = () => {
      this.active--;
    };
  }

  // ------------------------------------------------------------- player sounds

  /** The sonar "ping" the player emits with SPACE. `vol` scales it (1 = full). */
  ping(vol = 1) {
    if (this._busy(120)) return;
    const c = this.ctx;
    const t = c.currentTime;

    const o = this._osc('sine', 1500, t, 0.7);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.34);
    const g = this._env(t, 0.004, 0.4 * vol, 0.55);
    o.connect(g);
    this._route(g, 0, 0.6);
    this._track(o);

    const sub = this._osc('sine', 160, t, 0.6);
    sub.frequency.exponentialRampToValueAtTime(46, t + 0.32);
    const sg = this._env(t, 0.005, 0.55 * vol, 0.42);
    sub.connect(sg);
    this._route(sg, 0, 0.15);

    const n = this._noise(t, 0.6);
    const bp = this._filter('bandpass', 3000, 1.2);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.45);
    const ng = this._env(t, 0.01, 0.11 * vol, 0.42);
    n.connect(bp);
    bp.connect(ng);
    this._route(ng, 0, 0.3);
  }

  /** Very soft footstep. */
  footstep(gain = 1, pan = 0) {
    if (this._busy(90)) return;
    const t = this.ctx.currentTime;
    const n = this._noise(t, 0.12);
    const lp = this._filter('lowpass', 380 + Math.random() * 120, 0.8);
    const g = this._env(t, 0.004, 0.55 * gain, 0.07);
    n.connect(lp);
    lp.connect(g);
    this._route(g, pan, 0.08);
    this._track(n);
  }

  /** Bumping into a wall or obstacle. */
  bump(gain = 1) {
    if (this._busy(90)) return;
    const t = this.ctx.currentTime;
    const n = this._noise(t, 0.2);
    const lp = this._filter('lowpass', 260, 1);
    const g = this._env(t, 0.003, 0.42 * gain, 0.13);
    n.connect(lp);
    lp.connect(g);
    this._route(g, 0, 0.12);
    const o = this._osc('sine', 85, t, 0.2);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const og = this._env(t, 0.003, 0.35 * gain, 0.14);
    o.connect(og);
    this._route(og, 0, 0.05);
    this._track(n);
  }

  // ------------------------------------------------------------ echo returns

  /** Echo off a wall: a short, hissy tick. Brighter when the wall is close. */
  echoWall(pan, vol, dist) {
    if (this._busy(70)) return;
    const t = this.ctx.currentTime;
    const n = this._noise(t, 0.2);
    const near = Math.max(0, 1 - Math.min(dist / 650, 1));
    const bp = this._filter('bandpass', 900 + near * 1900, 3);
    const g = this._env(t, 0.003, 0.7 * vol, 0.06 + near * 0.05);
    n.connect(bp);
    bp.connect(g);
    this._route(g, pan, 0.4);
    this._track(n);
  }

  /** Echo off an obstacle: a hollow, wooden "tonk". */
  echoObstacle(pan, vol, dist) {
    if (this._busy(90)) return;
    const t = this.ctx.currentTime;
    const f0 = 330 - Math.min(dist / 650, 1) * 130;
    const o = this._osc('triangle', f0, t, 0.5);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.82, t + 0.3);
    const g = this._env(t, 0.004, 0.36 * vol, 0.32);
    o.connect(g);
    this._route(g, pan, 0.35);
    const o2 = this._osc('sine', f0 * 2.76, t, 0.3);
    const g2 = this._env(t, 0.003, 0.14 * vol, 0.14);
    o2.connect(g2);
    this._route(g2, pan, 0.3);
    this._track(o);
  }

  /** Echo off an echo monster: a dissonant, wavering moan. */
  echoEnemy(pan, vol, dist) {
    if (this._busy(90)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const base = 96 + (1 - Math.min(dist / 650, 1)) * 24;
    const bp = this._filter('bandpass', 520, 1.6);
    const g = this._env(t, 0.05, 0.42 * vol, 0.7);
    const o1 = this._osc('sawtooth', base, t, 0.9);
    const o2 = this._osc('sawtooth', base * 1.06, t, 0.9);
    const lfo = this._osc('sine', 6.5, t, 0.9);
    const lfoG = c.createGain();
    lfoG.gain.value = 7;
    lfo.connect(lfoG);
    lfoG.connect(o1.frequency);
    lfoG.connect(o2.frequency);
    o1.connect(bp);
    o2.connect(bp);
    bp.connect(g);
    this._route(g, pan, 0.5);
    const n = this._noise(t, 0.6);
    const hp = this._filter('highpass', 3500, 1);
    const ng = this._env(t, 0.06, 0.05 * vol, 0.4);
    n.connect(hp);
    hp.connect(ng);
    this._route(ng, pan, 0.4);
    this._track(o1);
  }

  /** Echo off a scent monster: a low, wet gurgle (unlike an echo monster's buzzy moan). */
  echoScent(pan, vol, dist) {
    if (this._busy(90)) return;
    const t = this.ctx.currentTime;
    const base = 88 + (1 - Math.min(dist / 650, 1)) * 20;
    const bp = this._filter('bandpass', 380, 1.4);
    const g = this._env(t, 0.06, 0.4 * vol, 0.6);
    [base, base * 1.07].forEach((f) => {
      const o = this._osc('triangle', f, t, 0.8);
      const lfo = this._osc('sine', 9, t, 0.8); // the gurgle: fast, shallow wobble
      const lg = this.ctx.createGain();
      lg.gain.value = 9;
      lfo.connect(lg);
      lg.connect(o.frequency);
      o.connect(bp);
    });
    bp.connect(g);
    this._route(g, pan, 0.45);
    const n = this._noise(t, 0.5);
    const nb = this._filter('bandpass', 1400, 1.5);
    const ng = this._env(t, 0.05, 0.07 * vol, 0.3);
    n.connect(nb);
    nb.connect(ng);
    this._route(ng, pan, 0.4);
    this._track(n);
  }

  /** Echo off a puddle: a bubbly "blorp". */
  echoPuddle(pan, vol, dist) {
    if (this._busy(90)) return;
    const t = this.ctx.currentTime;
    const f0 = 230 + (1 - Math.min(dist / 650, 1)) * 60;
    const o = this._osc('sine', f0, t, 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.1, t + 0.09);
    const g = this._env(t, 0.005, 0.32 * vol, 0.16);
    o.connect(g);
    this._route(g, pan, 0.4);
    const o2 = this._osc('sine', f0 * 1.3, t + 0.1, 0.25);
    o2.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.17);
    const g2 = this._env(t + 0.1, 0.004, 0.2 * vol, 0.1);
    o2.connect(g2);
    this._route(g2, pan, 0.4);
    this._track(o);
  }

  /** You step into a smell puddle: a wet squelch. */
  splash(vol = 1) {
    if (this._busy(100)) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sine', 170, t, 0.3);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.1);
    const g = this._env(t, 0.004, 0.5 * vol, 0.18);
    o.connect(g);
    this._route(g, 0, 0.25);
    const n = this._noise(t, 0.35);
    const bp = this._filter('bandpass', 1500, 1.2);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.25);
    const ng = this._env(t, 0.006, 0.34 * vol, 0.24);
    n.connect(bp);
    bp.connect(ng);
    this._route(ng, 0, 0.3);
    const at = t + 0.1;
    const o2 = this._osc('sine', 250, at, 0.25);
    o2.frequency.exponentialRampToValueAtTime(700, at + 0.07);
    const g2 = this._env(at, 0.003, 0.26 * vol, 0.12);
    o2.connect(g2);
    this._route(g2, 0, 0.25);
    this._track(o);
  }

  /** Echo off the exit: a clear, bright bell. */
  echoExit(pan, vol) {
    if (this._busy(90)) return;
    const t = this.ctx.currentTime;
    const partials = [
      [880, 1.0, 0.95],
      [1318.5, 0.6, 0.7],
      [1771, 0.35, 0.5],
    ];
    let first = null;
    for (const [f, a, d] of partials) {
      const o = this._osc('sine', f, t, d + 0.1);
      const g = this._env(t, 0.004, 0.24 * a * vol, d);
      o.connect(g);
      this._route(g, pan, 0.5);
      if (!first) first = o;
    }
    this._track(first);
  }

  /** Soft periodic pulse from the exit so you can home in on it. */
  beacon(pan, gain) {
    if (this._busy(90)) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 783.99];
    notes.forEach((f, i) => {
      const o = this._osc('sine', f, t, 1.2);
      const g = this._env(t, 0.06, 0.16 * gain * (i ? 0.6 : 1), 0.8);
      o.connect(g);
      this._route(g, pan, 0.55);
      if (i === 0) this._track(o);
    });
  }

  // ------------------------------------------------- mimic + sonar decoy

  /** A mimic's disguise breaks: the exit's bell goes sour and slides down into a monster's shriek. */
  mimicReveal(pan, gain) {
    if (this.calm) gain *= 0.4;
    if (this._busy(100) || gain < 0.01) return;
    const t = this.ctx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = this._osc('sawtooth', f, t, 0.9);
      o.frequency.exponentialRampToValueAtTime(f * 0.28, t + 0.7);
      const lp = this._filter('lowpass', 2600, 1.2);
      const g = this._env(t, 0.01, 0.3 * gain * (i ? 0.6 : 1), 0.7);
      o.connect(lp);
      lp.connect(g);
      this._route(g, pan, 0.5);
      if (i === 0) this._track(o);
    });
    const n = this._noise(t, 0.4);
    const bp = this._filter('bandpass', 1800, 1.5);
    const ng = this._env(t, 0.005, 0.32 * gain, 0.3);
    n.connect(bp);
    bp.connect(ng);
    this._route(ng, pan, 0.4);
    const low = this._osc('sine', 110, t, 0.7);
    low.frequency.exponentialRampToValueAtTime(48, t + 0.6);
    const lg = this._env(t, 0.02, 0.4 * gain, 0.55);
    low.connect(lg);
    this._route(lg, pan, 0.3);
  }

  /** Echo off a sonar decoy: a soft pink double blip (unlike the exit's bell or a monster's moan). */
  echoDecoy(pan, vol) {
    if (this._busy(90)) return;
    const t = this.ctx.currentTime;
    [0, 0.11].forEach((dt, i) => {
      const o = this._osc('triangle', i ? 1760 : 1245, t + dt, 0.3);
      const g = this._env(t + dt, 0.004, 0.2 * vol, 0.16);
      o.connect(g);
      this._route(g, pan, 0.5);
      if (i === 0) this._track(o);
    });
  }

  /** You pick up the sonar decoy: three quick rising notes. */
  decoyPickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [659.25, 880, 1174.66].forEach((f, i) => {
      const at = t + i * 0.08;
      const o = this._osc('triangle', f, at, 0.4);
      const g = this._env(at, 0.005, 0.22, 0.24);
      o.connect(g);
      this._route(g, 0, 0.4);
      if (i === 0) this._track(o);
    });
  }

  /** You put the decoy down: a soft click and a low thunk. */
  decoyDrop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sine', 190, t, 0.3);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    const g = this._env(t, 0.004, 0.36, 0.2);
    o.connect(g);
    this._route(g, 0, 0.2);
    const n = this._noise(t, 0.08);
    const bp = this._filter('bandpass', 2200, 3);
    const ng = this._env(t, 0.002, 0.16, 0.05);
    n.connect(bp);
    bp.connect(ng);
    this._route(ng, 0, 0.15);
    this._track(o);
  }

  /** The armed decoy's beep. `f` (0..1) is how close it is to calling: it rises in pitch as it gets there. */
  decoyTick(pan, gain, f = 0) {
    if (this._busy(100) || gain < 0.01) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sine', 700 + 900 * f, t, 0.16);
    const g = this._env(t, 0.004, 0.22 * gain, 0.09);
    o.connect(g);
    this._route(g, pan, 0.35);
    this._track(o);
  }

  /** The decoy calls: a rising and falling siren sweep that every monster nearby answers. */
  decoyCall(pan, gain) {
    if (this._busy(100)) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sawtooth', 320, t, 1.4);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.45);
    o.frequency.exponentialRampToValueAtTime(380, t + 1.2);
    const lp = this._filter('lowpass', 2400, 1);
    const g = this._env(t, 0.03, 0.32 * gain, 1.1);
    o.connect(lp);
    lp.connect(g);
    this._route(g, pan, 0.6);
    const o2 = this._osc('sine', 640, t, 1.4);
    o2.frequency.exponentialRampToValueAtTime(3000, t + 0.45);
    o2.frequency.exponentialRampToValueAtTime(760, t + 1.2);
    const g2 = this._env(t, 0.03, 0.16 * gain, 1.1);
    o2.connect(g2);
    this._route(g2, pan, 0.6);
    this._track(o);
  }

  /** A faint blip from the decoy lying on the floor, so it can be found in the dark. */
  decoyBlip(pan, gain) {
    if (this._busy(90) || gain < 0.01) return;
    const t = this.ctx.currentTime;
    [0, 0.09].forEach((dt, i) => {
      const o = this._osc('triangle', i ? 2093 : 1568, t + dt, 0.2);
      const g = this._env(t + dt, 0.004, 0.12 * gain, 0.1);
      o.connect(g);
      this._route(g, pan, 0.45);
      if (i === 0) this._track(o);
    });
  }

  // --------------------------------------------------------- enemy (monster)

  /**
   * Continuous, looping voice for one monster. Returns a handle that is
   * updated every frame with updateEnemyVoice(). An echo monster growls (buzzy,
   * dissonant); a scent monster ('scent') gurgles and sniffs (soft, wet, choppy).
   */
  createEnemyVoice(pitch = 55, kind = 'echo') {
    if (!this.ctx) return null;
    const c = this.ctx;
    const t = c.currentTime;
    const scent = kind === 'scent';

    const out = c.createGain();
    out.gain.value = 0;
    const breath = c.createGain();
    breath.gain.value = 0.65;
    const lp = this._filter('lowpass', scent ? 420 : 260, scent ? 2 : 5);
    const mix = c.createGain();
    mix.gain.value = 0.32;

    const o1 = c.createOscillator();
    o1.type = scent ? 'triangle' : 'sawtooth';
    o1.frequency.value = pitch;
    const o2 = c.createOscillator();
    o2.type = scent ? 'sine' : 'sawtooth';
    o2.frequency.value = scent ? pitch * 2.03 : pitch * 1.498 + 0.7;
    const o3 = c.createOscillator();
    o3.type = scent ? 'sine' : 'square';
    o3.frequency.value = pitch * 0.5;
    const g3 = c.createGain();
    g3.gain.value = 0.5;
    o1.connect(mix);
    o2.connect(mix);
    o3.connect(g3);
    g3.connect(mix);
    mix.connect(lp);
    lp.connect(breath);
    breath.connect(out);

    // a scent monster also has a wet, sniffing hiss that skips the low-pass
    let hiss = null;
    if (scent) {
      hiss = c.createBufferSource();
      hiss.buffer = this.noiseBuf;
      hiss.loop = true;
      const hb = this._filter('bandpass', 1500, 1.4);
      const hg = c.createGain();
      hg.gain.value = 0.3;
      hiss.connect(hb);
      hb.connect(hg);
      hg.connect(breath);
    }

    // slow "breathing" on amplitude (a choppy sniff for a scent monster), faster wobble on the filter
    const lfo = c.createOscillator();
    lfo.frequency.value = scent ? 1.6 + Math.random() * 0.4 : 0.35 + Math.random() * 0.3;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = scent ? 0.55 : 0.3;
    lfo.connect(lfoDepth);
    lfoDepth.connect(breath.gain);
    const lfo2 = c.createOscillator();
    lfo2.frequency.value = 4.5 + Math.random();
    const lfo2Depth = c.createGain();
    lfo2Depth.gain.value = 55;
    lfo2.connect(lfo2Depth);
    lfo2Depth.connect(lp.frequency);

    let pan = null;
    if (c.createStereoPanner) {
      pan = c.createStereoPanner();
      out.connect(pan);
      pan.connect(this.master);
    } else {
      out.connect(this.master);
    }
    const send = c.createGain();
    send.gain.value = 0.25;
    (pan || out).connect(send);
    send.connect(this.reverbIn);

    const oscs = [o1, o2, o3, lfo, lfo2];
    if (hiss) oscs.push(hiss);
    oscs.forEach((o) => o.start(t));
    return { out, pan, lp, o1, o2, o3, lfo, pitch, kind, oscs };
  }

  updateEnemyVoice(v, { gain, pan, mood, muffle }) {
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    const scent = v.kind === 'scent';
    v.out.gain.setTargetAtTime(gain * (this.calm ? 0.6 : 1), t, 0.06);
    if (v.pan) v.pan.pan.setTargetAtTime(pan, t, 0.06);
    v.lp.frequency.setTargetAtTime(((scent ? 300 : 190) + mood * (scent ? 300 : 460)) * (muffle ? 0.55 : 1), t, 0.1);
    const pf = v.pitch * (1 + mood * (scent ? 0.12 : 0.28));
    v.o1.frequency.setTargetAtTime(pf, t, 0.18);
    v.o2.frequency.setTargetAtTime(scent ? pf * 2.03 : pf * 1.498 + 0.7, t, 0.18);
    v.o3.frequency.setTargetAtTime(pf * 0.5, t, 0.18);
    v.lfo.frequency.setTargetAtTime(scent ? 1.6 + mood * 2.2 : 0.35 + mood * 2.4, t, 0.3);
  }

  destroyEnemyVoice(v) {
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.out.gain.setTargetAtTime(0, t, 0.05);
    v.oscs.forEach((o) => {
      try {
        o.stop(t + 0.3);
      } catch (e) {
        /* already stopped */
      }
    });
  }

  /** Wet slap of a scent monster's footstep. */
  scentStep(pan, gain) {
    if (this.calm) gain *= 0.7;
    if (this._busy(90) || gain < 0.01) return;
    const t = this.ctx.currentTime;
    const n = this._noise(t, 0.14);
    const lp = this._filter('lowpass', 520 + Math.random() * 200, 1);
    const g = this._env(t, 0.003, 0.4 * gain, 0.08);
    n.connect(lp);
    lp.connect(g);
    this._route(g, pan, 0.3);
    const o = this._osc('sine', 130, t, 0.16);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    const og = this._env(t, 0.003, 0.3 * gain, 0.1);
    o.connect(og);
    this._route(og, pan, 0.2);
    this._track(n);
  }

  /** Two hard, wet snorts: a scent monster has caught your smell. */
  scentAlert(pan, gain) {
    if (this.calm) gain *= 0.35;
    if (this._busy(100) || gain < 0.01) return;
    const t = this.ctx.currentTime;
    [0, 0.24].forEach((dt, i) => {
      const n = this._noise(t + dt, 0.3);
      const bp = this._filter('bandpass', 800, 2.4);
      bp.frequency.setValueAtTime(800, t + dt);
      bp.frequency.exponentialRampToValueAtTime(2600, t + dt + 0.16);
      const g = this._env(t + dt, 0.012, 0.6 * gain, 0.17);
      n.connect(bp);
      bp.connect(g);
      this._route(g, pan, 0.45);
      if (i === 0) this._track(n);
    });
    const low = this._osc('sine', 78, t, 0.6);
    low.frequency.exponentialRampToValueAtTime(58, t + 0.5);
    const lg = this._env(t, 0.03, 0.4 * gain, 0.45);
    low.connect(lg);
    this._route(lg, pan, 0.3);
  }

  /** Chitinous clack of a monster's footstep. */
  enemyStep(pan, gain) {
    if (this.calm) gain *= 0.7;
    if (this._busy(90) || gain < 0.01) return;
    const t = this.ctx.currentTime;
    const n = this._noise(t, 0.1);
    const bp = this._filter('bandpass', 1300 + Math.random() * 500, 4);
    const g = this._env(t, 0.002, 0.28 * gain, 0.045);
    n.connect(bp);
    bp.connect(g);
    this._route(g, pan, 0.25);
    const o = this._osc('triangle', 200, t, 0.12);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    const og = this._env(t, 0.002, 0.22 * gain, 0.08);
    o.connect(og);
    this._route(og, pan, 0.15);
    this._track(n);
  }

  /** Screech when a monster hears you and starts hunting. */
  enemyAlert(pan, gain) {
    if (this.calm) gain *= 0.35;
    if (this._busy(100) || gain < 0.01) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sawtooth', 760, t, 0.7);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.55);
    const bp = this._filter('bandpass', 1000, 2.5);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    const g = this._env(t, 0.02, 0.5 * gain, 0.55);
    o.connect(bp);
    bp.connect(g);
    this._route(g, pan, 0.5);
    const low = this._osc('sine', 95, t, 0.6);
    const lg = this._env(t, 0.03, 0.4 * gain, 0.45);
    low.connect(lg);
    this._route(lg, pan, 0.3);
    this._track(o);
  }

  // ------------------------------------------------------------- game events

  heartbeat(gain) {
    if (this.calm || this._busy(100)) return;
    const t = this.ctx.currentTime;
    [0, 0.17].forEach((dt, i) => {
      const o = this._osc('sine', 72, t + dt, 0.3);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.16);
      const g = this._env(t + dt, 0.006, (i ? 0.6 : 0.85) * gain, 0.15);
      o.connect(g);
      this._route(g, 0, 0.05);
      if (i === 0) this._track(o);
    });
  }

  caught() {
    if (!this.ctx) return;
    const k = this.calm ? 0.35 : 1;
    const t = this.ctx.currentTime;
    const o = this._osc('sawtooth', 240, t, 1.3);
    o.frequency.exponentialRampToValueAtTime(34, t + 1.1);
    const lp = this._filter('lowpass', 1400, 2);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    const g = this._env(t, 0.01, 0.6 * k, 1.1);
    o.connect(lp);
    lp.connect(g);
    this._route(g, 0, 0.5);
    const o2 = this._osc('sawtooth', 253, t, 1.3);
    o2.frequency.exponentialRampToValueAtTime(37, t + 1.1);
    o2.connect(lp);
    const n = this._noise(t, 0.5);
    const nlp = this._filter('lowpass', 900, 1);
    const ng = this._env(t, 0.005, 0.5 * k, 0.4);
    n.connect(nlp);
    nlp.connect(ng);
    this._route(ng, 0, 0.4);
  }

  _arpeggio(notes, step, vol = 0.22) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    notes.forEach((f, i) => {
      const at = t + i * step;
      [[1, 1], [2.005, 0.35]].forEach(([mul, a]) => {
        const o = this._osc('sine', f * mul, at, 1.4);
        const g = this._env(at, 0.008, vol * a, 1.0);
        o.connect(g);
        this._route(g, (i % 2 ? 0.3 : -0.3), 0.55);
      });
    });
  }

  levelComplete() {
    this._arpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.11);
  }

  victory() {
    this._arpeggio([392, 523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093], 0.13, 0.2);
  }

  uiClick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sine', 660, t, 0.15);
    o.frequency.exponentialRampToValueAtTime(990, t + 0.06);
    const g = this._env(t, 0.004, 0.2, 0.1);
    o.connect(g);
    this._route(g, 0, 0.3);
  }

  // ---------------------------------------------------------------- cutscene

  /**
   * One syllable of synthesised "speech": a buzzy voice source shaped by two
   * vowel formants. Not words - the on-screen subtitles carry those - just the
   * mumble of a person talking. `code` picks the vowel and pitch wobble.
   */
  voice(code = 97, vol = 1) {
    if (this._busy(120)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const vowels = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870]]; // a e i o u
    const [f1, f2] = vowels[code % 5];
    const f0 = 165 + (code % 7) * 7 + Math.random() * 12;
    const src = this._osc('sawtooth', f0, t, 0.16);
    src.frequency.linearRampToValueAtTime(f0 * 0.9, t + 0.11);
    const g = this._env(t, 0.014, 1.4 * vol, 0.09);
    [[f1, 5, 1], [f2, 7, 0.55]].forEach(([f, q, a]) => {
      const bp = this._filter('bandpass', f, q);
      const bg = c.createGain();
      bg.gain.value = a;
      src.connect(bp);
      bp.connect(bg);
      bg.connect(g);
    });
    this._route(g, 0, 0.3);
    this._track(src);
  }

  /** A slow, ragged breath. */
  breath(vol = 1) {
    if (this._busy(120)) return;
    const t = this.ctx.currentTime;
    const n = this._noise(t, 1.2);
    const bp = this._filter('bandpass', 900, 0.7);
    bp.frequency.linearRampToValueAtTime(600, t + 0.9);
    const g = this._env(t, 0.32, 0.09 * vol, 0.6);
    n.connect(bp);
    bp.connect(g);
    this._route(g, 0, 0.35);
    this._track(n);
  }

  /** The jump scare: something huge leaps out of the dark. */
  lunge() {
    if (!this.ctx) return;
    const k = this.calm ? 0.3 : 1;
    const t = this.ctx.currentTime;
    [760, 803].forEach((f, i) => {
      const o = this._osc('sawtooth', f, t, 0.8);
      o.frequency.exponentialRampToValueAtTime(f * 0.16, t + 0.55);
      const bp = this._filter('bandpass', 1300, 1.6);
      bp.frequency.exponentialRampToValueAtTime(380, t + 0.5);
      const g = this._env(t, this.calm ? 0.12 : 0.008, 0.62 * k, 0.55);
      o.connect(bp);
      bp.connect(g);
      this._route(g, i ? 0.3 : -0.3, 0.45);
    });
    const n = this._noise(t, 0.6);
    const nlp = this._filter('lowpass', 2600, 0.8);
    const ng = this._env(t, this.calm ? 0.1 : 0.004, 0.75 * k, 0.35);
    n.connect(nlp);
    nlp.connect(ng);
    this._route(ng, 0, 0.5);
    const sub = this._osc('sine', 70, t, 0.8);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const sg = this._env(t, 0.005, 0.95 * k, 0.55);
    sub.connect(sg);
    this._route(sg, 0, 0.1);
  }

  /** A metal gadget clattering on stone. */
  clank(vol = 1) {
    if (this._busy(120)) return;
    const t = this.ctx.currentTime;
    [[1180, 0.5], [1810, 0.32], [2760, 0.2], [4020, 0.12]].forEach(([f, a], i) => {
      // oscillator and envelope must start together: a gain node sits at 1.0 until its first event
      const at = t + i * 0.012;
      const o = this._osc('sine', f * (1 + Math.random() * 0.02), at, 0.6);
      const g = this._env(at, 0.002, 1.0 * a * vol, 0.4 - i * 0.06);
      o.connect(g);
      this._route(g, 0.15, 0.4);
      if (!i) this._track(o);
    });
    const n = this._noise(t, 0.1);
    const hp = this._filter('highpass', 2500, 0.8);
    const ng = this._env(t, 0.002, 0.22 * vol, 0.05);
    n.connect(hp);
    hp.connect(ng);
    this._route(ng, 0.15, 0.3);
  }

  /** Cut everything dead for `seconds` - the "everything just stopped" beat. */
  silence(seconds) {
    if (!this.ctx) return;
    if (this.calm) seconds = Math.min(seconds, 0.4); // no long, jarring dead air
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.012);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t + seconds, 0.05);
  }

  /** A low swell that lands under each lore card. */
  swell(freq = 55, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1, 1.5].forEach((m, i) => {
      const o = this._osc('sine', freq * m + i * 0.3, t, 4);
      const g = this._env(t, 1.3, 0.11 * vol * (i ? 0.6 : 1), 2.5);
      o.connect(g);
      this._route(g, 0, 0.5);
    });
  }

  // ----------------------------------------------------------------- ambient

  /** A quiet, low drone with a little wind. Pitch rises slightly per level. */
  startAmbient(level = 1) {
    if (!this.ctx) return;
    this.stopAmbient();
    const c = this.ctx;
    const t = c.currentTime;
    const base = 41 + Math.min(level, 12) * 1.6;

    const out = c.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, t, 1.5);
    out.connect(this.master);

    const g1 = c.createGain();
    g1.gain.value = 0.05;
    const o1 = c.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = base;
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = base * 1.5 + 0.35;
    o1.connect(g1);
    o2.connect(g1);
    g1.connect(out);

    const noise = c.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    const lp = this._filter('lowpass', 170, 0.7);
    const wind = c.createGain();
    wind.gain.value = 0.035;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.025;
    lfo.connect(lfoDepth);
    lfoDepth.connect(wind.gain);
    noise.connect(lp);
    lp.connect(wind);
    wind.connect(out);

    [o1, o2, lfo].forEach((o) => o.start(t));
    noise.start(t);
    this.ambient = { out, stoppers: [o1, o2, lfo, noise] };
  }

  stopAmbient() {
    if (!this.ambient || !this.ctx) return;
    const t = this.ctx.currentTime;
    const a = this.ambient;
    this.ambient = null;
    a.out.gain.setTargetAtTime(0, t, 0.25);
    a.stoppers.forEach((s) => {
      try {
        s.stop(t + 1.5);
      } catch (e) {
        /* already stopped */
      }
    });
  }
}
