import { SR, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/speech-chip.mjs';
import { truePeakDb } from '../instruments/acid/dsp.mjs';
import { outPath } from './lib/out.mjs';

// An original little piece at 96 BPM in A minor: a crude robot pulse, then syllables as a
// rhythm part, a sung lead over a four-chip choir, and a bright noisy line at the end.
const BPM = 96, beat = 60 / BPM, bars = 10;
const L = new Float64Array(Math.round((bars * 4 * beat + 2) * SR)), R = new Float64Array(L.length);
const at = (b) => Math.round(b * beat * SR);
const put = (beatPos, args, gain = 1) => {
  const [l, r] = render(args);
  mixInto(L, l, at(beatPos), gain);
  mixInto(R, r, at(beatPos), gain);
};

// Bars 1 to 2: monotone robot on eighths, vowel changing every bar.
for (let k = 0; k < 16; k++) {
  put(k / 2, { preset: 'robot', midi: 45, duration: beat * 0.42, vowel: k < 8 ? 'o' : 'e', velocity: k % 4 === 0 ? 1 : 0.7, seed: k + 1 }, 0.55);
}

// Bars 3 to 10: syllable groove on the bass notes of the chords.
const roots = [45, 41, 36, 43, 45, 41, 38, 40];
const groove = ['da', null, 'ba', 'da', null, 'ka', 'ba', null];
for (let bar = 0; bar < 8; bar++) {
  for (let s = 0; s < 8; s++) {
    const syl = groove[s];
    if (!syl) continue;
    put(8 + bar * 4 + s / 2, { preset: syl, midi: roots[bar] + (s === 6 ? 12 : 0), duration: beat * 0.45, velocity: s === 0 ? 1 : 0.75, seed: bar * 8 + s }, 0.5);
  }
  put(8 + bar * 4 + 3.5, { preset: 'sa', midi: 60, duration: beat * 0.4, velocity: 0.5, seed: 100 + bar }, 0.35);
}

// Choir chords, one per bar, from bar 3.
const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62], [57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
chords.forEach((ch, bar) => ch.forEach((m, j) => put(8 + bar * 4, { preset: 'choir', midi: m, duration: beat * 3.8, vowel: bar < 4 ? 'o' : 'a', velocity: 0.7, seed: 10 * bar + j }, 0.32)));

// Sung lead in bars 5 to 8.
const lead = [[64, 1.5], [62, 0.5], [60, 1], [62, 1], [64, 2], [67, 1], [69, 1], [67, 1.5], [64, 0.5], [62, 2], [60, 1], [62, 1], [64, 4]];
let pos = 16;
lead.forEach(([m, len], k) => {
  put(pos, { preset: k % 3 === 2 ? 'eee' : 'aah', midi: m, duration: len * beat * 0.92, velocity: 0.85, bend: k === lead.length - 1 ? -2 : 0, seed: 200 + k }, 0.6);
  pos += len;
});

// Bars 9 to 10: bright noisy line answering.
const answer = [[69, 0.5], [67, 0.5], [64, 1], [62, 0.5], [64, 0.5], [57, 2], [60, 1], [59, 1], [57, 2]];
pos = 32;
answer.forEach(([m, len], k) => {
  put(pos, { preset: 'vocoder', midi: m, duration: len * beat * 0.85, velocity: 0.9, seed: 300 + k, rough: k === answer.length - 1 ? 0.8 : undefined }, 0.5);
  pos += len;
});

let peak = 0;
for (const x of [L, R]) for (const v of x) peak = Math.max(peak, Math.abs(v));
const g = 10 ** (-1 / 20) / peak;
for (const x of [L, R]) for (let i = 0; i < x.length; i++) x[i] *= g;
const tp = Math.max(truePeakDb(L), truePeakDb(R));
writeWav(outPath('speech-chip.wav'), [L, R]);
console.log('out/speech-chip.wav', (L.length / SR).toFixed(2), 's', { ...stats([L, R]), truePeakDb: tp });
