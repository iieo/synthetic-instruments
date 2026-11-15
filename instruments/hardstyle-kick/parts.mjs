import { SR } from '../../lib/audio.mjs';
import { biquad } from '../techno-kick/dsp.mjs';

// Phase-continuous sine whose frequency falls in log space from the punch down to the note:
// f(t) = fT * 2^(oct * e^(-t/tau) + chirp * e^(-t/tauC)). A sine stays band-limited at any rate.
export function sweepSine(n, fs, fT, { oct, tau, chirp, tauC }) {
  const y = new Float64Array(n);
  const ks = Math.exp(-1 / (tau * fs)), kc = Math.exp(-1 / (tauC * fs));
  let es = 1, ec = 1, ph = 0;
  for (let i = 0; i < n; i++) {
    y[i] = Math.sin(ph);
    const f = Math.min(fT * 2 ** (oct * es + chirp * ec), fs * 0.1);
    ph += (2 * Math.PI * f) / fs;
    if (ph > 2 * Math.PI) ph -= 2 * Math.PI;
    es *= ks; ec *= kc;
  }
  return y;
}

// Smooth odd sigmoid x / sqrt(1 + x^2): all derivatives continuous, so its harmonics fall fast.
const alg = (v) => v / Math.sqrt(1 + v * v);
// Cubic soft clip, flat beyond |v| = 1 with a continuous slope.
const cubic = (v) => (v >= 1 ? 1 : v <= -1 ? -1 : 1.5 * v - 0.5 * v * v * v);

// One drive stage on the oversampled signal. `bias` shifts the operating point for even
// harmonics; its static output is subtracted so silence stays at zero.
export function stage(x, { type, gain, bias = 0 }) {
  const y = new Float64Array(x.length);
  if (type === 'soft') {
    const off = alg(bias);
    for (let i = 0; i < x.length; i++) y[i] = alg(gain * x[i] + bias) - off;
  } else if (type === 'clip') {
    const off = cubic(bias);
    for (let i = 0; i < x.length; i++) y[i] = cubic(gain * x[i] + bias) - off;
  } else if (type === 'fold') {
    // Sine folder: past a quarter turn the output bends back down instead of flattening.
    const off = Math.sin(bias);
    for (let i = 0; i < x.length; i++) y[i] = Math.sin((Math.PI / 2) * gain * x[i] + bias) - off;
  } else throw new Error(`unknown stage ${type}`);
  return y;
}

export function eq(x, list, fs) {
  let y = x;
  for (const [t, f, q, g = 0] of list) y = biquad(y, t, f, q, g, fs);
  return y;
}

// Raised-cosine step from 0 to 1 between t0 and t0 + len (seconds).
export function riseAt(t, t0, len) {
  if (t <= t0) return 0;
  if (t >= t0 + len) return 1;
  return 0.5 - 0.5 * Math.cos((Math.PI * (t - t0)) / len);
}

// Transient: a short band-passed noise burst plus one cycle of a high sine "tick".
export function click(r, n, { freq, tau, tick }) {
  const nz = new Float64Array(n), k = Math.exp(-1 / (tau * SR));
  let e = 1;
  for (let i = 0; i < n; i++) { nz[i] = (2 * r() - 1) * e; e *= k; }
  const y = biquad(biquad(nz, 'bp', freq, 0.8), 'hp', 1200, 0.7);
  const tn = Math.round(SR / tick);
  for (let i = 0; i < Math.min(n, tn); i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / tn);
    y[i] += 0.5 * w * Math.sin((2 * Math.PI * i) / tn);
  }
  return y;
}
