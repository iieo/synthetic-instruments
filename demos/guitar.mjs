import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/guitar.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const r = rng(2026);
const total = 34;
let [out] = buffer(total);
const human = (sec) => sec + (r() - 0.5) * 0.012;
let seed = 1;

function note(time, midi, { velocity = 0.7, duration = 1, type = 'nylon', string, gain = 1 } = {}) {
  const y = render({ midi, velocity: Math.min(1, velocity * (0.9 + 0.2 * r())), duration, type, string, seed: seed++ });
  mixInto(out, y, Math.round(time * SR), gain);
}

// Voicings as MIDI per string (low E to high E), null = string not played.
const CH = {
  Am: [null, 45, 52, 57, 60, 64],
  F: [41, 48, 53, 57, 60, 65],
  C: [null, 48, 52, 55, 60, 64],
  G: [43, 47, 50, 55, 59, 67],
  E: [40, 47, 52, 56, 59, 64],
  Em: [40, 47, 52, 55, 59, 64],
  D: [null, null, 50, 57, 62, 66],
};

// Part 1: fingerpicked nylon arpeggios, 90 bpm.
let t = 0.15;
const e8 = 60 / 90 / 2;
for (const name of ['Am', 'F', 'C', 'E']) {
  const v = CH[name];
  const bass = v.findIndex((m) => m !== null);
  const order = [bass, 3, 4, 5, 4, 3, 2, 3];
  for (let k = 0; k < 8; k++) {
    const s = order[k];
    let nextSame = order.indexOf(s, k + 1);
    if (nextSame < 0) nextSame = 8;
    const ring = (nextSame - k) * e8 + 0.03;
    note(human(t + k * e8), v[s], { velocity: k === 0 ? 0.8 : 0.55 + (k === 4 ? 0.1 : 0), duration: ring, string: s, gain: k === 0 ? 1 : 0.85 });
  }
  t += 8 * e8;
}

// Part 2: steel strings, strummed with a plectrum, 100 bpm. Each string is hit a few ms after the previous one.
t += 0.2;
const beat = 60 / 100;
const pattern = [[0, 'D', 0.85], [1, 'D', 0.7], [1.5, 'U', 0.5], [2.5, 'U', 0.55], [3, 'D', 0.8], [3.5, 'U', 0.5]];
const prog = ['Em', 'C', 'D'];
for (let b = 0; b < prog.length; b++) {
  const v = CH[prog[b]];
  for (let p = 0; p < pattern.length; p++) {
    const [pos, dir, vel] = pattern[p];
    const next = p + 1 < pattern.length ? pattern[p + 1][0] : 4;
    const start = t + pos * beat;
    const ring = (next - pos) * beat;
    const strings = dir === 'D' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2];
    const gap = (dir === 'D' ? 0.011 : 0.008) * (0.8 + 0.4 * r());
    let i = 0;
    for (const s of strings) {
      if (v[s] === null) continue;
      const at = start + i * gap;
      note(at, v[s], { type: 'steel', velocity: vel * (dir === 'U' ? 0.9 : 1), duration: Math.max(0.05, ring - i * gap), string: s, gain: 0.45 });
      i++;
    }
  }
  t += 4 * beat;
}
// Let the last chord ring.
{
  const v = CH.Em;
  let i = 0;
  for (let s = 0; s < 6; s++) note(t + i++ * 0.014, v[s], { type: 'steel', velocity: 0.8, duration: 1.6, string: s, gain: 0.45 });
  t += 1.9;
}

// Part 3: single-note nylon melody over soft bass notes, 100 bpm.
const q = 60 / 100;
const melody = [
  [76, 1], [74, 0.5], [72, 0.5], [71, 1], [72, 1],
  [69, 1.5], [71, 0.5], [72, 1], [74, 1],
  [69, 3],
];
const bassLine = [45, 41, 45];
for (let b = 0; b < 3; b++) note(t + b * 4 * q, bassLine[b], { velocity: 0.55, duration: 4 * q - 0.05, gain: 0.6 });
let mt = t;
for (const [m, len] of melody) {
  note(human(mt), m, { velocity: 0.75, duration: len * q * 0.97, gain: 0.8 });
  mt += len * q;
}

const end = Math.min(out.length, Math.round((mt + 0.6) * SR));
out = out.subarray(0, end);
// Notes may still ring at the cut: fade the last 50 ms to exactly zero.
for (let i = 0, nf = Math.round(0.05 * SR); i < nf; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / nf);
normalizePeak([out], -3);
writeWav(outPath('guitar.wav'), [out]);
console.log('guitar.wav', (out.length / SR).toFixed(1), 's', stats([out]), `${((performance.now() - t0) / 1000).toFixed(1)} s render`);
