import { SR, rng } from '../lib/audio.mjs';
import { clamp, fadeIn, fadeOut, noteSeed } from './synth/dsp.mjs';
import { StepRenderer, HALF } from './square-chip/blep.mjs';
import * as E from './beeper/engines.mjs';
import { cone, piezo } from './beeper/speaker.mjs';

export const CHORDS = {
  major: [0, 4, 7], minor: [0, 3, 7], sus4: [0, 5, 7], dim: [0, 3, 6], power: [0, 7], octave: [0, 12],
};

const PRESETS = {
  square: { engine: E.square, speaker: cone },
  pwm: { engine: E.pwm, speaker: cone },
  chord: { engine: E.chord, speaker: cone },
  'pin-pulse': { engine: E.pin, speaker: cone },
  'drum-kick': { engine: E.kick, speaker: cone, drum: true },
  'drum-noise': { engine: E.noise, speaker: cone, drum: true },
  piezo: { engine: E.piezo, speaker: piezo },
};

export const meta = { name: 'Beeper', range: [24, 96], presets: Object.keys(PRESETS), chord: Object.keys(CHORDS) };

// Fixed output gain per preset, calibrated over range, options and seeds so the loudest note at
// velocity 1 peaks near -1.5 dBFS.
const GAIN = { square: 0.515, pwm: 0.5, chord: 0.54, 'pin-pulse': 1.26, 'drum-kick': 0.55, 'drum-noise': 0.6, piezo: 2.6 };

const PAD = HALF + 8;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`beeper: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

/**
 * One note from a 1-bit speaker. The routine writes the port on a 3.5 MHz CPU cycle grid (the
 * piezo preset on a 32768 Hz timer), the edges are rendered band-limited and then pass through a
 * speaker model. `velocity` is the volume knob after the speaker, `duration` the note length
 * (drums are one-shots, drum-noise opens up from 0.2 s). `duty` 0.02..0.98 fixes the pulse width
 * of pwm (default: sweep from thin to fat), `chord` sets the notes of chord and pin-pulse.
 */
export function render({ midi = 60, velocity = 0.8, duration = 0.5, seed = 1, preset = 'square', duty, chord = 'major' } = {}) {
  if (preset == null) preset = 'square';
  const P = PRESETS[preset];
  if (!P) throw new Error(`beeper: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  if (chord == null) chord = 'major';
  if (!CHORDS[chord]) throw new Error(`beeper: chord must be one of ${meta.chord.join(', ')}, got ${chord}`);
  midi = Math.round(num('midi', midi, 60, meta.range[0], meta.range[1]));
  const vel = num('velocity', velocity, 0.8, 0, 1);
  const dur = num('duration', duration, 0.5, 0.01, 30);
  num('seed', seed, 1, -Infinity, Infinity);
  const fixedDuty = num('duty', duty, null, 0.02, 0.98);

  const rand = rng(noteSeed(seed, [midi], `beeper-${preset}`));
  const sweep = Math.max(0.3, dur);
  const note = {
    midi, dur, rand,
    notes: CHORDS[chord].map((iv) => Math.min(meta.range[1] + 12, midi + iv)),
    duty: fixedDuty != null ? () => fixedDuty : (t) => 0.03 + 0.47 * Math.min(1, t / sweep),
    width: (t) => 4 + 44 * Math.exp(-t / 0.35),
    shift: clamp(midi - 60, -12, 24),
    decay: dur >= 0.2 ? 0.15 : 0.05,
  };

  // Collect the port writes first; the length of the buffer follows from the routine's end time.
  const edges = [];
  let level = 0;
  const endT = P.engine(note, (T, bit) => {
    if (bit !== level) { edges.push(T, bit - level); level = bit; }
  });
  const off = rand(), tail = Math.round(0.06 * SR);
  const r = new StepRenderer(PAD + Math.ceil(endT * SR / E.CPU) + HALF + tail);
  for (let i = 0; i < edges.length; i += 2) r.step(PAD + off + edges[i] * SR / E.CPU, edges[i + 1]);
  const y = P.speaker(r.finish());

  const g = GAIN[preset] * vel;
  for (let i = 0; i < y.length; i++) y[i] *= g;
  fadeIn([y], PAD / SR);
  fadeOut([y], 0.003);
  return y;
}
