import { midiToHz, rng } from '../lib/audio.mjs';
import { clamp, decimate, dcBlock, fadeIn, fadeOut, ceilPeak, noteSeed } from './synth/dsp.mjs';
import { Chip, FRAME_TICKS } from './homecomputer-synth/chip.mjs';
import { PRESETS, CHORDS } from './homecomputer-synth/presets.mjs';

export const meta = {
  name: 'Heimcomputer-Synth', range: [24, 96], presets: Object.keys(PRESETS), chords: Object.keys(CHORDS),
};

// Fixed output gain per preset: the loudest note of the sweep over range, options, velocities and
// seeds peaks near -2 dBFS.
const GAIN = {
  bass: 0.256, lead: 0.451, 'sync-lead': 0.669, 'ring-bell': 0.349, arp: 0.418, pad: 0.19, combo: 0.419,
  'drum-kick': 0.584, 'drum-snare': 0.73,
};
// Drums take the note as their tuning: midi 60 gives a kick body at 65 Hz and a snare at 196 Hz.
const DRUM_SHIFT = { 'drum-kick': -24, 'drum-snare': -5 };
const MAX_TAIL_FRAMES = 50 * 30;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`homecomputer-synth: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

/**
 * One note on the modelled three-voice chip. `duration` is the gate time, rounded to the 50 Hz
 * frame grid of the player routine; drums ignore it. `filter` (0..1) sets the cutoff register,
 * `resonance` (0..1) the 4-bit resonance, `pw` (0..1) the pulse width from 2 % to 98 % duty.
 * Unset options take the preset's values. `chord` picks the arpeggio of the arp preset.
 */
export function render({
  midi = 60, velocity = 0.8, duration = 0.5, seed = 1, preset = 'lead', filter, resonance, pw, chord = 'major',
} = {}) {
  if (preset == null) preset = 'lead';
  const P = Object.hasOwn(PRESETS, preset) ? PRESETS[preset] : null;
  if (!P) throw new Error(`homecomputer-synth: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  if (chord == null) chord = 'major';
  if (!Object.hasOwn(CHORDS, chord)) throw new Error(`homecomputer-synth: chord must be one of ${meta.chords.join(', ')}, got ${chord}`);
  midi = Math.round(num('midi', midi, 60, ...meta.range));
  const vel = num('velocity', velocity, 0.8, 0, 1);
  const dur = num('duration', duration, 0.5, 0.01, 30);
  num('seed', seed, 1, -Infinity, Infinity);
  const fOpt = num('filter', filter, P.filter, 0, 1);
  const rOpt = num('resonance', resonance, P.resonance, 0, 1);
  const pOpt = num('pw', pw, P.pw, 0, 1);

  const rand = rng(noteSeed(seed, [midi], `homecomputer-synth-${preset}`));
  const c = new Chip();
  // A running chip: oscillators and noise registers are wherever the last notes left them.
  for (const v of c.v) {
    v.acc = Math.floor(rand() * 0x1000000);
    v.lfsr = 1 + Math.floor(rand() * 0x7ffffe);
  }
  c.res = Math.round(rOpt * 15);
  c.cut = Math.round(fOpt * 2047);
  c.vol = Math.max(1, Math.round(15 * vel));
  const o = {
    f0: midiToHz(midi + (DRUM_SHIFT[preset] || 0)),
    cut: c.cut,
    pw: Math.round(80 + pOpt * (4015 - 80)),
    pwmDepth: Math.round(900 * Math.min(pOpt, 1 - pOpt) / 0.5 + 200),
    envAmt: 0.55 + 0.45 * vel,
    chord: CHORDS[chord],
  };
  P.setup(c, o);

  const offFrame = P.oneShot ?? Math.max(1, Math.round(dur * 50));
  const gated = P.oneShot ? [0] : P.gated;
  const out = [];
  let k = 0;
  for (; ; k++) {
    P.frame(k, c, o);
    for (const v of c.v) v.pw = clamp(v.pw, 24, 4071);
    for (const i of gated) c.v[i].setGate(k < offFrame);
    c.run(FRAME_TICKS, out);
    if (k >= offFrame && c.levels().every((l) => l === 0)) break;
    if (k > offFrame + MAX_TAIL_FRAMES) break;
  }
  // Let the filter, the analog stage and the resampler ring out.
  c.run(FRAME_TICKS * 2, out);

  const y = decimate(Float64Array.from(out), 2);
  dcBlock(y, 16);
  const g = GAIN[preset];
  for (let i = 0; i < y.length; i++) y[i] *= g;
  fadeIn([y], 0.0005);
  fadeOut([y], 0.01);
  ceilPeak([y], -1);
  return y;
}
