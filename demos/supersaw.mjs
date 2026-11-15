import { render } from '../instruments/supersaw.mjs';
import { mixEvents, master } from '../instruments/synth/demo.mjs';
import { outPath } from './lib/out.mjs';

const events = [];
const add = (t, gain, opts) => events.push({ t, gain, opts });

// Part 1: each preset on its own.
[[74, 0, 0.28], [72, 0.32, 0.28], [69, 0.64, 0.28], [72, 0.96, 0.9]].forEach(([m, t, d], i) =>
  add(t, 0.8, { preset: 'lead', midi: m, duration: d, velocity: 0.9, seed: i }));
add(2.2, 0.75, { preset: 'anthem', midi: 69, duration: 0.5, velocity: 1, from: -12, glide: 0.05 });
add(2.8, 0.75, { preset: 'anthem', midi: 74, duration: 1.1, velocity: 1 });
add(4.4, 0.8, { preset: 'pad', chord: [50, 57, 62, 65, 69], duration: 2.6, velocity: 0.8 });
add(8.0, 0.75, { preset: 'hardlead', midi: 62, duration: 1.4, velocity: 1,
  bend: [[0, 0], [0.35, 0], [0.4, 3], [0.75, 3], [0.8, 7], [1.1, 7], [1.4, 5]], glide: 0.03 });

// Part 2: eight bars at 140 BPM, anthem lead on a 3-3-2-2-2-2-2 grid over pad chords.
const beat = 60 / 140, bar = 4 * beat, s16 = beat / 4, T0 = 10.2;
const chords = [[50, 57, 62, 65], [46, 53, 58, 62], [53, 57, 60, 65], [48, 55, 60, 64]];
chords.forEach((c, i) => add(T0 + 2 * i * bar, 0.55, { preset: 'pad', chord: c, duration: 2 * bar - 0.1, velocity: 0.7, seed: 10 + i }));
const grid = [0, 3, 6, 8, 10, 12, 14];
const melody = [
  [74, 74, 77, 76, 74, 72, 74], [74, 74, 77, 79, 77, 76, 74],
  [74, 74, 77, 76, 74, 72, 70], [70, 72, 74, 72, 70, 69, 70],
  [72, 72, 77, 76, 72, 69, 72], [72, 72, 77, 79, 81, 79, 77],
  [76, 76, 79, 77, 76, 74, 72], [76, 74, 72, 74, 76, 79, 81],
];
melody.forEach((notes, b) => notes.forEach((m, k) => {
  const st = grid[k], len = ((grid[k + 1] ?? 16) - st) * s16 - 0.03;
  add(T0 + b * bar + st * s16, 0.42, { preset: 'anthem', midi: m, duration: len, velocity: k % 2 ? 0.8 : 1, seed: b * 8 + k });
}));

// Part 3: two bars of a driven lead at 150 BPM with slides between the off-beats.
const b2 = 60 / 150, T1 = T0 + 8 * bar + 0.4;
const riff = [[0, 62, 0], [1.5, 62, 3], [2.5, 65, -2], [3.5, 62, 0], [4, 69, -2], [5.5, 67, 0], [6.5, 65, -3], [7.5, 62, 0]];
riff.forEach(([pos, m, slide], i) => {
  const len = ((riff[i + 1]?.[0] ?? 8.5) - pos) * b2 - 0.02;
  add(T1 + pos * b2, 0.6, { preset: 'hardlead', midi: m, duration: len, velocity: 1, seed: 40 + i,
    bend: slide ? [[0, 0], [len * 0.6, 0], [len, slide]] : undefined, glide: 0.04 });
});

master(outPath('supersaw.wav'), mixEvents(events, render));
