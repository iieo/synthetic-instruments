import { SR, rng, midiToHz } from '../lib/audio.mjs';
import { noteSeed } from './synth/dsp.mjs';
import { biquad } from './drums/dsp.mjs';
import { SECTIONS, seating } from './string-ensemble/sections.mjs';
import { bowedVoice, pizzVoice, strokeSeconds } from './string-ensemble/voice.mjs';
import { hall, HALL_T60 } from './string-ensemble/hall.mjs';

export const meta = {
  name: 'String Ensemble',
  range: [36, 96],
  presets: ['legato', 'staccato', 'tremolo', 'pizzicato'],
};

export const RANGE = { velocity: [0.01, 1], duration: [0.05, 20], hall: [0, 1] };

// Output gain per preset and a level trim in dB for every MIDI note from 36 to 96. The trim evens
// out the register (two sections share the middle, body resonances favour some notes); it was set
// so that the loudest of several seeds at velocity 1, with and without hall, peaks near -3 dBFS.
const GAIN = { legato: 0.5, staccato: 0.5, tremolo: 0.5, pizzicato: 0.8 };
const TRIM = {
  legato: [3.0, -2.0, -2.0, -2.1, -4.0, -4.1, -4.3, -3.9, -4.3, -4.5, -4.8, -1.2, -5.0, -5.2, -5.5, -7.0, -7.3, -8.0, -7.9, -7.0, -7.7, -8.3, -7.8, -7.2, -5.5, -4.9, -3.4, -2.8, 2.4, 3.3, -1.9, -3.0, -4.1, -7.3, -7.3, -8.9, -8.9, -7.7, -5.0, -0.6, 0.3, 1.1, -2.2, -1.0, -1.9, -1.9, -2.3, -1.6, -1.8, 0.8, 4.0, 1.7, 2.3, 1.8, -0.1, -0.1, -0.1, 1.0, 1.4, 1.1, 1.0],
  staccato: [1.4, 1.1, 0.8, 1.8, -0.2, -0.7, -1.3, -1.1, -2.6, -2.6, -1.9, 2.2, -0.8, -1.9, -3.3, -3.3, -5.0, -5.0, -5.0, -5.0, -5.0, -5.2, -4.1, -4.8, -5.0, -4.0, -0.8, 0.3, 5.0, 5.0, 1.4, 1.0, -0.3, -3.8, -3.8, -6.7, -6.7, -5.8, 0.6, 1.5, 4.4, 5.0, 0.9, 1.0, 0.3, 2.0, 2.5, 3.3, 3.6, 3.5, 4.3, 5.2, 5.1, 3.2, 2.9, 2.6, 2.3, 4.0, 3.9, 2.7, 2.6],
  tremolo: [1.0, 0.3, 0.5, 0.9, -2.6, -2.2, -3.2, -3.8, -3.5, -2.3, -0.2, -0.3, -2.0, -2.4, -2.8, -3.8, -6.1, -6.0, -6.0, -3.5, -5.1, -5.5, -5.3, -5.2, -6.6, -6.1, -3.8, -3.4, 3.3, 2.7, 3.5, 1.6, -1.0, -5.9, -5.9, -6.0, -4.8, -5.6, -4.4, -1.6, 1.4, 2.0, -0.7, 1.1, -0.5, -0.2, -0.8, 0.7, 0.6, 0.7, 4.8, 2.3, 2.4, 0.5, 1.3, 1.3, 1.8, 1.8, 2.1, 0.3, 0.8],
  pizzicato: [2.3, 1.5, 0.7, -1.4, -1.9, -4.1, -2.4, -2.6, -3.0, -2.2, -2.0, 2.5, -1.2, -2.3, -2.9, -3.0, -6.3, -6.5, -6.7, -4.3, -6.1, -5.0, -3.3, -1.2, -4.8, -4.4, -0.4, 0.1, 3.9, 3.0, 4.9, -0.1, -1.6, -2.2, -2.2, -2.2, -1.0, 0.3, -1.3, 0.5, 1.3, 0.4, 0.4, 0.4, 4.3, 3.7, 4.2, 1.5, 2.9, 2.9, 3.4, 7.2, 6.2, 3.3, 3.3, 3.3, 4.3, 4.7, 4.7, 2.9, 3.0],
};

const trimDb = (preset, midi) => TRIM[preset][midi - 36];

