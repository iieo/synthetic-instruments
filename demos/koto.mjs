import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/koto.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const r = rng(808);
let [out] = buffer(34);
let seed = 1;

// Thirteen strings in a pentatonic minor tuning on D, low to high.
const S = [50, 55, 57, 58, 62, 63, 67, 69, 70, 74, 75, 79, 81];

function note(time, midi, opts = {}) {
  const { gain = 1, velocity = 0.75, ...rest } = opts;
  const y = render({ midi, seed: seed++, velocity: Math.min(1, velocity * (0.92 + 0.16 * r())), ...rest });
  mixInto(out, y, Math.round(time * SR), gain);
}

// Part 1: a slow phrase, 66 bpm. Notes outside the tuning come from pressing the string behind the
// bridge: pressed before the stroke, or pressed after it so the pitch rises while the note rings.
const q = 60 / 66;
let t = 0.15;
const phrase = [
  [0, S[6], 1.5, {}], [1.5, S[7], 0.5, {}], [2, S[8], 1, {}], [3, S[7], 1, {}],
  [4, S[9], 1.5, { oshide: 2, oshideAt: 0, oshideTime: 0.05 }],
  [5.5, S[8], 0.5, {}], [6, S[7], 2, { oshide: 1, oshideAt: 0.45, oshideTime: 0.25 }],
  [8, S[5], 1, {}], [9, S[4], 1, {}], [10, S[6], 2.5, { oshide: 2, oshideAt: 0.6, oshideTime: 0.35 }],
];
for (const [b, m, len, o] of phrase) note(t + b * q, m, { duration: len * q, velocity: 0.75, ...o });
note(t, S[0], { duration: 4 * q, velocity: 0.6, gain: 0.7 });
note(t + 4 * q, S[1], { duration: 4 * q, velocity: 0.6, gain: 0.7 });
note(t + 8 * q, S[0], { duration: 4.5 * q, velocity: 0.6, gain: 0.7 });
t += 12.6 * q;

// Part 2: a quick sweep down across the strings and back up, then an octave struck together.
const sweep = [...S].reverse().slice(0, 11);
sweep.forEach((m, i) => note(t + i * 0.055, m, { duration: 1.6 - i * 0.05, velocity: 0.55 + 0.03 * i, gain: 0.75 }));
t += 11 * 0.055 + 0.25;
S.slice(4, 11).forEach((m, i) => note(t + i * 0.06, m, { duration: 1.2, velocity: 0.6, gain: 0.7 }));
t += 7 * 0.06 + 0.35;
note(t, S[4], { duration: 2.2, velocity: 0.9 });
note(t + 0.012, S[9], { duration: 2.2, velocity: 0.85 });
t += 2.6;

// Part 3: silk strings, a quieter answer with the bare finger on the low strings, 72 bpm.
const q3 = 60 / 72;
const answer = [[S[9], 1], [S[8], 0.5], [S[7], 0.5], [S[6], 1], [S[4], 1], [S[5], 0.5], [S[4], 0.5], [S[3], 1], [S[4], 3]];
let at = t;
for (const [m, len] of answer) {
  note(at, m, { preset: 'silk', duration: len * q3, velocity: 0.7 });
  at += len * q3;
}
[[0, S[0]], [2, S[1]], [4, S[2]], [6, S[0]]].forEach(([b, m]) => note(t + b * q3, m, { preset: 'finger', duration: 2 * q3, velocity: 0.7, gain: 0.8 }));

const end = Math.min(out.length, Math.round((at + 0.4) * SR));
out = out.subarray(0, end);
for (let i = 0, nf = Math.round(0.05 * SR); i < nf; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / nf);
normalizePeak([out], -3);
writeWav(outPath('koto.wav'), [out]);
console.log('koto.wav', (out.length / SR).toFixed(1), 's', stats([out]), `${((performance.now() - t0) / 1000).toFixed(1)} s render`);
