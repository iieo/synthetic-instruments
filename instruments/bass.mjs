import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { pluckExcitation, renderTwoPolarisations, dampCurve, fadeEdges, finite, pickString, pluckParam } from './strings-plucked/string.mjs';
import { bodyModes, applyBody } from './strings-plucked/body.mjs';
import { lowpass, highpass, dcBlock } from './strings-plucked/filters.mjs';

export const meta = { name: 'Bass (fingered electric / upright)', range: [28, 67] };

const OPEN = [28, 33, 38, 43];
// Fixed output scale: the loudest note at velocity 1 (any style, string, pluck point or seed) peaks near -3 dBFS.
const OUT_GAIN = 0.68;

const STYLES = {
  electric: {
    scale: 0.864, pluckFromBridge: 0.13,
    B: [2.5e-4, 1.8e-4, 1.3e-4, 0.9e-4],
    t60: (f) => ({ lo: interp(f, 41, 10, 330, 6), hi: interp(f, 41, 1.4, 330, 1.6) }), fh: 2000,
    contact: (v) => 0.016 + (1 - v) * 0.012, release: 0.00012, click: 0.08,
    pickups: [[0.095, 0.5], [0.16, 0.5]],
    damp: 0.07,
  },
  upright: {
    scale: 1.06, pluckFromBridge: 0.3,
    B: [1.6e-4, 1.2e-4, 0.9e-4, 0.7e-4],
    t60: (f) => ({ lo: interp(f, 41, 6, 330, 3), hi: interp(f, 41, 1.0, 330, 1.1) }), fh: 1500,
    contact: (v) => 0.04 + (1 - v) * 0.03, release: 0.0005, click: 0.12,
    modes: [[58, 10, 1.2], [98, 14, 1.0], [132, 16, 0.8], [188, 20, 0.5], [262, 22, 0.4], [360, 28, 0.3], [480, 30, 0.25]],
    dense: { seed: 5, from: 600, to: 3200, spacing: 0.08, q: 22, gain: 0.12 },
    damp: 0.1,
  },
};

function interp(f, f1, v1, f2, v2) {
  const t = Math.min(1.5, Math.max(-0.3, Math.log(f / f1) / Math.log(f2 / f1)));
  return Math.exp(Math.log(v1) + t * (Math.log(v2) - Math.log(v1)));
}

// A magnetic pickup's voltage follows the string velocity at distance x from the bridge, which in the
// single-loop model is the difference of the slope wave and its copy delayed by (x / L) of a period.
function pickup(slope, frac, P) {
  const D = frac * P, Di = Math.floor(D), fr = D - Di;
  const out = new Float64Array(slope.length);
  for (let n = 0; n < slope.length; n++) {
    const a = n - Di >= 0 ? slope[n - Di] : 0, b = n - Di - 1 >= 0 ? slope[n - Di - 1] : 0;
    out[n] = slope[n] - ((1 - fr) * a + fr * b);
  }
  return out;
}

const bodyCache = {};

const W = 'bass.render';

export function render({ midi = 40, velocity = 0.8, duration = 1, seed = 1, style = 'electric', pluckPosition, string } = {}) {
  if (!Object.hasOwn(STYLES, style)) throw new Error(`${W}: unknown style ${style}`);
  const T = STYLES[style];
  midi = Math.min(meta.range[1], Math.max(meta.range[0], finite(W, 'midi', midi)));
  const r = rng(finite(W, 'seed', seed) * 6271 + midi * 97 + 3);
  const s = pickString(W, midi, OPEN, string);
  pluckPosition = pluckParam(W, pluckPosition);
  duration = Math.max(0, finite(W, 'duration', duration));
  const fret = Math.max(0, midi - OPEN[s]);
  const L = T.scale * 2 ** (-fret / 12);
  const f0 = midiToHz(midi) * 2 ** ((r() - 0.5) * 1.6 / 1200);
  const P = SR / f0;
  const B = T.B[s] * 2 ** (2 * fret / 12);
  const beta = Math.min(0.45, pluckPosition ?? (T.pluckFromBridge * (0.9 + 0.2 * r())) / L);
  const v = Math.min(1, Math.max(0.05, finite(W, 'velocity', velocity)));
  const { lo, hi } = T.t60(f0);
  const jitter = 0.92 + 0.16 * r();

  const length = Math.round((duration + 0.3) * SR);
  const widthSec = T.contact(v) * (0.85 + 0.3 * r()) / (2 * L * f0) + T.release;
  const excite = pluckExcitation({ f0, beta, widthSec, noise: 0.03 * v, rand: r });
  const amp = v ** 1.4;
  for (let i = 0; i < excite.length; i++) excite[i] *= amp;

  const { out } = renderTwoPolarisations({
    f0, B, nDisp: fret < 7 ? 16 : 10, t60lo: lo * jitter, t60hi: hi * jitter, fh: T.fh,
    excite, length, damp: dampCurve(length, duration, T.damp),
    angle: Math.PI * (0.15 + 0.1 * r()), detuneCents: 0.3 + 0.4 * r(), decayRatio: 0.7, weakGain: 0.5,
  });

  // Fingertip leaving the string: soft low-passed noise thump.
  const click = Math.round(0.006 * SR);
  let c1 = 0, c2 = 0;
  for (let i = 0; i < click; i++) {
    c1 += 0.2 * ((r() * 2 - 1) - c1);
    c2 += 0.2 * (c1 - c2);
    out[i] += T.click * v * c2 * Math.sin(Math.PI * i / click) ** 2;
  }

  let y;
  if (style === 'electric') {
    y = new Float64Array(length);
    for (const [x, g] of T.pickups) {
      const p = pickup(out, Math.min(0.5, x / L), P);
      for (let i = 0; i < length; i++) y[i] += 0.5 * g * p[i];
    }
    // Coil inductance with cable capacitance forms a resonant low-pass; then a small cabinet roll-off.
    lowpass(2800, 1.3).run(y);
    lowpass(5000, 0.7).run(y);
    highpass(32, 0.7).run(y);
  } else {
    const modes = bodyCache.upright ??= bodyModes({ modes: T.modes, dense: T.dense });
    y = applyBody(out, modes, 0.8);
    for (let i = 0; i < length; i++) y[i] *= 0.75;
    highpass(45, 0.8).run(y);
    lowpass(2500, 0.7).run(y);
  }
  dcBlock(y, 10);
  for (let i = 0; i < length; i++) y[i] *= OUT_GAIN;
  return fadeEdges(y);
}
