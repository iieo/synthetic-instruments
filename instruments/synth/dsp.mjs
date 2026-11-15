import { SR } from '../../lib/audio.mjs';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Two-sample polynomial correction for a unit upward step at phase 0 (t is the phase after the
// step, dt the phase increment per sample).
export function polyblep(t, dt) {
  if (t < dt) { const x = t / dt; return 2 * x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + 2 * x + 1; }
  return 0;
}

export function sawBL(t, dt) {
  return 2 * t - 1 - polyblep(t, dt);
}

// Pulse with duty cycle pw, mean removed.
export function pulseBL(t, dt, pw) {
  let t2 = t + 1 - pw;
  if (t2 >= 1) t2 -= 1;
  return (t < pw ? 1 : -1) + polyblep(t, dt) - polyblep(t2, dt) - (2 * pw - 1);
}

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-15 * sum) break;
  }
  return sum;
}

// Windowed-sinc low-pass (Kaiser window), odd length, unity gain at DC. fc in cycles per sample.
export function kaiserLowpass(taps, fc, beta) {
  const h = new Float64Array(taps), M = (taps - 1) / 2, i0 = besselI0(beta);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - M;
    const s = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    h[i] = s * besselI0(beta * Math.sqrt(Math.max(0, 1 - (x / M) ** 2))) / i0;
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  return h;
}

const firs = new Map();
// Low-pass at 20.5 kHz and keep every os-th sample, delay-compensated.
export function decimate(x, os) {
  if (os === 1) return Float64Array.from(x);
  if (!firs.has(os)) firs.set(os, kaiserLowpass(72 * os + 1, 20500 / (SR * os), 9.5));
  const h = firs.get(os), N = h.length, D = (N - 1) / 2;
  const m = Math.floor(x.length / os), y = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const c = j * os + D;
    const lo = Math.max(0, c - x.length + 1), hi = Math.min(N - 1, c);
    let acc = 0;
    for (let i = lo; i <= hi; i++) acc += h[i] * x[c - i];
    y[j] = acc;
  }
  return y;
}

// Linear state-variable filter, trapezoidal integration with the loop solved in closed form.
// Stable under per-sample coefficient changes.
export class SVF {
  constructor(fs = SR) { this.fs = fs; this.s1 = 0; this.s2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; this.set(1000, 0.707); }
  set(fc, q) {
    const g = Math.tan(Math.PI * clamp(fc, 5, 0.45 * this.fs) / this.fs);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  tick(x) {
    const v3 = x - this.s2;
    const v1 = this.a1 * this.s1 + this.a2 * v3;
    const v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    this.bp = v1; this.lp = v2; this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

export class OnePole {
  constructor(fc, fs = SR) { this.a = Math.exp(-2 * Math.PI * fc / fs); this.y = 0; this.x1 = 0; this.hpY = 0; }
  lp(x) { this.y = x + this.a * (this.y - x); return this.y; }
  hp(x) { this.hpY = this.a * (this.hpY + x - this.x1); this.x1 = x; return this.hpY; }
}

export function dcBlock(x, fc = 10) {
  const f = new OnePole(fc);
  for (let i = 0; i < x.length; i++) x[i] = f.hp(x[i]);
}

export function fadeIn(chs, seconds) {
  const n = Math.max(1, Math.round(seconds * SR));
  for (const x of chs) for (let i = 0; i < Math.min(n, x.length); i++) x[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / n);
}

export function fadeOut(chs, seconds) {
  const n = Math.max(1, Math.round(seconds * SR));
  for (const x of chs) {
    const len = x.length, m = Math.min(n, len);
    for (let i = 0; i < m; i++) x[len - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / m);
  }
}

// Gate envelope: raised-cosine attack, exponential decay to sustain, raised-cosine release from
// whatever level it has at the gate, so it starts and ends at exactly zero.
export function adsr({ a, d, s, r, gate }) {
  const held = (t) => (t < a ? 0.5 - 0.5 * Math.cos(Math.PI * t / a) : s + (1 - s) * Math.exp(-(t - a) / d));
  const g = Math.max(gate, 1e-4), atGate = held(Math.min(g, a + 50 * d));
  return (t) => {
    if (t < g) return held(t);
    const u = t - g;
    return u >= r ? 0 : atGate * (0.5 + 0.5 * Math.cos(Math.PI * u / r));
  };
}

// Pitch offset in semitones: a number, a function of time, or breakpoints [[t, semis], ...].
export function bendFn(bend) {
  if (bend == null) return () => 0;
  if (typeof bend === 'number') return () => bend;
  if (typeof bend === 'function') return bend;
  const pts = [...bend].sort((p, q) => p[0] - q[0]);
  if (!pts.length) return () => 0;
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        const [t0, s0] = pts[i - 1], [t1, s1] = pts[i];
        return t1 === t0 ? s1 : s0 + (s1 - s0) * (t - t0) / (t1 - t0);
      }
    }
    return pts[pts.length - 1][1];
  };
}

// Per-sample frequency ratio at rate fs. `from` is a start offset in semitones that slides into the
// note with time constant `glide`; `extra(t)` adds preset-internal modulation in semitones.
export function pitchCurve(n, fs, { bend, glide = 0.04, from = 0, extra = () => 0 }) {
  const b = bendFn(bend), out = new Float64Array(n);
  const a = glide > 0 ? 1 - Math.exp(-1 / (glide * fs)) : 1;
  let s = b(0) + from;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    s += a * (b(t) - s);
    out[i] = 2 ** ((s + extra(t)) / 12);
  }
  return out;
}

// Safety ceiling: if a note would peak above `db` dBFS (chords whose partials line up, strong echo
// build-up), the whole note gets one linear gain down to it. Below the ceiling nothing changes.
export function ceilPeak(chs, db = -1.2) {
  const ceil = 10 ** (db / 20);
  let peak = 0;
  for (const x of chs) for (const s of x) peak = Math.max(peak, Math.abs(s));
  if (peak > ceil) for (const x of chs) for (let i = 0; i < x.length; i++) x[i] *= ceil / peak;
  return chs;
}

// Seed as a 32-bit integer. Small integers pass through unchanged; any other number is hashed from
// all 64 bits of its double, so 1.5 and 1 give different streams.
export function seedInt(seed) {
  const s = Number(seed) || 0;
  if ((s | 0) === s) return s;
  const [lo, hi] = new Uint32Array(new Float64Array([s]).buffer);
  return (Math.imul(lo ^ 0x85ebca6b, 0xcc9e2d51) ^ Math.imul(hi ^ 0x27d4eb2f, 0x1b873593)) | 0;
}

// Seeded generator from the note parameters, so equal inputs give identical output.
export function noteSeed(seed, notes, salt) {
  let h = Math.imul(seedInt(seed) ^ 0x9e3779b9, 2654435761) >>> 0;
  for (const m of notes) h = (Math.imul(h ^ Math.round(m * 16), 2246822519) + 3266489917) >>> 0;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}
