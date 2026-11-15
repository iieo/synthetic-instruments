import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/hardstyle-kick.mjs';
import { truePeak } from '../instruments/techno-kick/dsp.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const bpm = 150, beat = 60 / bpm, bar = 4 * beat;
const [out] = buffer(40);
const at = (t) => Math.round(t * SR);
const cache = new Map();
const kick = (opts) => {
  const key = JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, render(opts));
  return cache.get(key);
};

// Part 1: each preset alone on two notes.
let t = 0.2;
for (const [preset, notes, gap] of [['euphoric', [31, 38], 0.75], ['raw', [31, 36], 0.7], ['reverse-bass', [31, 34], 0.5]]) {
  for (const midi of notes) for (let k = 0; k < (preset === 'reverse-bass' ? 2 : 1); k++) {
    mixInto(out, kick({ preset, midi, velocity: 1, bpm }), at(t));
    t += preset === 'reverse-bass' ? beat : gap;
  }
  t += 0.4;
}

// Part 2: the kick plays the bassline, one note per bar, each kick cut at the next beat.
const line = [30, 30, 33, 28];
const gate = beat - 0.04;
for (let b = 0; b < 8; b++) {
  const preset = b < 4 ? 'euphoric' : 'raw';
  for (let q = 0; q < 4; q++) {
    const midi = b >= 4 && q === 3 && b % 2 === 1 ? line[b % 4] + 7 : line[b % 4];
    mixInto(out, kick({ preset, midi, velocity: q === 0 ? 1 : 0.92, duration: gate }), at(t + q * beat));
  }
  t += bar;
}

// Part 3: reverse bass, the swell on every offbeat follows the same line.
for (let b = 0; b < 4; b++) {
  for (let q = 0; q < 4; q++) mixInto(out, kick({ preset: 'reverse-bass', midi: line[b], velocity: q === 0 ? 1 : 0.92, bpm }), at(t + q * beat));
  t += bar;
}
mixInto(out, kick({ preset: 'euphoric', midi: 30, velocity: 1, duration: 1.2 }), at(t));
t += 1.3;

const y = out.slice(0, at(t));
const s0 = stats([y]), tp0 = truePeak(y);
const g = Math.min(10 ** (-1 / 20) / s0.peak, 10 ** (-0.5 / 20) / tp0);
for (let i = 0; i < y.length; i++) y[i] *= g;
writeWav(outPath('hardstyle-kick.wav'), [y]);
const s = stats([y]);
console.log({ seconds: +(y.length / SR).toFixed(2), peakDb: +s.peakDb.toFixed(2), truePeakDb: +(20 * Math.log10(truePeak(y))).toFixed(2), maxJump: +s.maxJump.toFixed(4), renderMs: Math.round(performance.now() - t0) });
