import { SR } from '../../lib/audio.mjs';

// Single-delay-loop string: integer delay line, one-pole loss filter, a cascade of identical
// first-order allpasses for stiffness dispersion and a first-order allpass for the fractional
// part of the loop length. All three filters add phase delay; the integer length is what is left.

function onePoleDelay(a, w) {
  return Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w;
}

function allpassDelay(c, w) {
  const ph = Math.atan2(-Math.sin(w), c + Math.cos(w)) - Math.atan2(-c * Math.sin(w), 1 + c * Math.cos(w));
  return -ph / w;
}

function onePoleMag(a, w) {
  return (1 - a) / Math.sqrt(1 - 2 * a * Math.cos(w) + a * a);
}

// Loss filter g (1 - a) / (1 - a z^-1) whose magnitude matches the per-period gains at w0 and wh.
function designLoss(G0, Gh, w0, wh) {
  const ratio = Math.min(Gh / G0, 0.99999);
  let lo = 0, hi = 0.999;
  for (let i = 0; i < 60; i++) {
    const a = (lo + hi) / 2;
    if (onePoleMag(a, wh) / onePoleMag(a, w0) > ratio) lo = a; else hi = a;
  }
  const a = (lo + hi) / 2;
  return { a, g: Math.min(G0 / onePoleMag(a, w0), 0.99999) };
}

function loopDelay(d, w) {
  let t = d.L + onePoleDelay(d.a, w) + allpassDelay(d.t, w);
  if (d.M) t += d.M * allpassDelay(d.c, w);
  return t;
}

function fitLength(d, w0, period) {
  const rest = period - onePoleDelay(d.a, w0) - (d.M ? d.M * allpassDelay(d.c, w0) : 0);
  d.L = Math.floor(rest - 0.5);
  const frac = rest - d.L;
  // Solve the exact phase delay at w0 rather than the Thiran low-frequency approximation.
  let lo = -0.99, hi = 0.99;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (allpassDelay(m, w0) > frac) lo = m; else hi = m;
  }
  d.t = (lo + hi) / 2;
  return d.L >= 2;
}

// Frequency of loop resonance k: solves w * tau(w) = 2 pi k.
function partial(d, k, guess) {
  let w = guess;
  for (let i = 0; i < 40; i++) {
    const h = 1e-6;
    const f = w * loopDelay(d, w) - 2 * Math.PI * k;
    const df = ((w + h) * loopDelay(d, w + h) - f - 2 * Math.PI * k) / h;
    w -= f / df;
  }
  return w;
}

// sigma(f): amplitude decay rate in 1/s. B: inharmonicity coefficient.
export function designString({ f0, sigma, B = 0, maxStages = 6 }) {
  const period = SR / f0;
  const w0 = (2 * Math.PI * f0) / SR;
  const fh = Math.min(Math.max(4 * f0, 1500), 0.4 * SR);
  const wh = (2 * Math.PI * fh) / SR;
  const G = (f) => Math.exp(-sigma(f) / f0);
  const d = { ...designLoss(G(f0), G(fh), w0, wh), M: 0, c: 0, L: 0, t: 0 };
  fitLength(d, w0, period);

  const kRef = Math.min(12, Math.floor((0.35 * SR) / f0));
  if (B > 0 && kRef >= 3) {
    const target = (k) => k * Math.sqrt((1 + B * k * k) / (1 + B));
    const err = (c, M) => {
      const t = { ...d, c, M };
      if (!fitLength(t, w0, period)) return null;
      return partial(t, kRef, w0 * target(kRef)) / w0 - target(kRef);
    };
    // More stages give a better-shaped dispersion curve but need loop length.
    for (let M = maxStages; M >= 1; M--) {
      if (err(-0.001, M) === null) continue;
      let lo = -0.95, hi = -0.001;
      while (err(lo, M) === null && lo < hi) lo += 0.02;
      if (err(lo, M) < 0) continue;
      for (let i = 0; i < 50; i++) {
        const c = (lo + hi) / 2;
        if (err(c, M) > 0) lo = c; else hi = c;
      }
      d.M = M; d.c = (lo + hi) / 2;
      fitLength(d, w0, period);
      break;
    }
  }
  d.partialHz = (k) => (partial(d, k, w0 * k) * SR) / (2 * Math.PI);
  return d;
}

// Runs the loop for n samples. damp(i) returns null or {g, a} to override the loss filter.
export function runString(d, input, n, damp) {
  const size = 1 << Math.ceil(Math.log2(d.L + 4));
  const mask = size - 1;
  const line = new Float64Array(size);
  const out = new Float64Array(n);
  const M = d.M, c = d.c, t = d.t;
  const z = new Float64Array(M);
  let lp = 0, zf = 0, w = 0;
  let g = d.g, a = d.a;
  for (let i = 0; i < n; i++) {
    if (damp) {
      const o = damp(i);
      if (o) { g = o.g; a = o.a; }
    }
    let x = line[(w - d.L) & mask];
    lp = g * (1 - a) * x + a * lp;
    x = lp;
    for (let s = 0; s < M; s++) {
      const y = c * x + z[s];
      z[s] = x - c * y;
      x = y;
    }
    const y = t * x + zf;
    zf = x - t * y;
    const v = (i < input.length ? input[i] : 0) + y;
    line[w & mask] = v;
    out[i] = v;
    w++;
  }
  return out;
}
