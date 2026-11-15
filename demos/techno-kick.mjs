import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render, renderRumble } from '../instruments/techno-kick.mjs';
import { truePeak } from '../instruments/techno-kick/dsp.mjs';
import { outPath } from './lib/out.mjs';

const t0 = Date.now();
const bpm = 150, beat = 60 / bpm, bar = 4 * beat;
const [out] = buffer(30);
const cache = new Map();
const kick = (opts) => {
  const key = JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, render(opts));
  return cache.get(key);
};
const at = (t) => Math.round(t * SR);

// Part 1: every preset alone, three hits each.
let t = 0.25;
const solo = [
  ['hard', [[0.9, 1], [0.7, 2], [1, 3]], 0.62],
  ['industrial', [[0.9, 1], [0.75, 2], [1, 3]], 0.66],
  ['gabber', [[0.9, 1, 62], [0.9, 2, 55], [1, 3, 69]], 0.74],
];
for (const [preset, hits, gap] of solo) {
  for (const [velocity, seed, pitch] of hits) { mixInto(out, kick({ preset, velocity, seed, pitch }), at(t)); t += gap; }
  t += 0.35;
}
for (let k = 0; k < 2; k++) { mixInto(out, kick({ preset: 'rumble', velocity: 0.9, seed: 1 + k, bpm }), at(t)); t += beat; }
t += 0.6;

// Part 2: straight 4/4 at 150 BPM, one bar per preset, hard gets a pickup on the last 16th pair.
const seq = [['hard', 2], ['industrial', 1], ['gabber', 1]];
for (const [preset, nb] of seq) {
  for (let b = 0; b < nb; b++) {
    for (let q = 0; q < 4; q++) {
      mixInto(out, kick({ preset, velocity: q === 0 ? 1 : 0.88, seed: 1 + q }), at(t + q * beat));
    }
    if (preset === 'hard' && b === nb - 1) mixInto(out, kick({ preset, velocity: 0.7, seed: 9, decay: 0.45 }), at(t + 3.75 * beat));
    t += bar;
  }
}

// Part 3: eight bars of kick plus rumble, root moving A, A, F, G (MIDI 33, 33, 29, 31).
const rum = renderRumble({ bpm, bars: 8, roots: [33, 33, 29, 31], velocity: 0.92, seed: 4, tail: 1.2 });
mixInto(out, rum, at(t));
t += rum.length / SR;

const y = out.slice(0, at(t + 0.05));
const s0 = stats([y]), tp0 = truePeak(y);
// Plain linear gain: -1 dBFS sample peak, but never above -0.6 dBTP.
const g = Math.min(10 ** (-1 / 20) / s0.peak, 10 ** (-0.6 / 20) / tp0);
for (let i = 0; i < y.length; i++) y[i] *= g;
let mean = 0;
for (const v of y) mean += v;
const s = stats([y]);
writeWav(outPath('techno-kick.wav'), [y]);
console.log({
  seconds: +(y.length / SR).toFixed(2), peakDb: +s.peakDb.toFixed(2), rmsDb: +s.rmsDb.toFixed(2),
  truePeakDb: +(20 * Math.log10(truePeak(y))).toFixed(2), maxJump: +s.maxJump.toFixed(4),
  dcOffset: mean / y.length, renderMs: Date.now() - t0,
});
