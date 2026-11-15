import { SR } from '../../lib/audio.mjs';

const FREE_FREE_BETA = [4.73004, 7.85320, 10.99561, 14.13717, 17.27876, 20.42035, 23.56194, 26.70354];
const CLAMPED_FREE_BETA = [1.87510, 4.69409, 7.85476, 10.99554, 14.13717, 17.27876];

export const freeFreeRatios = FREE_FREE_BETA.map((b) => (b / FREE_FREE_BETA[0]) ** 2);
export const clampedFreeRatios = CLAMPED_FREE_BETA.map((b) => (b / CLAMPED_FREE_BETA[0]) ** 2);

// Euler-Bernoulli mode shape of a uniform beam, x in [0, 1], normalized so that |phi| at a free end is 2.
export function freeFreeShape(n, x) {
  const b = FREE_FREE_BETA[n];
  const s = (Math.cosh(b) - Math.cos(b)) / (Math.sinh(b) - Math.sin(b));
  const bx = b * x;
  return Math.cosh(bx) + Math.cos(bx) - s * (Math.sinh(bx) + Math.sin(bx));
}

export function clampedFreeShape(n, x) {
  const b = CLAMPED_FREE_BETA[n];
  const s = (Math.cosh(b) + Math.cos(b)) / (Math.sinh(b) + Math.sin(b));
  const bx = b * x;
  return Math.cosh(bx) - Math.cos(bx) - s * (Math.sinh(bx) - Math.sin(bx));
}

// Near a free end every mode sits close to an antinode of the same sign, so the modes add up in phase
// and the strike peaks several dB higher. The signed, weighted sum of the mode shapes tracks that peak;
// above its largest value between 0.15 and 0.5 of the length the strike is scaled back, which keeps
// the timbre of an edge stroke but not its extra level.
export function strikeGain(weights, x) {
  const sum = (xx) => Math.abs(weights.reduce((s, w, n) => s + freeFreeShape(n, xx) * w, 0));
  let ref = 0;
  for (let xx = 0.15; xx <= 0.5 + 1e-9; xx += 0.01) ref = Math.max(ref, sum(xx));
  return Math.min(1, ref / sum(x));
}

const pulseCache = new Map();

// Hertzian contact of a mallet against a (locally rigid) bar: m x'' = -K x^p.
// The force shape is universal in scaled time, so it is integrated once per exponent.
function unitPulse(p) {
  // Quantised so the cache stays small when velocity and hardness vary continuously.
  p = Math.round(p * 100) / 100;
  if (pulseCache.has(p)) return pulseCache.get(p);
  const dt = 1e-4;
  let x = 0, v = 1;
  const f = [0];
  while (true) {
    const a1 = -(x > 0 ? x ** p : 0);
    const xm = x + v * dt / 2, vm = v + a1 * dt / 2;
    const a2 = -(xm > 0 ? xm ** p : 0);
    x += vm * dt; v += a2 * dt;
    if (x <= 0) break;
    f.push(x ** p);
  }
  f.push(0);
  pulseCache.set(p, f);
  return f;
}

// Force pulse sampled at SR. `contact` is the contact time in seconds, `impulse` the total momentum transfer.
export function hertzPulse(contact, exponent, impulse) {
  const shape = unitPulse(exponent);
  const n = Math.max(3, Math.round(contact * SR));
  const out = new Float64Array(n + 1);
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const pos = (i / n) * (shape.length - 1);
    const k = Math.floor(pos), fr = pos - k;
    const v = k + 1 < shape.length ? shape[k] * (1 - fr) + shape[k + 1] * fr : 0;
    out[i] = v; sum += v;
  }
  for (let i = 0; i <= n; i++) out[i] *= impulse / sum;
  return out;
}

// Contact time of a Hertz impact scales with impact speed as v^((1-p)/(1+p)).
export const contactTime = (t0, exponent, speed) => t0 * speed ** ((1 - exponent) / (1 + exponent));

