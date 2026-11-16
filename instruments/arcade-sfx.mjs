import { SR, rng } from '../lib/audio.mjs';
import { clamp, fadeOut, noteSeed } from './synth/dsp.mjs';
import { hz, divHz, pulse, lfsr, whiteNoise, rcLow, rcHigh, twoPole, capEnv, rcTriangle } from './arcade-sfx/circuits.mjs';

const VOICES = {
  laser: { midi: 96, range: [60, 108], length: 0.32 },
  explosion: { length: 2.2 },
  siren: { release: 0.03, midi: 70, range: [48, 96], length: 3.5, tempo: 40 },
  ufo: { release: 0.03, midi: 82, range: [60, 100], length: 2.5, tempo: 420 },
  march: { midi: 40, range: [28, 52], tempo: 100 },
  coin: { midi: 88, range: [72, 100], length: 0.45 },
  powerup: { midi: 64, range: [48, 84], length: 0.55 },
  hit: { midi: 64, range: [36, 84], length: 0.28 },
  alarm: { release: 0.03, midi: 81, range: [60, 96], length: 2.5, tempo: 240 },
  engine: { release: 0.03, length: 2.5, rpm: 1800 },
  fanfare: { midi: 72, range: [55, 91], length: 1.0 },
  lose: { midi: 67, range: [48, 84], length: 1.6 },
};

export const meta = { name: 'Arcade SFX', range: [24, 108], voices: Object.keys(VOICES) };

// Fixed gain per voice: the loudest note over midi, tempo, rpm, length, velocity and seeds peaks
// near -1.5 dBFS.
const GAIN = {
  laser: 0.757, explosion: 0.475, siren: 0.743, ufo: 0.48, march: 0.53, coin: 0.777, powerup: 0.514, hit: 0.449,
  alarm: 0.623, engine: 0.333, fanfare: 0.428, lose: 0.564,
};

