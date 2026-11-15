import { SR, rng } from '../lib/audio.mjs';
import { seedInt, decimate } from './synth/dsp.mjs';
import { biquad, edges, trimTail } from './drums/dsp.mjs';
import { plateModes } from './cajon/plate.mjs';
import { simulate } from './cajon/sim.mjs';

export const meta = {
  name: 'Cajon',
  voices: ['bass', 'tone', 'slap', 'tip', 'ghost'],
  sizes: ['small', 'standard', 'large'],
};

const OS = 2, FS = SR * OS;
const RHO_AIR = 1.2, C_AIR = 343;
const WOOD = { rho: 680, E1: 6e9, E2: 11e9, G12: 0.6e9, nu12: 0.04 };
const F_MAX = 9000, F_TAPER = 6000, F_CAV = 2000;
// Fixed output scale: the loudest stroke over all voices, sizes, options and seeds at velocity 1 peaks
// near -3 dBFS (bass, large box).
const OUT_GAIN = 0.00293;

// Tapa width a, height b, box depth D, tapa thickness h, sound hole radius rp, back panel thickness tw.
const SIZES = {
  small: { a: 0.28, b: 0.42, D: 0.27, h: 0.0025, rp: 0.05, tw: 0.009 },
  standard: { a: 0.30, b: 0.46, D: 0.29, h: 0.0026, rp: 0.06, tw: 0.009 },
  large: { a: 0.32, b: 0.5, D: 0.31, h: 0.0028, rp: 0.065, tw: 0.01 },
};

// Hand strokes as up to two contacts: the stiff finger bones give a short pulse, the fleshy palm a
// longer push. Position as fraction of width and of height from the bottom, contact patch radius in
// metres, contact time in seconds, peak force at velocity 1 in newtons, onset delay in seconds.
const VOICES = {
  bass: [{ x: 0.5, y: 0.5, r: 0.07, T: 0.0065, F: 260, d: 0 }, { x: 0.5, y: 0.66, r: 0.03, T: 0.0012, F: 14, d: 0.0004 }],
  tone: [{ x: 0.5, y: 0.86, r: 0.025, T: 0.0006, F: 60, d: 0 }, { x: 0.5, y: 0.72, r: 0.05, T: 0.0028, F: 170, d: 0.0003 }],
  slap: [{ x: 0.5, y: 0.95, r: 0.02, T: 0.00035, F: 160, d: 0 }, { x: 0.5, y: 0.8, r: 0.05, T: 0.0016, F: 120, d: 0.0003 }],
  tip: [{ x: 0.32, y: 0.9, r: 0.01, T: 0.0005, F: 90, d: 0 }],
  ghost: [{ x: 0.68, y: 0.86, r: 0.01, T: 0.0009, F: 35, d: 0 }],
};
const LEN = { bass: 1.1, tone: 0.9, slap: 0.8, tip: 0.7, ghost: 0.6 };

const geo = new Map();
function geometry(size) {
  if (geo.has(size)) return geo.get(size);
  const g = SIZES[size];
  const cavity = [];
  for (let l = 0; l < 4; l++) for (let m = 0; m < 4; m++) for (let n = 0; n < 4; n++) {
    if (l + m + n === 0) continue;
    const f = (C_AIR / 2) * Math.hypot(l / g.a, m / g.b, n / g.D);
    if (f < 800) cavity.push({ l, m, n, f, lam: (l ? 0.5 : 1) * (m ? 0.5 : 1) * (n ? 0.5 : 1) });
  }
  cavity.sort((p, q) => p.f - q.f);
  const cav = cavity.slice(0, 4);
  const plate = plateModes({ a: g.a, b: g.b, h: g.h, ...WOOD, fMax: F_MAX, cavity: cav.map((c) => [c.l, c.m]) });
  const res = { ...g, cav, plate };
  geo.set(size, res);
  return res;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function num(name, x, def, lo, hi) {
  if (x === undefined || x === null) return def;
  const v = Number(x);
  if (!Number.isFinite(v)) throw new Error(`cajon: ${name} must be a finite number`);
  return clamp(v, lo, hi);
}

const phiAt = (md, x, y) => md.X.f(x) * md.Y.f(y);

// Mode shapes averaged over a Gaussian contact patch (radius r in metres) clipped to the plate.
function patch(modes, g, cx, cy, r) {
  const pts = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const dx = (i / 3) * 2 * r, dy = (j / 3) * 2 * r;
    const x = cx + dx / g.a, y = cy + dy / g.b;
    if (x <= 0 || x >= 1 || y <= 0 || y >= 1) continue;
    pts.push({ x, y, w: Math.exp(-(dx * dx + dy * dy) / (2 * r * r)) });
  }
  const W = pts.reduce((s, p) => s + p.w, 0);
  return modes.map((md) => pts.reduce((s, p) => s + p.w * phiAt(md, p.x, p.y), 0) / W);
}

