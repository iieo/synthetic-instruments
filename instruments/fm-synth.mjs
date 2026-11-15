import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { decimate, dcBlock, fadeIn, fadeOut, ceilPeak, noteSeed, clamp, adsr } from './synth/dsp.mjs';
import { ALGORITHMS, bandwidths } from './fm-synth/algorithms.mjs';

// Operator fields: ratio to the note frequency, detune in cents, level (output amplitude for a
// carrier, peak modulation index in radians for a modulator), envelope, velocity sensitivity `vs`,
// key scaling `ks` (level falls as (f / 262 Hz)^-ks) and `kd` (decay time scales as (f / 262 Hz)^-kd).
const PRESETS = {
  epiano: {
    algorithm: 'two-stacks', feedback: 0,
    ops: {
      1: { ratio: 1, level: 0.75, env: { a: 0.001, d: 1.6, s: 0, r: 0.2 }, vs: 0.6, kd: 0.45 },
      2: { ratio: 1, level: 1.7, env: { a: 0.001, d: 0.5, s: 0.12, r: 0.2 }, vs: 0.9, ks: 0.35, kd: 0.4 },
      3: { ratio: 1, detune: 2.5, level: 0.32, env: { a: 0.001, d: 0.9, s: 0, r: 0.15 }, vs: 0.8, kd: 0.4 },
      4: { ratio: 14, level: 1.9, env: { a: 0.0005, d: 0.045, s: 0, r: 0.05 }, vs: 1, ks: 0.6 },
    },
  },
  bell: {
    algorithm: 'two-stacks', feedback: 0,
    ops: {
      1: { ratio: 1, level: 0.6, env: { a: 0.001, d: 4.5, s: 0, r: 1.2 }, vs: 0.5, kd: 0.5 },
      2: { ratio: 3.5, level: 2.4, env: { a: 0.001, d: 1.8, s: 0, r: 1 }, vs: 0.7, ks: 0.3, kd: 0.5 },
      3: { ratio: 2, detune: -4, level: 0.35, env: { a: 0.001, d: 2.2, s: 0, r: 1 }, vs: 0.5, kd: 0.5 },
      4: { ratio: 5.19, level: 1.6, env: { a: 0.001, d: 0.9, s: 0, r: 0.6 }, vs: 0.8, ks: 0.3, kd: 0.5 },
    },
  },
  bass: {
    algorithm: 'stack-plus', feedback: 0.55,
    ops: {
      1: { ratio: 1, level: 0.75, env: { a: 0.002, d: 1.2, s: 0.55, r: 0.08 }, vs: 0.4 },
      2: { ratio: 1, level: 2.6, env: { a: 0.001, d: 0.16, s: 0.3, r: 0.08 }, vs: 0.8, ks: 0.2 },
      3: { ratio: 3, level: 1.1, env: { a: 0.0005, d: 0.05, s: 0, r: 0.05 }, vs: 1 },
      4: { ratio: 1, detune: -3, level: 0.25, env: { a: 0.003, d: 0.6, s: 0.4, r: 0.08 }, vs: 0.6 },
    },
  },
  brass: {
    algorithm: 'two-stacks', feedback: 0.35, pitchAttack: -0.35, vibrato: 0.08,
    ops: {
      1: { ratio: 1, level: 0.6, env: { a: 0.035, d: 0.5, s: 0.8, r: 0.12 }, vs: 0.5 },
      2: { ratio: 1, level: 2.4, env: { a: 0.07, d: 0.35, s: 0.65, r: 0.12 }, vs: 0.9, ks: 0.25 },
      3: { ratio: 1, detune: 4, level: 0.38, env: { a: 0.05, d: 0.5, s: 0.8, r: 0.12 }, vs: 0.5 },
      4: { ratio: 1, level: 1.3, env: { a: 0.09, d: 0.4, s: 0.6, r: 0.12 }, vs: 0.8, ks: 0.25 },
    },
  },
  marimba: {
    algorithm: 'two-stacks', feedback: 0,
    ops: {
      1: { ratio: 1, level: 0.8, env: { a: 0.0008, d: 0.55, s: 0, r: 0.08 }, vs: 0.5, kd: 0.7 },
      2: { ratio: 4, level: 1.1, env: { a: 0.0005, d: 0.035, s: 0, r: 0.03 }, vs: 1, ks: 0.4, kd: 0.4 },
      3: { ratio: 3.93, level: 0.16, env: { a: 0.0008, d: 0.1, s: 0, r: 0.05 }, vs: 0.8, kd: 0.6 },
      4: { ratio: 9.9, level: 0.6, env: { a: 0.0003, d: 0.012, s: 0, r: 0.02 }, vs: 1, ks: 0.4 },
    },
  },
};

export const meta = { name: 'FM Synth', range: [28, 103], presets: Object.keys(PRESETS), algorithms: Object.keys(ALGORITHMS) };

