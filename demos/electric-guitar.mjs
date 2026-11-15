import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/electric-guitar.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const r = rng(4711);
const total = 30;
let [out] = buffer(total);
let seed = 1;
const human = (sec) => sec + (r() - 0.5) * 0.01;

function note(time, midi, opts = {}) {
  const { gain = 1, velocity = 0.75, ...rest } = opts;
  const y = render({ midi, seed: seed++, velocity: Math.min(1, velocity * (0.92 + 0.16 * r())), ...rest });
  mixInto(out, y, Math.round(time * SR), gain);
}

// Part 1: clean neck pickup, picked arpeggios over E minor 9, C major 7 and A minor add 9, 84 bpm.
const e8 = 60 / 84 / 2;
let t = 0.1;
const arps = [
  [[40, 0], [47, 1], [54, 2], [55, 3], [59, 4], [54, 2], [62, 4], [55, 3]],
  [[48, 1], [55, 2], [59, 3], [64, 4], [59, 3], [67, 5], [64, 4], [55, 2]],
  [[45, 1], [52, 2], [59, 3], [60, 4], [64, 5], [59, 3], [71, 5], [60, 4]],
  [[40, 0], [47, 1], [54, 2], [55, 3], [59, 4], [62, 4], [66, 5], [71, 5]],
];
for (const bar of arps) {
  bar.forEach(([m, s], k) => note(human(t + k * e8), m, { preset: 'clean', string: s, duration: (k === 0 ? 8 : 3) * e8, velocity: k === 0 ? 0.8 : 0.6, gain: k === 0 ? 1 : 0.85 }));
  t += 8 * e8;
}

// Part 2: palm-muted eighths on the low E with crunchy two-note chords on the accents, 120 bpm.
t += 0.35;
const q2 = 60 / 120 / 2;
const riff = 'm m m A m m B m m m m A m m C -';
const chords = { A: [[43, 0], [50, 1]], B: [[45, 1], [52, 2]], C: [[47, 1], [54, 2]] };
for (let rep = 0; rep < 2; rep++) {
  riff.split(' ').forEach((c, k) => {
    const at = t + k * q2;
    if (c === 'm') note(human(at), 40, { preset: 'muted', duration: q2 * 0.9, velocity: k % 2 ? 0.7 : 0.85, gain: 0.9 });
    else if (c !== '-') chords[c].forEach(([m, s], i) => note(at + i * 0.006, m, { preset: 'crunch', string: s, duration: (c === 'C' ? 2 : 1) * q2, velocity: 0.85, gain: 0.55 }));
  });
  t += 16 * q2;
}
[[40, 0], [47, 1], [52, 2]].forEach(([m, s], i) => note(t + i * 0.012, m, { preset: 'crunch', string: s, duration: 1.4, velocity: 0.9, gain: 0.5 }));
t += 1.9;

// Part 3: a sustained lead line on the bridge pickup over a held low note.
const q3 = 60 / 96;
const lead = [
  [71, 0.5], [74, 0.5], [76, 1], [74, 0.5], [76, 0.5], [79, 1.5], [78, 0.5],
  [76, 0.75], [74, 0.25], [71, 1], [69, 0.5], [71, 2.5],
];
note(t, 40, { preset: 'clean', pickup: 'bridge', string: 0, duration: 6 * q3, velocity: 0.7, gain: 0.7 });
note(t + 6 * q3, 43, { preset: 'clean', pickup: 'bridge', string: 0, duration: 4 * q3, velocity: 0.7, gain: 0.7 });
let lt = t;
for (const [m, len] of lead) {
  note(human(lt), m, { preset: 'lead', duration: len * q3 * 0.97, velocity: 0.85, gain: 0.75 });
  lt += len * q3;
}

const end = Math.min(out.length, Math.round((lt + 0.5) * SR));
out = out.subarray(0, end);
for (let i = 0, nf = Math.round(0.05 * SR); i < nf; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / nf);
normalizePeak([out], -3);
writeWav(outPath('electric-guitar.wav'), [out]);
console.log('electric-guitar.wav', (out.length / SR).toFixed(1), 's', stats([out]), `${((performance.now() - t0) / 1000).toFixed(1)} s render`);
