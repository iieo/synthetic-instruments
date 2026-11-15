import { SR, rng } from '../../lib/audio.mjs';

// Soundbox and soundboard as a modal filter: the bridge force drives a parallel bank of
// damped two-pole resonators. The low modes stand for the cavity (air in the long tapered box
// with its back openings) and the first soundboard bending modes; above about 1 kHz a fixed
// pseudo-random set of weaker, denser modes gives the wood coloration.
const LOW_MODES = [
  // [Hz, Q, gain]
  [96, 9, 0.9], [148, 12, 1.0], [196, 14, 0.85], [252, 16, 0.8], [318, 18, 0.65],
  [395, 20, 0.6], [480, 22, 0.5], [575, 24, 0.42], [690, 26, 0.35], [830, 28, 0.3], [990, 30, 0.24],
];

function modeList() {
  const all = LOW_MODES.map((m) => [...m]);
  const r = rng(4711);
  let f = 1100;
  while (f < 7000) {
    f *= 1.06 + 0.08 * r();
    all.push([f, 26 + 14 * r(), (r() < 0.5 ? -1 : 1) * 0.22 * (0.4 + 0.6 * r()) * Math.sqrt(1100 / f)]);
  }
  return all;
}

const MODES = modeList().map(([f, q, gain]) => {
  const th = (2 * Math.PI * f) / SR;
  const r = Math.exp(-th / (2 * q));
  const a1 = 2 * r * Math.cos(th), a2 = -r * r;
  // Normalise to the given gain at resonance: H = b1 z^-1 / (1 - a1 z^-1 - a2 z^-2).
  const re = 1 - a1 * Math.cos(th) - a2 * Math.cos(2 * th);
  const im = a1 * Math.sin(th) + a2 * Math.sin(2 * th);
  return { a1, a2, b1: gain * Math.hypot(re, im) };
});

// Direct radiation of the board below its first modes is weak: second-order highpass.
function highpass(x, fc) {
  const w = Math.tan((Math.PI * fc) / SR), q = Math.SQRT1_2;
  const n = 1 + w / q + w * w;
  const b0 = 1 / n, a1 = (2 * (w * w - 1)) / n, a2 = (1 - w / q + w * w) / n;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * (x[i] - 2 * x1 + x2) - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export function soundbox(force, { direct = 0.55, modal = 0.5, cutoff = 110 } = {}) {
  const out = highpass(force, cutoff);
  for (let i = 0; i < out.length; i++) out[i] *= direct;
  for (const { a1, a2, b1 } of MODES) {
    const g = b1 * modal;
    let y1 = 0, y2 = 0, x1 = 0;
    for (let i = 0; i < force.length; i++) {
      const v = g * x1 + a1 * y1 + a2 * y2;
      y2 = y1; y1 = v; x1 = force[i];
      out[i] += v;
    }
  }
  return out;
}
