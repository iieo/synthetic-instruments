import { SR } from '../../lib/audio.mjs';

// RBJ-style second-order sections, Direct Form I, at an arbitrary rate.
export function biquad(x, type, f, q = 0.707, gainDb = 0, fs = SR) {
  const w = (2 * Math.PI * Math.min(f, fs * 0.49)) / fs;
  const c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  else if (type === 'lshelf' || type === 'hshelf') {
    const sq = 2 * Math.sqrt(A) * al, sg = type === 'hshelf' ? 1 : -1;
    b0 = A * ((A + 1) + sg * (A - 1) * c + sq); b1 = -2 * sg * A * ((A - 1) + sg * (A + 1) * c); b2 = A * ((A + 1) + sg * (A - 1) * c - sq);
    a0 = (A + 1) - sg * (A - 1) * c + sq; a1 = 2 * sg * ((A - 1) - sg * (A + 1) * c); a2 = (A + 1) - sg * (A - 1) * c - sq;
  } else throw new Error(`unknown filter ${type}`);
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// Butterworth of even order as a cascade of biquads.
export function butter(x, type, f, order = 4, fs = SR) {
  let y = x;
  for (let k = 0; k < order / 2; k++) {
    const q = 1 / (2 * Math.cos((Math.PI * (2 * k + 1)) / (2 * order)));
    y = biquad(y, type, f, q, 0, fs);
  }
  return y;
}

function besselI0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 60; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-14 * s) break; }
  return s;
}

// Kaiser-windowed sinc lowpass. fc and df in cycles per sample, att in dB stopband.
export function kaiserLowpass(fc, df, att) {
  const beta = att > 50 ? 0.1102 * (att - 8.7) : 0.5842 * (att - 21) ** 0.4 + 0.07886 * (att - 21);
  let n = Math.ceil((att - 8) / (2.285 * 2 * Math.PI * df)) | 1;
  if (n % 2 === 0) n++;
  const h = new Float64Array(n), m = (n - 1) / 2, i0b = besselI0(beta);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = i - m, r = t / m;
    const sinc = t === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * t) / (Math.PI * t);
    h[i] = sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0b;
    sum += h[i];
  }
  for (let i = 0; i < n; i++) h[i] /= sum;
  return h;
}

const filterCache = new Map();
// Anti-alias filter for factor `os`: flat to 20 kHz, >= 100 dB down from 24 kHz (base rate).
export function aaFilter(os) {
  if (!filterCache.has(os)) {
    const fso = SR * os;
    filterCache.set(os, kaiserLowpass(22000 / fso, 4000 / fso, 100));
  }
  return filterCache.get(os);
}

// Zero-phase decimation: output sample m is the filtered input at m*os.
export function decimate(x, os) {
  const h = aaFilter(os), n = h.length, half = (n - 1) / 2;
  const out = new Float64Array(Math.floor(x.length / os));
  for (let m = 0; m < out.length; m++) {
    const c = m * os - half;
    let acc = 0;
    const k0 = Math.max(0, -c), k1 = Math.min(n, x.length - c);
    for (let k = k0; k < k1; k++) acc += h[k] * x[c + k];
    out[m] = acc;
  }
  return out;
}

// Zero-phase polyphase interpolation by os.
export function upsample(x, os) {
  const h = aaFilter(os), n = h.length, half = (n - 1) / 2;
  const out = new Float64Array(x.length * os);
  for (let j = 0; j < out.length; j++) {
    // out[j] = os * sum_k h[k] * z[j + half - k], z nonzero only at multiples of os
    const base = j + half;
    let k = base % os, acc = 0;
    for (; k < n; k += os) {
      const idx = (base - k) / os;
      if (idx < 0) break;
      if (idx < x.length) acc += h[k] * x[idx];
    }
    out[j] = acc * os;
  }
  return out;
}

// Sample-accurate true-peak estimate (4x oversampling, as in loudness meters).
export function truePeak(x) {
  const u = upsample(x, 4);
  let p = 0;
  for (const v of u) p = Math.max(p, Math.abs(v));
  return p;
}

// Trapezoidal state-variable bandpass with a per-sample centre frequency (unity peak gain).
export function svfBandpass(x, freqAt, q, fs = SR) {
  const y = new Float64Array(x.length), k = 1 / q;
  let ic1 = 0, ic2 = 0;
  for (let i = 0; i < x.length; i++) {
    const g = Math.tan((Math.PI * freqAt(i)) / fs);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    y[i] = k * v1;
  }
  return y;
}

export function peakAbs(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; }
  return p;
}

// Raised-cosine fade to exactly zero over the last r samples.
export function fadeOut(x, r) {
  const n = x.length; r = Math.min(n, Math.max(4, Math.round(r)));
  for (let i = 0; i < r; i++) x[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / r);
  x[n - 1] = 0;
  return x;
}
