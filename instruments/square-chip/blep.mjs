import { SR } from '../../lib/audio.mjs';

// Band-limited rendering of a piecewise constant signal. Each jump of height d at the fractional
// sample time tau is replaced by d times the integral of a Kaiser-windowed sinc (cutoff 20 kHz,
// 64 samples wide). The plain unit step goes into a difference buffer that is summed at the end,
// only the residual (smooth step minus hard step) is added sample by sample.
export const HALF = 32;
const RES = 512, FC = 20000 / SR, BETA = 9;

function besselI0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 60; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-17 * s) break; }
  return s;
}

const RESID = (() => {
  const n = 2 * HALF * RES, h = new Float64Array(n + 1), i0 = besselI0(BETA);
  for (let i = 0; i <= n; i++) {
    const x = i / RES - HALF, u = x / HALF;
    const sinc = x === 0 ? 2 * FC : Math.sin(2 * Math.PI * FC * x) / (Math.PI * x);
    h[i] = sinc * besselI0(BETA * Math.sqrt(Math.max(0, 1 - u * u))) / i0;
  }
  const B = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) B[i] = B[i - 1] + 0.5 * (h[i - 1] + h[i]);
  for (let i = 0; i <= n; i++) B[i] = B[i] / B[n] - (i >= HALF * RES ? 1 : 0);
  return B;
})();

export class StepRenderer {
  constructor(n) {
    this.y = new Float64Array(n);
    this.d = new Float64Array(n + 1);
  }

  step(tau, d) {
    if (d === 0) return;
    const y = this.y, n0 = Math.ceil(tau);
    if (n0 < this.d.length) this.d[Math.max(0, n0)] += d;
    const lo = Math.max(0, Math.ceil(tau - HALF)), hi = Math.min(y.length - 1, Math.ceil(tau + HALF) - 1);
    for (let n = lo; n <= hi; n++) {
      const p = (n - tau + HALF) * RES, i = Math.floor(p);
      if (i < 0 || i >= 2 * HALF * RES) continue;
      // The residual table jumps by -1 at x = 0; never interpolate across that jump.
      const f = p - i, a = RESID[i], b = i + 1 === HALF * RES ? RESID[i + 1] + 1 : RESID[i + 1];
      y[n] += d * (a + (b - a) * f);
    }
  }

  finish() {
    const y = this.y;
    let acc = 0;
    for (let n = 0; n < y.length; n++) { acc += this.d[n]; y[n] += acc; }
    return y;
  }
}
