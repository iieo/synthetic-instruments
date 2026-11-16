import { rng } from '../../lib/audio.mjs';
import { SVF } from '../synth/dsp.mjs';

// Instrument samples, synthesized and quantised to signed 8 bit like a tracker module's sample
// bank. Each preset builds octave copies (oct 0, 1, 2, ...): loops get half as many bytes per
// cycle, one-shots are re-made an octave higher at the same rate, as multi-octave instrument files
// of the time stored them. `spc` is samples per cycle of the root pitch.
export const CLK = 3546895;
export const BASE_PERIOD = 214;
const RS = CLK / BASE_PERIOD;
const TAU = 2 * Math.PI;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function to8(x, gain = 0.99) {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  const d = new Int8Array(x.length), g = p > 0 ? gain * 127 / p : 0;
  for (let i = 0; i < x.length; i++) d[i] = Math.max(-128, Math.min(127, Math.round(x[i] * g)));
  return d;
}

// One cycle-periodic sum of harmonics over `len` samples with `cycles` cycles (phases from ph).
function harmonics(len, cycles, amp, ph = () => 0) {
  const y = new Float64Array(len), K = Math.floor(len / cycles / 2) - 1;
  for (let k = 1; k <= K; k++) {
    const a = amp(k);
    if (!a) continue;
    const w = TAU * k * cycles / len, p = ph(k);
    for (let i = 0; i < len; i++) y[i] += a * Math.sin(w * i + p);
  }
  return y;
}

const ramp = (y, n) => { for (let i = 0; i < Math.min(n, y.length); i++) y[i] *= i / n; return y; };
const tailOff = (y, n) => { const L = y.length; for (let i = 0; i < Math.min(n, L); i++) y[L - 1 - i] *= i / n; return y; };

function looped(attack, loop) {
  const x = new Float64Array(attack.length + loop.length);
  x.set(attack); x.set(loop, attack.length);
  return x;
}

// Three detuned voices in one loop: voice j runs m + j cycles while the loop runs m, so the
// beating repeats exactly at the loop seam.
function ensemble(spc, m, amp) {
  const len = spc * m, y = new Float64Array(len);
  for (const [dm, g, p0] of [[-1, 0.8, 0.3], [0, 1, 0], [1, 0.8, 1.1]]) {
    const v = harmonics(len, m + dm, amp, (k) => p0 * k);
    for (let i = 0; i < len; i++) y[i] += g * v[i];
  }
  return y;
}

const sawAmp = (roll) => (k) => (1 / k) / Math.sqrt(1 + (k / roll) ** 4);

