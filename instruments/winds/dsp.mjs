import { SR, rng } from '../../lib/audio.mjs';

export class DelayLine {
  constructor(maxSamples) {
    let n = 1;
    while (n < maxSamples + 8) n <<= 1;
    this.buf = new Float64Array(n);
    this.mask = n - 1;
    this.w = 0;
  }
  write(x) {
    this.buf[this.w] = x;
    this.w = (this.w + 1) & this.mask;
  }
  // Value written `d` samples ago (d >= 1, fractional), third-order Lagrange interpolation.
  read(d) {
    const di = Math.floor(d) - 1;
    const f = d - di;
    const b = this.buf, m = this.mask, base = this.w - 1 - di;
    const x0 = b[(base + 1) & m], x1 = b[base & m], x2 = b[(base - 1) & m], x3 = b[(base - 2) & m];
    const fm1 = f - 1, fm2 = f - 2, fm3 = f - 3;
    return -x0 * fm1 * fm2 * fm3 / 6 + x1 * f * fm2 * fm3 / 2 - x2 * f * fm1 * fm3 / 2 + x3 * f * fm1 * fm2 / 6;
  }
}

export const onePoleCoef = (fc) => Math.exp(-2 * Math.PI * fc / SR);

export class OnePole {
  constructor(fc) { this.p = onePoleCoef(fc); this.y = 0; }
  set(fc) { this.p = onePoleCoef(fc); }
  tick(x) { this.y = x + this.p * (this.y - x); return this.y; }
}

// Phase delay in samples of y = (1-p)x + p y[n-1] at angular frequency w (rad/sample).
export const onePolePhaseDelay = (p, w) => Math.atan2(p * Math.sin(w), 1 - p * Math.cos(w)) / w;

export class DcBlock {
  constructor(fc = 20) { this.r = onePoleCoef(fc); this.x1 = 0; this.y1 = 0; }
  tick(x) { const y = x - this.x1 + this.r * this.y1; this.x1 = x; this.y1 = y; return y; }
}
// Phase delay of the DC blocker (negative: it leads).
export function dcBlockPhaseDelay(r, w) {
  const num = Math.atan2(Math.sin(w), 1 - Math.cos(w));
  const den = Math.atan2(r * Math.sin(w), 1 - r * Math.cos(w));
  return -(num - den) / w;
}

// Two-pole resonant bandpass (constant peak gain), used for turbulence colouring.
export class Resonator {
  constructor(fc, q) { this.set(fc, q); this.y1 = 0; this.y2 = 0; }
  set(fc, q) {
    const w = 2 * Math.PI * fc / SR, r = Math.exp(-w / (2 * q));
    this.a1 = 2 * r * Math.cos(w); this.a2 = -r * r; this.g = 1 - r;
  }
  tick(x) { const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

// Smooth random wander: lowpassed white noise with unit-ish standard deviation.
export class Wander {
  constructor(seed, fc) {
    this.r = rng(seed); this.p = onePoleCoef(fc); this.y = 0; this.y2 = 0;
    this.norm = Math.sqrt((1 + this.p) / (1 - this.p)) * 1.7;
    for (let i = 0; i < SR; i++) this.tick();
  }
  tick() {
    const x = (this.r() + this.r() + this.r() - 1.5) * 2;
    this.y = x + this.p * (this.y - x);
    this.y2 = this.y + this.p * (this.y2 - this.y);
    return this.y2 * this.norm;
  }
}

export const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Breath envelope: attack, sustain, release in seconds, smooth (raised-cosine) edges.
export function breathEnvelope(n, attack, holdEnd, release) {
  const e = new Float64Array(n);
  const aN = Math.max(1, Math.round(attack * SR)), hN = Math.round(holdEnd * SR), rN = Math.max(1, Math.round(release * SR));
  for (let i = 0; i < n; i++) {
    let v = i < aN ? 0.5 - 0.5 * Math.cos(Math.PI * i / aN) : 1;
    if (i >= hN) v *= i - hN >= rN ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (i - hN) / rN);
    e[i] = v;
  }
  return e;
}

// Fade the first and last samples to exactly zero.
export function fadeEdges(y, inMs = 1, outMs = 20) {
  const a = Math.min(y.length, Math.round(inMs * SR / 1000)), b = Math.min(y.length, Math.round(outMs * SR / 1000));
  for (let i = 0; i < a; i++) y[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / a);
  for (let i = 0; i < b; i++) y[y.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / b);
  y[0] = 0; y[y.length - 1] = 0;
  return y;
}
