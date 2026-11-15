import { SR, buffer, mixInto, normalizePeak, stats, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/tabla.mjs';
import { outPath } from './lib/out.mjs';

const rand = rng(2718);
const TONIC = 61;
const hits = [];
let seed = 1;
const hit = (t, voice, vel, glide = 4) =>
  hits.push({ t: Math.max(0, t + 0.004 * (2 * rand() - 1)), voice, vel: Math.min(1, vel * (0.92 + 0.12 * rand())), glide, seed: seed++ });

// A phrase is a list of strokes on a grid of `sub` pulses per beat; '-' is a rest.
function phrase(t0, beat, sub, bols, vel, accents = []) {
  const step = beat / sub;
  bols.forEach((b, i) => {
    if (b === '-') return;
    const [voice, g] = b.split(':');
    hit(t0 + i * step, voice, vel * (accents.includes(i) ? 1.15 : 1), g === undefined ? 4 : Number(g));
  });
  return t0 + bols.length * step;
}

const beat = 60 / 84;
let t = 0.2;
// Slow opening: open strokes and a long rising bass.
t = phrase(t, beat, 1, ['ge-glide:5', 'tun', 'na', '-', 'ge', 'tin', 'na', 'tun'], 0.55, [0]);
t = phrase(t, beat, 2, ['dha', '-', 'tin', 'na', 'ge', 'na', 'tun', '-', 'dhin', '-', 'na', 'te', 'te', 'na', 'ge-glide:3', '-'], 0.62, [0, 8]);
// Groove in pairs of pulses, the bass answers with presses up and down.
for (let rep = 0; rep < 2; rep++) {
  t = phrase(t, beat, 2, ['dha', 'te', 'na', 'ge', 'dhin', 'na', 'ka', 'te', 'na', 'tin', 'ge', 'na', 'dha', '-', rep ? 'ge-glide:-4' : 'ge-glide:4', '-'], 0.7, [0, 4, 12]);
}
// Fast passage in fours with closed strokes.
t = phrase(t, beat, 4, ['te', 'te', 'na', 'te', 'ka', 'te', 'na', 'ge', 'te', 'te', 'na', 'te', 'dha', '-', 'ge', 'na',
  'tin', 'na', 'te', 'te', 'ka', 'te', 'tin', 'na', 'dha', 'te', 'te', 'na', 'dhin', '-', '-', '-'], 0.66, [0, 12, 24, 28]);
// Closing figure stated three times, landing on a full stroke with a falling bass.
const close = ['dha', 'te', 'na', 'ge', 'na', '-', 'dhin', '-'];
for (let k = 0; k < 3; k++) t = phrase(t, beat, 4, close, 0.68 + 0.08 * k, [0, 6]);
hit(t, 'dha', 1);
hit(t + 0.002, 'ge-glide', 0.9, -5);

const end = Math.max(...hits.map((h) => h.t)) + 3;
const [out] = buffer(end);
for (const h of hits) {
  const y = render({ voice: h.voice, midi: TONIC, velocity: h.vel, seed: h.seed, glide: h.glide });
  mixInto(out, y, Math.round(h.t * SR));
}
normalizePeak([out], -3);
writeWav(outPath('tabla.wav'), [out]);
console.log({ seconds: +(out.length / SR).toFixed(2), strokes: hits.length, ...stats([out]) });
