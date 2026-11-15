import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { SVF, clamp, decimate, dcBlock, fadeIn, fadeOut, adsr, pitchCurve, noteSeed, ceilPeak } from './synth/dsp.mjs';
import { sawStack, airLayer, Drive } from './supersaw/stack.mjs';

export const meta = { name: 'Supersaw', presets: ['lead', 'anthem', 'pad', 'hardlead'], range: [36, 96] };

const OS = 4, FS = SR * OS;

// layers: [semitones, level, voices, spread in cents]
const PRESETS = {
  lead: {
    layers: [[0, 1, 7, 26]], width: 0.9, air: 0.35,
    amp: { a: 0.004, d: 0.4, s: 0.78, r: 0.16 },
    cut: 700, track: 2.2, envAmt: 7500, envT: 0.28, q: 0.9,
    vib: { rate: 5.6, depth: 0.12, delay: 0.3 }, glide: 0.035, gain: 0.43,
  },
  anthem: {
    layers: [[0, 1, 7, 30], [12, 0.6, 7, 34], [7, 0.42, 5, 22]], width: 1, air: 0.45,
    amp: { a: 0.006, d: 0.6, s: 0.85, r: 0.32 },
    cut: 1000, track: 2.5, envAmt: 8500, envT: 0.4, q: 0.8,
    vib: { rate: 5.2, depth: 0.08, delay: 0.45 }, glide: 0.04, gain: 0.32,
  },
  pad: {
    layers: [[0, 1, 9, 20], [-12, 0.45, 5, 12]], width: 1, air: 0.55,
    amp: { a: 0.75, d: 2.5, s: 0.9, r: 1.3 },
    cut: 450, track: 1.2, envAmt: 2200, envT: 1.1, rise: true, q: 0.75,
    vib: { rate: 0.18, depth: 0.04, delay: 0 }, glide: 0.08, gain: 0.385,
  },
  hardlead: {
    layers: [[0, 1, 7, 38], [12, 0.35, 3, 18]], width: 0.75, air: 0.3,
    amp: { a: 0.003, d: 0.3, s: 0.82, r: 0.12 },
    cut: 1600, track: 3, envAmt: 9000, envT: 0.22, q: 1.1,
    drive: { pre: 3.2, bias: 0.18, peakHz: 1300, peakQ: 1.6, peakGain: 1.4, post: 7500 },
    vib: { rate: 6.2, depth: 0.1, delay: 0.25 }, glide: 0.025, gain: 0.245,
  },
};

export function render({ preset = 'lead', midi = 69, chord, velocity = 0.8, duration = 0.5, seed = 1, bend, glide, from = 0 }) {
  const P = PRESETS[preset];
  if (!P) throw new Error(`unknown preset ${preset}`);
  const notes = chord && chord.length ? [...chord] : [midi];
  const v = clamp(velocity, 0.05, 1), gate = Math.max(0.02, duration);
  const r = rng(noteSeed(seed, notes, preset));
  const n = Math.round((gate + P.amp.r + 0.06) * FS);

  const { rate, depth, delay } = P.vib;
  const vibPh = r();
  const extra = (t) => depth * clamp((t - delay) / 0.4, 0, 1) * Math.sin(2 * Math.PI * (rate * t + vibPh));
  const pm = pitchCurve(n, FS, { bend, glide: glide ?? P.glide, from, extra });

  const L = new Float64Array(n), R = new Float64Array(n);
  const noteLvl = 1 / Math.sqrt(notes.length);
  for (const m of notes) {
    for (const [semi, lvl, voices, spread] of P.layers) {
      sawStack(L, R, { fs: FS, f0: midiToHz(m + semi), pm, r, voices, spread, width: P.width, level: lvl * noteLvl });
    }
  }

  const f0 = midiToHz(Math.min(...notes));
  const env = adsr({ ...P.amp, gate });
  const fl = [new SVF(FS), new SVF(FS)], fr = [new SVF(FS), new SVF(FS)];
  const drv = P.drive && [new Drive(FS, P.drive), new Drive(FS, P.drive)];
  const envAmt = P.envAmt * (0.35 + 0.65 * v * v), base = P.cut + P.track * f0;
  const q2 = 0.54;
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    if (i % 16 === 0) {
      const e = P.rise ? 1 - Math.exp(-t / P.envT) : Math.exp(-t / P.envT);
      const fc = Math.min(base + envAmt * e, 19000);
      fl[0].set(fc, P.q); fl[1].set(fc, q2); fr[0].set(fc, P.q); fr[1].set(fc, q2);
    }
    let a = L[i], b = R[i];
    if (drv) { a = drv[0].tick(a); b = drv[1].tick(b); }
    const g = env(t) * (0.55 + 0.45 * v);
    L[i] = fl[1].tick(fl[0].tick(a)) * g;
    R[i] = fr[1].tick(fr[0].tick(b)) * g;
  }

  const out = [decimate(L, OS), decimate(R, OS)];
  airLayer(out[0], out[1], P.air);
  for (const x of out) { dcBlock(x); for (let i = 0; i < x.length; i++) x[i] *= P.gain; }
  fadeIn(out, 0.001);
  fadeOut(out, 0.02);
  return ceilPeak(out);
}
