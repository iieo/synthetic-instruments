import { render } from '../instruments/vox.mjs';
import { mixEvents, master } from '../instruments/synth/demo.mjs';
import { outPath } from './lib/out.mjs';

const events = [];
const add = (t, gain, opts) => events.push({ t, gain, opts });

// Part 1: the vowels on the plain voice, then the pitched-up chop, then the choir.
['a', 'e', 'i', 'o', 'u', 'ah-oh'].forEach((vowel, i) =>
  add(i * 0.6, 0.8, { preset: 'lead', midi: [64, 67, 69, 67, 64, 62][i], vowel, duration: i === 5 ? 0.9 : 0.45, velocity: 0.85, seed: i }));
[[76, 'ah-oh', 0.35], [79, 'a', 0.15], [76, 'o', 0.15], [74, 'ah-oh', 0.6]].forEach(([m, vowel, d], i) =>
  add(4.4 + [0, 0.45, 0.65, 0.85][i], 0.8, { preset: 'pitched', midi: m, vowel, duration: d, velocity: 0.9, seed: 10 + i }));
for (const m of [53, 60, 65, 69]) add(6.4, 0.6, { preset: 'choir', midi: m, vowel: 'ah-oh', duration: 2.6, velocity: 0.7, seed: m });

// Part 2: four bars at 140 BPM. Choir chords underneath, a syncopated pitched-up hook on top.
const beat = 60 / 140, bar = 4 * beat, s16 = beat / 4, T0 = 10.6;
const chords = [[53, 60, 65, 68], [49, 56, 61, 65], [51, 58, 63, 67], [48, 55, 60, 64]];
chords.forEach((c, b) => { for (const m of c) add(T0 + b * bar, 0.45, { preset: 'choir', midi: m, vowel: b % 2 ? 'o' : 'a', duration: bar - 0.05, velocity: 0.65, seed: 50 + b * 4 + m }); });
const hook = [[0, 77, 'ah-oh', 3], [3, 80, 'a', 1], [4, 77, 'o', 2], [6, 75, 'ah-oh', 4], [10, 72, 'a', 2], [12, 75, 'o', 4]];
for (let b = 0; b < 4; b++) {
  const shift = [0, 0, -2, -1][b];
  hook.forEach(([st, m, vowel, len], k) => add(T0 + b * bar + st * s16, 0.55, {
    preset: 'pitched', midi: m + shift, vowel, duration: len * s16 - 0.02, velocity: k % 2 ? 0.8 : 1, seed: 100 + b * 8 + k,
  }));
}

master(outPath('vox.wav'), mixEvents(events, render));
