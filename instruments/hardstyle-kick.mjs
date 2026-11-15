import { SR, rng, midiToHz } from '../lib/audio.mjs';
import { butter, decimate, fadeOut } from './techno-kick/dsp.mjs';
import { sweepSine, stage, eq, riseAt, click } from './hardstyle-kick/parts.mjs';
import { seedInt } from './synth/dsp.mjs';

const OS = 8;

// Tone settings shared by a kick and, for reverse-bass, by the reversed swell.
const TONES = {
  euphoric: {
    pre: [['hp', 25, 0.7], ['peak', 160, 0.7, 3]],
    stages: [
      { type: 'soft', gain: 8, bias: 0.2, after: [['peak', 750, 1, 5]] },
      { type: 'soft', gain: 2 },
    ],
    post: [['peak', 90, 0.9, 2], ['peak', 350, 1, -2], ['lp', 4200, 0.6], ['lp', 7000, 0.7]],
  },
  raw: {
    pre: [['hp', 30, 0.7], ['peak', 250, 0.8, 4]],
    stages: [
      { type: 'soft', gain: 12, bias: 0.35, after: [['peak', 1300, 1.6, 9], ['lp', 9000, 0.7]] },
      { type: 'fold', gain: 1.7, bias: 0.1, after: [['hp', 60, 0.7]] },
      { type: 'clip', gain: 1.4 },
    ],
    post: [['peak', 400, 1, -2], ['peak', 3000, 1, 2], ['lp', 7000, 0.7], ['lp', 9000, 0.7]],
  },
  swell: {
    pre: [['hp', 25, 0.7], ['peak', 200, 0.7, 4]],
    stages: [
      { type: 'soft', gain: 8, bias: 0.25, after: [['peak', 900, 1.2, 6]] },
      { type: 'clip', gain: 1.2 },
    ],
    post: [['peak', 500, 1, -2], ['lp', 3500, 0.6], ['lp', 6000, 0.7]],
  },
};

const PRESETS = {
  euphoric: {
    tone: 'euphoric', oct: 3.2, tau: 0.018, chirp: 1.2, tauC: 0.0012,
    punch: 1, hold: 0.02, punchTau: 0.03, xAt: 0.006, xLen: 0.03, tail: 0.75,
    driveTau: 0.5, tailTau: 0.9, len: 0.5, release: 0.04, click: 0.3, clickF: 3500, level: 0.55,
  },
  raw: {
    tone: 'raw', oct: 3.6, tau: 0.024, chirp: 1.5, tauC: 0.0012,
    punch: 0.35, hold: 0.015, punchTau: 0.025, xAt: 0, xLen: 0.012, tail: 1,
    driveTau: 0.8, tailTau: 0.7, len: 0.45, release: 0.035, click: 0.3, clickF: 2800, level: 0.5,
  },
  'reverse-bass': {
    tone: 'euphoric', oct: 3.2, tau: 0.016, chirp: 1.2, tauC: 0.0012,
    punch: 1, hold: 0.018, punchTau: 0.028, xAt: 0.006, xLen: 0.025, tail: 0.7,
    driveTau: 0.25, tailTau: 0.12, release: 0.02, click: 0.3, clickF: 3500, level: 0.6,
    swell: { tone: 'swell', tailTau: 0.13, driveTau: 0.35, lift: 0.25, level: 0.85, fade: 0.004 },
  },
};

export const meta = {
  name: 'Hardstyle Kick',
  presets: Object.keys(PRESETS),
  range: [28, 52],
  oversampling: OS,
};

