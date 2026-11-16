// Band-limited staircase: a chip output that only changes in steps at known (fractional) times is
// written as naive steps plus, around each step, the difference between a band-limited step and
// the ideal one. The band-limited step is the running integral of a Kaiser-windowed sinc.
export const HALF = 24;
const OVER = 256, FC = 0.43, BETA = 9;

function i0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 60; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-16 * s) break; }
  return s;
}

const L = 2 * HALF * OVER;
const STEP = new Float64Array(L + 2);
{
  const h = new Float64Array(L + 1), norm = i0(BETA);
  for (let i = 0; i <= L; i++) {
    const x = i / OVER - HALF, r = x / HALF;
    const s = x === 0 ? 2 * FC : Math.sin(2 * Math.PI * FC * x) / (Math.PI * x);
    h[i] = s * i0(BETA * Math.sqrt(Math.max(0, 1 - r * r))) / norm;
  }
  let acc = 0;
  for (let i = 1; i <= L; i++) { acc += 0.5 * (h[i - 1] + h[i]); STEP[i] = acc; }
  for (let i = 0; i <= L; i++) STEP[i] /= acc;
  STEP[L + 1] = 1;
}

export class Stairs {
  constructor(n, v0 = 0) { this.y = new Float64Array(n); this.v = v0; this.fill = 0; }

  // From time t (in samples, fractional) on the held value is v.
  set(t, v) {
    const d = v - this.v;
    if (d === 0) return;
    const y = this.y, n = y.length;
    const k = Math.min(Math.ceil(t), n);
    for (let i = this.fill; i < k; i++) y[i] += this.v;
    if (k > this.fill) this.fill = k;
    this.v = v;
    const j0 = Math.max(0, Math.ceil(t - HALF)), j1 = Math.min(n - 1, Math.floor(t + HALF));
    for (let j = j0; j <= j1; j++) {
      const x = j - t, p = (x + HALF) * OVER, i = p | 0, f = p - i;
      y[j] += d * (STEP[i] + (STEP[i + 1] - STEP[i]) * f - (x >= 0 ? 1 : 0));
    }
  }

  finish() {
    const y = this.y;
    for (let i = this.fill; i < y.length; i++) y[i] += this.v;
    this.fill = y.length;
    return y;
  }
}
