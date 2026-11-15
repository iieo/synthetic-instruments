import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/sitar.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const r = rng(1957);
let [out] = buffer(36);
let seed = 1;

// Tonic C sharp; the sympathetic strings are tuned to the major scale on it.
const SA = 61;
const deg = (d) => SA + [0, 2, 4, 5, 7, 9, 11][((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

function note(time, midi, opts = {}) {
  const { gain = 1, velocity = 0.75, ...rest } = opts;
  const y = render({ midi, seed: seed++, tonic: 49, scale: 'major', velocity: Math.min(1, velocity * (0.92 + 0.16 * r())), ...rest });
  mixInto(out, y, Math.round(time * SR), gain);
}

// Part 1: slow and free. Several notes are reached by pulling the string sideways along the fret.
let t = 0.1;
const slow = [
  [deg(0), 2.4, {}], [deg(1), 1.4, { meend: 2, meendAt: 0.45, meendTime: 0.4 }],
  [deg(2), 1.2, {}], [deg(4), 2.6, { meend: 2, meendAt: 0.9, meendTime: 0.5 }],
  [deg(3), 1.1, {}], [deg(2), 1.0, {}], [deg(1), 0.8, {}], [deg(0), 2.8, { meend: -1, meendAt: 1.2, meendTime: 0.6 }],
];
for (const [m, len, o] of slow) {
  note(t, m, { duration: len, velocity: 0.8, ...o });
  t += len;
}
t += 0.2;

// Part 2: a pulsing figure in eighth notes, 132 bpm, climbing and coming back.
const e8 = 60 / 132 / 2;
const figure = [0, 0, 1, 0, 2, 1, 2, 0, 3, 2, 4, 3, 4, 2, 5, 4, 7, 7, 6, 5, 4, 3, 2, 1];
figure.forEach((d, k) => note(t + k * e8, deg(d), { duration: e8 * 1.1, velocity: k % 2 ? 0.6 : 0.8, gain: 0.9 }));
t += figure.length * e8;
note(t, deg(0), { duration: 1.2, velocity: 0.85 });
t += 1.4;

// Part 3: a high phrase with a long pull up into the next scale step, closing on the tonic.
note(t, deg(7), { duration: 1.0, velocity: 0.85 });
note(t + 1.0, deg(9), { duration: 2.2, velocity: 0.85, meend: 3, meendAt: 0.6, meendTime: 0.7 });
note(t + 3.2, deg(8), { duration: 0.6, velocity: 0.7 });
note(t + 3.8, deg(7), { duration: 0.6, velocity: 0.7 });
note(t + 4.4, deg(4), { duration: 1.0, velocity: 0.75 });
note(t + 5.4, deg(0), { duration: 4.0, velocity: 0.9, sympathetic: 0.8 });
t += 9.6;

const end = Math.min(out.length, Math.round(t * SR));
out = out.subarray(0, end);
for (let i = 0, nf = Math.round(0.08 * SR); i < nf; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / nf);
normalizePeak([out], -3);
writeWav(outPath('sitar.wav'), [out]);
console.log('sitar.wav', (out.length / SR).toFixed(1), 's', stats([out]), `${((performance.now() - t0) / 1000).toFixed(1)} s render`);
