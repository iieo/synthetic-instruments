import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { pluckExcitation, renderTwoPolarisations, dampCurve, fadeEdges, finite, pickString, pluckParam } from './strings-plucked/string.mjs';
import { bodyModes, applyBody } from './strings-plucked/body.mjs';
import { lowpass, highpass, dcBlock } from './strings-plucked/filters.mjs';

export const meta = { name: 'Acoustic guitar (nylon / steel)', range: [40, 86] };

const OPEN = [40, 45, 50, 55, 59, 64];

// Inharmonicity of the open strings from B = pi^3 E d^4 / (64 T L^2) with typical gauges and tensions.
const TYPES = {
  nylon: {
    scale: 0.65, pluckFromBridge: 0.13,
    B: [1.2e-5, 1.0e-5, 0.9e-5, 9.5e-5, 4.5e-5, 2.0e-5],
    t60: (f) => ({ lo: interp(f, 82, 12, 660, 3.5), hi: interp(f, 82, 1.0, 660, 1.5) }), fh: 4000, radiationHp: 95, tilt: 900,
    contact: (v) => 0.012 + (1 - v) * 0.02, release: 0.00005, noise: 0.05, click: 0.25,
    modes: [[98, 16, 1.1], [196, 20, 0.9], [232, 24, 0.35], [395, 28, 0.35], [455, 30, 0.3], [560, 32, 0.25], [720, 36, 0.18], [880, 40, 0.14]],
    dense: { seed: 7, from: 950, to: 5200, spacing: 0.07, q: 28, gain: 0.12 },
    lp: 5200,
  },
  steel: {
    scale: 0.645, pluckFromBridge: 0.11,
    B: [1.0e-4, 7.0e-5, 5.0e-5, 4.0e-5, 3.0e-5, 2.8e-5],
    t60: (f) => ({ lo: interp(f, 82, 15, 660, 4.5), hi: interp(f, 82, 1.4, 660, 2.0) }), fh: 5000, radiationHp: 90, tilt: 1200,
    contact: (v) => 0.002 + (1 - v) * 0.005, release: 0.00002, noise: 0.07, click: 0.3,
    modes: [[102, 14, 1.0], [185, 18, 0.9], [225, 20, 0.45], [372, 28, 0.4], [446, 30, 0.35], [585, 32, 0.3], [740, 36, 0.22], [1010, 40, 0.18]],
    dense: { seed: 11, from: 1100, to: 7000, spacing: 0.06, q: 32, gain: 0.14 },
    lp: 9500,
  },
};

function interp(f, f1, v1, f2, v2) {
  const t = Math.min(1.3, Math.max(-0.3, Math.log(f / f1) / Math.log(f2 / f1)));
  return Math.exp(Math.log(v1) + t * (Math.log(v2) - Math.log(v1)));
}

const bodyCache = {};

const W = 'guitar.render';

export function render({ midi = 60, velocity = 0.8, duration = 1, seed = 1, type = 'nylon', pluckPosition, string } = {}) {
  if (!Object.hasOwn(TYPES, type)) throw new Error(`${W}: unknown type ${type}`);
  const T = TYPES[type];
  midi = Math.min(meta.range[1], Math.max(meta.range[0], finite(W, 'midi', midi)));
  const r = rng(finite(W, 'seed', seed) * 7919 + midi * 131 + 17);
  const s = pickString(W, midi, OPEN, string);
  pluckPosition = pluckParam(W, pluckPosition);
  duration = Math.max(0, finite(W, 'duration', duration));
  const fret = Math.max(0, midi - OPEN[s]);
  const L = T.scale * 2 ** (-fret / 12);
  const f0 = midiToHz(midi) * 2 ** ((r() - 0.5) * 1.6 / 1200);
  const B = T.B[s] * 2 ** (2 * fret / 12);
  const beta = Math.min(0.45, pluckPosition ?? (T.pluckFromBridge * (0.85 + 0.3 * r())) / L);
  const v = Math.min(1, Math.max(0.05, finite(W, 'velocity', velocity)));
  const { lo, hi } = T.t60(f0);
  const jitter = 0.92 + 0.16 * r();
  const wound = s < 3 ? 0.6 : 1;

  const length = Math.round((duration + 0.3) * SR);
  // Contact width along the string turns into a time width through the transverse wave speed c = 2 L f0.
  const widthSec = T.contact(v) * (0.85 + 0.3 * r()) / (2 * L * f0) + T.release;
  const excite = pluckExcitation({ f0, beta, widthSec, noise: T.noise * v, rand: r });
  const amp = v ** 1.4;
  for (let i = 0; i < excite.length; i++) excite[i] *= amp;

  const { out } = renderTwoPolarisations({
    f0, B, nDisp: fret < 5 && s < 3 ? 6 : 3, t60lo: lo * jitter, t60hi: hi * jitter * wound, fh: T.fh,
    excite, length, damp: dampCurve(length, duration, 0.12),
    angle: Math.PI * (0.3 + 0.15 * r()), detuneCents: 0.4 + 0.5 * r(), decayRatio: 0.6, weakGain: 0.6,
  });

  // Finger nail or plectrum scraping off the string: a short noise burst that reaches the bridge directly.
  const click = Math.round(0.004 * SR);
  let c1 = 0, c2 = 0;
  for (let i = 0; i < click; i++) {
    c1 += 0.5 * ((r() * 2 - 1) - c1);
    c2 += 0.5 * (c1 - c2);
    out[i] += T.click * v * (c1 - c2) * Math.sin(Math.PI * i / click) ** 2;
  }

  const modes = bodyCache[type] ??= bodyModes({ modes: T.modes, dense: T.dense });
  let y = applyBody(out, modes, 1);
  lowpass(T.lp, 0.6).run(y);
  highpass(T.radiationHp, 0.9).run(y);
  // The top radiates like a small monopole: pressure ~ frequency x bridge velocity, so tilt up below ~1 kHz.
  dcBlock(y, T.tilt);
  // Fixed output scale: the loudest note at velocity 1 (any seed) peaks near -3 dBFS.
  for (let i = 0; i < y.length; i++) y[i] *= 0.77;
  return fadeEdges(y);
}
