import { FRAME_HZ, REG_MAX, hzToReg, regToHz } from './chip.mjs';

export const CHORDS = { major: [0, 4, 7, 12], minor: [0, 3, 7, 12], sus4: [0, 5, 7, 12], power: [0, 7, 12, 19] };

const semis = (f, s) => f * 2 ** (s / 12);
const ramp = (k, k0, n) => Math.min(1, Math.max(0, (k - k0) / n));
// Software vibrato of the player routine: one frequency write per frame, so it moves in steps.
const vib = (k, delay, depth, rate) => depth * ramp(k, delay, 12) * Math.sin(2 * Math.PI * rate * k / FRAME_HZ);
// The frequency register ends at 3750 Hz. Like the player routines did, a helper voice that would
// go past it drops by octaves, so the note keeps its pitch instead of sticking at the top.
const TOP = regToHz(REG_MAX);
const fit = (f) => { while (f > TOP) f /= 2; return f; };
const tri = (k, period) => { const p = (k % period) / period; return p < 0.5 ? 4 * p - 1 : 3 - 4 * p; };

// A preset is a player routine: `setup` writes the registers before the note, `frame(k)` runs
// once per frame. `gated` voices get their gate bit cleared at the note-off frame; `oneShot` gives
// the gate length in frames for drums that ignore the note length. Defaults for the options:
// filter (cutoff 0..1), resonance (0..1), pw (pulse width 0..1).
export const PRESETS = {
  bass: {
    filter: 0.12, resonance: 0.55, pw: 0.3, gated: [0, 1],
    setup(c, o) {
      c.mode('lp');
      const [a, b] = c.v;
      a.wave('saw'); a.env(0, 9, 9, 3); a.hz(o.f0); a.filt = true;
      b.wave('pulse'); b.env(0, 9, 9, 3); b.freq = Math.min(0xffff, hzToReg(o.f0) + Math.max(1, Math.round(hzToReg(o.f0) * 0.0015))); b.pw = o.pw; b.filt = true;
    },
    frame(k, c, o) { c.cut = o.cut + Math.round(o.envAmt * 900 * 0.7 ** k); c.v[1].pw = o.pw + Math.round(300 * Math.sin(k * 0.2)); },
  },
  lead: {
    filter: 0.75, resonance: 0.2, pw: 0.25, gated: [0],
    setup(c, o) {
      c.mode('lp');
      const a = c.v[0];
      a.wave('pulse'); a.env(1, 8, 11, 4); a.hz(o.f0); a.pw = o.pw; a.filt = true;
    },
    frame(k, c, o) {
      const a = c.v[0];
      a.hz(semis(o.f0, vib(k, 10, 0.35, 5.5)));
      a.pw = o.pw + Math.round(o.pwmDepth * tri(k, 40));
    },
  },
  'sync-lead': {
    filter: 0.8, resonance: 0.25, pw: 0.5, gated: [1],
    setup(c, o) {
      c.mode('lp');
      const [src, a] = c.v;
      src.wave('tri'); src.env(0, 0, 0, 0); src.hz(o.f0);
      a.wave('saw'); a.sync = true; a.env(0, 8, 12, 4); a.filt = true;
    },
    frame(k, c, o) {
      const v = vib(k, 12, 0.3, 5.5);
      c.v[0].hz(semis(o.f0, v));
      // The synced oscillator sweeps from about three times down towards 1.5 times the note.
      // Near the top the sweep is squeezed into the room left below the register limit.
      const f = semis(o.f0, v), room = Math.min(1, (TOP / f - 1) / 2.45);
      c.v[1].hz(f * (1 + room * (0.5 + 1.7 * 0.93 ** k + 0.25 * Math.sin(2 * Math.PI * 0.7 * k / FRAME_HZ))));
    },
  },
  'ring-bell': {
    filter: 0.9, resonance: 0.1, pw: 0.5, gated: [0, 1],
    setup(c, o) {
      c.mode('lp');
      const [a, b, src] = c.v;
      a.wave('tri'); a.ring = true; a.env(0, 10, 0, 10); a.hz(o.f0); a.filt = true;
      // Above the register limit the modulator moves down by two note frequencies: the upper
      // sideband stays at 1.76 times the note, so the bell keeps its main partials.
      src.wave('tri'); src.env(0, 0, 0, 0); src.hz(o.f0 * 2.76 > TOP ? o.f0 * 0.76 : o.f0 * 2.76);
      b.wave('tri'); b.env(0, 6, 0, 6); b.hz(fit(o.f0 * 2)); b.filt = true;
    },
    frame() {},
  },
  arp: {
    filter: 0.7, resonance: 0.3, pw: 0.4, gated: [0],
    setup(c, o) {
      c.mode('lp');
      const a = c.v[0];
      a.wave('pulse'); a.env(0, 9, 10, 3); a.pw = o.pw; a.filt = true; a.hz(o.f0);
    },
    frame(k, c, o) {
      const ch = o.chord;
      c.v[0].hz(fit(semis(o.f0, ch[k % ch.length])));
      c.v[0].pw = o.pw + Math.round(o.pwmDepth * tri(k, 24));
    },
  },
  pad: {
    filter: 0.35, resonance: 0.35, pw: 0.35, gated: [0, 1, 2],
    setup(c, o) {
      c.mode('lp');
      const [a, b, d] = c.v;
      a.wave('pulse'); a.env(10, 10, 12, 10); a.hz(o.f0); a.pw = o.pw; a.filt = true;
      b.wave('pulse'); b.env(11, 10, 12, 10); b.freq = Math.min(0xffff, hzToReg(o.f0) + Math.max(1, Math.round(hzToReg(o.f0) * 0.003))); b.pw = o.pw; b.filt = true;
      d.wave('tri'); d.env(10, 10, 12, 10); d.hz(o.f0 / 2); d.filt = true;
    },
    frame(k, c, o) {
      c.v[0].pw = o.pw + Math.round(o.pwmDepth * Math.sin(2 * Math.PI * 0.45 * k / FRAME_HZ));
      c.v[1].pw = o.pw + Math.round(o.pwmDepth * Math.sin(2 * Math.PI * 0.31 * k / FRAME_HZ + 2));
      c.cut = o.cut + Math.round(o.envAmt * 350 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 0.12 * k / FRAME_HZ)));
    },
  },
  combo: {
    filter: 0.85, resonance: 0.15, pw: 0.45, gated: [0, 1],
    setup(c, o) {
      c.mode('lp');
      const [a, b] = c.v;
      a.wave(['saw', 'tri']); a.env(0, 9, 10, 4); a.hz(o.f0); a.filt = true;
      b.wave(['pulse', 'tri']); b.env(0, 8, 8, 4); b.hz(fit(o.f0 * 2)); b.pw = o.pw; b.filt = true;
    },
    frame(k, c, o) { c.v[1].pw = o.pw + Math.round(o.pwmDepth * tri(k, 60)); },
  },
  'drum-kick': {
    filter: 0.25, resonance: 0.3, pw: 0.5, oneShot: 9,
    setup(c, o) {
      c.mode('lp');
      const a = c.v[0];
      a.env(0, 8, 0, 6); a.filt = true;
      a.wave('noise'); a.hz(3000);
    },
    // Frame 0 is a noise click, then a triangle whose frequency falls each frame.
    frame(k, c, o) {
      const a = c.v[0];
      if (k === 0) return;
      a.wave(k === 1 ? 'pulse' : 'tri');
      a.hz(o.f0 * (1 + 4 * 0.45 ** (k - 1)));
      c.cut = o.cut + Math.round(o.envAmt * 600 * 0.6 ** k);
    },
  },
  'drum-snare': {
    filter: 0.7, resonance: 0.2, pw: 0.5, oneShot: 7,
    setup(c, o) {
      c.mode(['lp', 'hp']);
      const a = c.v[0];
      a.env(0, 7, 0, 7); a.filt = true;
      a.wave('tri'); a.hz(o.f0 * 1.4);
    },
    frame(k, c, o) {
      const a = c.v[0];
      if (k === 0) return;
      if (k === 1) { a.hz(o.f0); return; }
      a.wave('noise'); a.hz(Math.min(3700, o.f0 * 17));
    },
  },
};
