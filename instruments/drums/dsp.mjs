import { SR } from '../../lib/audio.mjs';

// Second-order sections from the bilinear transform of analog prototypes.
export function biquad(x, type, f, q = 0.707, gainDb = 0) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.49)) / SR;
  const c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  else if (type === 'hshelf' || type === 'lshelf') {
    const sq = 2 * Math.sqrt(A) * al, sg = type === 'hshelf' ? 1 : -1;
    b0 = A * ((A + 1) + sg * (A - 1) * c + sq); b1 = -2 * sg * A * ((A - 1) + sg * (A + 1) * c); b2 = A * ((A + 1) + sg * (A - 1) * c - sq);
    a0 = (A + 1) - sg * (A - 1) * c + sq; a1 = 2 * sg * ((A - 1) - sg * (A + 1) * c); a2 = (A + 1) - sg * (A - 1) * c - sq;
  } else throw new Error(type);
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// Spectral envelope of a half-sine contact force of duration T (1 at DC, falling as f^-2 above 1/(2T)).
// The exact half-sine spectrum has zeros at f = 1.5/T, 2.5/T, ...; a real stick tip or beater is not a
// perfect point contact, which smears these zeros, so only the envelope is used.
export function contactWeight(f, T) {
  const u = 1.25 * f * T;
  return 1 / (1 + u * u);
}

// Hertz contact: contact time shrinks with impact speed as v^(-1/5).
export const hertzT = (T0, vel) => T0 * Math.pow(Math.max(vel, 0.05), -0.2);

export function addInto(dst, src, g = 1) {
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i++) dst[i] += src[i] * g;
  return dst;
}

// Smooth onset over `a` samples and raised-cosine release over the last `r` samples.
export function edges(x, a, r) {
  a = Math.max(4, Math.round(a)); r = Math.max(4, Math.round(r));
  for (let i = 0; i < a && i < x.length; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  const n = x.length;
  for (let i = 0; i < r && i < n; i++) x[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / r);
  x[0] = 0; x[n - 1] = 0;
  return x;
}

// Trim the tail once the signal stays below `floorDb` relative to its peak.
export function trimTail(x, floorDb = -80, minLen = 0.05) {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  const th = pk * 10 ** (floorDb / 20);
  let last = x.length - 1;
  while (last > 0 && Math.abs(x[last]) < th) last--;
  const n = Math.min(x.length, Math.max(Math.round(minLen * SR), last + Math.round(0.01 * SR)));
  return x.slice(0, n);
}

export const t60ToDecay = (t60) => Math.exp(-6.907755 / (t60 * SR));