export function render({ voice = 'bass', velocity = 0.8, seed = 1, snare = 0.6, damping = 0, size = 'standard' } = {}) {
  voice ??= 'bass'; size ??= 'standard';
  if (!Object.hasOwn(VOICES, voice)) throw new Error(`cajon: unknown voice "${voice}" (${meta.voices.join(', ')})`);
  if (!Object.hasOwn(SIZES, size)) throw new Error(`cajon: unknown size "${size}" (${meta.sizes.join(', ')})`);
  const vel = num('velocity', velocity, 0.8, 0.01, 1);
  const sn = num('snare', snare, 0.6, 0, 1);
  const dmp = num('damping', damping, 0, 0, 1);
  const sd = num('seed', seed, 1, -1e15, 1e15);
  const r = rng((Math.imul(seedInt(sd) ^ 0x5bd1e995, 2654435761) ^ (voice.charCodeAt(0) * 40503) ^ voice.length) >>> 0);
  for (let i = 0; i < 4; i++) r();
  const jit = (x, amt) => x * (1 + amt * (2 * r() - 1));

  const g = geometry(size), { plate } = g, modes = plate.modes, K = modes.length;
  const hits = VOICES[voice].map((h) => {
    const cx = clamp(h.x + 0.04 * (2 * r() - 1), 0.05, 0.95);
    const cy = clamp(h.y + 0.025 * (2 * r() - 1), 0.05, 0.97);
    return {
      ext: Float64Array.from(patch(modes, g, cx, cy, h.r)),
      T: jit(h.T, 0.1) * vel ** -0.2, F: jit(h.F, 0.06) * vel ** 1.1, d: Math.round(h.d * FS),
    };
  });
  const T = hits[0].T;
  const pulse = (h) => {
    if (!h) return new Float64Array(0);
    const nT = Math.ceil(h.T * FS), x = new Float64Array(h.d + nT);
    for (let i = 0; i < nT; i++) x[h.d + i] = h.F * Math.sin((Math.PI * i) / (h.T * FS));
    return x;
  };
  const rest = dmp > 0 ? patch(modes, g, 0.22, 0.45, 0.06) : null;
  const M = plate.mass;
  const ab = g.a * g.b;
  const fc = (C_AIR * C_AIR / (2 * Math.PI)) * Math.sqrt((WOOD.rho * g.h) / plate.D2);
  const w2 = new Float64Array(K), damp = new Float64Array(K), invM = new Float64Array(K);
  const vol = new Float64Array(K), rad = new Float64Array(K);
  const nCav = g.cav.length, cav = Array.from({ length: 4 }, () => new Float64Array(K));
  for (let k = 0; k < K; k++) {
    const md = modes[k];
    const fr = md.f * (1 + 0.003 * (2 * r() - 1));
    const piston = md.vol / (ab * Math.sqrt(md.norm));
    const m = M * md.norm * (1 + 0.25 * piston * piston);
    const th = (2 * Math.PI * fr) / FS;
    w2[k] = (4 * Math.sin(th / 2) ** 2 * FS * FS);
    let eta = 0.018 + 0.006 * Math.sqrt(md.f / 1000) + 0.06 * piston * piston;
    if (rest) eta += dmp * 0.35 * rest[k] * rest[k] / md.norm;
    damp[k] = eta * 2 * Math.PI * fr;
    invM[k] = 1 / m;
    w2[k] *= M * md.norm / m;
    vol[k] = md.vol;
    for (let j = 0; j < nCav; j++) cav[j][k] = md.cav[j];
    const mic = (phiAt(md, 0.45, 0.7) - phiAt(md, 0.6, 0.35) + phiAt(md, 0.3, 0.85)) / 3;
    const taper = md.f < F_TAPER ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (md.f - F_TAPER)) / (F_MAX - F_TAPER));
    rad[k] = (-md.vol + 0.25 * ab * Math.sqrt(Math.min(1, md.f / fc)) * mic) * taper;
  }

  const V0 = g.a * g.b * g.D;
  const S = Math.PI * g.rp * g.rp, Lp = g.tw + 1.7 * g.rp, mh = RHO_AIR * S * Lp;
  const kH = (RHO_AIR * C_AIR * C_AIR) / V0;
  const wH = C_AIR * Math.sqrt(S / (V0 * Lp));
  const Rh = (wH * mh) / 9;
  const kap = new Float64Array(4), cw2 = new Float64Array(4), cz = new Float64Array(4);
  g.cav.forEach((c, j) => {
    kap[j] = (RHO_AIR * C_AIR * C_AIR) / (V0 * c.lam);
    cw2[j] = (2 * Math.PI * c.f) ** 2;
    cz[j] = 2 * 0.03 * 2 * Math.PI * c.f;
  });

  const wires = sn > 0;
  const wire = { rest: new Float64Array(4), mw: new Float64Array(4).fill(1), kw: new Float64Array(4), rw: new Float64Array(4), Kc: 1e7 };
  const wph = Array.from({ length: 4 }, () => new Float64Array(K));
  for (let c = 0; c < (wires ? 4 : 0); c++) {
    const wx = 0.2 + 0.2 * c + 0.02 * (2 * r() - 1), wy = 0.8 + 0.02 * (2 * r() - 1);
    for (let k = 0; k < K; k++) wph[c][k] = phiAt(modes[k], wx, wy);
    const m = jit(0.00015, 0.2), w = 2 * Math.PI * jit(90, 0.35);
    wire.mw[c] = m; wire.kw[c] = m * w * w; wire.rw[c] = 2 * 0.15 * w * m;
    wire.rest[c] = -jit(0.0001 + 0.0012 * (1 - sn) ** 2, 0.15);
  }

  const y = simulate({
    fs: FS, len: LEN[voice] * (1 - 0.4 * dmp), K, w2, damp, invM, vol,
    eA: hits[0].ext, eB: hits[1]?.ext ?? new Float64Array(K), fA: pulse(hits[0]), fB: pulse(hits[1]), rad, cav, wph, wires,
    Klow: modes.some((md) => md.f > F_CAV) ? modes.findIndex((md) => md.f > F_CAV) : K, kH, S, mh, Rh, portG: 0.6, kap, cw2, cz, wire,
  });
  const d = new Float64Array(y.length);
  for (let i = 1; i < y.length; i++) d[i] = (y[i] - y[i - 1]) * FS;
  let out = decimate(d, OS);
  out = biquad(out, 'hp', 35, 0.7);
  out = biquad(out, 'lp', 10000, 0.6);
  for (let i = 0; i < out.length; i++) out[i] *= OUT_GAIN;
  const t = trimTail(out, -75);
  return edges(t, Math.max(4, 0.25 * T * SR), Math.min(0.03 * SR, t.length * 0.2));
}
