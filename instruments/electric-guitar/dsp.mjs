import { SR } from '../../lib/audio.mjs';
import { kaiserLowpass } from '../synth/dsp.mjs';

// Numeric option: undefined/null gives the default, anything that is not a finite number throws,
// everything else is clamped to [lo, hi].
export function num(where, name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}: ${name} must be a finite number, got ${String(v)}`);
  return Math.min(hi, Math.max(lo, v));
}

export function pick(where, name, v, def, allowed) {
  if (v === undefined || v === null) return def;
  if (!allowed.includes(v)) throw new Error(`${where}: unknown ${name} ${String(v)} (expected ${allowed.join(', ')})`);
  return v;
}

export class Biquad {
  constructor(c) { this.c = c; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  step(x) {
    const { b0, b1, b2, a1, a2 } = this.c;
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  run(buf) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.step(buf[i]);
    return buf;
  }
}

// Second-order sections from the bilinear transform of the analog prototypes, prewarped at f.
export function design(type, f, q = Math.SQRT1_2, db = 0, fs = SR) {
  const w = 2 * Math.PI * Math.min(f, 0.49 * fs) / fs, cw = Math.cos(w), sw = Math.sin(w);
  const A = 10 ** (db / 40), al = sw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case 'low': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s;
      break;
    }
    case 'high': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s;
      break;
    }
    default: throw new Error(`unknown filter ${type}`);
  }
  return new Biquad({ b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 });
}

// First-order sections: y = a y + (1 - a) x and its high-pass complement.
export class OnePole {
  constructor(f, fs = SR) { this.a = Math.exp(-2 * Math.PI * f / fs); this.y = 0; this.x1 = 0; this.h = 0; }
  lp(x) { this.y = x + this.a * (this.y - x); return this.y; }
  hp(x) { this.h = this.a * (this.h + x - this.x1); this.x1 = x; return this.h; }
}

const upFirs = new Map();
// Zero-stuffing interpolation by os with the same Kaiser low-pass the decimator uses, delay-compensated.
export function upsample(x, os) {
  if (os === 1) return Float64Array.from(x);
  if (!upFirs.has(os)) upFirs.set(os, kaiserLowpass(72 * os + 1, 20500 / (SR * os), 9.5));
  const h = upFirs.get(os), N = h.length, D = (N - 1) / 2;
  const M = x.length * os, y = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const c = j + D;
    let acc = 0;
    for (let i = c % os; i < N; i += os) {
      const m = (c - i) / os;
      if (m >= 0 && m < x.length) acc += h[i] * x[m];
    }
    y[j] = acc * os;
  }
  return y;
}

// Raised-cosine edges so the note starts and ends at exactly zero.
export function edges(buf, inSec = 0.0005, outSec = 0.02, fs = SR) {
  const ni = Math.max(1, Math.round(inSec * fs)), no = Math.max(1, Math.round(outSec * fs));
  for (let i = 0; i < ni && i < buf.length; i++) buf[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / ni);
  for (let i = 0; i < no && i < buf.length; i++) buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / no);
  buf[0] = 0; buf[buf.length - 1] = 0;
  return buf;
}
