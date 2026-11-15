import { SR, rng, midiToHz } from '../lib/audio.mjs';
import { noteSeed } from './synth/dsp.mjs';
import { hertzContact, modalBank, concatModes, biquad } from './metal/modal.mjs';
import { plateModes, BRONZE } from './gong/plate.mjs';

export const meta = {
  name: 'Gong',
  range: [28, 76],
  presets: ['tamtam', 'chau', 'small'],
};

export const RANGE = { velocity: [0.01, 1], duration: [0.1, 30] };

// a, h: radius and thickness of the plate (m) at the reference pitch `ref`. midi changes the
// radius, a ~ 2^(-(midi - ref) / 24), which moves every mode by 2^((midi - ref) / 12). With the
// thickness kept, a stroke deflects a large and a small plate by the same amount relative to the
// thickness, so the nonlinear behaviour stays the same over the range.
// kappa scales the Berger stretching, imp the hammered-in initial deflection (m).
const KIND = {
  tamtam: {
    ref: 36, a: 0.5, h: 1.8e-3, fAll: 450, keep: 760, fMax: 12000, r0: [0.18, 0.3],
    t60: (f) => 0.6 + 26 / (1 + f / 320), imp: 1e-3, kappa: 8e-2,
    mallet: { mass: 0.4, K: 2.5e6, e: 0.35 }, vMax: 5,
  },
  chau: {
    ref: 52, a: 0.32, h: 2.0e-3, fAll: 700, keep: 420, fMax: 10000, r0: [0, 0.04],
    t60: (f) => 0.4 + 9 / (1 + f / 600), imp: 1.5e-3, kappa: 4e-3,
    mallet: { mass: 0.25, K: 6e6, e: 0.4 }, vMax: 4.5, boss: true,
  },
  small: {
    ref: 64, a: 0.2, h: 1.2e-3, fAll: 900, keep: 520, fMax: 14000, r0: [0.15, 0.35],
    t60: (f) => 0.3 + 9 / (1 + f / 700), imp: 1.2e-3, kappa: 1e-2,
    mallet: { mass: 0.12, K: 8e6, e: 0.45 }, vMax: 5,
  },
};

// Level trim in dB at MIDI 28, 32, ..., 76 (linear in between), set so that the loudest of several
// seeds at velocity 0.2, 0.6 and 1 peaks near -3 dBFS at every pitch.
const TRIM = {
  tamtam: [3.1, 0.2, -0.9, -2.1, -3.6, -3.6, -5.7, -9.2, -9.2, -10.9, -16.1, -17.1, -18.6],
  chau: [-8.5, -11.3, -13.6, -15.6, -17.5, -19.0, -20.7, -21.7, -22.4, -22.5, -22.3, -21.8, -21.6],
  small: [-0.9, -2.9, -3.8, -6.8, -6.8, -9.5, -11.7, -11.7, -11.9, -13.8, -16.3, -17.1, -17.4],
};

function trimDb(preset, midi) {
  const t = TRIM[preset], u = (midi - 28) / 4, i = Math.min(t.length - 2, Math.floor(u));
  return t[i] + (t[i + 1] - t[i]) * (u - i);
}

function num(name, v, def, [lo, hi]) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`gong: ${name} must be a finite number, got ${String(v)}`);
  return Math.min(hi, Math.max(lo, v));
}

// The raised centre boss of a pitched gong: a stiff shallow dome whose own modes sit near
// 1 : 2 : 2.9 : 4 above the fundamental and ring much longer than the flat surround. The boss is
// given no initial deflection term: in the modal bank that term also adds linear stiffness, which
// would pull the fundamental away from its tuning. It still takes part in the stretching, so the
// pitch glides after a hard stroke.
function bossModes(f0, k1, M, rand) {
  const ratios = [1, 1.992, 2.89, 4.03, 5.21], amp = [1, 0.4, 0.22, 0.14, 0.08], t = [11, 7, 5, 3.5, 2.6];
  const s = { f: [], t60: [], m: [], gout: [], phi: [], kk: [], wq: [], imp0: [] };
  ratios.forEach((r, i) => {
    const f = Math.min(0.45 * SR, f0 * r * (1 + (i ? 0.004 * (rand() - 0.5) : 0)));
    s.f.push(f); s.t60.push(t[i] * Math.sqrt(150 / f0)); s.m.push(M * 0.06);
    s.phi.push(amp[i]); s.gout.push(2 * Math.PI * f * amp[i] * (i % 2 ? -1 : 1) * 1.2);
    s.kk.push(k1 * r * 1.6); s.wq.push(0.25);
    s.imp0.push(0);
  });
  return s;
}

