import { SR } from '../../lib/audio.mjs';

// Bridge force of an ideal string released from rest out of a finger-shaped displacement.
// For an initial shape u0(x) the force at the termination is T u0'(ct) for ct in [0, L] and
// T u0'(2L - ct) for ct in [L, 2L]: a rounded rectangular wave whose duty cycle is the pluck
// position. Plucking at the middle (beta = 0.5) removes the even harmonics.
export function fingerPluck({ period, beta, width }) {
  const n = Math.ceil(period);
  const e = new Float64Array(n);
  const up = 1 / beta, down = -1 / (1 - beta);
  const half = Math.max(width, 1.5 / period) / 2;
  const slope = (x) => {
    const u = (x - beta) / half;
    if (u <= -1) return up;
    if (u >= 1) return down;
    return up + (down - up) * (0.5 - 0.5 * Math.cos((Math.PI * (u + 1)) / 2));
  };
  for (let i = 0; i < n; i++) {
    const x = (2 * i) / period;
    e[i] = x <= 1 ? slope(x) : slope(Math.max(0, 2 - x));
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += e[i];
  mean /= n;
  for (let i = 0; i < n; i++) e[i] -= mean;
  return e;
}

// The string slides off the fingertip over a fraction of a millisecond: two one-pole lowpasses.
// The force also builds up over the slip time instead of jumping: a short raised-cosine onset.
export function fingerRelease(x, cutoff, period) {
  const p = Math.exp((-2 * Math.PI * cutoff) / SR);
  const rise = Math.max(8, Math.round(Math.min(0.0005 * SR, period / 2)));
  const pad = Math.ceil((SR * 4) / cutoff);
  const y = new Float64Array(x.length + pad);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < y.length; i++) {
    const on = i < rise ? 0.5 - 0.5 * Math.cos((Math.PI * i) / rise) : 1;
    s1 = (1 - p) * (i < x.length ? x[i] * on : 0) + p * s1;
    s2 = (1 - p) * s1 + p * s2;
    y[i] = s2;
  }
  return y;
}

// Short band-limited noise burst with a raised-cosine envelope (skin on string, palm on strings).
export function contactNoise(rand, { seconds, lowHz, highHz, gain }) {
  const n = Math.max(8, Math.round(seconds * SR));
  const y = new Float64Array(n);
  const ph = Math.exp((-2 * Math.PI * highHz) / SR);
  const pl = Math.exp((-2 * Math.PI * lowHz) / SR);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    a = (1 - ph) * (rand() * 2 - 1) + ph * a;
    b = (1 - pl) * a + pl * b;
    y[i] = (a - b) * w * gain;
  }
  return y;
}
