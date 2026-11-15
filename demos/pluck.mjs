import { render } from '../instruments/pluck.mjs';
import { mixEvents, master } from '../instruments/synth/demo.mjs';
import { outPath } from './lib/out.mjs';

const events = [];
const add = (t, gain, opts) => events.push({ t, gain, opts });

// Part 1: each preset on a short figure.
const fig = [69, 72, 76, 79, 76, 72];
fig.forEach((m, i) => add(i * 0.16, 0.8, { preset: 'pluck', midi: m, duration: 0.12, velocity: 0.9, seed: i, mix: i === 5 ? 0.3 : 0 }));
[[81, 0], [76, 0.3], [79, 0.6], [84, 0.9]].forEach(([m, t], i) => add(2.2 + t, 0.8, { preset: 'bell', midi: m, duration: 0.25, velocity: 0.85, seed: i }));
[57, 60, 64, 67, 69, 67, 64, 60].forEach((m, i) => add(5.0 + i * 0.13, 0.8, { preset: 'mallet', midi: m, duration: 0.1, velocity: 0.7 + 0.3 * (i % 2), seed: i }));
[[72, 0, 0.2], [76, 0.25, 0.2], [79, 0.5, 0.7], [77, 1.25, 0.2], [76, 1.5, 0.9]].forEach(([m, t, d], i) =>
  add(7.0 + t, 0.7, { preset: 'chip', midi: m, duration: d, velocity: 0.9, seed: i }));

// Part 2: eight bars at 128 BPM. Pluck arpeggio with its echo, bell accents, chip line in the second half.
const beat = 60 / 128, bar = 4 * beat, s16 = beat / 4, T0 = 10.4;
const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]];
const order = [0, 2, 1, 3, 2, 1, 3, 2];
for (let b = 0; b < 8; b++) {
  const c = chords[Math.floor(b / 2) % 4];
  for (let s = 0; s < 16; s++) {
    if (s % 8 === 7) continue;
    const m = c[order[s % 8]] + (s >= 8 && s % 4 === 2 ? 12 : 0);
    add(T0 + b * bar + s * s16, 0.45, { preset: 'pluck', midi: m + 12, duration: 0.09, velocity: s % 4 === 0 ? 1 : 0.65, seed: b * 16 + s, mix: 0.22 });
  }
  add(T0 + b * bar + 1.5 * beat, 0.35, { preset: 'bell', midi: c[3] + 12, duration: 0.2, velocity: 0.8, seed: 200 + b });
}
const line = [[0, 76, 0.75], [0.75, 79, 0.75], [1.5, 81, 1.5], [3, 79, 0.5], [3.5, 76, 0.5],
  [4, 77, 1], [5, 76, 0.5], [5.5, 72, 0.5], [6, 74, 2], [8, 76, 0.75], [8.75, 79, 0.75], [9.5, 84, 1.5],
  [11, 83, 1], [12, 79, 0.75], [12.75, 81, 0.75], [13.5, 79, 2.5]];
for (const [pos, m, len] of line) add(T0 + 4 * bar + pos * beat, 0.32, { preset: 'chip', midi: m, duration: len * beat - 0.04, velocity: 0.85, seed: 300 + pos * 4 });

master(outPath('pluck.wav'), mixEvents(events, render));
