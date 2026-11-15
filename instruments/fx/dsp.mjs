import { SR } from '../../lib/audio.mjs';

export function noise(n, r) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = 2 * r() - 1;
  return x;
}

// Trapezoidal state-variable filter with cutoff and Q per sample. mode: 'lp', 'bp' (unity peak), 'hp'.
export function svf(x, mode, fcAt, qAt) {
  const y = new Float64Array(x.length);
  let ic1 = 0, ic2 = 0;
  for (let i = 0; i < x.length; i++) {
    const g = Math.tan((Math.PI * Math.min(fcAt(i), 0.45 * SR)) / SR), k = 1 / qAt(i);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    y[i] = mode === 'lp' ? v2 : mode === 'bp' ? k * v1 : x[i] - k * v1 - v2;
  }
  return y;
}

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Sawtooth with PolyBLEP-corrected wrap, frequency per sample, starting phase p0.
export function saw(n, fAt, p0 = 0) {
  const y = new Float64Array(n);
  let p = p0;
  for (let i = 0; i < n; i++) {
    const dt = Math.min(fAt(i) / SR, 0.45);
    y[i] = 2 * p - 1 - blep(p, dt);
    p += dt;
    if (p >= 1) p -= 1;
  }
  return y;
}

// Square from two PolyBLEP edges.
export function square(n, fAt, p0 = 0) {
  const y = new Float64Array(n);
  let p = p0;
  for (let i = 0; i < n; i++) {
    const dt = Math.min(fAt(i) / SR, 0.45);
    y[i] = (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
    p += dt;
    if (p >= 1) p -= 1;
  }
  return y;
}

export function sine(n, fAt, p0 = 0) {
  const y = new Float64Array(n);
  let ph = p0;
  for (let i = 0; i < n; i++) {
    y[i] = Math.sin(ph);
    ph += (2 * Math.PI * fAt(i)) / SR;
    if (ph > 2 * Math.PI) ph -= 2 * Math.PI;
  }
  return y;
}

// Raised-cosine edges in samples, first and last sample exactly zero.
export function edges(y, fin, fout) {
  const n = y.length, a = Math.min(n, Math.max(2, Math.round(fin))), b = Math.min(n, Math.max(2, Math.round(fout)));
  for (let i = 0; i < a; i++) y[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < b; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
  y[0] = 0; y[n - 1] = 0;
  return y;
}

// Constant-power pan of a mono signal, pan(i) in -1..1, added into L and R.
export function panInto(L, R, x, panAt, gain = 1, start = 0) {
  for (let i = 0; i < x.length; i++) {
    const j = start + i;
    if (j < 0 || j >= L.length) continue;
    const p = ((panAt(i) + 1) * Math.PI) / 4;
    L[j] += gain * Math.cos(p) * x[i];
    R[j] += gain * Math.sin(p) * x[i];
  }
}
