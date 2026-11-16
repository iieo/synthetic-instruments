import { SR } from '../../lib/audio.mjs';

// Band-limited unit step: Kaiser-windowed sinc low-pass at 20.5 kHz, 64 taps wide, integrated and
// tabulated at 1/512 sample.
export const HALF = 32;
const RES = 512, FC = 20500 / SR, BETA = 9.5;

function besselI0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 60; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-17 * s) break; }
  return s;
}

const TABLE = (() => {
  const n = 2 * HALF * RES, h = new Float64Array(n + 1), i0 = besselI0(BETA);
  for (let i = 0; i <= n; i++) {
    const x = i / RES - HALF, u = x / HALF;
    const sinc = x === 0 ? 2 * FC : Math.sin(2 * Math.PI * FC * x) / (Math.PI * x);
    h[i] = sinc * besselI0(BETA * Math.sqrt(Math.max(0, 1 - u * u))) / i0;
  }
  const B = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) B[i] = B[i - 1] + 0.5 * (h[i - 1] + h[i]);
  for (let i = 0; i <= n; i++) B[i] /= B[n];
  return B;
})();

/**
 * A piecewise-constant signal written as steps at fractional sample times. `out()` returns its
 * band-limited version at SR: the plain running sum of all steps plus a tabulated correction
 * around each step.
 */
export class StepBus {
  constructor(n) { this.n = n; this.y = new Float64Array(n); this.s = new Float64Array(n + 1); }
  step(tau, d) {
    if (d === 0 || !(tau < this.n + HALF)) return;
    const n0 = Math.ceil(tau);
    if (n0 < this.n) this.s[Math.max(0, n0)] += d;
    const lo = Math.max(0, Math.ceil(tau - HALF)), hi = Math.min(this.n - 1, Math.ceil(tau + HALF) - 1);
    for (let n = lo; n <= hi; n++) {
      const x = n - tau, p = (x + HALF) * RES, i = Math.floor(p);
      if (i < 0 || i >= 2 * HALF * RES) continue;
      // Correction against the ideal step u(x), so each step only touches 64 samples.
      this.y[n] += d * (TABLE[i] + (TABLE[i + 1] - TABLE[i]) * (p - i) - (x >= 0 ? 1 : 0));
    }
  }
  out() {
    let acc = 0;
    for (let i = 0; i < this.n; i++) { acc += this.s[i]; this.y[i] += acc; }
    return this.y;
  }
}
