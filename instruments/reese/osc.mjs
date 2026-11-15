import { SR } from '../../lib/audio.mjs';
import { decimate, dcBlock } from '../rave/dsp.mjs';

// Second-order polynomial step residual: replaces a jump of height h at phase p with a smoothed one
// spread over the two samples around it.
export function blep(t, p, dt, h) {
  let d = t - p;
  if (d < 0) d += 1;
  if (d < dt) { const x = d / dt; return h * (x - 0.5 * x * x - 0.5); }
  if (d > 1 - dt) { const x = (d - 1) / dt; return h * (0.5 * x * x + x + 0.5); }
  return 0;
}

// Band-limited saw mixed with a pulse (difference of two saws), added into `out`.
// `inc` holds the per-sample phase increment (frequency / fs).
export function sawInto(out, inc, { phase = 0, gain = 1, pulse = 0, pw = 0.5, start = 0 } = {}) {
  let t = phase;
  const s = 1 - pulse;
  for (let i = 0; i < inc.length; i++) {
    const dt = Math.min(0.45, inc[i]);
    t += dt;
    if (t >= 1) t -= 1;
    let y = s * (2 * t - 1) + blep(t, 0, dt, -2 * s);
    if (pulse) {
      let t2 = t + pw;
      if (t2 >= 1) t2 -= 1;
      y += pulse * (2 * t - 2 * t2) + blep(t, 0, dt, -2 * pulse) + blep(t, 1 - pw, dt, 2 * pulse);
    }
    out[start + i] += gain * y;
  }
  return t;
}

// Per-sample phase increment for a base frequency, a pitch curve in semitones and a cent offset curve.
export function increments(n, fs, f0, semis, cents) {
  const inc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const st = (semis ? semis(i / fs) : 0) + (cents ? cents(i / fs) / 100 : 0);
    inc[i] = f0 * 2 ** (st / 12) / fs;
  }
  return inc;
}

// Raised-cosine attack, exponential decay to a sustain level, raised-cosine release from wherever
// the level is at the gate. Starts and ends at exactly zero.
export function envelope({ a, d, s, r, gate }) {
  const hold = (t) => (t < a ? 0.5 - 0.5 * Math.cos(Math.PI * t / a) : s + (1 - s) * Math.exp(-(t - a) / d));
  const g = Math.max(gate, 0);
  const atGate = hold(g);
  return (t) => {
    if (t < g) return hold(t);
    const u = t - g;
    return u >= r ? 0 : atGate * (0.5 + 0.5 * Math.cos(Math.PI * u / r));
  };
}

export function edges(x, seconds = 0.001) {
  const n = Math.min(Math.round(seconds * SR), x.length >> 1);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos(Math.PI * i / n);
    x[i] *= w;
    x[x.length - 1 - i] *= w;
  }
  x[0] = 0;
  x[x.length - 1] = 0;
}

// Decimate, remove DC, and pin both ends to zero (the linear-phase decimator rings a little past them).
export function finish(chs, os, { dcHz = 10, gain = 1 } = {}) {
  return chs.map((c) => {
    const y = decimate(c, os);
    dcBlock(y, dcHz);
    edges(y);
    for (let i = 0; i < y.length; i++) y[i] *= gain;
    return y;
  });
}

class Biquad {
  constructor(b0, b1, b2, a1, a2) { Object.assign(this, { b0, b1, b2, a1, a2 }); this.z1 = 0; this.z2 = 0; }
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

export function highpass(fc, q, fs = SR) {
  const w = 2 * Math.PI * fc / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return new Biquad((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0);
}

export function lowpass(fc, q, fs = SR) {
  const w = 2 * Math.PI * fc / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return new Biquad((1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0);
}

// Fourth-order Butterworth high-pass on the side signal: below fc the sum is mono.
export function monoBelow(L, R, fc = 120) {
  const h1 = highpass(fc, 0.5412), h2 = highpass(fc, 1.3066);
  for (let i = 0; i < L.length; i++) {
    const m = 0.5 * (L[i] + R[i]), s = h2.tick(h1.tick(0.5 * (L[i] - R[i])));
    L[i] = m + s; R[i] = m - s;
  }
}
