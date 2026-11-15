import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/trumpet.mjs';
import { room } from '../instruments/trumpet/room.mjs';
import { outPath } from './lib/out.mjs';

// Jazz ballad line in E-flat major at 66 bpm, lightly swung eighths.
const BPM = 66, beat = 60 / BPM, SWING = 0.58;
const at = (b) => {
  const whole = Math.floor(b), frac = b - whole;
  return (whole + (Math.abs(frac - 0.5) < 1e-9 ? SWING : frac)) * beat + 0.3;
};

const notes = [];
// [beat, midi, beats, velocity, extra options]
const line = [
  // Phrase 1: soft and warm, scooped into the first long note.
  [0, 70, 0.5, 0.42, { tongue: 0.3 }], [0.5, 72, 0.5, 0.45, { tongue: 0.2 }],
  [1, 75, 2.5, 0.5, { scoop: 1.5, tongue: 0.2 }],
  [3.5, 74, 0.5, 0.46, { tongue: 0.2 }], [4, 72, 1, 0.46, { tongue: 0.2 }], [5, 70, 1, 0.44, { tongue: 0.2 }],
  [6, 67, 2.2, [0.45, 0.35], { tongue: 0.2 }],
  // Phrase 2: tongued staccato pickup, then legato again.
  [8.5, 67, 0.2, 0.55], [9, 68, 0.2, 0.58], [9.5, 70, 0.2, 0.6], [10, 72, 0.2, 0.62],
  [10.5, 74, 0.5, 0.5, { tongue: 0.4 }], [11, 75, 1, 0.48, { tongue: 0.2 }],
  [12, 77, 0.5, 0.5, { tongue: 0.2 }], [12.5, 79, 0.5, 0.52, { tongue: 0.2 }],
  // Phrase 3: long crescendo, the tone turns brassy at the top, then a fall.
  [13, 80, 3.5, [0.28, 1], { tongue: 0.3 }],
  [16.5, 79, 0.5, 0.85, { tongue: 0.5 }], [17, 77, 0.5, 0.8, { tongue: 0.4 }], [17.5, 75, 0.5, 0.75, { tongue: 0.4 }],
  [18, 74, 1, 0.72, { tongue: 0.4 }],
  [19, 70, 1.4, 0.75, { tongue: 0.5, fall: 5, vibrato: 0 }],
  // Phrase 4: quiet ending with a diminuendo.
  [21.5, 63, 0.5, 0.4, { tongue: 0.2 }], [22, 65, 0.5, 0.42, { tongue: 0.2 }], [22.5, 67, 0.5, 0.44, { tongue: 0.2 }],
  [23, 70, 0.5, 0.45, { tongue: 0.2 }], [23.5, 67, 0.5, 0.42, { tongue: 0.2 }],
  [24, 63, 3.6, [0.45, 0.12], { tongue: 0.2 }],
];
line.forEach(([b, midi, len, velocity, extra = {}], i) => {
  const staccato = len <= 0.25;
  const t0 = at(b), t1 = at(b + len);
  const duration = staccato ? 0.11 : Math.max(0.1, t1 - t0 - 0.035);
  notes.push({ t: t0, opts: { midi, velocity, duration, seed: 11 + i, ...extra } });
});

const total = 28;
const [dry] = buffer(total);
const t = performance.now();
for (const { t: t0, opts } of notes) mixInto(dry, render(opts), Math.round(t0 * SR));
const [L, R] = room(dry, { wet: 0.35, rt60: 1.8 });
console.log(`rendered ${notes.length} notes in ${((performance.now() - t) / 1000).toFixed(1)} s`);
normalizePeak([L, R], -3);
console.log(stats([L, R]));
writeWav(outPath('trumpet.wav'), [L, R]);
