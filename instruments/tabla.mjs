import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { noteSeed } from './synth/dsp.mjs';
import { biquad, contactWeight, hertzT, edges, trimTail } from './drums/dsp.mjs';
import { loadedModes, syahiDensity, layeredDensity, shapeAt } from './tabla/membrane.mjs';

export const meta = {
  name: 'Tabla',
  range: [57, 69],
  voices: ['na', 'tin', 'tun', 'te', 'ge', 'ge-glide', 'ka', 'dha', 'dhin'],
  options: { glide: { min: -7, max: 7, default: 4, unit: 'semitones' } },
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = 2 * Math.PI;
const BAYAN_HZ = 98;

// Loaded heads. Dayan: heavy paste in three stacked layers out to about 0.46 of the radius, fitted so the
// lowest nine modes fall in harmonic groups with the strong (1,1) mode on the octave. Bayan: a lighter,
// smaller load, partly harmonic.
const DRUMS = {
  dayan: { density: layeredDensity({ layers: [[53.81, 0.0606], [45.01, 0.2137], [30.0, 0.4261]] }), radius: 0.075, rim: 800, split: 0.0015, kMax: 11.25, maxRatio: 22, tm: 0.012, tmTau: 0.03 },
  bayan: { density: syahiDensity({ sigma: 6, b: 0.35, p: 2 }), radius: 0.11, rim: 500, split: 0.012, kMax: 19.4, maxRatio: 12, tm: 0.04, tmTau: 0.05 },
};
const cache = new Map();
function head(name) {
  if (cache.has(name)) return cache.get(name);
  const d = DRUMS[name];
  const raw = loadedModes(d.density, { mMax: 14, kMax: d.kMax, N: 300, G: 100 });
  const k0 = raw[0].k;
  // Small, fixed irregularities of the real head: each degenerate pair is split slightly.
  const r = rng(name === 'dayan' ? 1729 : 4104);
  const modes = raw.filter((m) => m.k / k0 <= d.maxRatio).map((m) => ({
    ...m, ratio: m.k / k0, split: m.m ? d.split * (0.5 + r()) : 0,
  }));
  const h = { ...d, modes };
  cache.set(name, h);
  return h;
}

/*
 Stroke descriptions. rs: strike radius (0 centre, 1 rim); T0: finger contact time; damp: resting finger
 or hand contacts { r, c } (point dashpots); closed: hand stays on the head; theta: strike angle relative
 to the resting finger; slap: contact noise level, band centre and Q; t60: decay scale.
*/
const STROKES = {
  na: { drum: 'dayan', rs: 0.93, T0: 0.0009, damp: [{ r: 0.52, c: 1800 }], theta: [0.6, 1.2], slap: [0.12, 3600, 1.4], t60: 1 },
  tin: { drum: 'dayan', rs: 0.74, T0: 0.0013, damp: [{ r: 0.52, c: 1800 }], theta: [0.7, 1.3], slap: [0.15, 2400, 1], t60: 1 },
  tun: { drum: 'dayan', rs: 0.06, T0: 0.0016, damp: [], theta: [0, TAU], slap: [0.08, 1500, 0.8], t60: 1.15 },
  te: { drum: 'dayan', rs: 0.1, T0: 0.0022, damp: [], closed: 0.045, theta: [0, TAU], slap: [0.45, 1300, 0.9], t60: 1 },
  ge: { drum: 'bayan', rs: 0.5, T0: 0.0028, damp: [{ r: 0.92, c: 400 }], theta: [0, TAU], slap: [0.08, 900, 0.8], t60: 1 },
  'ge-glide': { drum: 'bayan', rs: 0.5, T0: 0.0028, damp: [{ r: 0.92, c: 400 }], theta: [0, TAU], slap: [0.08, 900, 0.8], t60: 1.1, glide: true },
  ka: { drum: 'bayan', rs: 0.4, T0: 0.0035, damp: [], closed: 0.05, theta: [0, TAU], slap: [0.6, 700, 0.8], t60: 1 },
};
const COMBOS = { dha: ['na', 'ge'], dhin: ['tin', 'ge'] };
// Per-stroke gains put the loudest single stroke (any tuning, seed and glide at velocity 1) near -3 dBFS;
// COMBO_GAIN does the same for the two-handed strokes.
const STROKE_GAIN = { na: 2.975, tin: 2.522, tun: 1.26, te: 1.755, ge: 0.378, 'ge-glide': 0.313, ka: 0.837 };
const COMBO_GAIN = { dha: 0.843, dhin: 0.734 };

function baseT60(drum, m, f, f0) {
  const x = f / f0;
  const hi = 1 / (1 + (x / 5) ** 2);
  if (drum === 'dayan') return clamp(4 * x ** -0.5 * hi, 0.04, 4) * (m === 0 ? 0.6 : 1);
  return clamp(2.8 * x ** -0.7 * hi, 0.04, 2.8) * (m === 0 ? 0.8 : 1);
}

function stroke(name, f0, vel, r, glide) {
  const s = STROKES[name], H = head(s.drum);
  const T = hertzT(s.T0 * (0.92 + 0.16 * r()), vel);
  const theta = s.theta[0] + (s.theta[1] - s.theta[0]) * r();
  const rs = clamp(s.rs + 0.03 * (2 * r() - 1), 0, 0.98);
  const ring = s.closed ? 0.5 : 4;
  const n = Math.round(ring * SR);

  // Common frequency factor: tension modulation by the stroke amplitude, and for the glide stroke the palm
  // heel pressing into the head, which raises the tension of the whole membrane.
  const kf = new Float64Array(n);
  const tmTau = H.tmTau * SR, tm = H.tm * vel * vel;
  const g0 = 0.04 * SR, g1 = (0.32 + 0.06 * r()) * SR;
  for (let i = 0; i < n; i++) {
    let k = 1 + tm * Math.exp(-i / tmTau);
    if (s.glide && glide) {
      const x = clamp((i - g0) / g1, 0, 1), sm = x * x * (3 - 2 * x);
      k *= 2 ** ((glide > 0 ? glide * sm : -glide * (1 - sm)) / 12);
    }
    kf[i] = k;
  }
  const phi = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { phi[i] = acc; acc += TAU * kf[i] / SR; }
  let kMax = 0;
  for (let i = 0; i < n; i++) kMax = Math.max(kMax, kf[i]);

  const out = new Float64Array(n);
  for (const md of H.modes) {
    const comps = md.m === 0 ? [[0, 1]] : [[-1, Math.cos(md.m * theta)], [1, Math.sin(md.m * theta)]];
    for (const [side, ang] of comps) {
      const f = f0 * md.ratio * (1 + side * md.split * 0.5);
      if (f * kMax > 0.45 * SR) continue;
      const u = shapeAt(md, rs);
      // A multipole of order m radiates with an amplitude efficiency of about (ka)^m while ka < 1.
      const ka = (TAU * f * H.radius) / 343;
      let a = vel * u * ang * Math.min(1, ka ** md.m) * contactWeight(f, T);
      a *= 0.9 + 0.2 * r();
      if (Math.abs(a) < 1e-5) continue;
      let alpha = 6.907755 / (baseT60(s.drum, md.m, f, f0) * s.t60);
      // The rim is a double skin (the outer ring membrane over the main head) and absorbs strongly.
      const ur = shapeAt(md, 0.94);
      alpha += H.rim * ur * ur;
      for (const d of s.damp) {
        const ud = shapeAt(md, d.r);
        // The finger fixes the angular reference: the cos component has its antinode under the finger,
        // the sin component a nodal line through it, touched only across the finger's width.
        const w = md.m === 0 ? 1 : side < 0 ? 1 : Math.min(1, (md.m * 0.12) ** 2 / 3);
        alpha += d.c * ud * ud * w;
      }
      if (s.closed) alpha = Math.max(alpha, 6.907755 / (s.closed * (f0 / f) ** 0.3));
      const dec = Math.exp(-alpha / SR);
      const lim = Math.min(n, Math.ceil((Math.log(Math.abs(a) / 1e-7) * SR) / alpha));
      let e = a;
      for (let i = 0; i < lim; i++) { out[i] += e * Math.sin(f * phi[i]); e *= dec; }
    }
  }

  // Skin and fingertip contact noise: dense, heavily damped upper modes during contact.
  const [sl, fc, q] = s.slap;
  const nc = Math.max(4, Math.round(T * SR)), m = Math.min(n, nc + Math.round(0.012 * SR));
  const nz = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    const env = i < nc ? Math.sin((Math.PI * i) / (2 * nc)) ** 2 : Math.exp(-(i - nc) / (0.002 * SR));
    nz[i] = (2 * r() - 1) * env;
  }
  const bp = biquad(biquad(nz, 'bp', fc * (0.95 + 0.1 * r()), q), 'lp', 5000, 0.7);
  const gs = sl * vel ** 1.5 * 0.6;
  const g = STROKE_GAIN[name];
  for (let i = 0; i < n; i++) out[i] += gs * bp[i];
  for (let i = 0; i < n; i++) out[i] *= g;
  return { y: out, a: T * SR };
}

