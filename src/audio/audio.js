// Fully procedural audio: ocean ambience, generative music that follows the
// story, and every sound effect. No audio files.

const MOODS = {
  night: {
    chords: [[50, 57, 62, 65, 69], [46, 53, 58, 62, 65], [41, 48, 57, 60, 64], [48, 55, 60, 64, 67]],
    scale: [62, 64, 65, 69, 72, 74, 76, 77, 81], len: 9, density: 0.22, bright: 900,
  },
  reef: {
    chords: [[50, 57, 62, 66, 69, 76], [47, 54, 62, 64, 69], [43, 50, 59, 62, 66, 69], [45, 52, 57, 62, 64, 71]],
    scale: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83], len: 8, density: 0.5, bright: 1900,
  },
  kelp: {
    chords: [[52, 59, 62, 66, 71], [48, 55, 62, 64, 67], [43, 50, 59, 62, 66], [50, 57, 62, 66, 69]],
    scale: [64, 66, 67, 71, 74, 76, 78, 79, 83], len: 9, density: 0.35, bright: 1300,
  },
  open: {
    chords: [[45, 52, 57, 61, 64, 71], [42, 49, 57, 61, 64], [38, 45, 54, 57, 61, 64], [40, 47, 56, 59, 64]],
    scale: [64, 66, 69, 71, 73, 76, 78, 81, 83, 85], len: 10, density: 0.3, bright: 2200,
  },
  deep: {
    chords: [[38, 45, 50, 53], [36, 43, 50, 55], [34, 41, 50, 53], [38, 45, 52, 53]],
    scale: [50, 53, 55, 57, 60, 62, 65], len: 11, density: 0.14, bright: 520,
  },
  gathering: {
    chords: [[50, 57, 62, 66, 69, 74], [47, 54, 59, 62, 66, 71], [43, 50, 55, 59, 62, 67], [45, 52, 57, 61, 64, 69]],
    scale: [66, 69, 71, 74, 76, 78, 81, 83, 86], len: 6, density: 0.85, bright: 3200,
  },
  journey: {
    chords: [[40, 47, 52, 55, 59], [36, 43, 52, 55, 59], [43, 50, 55, 59, 62], [38, 45, 54, 57, 62]],
    scale: [64, 67, 69, 71, 74, 76, 79], len: 8, density: 0.35, bright: 1400,
  },
  nest: {
    chords: [[41, 48, 57, 60, 64], [36, 43, 52, 55, 60], [45, 52, 57, 60, 64], [43, 50, 55, 59, 62]],
    scale: [65, 67, 69, 72, 74, 76, 77, 79, 81], len: 9, density: 0.3, bright: 1100,
  },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.volume = 0.8;
    this.mood = 'night';
    this.intensity = 0.4;
    this.chordIdx = 0;
    this.lastThud = 0;
    this.muted = false;
  }

  init() {
    if (this.muted) return; // automated test runs stay silent
    if (this.ready) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(3.2, 2.2);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0.9;
    this.revSend.connect(this.reverb).connect(this.master);

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    const mSend = ctx.createGain(); mSend.gain.value = 0.7;
    this.musicBus.connect(mSend).connect(this.revSend);

    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9;
    this.sfxFilter = ctx.createBiquadFilter(); this.sfxFilter.type = 'lowpass'; this.sfxFilter.frequency.value = 18000;
    this.sfxBus.connect(this.sfxFilter).connect(this.master);
    const sSend = ctx.createGain(); sSend.gain.value = 0.25;
    this.sfxFilter.connect(sSend).connect(this.revSend);

    this.ambFilter = ctx.createBiquadFilter(); this.ambFilter.type = 'lowpass'; this.ambFilter.frequency.value = 12000;
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.7;
    this.ambBus.connect(this.ambFilter).connect(this.master);

    this.white = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(4, 'brown');

    // ambience layers
    this.surfGain = this.loop(this.brown, 'lowpass', 650, 0, this.ambBus);
    this.surfHiss = this.loop(this.white, 'bandpass', 2400, 0, this.ambBus, 0.5);
    this.windGain = this.loop(this.white, 'bandpass', 700, 0, this.ambBus, 0.4);
    this.underGain = this.loop(this.brown, 'lowpass', 220, 0, this.ambBus);

    // engine drone
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 320;
    this.engO1 = ctx.createOscillator(); this.engO1.type = 'sawtooth'; this.engO1.frequency.value = 44;
    this.engO2 = ctx.createOscillator(); this.engO2.type = 'square'; this.engO2.frequency.value = 88.5;
    const o2g = ctx.createGain(); o2g.gain.value = 0.35;
    this.engLfo = ctx.createOscillator(); this.engLfo.frequency.value = 11;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
    const engAmp = ctx.createGain(); engAmp.gain.value = 0.65;
    this.engLfo.connect(lfoG).connect(engAmp.gain);
    this.engO1.connect(engF); this.engO2.connect(o2g).connect(engF);
    engF.connect(engAmp).connect(this.engGain).connect(this.sfxBus);
    const engN = this.loop(this.brown, 'bandpass', 140, 0, this.engGain, 3);
    engN.gain.value = 0.6;
    this.engO1.start(); this.engO2.start(); this.engLfo.start();

    this.nextChord = ctx.currentTime + 0.5;
    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  makeNoise(sec, kind) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  makeIR(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  loop(buffer, ftype, freq, gain, dest, q = 0.7) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(dest);
    src.start(0, Math.random() * buffer.duration);
    return g;
  }

  // ------------------------------------------------------------ per frame
  update(dt, s) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const set = (param, v, tc = 0.25) => param.setTargetAtTime(v, t, tc);
    const under = s.under ? 1 : 0;
    set(this.ambFilter.frequency, under ? 420 : 14000, 0.15);
    set(this.sfxFilter.frequency, under ? 2600 : 18000, 0.15);
    set(this.surfGain.gain, (1 - under) * s.surf * 0.9 + under * s.surf * 0.25);
    set(this.surfHiss.gain, (1 - under) * s.surf * 0.12);
    set(this.windGain.gain, (1 - under) * s.wind * 0.18);
    set(this.underGain.gain, under * (0.45 + Math.min(0.4, s.depth * 0.004)));
    set(this.engGain.gain, Math.min(1, s.engine) * 0.55, 0.1);
    set(this.engO1.frequency, 40 + s.engine * 16 + s.enginePitch * 4, 0.2);
    set(this.engO2.frequency, 81 + s.engine * 32 + s.enginePitch * 8, 0.2);
    set(this.musicBus.gain, 0.32 + this.intensity * 0.3, 1.5);

    if (s.mood && s.mood !== this.mood) { this.mood = s.mood; this.nextChord = Math.min(this.nextChord, t + 1.2); }
    this.intensity += ((s.intensity ?? 0.4) - this.intensity) * Math.min(1, dt * 0.8);
    if (t > this.nextChord - 0.05) this.playChord(this.nextChord);
  }

  // ------------------------------------------------------------ music
  playChord(t0) {
    const M = MOODS[this.mood] || MOODS.reef;
    const chord = M.chords[this.chordIdx % M.chords.length];
    this.chordIdx++;
    const len = M.len * (this.intensity > 0.7 ? 0.85 : 1);
    const ctx = this.ctx;
    const bright = M.bright * (0.6 + this.intensity * 0.8);
    // pad
    for (const [i, n] of chord.entries()) {
      for (const [type, det, gv] of [['triangle', -5, 0.05], ['sawtooth', 6, 0.018]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(n); o.detune.value = det + (Math.random() - 0.5) * 6;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright; f.Q.value = 0.4;
        const g = ctx.createGain(); g.gain.value = 0;
        const peak = gv * (i === 0 ? 1.2 : 1) * (0.7 + this.intensity * 0.5);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 2.4);
        g.gain.setValueAtTime(peak, t0 + len);
        g.gain.linearRampToValueAtTime(0, t0 + len + 3.5);
        o.connect(f).connect(g).connect(this.musicBus);
        o.start(t0); o.stop(t0 + len + 3.6);
      }
    }
    // bass
    {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(chord[0] - 12);
      const g = ctx.createGain(); g.gain.value = 0;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.09, t0 + 1.5);
      g.gain.setValueAtTime(0.09, t0 + len); g.gain.linearRampToValueAtTime(0, t0 + len + 2.5);
      o.connect(g).connect(this.musicBus); o.start(t0); o.stop(t0 + len + 2.6);
    }
    // swelling strings when intensity is high
    if (this.intensity > 0.55) {
      const k = (this.intensity - 0.55) / 0.45;
      for (const n of chord.slice(1)) {
        for (const det of [-8, 8]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n + 12); o.detune.value = det;
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t0); f.frequency.linearRampToValueAtTime(1800 + 2000 * k, t0 + len * 0.7);
          const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.018 * k, t0 + len * 0.6); g.gain.linearRampToValueAtTime(0, t0 + len + 2);
          o.connect(f).connect(g).connect(this.musicBus); o.start(t0); o.stop(t0 + len + 2.1);
        }
      }
    }
    // plucks
    const n = Math.round(len * M.density * (0.5 + this.intensity) * 1.2);
    for (let i = 0; i < n; i++) {
      const tt = t0 + 0.4 + Math.random() * (len - 0.5);
      const note = M.scale[Math.floor(Math.random() * M.scale.length)];
      this.pluck(tt, mtof(note), 0.05 + Math.random() * 0.04);
    }
    this.nextChord = t0 + len;
  }

  pluck(t, f, v) {
    const ctx = this.ctx;
    for (const [mul, gv, type] of [[1, 1, 'sine'], [2, 0.3, 'triangle'], [3.01, 0.12, 'sine']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * gv, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2 / mul);
      o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 2.3);
    }
  }

  // ------------------------------------------------------------ sfx helpers
  noiseHit(t, dur, ftype, f0, f1, vol, q = 1, dest = this.sfxBus) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  tone(t, type, f0, f1, dur, vol, dest = this.sfxBus) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ------------------------------------------------------------ sfx
  thud(v = 1) {
    if (!this.ready) return;
    const t = this.now;
    this.tone(t, 'sine', 72, 30, 0.45, 0.9 * v);
    this.tone(t, 'triangle', 110, 40, 0.18, 0.35 * v);
    this.noiseHit(t, 0.25, 'lowpass', 400, 80, 0.5 * v);
  }
  gull(v = 0.5) {
    if (!this.ready) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.22 + Math.random() * 0.05;
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(1500, tt); o.frequency.exponentialRampToValueAtTime(820, tt + 0.2);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v * 0.25, tt + 0.03); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.21);
      o.connect(f).connect(g).connect(this.sfxBus); o.start(tt); o.stop(tt + 0.25);
    }
  }
  crab() {
    if (!this.ready) return;
    const t = this.now;
    for (let i = 0; i < 6; i++) this.noiseHit(t + i * 0.05, 0.03, 'highpass', 3500, 3000, 0.25);
  }
  splash(v = 1) {
    if (!this.ready) return;
    const t = this.now;
    this.noiseHit(t, 0.9, 'bandpass', 2500, 300, 0.7 * v, 0.8);
    this.noiseHit(t, 0.4, 'lowpass', 900, 100, 0.5 * v);
    for (let i = 0; i < 5; i++) this.bubble(t + 0.2 + Math.random() * 0.5, 0.15);
  }
  bubble(t = this.now, v = 0.2) {
    if (!this.ready) return;
    this.tone(t, 'sine', 300 + Math.random() * 300, 900 + Math.random() * 700, 0.07, v);
  }
  chomp(quality) {
    if (!this.ready) return;
    const t = this.now;
    this.noiseHit(t, 0.08, 'bandpass', 1400, 600, 0.45, 2);
    this.tone(t, 'sine', 180, 90, 0.1, 0.35);
    if (quality > 0.7) { this.tone(t + 0.06, 'sine', 988, 990, 0.35, 0.12); this.tone(t + 0.12, 'sine', 1480, 1482, 0.4, 0.1); }
    else if (quality > 0.2) this.tone(t + 0.06, 'sine', 740, 742, 0.3, 0.08);
    else this.tone(t + 0.06, 'square', 140, 110, 0.35, 0.08);
  }
  pickup() {
    if (!this.ready) return;
    const t = this.now;
    [74, 78, 81, 86].forEach((n, i) => this.pluck(t + i * 0.08, mtof(n), 0.12));
  }
  hurt() {
    if (!this.ready) return;
    const t = this.now;
    this.tone(t, 'sine', 120, 40, 0.4, 0.8);
    this.noiseHit(t, 0.3, 'lowpass', 1200, 200, 0.5);
  }
  stroke(v = 0.5) {
    if (!this.ready) return;
    this.noiseHit(this.now, 0.35, 'bandpass', 260, 700, 0.07 * v, 0.9);
  }
  dash() {
    if (!this.ready) return;
    const t = this.now;
    this.noiseHit(t, 0.5, 'bandpass', 300, 2200, 0.5, 1.2);
    for (let i = 0; i < 4; i++) this.bubble(t + 0.05 + i * 0.06, 0.12);
  }
  crack() {
    if (!this.ready) return;
    const t = this.now;
    this.noiseHit(t, 0.06, 'highpass', 2500, 2000, 0.5);
    this.tone(t, 'triangle', 1800, 900, 0.05, 0.15);
  }
  chirp() {
    if (!this.ready) return;
    const t = this.now;
    this.tone(t, 'sine', 2200, 3000, 0.08, 0.06);
    this.tone(t + 0.1, 'sine', 2400, 3300, 0.08, 0.05);
  }
  dig() {
    if (!this.ready) return;
    this.noiseHit(this.now, 0.35, 'bandpass', 900, 500, 0.35, 0.8);
  }
  egg() {
    if (!this.ready) return;
    const t = this.now;
    this.tone(t, 'sine', 520, 380, 0.15, 0.15);
    this.pluck(t + 0.02, mtof(81 + [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)]), 0.03);
  }
  wave(v = 1) {
    if (!this.ready) return;
    const t = this.now;
    this.noiseHit(t, 2.2, 'lowpass', 3500, 300, 0.6 * v, 0.5);
    this.noiseHit(t + 0.1, 1.6, 'bandpass', 1500, 400, 0.3 * v, 0.6);
  }
  whale() {
    if (!this.ready) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.linearRampToValueAtTime(260, t + 1.4); o.frequency.linearRampToValueAtTime(140, t + 3.2);
    const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = 6;
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.8); g.gain.linearRampToValueAtTime(0, t + 3.4);
    o.connect(g).connect(this.revSend); o.connect(g).connect(this.musicBus);
    o.start(t); vib.start(t); o.stop(t + 3.5); vib.stop(t + 3.5);
  }
  dolphin(v = 0.5) {
    if (!this.ready) return;
    const ctx = this.ctx, t = this.now;
    // a rising, warbling whistle followed by a click train
    const o = ctx.createOscillator(); o.type = 'sine';
    const f0 = 3800 + Math.random() * 1500;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.7, t + 0.35);
    o.frequency.linearRampToValueAtTime(f0 * 1.2, t + 0.6);
    const vib = ctx.createOscillator(); vib.frequency.value = 18; const vg = ctx.createGain(); vg.gain.value = 180;
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06 * v, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.65);
    o.connect(g).connect(this.sfxBus);
    o.start(t); vib.start(t); o.stop(t + 0.7); vib.stop(t + 0.7);
    for (let i = 0; i < 10; i++) this.noiseHit(t + 0.75 + i * 0.035, 0.01, 'highpass', 5000, 4500, 0.12 * v);
  }
  heartbeat() {
    if (!this.ready) return;
    const t = this.now;
    this.tone(t, 'sine', 60, 40, 0.15, 0.5);
    this.tone(t + 0.22, 'sine', 55, 38, 0.15, 0.35);
  }
  chime() {
    if (!this.ready) return;
    const t = this.now;
    [62, 69, 74, 78].forEach((n, i) => this.pluck(t + i * 0.18, mtof(n), 0.08));
  }
  swell() {
    if (!this.ready) return;
    const t = this.now;
    this.noiseHit(t, 3.5, 'bandpass', 200, 1800, 0.2, 0.7);
  }
}