// Fixed output scale: worst key over all presets, algorithms, brightness extremes and velocities
// peaks near -1 dBFS.
const OUT_GAIN = 0.9;
const PRESET_GAIN = { epiano: 0.83, bell: 0.9, bass: 0.74, brass: 0.74, marimba: 1 };
// Spread of every carrier after Carson's rule is kept below 30 kHz: sidebands far above hearing
// only make the onsets of high notes harsh, which is why FM voices scale their indices down with
// pitch. Rendering runs at 2x (96 kHz); content folds into the audio band only above
// 96 kHz - 20.5 kHz = 75.5 kHz, which leaves room for the weak outer sidebands Carson leaves out.
const OS = 2, MAX_BW = 30000;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`fm-synth: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

function pick(name, v, def, list) {
  if (v === undefined || v === null) return def;
  if (!list.includes(v)) throw new Error(`fm-synth: unknown ${name} ${v}, use one of ${list.join(', ')}`);
  return v;
}

/**
 * One note. `algorithm` swaps the operator wiring of the preset; `brightness` (0..1, default 0.5)
 * scales every modulation index by 0.5 to 2. `duration` is the gate time; the release follows.
 */
export function render({ midi = 60, velocity = 0.8, duration = 1, seed = 1, preset = 'epiano', algorithm, brightness = 0.5 } = {}) {
  const pid = pick('preset', preset, 'epiano', meta.presets), P = PRESETS[pid];
  midi = num('midi', midi, 60, ...meta.range);
  const vel = num('velocity', velocity, 0.8, 0, 1);
  duration = num('duration', duration, 1, 0.01, 60);
  num('seed', seed, 1, -Infinity, Infinity);
  const bright = num('brightness', brightness, 0.5, 0, 1);
  const alg = ALGORITHMS[pick('algorithm', algorithm, P.algorithm, meta.algorithms)];

  const rand = rng(noteSeed(seed, [midi], 'fm-synth'));
  const f0 = midiToHz(midi), kf = f0 / 261.63;
  const isCarrier = (k) => alg.out.includes(k);
  const ops = [null];
  const freqs = [0], index = [0];
  for (let k = 1; k <= 4; k++) {
    const o = P.ops[k];
    const f = f0 * o.ratio * 2 ** ((o.detune || 0) / 1200);
    const velGain = 1 - (o.vs || 0) + (o.vs || 0) * vel;
    let level = o.level * velGain * kf ** -(o.ks || 0);
    if (!isCarrier(k)) level *= 2 ** ((bright - 0.5) * 2);
    // A carrier far up (an operator meant as a modulator, wired as a carrier) is tamed above 6 kHz.
    else level /= 1 + (f / 6000) ** 2;
    // A modulator above 0.45 fs would alias by itself; it only adds sidebands far above hearing anyway.
    if (f >= 0.45 * SR * OS) level = 0;
    const env = { ...o.env, d: o.env.d * kf ** -(o.kd || 0) };
    ops.push({ f, level, env, carrier: isCarrier(k) });
    freqs.push(f); index.push(isCarrier(k) ? 0 : level);
  }
  let fb = (P.feedback || 0) * 2 ** ((bright - 0.5) * 2) * (0.6 + 0.4 * vel);
  fb = Math.min(fb, 1.6);

  // Index limit: scale all modulation down together until the widest carrier fits.
  const widest = (s) => {
    const idx = index.map((x) => x * s);
    const B = bandwidths(alg, freqs, idx, fb * s);
    return Math.max(...alg.out.map((k) => B[k]));
  };
  let scale = 1;
  const fs = SR * OS;
  if (widest(1) > MAX_BW) {
    let lo = 0, hi = 1;
    for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (widest(m) > MAX_BW) hi = m; else lo = m; }
    scale = lo;
  }
  fb *= scale;

  const rel = Math.max(...alg.out.map((k) => ops[k].env.r));
  const pre = Math.round(0.0015 * fs);
  const n = pre + Math.round((duration + rel + 0.01) * fs);
  const envs = ops.map((o) => o && adsr({ ...o.env, gate: duration }));
  const amp = ops.map((o, k) => o && (o.carrier ? o.level : o.level * scale));
  const ph = ops.map(() => rand());
  const dph = freqs.map((f) => f / fs);
  const y = [0, 0, 0, 0, 0];
  let fb1 = 0, fb2 = 0;
  const modsOf = [[], [], [], [], []];
  for (const [m, t] of alg.mods) modsOf[t].push(m);
  const out = new Float64Array(n);
  const carriers = alg.out;
  const norm = 1 / Math.max(1, carriers.reduce((s, k) => s + ops[k].level, 0) / 0.9);
  const TWO_PI = 2 * Math.PI;
  for (let i = pre; i < n; i++) {
    const t = (i - pre) / fs;
    let bend = 1;
    if (P.pitchAttack) bend *= 2 ** ((P.pitchAttack * Math.exp(-t / 0.03)) / 12);
    if (P.vibrato) bend *= 2 ** ((P.vibrato * clamp((t - 0.3) / 0.4, 0, 1) * Math.sin(TWO_PI * 5.2 * t)) / 12);
    for (let k = 4; k >= 1; k--) {
      let pm = 0;
      for (const m of modsOf[k]) pm += y[m];
      if (k === 4 && fb > 0) pm += fb * 0.5 * (fb1 + fb2);
      const e = envs[k](t);
      const s = Math.sin(TWO_PI * ph[k] + pm);
      y[k] = amp[k] * e * s;
      if (k === 4) { fb2 = fb1; fb1 = e * s; }
      ph[k] += dph[k] * bend; if (ph[k] >= 1) ph[k] -= 1;
    }
    let acc = 0;
    for (const k of carriers) acc += y[k];
    out[i] = acc * norm;
  }
  const res = decimate(out, OS);
  dcBlock(res, 8);
  const g = OUT_GAIN * PRESET_GAIN[pid];
  for (let i = 0; i < res.length; i++) res[i] *= g;
  fadeIn([res], 0.001);
  fadeOut([res], 0.003);
  ceilPeak([res], -1);
  return res;
}
