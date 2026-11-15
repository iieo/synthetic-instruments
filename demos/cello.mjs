import { writeWav } from '../lib/audio.mjs';
import * as cello from '../instruments/cello.mjs';
import { renderScore } from '../instruments/strings-bowed/score.mjs';
import { outPath } from './lib/out.mjs';

const S = true; // slurred to the previous note (same bow stroke)
const phrases = [
  // slow cantabile with crescendo and decrescendo
  { at: 0.2, notes: [
    ['D3', 1.6, 0.35, 0.75], ['A3', 1.4, 0.75, 0.65, S],
    ['G3', 0.7, 0.6], ['F3', 0.7, 0.6, 0.55, S], ['E3', 0.6, 0.55, 0.55, S], ['D3', 2.2, 0.55, 0.25],
  ] },
  // détaché
  { at: 8.0, notes: [
    ['F3', 0.25, 0.6], ['G3', 0.25, 0.6], ['A3', 0.25, 0.65], ['Bb3', 0.25, 0.7],
    ['A3', 0.25, 0.65], ['G3', 0.25, 0.6], ['F3', 0.25, 0.55], ['E3', 0.25, 0.5],
    ['D3', 1.4, 0.5, 0.3],
  ] },
  // low passage on the C and G strings
  { at: 12.0, notes: [
    ['C2', 2.0, 0.35, 0.85], ['G2', 0.9, 0.8, 0.75, S],
    ['F2', 0.6, 0.7], ['Eb2', 0.6, 0.65, 0.6, S], ['D2', 2.2, 0.6, 0.2],
  ] },
  // high passage on the A string
  { at: 18.8, notes: [
    ['A4', 1.8, 0.3, 0.8], ['D5', 0.8, 0.75, 0.7, S],
    ['C5', 0.6, 0.65], ['Bb4', 0.6, 0.6, 0.55, S], ['A4', 3.0, 0.55, 0.15],
  ] },
];

const t = Date.now();
const { out, stats } = renderScore(cello, phrases, { seed: 5 });
writeWav(outPath('cello.wav'), [out]);
console.log(`out/cello.wav  ${(out.length / 48000).toFixed(1)} s, ${Date.now() - t} ms`, stats);
