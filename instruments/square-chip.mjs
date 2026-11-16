import { SR, rng } from '../lib/audio.mjs';
import { clamp, OnePole, fadeIn, fadeOut, noteSeed } from './synth/dsp.mjs';
import { runChip, VOL, SHAPES, REPEATING } from './square-chip/chip.mjs';
import { PRESETS, CHORDS } from './square-chip/presets.mjs';
import { HALF } from './square-chip/blep.mjs';

export const meta = {
  name: 'Square Chip', range: [24, 96], presets: Object.keys(PRESETS),
  envelopeShape: Object.keys(SHAPES), arp: Object.keys(CHORDS),
};

// Fixed output gain per preset, calibrated over range, options, velocities and seeds so the
// loudest note at velocity 1 peaks near -1.5 dBFS.
const GAIN = {
  square: 0.8, 'echo-lead': 0.8, arp: 0.8, 'buzz-saw': 0.8, 'buzz-tri': 0.8, 'env-pluck': 0.79,
  'noise-hat': 0.73, 'noise-snare': 0.52, kick: 0.52,
};

const PAD = HALF + 8;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`square-chip: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

/**
 * One note on the modelled three-channel square-wave chip. `velocity` sets the 4-bit volume
 * register (envelope presets: an analog gain in the same 3 dB steps), `duration` the gate (drums
 * are one-shots; the hat opens from 0.2 s). `vibrato` 0..1 overrides the preset's delayed
 * vibrato, `envelopeShape` picks the hardware envelope for buzz-saw, buzz-tri and env-pluck,
 * `arp` the chord of the arp preset.
 */
export function render({
  midi = 60, velocity = 0.8, duration = 0.5, seed = 1, preset = 'square', vibrato, envelopeShape, arp = 'major',
} = {}) {
  if (preset == null) preset = 'square';
  const P = PRESETS[preset];
  if (!P) throw new Error(`square-chip: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  if (arp == null) arp = 'major';
  if (!CHORDS[arp]) throw new Error(`square-chip: arp must be one of ${meta.arp.join(', ')}, got ${arp}`);
  if (envelopeShape != null && !(envelopeShape in SHAPES)) {
    throw new Error(`square-chip: envelopeShape must be one of ${meta.envelopeShape.join(', ')}, got ${envelopeShape}`);
  }
  const shape = envelopeShape ?? P.shape ?? 'decay';
  if (P.buzz && !REPEATING.includes(shape)) {
    throw new Error(`square-chip: ${preset} needs a repeating envelopeShape (${REPEATING.join(', ')}), got ${shape}`);
  }
  midi = Math.round(num('midi', midi, 60, meta.range[0], meta.range[1]));
  const vel = num('velocity', velocity, 0.8, 0, 1);
  const dur = num('duration', duration, 0.5, 0.01, 30);
  num('seed', seed, 1, -Infinity, Infinity);
  const vib = num('vibrato', vibrato, P.vibrato ?? 0, 0, 1);

  // Velocity is a linear amplitude, rounded to the nearest 3 dB step of the volume register.
  const V = vel > 0 ? clamp(Math.round(15 + 20 * Math.log10(vel) / 3.01), 1, 15) : 0;
  const rand = rng(noteSeed(seed, [midi], `square-chip-${preset}`));
  const note = {
    midi, V: P.post ? 15 : V, dur, vib, chord: CHORDS[arp], shape, repeating: REPEATING.includes(shape),
    gate: Math.max(1, Math.round(dur * P.rate)),
  };
  const y = runChip({
    ticks: P.frames(note), rate: P.rate, drive: (k, r) => P.drive(k, r, note), rand,
    pad: PAD, tail: Math.round(0.12 * SR),
  });

  // Analog output: coupling capacitor (high-pass 12 Hz) and an RC low-pass at 14 kHz.
  const hp = new OnePole(12), lp = new OnePole(14000);
  const g = GAIN[preset] * (P.post ? VOL[V] : 1);
  for (let i = 0; i < y.length; i++) y[i] = lp.lp(hp.hp(y[i])) * g;
  fadeIn([y], PAD / SR);
  fadeOut([y], 0.003);
  return y;
}
