import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/string-ensemble.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const beat = 60 / 72;
const [L, R] = buffer(22.6, 2);
let seed = 1;
function play(t, midi, preset, velocity, dur, hall = 0.35) {
  const [l, r] = render({ midi, preset, velocity, duration: dur, seed: seed++, hall });
  const s = Math.round(t * SR);
  mixInto(L, l, s); mixInto(R, r, s);
}

// 1. Slow legato chords, low strings first, upper voices entering one bar later.
const chords = [
  [38, 50, 57, 65, 69],
  [34, 50, 58, 65, 70],
  [41, 48, 57, 64, 72],
  [36, 48, 55, 64, 67],
];
let t = 0.1;
chords.forEach((c, i) => {
  c.forEach((m, k) => play(t + k * 0.06, m, 'legato', 0.45 + 0.1 * (i % 2) + (k === c.length - 1 ? 0.1 : 0), 2 * beat + 0.15));
  t += 2 * beat;
});

// 2. Pizzicato walking line under staccato chords.
const t2 = t + 0.2;
const walk = [38, 45, 50, 45, 46, 53, 58, 53, 41, 48, 53, 48, 43, 50, 55, 52];
walk.forEach((m, i) => play(t2 + i * beat * 0.5, m, 'pizzicato', 0.75, 0.4));
const stabs = [[0.5, [62, 65, 69]], [1.5, [62, 65, 69]], [2.5, [62, 65, 70]], [3.5, [62, 65, 70]], [4.5, [60, 65, 69]], [5.5, [60, 64, 69]], [6.5, [62, 67, 71]], [7.5, [64, 67, 72]]];
for (const [b, ms] of stabs) ms.forEach((m, k) => play(t2 + b * beat + 0.01 * k, m, 'staccato', 0.6, 0.15));
t = t2 + 8 * beat;

// 3. Tremolo swell to an open fifth, then a legato line on top of it.
const t3 = t + 0.1;
[[38, 0.35], [45, 0.4], [50, 0.45], [57, 0.5]].forEach(([m, v], k) => play(t3 + 0.3 * k, m, 'tremolo', v, 4.2 * beat - 0.3 * k));
const line = [[1, 69, 1], [2, 72, 0.5], [2.5, 74, 0.5], [3, 76, 1.2]];
for (const [b, m, l] of line) play(t3 + b * beat, m, 'legato', 0.6, l * beat + 0.1);
t = t3 + 4.4 * beat;

// 4. Final chord, held and released into the hall.
[26 + 12, 50, 57, 62, 66, 69, 74].forEach((m, k) => play(t + 0.04 * k, m, 'legato', 0.55, 3.2 * beat, 0.45));

const ch = normalizePeak([L, R], -3);
writeWav(outPath('string-ensemble.wav'), ch);
const s = stats(ch);
console.log(`string-ensemble.wav: ${(L.length / SR).toFixed(1)} s, peak ${s.peakDb.toFixed(2)} dBFS, max jump ${s.maxJump.toFixed(4)}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
