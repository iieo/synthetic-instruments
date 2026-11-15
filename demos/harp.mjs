import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render, meta } from '../instruments/harp.mjs';
import { room } from '../instruments/harp/room.mjs';
import { outPath } from './lib/out.mjs';

const beat = 60 / 76;
const notes = [];
let seed = 1;
const note = (t, midi, vel, dur, extra = {}) => notes.push({ t, midi, vel, dur, seed: seed++, ...extra });

// 1. Rolling arpeggios, up and back down, every string left ringing until the chord changes.
const chords = [
  [36, 43, 48, 52, 55, 59, 62, 64, 67, 71, 74, 76],
  [33, 40, 45, 48, 52, 55, 59, 60, 64, 67, 71, 72],
  [29, 36, 41, 45, 48, 52, 57, 60, 64, 65, 69, 72],
  [31, 38, 43, 47, 50, 53, 57, 59, 62, 65, 67, 71],
];
let t = 0.15;
chords.forEach((c, ci) => {
  const step = beat / 6;
  const order = [...c, ...c.slice(1, -1).reverse()].slice(0, 12);
  order.forEach((m, i) => {
    const v = 0.5 + 0.25 * Math.sin((Math.PI * i) / 11) + (i === 0 ? 0.15 : 0);
    note(t + i * step, m, v, (ci === chords.length - 1 ? 2.6 : 2.1) * beat - i * step + 0.25);
  });
  t += 2 * beat;
});

// 2. Glissando over the C major setting, up across nearly the whole range and back to the middle.
const cMajor = [];
for (let m = meta.range[0]; m <= meta.range[1]; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) cMajor.push(m);
const up = cMajor.filter((m) => m >= 31 && m <= 98);
const glissStart = t + 0.1;
up.forEach((m, i) => note(glissStart + i * (1.5 / up.length), m, 0.45 + 0.35 * (i / up.length), 3.2 - i * (1.5 / up.length)));
const down = cMajor.filter((m) => m >= 64 && m < 98).reverse();
const downStart = glissStart + 1.55;
down.forEach((m, i) => note(downStart + i * (0.75 / down.length), m, 0.7 - 0.25 * (i / down.length), 2.4));
t = downStart + 1.6;

// 3. Melody with bass in A minor, light rolled chords in the middle.
const t3 = t;
const melody = [
  [0, 76, 1], [1, 72, 0.5], [1.5, 74, 0.5], [2, 76, 1], [3, 81, 1],
  [4, 79, 1.5], [5.5, 77, 0.5], [6, 76, 1], [7, 72, 1],
  [8, 74, 0.5], [8.5, 76, 0.5], [9, 77, 0.5], [9.5, 79, 0.5], [10, 76, 2.2],
];
for (const [b, m, l] of melody) note(t3 + b * beat, m, 0.75, l * beat + 0.15);
const bass = [[0, [33, 45]], [2, [40]], [4, [29, 41]], [6, [36]], [8, [31, 43]], [10, [36, 48]]];
for (const [b, ms] of bass) ms.forEach((m, i) => note(t3 + b * beat + i * 0.012, m, 0.72, 2 * beat + 0.1));
const inner = [[1, [57, 60, 64]], [3, [57, 60, 64]], [5, [57, 60, 65]], [7, [57, 60, 64]], [9, [55, 59, 62]], [11, [55, 60, 64]]];
for (const [b, ms] of inner) ms.forEach((m, i) => note(t3 + b * beat + 0.03 + i * 0.035, m, 0.38, beat * 0.95));
t = t3 + 12.2 * beat;

// 4. Étouffé: plucked and stopped at once by the same hand.
const muted = [[0, 43], [0.5, 48], [1, 52], [1.5, 55], [2, 48], [2.25, 52], [2.5, 55], [3, 43]];
for (const [b, m] of muted) note(t + b * beat * 0.75, m, 1, 0.1, { muted: true });
t += 3.6 * beat * 0.75;

// 5. Big rolled C major chord, left to ring and then damped.
[24, 36, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79, 84, 88].forEach((m, i) => note(t + i * 0.038, m, 0.62 + 0.012 * i, 4.6 - i * 0.038));

const end = Math.max(...notes.map((n) => n.t + n.dur)) + 1.6;
const mix = buffer(end, 2);
const t0 = Date.now();
for (const n of notes) {
  const x = render({ midi: n.midi, velocity: n.vel, duration: n.dur, seed: n.seed, muted: n.muted });
  const pan = (Math.PI / 4) * (1 + 0.75 * ((n.midi - 64) / 40));
  const start = Math.round(n.t * SR);
  mixInto(mix[0], x, start, Math.cos(pan));
  mixInto(mix[1], x, start, Math.sin(pan));
}
const out = room(mix);
const fade = Math.round(0.4 * SR);
for (const ch of out) for (let i = 0; i < fade; i++) ch[ch.length - 1 - i] *= i / fade;
normalizePeak(out, -3);
writeWav(outPath('harp.wav'), out);
console.log(`${notes.length} notes, ${end.toFixed(1)} s, rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(stats(out));
