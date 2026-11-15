import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { decimate, dcBlock, fadeIn, fadeOut, ceilPeak, noteSeed, clamp, SVF } from './synth/dsp.mjs';
import { adlerStep, adlerRatio, detector, maxRatio } from './theremin/heterodyne.mjs';

// glide: time constant of the pitch hand (s); vibrato: depth in semitones; swell: volume-hand
// attack (s); r: detector amplitude ratio from pianissimo to fortissimo; kappa: oscillator
// coupling at 220 Hz.
const PRESETS = {
  classic: { glide: 0.07, vibrato: 0.22, vibratoRate: 6, swell: 0.18, r: [0.12, 0.62], kappa: 0.35 },
  scifi: { glide: 0.25, vibrato: 0.9, vibratoRate: 7.2, swell: 0.35, r: [0.2, 0.7], kappa: 0.55 },
  soft: { glide: 0.1, vibrato: 0.15, vibratoRate: 5.2, swell: 0.45, r: [0.05, 0.3], kappa: 0.15 },
};

export const meta = { name: 'Theremin', range: [36, 96], presets: Object.keys(PRESETS) };

// Fixed output scale: worst case over presets, the whole range, vibrato and coupling extremes
// peaks near -1 dBFS at velocity 1.
const OUT_GAIN = 0.72;
const OS = 4;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`theremin: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

// Smooth random drift in [-1, 1]: cosine interpolation between random points `every` seconds apart.
function drift(rand, every) {
  const pts = [rand() * 2 - 1, rand() * 2 - 1];
  let k = 0;
  return (t) => {
    const u = t / every;
    while (u >= k + 1) { pts.push(rand() * 2 - 1); k++; }
    const f = u - k;
    return pts[k] + (pts[k + 1] - pts[k]) * (0.5 - 0.5 * Math.cos(Math.PI * f));
  };
}

/**
 * A held tone or a legato line. `line` is [[seconds, midi], ...]: the pitch hand moves to each
 * note at its time and stays until the next; with `line` the first entry replaces `midi`.
 * `from` starts the tone at another pitch and glides into `midi`. `glide`, `vibrato` (semitones),
 * `vibratoRate` (Hz) and `swell` (s) override the preset.
 */
export function render({
  midi = 60, velocity = 0.8, duration = 1, seed = 1, preset = 'classic', glide, vibrato, vibratoRate, swell, from, line,
} = {}) {
  if (preset == null) preset = 'classic';
  const P = PRESETS[preset];
  if (!P) throw new Error(`theremin: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  const [lo, hi] = meta.range;
  midi = num('midi', midi, 60, lo, hi);
  const vel = num('velocity', velocity, 0.8, 0, 1);
  duration = num('duration', duration, 1, 0.02, 60);
  num('seed', seed, 1, -Infinity, Infinity);
  const gl = num('glide', glide, P.glide, 0.005, 2);
  const vib = num('vibrato', vibrato, P.vibrato, 0, 2);
  const vRate = num('vibratoRate', vibratoRate, P.vibratoRate, 2, 10);
  const sw = num('swell', swell, P.swell, 0.005, 3);

  let pts;
  if (line != null) {
    if (!Array.isArray(line)) throw new Error('theremin: line must be an array of [seconds, midi] pairs');
    pts = line.map((p, i) => {
      if (!Array.isArray(p) || p.length < 2) throw new Error(`theremin: line[${i}] must be [seconds, midi]`);
      return [num(`line[${i}] time`, p[0], 0, 0, duration), num(`line[${i}] midi`, p[1], 60, lo, hi)];
    }).sort((a, b) => a[0] - b[0]);
  }
  if (!pts || pts.length === 0) pts = [[0, midi]];
  const start = from == null ? pts[0][1] : num('from', from, midi, lo, hi);

  const rand = rng(noteSeed(seed, [pts[0][1]], 'theremin'));
  const fs = SR * OS, dt = 1 / fs;
  const rel = 0.12;
  const pre = Math.round(0.0015 * fs);
  const n = pre + Math.round((duration + rel + 0.02) * fs);
  const out = new Float64Array(n);
  const rateDrift = drift(rand, 0.9), pitchDrift = drift(rand, 0.6), ampDrift = drift(rand, 0.7);
  const a1 = 1 - Math.exp(-dt / (gl / 2)), ab = 1 - Math.exp(-dt / 0.04);
  let s1 = start, s2 = start, k = 0, target = pts[0][1], lastMove = 0;
  let bloom = 0, vibPh = rand(), phi = 2 * Math.PI * rand();
  const TWO_PI = 2 * Math.PI;
  for (let i = pre; i < n; i++) {
    const t = (i - pre) * dt;
    while (k < pts.length && t >= pts[k][0]) {
      if (pts[k][1] !== target) lastMove = pts[k][0];
      target = pts[k++][1];
    }
    s1 += a1 * (target - s1); s2 += a1 * (s1 - s2);
    // Vibrato comes in once the hand has settled on a note, the way a player lets it bloom.
    bloom += ab * (clamp((t - lastMove - 0.15) / 0.45, 0, 1) - bloom);
    const sway = Math.sin(TWO_PI * vibPh);
    vibPh += vRate * (1 + 0.05 * rateDrift(t)) * dt;
    if (vibPh >= 1) vibPh -= 1;
    const semis = s2 + vib * bloom * (0.85 + 0.15 * ampDrift(t)) * sway + 0.03 * pitchDrift(t);
    const f = midiToHz(semis);

    // Volume hand: raised-cosine swell and release, a little breathing, a dip while gliding.
    let env = t < sw ? 0.5 - 0.5 * Math.cos(Math.PI * t / sw) : 1;
    if (t >= duration) { const u = (t - duration) / rel; env *= u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u); }
    env *= (1 - 0.18 * clamp(Math.abs(s1 - s2) / 1.5, 0, 1)) * (1 + 0.03 * ampDrift(t + 3.1) + 0.025 * bloom * sway);
    const level = env * vel;

    const kappa = clamp(P.kappa * (f / 220) ** -0.4, 0, 0.9);
    let r = P.r[0] + (P.r[1] - P.r[0]) * clamp(level, 0, 1);
    let q = adlerRatio(kappa);
    const lim = maxRatio(f, fs);
    let kap = kappa;
    if (r + q > lim) { const sc = lim / (r + q); r *= sc; q *= sc; kap = 2 * q / (1 - q * q); }
    phi = adlerStep(phi, TWO_PI * f, kap, dt);
    if (phi > TWO_PI) phi -= TWO_PI;
    const e = detector(phi, r);
    out[i] = level * (e - (1 + 0.25 * r * r)) / Math.max(r, 1e-3);
  }
  const y = decimate(out, OS);
  // Audio amplifier and loudspeaker of the cabinet.
  const hp = new SVF(), lp = new SVF();
  hp.set(75, 0.6); lp.set(5500, 0.7);
  for (let i = 0; i < y.length; i++) { hp.tick(y[i]); y[i] = lp.tick(hp.hp) * OUT_GAIN; }
  dcBlock(y, 8);
  fadeIn([y], 0.001);
  fadeOut([y], 0.004);
  ceilPeak([y], -1);
  return y;
}
