import { SR, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/square-chip.mjs';
import { truePeakDb } from '../instruments/acid/dsp.mjs';
import { outPath } from './lib/out.mjs';

// Eight bars at 120 BPM in A minor: buzzer bass, frame arpeggios, echo lead and chip drums.
const S = 60 / 120 / 4;
const bars = 8, total = Math.round((bars * 16 * S + 1) * SR);
const mix = new Float64Array(total);
const put = (step, args, gain = 1) => mixInto(mix, render(args), Math.round(step * S * SR), gain);

const roots = [45, 41, 36, 43, 45, 41, 38, 40];
const chords = ['minor', 'major', 'major', 'major', 'minor', 'major', 'minor', 'major'];
roots.forEach((r, b) => {
  const at = b * 16;
  for (const [s, len, oct] of [[0, 3, 0], [3, 3, 12], [6, 2, 0], [8, 3, 0], [11, 2, 12], [14, 2, 0]]) {
    put(at + s, { preset: b === 7 ? 'buzz-tri' : 'buzz-saw', midi: r - 12 + oct, duration: len * S * 0.9, velocity: 0.9, seed: b }, 0.55);
  }
  if (b >= 2) for (const s of [0, 6, 12]) put(at + s, { preset: 'arp', midi: r + 12, arp: chords[b], duration: 4 * S, velocity: 0.5, seed: s }, 0.5);
  for (const s of [0, 7, 10]) put(at + s, { preset: 'kick', midi: 60, velocity: 1, seed: s }, 0.8);
  for (const s of [4, 12]) put(at + s, { preset: 'noise-snare', midi: 60, velocity: 0.9, seed: b }, 0.6);
  for (let s = 2; s < 16; s += 4) put(at + s, { preset: 'noise-hat', midi: 62, velocity: 0.6, duration: s === 14 ? 0.3 : 0.05, seed: s }, 0.45);
});

// Lead from bar 5: [step, midi, length in steps]
const lead = [
  [0, 76, 3], [3, 74, 1], [4, 72, 2], [6, 71, 2], [8, 69, 6], [14, 72, 2],
  [16, 77, 4], [20, 76, 2], [22, 74, 2], [24, 72, 8],
  [32, 74, 3], [35, 76, 1], [36, 77, 2], [38, 79, 2], [40, 81, 4], [44, 79, 2], [46, 77, 2],
  [48, 76, 6], [54, 74, 2], [56, 76, 8],
];
for (const [s, m, len] of lead) put(64 + s, { preset: 'echo-lead', midi: m, duration: len * S * 0.95, velocity: 0.8, seed: s }, 0.5);

normalizePeak([mix], -1);
let tp = truePeakDb(mix);
if (tp > -0.5) { const g = 10 ** ((-0.6 - tp) / 20); for (let i = 0; i < mix.length; i++) mix[i] *= g; tp = truePeakDb(mix); }
writeWav(outPath('square-chip.wav'), [mix]);
console.log('out/square-chip.wav', (mix.length / SR).toFixed(2), 's', { ...stats([mix]), truePeakDb: tp });
