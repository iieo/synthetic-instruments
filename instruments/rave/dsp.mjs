import { SR } from '../../lib/audio.mjs';

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 40; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-14 * sum) break;
  }
  return sum;
}

// Kaiser-windowed sinc low-pass, odd length, unity DC gain. fc in cycles per sample.
export function kaiserLowpass(taps, fc, beta) {
  const h = new Float64Array(taps), M = (taps - 1) / 2, i0b = besselI0(beta);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - M;
    const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    const w = besselI0(beta * Math.sqrt(Math.max(0, 1 - (x / M) ** 2))) / i0b;
    h[i] = sinc * w;
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  return h;
}

const firCache = new Map();
function decimationFir(os) {
  if (!firCache.has(os)) {
    const taps = 64 * os - 1;
    firCache.set(os, kaiserLowpass(taps, 23000 / (SR * os), 8.6));
  }
  return firCache.get(os);
}

// Low-pass and keep every os-th sample; the FIR's group delay is compensated so output j lines up
// with input j*os.
export function decimate(x, os) {
  if (os === 1) return Float64Array.from(x);
  const h = decimationFir(os), N = h.length, D = (N - 1) / 2;
  const m = Math.floor(x.length / os), y = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const c = j * os + D;
    let acc = 0;
    const iMin = Math.max(0, c - x.length + 1), iMax = Math.min(N - 1, c);
    for (let i = iMin; i <= iMax; i++) acc += h[i] * x[c - i];
    y[j] = acc;
  }
  return y;
}

// Topology-preserving (trapezoidal, zero-delay-feedback) state-variable filter.
// The band-pass integrator state passes a soft clipper, like an OTA running out of current at
// high resonance; it keeps the loop bounded and adds a little grit on loud peaks.
export class SVF {
  constructor(fs) { this.fs = fs; this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; }
  set(fc, q) {
    const g = Math.tan(Math.PI * Math.min(fc, 0.45 * this.fs) / this.fs);
    this.g = g; this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    const s1 = 2 * v1 - this.ic1;
    this.ic1 = s1 / (1 + 0.08 * Math.abs(s1));
    this.ic2 = 2 * v2 - this.ic2;
    this.bp = v1; this.lp = v2; this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

// Four-pole transistor ladder, each stage a TPT one-pole. The feedback loop is solved exactly for
// the linear part; the input differential pair (the stage that clips first in the circuit) is a tanh
// applied to the solved loop input.
export class Ladder {
  constructor(fs) { this.fs = fs; this.s = new Float64Array(4); this.G = 0; this.k = 0; }
  set(fc, res) {
    const g = Math.tan(Math.PI * Math.min(fc, 0.42 * this.fs) / this.fs);
    this.G = g / (1 + g); this.inv = 1 / (1 + g); this.k = 4 * res;
  }
  tick(x, drive = 1) {
    const s = this.s, G = this.G, inv = this.inv;
    const S = G * G * G * s[0] * inv + G * G * s[1] * inv + G * s[2] * inv + s[3] * inv;
    const G4 = G * G * G * G;
    // Partial passband-gain compensation, as many ladder designs feed some input around the loop.
    const xin = x * (1 + 0.5 * this.k);
    let u = (xin - this.k * S) / (1 + this.k * G4);
    u = Math.tanh(drive * u) / drive;
    let y = u;
    for (let i = 0; i < 4; i++) {
      const v = (y - s[i]) * G;
      const out = v + s[i];
      s[i] = out + v;
      y = out;
    }
    return y;
  }
}

export class OnePoleHP {
  constructor(fc, fs = SR) { this.a = Math.exp(-2 * Math.PI * fc / fs); this.x1 = 0; this.y1 = 0; }
  tick(x) { const y = this.a * (this.y1 + x - this.x1); this.x1 = x; this.y1 = y; return y; }
}

export class Biquad {
  constructor(b0, b1, b2, a1, a2) { Object.assign(this, { b0, b1, b2, a1, a2 }); this.z1 = 0; this.z2 = 0; }
  static lowpass(fc, q, fs = SR) {
    const w = 2 * Math.PI * fc / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    return new Biquad((1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0);
  }
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

function hermite(buf, mask, pos) {
  const i = Math.floor(pos), f = pos - i;
  const xm1 = buf[(i - 1) & mask], x0 = buf[i & mask], x1 = buf[(i + 1) & mask], x2 = buf[(i + 2) & mask];
  const c1 = 0.5 * (x1 - xm1), c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2, c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
  return ((c3 * f + c2) * f + c1) * f + x0;
}

// Bucket-brigade style stereo chorus: one delay line per side read at a modulated fractional
// position, with the BBD's anti-imaging/reconstruction low-pass on the wet path. The right side uses
// the inverted LFO, so the two sides detune in opposite directions.
export function chorus(L, R, { rate = 0.5, base = 0.007, depth = 0.0025, mix = 0.45, lp = 8000, phase = 0 } = {}) {
  const size = 4096, mask = size - 1;
  const bufL = new Float64Array(size), bufR = new Float64Array(size);
  const fl = [Biquad.lowpass(lp, 0.6), Biquad.lowpass(lp, 0.6)];
  const fr = [Biquad.lowpass(lp, 0.6), Biquad.lowpass(lp, 0.6)];
  const outL = new Float64Array(L.length), outR = new Float64Array(R.length);
  for (let i = 0; i < L.length; i++) {
    bufL[i & mask] = fl[0].tick(L[i]);
    bufR[i & mask] = fr[0].tick(R[i]);
    // Triangle LFO rounded by a cubic, close to the shape of an analog triangle into a BBD clock.
    let p = (rate * i / SR + phase) % 1;
    let tri = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    tri = 1.5 * tri - 0.5 * tri * tri * tri;
    const dL = (base + depth * tri) * SR, dR = (base - depth * tri) * SR;
    const wl = fl[1].tick(hermite(bufL, mask, i - dL));
    const wr = fr[1].tick(hermite(bufR, mask, i - dR));
    outL[i] = L[i] * (1 - 0.5 * mix) + mix * wl;
    outR[i] = R[i] * (1 - 0.5 * mix) + mix * wr;
  }
  return [outL, outR];
}

// Keeps the side signal out of the low end so the sum stays mono-compatible.
export function tightenLowSide(L, R, fc = 160) {
  const hp = new OnePoleHP(fc);
  for (let i = 0; i < L.length; i++) {
    const m = 0.5 * (L[i] + R[i]), s = hp.tick(0.5 * (L[i] - R[i]));
    L[i] = m + s; R[i] = m - s;
  }
}

export function dcBlock(x, fc = 12) {
  const hp = new OnePoleHP(fc);
  for (let i = 0; i < x.length; i++) x[i] = hp.tick(x[i]);
}

export function fadeOut(chs, seconds) {
  const n = Math.round(seconds * SR);
  for (const x of chs) {
    const len = x.length, m = Math.min(n, len);
    for (let i = 0; i < m; i++) x[len - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / m);
  }
}
