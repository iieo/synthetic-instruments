import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { seedInt, decimate } from './synth/dsp.mjs';
import { designLoop, runLoop } from './strings-plucked/string.mjs';
import { bodyModes, applyBody } from './strings-plucked/body.mjs';
import { num, pick, design, edges, OnePole } from './electric-guitar/dsp.mjs';
import { lossDesign } from './koto/varloop.mjs';
import { runSitarString } from './sitar/string.mjs';

const OS = 4, FS = SR * OS;
// Bridge segment: 16 samples at 192 kHz are about 2 cm of string at a wave speed near 250 m/s.
const K = 16;
const CONTACT = 1;
// Fixed output scale: the loudest note at velocity 1 over all options peaks near -3 dBFS.
const OUT_GAIN = 6.98;
// Level offset in dB for jawari 0, 0.1, ..., 1.
const JAW_DB = [4.67, 4.79, 4.99, 4.0, 1.75, -0.32, -1.63, -2.29, -2.74, -2.99, -3.16];

// Sympathetic strings as semitones above the tonic. They run under the main strings and are tuned
// to the notes of the scale played.
const SCALES = {
  major: [12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 29],
  minor: [12, 14, 15, 17, 19, 20, 22, 24, 26, 27, 29],
  pentatonic: [12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36],
};

export const meta = { name: 'Sitar', range: [48, 84], scales: Object.keys(SCALES) };

const W = 'sitar.render';

function interp(f, f1, v1, f2, v2) {
  const t = Math.min(1.4, Math.max(-0.3, Math.log(f / f1) / Math.log(f2 / f1)));
  return Math.exp(Math.log(v1) + t * (Math.log(v2) - Math.log(v1)));
}

// Gourd resonator below a thin wooden top: a low air mode, top plate modes and a dense set above.
const BODY = bodyModes({
  modes: [[118, 7, 0.9], [205, 10, 1.0], [298, 12, 0.8], [410, 14, 0.6], [560, 16, 0.5], [740, 18, 0.4], [960, 20, 0.3]],
  dense: { seed: 41, from: 1050, to: 6000, spacing: 0.06, q: 24, gain: 0.12 },
});

const symCache = new Map();
function symDesign(midi) {
  if (symCache.has(midi)) return symCache.get(midi);
  if (symCache.size > 200) symCache.delete(symCache.keys().next().value);
  const f = midiToHz(midi);
  const d = designLoop({ f0: f, t60lo: interp(f, 262, 7, 1047, 4), t60hi: interp(f, 262, 2, 1047, 1.2), fh: 4000 });
  symCache.set(midi, d);
  return d;
}

// Displacement waves for a string pulled to a triangle at beta (from the bridge) and let go: one
// period around the loop is the shape going out and its inverted mirror image coming back, smoothed
// over the width of the wire plectrum.
function pluckWaves(P, beta, width) {
  const n = Math.max(8, Math.round(P)), e = new Float64Array(n);
  const tri = (x) => (x < beta ? x / beta : (1 - x) / (1 - beta));
  for (let i = 0; i < n; i++) {
    const u = 2 * (i + 0.5) / n;
    e[i] = u < 1 ? 0.5 * tri(u) : -0.5 * tri(2 - u);
  }
  const W2 = Math.max(1, Math.round(width));
  const out = new Float64Array(n + W2);
  let ks = 0;
  const ker = new Float64Array(W2);
  for (let k = 0; k < W2; k++) { ker[k] = Math.sin(Math.PI * (k + 0.5) / W2) ** 2; ks += ker[k]; }
  for (let i = 0; i < n; i++) for (let k = 0; k < W2; k++) out[i + k] += e[i] * ker[k] / ks;
  return out;
}

