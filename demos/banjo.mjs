import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/banjo.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const r = rng(1902);
let [out] = buffer(30);
let seed = 1;
const human = (sec) => sec + (r() - 0.5) * 0.008;

function note(time, midi, opts = {}) {
  const { gain = 1, velocity = 0.75, ...rest } = opts;
  const y = render({ midi, seed: seed++, velocity: Math.min(1, velocity * (0.9 + 0.2 * r())), ...rest });
  mixInto(out, y, Math.round(time * SR), gain);
}

// Fretting per string (D3 G3 B3 D4) for each chord; string 4 is the open g4 drone.
const CH = {
  G: [50, 55, 59, 62],
  C: [52, 55, 60, 64],
  D: [50, 57, 62, 66],
  Em: [52, 55, 59, 64],
};

// Part 1: finger-picked rolls, eight notes per bar, thumb on the drone every few notes, 112 bpm.
const e8 = 60 / 112 / 2;
const roll = [1, 2, 4, 3, 1, 2, 4, 3];
let t = 0.1;
for (const name of ['G', 'G', 'C', 'G', 'Em', 'C', 'D', 'G']) {
  const v = CH[name];
  roll.forEach((s, k) => {
    const midi = s === 4 ? 67 : v[s];
    const next = roll.indexOf(s, k + 1);
    const ring = ((next < 0 ? 8 + roll.indexOf(s) : next) - k) * e8;
    note(human(t + k * e8), midi, { string: s, duration: ring, velocity: k === 0 ? 0.85 : 0.65, gain: s === 4 ? 0.75 : 0.9 });
  });
  t += 8 * e8;
}
note(t, 55, { string: 1, duration: 1.4, velocity: 0.85 });
note(t, 59, { string: 2, duration: 1.4, velocity: 0.7, gain: 0.8 });
note(t, 67, { string: 4, duration: 1.4, velocity: 0.7, gain: 0.7 });
t += 1.6;

// Part 2: a single-note line with a flat pick, its own little tune in G.
const q = 60 / 120;
const line = [[62, 0.5], [64, 0.5], [67, 1], [71, 0.5], [69, 0.5], [67, 0.5], [64, 0.5], [62, 1], [59, 0.5], [62, 0.5], [64, 1.5], [62, 0.5], [67, 2]];
for (const [m, len] of line) {
  note(human(t), m, { preset: 'pick', duration: len * q * 0.95, velocity: 0.8 });
  t += len * q;
}
t += 0.2;

// Part 3: muted chord chops on the offbeats under a picked bass.
for (const [b, name] of [[0, 'G'], [2, 'C'], [4, 'D'], [6, 'G']]) {
  const v = CH[name];
  note(t + b * q, v[0], { preset: 'muted', string: 0, duration: q * 0.9, velocity: 0.85 });
  for (const off of [0.5, 1.5]) v.forEach((m, s) => note(human(t + (b + off) * q) + s * 0.007, m, { preset: 'muted', string: s, duration: 0.25 * q, velocity: 0.7, gain: 0.55 }));
  note(t + (b + 1) * q, v[1], { preset: 'muted', string: 1, duration: q * 0.9, velocity: 0.75 });
}
t += 8 * q;
CH.G.forEach((m, s) => note(t + s * 0.012, m, { string: s, duration: 1.6, velocity: 0.8, gain: 0.7 }));
note(t + 0.05, 67, { string: 4, duration: 1.6, velocity: 0.75, gain: 0.6 });

const end = Math.min(out.length, Math.round((t + 2) * SR));
out = out.subarray(0, end);
for (let i = 0, nf = Math.round(0.05 * SR); i < nf; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / nf);
normalizePeak([out], -3);
writeWav(outPath('banjo.wav'), [out]);
console.log('banjo.wav', (out.length / SR).toFixed(1), 's', stats([out]), `${((performance.now() - t0) / 1000).toFixed(1)} s render`);
