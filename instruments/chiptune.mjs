import { SR, rng } from '../lib/audio.mjs';
import { clamp, OnePole, fadeIn, fadeOut, noteSeed } from './synth/dsp.mjs';
import { Channel, runChip, BLEP_HALF } from './chiptune/chip.mjs';
import { PRESETS, CHORDS } from './chiptune/presets.mjs';

export const meta = {
  name: 'Chiptune', range: [24, 96], presets: Object.keys(PRESETS),
  arp: Object.keys(CHORDS), crush: ['off', 8, 4],
};

// Fixed output gain per preset: worst note over range, options and seeds at velocity 1 peaks
// near -1.5 dBFS; presets with long-mode noise near -2 dBFS, since their peak depends on the seed
// (kick stays below -1.7 dBFS over 3000 seeds).
const GAIN = {
  lead: 0.815, arp: 0.785, bass: 0.64, pulse12: 0.785, pulse25: 0.81, pulse50: 0.815, triangle: 0.865, wave: 0.915,
  noise: 0.645, 'noise-short': 0.705, kick: 0.54, snare: 0.42, hat: 0.7, laser: 0.78, coin: 0.815,
};

const PAD = BLEP_HALF + 8;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`chiptune: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

function dacFor(crush) {
  if (crush == null || crush === 'off' || crush === false || crush === 0) return (x) => x;
  if (crush !== 4 && crush !== 8 && crush !== '4' && crush !== '8') {
    throw new Error(`chiptune: crush must be 'off', 4 or 8, got ${crush}`);
  }
  const q = 2 ** Number(crush) - 1;
  return (x) => Math.round(x * q) / q;
}

/**
 * One note on the modelled sound chip. `midi` sets the pitch (drums and noise map it to their
 * pitch, see docs/chiptune.md), `velocity` the 4-bit volume, `duration` the gate (one-shot drums
 * ignore it). `vibrato` 0..1 overrides the preset's delayed vibrato, `arp` picks the chord for
 * the arp preset, `crush` re-quantises each channel's DAC to 4 or 8 bits.
 */
export function render({
  midi = 60, velocity = 0.8, duration = 0.5, seed = 1, preset = 'lead', vibrato, arp = 'major', crush = 'off',
} = {}) {
  if (preset == null) preset = 'lead';
  const P = typeof preset === 'string' && Object.hasOwn(PRESETS, preset) ? PRESETS[preset] : null;
  if (!P) throw new Error(`chiptune: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  if (arp == null) arp = 'major';
  if (typeof arp !== 'string' || !Object.hasOwn(CHORDS, arp)) throw new Error(`chiptune: arp must be one of ${meta.arp.join(', ')}, got ${arp}`);
  midi = Math.round(num('midi', midi, 60, meta.range[0], meta.range[1]));
  const vel = num('velocity', velocity, 0.8, 0, 1);
  const dur = num('duration', duration, 0.5, 0.01, 30);
  num('seed', seed, 1, -Infinity, Infinity);
  const vib = num('vibrato', vibrato, P.vibrato, 0, 1);
  const dac = dacFor(crush);

  const rand = rng(noteSeed(seed, [midi], `chiptune-${preset}`));
  const chans = P.chans.map((kind) => {
    const c = new Channel(kind);
    if (kind === 'noise') {
      // Random point on the register's cycle; short mode keeps state 1's 93-step loop.
      c.lfsr = 1;
      const skip = Math.floor(rand() * 32767);
      for (let i = 0; i < skip % (preset === 'hat' || preset === 'noise-short' ? 93 : 32767); i++) {
        const fb = (c.lfsr ^ (c.lfsr >> (preset === 'hat' || preset === 'noise-short' ? 6 : 1))) & 1;
        c.lfsr = (c.lfsr >> 1) | (fb << 14);
      }
    }
    return c;
  });
  const note = { midi, V: Math.round(vel * 15), gate: Math.max(1, Math.round(dur * 60)), vibrato: vib, chord: CHORDS[arp] };
  const frames = P.frames(note);
  const y = runChip(chans, (h, cs) => P.drive(h, cs, note), 2 * frames, { dac, pad: PAD, tail: Math.round(0.08 * SR) });

  // Analog output stage: coupling capacitor (high-pass 30 Hz) and RC low-pass at 14 kHz.
  const hp = new OnePole(30), lp = new OnePole(14000), g = GAIN[preset];
  for (let i = 0; i < y.length; i++) y[i] = lp.lp(hp.hp(y[i])) * g;
  fadeIn([y], PAD / SR);
  fadeOut([y], 0.002);
  return y;
}
