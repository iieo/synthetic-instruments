import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/tonewheel-organ.mjs';
import { rotary } from '../instruments/tonewheel-organ/effects.mjs';
import { fadeOut } from '../instruments/synth/dsp.mjs';
import { outPath } from './lib/out.mjs';

// All notes are rendered dry and share one rotating speaker, which speeds up in bar 5 and slows
// down again for the last chord.
const BPM = 96;
const beat = 60 / BPM, SWING = 0.64;
const swing = (b) => { const w = Math.floor(b), f = b - w; return (w + (f === 0.5 ? SWING : f)) * beat; };

const notes = [];
const lower = { preset: 'jazz', registration: '008800000', percussion: 'off', vibrato: 'c3', rotor: 'off', drive: 0.2 };
const upper = { preset: 'jazz', registration: '888000000', percussion: '3rd', vibrato: 'c3', rotor: 'off', drive: 0.25 };
const chord = (b, ms, len, vel = 0.7) => ms.forEach((m) => notes.push({ t: swing(b) + 0.004 * (m % 3), opts: { ...lower, midi: m, velocity: vel, duration: len * beat - 0.04 } }));
const lead = (b, m, len, vel = 0.85, extra = {}) => notes.push({ t: swing(b), opts: { ...upper, midi: m, velocity: vel, duration: len * beat - 0.03, ...extra } });

// Left hand: Gm9, C13, Fmaj9, D7#9 and again, then a slow ending on Bbmaj9 to F.
const prog = [[0, [53, 57, 58, 62]], [4, [52, 57, 58, 62]], [8, [52, 57, 60, 64]], [12, [54, 57, 60, 65]],
  [16, [53, 57, 58, 62]], [20, [52, 57, 58, 62]], [24, [52, 57, 60, 64]], [28, [54, 57, 60, 65]]];
for (const [b, ms] of prog) { chord(b, ms, 2.4); chord(b + 2.5, ms, 1.5, 0.6); }
chord(32, [50, 57, 60, 64], 4, 0.65);
chord(36, [48, 52, 57, 60, 65], 7, 0.6);
// Pedal bass on the 16' drawbar.
for (const [b, m] of [[0, 31], [4, 36], [8, 29], [12, 26], [16, 31], [20, 36], [24, 29], [28, 26], [32, 34], [36, 29]]) {
  notes.push({ t: swing(b), opts: { preset: 'clean', registration: '808000000', midi: Math.max(36, m + 12), velocity: 0.75, duration: (b >= 32 ? 3.8 : 1.8) * beat } });
}

// Right hand: a short call, an answer, then a held note and a run that the fast rotor smears.
const line = [
  [0.5, 74, 0.5], [1, 77, 0.5], [1.5, 79, 0.5], [2, 81, 1], [3.5, 79, 0.5],
  [4.5, 77, 0.5], [5, 74, 1.5], [7, 72, 0.5], [7.5, 74, 0.5],
  [8.5, 76, 0.5], [9, 77, 0.5], [9.5, 76, 0.5], [10, 72, 2],
  [13, 69, 0.5], [13.5, 72, 0.5], [14, 75, 0.5], [14.5, 76, 1.5],
  [16, 86, 3.5],
  [20, 84, 0.5], [20.5, 82, 0.5], [21, 81, 0.5], [21.5, 79, 0.5], [22, 77, 0.5], [22.5, 74, 0.5], [23, 77, 1],
  [24.5, 81, 0.5], [25, 84, 0.5], [25.5, 81, 0.5], [26, 79, 1.5], [28, 77, 0.5], [28.5, 78, 0.5], [29, 79, 0.5], [29.5, 81, 2],
  [33, 84, 0.5], [33.5, 82, 0.5], [34, 81, 1.5], [36, 77, 6],
];
for (const [b, m, l] of line) lead(b, m, l);

const t0 = performance.now();
const total = Math.max(...notes.map((n) => n.t + n.opts.duration)) + 1;
const [mono] = buffer(total);
notes.forEach((n, i) => mixInto(mono, render({ ...n.opts, seed: i + 1 })[0], Math.round(n.t * SR)));

const [L, R] = rotary(mono, { schedule: [[0, 'slow'], [swing(16), 'fast'], [swing(32), 'slow']], phase: [0.1, 0.6] });
fadeOut([L, R], 0.4);
normalizePeak([L, R], -1);
writeWav(outPath('tonewheel-organ.wav'), [L, R]);
console.log(`${notes.length} notes, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('tonewheel-organ.wav', stats([L, R]));