export const PRESETS = {
  bass: {
    root: null, octaves: 4, release: 8,
    build(o) {
      const spc = 64 >> o, att = [];
      for (let c = 0; c < 6; c++) {
        const hc = 2.5 + 12 * Math.exp(-c / 1.6);
        att.push(harmonics(spc, 1, (k) => (1 / k) / Math.sqrt(1 + (k / hc) ** 6) * (1 + 0.6 * Math.exp(-((k - hc) ** 2) / 2))));
      }
      const loop = harmonics(spc, 1, (k) => (1 / k) / Math.sqrt(1 + (k / 2.5) ** 6) * (k === 1 ? 1.25 : 1));
      const a = new Float64Array(spc * 6);
      att.forEach((c, j) => a.set(c, j * spc));
      return { x: ramp(looped(a, loop), 2), loopStart: spc * 6, loopLen: spc, spc };
    },
  },
  strings: {
    root: null, octaves: 4, release: 3,
    build(o) {
      const spc = 64 >> o, m = 48;
      const loop = ensemble(spc, m, sawAmp(9));
      const att = Float64Array.from(loop, (v, i) => v * (i / loop.length) ** 1.5);
      return { x: looped(att, loop), loopStart: loop.length, loopLen: loop.length, spc };
    },
  },
  choir: {
    root: null, octaves: 5, release: 3,
    build(o) {
      const spc = 128 >> o, fRef = 220 * 2 ** o;
      const F = [[730, 90, 1], [1090, 110, 0.5], [2440, 160, 0.25], [3400, 250, 0.08]];
      const amp = (k) => {
        const f = k * fRef;
        let a = 0;
        for (const [fc, bw, g] of F) a += g / (1 + ((f - fc) / (bw / 2)) ** 2);
        return (a + 0.02) / Math.sqrt(k);
      };
      const loop = ensemble(spc, 40, amp);
      const att = Float64Array.from(loop, (v, i) => v * (i / loop.length) ** 1.2);
      return { x: looped(att, loop), loopStart: loop.length, loopLen: loop.length, spc };
    },
  },
  piano: {
    root: 60, octaves: 4, release: 6,
    build(o) {
      const f = hz(60) * 2 ** o, spc = RS / f, dur = 1.6 / (1 + 0.45 * o), n = Math.round(dur * RS);
      const y = new Float64Array(n), B = 0.00035;
      for (let k = 1; k < 40; k++) {
        const fk = k * f * Math.sqrt(1 + B * k * k);
        if (fk > 0.45 * RS) break;
        const a = Math.abs(Math.sin(Math.PI * k / 7.3)) / k ** 1.1, tau = 1.1 / (1 + 0.3 * k + 0.4 * o), w = TAU * fk / RS;
        for (let i = 0; i < n; i++) y[i] += a * Math.sin(w * i) * (0.7 * Math.exp(-i / (tau * RS)) + 0.3 * Math.exp(-i / (0.08 * tau * RS)));
      }
      return { x: tailOff(ramp(y, 12), Math.round(0.03 * RS)), loopStart: 0, loopLen: 0, spc };
    },
  },
  lead: {
    root: null, octaves: 4, release: 6, vibrato: { delay: 15, speed: 6, depth: 0.011 },
    build(o) {
      const spc = 64 >> o, pw = 0.25;
      const loop = harmonics(spc, 1, (k) => 2 * Math.sin(Math.PI * k * pw) / (Math.PI * k) / Math.sqrt(1 + (k / 14) ** 4), () => Math.PI / 2);
      return { x: ramp(looped(new Float64Array(0), loop), 1), loopStart: 0, loopLen: spc, spc };
    },
  },
  chip: {
    root: null, octaves: 3, release: 8,
    build(o) {
      const base = [];
      for (let i = 0; i < 32; i++) base.push(i < 12 ? 0.8 : i < 16 ? 0.3 : i < 28 ? -0.8 : -0.3);
      const step = 1 << o, x = Float64Array.from({ length: 32 / step }, (_, i) => base[i * step]);
      return { x, loopStart: 0, loopLen: x.length, spc: x.length, raw: true };
    },
  },
  'orchestra-hit': {
    root: 60, octaves: 4, release: 8,
    build(o, r) {
      const f = hz(60) * 2 ** o, spc = RS / f, n = Math.round(0.85 * RS), y = new Float64Array(n);
      for (const [ratio, g] of [[0.5, 0.7], [1, 1], [1.5, 0.8], [2, 0.7], [2.52, 0.5], [3, 0.4]]) {
        const fv = f * ratio * (1 + 0.004 * (2 * r() - 1)), p0 = r() * TAU, ph = new Float64Array(n), env = new Float64Array(n);
        let acc = p0;
        for (let i = 0; i < n; i++) {
          const t = i / RS;
          ph[i] = acc; env[i] = 0.75 * Math.exp(-t / 0.11) + 0.25 * Math.exp(-t / 0.45);
          acc += TAU * fv / RS * (1 - 0.035 * Math.exp(-t / 0.03));
        }
        for (let k = 1; k * fv < 0.45 * RS && k < 40; k++) {
          const a = g / k / Math.sqrt(1 + (k / 8) ** 2);
          for (let i = 0; i < n; i++) y[i] += a * Math.sin(k * ph[i]) * env[i];
        }
      }
      const s = new SVF(RS); s.set(2500, 0.8);
      for (let i = 0; i < Math.round(0.05 * RS); i++) { s.tick(2 * r() - 1); y[i] += 1.5 * s.k * s.bp * Math.exp(-i / (0.012 * RS)); }
      return { x: tailOff(ramp(y, 4), Math.round(0.03 * RS)), loopStart: 0, loopLen: 0, spc };
    },
  },
  'drum-kick': {
    root: 60, octaves: 4, release: 8,
    build(o) {
      const k = 2 ** o, n = Math.round(0.45 / k ** 0.5 * RS), y = new Float64Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / RS;
        y[i] = Math.sin(ph) * Math.exp(-t / 0.16) * Math.min(1, i / 8);
        ph += TAU * k * (48 + 130 * Math.exp(-t / 0.03)) / RS;
      }
      return { x: tailOff(y, Math.round(0.02 * RS)), loopStart: 0, loopLen: 0, spc: RS / hz(60) / k };
    },
  },
  'drum-snare': {
    root: 60, octaves: 4, release: 8,
    build(o, r) {
      const k = 2 ** o, n = Math.round(0.3 * RS), y = new Float64Array(n);
      const s = new SVF(RS); s.set(Math.min(0.42 * RS, 4500 * k), 0.6);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / RS;
        s.tick(2 * r() - 1);
        y[i] = 0.6 * Math.sin(ph) * Math.exp(-t / 0.045) + (s.hp + 0.6 * s.k * s.bp) * (0.7 * Math.exp(-t / 0.08) + 0.3 * Math.exp(-t / 0.015));
        y[i] *= Math.min(1, i / 6);
        ph += TAU * k * 190 * (1 + 0.3 * Math.exp(-t / 0.01)) / RS;
      }
      return { x: tailOff(y, Math.round(0.02 * RS)), loopStart: 0, loopLen: 0, spc: RS / hz(60) / k };
    },
  },
};

// Fixed bank: noisy one-shots use a fixed recording seed, like a sample stored in the module.
export function sample(preset, o) {
  const P = PRESETS[preset], b = P.build(o, rng(0x5a17 + 977 * o));
  const d = b.raw ? Int8Array.from(b.x, (v) => Math.round(v * 127)) : to8(b.x);
  return { data: d, loopStart: b.loopStart, loopLen: b.loopLen, spc: b.spc };
}
