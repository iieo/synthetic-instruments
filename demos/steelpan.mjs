import { SR, buffer, mixInto, normalizePeak, stats, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/steelpan.mjs';
import { outPath } from './lib/out.mjs';

const rand = rng(1962);
const hits = [];
let seed = 1;
const hit = (t, midi, vel, ring) => hits.push({ t: Math.max(0, t + 0.006 * (2 * rand() - 1)), midi, vel: Math.min(1, vel), ring, seed: seed++ });

// Single stroke or double stop (both sticks at once, the second a hair later).
function play(t, notes, vel, ring) {
  [].concat(notes).forEach((m, i) => hit(t + i * 0.004, m, vel * (i ? 0.88 : 1), ring));
}

// Roll: alternating sticks at about 14 strokes per second. On a double stop each hand keeps its own note.
// `shape` maps the position 0..1 in the roll to a dynamic factor.
function roll(t, notes, vel, len, shape = () => 1, rate = 14) {
  notes = [].concat(notes);
  const n = Math.max(2, Math.round(len * rate));
  for (let k = 0; k < n; k++) {
    const hand = k % 2;
    const m = notes[notes.length > 1 ? hand : 0];
    const accent = k === 0 ? 1.15 : hand ? 0.82 : 0.92;
    hit(t + k / rate + 0.008 * (2 * rand() - 1), m, vel * accent * shape(k / n) * (0.93 + 0.14 * rand()), 0.7);
  }
}

// Calypso, F major, 112 BPM, straight eighths with pushed off-beats.
const beat = 60 / 112;
const T = (bar, b) => (bar * 4 + b) * beat;
const line = (bar, notes, vel) => { for (const [b, m, len] of notes) play(T(bar, b), m, vel * (b % 1 ? 1.08 : 1), len * beat + 0.9); };

line(0, [[0, 72, 0.5], [0.5, 74, 0.5], [1, 77, 0.5], [1.5, 77, 0.5], [2, 76, 0.5], [2.5, 74, 0.5], [3, 72, 1]], 0.45);
line(1, [[0, 69, 0.5], [0.5, 72, 1], [1.5, 74, 0.5]], 0.45);
roll(T(1, 2), 72, 0.4, 2 * beat, (x) => 1 - 0.35 * x);
line(2, [[0, 70, 0.5], [0.5, 74, 0.5], [1, 79, 0.5], [1.5, 79, 0.5], [2, 77, 0.5], [2.5, 76, 0.5], [3, 74, 1]], 0.6);
line(3, [[0, 76, 0.5], [0.5, 77, 1], [1.5, 79, 0.5]], 0.62);
roll(T(3, 2), [77, 81], 0.55, 2 * beat, (x) => 0.8 + 0.4 * x);
// Hard chorus in sixths.
line(4, [[0, [69, 77], 0.5], [0.5, [70, 79], 0.5], [1, [72, 81], 1], [2, [74, 82], 0.5], [2.5, [72, 81], 0.5], [3, [70, 79], 1]], 0.92);
line(5, [[0, [69, 77], 0.5], [0.5, [67, 76], 0.5], [1, [72, 77], 1]], 0.95);
roll(T(5, 2), [77, 81], 0.9, 2.2 * beat, (x) => 1.05 - 0.5 * x);
play(T(6, 0.5), [65, 72], 0.85, 2.2);

// Ballad, 60 BPM, soft rolled double stops.
const t0 = T(7, 0.5);
const B = (b) => t0 + b;
play(B(0), 72, 0.32, 1.6);
roll(B(1), [77, 81], 0.3, 1.9, (x) => 0.7 + 0.6 * Math.sin(Math.PI * x), 12);
play(B(3), 79, 0.35, 1.2);
play(B(3.5), 77, 0.3, 1.2);
roll(B(4), [72, 76], 0.3, 1.9, (x) => 0.8 + 0.4 * Math.sin(Math.PI * x), 12);
play(B(6), 74, 0.33, 1.5);
play(B(6.5), 72, 0.28, 1.5);
roll(B(7), [69, 77], 0.32, 3.2, (x) => 1.1 - 0.75 * x, 11);
play(B(10.4), [65, 77], 0.22, 2.4);

const end = Math.max(...hits.map((h) => h.t + h.ring + 0.2)) + 0.3;
const [out] = buffer(end);
for (const h of hits) mixInto(out, render({ midi: h.midi, velocity: h.vel, duration: h.ring, seed: h.seed }), Math.round(h.t * SR));

const fade = Math.round(0.05 * SR);
for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
normalizePeak([out], -3);
writeWav(outPath('steelpan.wav'), [out]);
console.log({ seconds: +(out.length / SR).toFixed(2), strokes: hits.length, ...stats([out]) });
