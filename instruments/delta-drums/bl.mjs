import { SR } from '../../lib/audio.mjs';

// Band-limited rendering of a piecewise constant chip output. Every level change of the chip is a
// step at an arbitrary (fractional) 48 kHz sample time; the step is replaced by the integral of a
// Kaiser-windowed sinc (cutoff 23 kHz, 32 taps wide, about 100 dB stopband from 28 kHz on), so
// nothing above 20 kHz folds back. The output is exactly the low-passed staircase.
export const HALF = 16;
const RES = 512, FC = 23000 / SR, BETA = 10;

function i0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 80; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-17 * s) break; }
  return s;
}

const TABLE = (() => {
  const n = 2 * HALF * RES, h = new Float64Array(n + 1), w0 = i0(BETA);
  for (let i = 0; i <= n; i++) {
    const x = i / RES - HALF, u = x / HALF;
    const s = x === 0 ? 2 * FC : Math.sin(2 * Math.PI * FC * x) / (Math.PI * x);
    h[i] = s * i0(BETA * Math.sqrt(Math.max(0, 1 - u * u))) / w0;
  }
  const B = new Float64Array(n + 2);
  for (let i = 1; i <= n; i++) B[i] = B[i - 1] + 0.5 * (h[i - 1] + h[i]);
  for (let i = 1; i <= n; i++) B[i] /= B[n];
  B[n + 1] = 1;
  return B;
})();
const TOP = 2 * HALF * RES;

export class StepSum {
  constructor(n) { this.y = new Float64Array(n); this.d = new Float64Array(n + 1); }
  // Step of height `h` at fractional sample time `tau`.
  add(tau, h) {
    if (h === 0) return;
    const y = this.y, n0 = Math.ceil(tau);
    if (n0 >= 0 && n0 < this.d.length) this.d[n0] += h;
    const lo = Math.max(0, n0 - HALF), hi = Math.min(y.length - 1, n0 + HALF - 1);
    for (let m = lo; m <= hi; m++) {
      const x = m - tau, p = (x + HALF) * RES;
      if (p <= 0 || p >= TOP) continue;
      const i = Math.floor(p), f = p - i;
      const b = TABLE[i] + f * (TABLE[i + 1] - TABLE[i]);
      y[m] += h * (x >= 0 ? b - 1 : b);
    }
  }
  done() {
    let s = 0;
    for (let m = 0; m < this.y.length; m++) { s += this.d[m]; this.y[m] += s; }
    return this.y;
  }
}

// First-order RC sections, trapezoidal (bilinear with prewarping), so the -3 dB point is exact.
export class RC {
  constructor(fc, fs = SR) { const g = Math.tan(Math.PI * fc / fs); this.a = g / (1 + g); this.s = 0; }
  lp(x) { const v = this.a * (x - this.s), y = v + this.s; this.s = y + v; return y; }
  hp(x) { return x - this.lp(x); }
}

// Second-order low-pass (Sallen-Key style, given Q), trapezoidal state-variable form.
export class LP2 {
  constructor(fc, q, fs = SR) {
    const g = Math.tan(Math.PI * fc / fs), k = 1 / q;
    this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2; this.s1 = 0; this.s2 = 0;
  }
  tick(x) {
    const v3 = x - this.s2, v1 = this.a1 * this.s1 + this.a2 * v3, v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1; this.s2 = 2 * v2 - this.s2;
    return v2;
  }
}

export function num(inst, name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${inst}: ${name} must be a finite number, got ${v}`);
  return Math.min(hi, Math.max(lo, v));
}

// Bounded insertion-ordered cache.
export function cached(map, max, key, make) {
  if (map.has(key)) { const v = map.get(key); map.delete(key); map.set(key, v); return v; }
  const v = make();
  map.set(key, v);
  if (map.size > max) map.delete(map.keys().next().value);
  return v;
}