// Kick with punch and tail, `gate` seconds plus a raised-cosine release. With `swell` set it renders
// only the driven tail, without punch or click, for the reversed bass.
function voice(p, tone, { fT, vel, r, gate, release, os, swell }) {
  const fso = SR * os, total = gate + release;
  const n = Math.round(total * SR) * os;
  const osc = swell
    ? sweepSine(n, fso, fT, { oct: swell.lift, tau: 0.08, chirp: 0, tauC: 1 })
    : sweepSine(n, fso, fT, { oct: p.oct * (0.8 + 0.2 * vel), tau: p.tau * (1 + 0.03 * (2 * r() - 1)), chirp: p.chirp, tauC: p.tauC });

  const driveTau = swell ? swell.driveTau : p.driveTau, tailTau = swell ? swell.tailTau : p.tailTau;
  const d0 = 0.7 + 0.3 * vel, kd = Math.exp(-1 / (driveTau * fso));
  let x = new Float64Array(n), e = d0;
  for (let i = 0; i < n; i++) { x[i] = osc[i] * e; e *= kd; }
  x = eq(x, tone.pre, fso);
  for (const s of tone.stages) {
    x = stage(x, s);
    if (s.after) x = eq(x, s.after, fso);
  }

  const kt = Math.exp(-1 / (tailTau * fso)), kp = Math.exp(-1 / (p.punchTau * fso));
  const nh = Math.round(p.hold * fso);
  const y = new Float64Array(n);
  let et = 1, ep = 1;
  for (let i = 0; i < n; i++) {
    const t = i / fso;
    const xf = swell ? 1 : riseAt(t, p.xAt, p.xLen);
    y[i] = (swell ? 1 : p.tail) * x[i] * xf * et + (swell ? 0 : p.punch * osc[i] * ep);
    et *= kt;
    if (i >= nh) ep *= kp;
  }

  let out = decimate(y, os);
  out = eq(out, tone.post, SR);
  out = butter(out, 'hp', 24, 2);
  if (!swell) {
    const c = click(r, Math.min(out.length, Math.round(0.03 * SR)), { freq: p.clickF, tau: 0.003, tick: p.clickF * 0.6 });
    for (let i = 0; i < c.length; i++) out[i] += p.click * vel * c[i];
  }
  return out;
}

function edges(y, fadeIn, release) {
  const fi = Math.max(2, Math.round(fadeIn));
  for (let i = 0; i < Math.min(fi, y.length); i++) y[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
  y[0] = 0;
  return fadeOut(y, release);
}

export function render({ preset = 'euphoric', midi = 31, velocity = 0.9, seed = 1, duration, bpm = 150, oversample = OS } = {}) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset ${preset}`);
  const vel = Math.max(0.05, Math.min(1, velocity));
  const m = Math.max(meta.range[0] - 12, Math.min(meta.range[1] + 12, midi));
  const fT = midiToHz(m);
  const r = rng(seedInt(seed) * 7907 + Math.round(m) * 31 + 5);
  const gain = p.level * (0.25 + 0.75 * vel);

  if (!p.swell) {
    const gate = Math.max(0.08, duration ?? p.len);
    const y = voice(p, TONES[p.tone], { fT, vel, r, gate, release: p.release, os: oversample });
    for (let i = 0; i < y.length; i++) y[i] *= gain;
    return edges(y, 0.0003 * SR, p.release * SR);
  }

  // Kick on the beat, then the driven tail played backwards so it swells into the next beat.
  const beat = Math.max(0.16, duration ?? 60 / bpm);
  const half = Math.round((beat / 2) * SR);
  const k = voice(p, TONES[p.tone], { fT, vel, r, gate: beat / 2 - p.release, release: p.release, os: oversample });
  edges(k, 0.0003 * SR, p.release * SR);
  const s = voice(p, TONES[p.swell.tone], { fT, vel, r, gate: beat / 2, release: 0, os: oversample, swell: p.swell });
  s.reverse();
  // Reversing turns the high-pass inside out; a second pass keeps the swell free of DC.
  const sw = edges(butter(s, 'hp', 24, 2), 0.01 * SR, p.swell.fade * SR);
  const y = new Float64Array(Math.round(beat * SR));
  for (let i = 0; i < k.length && i < y.length; i++) y[i] += k[i];
  for (let i = 0; i < sw.length && half + i < y.length; i++) y[half + i] += p.swell.level * sw[i];
  for (let i = 0; i < y.length; i++) y[i] *= gain;
  y[0] = 0; y[y.length - 1] = 0;
  return y;
}
