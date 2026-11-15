import { writeWav } from '../lib/audio.mjs';
import * as violin from '../instruments/violin.mjs';
import { renderScore } from '../instruments/strings-bowed/score.mjs';
import { outPath } from './lib/out.mjs';

const S = true; // slurred to the previous note (same bow stroke)
const phrases = [
  // slow cantabile with crescendo and decrescendo
  { at: 0.2, notes: [
    ['A4', 1.6, 0.35, 0.75], ['D5', 1.4, 0.75, 0.65, S],
    ['C#5', 0.7, 0.6], ['B4', 0.7, 0.6, 0.55, S], ['A4', 2.4, 0.55, 0.25],
  ] },
  // détaché
  { at: 7.4, notes: [
    ['F#4', 0.25, 0.6], ['G4', 0.25, 0.6], ['A4', 0.25, 0.65], ['B4', 0.25, 0.7],
    ['A4', 0.25, 0.65], ['G4', 0.25, 0.6], ['F#4', 0.25, 0.55], ['E4', 0.25, 0.5],
    ['D4', 1.6, 0.5, 0.3],
  ] },
  // low passage on the G string
  { at: 11.6, notes: [
    ['G3', 1.8, 0.3, 0.8], ['Bb3', 0.7, 0.8, 0.75, S], ['D4', 0.9, 0.75],
    ['C4', 0.5, 0.65], ['Bb3', 0.5, 0.6, 0.55, S], ['A3', 2.2, 0.55, 0.2],
  ] },
  // high passage
  { at: 18.6, notes: [
    ['E6', 1.8, 0.3, 0.8], ['D6', 0.7, 0.75, 0.7, S],
    ['C#6', 0.7, 0.7], ['B5', 0.5, 0.65, 0.6, S], ['A5', 3.0, 0.6, 0.15],
  ] },
];

const t = Date.now();
const { out, stats } = renderScore(violin, phrases, { seed: 3 });
writeWav(outPath('violin.wav'), [out]);
console.log(`out/violin.wav  ${(out.length / 48000).toFixed(1)} s, ${Date.now() - t} ms`, stats);
