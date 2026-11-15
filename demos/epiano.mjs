import { SR, buffer, mixInto, normalizePeak, stats, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/epiano.mjs';
import { outPath } from './lib/out.mjs';

const BPM = 72;
const beat = 60 / BPM;
const SWING = 0.62;
const rand = rng(2024);

// Swung eighths: the off-beat eighth lands at SWING of the beat instead of 0.5.
const swingTime = (b) => {
  const whole = Math.floor(b), frac = b - whole;
  const f = frac === 0.5 ? SWING : frac;
  return (whole + f) * beat;
};

const notes = [];
const note = (b, midi, vel, len) => notes.push({ t: swingTime(b), midi, vel, dur: len * beat });

function chord(b, bass, upper, vel, len, roll = 0.018) {
  note(b, bass, vel * 0.95, len);
  upper.forEach((m, i) => {
    const v = Math.min(1, vel * (0.85 + 0.12 * rand()));
    notes.push({ t: swingTime(b) + 0.03 + i * roll * (0.7 + 0.6 * rand()), midi: m, vel: v, dur: len * beat - 0.05 });
  });
}

const Dmaj9 = [54, 57, 61, 64];
const Bm9 = [62, 66, 69, 73];
const Em9 = [55, 59, 62, 66];
const A13 = [55, 61, 66, 71];
const Gmaj7s11 = [59, 61, 66, 73];
const Fsm7 = [57, 61, 64, 69];

// Bars 1 to 4: soft, mellow.
chord(0, 38, Dmaj9, 0.42, 3.8);
chord(4, 35, Bm9, 0.4, 3.8);
chord(8, 40, Em9, 0.45, 3.8);
chord(12, 33, A13, 0.5, 1.9);
chord(14, 45, A13.map((m) => m + 2), 0.45, 1.8, 0.03);

const melody = [
  [1, 76, 0.45, 0.5], [1.5, 78, 0.4, 0.5], [2, 81, 0.5, 1.5],
  [5, 78, 0.42, 0.5], [5.5, 76, 0.4, 0.5], [6, 73, 0.45, 1.5],
  [9, 74, 0.45, 0.5], [9.5, 76, 0.42, 0.5], [10, 78, 0.5, 0.5], [10.5, 79, 0.45, 1],
  [13, 83, 0.55, 0.5], [13.5, 81, 0.45, 0.5], [14, 79, 0.45, 0.5], [14.5, 78, 0.4, 0.5], [15, 76, 0.4, 1],
];
for (const [b, m, v, l] of melody) note(b, m, v, l);

// Bars 5 and 6: hard comping, the tines bark.
chord(16, 43, Gmaj7s11, 0.95, 1.4, 0.008);
chord(17.5, 43, Gmaj7s11, 0.8, 0.45, 0.006);
chord(18.5, 42, Fsm7, 1.0, 1.4, 0.008);
chord(20, 40, Em9, 0.95, 1.4, 0.008);
chord(21.5, 40, Em9, 0.75, 0.45, 0.006);
chord(22.5, 33, A13, 1.0, 1.4, 0.008);
for (const [b, m, v, l] of [[17, 85, 0.9, 0.5], [19, 86, 0.95, 0.5], [21, 83, 0.9, 0.5], [23, 81, 0.85, 0.9]]) note(b, m, v, l);

// Bars 7 and 8: back to soft, bass run and a long final chord.
for (const [b, m, v] of [[24, 33, 0.7], [24.5, 35, 0.6], [25, 37, 0.65], [25.5, 38, 0.7]]) note(b, m, v, 0.55);
chord(26, 38, [54, 57, 61, 64, 69], 0.5, 6, 0.04);
for (const [b, m, v, l] of [[27, 81, 0.4, 0.5], [27.5, 78, 0.38, 0.5], [28, 76, 0.4, 0.5], [28.5, 73, 0.35, 0.5], [29, 74, 0.38, 3]]) note(b, m, v, l);

const t0 = performance.now();
const total = Math.max(...notes.map((n) => n.t + n.dur)) + 1.5;
const [mono] = buffer(total);
notes.forEach((n, i) => {
  const x = render({ midi: n.midi, velocity: n.vel, duration: n.dur, seed: i + 1 });
  mixInto(mono, x, Math.round(n.t * SR));
});

const fadeN = Math.round(0.5 * SR);
for (let i = 0; i < fadeN; i++) mono[mono.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeN);

// Stereo tremolo as on suitcase-type amps: an LFO pans between two speakers with equal power.
const L = new Float64Array(mono.length), R = new Float64Array(mono.length);
const rate = 4.2, depth = 0.75;
for (let i = 0; i < mono.length; i++) {
  const pan = 0.5 + 0.5 * depth * Math.sin((2 * Math.PI * rate * i) / SR);
  L[i] = mono[i] * Math.cos((pan * Math.PI) / 2);
  R[i] = mono[i] * Math.sin((pan * Math.PI) / 2);
}

normalizePeak([mono], -3);
normalizePeak([L, R], -3);
writeWav(outPath('epiano.wav'), [mono]);
writeWav(outPath('epiano-tremolo.wav'), [L, R]);
console.log(`${notes.length} notes, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('epiano.wav', stats([mono]));
console.log('epiano-tremolo.wav', stats([L, R]));