export function render({ midi, velocity = 0.8, duration = 8, preset = 'tamtam', seed = 1 } = {}) {
  if (preset == null) preset = 'tamtam';
  if (!meta.presets.includes(preset)) throw new Error(`gong: unknown preset ${String(preset)}`);
  const K = KIND[preset];
  midi = Math.round(num('midi', midi, K.ref, meta.range));
  const vel = num('velocity', velocity, 0.8, RANGE.velocity);
  const dur = num('duration', duration, 8, RANGE.duration);
  seed = num('seed', seed, 1, [-Infinity, Infinity]);
  const r = rng(noteSeed(seed, [midi], `gong-${preset}`));
  const a = K.a * 2 ** (-(midi - K.ref) / 24);

  const r0 = K.r0[0] + (K.r0[1] - K.r0[0]) * r();
  let modes = plateModes({
    a, h: K.h, fMax: Math.min(K.fMax, 0.45 * SR), fAll: K.fAll * (K.a / a) ** 2, keep: K.keep, r0,
    t60: K.t60, imp: K.imp, rand: r, fMin: K.boss ? 1.25 * midiToHz(midi) : 18,
  });
  const M = BRONZE.rho * K.h * Math.PI * a * a;
  if (K.boss) {
    const k1 = modes.kk.length ? Math.min(...modes.kk) : 1;
    const boss = bossModes(midiToHz(midi), k1, M, r);
    const plate = modes;
    plate.gout = plate.gout.map((g) => g * 0.35);
    plate.phi = plate.phi.map((p) => p * 0.6 + 0.04 * (r() - 0.5));
    modes = concatModes(boss, plate);
    modes.imp0 = [...boss.imp0, ...plate.imp0];
  }

  const { E, rho, nu } = BRONZE;
  const coef = (K.kappa * E) / (2 * rho * (1 - nu * nu));
  const v = 0.3 + K.vMax * vel ** 1.3;
  const c = hertzContact({ mass: K.mallet.mass, K: K.mallet.K, v, e: K.mallet.e, maxMs: 60 });
  const drives = [{ start: 1, imp: c.imp, phi: Float64Array.from(modes.phi) }];
  const natural = Math.max(...modes.t60);
  const nMax = Math.round((Math.min(dur, natural) + 0.6) * SR);
  // Safety net: should a stroke ever drive the scheme unstable, it is redone with half the
  // stretching.
  let y;
  for (let tries = 0, c = coef; tries < 4; tries++, c /= 2) {
    y = modalBank(modes, drives, nMax, { berger: { coef: c, lpHz: 40 }, floorDb: -110 });
    if (y.every(Number.isFinite)) break;
    y = null;
  }
  if (!y) y = modalBank(modes, drives, nMax, { floorDb: -110 });
  y = biquad(biquad(y, 'hp', 30, 0.7), 'lp', 14000, 0.6);

  const g = 10 ** (trimDb(preset, midi) / 20);
  const muteAt = Math.round(dur * SR), muteTau = 0.12 * SR, muteIn = Math.round(0.04 * SR);
  let end = y.length;
  if (muteAt < y.length) end = Math.min(y.length, muteAt + Math.round(muteTau * 9.2));
  const out = new Float64Array(end);
  for (let i = 0; i < end; i++) {
    let env = 1;
    if (i > muteAt) { const u = i - muteAt; env = Math.exp(-(u < muteIn ? (u * u) / (2 * muteIn) : u - muteIn / 2) / muteTau); }
    out[i] = g * y[i] * env;
  }
  const fade = Math.min(end, Math.round(0.08 * SR));
  for (let i = 0; i < fade; i++) out[end - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
  for (let i = 0; i < 8 && i < end; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / 8);
  out[0] = 0; out[end - 1] = 0;
  return out;
}
