import { SR, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import * as marimba from '../instruments/marimba.mjs';
import * as vibraphone from '../instruments/vibraphone.mjs';
import * as kalimba from '../instruments/kalimba.mjs';
import * as glockenspiel from '../instruments/glockenspiel.mjs';
import * as bells from '../instruments/bells.mjs';
import { outPath } from './lib/out.mjs';

const N = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const m = (name) => {
  const [, l, acc, oct] = name.match(/^([A-G])(#|b)?(-?\d)$/);
  return 12 * (+oct + 1) + N[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
};

function perform(inst, events, seconds) {
  const out = new Float64Array(Math.round(seconds * SR));
  let seed = 1;
  for (const [t, note, velocity, opts = {}] of events) {
    const x = inst.render({ midi: typeof note === 'string' ? m(note) : note, velocity, seed: seed++, ...opts });
    mixInto(out, x, Math.round(t * SR));
  }
  const fade = Math.round(1.5 * SR);
  for (let i = 0; i < fade; i++) out[out.length - fade + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / fade);
  return out;
}

function marimbaDemo() {
  const ev = [];
  const b = 0.4;
  const melody = [
    ['C2', 'C4', 0.7], [null, 'E4', 0.5], [null, 'G4', 0.55], ['G2', 'C5', 0.8],
    [null, 'B4', 0.45], [null, 'G4', 0.5], ['A2', 'A4', 0.75], [null, 'E4', 0.4],
    ['F2', 'F4', 0.7], [null, 'A4', 0.5], [null, 'C5', 0.6], ['G2', 'D5', 0.85],
    [null, 'B4', 0.5], [null, 'G4', 0.45], ['C2', 'E5', 0.9], [null, 'C5', 0.4],
  ];
  melody.forEach(([bass, mel, v], i) => {
    if (bass) ev.push([i * b, bass, 0.75, { hardness: 0.3 }]);
    ev.push([i * b + (i % 2) * 0.02, mel, v]);
  });
  // Roll: two mallets alternating on E4 and C5, ~14 strokes per second with a crescendo.
  const r0 = melody.length * b;
  for (let k = 0; k < 34; k++) {
    const t = r0 + k / 14 + (k % 2 ? 0.006 : 0);
    const v = 0.3 + 0.5 * (k / 33) ** 1.4;
    ev.push([t, k % 2 ? 'C5' : 'E4', v, { position: 0.42 + (k % 2) * 0.03, hardness: 0.45 }]);
  }
  ev.push([r0 + 34 / 14, 'C3', 0.85, { hardness: 0.3 }], [r0 + 34 / 14, 'G4', 0.8]);
  // Soft low bars, then hard high run.
  const s0 = r0 + 34 / 14 + 1.2;
  ['C2', 'G2', 'C3', 'E3'].forEach((n, i) => ev.push([s0 + i * 0.45, n, 0.35, { hardness: 0.2 }]));
  ['G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'].forEach((n, i) => ev.push([s0 + 2.0 + i * 0.13, n, 0.95, { hardness: 0.85 }]));
  ev.push([s0 + 3.4, 'C2', 0.9, { hardness: 0.35 }], [s0 + 3.4, 'C5', 0.7], [s0 + 3.4, 'G5', 0.6]);
  return perform(marimba, ev, s0 + 6);
}

function vibraphoneDemo() {
  const ev = [];
  // Pedal down: ringing chords, motor off.
  const chords = [[0, ['F3', 'A3', 'C4', 'E4'], 0.6], [2.4, ['F3', 'A3', 'D4', 'G4'], 0.55], [4.8, ['G3', 'Bb3', 'D4', 'F4'], 0.6]];
  for (const [t, notes, v] of chords) notes.forEach((n, i) => ev.push([t + i * 0.03, n, v, { duration: 2.35 - i * 0.03 }]));
  [['A4', 0.6], ['C5', 0.65], ['E5', 0.75], ['G5', 0.8], ['F5', 0.7], ['E5', 0.6], ['C5', 0.55], ['D5', 0.7]]
    .forEach(([n, v], i) => ev.push([0.6 + i * 0.6, n, v, { duration: 0.58 }]));
  // Damped staccato figure (pedal up), soft then hard.
  const s0 = 7.4;
  ['F4', 'A4', 'C5', 'E5', 'F5', 'E5', 'C5', 'A4'].forEach((n, i) => ev.push([s0 + i * 0.2, n, 0.3 + i * 0.08, { duration: 0.12, hardness: 0.4 + i * 0.05 }]));
  // High and low extremes, then a final chord with the motor on, letting it ring.
  ev.push([s0 + 1.8, 'F6', 0.7, { duration: 1.2 }], [s0 + 2.4, 'F3', 0.55, { duration: 1.2 }]);
  const f0 = s0 + 3.8;
  ['F3', 'C4', 'E4', 'A4', 'D5', 'G5'].forEach((n, i) => ev.push([f0 + i * 0.05, n, 0.65, { duration: 8, motor: 5.2 }]));
  return perform(vibraphone, ev, f0 + 8.5);
}

function kalimbaDemo() {
  const ev = [];
  const beat = 60 / 78;
  const swing = (i) => (i % 2 ? 0.1 * beat : 0);
  // Lofi pentatonic figure (C major pentatonic), slightly swung eighths, played twice with a variation.
  const fig = ['C4', 'E4', 'G4', 'A4', 'C5', 'A4', 'G4', 'E4', 'D4', 'G4', 'A4', 'D5', 'C5', 'A4', 'G4', 'D4'];
  const vel = [0.75, 0.45, 0.55, 0.5, 0.7, 0.4, 0.5, 0.45];
  for (let rep = 0; rep < 2; rep++) {
    fig.forEach((n, i) => {
      const t = rep * 8 * beat + (i * beat) / 2 + swing(i);
      ev.push([t, rep === 1 && i === 11 ? 'E5' : n, vel[i % 8] * (rep ? 1.05 : 0.95)]);
    });
    ev.push([rep * 8 * beat, 'C4', 0.6], [rep * 8 * beat + 4 * beat, 'G4', 0.55]);
  }
  // Soft high sparkle and a hard low note to close.
  const s0 = 16 * beat;
  ['E6', 'C6', 'A5', 'G5', 'E5'].forEach((n, i) => ev.push([s0 + i * beat * 0.5, n, 0.3 + 0.06 * i]));
  ev.push([s0 + 3 * beat, 'C4', 0.95], [s0 + 3 * beat + 0.02, 'G4', 0.6]);
  return perform(kalimba, ev, s0 + 3 * beat + 3);
}

function glockenspielDemo() {
  const ev = [];
  const b = 0.32;
  const line = ['G5', 'C6', 'E6', 'G6', 'E6', 'C6', 'D6', 'F6', 'A6', 'G6', 'E6', 'C6', 'B5', 'D6', 'G6', 'C7'];
  line.forEach((n, i) => ev.push([i * b, n, 0.5 + 0.3 * ((i % 4) === 0), { hardness: 0.65 }]));
  const s0 = line.length * b + 0.6;
  // Soft and hard on the same bars.
  ev.push([s0, 'C6', 0.25, { hardness: 0.4 }], [s0 + 0.8, 'C6', 1.0, { hardness: 0.9 }]);
  ev.push([s0 + 1.8, 'G5', 0.3, { hardness: 0.4 }], [s0 + 2.6, 'G5', 1.0, { hardness: 0.9 }]);
  // Fast upward arpeggio to the top bar.
  const a0 = s0 + 3.8;
  ['C6', 'E6', 'G6', 'C7', 'E7', 'G7', 'C8'].forEach((n, i) => ev.push([a0 + i * 0.09, n, 0.55 + i * 0.05]));
  ev.push([a0 + 1.4, 'C6', 0.6], [a0 + 1.4, 'G6', 0.5], [a0 + 1.4, 'E7', 0.45]);
  return perform(glockenspiel, ev, a0 + 6);
}

function bellsDemo() {
  const ev = [];
  const peal = [['E5', 'C5', 'D5', 'G4'], ['C5', 'E5', 'D5', 'G4'], ['G4', 'D5', 'E5', 'C5']];
  peal.forEach((row, r) => row.forEach((n, i) => ev.push([r * 3.6 + i * 0.85, n, i === 3 ? 0.9 : 0.6 + 0.08 * i])));
  ev.push([11.2, 'C4', 0.95, { hardness: 0.7 }], [11.2, 'G4', 0.5]);
  return perform(bells, ev, 17);
}

const demos = [
  ['marimba', marimbaDemo], ['vibraphone', vibraphoneDemo], ['kalimba', kalimbaDemo],
  ['glockenspiel', glockenspielDemo], ['bells', bellsDemo],
];
const t0 = performance.now();
for (const [name, fn] of demos) {
  const t = performance.now();
  const buf = fn();
  normalizePeak([buf], -3);
  const s = stats([buf]);
  writeWav(outPath(`${name}.wav`), [buf]);
  console.log(`${name.padEnd(13)} ${(buf.length / SR).toFixed(1)} s  peak ${s.peakDb.toFixed(2)} dBFS  rms ${s.rmsDb.toFixed(1)} dB  maxJump ${s.maxJump.toFixed(4)}  (${((performance.now() - t) / 1000).toFixed(1)} s)`);
}
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)} s`);