const MARCH_STEPS = [0, -2, -3, -5];

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`arcade-sfx: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

const time = (i) => i / SR;

// Swept VCO: frequency relaxes exponentially from f0 to f1 like a capacitor discharging through
// the control resistor, the tone decays with its own RC.
function laser({ n, f0, T }) {
  const f1 = f0 / 14, tau = T / 5;
  const tone = pulse(n, (i) => f1 + (f0 - f1) * Math.exp(-time(i) / tau));
  const y = rcLow(tone, () => 5500);
  for (let i = 0; i < n; i++) y[i] *= capEnv(time(i), 0.0008, T / 2.6);
  return y;
}

// Junction noise through a two-pole low-pass whose cutoff falls with the discharge, plus a short
// bright crack and a low rumble.
function explosion({ n, T, r }) {
  const src = whiteNoise(n, r), tau = T / 3.2;
  const body = twoPole(src, (i) => 180 + 2600 * Math.exp(-time(i) / (tau * 0.35)), 0.9);
  const rumble = twoPole(whiteNoise(n, r), () => 90, 1.4);
  const crack = rcLow(rcHigh(src, 1200), () => 12000);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = time(i);
    y[i] = capEnv(t, 0.002, tau) * (body[i] + 1.6 * rumble[i]) + 0.5 * capEnv(t, 0.001, 0.018) * crack[i];
  }
  return y;
}

// VCO swept by a slow triangle from the capacitor of an astable; square output rounded by a
// two-pole filter that tracks the pitch.
function siren({ n, f0, rate }) {
  const fr = (i) => f0 * 2 ** (0.9 * (0.5 + 0.5 * rcTriangle((time(i) * rate + 0.75) % 1, 0.5)));
  const tone = pulse(n, fr);
  const y = twoPole(tone, (i) => 2.2 * fr(i), 0.7);
  for (let i = 0; i < n; i++) y[i] *= capEnv(time(i), 0.04, 1e9);
  return y;
}

// VCO warbled by a fast astable whose capacitor voltage (rounded square) moves the pitch, on top
// of a slow drift; the output passes a band-pass for a hollow tone.
function ufo({ n, f0, rate, r }) {
  const ph = r();
  const fr = (i) => {
    const t = time(i);
    const w = rcTriangle((t * rate + ph) % 1, 0.5);
    return f0 * 2 ** ((2.5 * Math.tanh(1.8 * w) / Math.tanh(1.8) + 0.8 * Math.sin(2 * Math.PI * 0.6 * t)) / 12);
  };
  const tone = pulse(n, fr, () => 0.5, r());
  const y = twoPole(tone, (i) => 1.3 * fr(i), 1.6, 'bp');
  for (let i = 0; i < n; i++) y[i] *= capEnv(time(i), 0.03, 1e9);
  return y;
}

// Four bass steps from the divider, each a short thump: square into a resonant low-pass, its
// amplitude a capacitor discharge retriggered on every step.
function march({ n, midi, rate }) {
  const step = SR / rate, decay = Math.min(0.16, 0.5 / rate);
  const fr = (i) => divHz(hz(midi + MARCH_STEPS[Math.floor(i / step) % 4]));
  const tone = pulse(n, fr);
  const y = twoPole(tone, (i) => 3.2 * fr(i), 1.1);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / step), t = (i - Math.round(k * step)) / SR;
    y[i] *= capEnv(t, 0.0015, decay) * (t < 1 / rate - 0.004 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * clamp((t - (1 / rate - 0.004)) / 0.004, 0, 1)));
  }
  return y;
}

// Notes from the divider: [semitones, start s, length s, duty]; each gated by a fast RC.
function notes(n, midi, list, decay, lp = 7000) {
  const y = new Float64Array(n);
  for (const [semi, t0, len, duty] of list) {
    const a = Math.round(t0 * SR), m = Math.min(n - a, Math.round(len * SR));
    if (m <= 0) continue;
    const f = divHz(hz(midi + semi));
    const tone = pulse(m, () => f, () => duty);
    const rel = Math.min(0.006, len / 4);
    for (let i = 0; i < m; i++) {
      const t = i / SR, g = t > len - rel ? 0.5 + 0.5 * Math.cos(Math.PI * (t - len + rel) / rel) : 1;
      y[a + i] += tone[i] * capEnv(t, 0.0015, decay(len)) * g;
    }
  }
  return rcLow(y, () => lp);
}

const coin = ({ n, midi, T }) => notes(n, midi, [[0, 0, 0.065, 0.5], [7, 0.065, T - 0.065, 0.5]], (len) => (len > 0.1 ? len / 2.5 : 1e9));

function powerup({ n, midi, T }) {
  const arp = [0, 4, 7, 12, 16, 19, 24, 28];
  const d = Math.max(0.02, (T - 0.12) / arp.length);
  return notes(n, midi, arp.map((s, k) => [s, k * d, k === arp.length - 1 ? T - k * d : d, 0.25]), (len) => (len > 0.1 ? len / 2 : 1e9));
}

function fanfare({ n, midi, T }) {
  const u = T / 1.0;
  const line = [[0, 0, 0.08], [4, 0.09, 0.08], [7, 0.18, 0.08], [4, 0.27, 0.06], [9, 0.34, 0.08], [12, 0.44, 0.56]];
  const lead = line.map(([s, a, l]) => [s, a * u, l * u, 0.5]);
  const bass = [[-12, 0, 0.42 * u, 0.25], [-7, 0.44 * u, 0.56 * u, 0.25]];
  const y = notes(n, midi, lead, (len) => (len > 0.2 ? len / 1.5 : 1e9));
  const b = notes(n, midi, bass, (len) => len / 1.2, 3000);
  for (let i = 0; i < n; i++) y[i] += 0.55 * b[i];
  return y;
}

function lose({ n, midi, T }) {
  const u = T / 1.6;
  const line = [[0, 0, 0.22], [-3, 0.26, 0.22], [-5, 0.52, 0.22], [-8, 0.78, 0.82]];
  const y = new Float64Array(n);
  for (const [semi, a0, len0] of line) {
    const a = Math.round(a0 * u * SR), len = len0 * u, m = Math.min(n - a, Math.round(len * SR));
    if (m <= 0) continue;
    const last = semi === -8;
    // A slow droop on every note and a wobble on the last, from the divider reloading new values.
    const fr = (i) => {
      const t = i / SR;
      return divHz(hz(midi + semi - 0.4 * t / len + (last ? 0.25 * Math.sin(2 * Math.PI * 6 * t) * Math.min(1, t / 0.2) : 0)));
    };
    const tone = pulse(m, fr, () => 0.5);
    const rel = Math.min(0.02, len / 4);
    for (let i = 0; i < m; i++) {
      const t = i / SR, g = t > len - rel ? 0.5 + 0.5 * Math.cos(Math.PI * (t - len + rel) / rel) : 1;
      y[a + i] += tone[i] * capEnv(t, 0.002, last ? len / 1.8 : 0.5) * g;
    }
  }
  return twoPole(y, () => 2600, 0.8);
}

// A noise burst and a square whose pitch drops fast, both decaying.
function hit({ n, midi, T, r }) {
  const f0 = hz(midi + 12), f1 = hz(midi - 24);
  const tone = rcLow(pulse(n, (i) => f1 + (f0 - f1) * Math.exp(-time(i) / 0.025)), () => 4000);
  const nz = twoPole(whiteNoise(n, r), () => 2500, 0.8);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = time(i);
    y[i] = capEnv(t, 0.0006, T / 4.5) * tone[i] + 0.8 * capEnv(t, 0.0004, 0.012) * nz[i];
  }
  return y;
}

// Two astables: a slow one switches the control voltage of the tone oscillator through an RC
// (a short glide between the two pitches).
function alarm({ n, midi, rate }) {
  const hi = Math.log2(hz(midi)), lo = Math.log2(hz(midi - 5)), a = 1 - Math.exp(-1 / (0.006 * SR));
  const lf = new Float64Array(n);
  let cv = hi;
  for (let i = 0; i < n; i++) {
    const target = Math.floor(time(i) * rate) % 2 ? lo : hi;
    cv += a * (target - cv);
    lf[i] = 2 ** cv;
  }
  const tone = pulse(n, (i) => lf[i], () => 0.62);
  const y = rcLow(rcLow(tone, () => 4500), () => 9000);
  for (let i = 0; i < n; i++) y[i] *= capEnv(time(i), 0.005, 1e9);
  return y;
}

// Firing pulses at rpm / 30 (four cylinders, four strokes): a narrow pulse whose period jitters
// with the long noise register, into a resonant low-pass for the exhaust body.
function engine({ n, rpm, r }) {
  const f = rpm / 30;
  const jit = rcLow(lfsr(n, () => f * 1.7, 1 + Math.floor(r() * 131070)), () => f * 0.7);
  const fr = (i) => f * (1 + 0.09 * jit[i]);
  const tone = pulse(n, fr, () => 0.18, r());
  const body = twoPole(tone, () => Math.min(2400, 4 * f), 1.8);
  const grit = rcLow(rcHigh(lfsr(n, () => 9000, 1 + Math.floor(r() * 131070)), 500), () => 6000);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = capEnv(time(i), 0.06, 1e9) * (body[i] + 0.06 * grit[i] * (0.6 + 0.4 * tone[i]));
  return y;
}

const RENDER = { laser, explosion, siren, ufo, march, coin, powerup, hit, alarm, engine, fanfare, lose };

/**
 * One sound effect from a modelled arcade circuit. `voice` picks the circuit; `midi` sets the
 * pitch of the pitched ones (others ignore it), `tempo` the rate of march, siren, ufo and alarm,
 * `rpm` the engine speed, `length` the duration in seconds. Returns a mono Float64Array.
 */
export function render({ voice = 'laser', midi, velocity = 0.8, seed = 1, length, tempo, rpm } = {}) {
  if (voice == null) voice = 'laser';
  const V = VOICES[voice];
  if (!V) throw new Error(`arcade-sfx: unknown voice ${voice}, use one of ${meta.voices.join(', ')}`);
  const [lo, hi] = V.range ?? meta.range;
  const m = clamp(num('midi', midi, V.midi ?? 60, meta.range[0], meta.range[1]), lo, hi);
  const vel = num('velocity', velocity, 0.8, 0, 1);
  num('seed', seed, 1, -Infinity, Infinity);
  const bpm = num('tempo', tempo, V.tempo ?? 120, 30, 960);
  const rp = num('rpm', rpm, V.rpm ?? 1800, 400, 9000);
  const defLen = voice === 'march' ? 8 * 60 / bpm : V.length;
  const T = num('length', length, defLen, 0.05, 20);

  const r = rng(noteSeed(seed, [m], `arcade-sfx-${voice}`));
  const n = Math.max(2, Math.round(T * SR));
  const y = RENDER[voice]({ n, T, midi: m, f0: hz(m), rate: bpm / 60, rpm: rp, r });
  // Output stage: coupling capacitor into the cabinet amplifier.
  const out = rcHigh(y, 20);
  const g = GAIN[voice] * vel ** 1.2;
  for (let i = 0; i < n; i++) out[i] *= g;
  fadeOut([out], Math.min(V.release ?? 0.004, T / 4));
  return out;
}
