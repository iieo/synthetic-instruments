import { SR } from '../../lib/audio.mjs';

export class OnePoleLP {
  constructor(fc, sr = SR) { this.sr = sr; this.set(fc); this.y = 0; }
  set(fc) { this.a = Math.exp(-2 * Math.PI * fc / this.sr); }
  tick(x) { return (this.y = (1 - this.a) * x + this.a * this.y); }
  // Complex response at angular frequency w (rad/sample): returns [re, im].
  resp(w) { const b = 1 - this.a, re = 1 - this.a * Math.cos(w), im = this.a * Math.sin(w), d = re * re + im * im; return [b * re / d, -b * im / d]; }
}

export class OnePoleHP {
  constructor(fc, sr = SR) { this.a = Math.exp(-2 * Math.PI * fc / sr); this.x1 = 0; this.y = 0; }
  tick(x) { this.y = 0.5 * (1 + this.a) * (x - this.x1) + this.a * this.y; this.x1 = x; return this.y; }
  resp(w) {
    const g = 0.5 * (1 + this.a);
    const nr = 1 - Math.cos(w), ni = Math.sin(w), dr = 1 - this.a * Math.cos(w), di = this.a * Math.sin(w), d = dr * dr + di * di;
    return [g * (nr * dr + ni * di) / d, g * (ni * dr - nr * di) / d];
  }
}

// Second-order resonator section (bilinear-transform band/peak design written out by hand).
export class Biquad {
  constructor() { this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  static peak(fc, q, gainDb, sr = SR) {
    const f = new Biquad(), A = 10 ** (gainDb / 40), w = 2 * Math.PI * fc / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
    const a0 = 1 + al / A;
    f.b0 = (1 + al * A) / a0; f.b1 = -2 * c / a0; f.b2 = (1 - al * A) / a0; f.a1 = -2 * c / a0; f.a2 = (1 - al / A) / a0;
    return f;
  }
  static lowpass(fc, q, sr = SR) {
    const f = new Biquad(), w = 2 * Math.PI * fc / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
    f.b0 = f.b2 = (1 - c) / 2 / a0; f.b1 = (1 - c) / a0; f.a1 = -2 * c / a0; f.a2 = (1 - al) / a0;
    return f;
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
  resp(w) {
    const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = this.b0 + this.b1 * c1 + this.b2 * c2, ni = -this.b1 * s1 - this.b2 * s2;
    const dr = 1 + this.a1 * c1 + this.a2 * c2, di = -this.a1 * s1 - this.a2 * s2, d = dr * dr + di * di;
    return [(nr * dr + ni * di) / d, (ni * dr - nr * di) / d];
  }
}

// Phase delay in samples of a chain of filters at angular frequency w.
export function phaseDelay(filters, w) {
  let ph = 0;
  for (const f of filters) { const [re, im] = f.resp(w); ph += Math.atan2(im, re); }
  return -ph / w;
}

export class Delay {
  constructor(maxLen) { let s = 1; while (s < maxLen + 8) s <<= 1; this.buf = new Float64Array(s); this.mask = s - 1; this.w = 0; }
  write(x) { this.buf[this.w] = x; this.w = (this.w + 1) & this.mask; }
  // Read `d` samples back (d >= 2) with cubic Hermite interpolation; d = 1 is the last written sample.
  read(d) {
    const di = Math.floor(d), fr = d - di, b = this.buf, m = this.mask, base = this.w - di;
    const y0 = b[(base + 1) & m], y1 = b[base & m], y2 = b[(base - 1) & m], y3 = b[(base - 2) & m];
    const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return ((c3 * fr + c2) * fr + c1) * fr + y1;
  }
}

// Smooth random drift, unit variance-ish, band-limited around `hz`.
export class Wander {
  constructor(rand, hz, sr = SR) { this.r = rand; this.a = new OnePoleLP(hz, sr); this.b = new OnePoleLP(hz, sr); this.g = Math.sqrt(sr / (hz * 2)); }
  tick() { return this.g * this.b.tick(this.a.tick(this.r() * 2 - 1)); }
}

// Windowed-sinc low-pass FIR (Blackman window) for decimating the oversampled model to SR.
export function decimate(x, factor, taps = 96) {
  const fc = 0.45 / factor, h = new Float64Array(taps), mid = (taps - 1) / 2;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const t = i - mid, sinc = t === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * t) / (Math.PI * t);
    const win = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (taps - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (taps - 1));
    h[i] = sinc * win; sum += h[i];
  }
  const n = Math.floor(x.length / factor), y = new Float64Array(n), off = Math.round(mid);
  for (let j = 0; j < n; j++) {
    let acc = 0;
    const c = j * factor + off;
    for (let i = 0; i < taps; i++) { const k = c - i; if (k >= 0 && k < x.length) acc += h[i] * x[k]; }
    y[j] = acc / sum;
  }
  return y;
}
