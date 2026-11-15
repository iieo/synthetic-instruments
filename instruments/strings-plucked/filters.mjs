import { SR } from '../../lib/audio.mjs';

export function onePoleMag(a, w) {
  return (1 - a) / Math.sqrt(1 - 2 * a * Math.cos(w) + a * a);
}

export function lowpassPhase(a, w) {
  return -Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w));
}

// First order allpass (c + z^-1) / (1 + c z^-1).
export function allpassPhase(c, w) {
  return -w + 2 * Math.atan2(c * Math.sin(w), 1 + c * Math.cos(w));
}

export function allpassDelay(c, w) {
  return -allpassPhase(c, w) / w;
}

// Coefficient of a first order allpass whose phase delay at w equals d (0.3 < d < 1.7).
export function allpassForDelay(d, w) {
  let lo = -0.999, hi = 0.999;
  for (let i = 0; i < 60; i++) {
    const c = (lo + hi) / 2;
    if (allpassDelay(c, w) > d) lo = c; else hi = c;
  }
  return (lo + hi) / 2;
}

export class Biquad {
  constructor(b0, b1, b2, a1, a2) {
    Object.assign(this, { b0, b1, b2, a1, a2 });
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  step(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  run(buf) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.step(buf[i]);
    return buf;
  }
}

// Two-pole resonator normalised to unit peak gain, used for body modes.
export function resonator(freq, q, gain = 1) {
  const w = 2 * Math.PI * freq / SR;
  const r = Math.exp(-w / (2 * q));
  const a1 = -2 * r * Math.cos(w), a2 = r * r;
  const g = gain * (1 - r * r) / 2;
  return new Biquad(g, 0, -g, a1, a2);
}

function rbj(type, freq, q) {
  const w = 2 * Math.PI * freq / SR, cw = Math.cos(w), sw = Math.sin(w);
  const al = sw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') {
    b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
  } else if (type === 'hp') {
    b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
  }
  return new Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

export const lowpass = (f, q = Math.SQRT1_2) => rbj('lp', f, q);
export const highpass = (f, q = Math.SQRT1_2) => rbj('hp', f, q);

export function dcBlock(buf, fc = 15) {
  const R = Math.exp(-2 * Math.PI * fc / SR);
  let x1 = 0, y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const y = buf[i] - x1 + R * y1;
    x1 = buf[i]; y1 = y; buf[i] = y;
  }
  return buf;
}