function num(name, v, def, [lo, hi]) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`string-ensemble: ${name} must be a finite number, got ${String(v)}`);
  return Math.min(hi, Math.max(lo, v));
}

function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

export function render({ midi = 60, velocity = 0.7, duration = 2, preset = 'legato', seed = 1, hall: wet = 0.35 } = {}) {
  if (preset == null) preset = 'legato';
  if (!meta.presets.includes(preset)) throw new Error(`string-ensemble: unknown preset ${String(preset)}`);
  midi = Math.round(num('midi', midi, 60, meta.range));
  const vel = num('velocity', velocity, 0.7, RANGE.velocity);
  const dur = num('duration', duration, 2, RANGE.duration);
  wet = num('hall', wet, 0.35, RANGE.hall);
  seed = num('seed', seed, 1, [-Infinity, Infinity]);
  const r = rng(noteSeed(seed, [midi], `ensemble-${preset}`));

  const maxOnset = { legato: 0.045, staccato: 0.014, tremolo: 0.02, pizzicato: 0.025 }[preset];
  const ring = preset === 'pizzicato' ? 0.25 : preset === 'staccato' ? 0.25 : 0.35;
  const played = preset === 'pizzicato' ? dur : strokeSeconds(preset, dur, midiToHz(midi));
  const nDry = Math.round((maxOnset + played + ring) * SR);
  const tail = wet > 0 ? HALL_T60 : 0;
  const n = nDry + Math.round(tail * SR);
  const L = new Float64Array(n), R = new Float64Array(n);

  for (const [name, count] of seating(midi)) {
    const sec = SECTIONS[name];
    const nb = sec.bodies.length;
    const xl = Array.from({ length: nb }, () => new Float64Array(nDry)), xr = Array.from({ length: nb }, () => new Float64Array(nDry));
    for (let v = 0; v < count; v++) {
      const vr = rng(noteSeed(seed, [midi, v], `${name}-${preset}`));
      const cents = Math.max(-9, Math.min(9, 3.5 * gauss(vr)));
      const start = Math.round(maxOnset * vr() ** 1.5 * SR);
      const p = {
        midi, cents, start, n: nDry, dur: played, vel: Math.min(1, vel * (0.9 + 0.2 * vr())), preset, sec, rand: vr,
        vib: { rate: 4.7 + 1.4 * vr(), depth: 7 + 11 * vr(), delay: 0.12 + 0.3 * vr() },
        pressure: 0.85 + 0.3 * vr(), speed: 0.9 + 0.2 * vr(), beta: 0.12 + 0.05 * vr(),
        trem: 5.8 + 1.7 * vr(), attack: 0.16 + 0.12 * vr(),
      };
      const y = preset === 'pizzicato' ? pizzVoice(p) : bowedVoice(p);
      const pan = sec.pan[0] + (sec.pan[1] - sec.pan[0]) * ((v + 0.5) / count + 0.15 * (vr() - 0.5));
      const th = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
      const gl = Math.cos(th), gr = Math.sin(th);
      const bl = xl[v % nb], br = xr[v % nb];
      for (let i = 0; i < nDry; i++) { bl[i] += gl * y[i]; br[i] += gr * y[i]; }
    }
    const g = (sec.gain * GAIN[preset] * 10 ** (trimDb(preset, midi) / 20)) / Math.sqrt(count);
    for (const [xs, out] of [[xl, L], [xr, R]]) {
      const sum = new Float64Array(nDry);
      xs.forEach((x, b) => { const y = sec.bodies[b](x); for (let i = 0; i < nDry; i++) sum[i] += y[i]; });
      const y = biquad(biquad(sum, 'hp', sec.hp, 0.707), 'hp', sec.hp, 0.707);
      for (let i = 0; i < nDry; i++) out[i] += g * y[i];
    }
  }

  if (wet > 0) {
    const [wl, wr] = hall([L.slice(0, nDry), R.slice(0, nDry)], n);
    const dry = 1 - 0.35 * wet;
    for (let i = 0; i < n; i++) { L[i] = dry * L[i] + wet * wl[i]; R[i] = dry * R[i] + wet * wr[i]; }
  }
  const fade = Math.round(0.06 * SR);
  for (const x of [L, R]) {
    for (let i = 0; i < fade; i++) x[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    x[0] = 0; x[n - 1] = 0;
  }
  return [L, R];
}