const VOICE_ERR = (v) => new Error(`tabla: voice must be one of ${meta.voices.join(', ')}, got ${v}`);

// midi tunes the dayan (its lowest mode); the bayan has its own fixed tuning.
export function render({ voice = 'na', midi = 62, velocity = 0.8, seed = 1, glide = 4 } = {}) {
  if (typeof voice !== 'string' || !meta.voices.includes(voice)) throw VOICE_ERR(voice);
  for (const [k, x] of Object.entries({ midi, velocity, seed, glide })) {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`tabla: ${k} must be a finite number, got ${x}`);
  }
  midi = clamp(midi, meta.range[0], meta.range[1]);
  const vel = clamp(velocity, 0.02, 1);
  glide = clamp(glide, -7, 7);
  const r = rng(noteSeed(seed, [midi, vel], voice));
  const f0 = midiToHz(midi);
  const parts = COMBOS[voice] || [voice];
  let y = null, a = 0;
  for (const [j, p] of parts.entries()) {
    const fp = STROKES[p].drum === 'dayan' ? f0 : BAYAN_HZ;
    const st = stroke(p, fp, vel * (j ? 0.85 : 1), r, glide);
    const off = j ? Math.round((0.001 + 0.002 * r()) * SR) : 0;
    if (!y) { y = st.y; a = st.a; continue; }
    const z = new Float64Array(Math.max(y.length, st.y.length + off));
    z.set(y);
    for (let i = 0; i < st.y.length; i++) z[i + off] += st.y[i];
    y = z;
  }
  const g = COMBO_GAIN[voice] ?? 1;
  const aN = Math.max(4, Math.round(a));
  for (let i = 0; i < y.length; i++) y[i] *= g * (i < aN ? 0.5 - 0.5 * Math.cos((Math.PI * i) / aN) : 1);
  // Strongly damped strokes would otherwise leave a net pressure offset; a closed air volume cannot radiate DC.
  // Fourth order and after the fade in, so the stroke keeps no net area and repeated strokes leave no drift.
  y = biquad(biquad(y, 'hp', 25, 0.5412), 'hp', 25, 1.3066);
  const t = trimTail(y, -70);
  return edges(t, 4, Math.min(0.04 * SR, t.length * 0.2));
}
