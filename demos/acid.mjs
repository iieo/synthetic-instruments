import { SR, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { renderSequence } from '../instruments/acid.mjs';
import { truePeakDb } from '../instruments/acid/dsp.mjs';
import { outPath } from './lib/out.mjs';

const pattern = (notes, accents, slides, rests = []) =>
  notes.map((midi, i) => (rests.includes(i) ? null : { midi, gate: true, accent: !!accents[i], slide: !!slides[i] }));
const repeat = (p, bars) => Array.from({ length: bars }, () => p).flat();
const rmsDb = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return 10 * Math.log10(s / (b - a)); };

// Part 1 and 2: a classic squelch line at 140 BPM, 4 bars static, then 8 bars with a long
// cutoff and resonance sweep (up over 6 bars, back down over 2).
const classic = pattern(
  [36, 36, 48, 36, 39, 41, 36, 48, 36, 46, 36, 39, 41, 36, 48, 43],
  [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0],
  [10],
);
const bar140 = 16 * 60 / 140 / 4;
const sweepStart = 4 * bar140, upEnd = 10 * bar140, end = 12 * bar140;
const sweep = (lo, peak, hi) => (t) => {
  if (t < sweepStart) return lo;
  if (t < upEnd) { const u = (t - sweepStart) / (upEnd - sweepStart); return lo + (peak - lo) * u * u * (3 - 2 * u); }
  const u = Math.min(1, (t - upEnd) / (end - upEnd)); return peak + (hi - peak) * u;
};
const partA = renderSequence({
  steps: repeat(classic, 12), bpm: 140, waveform: 'saw', seed: 7,
  cutoff: sweep(0.26, 0.72, 0.2), resonance: sweep(0.72, 0.97, 0.8), envMod: sweep(0.55, 0.35, 0.6),
  decay: 0.4, accentAmount: 0.8,
});

// Part 3: distorted hard-techno line at 150 BPM, rising cutoff.
const hard = pattern(
  [33, 33, 45, 33, 33, 36, 33, 45, 33, 33, 43, 33, 45, 33, 36, 40],
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
);
const bar150 = 16 * 60 / 150 / 4, hardBars = 6;
const partC = renderSequence({
  steps: repeat(hard, hardBars), bpm: 150, waveform: 'saw', seed: 11,
  cutoff: (t) => 0.2 + 0.25 * Math.min(1, t / (hardBars * bar150)), resonance: 0.88, envMod: 0.7,
  decay: 0.25, accentAmount: 0.9, drive: 0.75, gateLength: 0.6,
});

const startC = Math.round(end * SR);
const total = startC + partC.length;
const mix = new Float64Array(total);
mixInto(mix, partA, 0, 1);
// Match the loudness of the distorted part to the first bars (linear gain only).
const gC = 10 ** ((rmsDb(partA, 0, Math.round(4 * bar140 * SR)) + 3 - rmsDb(partC, 0, Math.round(hardBars * bar150 * SR))) / 20);
mixInto(mix, partC, startC, gC);

normalizePeak([mix], -1);
let tp = truePeakDb(mix);
if (tp > -0.5) { const g = 10 ** ((-0.6 - tp) / 20); for (let i = 0; i < mix.length; i++) mix[i] *= g; tp = truePeakDb(mix); }
writeWav(outPath('acid.wav'), [mix]);
console.log('out/acid.wav', (mix.length / SR).toFixed(2), 's', { ...stats([mix]), truePeakDb: tp });