export function render({
  midi = 61, velocity = 0.8, duration = 3, seed = 1, jawari, sympathetic, tonic, scale = 'major',
  pluckPosition, meend, meendAt, meendTime,
} = {}) {
  midi = num(W, 'midi', midi, 61, meta.range[0], meta.range[1]);
  const v = num(W, 'velocity', velocity, 0.8, 0.05, 1);
  duration = num(W, 'duration', duration, 3, 0, 30);
  const sd = num(W, 'seed', seed, 1, -1e15, 1e15);
  const jaw = num(W, 'jawari', jawari, 0.6, 0, 1);
  const sym = num(W, 'sympathetic', sympathetic, 0.5, 0, 1);
  const ton = Math.round(num(W, 'tonic', tonic, 49, 40, 60));
  scale = pick(W, 'scale', scale, 'major', meta.scales);
  const pp = num(W, 'pluckPosition', pluckPosition, null, 0.05, 0.15);
  const bend = num(W, 'meend', meend, 0, -5, 5);
  const bendAt = num(W, 'meendAt', meendAt, 0.3, 0, 30);
  const bendTime = num(W, 'meendTime', meendTime, 0.35, 0.01, 5);
  const r = rng((Math.imul(seedInt(sd) ^ 0x1b873593, 2654435761) + Math.round(midi * 64) * 69069 + 3) >>> 0 || 1);

  const f0 = midiToHz(midi) * 2 ** ((r() - 0.5) * 1.6 / 1200);
  const P = FS / f0;
  // The plectrum strikes about 8 to 10 % of the length from the bridge, never far from it.
  const beta = pp ?? 0.08 + 0.025 * r();
  const n = Math.round((duration + 0.4) * FS);

  let ratio = null;
  if (bend !== 0) {
    ratio = new Float64Array(n);
    const a = Math.round(bendAt * FS), m = Math.max(1, Math.round(bendTime * FS));
    for (let i = 0; i < n; i++) {
      const k = i < a ? 0 : Math.min(1, (i - a) / m);
      ratio[i] = 2 ** (bend * (0.5 - 0.5 * Math.cos(Math.PI * k)) / 12);
    }
  }

  // A pluck with a given force pulls the string less far the closer it is to the bridge and the
  // shorter the stopped string is, d = F beta (1 - beta) L / T; this keeps the slope at the
  // bridge, which decides the buzz, similar for all notes.
  const amp = 0.45 * v ** 1.2 * (277 / f0) * beta * (1 - beta) / (0.09 * 0.91);
  // Wire plectrum about 2 mm wide, transverse wave speed near 250 m/s.
  const excite = pluckWaves(P, beta, 0.002 * (1 + 0.8 * (1 - v)) / 250 * FS);
  for (let i = 0; i < excite.length; i++) excite[i] *= amp;

  const damp = new Float64Array(n).fill(1);
  const d0 = Math.round(duration * FS), dr = Math.round(0.04 * FS), dEnd = 10 ** (-3 / (0.15 * f0));
  for (let i = Math.max(0, d0); i < n; i++) damp[i] = 1 - Math.min(1, (i - d0) / dr) * (1 - dEnd);

  // The curvature sets how far a string of given amplitude wraps onto the bridge: an open jawari
  // (flat bridge) buzzes long and bright, a closed one only on the first loud periods.
  const curve = 6e-6 * 2 ** (5.3 * (0.6 - jaw));
  const loss = lossDesign({ f0, t60lo: interp(f0, 175, 7, 700, 3.5), t60hi: interp(f0, 175, 1.6, 700, 1.0), fh: 6000, fs: FS });
  const { slope, contact } = runSitarString({ fs: FS, f0, ratio, loss, excite, length: n, damp, K, curve, stiff: 1 });

  // Force on the bridge: string tension times the slope at the termination plus the contact push.
  // The slow part of the push is the mean load of a string lying on the bridge, a static force;
  // what sounds is its fast part, so it is high-passed.
  const chp = design('hp', 300, 0.7, 0, FS);
  const force = new Float64Array(n);
  for (let i = 0; i < n; i++) force[i] = 6 * slope[i] + CONTACT * chp.step(contact[i]);
  const main = decimate(force, OS);
  const N = main.length;

  // Sympathetic strings sit under the main strings and are driven by the same bridge.
  const y = Float64Array.from(main);
  if (sym > 0) {
    const coupling = 0.004;
    for (const st of SCALES[scale]) {
      const d = symDesign(ton + st);
      const ring = runLoop(d, main.map((x) => x * coupling), N, new Float64Array(N).fill(1));
      for (let i = 0; i < N; i++) y[i] += sym * ring[i];
    }
  }

  const out = applyBody(y, BODY, 0.5);
  design('hp', 80, 0.8).run(out);
  // The top radiates more efficiently with rising frequency up to the first plate modes.
  const tilt = new OnePole(450);
  for (let i = 0; i < N; i++) out[i] = tilt.hp(out[i]);
  design('lp', 9500, 0.7).run(out);
  // The buzz changes the attack peak strongly and not monotonically with the jawari; this level
  // offset, measured in steps of 0.1, keeps the loudest note near the same peak for every setting.
  const jk = Math.min(9, Math.floor(jaw * 10)), jf = jaw * 10 - jk;
  const g = OUT_GAIN * 10 ** ((JAW_DB[jk] + jf * (JAW_DB[jk + 1] - JAW_DB[jk])) / 20);
  for (let i = 0; i < N; i++) out[i] *= g;
  return edges(out, 0.0005, 0.03);
}
