import { SR, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/beeper.mjs';
import { truePeakDb } from '../instruments/acid/dsp.mjs';
import { outPath } from './lib/out.mjs';

// One speaker, one routine at a time, as on the real machines: a plain tune, a pulse-width sweep,
// multiplexed chords, a pulse-interleaving groove with drums, and a piezo jingle at the end.
const S = 60 / 132 / 4;
const parts = [];
let cursor = 0;
const seq = (notes, preset, extra = {}, gain = 1) => {
  for (const [s, m, len, opts] of notes) parts.push([cursor + s * S, render({ preset, midi: m, duration: len * S * 0.92, velocity: 0.9, seed: s, ...extra, ...opts }), gain]);
};
const advance = (steps) => { cursor += steps * S; };

seq([[0, 64, 2], [2, 67, 2], [4, 71, 4], [8, 69, 2], [10, 67, 2], [12, 66, 2], [14, 67, 2],
  [16, 64, 3], [19, 62, 1], [20, 64, 4], [24, 59, 8]], 'square', {}, 0.9);
advance(34);
seq([[0, 40, 16], [16, 43, 16]], 'pwm', {}, 0.9);
advance(34);
seq([[0, 52, 8, { chord: 'minor' }], [8, 48, 8, { chord: 'major' }], [16, 50, 8, { chord: 'sus4' }], [24, 47, 8, { chord: 'dim' }]], 'chord', {}, 0.8);
advance(34);
const groove = [];
const kicks = [], noises = [];
for (let b = 0; b < 2; b++) for (const [s, m] of [[0, 52], [3, 59], [6, 64], [8, 55], [11, 60], [14, 62]]) {
  groove.push([b * 16 + s + 0.5, m, 2, { chord: b ? 'power' : 'octave' }]);
  if (s === 0 || s === 6) kicks.push([b * 16 + s, 60, 1]);
  if (s === 8) noises.push([b * 16 + s - 4, 64, 1], [b * 16 + s + 4, 64, 1]);
}
seq(groove, 'pin-pulse', {}, 1);
seq(kicks, 'drum-kick', {}, 0.8);
seq(noises, 'drum-noise', { duration: 0.05 }, 0.7);
advance(34);
seq([[0, 76, 1], [1, 79, 1], [2, 84, 2], [4, 83, 1], [5, 79, 1], [6, 84, 4]], 'piezo', {}, 1);
advance(12);

const total = Math.round((cursor + 0.5) * SR);
const mix = new Float64Array(total);
for (const [t, y, g] of parts) mixInto(mix, y, Math.round(t * SR), g);
normalizePeak([mix], -1);
let tp = truePeakDb(mix);
if (tp > -0.5) { const g = 10 ** ((-0.6 - tp) / 20); for (let i = 0; i < mix.length; i++) mix[i] *= g; tp = truePeakDb(mix); }
writeWav(outPath('beeper.wav'), [mix]);
console.log('out/beeper.wav', (mix.length / SR).toFixed(2), 's', { ...stats([mix]), truePeakDb: tp });
