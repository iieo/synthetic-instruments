import { SR, rng, midiToHz } from '../lib/audio.mjs';
import { butter } from './techno-kick/dsp.mjs';
import { noise, svf, saw, sine, edges, panInto } from './fx/dsp.mjs';
import { snare } from './breakbeat/voices.mjs';
import { seedInt } from './synth/dsp.mjs';

export const meta = {
  name: 'FX',
  voices: ['riser', 'downlifter', 'impact', 'snareRoll', 'laser', 'sweep'],
};

// Default length in beats (tempo-bound effects) or seconds (one-shots).
const BEATS = { riser: 8, downlifter: 4, snareRoll: 8, sweep: 4 };
const SECONDS = { impact: 2.5, laser: 0.35 };
// Fixed gains so a full-velocity render peaks near -1.5 dBFS.
const LEVEL = { riser: 0.8, downlifter: 0.345, impact: 0.47, snareRoll: 0.35, laser: 0.88, sweep: 0.76 };

const expGlide = (a, b, x) => a * (b / a) ** x;

// Noise rising through a band-pass that opens and narrows, under three detuned saws per side that
// climb two octaves behind an opening low-pass.
function riser(r, n) {
  const L = new Float64Array(n), R = new Float64Array(n);
  const u = (i) => i / n;
  for (const [out, det] of [[L, [-11, 0, 7]], [R, [-7, 0, 11]]]) {
    const nz = svf(noise(n, r), 'bp', (i) => expGlide(300, 11000, u(i) ** 1.4), (i) => 1 + 2.5 * u(i));
    let tone = new Float64Array(n);
    for (const c of det) {
      const s = saw(n, (i) => midiToHz(45 + 24 * u(i) ** 1.3 + c / 100), r());
      for (let i = 0; i < n; i++) tone[i] += s[i] / 3;
    }
    tone = svf(tone, 'lp', (i) => expGlide(250, 9000, u(i)), () => 1.6);
    for (let i = 0; i < n; i++) out[i] = 0.9 * nz[i] * u(i) ** 2.2 + 0.45 * tone[i] * u(i) ** 1.6;
  }
  return [L, R, 0.005, 0.012];
}

// Falling low-pass noise and a falling sine, the stereo width closing as it fades.
function downlifter(r, n) {
  const u = (i) => i / n;
  const fc = (i) => expGlide(12000, 160, u(i) ** 0.7);
  const mid = svf(noise(n, r), 'lp', fc, () => 1.4), side = svf(noise(n, r), 'lp', fc, () => 1.4);
  const tone = sine(n, (i) => expGlide(1100, 45, u(i) ** 0.6));
  const L = new Float64Array(n), R = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (1 - u(i)) ** 1.6, m = 0.8 * mid[i] + 0.5 * tone[i], s = 0.6 * (1 - u(i)) * side[i];
    L[i] = a * (m + s); R[i] = a * (m - s);
  }
  return [L, R, 0.003, 0.02];
}

// Sub boom (a sine falling from about 160 Hz to 34 Hz), a short low-passed noise burst and a long,
// decorrelated high noise tail for the stereo wash.
function impact(r, n, T) {
  const fso = SR, t = (i) => i / fso;
  const sub = sine(n, (i) => 34 * 2 ** (2.2 * Math.exp(-t(i) / 0.035)) * (1 + 0.12 * Math.exp(-t(i) / 0.4)));
  const burst = svf(noise(n, r), 'lp', () => 5000, () => 0.7);
  const wl = svf(noise(n, r), 'hp', () => 2500, () => 0.7), wr = svf(noise(n, r), 'hp', () => 2500, () => 0.7);
  const L = new Float64Array(n), R = new Float64Array(n);
  const ts = T * 0.3, tw = T * 0.22;
  for (let i = 0; i < n; i++) {
    const s = t(i), es = s < 0.03 ? 1 : Math.exp(-(s - 0.03) / ts);
    const m = 1.1 * sub[i] * es + 0.7 * burst[i] * Math.exp(-s / 0.05);
    const w = 0.22 * Math.exp(-s / tw) * Math.min(1, s / 0.01);
    L[i] = m + w * wl[i]; R[i] = m + w * wr[i];
  }
  return [L, R, 0.0008, 0.05];
}

