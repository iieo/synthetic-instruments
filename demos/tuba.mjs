import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/tuba.mjs';
import { room } from '../instruments/trumpet/room.mjs';
import { outPath } from './lib/out.mjs';

// Eight bars in B-flat major at 88 bpm: the tuba walks the bass, the euphonium sings above it.
const BPM = 88, beat = 60 / BPM, START = 0.3;

// [beat, midi, beats, velocity, extra]
const bass = [
  [0, 34, 2, 0.7], [2, 29, 1, 0.6], [3, 31, 1, 0.6],
  [4, 39, 2, 0.68], [6, 34, 1, 0.58], [7, 36, 1, 0.6],
  [8, 41, 2, 0.7], [10, 36, 1, 0.6], [11, 38, 1, 0.62],
  [12, 34, 1, 0.66], [13, 38, 1, 0.6], [14, 41, 1, 0.62], [15, 46, 1, 0.64],
  [16, 43, 2, 0.66], [18, 38, 1, 0.58], [19, 41, 1, 0.6],
  [20, 36, 2, 0.66], [22, 43, 1, 0.58], [23, 39, 1, 0.6],
  [24, 41, 1, 0.72], [25, 39, 1, 0.62], [26, 38, 1, 0.62], [27, 36, 1, 0.64],
  [28, 34, 4.5, [0.75, 0.3], { tongue: 0.6 }],
];
const melody = [
  [2, 58, 1, 0.5], [3, 62, 1, 0.52],
  [4, 63, 3, 0.55], [7, 62, 1, 0.5],
  [8, 65, 2, 0.58], [10, 63, 1, 0.52], [11, 62, 1, 0.5],
  [12, 62, 2.5, 0.5], [15, 58, 1, 0.48],
  [16, 62, 1, 0.52], [17, 63, 1, 0.54], [18, 65, 1, 0.56], [19, 67, 1, 0.58],
  [20, 67, 2, 0.6], [22, 70, 1, 0.64], [23, 67, 1, 0.56],
  [24, 65, 2, [0.5, 0.75]], [26, 63, 1, 0.58], [27, 60, 1, 0.54],
  [28, 62, 4.5, [0.6, 0.15]],
];

const total = START + 33 * beat + 1.8;
const [dry] = buffer(total);
const t = performance.now();
let count = 0;
const place = (part, preset, gain, tongue) => part.forEach(([b, midi, len, velocity, extra = {}], i) => {
  const duration = Math.max(0.1, len * beat - 0.05);
  const x = render({ preset, midi, velocity, duration, seed: 21 + i, tongue, ...extra });
  mixInto(dry, x, Math.round((START + b * beat) * SR), gain);
  count++;
});
place(bass, 'tuba', 1, 0.7);
place(melody, 'euphonium', 0.75, 0.25);
const [L, R] = room(dry, { wet: 0.3, rt60: 1.7 });
console.log(`rendered ${count} notes in ${((performance.now() - t) / 1000).toFixed(1)} s`);
normalizePeak([L, R], -3);
console.log(stats([L, R]));
writeWav(outPath('tuba.wav'), [L, R]);
