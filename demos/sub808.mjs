import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render, renderSequence } from '../instruments/sub808.mjs';
import { kaiserLowpass } from '../instruments/rave/dsp.mjs';
import { outPath } from './lib/out.mjs';

const BPM = 145, beat = 60 / BPM, bar = 4 * beat;
const parts = [];

// Part 1: each preset as single notes.
[['clean', 31], ['clean', 36], ['distorted', 31], ['distorted', 26], ['slide', 33], ['slide', 29]].forEach(([preset, midi], i) =>
  parts.push({ t: i * 1.3, x: render({ preset, midi, velocity: 0.95, duration: 1.1 }) }));

// Part 2: a legato line per preset. [beat, midi, beats, slide]
const line = [
  [0, 29, 1.5], [1.5, 29, 0.5], [2, 36, 1.25, true], [3.5, 32, 0.5],
  [4, 27, 2], [6, 34, 1, true], [7, 32, 1, true],
  [8, 29, 0.75], [9, 29, 0.5], [9.5, 24, 1.5, true], [11.5, 31, 0.5],
  [12, 32, 1.5], [13.5, 31, 0.5, true], [14, 27, 2],
];
const T0 = 8.4;
['clean', 'distorted', 'slide'].forEach((preset, k) => {
  const notes = line.map(([b, midi, len, slide]) => ({ t: b * beat, midi, duration: len * beat - (slide ? 0 : 0.03), velocity: b % 4 === 0 ? 1 : 0.85, slide: !!slide }));
  parts.push({ t: T0 + k * 4 * bar, x: renderSequence({ preset, notes }) });
});

const total = Math.max(...parts.map((p) => p.t + p.x.length / SR)) + 0.2;
const [M] = buffer(total, 1);
for (const p of parts) mixInto(M, p.x, Math.round(p.t * SR));

function truePeak(chs) {
  const os = 4, h = kaiserLowpass(4 * 48 - 1, 0.5 / os * 0.92, 9), D = (h.length - 1) / 2;
  let peak = 0;
  for (const x of chs) {
    for (let n = 0; n < x.length; n++) {
      for (let k = 0; k < os; k++) {
        let acc = 0;
        const c = n * os + k + D;
        for (let i = c % os; i < h.length; i += os) {
          const j = (c - i) / os;
          if (j >= 0 && j < x.length) acc += h[i] * x[j];
        }
        peak = Math.max(peak, Math.abs(acc * os));
      }
    }
  }
  return peak;
}
const tp = truePeak([M]), gain = Math.min(10 ** (-1 / 20) / stats([M]).peak, 10 ** (-0.6 / 20) / tp);
for (let i = 0; i < M.length; i++) M[i] *= gain;

writeWav(outPath('sub808.wav'), [M]);
console.log(`${total.toFixed(1)} s, true peak ${(20 * Math.log10(tp * gain)).toFixed(2)} dBTP`);
console.log('sub808.wav', stats([M]));