// Snare hits on a grid that doubles every quarter of the length (quarters, eighths, sixteenths,
// thirty-seconds), getting louder, higher and thinner towards the drop.
function snareRoll(r, n, T, bpm) {
  const beat = 60 / bpm, L = new Float64Array(n), R = new Float64Array(n);
  let k = 0;
  for (let sec = 0; sec < 4; sec++) {
    const step = beat / 2 ** sec, t0 = (sec * T) / 4, t1 = ((sec + 1) * T) / 4;
    for (let t = t0; t < t1 - 1e-9; t += step) {
      const u = t / T;
      const x = snare(r, 0.45 + 0.55 * u ** 1.2, { tune: 7 * u, decay: 0.8 - 0.3 * u });
      const start = Math.round(t * SR), side = (k++ % 2 ? 1 : -1) * 0.2 * u;
      panInto(L, R, x, () => side, Math.SQRT2 * (0.35 + 0.65 * u ** 1.5), start);
    }
  }
  const fc = (i) => expGlide(90, 700, i / n);
  return [svf(L, 'hp', fc, () => 0.7), svf(R, 'hp', fc, () => 0.7), 0.002, 0.012];
}

// Laser: odd sine harmonics (an additive square, so nothing above the cutoff exists) gliding down
// fast. The right side is a few cents sharp and 7 ms late, which spreads it across the stereo field.
function laser(r, n, T) {
  const zap = (cents, delay) => {
    const y = new Float64Array(n), d = Math.round(delay * SR), tau = T * 0.18;
    const ph = new Float64Array(8);
    for (let i = d; i < n; i++) {
      const t = (i - d) / SR, f = (180 + 3800 * Math.exp(-t / tau)) * 2 ** (cents / 1200);
      let v = 0;
      for (let h = 1, j = 0; h <= 15; h += 2, j++) {
        const fh = f * h;
        if (fh < 16000) v += (Math.sin(ph[j]) / h) * Math.min(1, (16000 - fh) / 2000);
        ph[j] += (2 * Math.PI * fh) / SR;
      }
      y[i] = v * Math.exp(-t / (T * 0.4)) * Math.min(1, t / 0.001);
    }
    return y;
  };
  return [zap(0, 0), zap(18, 0.007), 0.0005, 0.01];
}

// Whoosh: noise through a band-pass that goes up and back down while it pans from left to right.
function sweep(r, n) {
  const u = (i) => i / n;
  const env = (i) => Math.sin(Math.PI * u(i)) ** 1.3;
  const fc = (i) => expGlide(200, 8000, Math.sin(Math.PI * u(i)));
  const a = svf(noise(n, r), 'bp', fc, () => 1.8), b = svf(noise(n, r), 'bp', fc, () => 1.8);
  const L = new Float64Array(n), R = new Float64Array(n);
  panInto(L, R, a.map((v, i) => v * env(i)), (i) => -0.8 + 1.6 * u(i), Math.SQRT2);
  for (let i = 0; i < n; i++) { L[i] += 0.25 * env(i) * b[i]; R[i] -= 0.25 * env(i) * b[i]; }
  return [L, R, 0.002, 0.002];
}

export function render({ voice = 'riser', velocity = 0.8, seed = 1, bpm = 150, beats, seconds } = {}) {
  if (!meta.voices.includes(voice)) throw new Error(`unknown voice ${voice}`);
  const r = rng((seedInt(seed) * 2246822519) ^ (meta.voices.indexOf(voice) * 3266489917 + 3));
  const vel = Math.max(0, Math.min(1, velocity));
  const beat = 60 / Math.max(40, Math.min(300, bpm));
  let T = seconds ?? (beats != null ? beats * beat : BEATS[voice] ? BEATS[voice] * beat : SECONDS[voice]);
  T = Math.max(0.05, Math.min(32, T));
  const n = Math.round(T * SR);
  let out;
  if (voice === 'riser') out = riser(r, n);
  else if (voice === 'downlifter') out = downlifter(r, n);
  else if (voice === 'impact') out = impact(r, n, T);
  else if (voice === 'snareRoll') out = snareRoll(r, n, T, 60 / beat);
  else if (voice === 'laser') out = laser(r, n, T);
  else out = sweep(r, n);
  const [L, R, fin, fout] = out, g = LEVEL[voice] * vel ** 1.2;
  return [L, R].map((ch) => {
    const y = butter(ch, 'hp', 20, 2);
    for (let i = 0; i < y.length; i++) y[i] *= g;
    return edges(y, fin * SR, fout * SR);
  });
}
