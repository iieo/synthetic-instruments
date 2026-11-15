import { SR } from '../../lib/audio.mjs';

// Topology-preserving state-variable filter (trapezoidal integrators), safe under fast modulation.
export class Svf {
  constructor() { this.s1 = 0; this.s2 = 0; this.set(1000, 0.7); }
  set(fc, q) {
    this.g = Math.tan((Math.PI * Math.min(fc, 0.45 * SR)) / SR);
    this.k = 1 / q;
    this.a1 = 1 / (1 + this.g * (this.g + this.k));
  }
  tick(x) {
    const v1 = this.a1 * (this.s1 + this.g * (x - this.s2));
    const v2 = this.s2 + this.g * v1;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

export class DcBlock {
  constructor(fc) { this.r = Math.exp((-2 * Math.PI * fc) / SR); this.x1 = 0; this.y1 = 0; }
  tick(x) { const y = x - this.x1 + this.r * this.y1; this.x1 = x; this.y1 = y; return y; }
}

// Windowed-sinc lowpass for decimating the oversampled reed simulation down to SR.
export function decimator(os, taps = 16 * os) {
  const h = new Float64Array(taps), fc = 0.45 / os;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const t = i - (taps - 1) / 2;
    const sinc = t === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * t) / (Math.PI * t);
    const win = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
    h[i] = sinc * win; sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  return (x) => {
    const n = Math.floor(x.length / os), y = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const c = j * os;
      let acc = 0;
      for (let i = 0; i < taps; i++) { const k = c - i + (taps >> 1); if (k >= 0 && k < x.length) acc += h[i] * x[k]; }
      y[j] = acc;
    }
    return y;
  };
}

// Smooth random wander, roughly unit standard deviation, band-limited to about fc.
export function wander(rand, fc, n) {
  const out = new Float64Array(n);
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    y1 = a * y1 + (1 - a) * (2 * rand() - 1) * 1.732;
    y2 = a * y2 + (1 - a) * y1;
    out[i] = y2;
  }
  let s = 0;
  for (let i = 0; i < n; i++) s += out[i] * out[i];
  const g = s > 0 ? 1 / Math.sqrt(s / n) : 1;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

export function finite(where, name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${where}: ${name} must be a finite number, got ${String(v)}`);
  return v;
}

// A number, or breakpoints [[t, value], ...] with finite entries.
export function curveParam(where, name, v) {
  if (typeof v === 'number') return finite(where, name, v);
  const ok = Array.isArray(v) && v.length > 0
    && v.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (!ok) throw new TypeError(`${where}: ${name} must be a number or [[t, value], ...], got ${JSON.stringify(v)}`);
  return [...v].sort((a, b) => a[0] - b[0]);
}

// `true`, a depth 0..1, or { rate, depth, type }; null when off.
export function vibratoParam(where, vib, { rate, depth, types = [undefined] }) {
  if (vib === undefined || vib === null || vib === false) return null;
  if (vib === true) vib = {};
  else if (typeof vib === 'number') vib = { depth: finite(where, 'vibrato', vib) };
  else if (typeof vib !== 'object') throw new TypeError(`${where}: vibrato must be true, a number or { rate, depth }, got ${String(vib)}`);
  const type = vib.type ?? types[0];
  if (!types.includes(type)) throw new Error(`${where}: unknown vibrato type ${type}`);
  return {
    rate: Math.min(12, Math.max(0.5, finite(where, 'vibrato.rate', vib.rate ?? rate))),
    depth: Math.min(1, Math.max(0, finite(where, 'vibrato.depth', vib.depth ?? depth))),
    type,
  };
}

// Breakpoints [[t, value], ...] joined by raised-cosine segments, held at both ends.
export function breakpoints(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
  }
  return pts[pts.length - 1][1];
}
