import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { seedInt, decimate } from './synth/dsp.mjs';
import { pluckExcitation } from './strings-plucked/string.mjs';
import { bodyModes, applyBody } from './strings-plucked/body.mjs';
import { num, pick, design, edges } from './electric-guitar/dsp.mjs';
import { lossDesign, runVarLoop } from './koto/varloop.mjs';

const OS = 2, FS = SR * OS;
// Whole string from the fixed end bridge to the far end, and the wave speed of a string at the
// usual tension: the movable bridge is placed where 2 L f0 = c.
const TOTAL = 1.82;
const C = 420;

const PRESETS = {
  // Polyester strings plucked with a pick on the thumb and two fingers.
  pick: {
    t60: (f) => ({ lo: interp(f, 147, 4.5, 880, 2.2), hi: interp(f, 147, 0.55, 880, 0.45) }), fh: 3000,
    contact: 0.003, noise: 0.04, click: 0.35, from: 0.075, back: 0.1, out: 0.83,
  },
  // Silk: more internal friction, the highs die quickly and the note is shorter.
  silk: {
    t60: (f) => ({ lo: interp(f, 147, 3.0, 880, 1.5), hi: interp(f, 147, 0.3, 880, 0.25) }), fh: 2500,
    contact: 0.0035, noise: 0.05, click: 0.3, from: 0.075, back: 0.08, out: 0.86,
  },
  // Bare fingertip instead of the pick: wide soft contact, no click.
  finger: {
    t60: (f) => ({ lo: interp(f, 147, 4.5, 880, 2.2), hi: interp(f, 147, 0.55, 880, 0.45) }), fh: 3000,
    contact: 0.02, noise: 0.015, click: 0, from: 0.11, back: 0.1, out: 0.85,
  },
};

export const meta = { name: 'Koto', range: [45, 86], presets: Object.keys(PRESETS) };

const W = 'koto.render';

function interp(f, f1, v1, f2, v2) {
  const t = Math.min(1.4, Math.max(-0.3, Math.log(f / f1) / Math.log(f2 / f1)));
  return Math.exp(Math.log(v1) + t * (Math.log(v2) - Math.log(v1)));
}

// Paulownia box, about 1.8 m long with thin soft walls: low, closely spaced and well damped modes.
const BODY = bodyModes({
  modes: [[92, 7, 0.8], [138, 8, 1.0], [196, 10, 0.9], [258, 12, 0.8], [330, 13, 0.7], [415, 15, 0.55], [520, 16, 0.45], [640, 18, 0.35]],
  dense: { seed: 23, from: 720, to: 4200, spacing: 0.07, q: 16, gain: 0.12 },
});

// Pitch factor per sample for a press of `semis` starting at `at` and reaching full depth after
// `time` (raised cosine).
function pressCurve(n, fs, semis, at, time) {
  if (semis === 0) return null;
  const r = new Float64Array(n), a = Math.round(at * fs), m = Math.max(1, Math.round(time * fs));
  for (let i = 0; i < n; i++) {
    const k = i < a ? 0 : Math.min(1, (i - a) / m);
    r[i] = 2 ** (semis * (0.5 - 0.5 * Math.cos(Math.PI * k)) / 12);
  }
  return r;
}

export function render({
  midi = 62, velocity = 0.8, duration = 2, seed = 1, preset = 'pick', pluckPosition,
  oshide, oshideAt, oshideTime,
} = {}) {
  preset = pick(W, 'preset', preset, 'pick', meta.presets);
  const P = PRESETS[preset];
  midi = num(W, 'midi', midi, 62, meta.range[0], meta.range[1]);
  const v = num(W, 'velocity', velocity, 0.8, 0.05, 1);
  duration = num(W, 'duration', duration, 2, 0, 30);
  const sd = num(W, 'seed', seed, 1, -1e15, 1e15);
  const pp = num(W, 'pluckPosition', pluckPosition, null, 0.02, 0.98);
  const press = num(W, 'oshide', oshide, 0, 0, 3);
  const pressAt = num(W, 'oshideAt', oshideAt, 0, 0, 30);
  const pressTime = num(W, 'oshideTime', oshideTime, 0.18, 0.01, 5);
  const r = rng((Math.imul(seedInt(sd) ^ 0x2c1b3c6d, 2246822519) + Math.round(midi * 64) * 69069 + 11) >>> 0 || 1);

  const f0 = midiToHz(midi) * 2 ** ((r() - 0.5) * 2 / 1200);
  const L = Math.min(TOTAL - 0.12, C / (2 * f0));
  const Lback = TOTAL - L;
  const beta = pp == null ? Math.min(0.4, P.from * (0.85 + 0.3 * r()) / L) : Math.min(0.5, Math.min(pp, 1 - pp));
  const { lo, hi } = P.t60(f0);
  const jitter = 0.92 + 0.16 * r();

  const n = Math.round((duration + 0.35) * FS);
  const ratio = pressCurve(n, FS, press, pressAt, pressTime);
  // pluckExcitation works at SR; asking for f0 / OS and OS times the widths gives the same shape at FS.
  const widthSec = (P.contact * (1 + 1.2 * (1 - v))) * (0.85 + 0.3 * r()) / C;
  const excite = pluckExcitation({ f0: f0 / OS, beta, widthSec: widthSec * OS, noise: P.noise * v, noiseSec: 0.003 * OS, rand: r });
  const amp = v ** 1.3;
  for (let i = 0; i < excite.length; i++) excite[i] *= amp;

  // The player's hand stops the string after `duration`.
  const damp = new Float64Array(n).fill(1);
  const d0 = Math.round(duration * FS), dr = Math.round(0.04 * FS), dEnd = 10 ** (-3 / (0.15 * f0));
  for (let i = Math.max(0, d0); i < n; i++) damp[i] = 1 - Math.min(1, (i - d0) / dr) * (1 - dEnd);

  const main = runVarLoop({ fs: FS, f0, ratio, loss: lossDesign({ f0, t60lo: lo * jitter, t60hi: hi * jitter, fh: P.fh, fs: FS }), excite, length: n, damp });

  // The part of the string behind the movable bridge is driven through the bridge and rings at its
  // own, unrelated pitch; pressing there raises its tension as well.
  const fb = C / (2 * Lback);
  const bl = lossDesign({ f0: fb, t60lo: interp(fb, 147, 2.5, 880, 1.2), t60hi: 0.3, fh: 2500, fs: FS });
  const back = runVarLoop({ fs: FS, f0: fb, ratio, loss: bl, excite: main, length: n, damp });

  const y0 = new Float64Array(n);
  for (let i = 0; i < n; i++) y0[i] = main[i] + P.back * back[i];
  let y = decimate(y0, OS);

  // The pick hitting the string: a few milliseconds of band-passed noise straight into the body.
  if (P.click > 0) {
    const bp = design('bp', 3200 + 1500 * r(), 1.2), m = Math.round(0.004 * SR);
    for (let i = 0; i < m; i++) y[i] += P.click * v * bp.step(r() * 2 - 1) * Math.sin(Math.PI * i / m) ** 2;
  }
  y = applyBody(y, BODY, 0.6);
  design('hp', 70, 0.8).run(y);
  design('lp', 7000, 0.7).run(y);
  // Hollow box radiating like a monopole: pressure rises with frequency below a few hundred hertz.
  design('hp', 260, 0.5).run(y);
  for (let i = 0; i < y.length; i++) y[i] *= P.out;
  return edges(y, 0.0005, 0.02);
}