// Two-pole resonator whose impulse response is amp * e^(-t/tau) * sin(2 pi f t).
// `dampAt` (sample index) switches to `tauDamped` when a damper touches the bar.
// `mod` is an optional per-sample gain (tremolo).
export function addMode(out, input, { f, tau, amp, tauDamped = 0, dampAt = Infinity, mod = null }) {
  if (f <= 0 || f >= SR * 0.45 || amp === 0) return;
  const w = (2 * Math.PI * f) / SR;
  const c = 2 * Math.cos(w), b = Math.sin(w) * amp;
  let r = Math.exp(-1 / (tau * SR));
  let a1 = c * r, a2 = r * r;
  const rd = tauDamped > 0 ? Math.exp(-1 / (tauDamped * SR)) : r;
  let y1 = 0, y2 = 0;
  const n = out.length, nin = input.length;
  for (let i = 0; i < n; i++) {
    if (i === dampAt) { r = rd; a1 = c * r; a2 = r * r; }
    const x = i > 0 && i - 1 < nin ? input[i - 1] : 0;
    const y = a1 * y1 - a2 * y2 + b * x;
    y2 = y1; y1 = y;
    out[i] += mod ? y * mod[i] : y;
    if (i > nin + 8 && i > dampAt && Math.abs(y1) + Math.abs(y2) < 1e-10 * amp) break;
  }
}

// Constant-peak-gain band-pass resonator for an arbitrary input (tube, box), gain 1 at f.
export function resonate(input, f, q, gain = 1) {
  const out = new Float64Array(input.length);
  const r = Math.exp(-Math.PI * f / (q * SR));
  const a1 = 2 * r * Math.cos((2 * Math.PI * f) / SR), a2 = r * r;
  const g = gain * (1 - r * r) / 2;
  let y1 = 0, y2 = 0, x1 = 0, x2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = a1 * y1 - a2 * y2 + g * (x - x2);
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

// Length (s) until the slowest mode has decayed by `db`.
export const decayLength = (taus, db = 70, max = 20) =>
  Math.min(max, Math.max(...taus) * db / 8.686 + 0.05);

// Raised-cosine fade on the last `sec` seconds so every note ends exactly at zero.
export function fadeTail(buf, sec = 0.05) {
  const n = Math.min(buf.length, Math.round(sec * SR));
  for (let i = 0; i < n; i++) {
    const j = buf.length - n + i;
    buf[j] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / n);
  }
  return buf;
}

// Strike tick: a short velocity-dependent click from the contact itself (felt/wood/metal noise),
// band-limited by the contact time.
export function contactNoise(n, contact, amp, rand) {
  const out = new Float64Array(n);
  const len = Math.min(n, Math.max(Math.round(contact * SR * 3), Math.round(0.0015 * SR)));
  let lp = 0;
  const a = Math.exp(-2 * Math.PI * Math.min(7000, 2.5 / contact) / SR);
  for (let i = 0; i < len; i++) {
    const env = Math.sin((Math.PI * i) / len) ** 2;
    lp = a * lp + (1 - a) * (rand() * 2 - 1);
    out[i] = lp * env * amp;
  }
  return out;
}

// Missing midi falls back to middle C; out-of-range notes are clamped to the instrument's range.
export function noteMidi(name, midi, range) {
  if (midi === undefined) midi = 60;
  return clamp(finite(name, 'midi', midi), range[0], range[1]);
}

export function finite(name, key, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name}: ${key} must be a finite number, got ${v}`);
  return v;
}

export const jitter = (rand, amount) => 1 + (rand() * 2 - 1) * amount;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Gentle high-shelf weighting to keep metal partials from getting shrill above ~8 kHz.
export const airRolloff = (f, fc = 8000, order = 2) => 1 / Math.sqrt(1 + (f / fc) ** (2 * order));

export const lerp = (a, b, t) => a + (b - a) * t;
export const logInterp = (pts, f) => {
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (f <= pts[i][0]) {
      const t = Math.log(f / pts[i - 1][0]) / Math.log(pts[i][0] / pts[i - 1][0]);
      return pts[i - 1][1] * (pts[i][1] / pts[i - 1][1]) ** t;
    }
  }
  return pts[pts.length - 1][1];
};
