import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/fm-chip.mjs';
import { outPath } from './lib/out.mjs';

// Sixteen bars in G minor at 112 BPM, in the manner of a soundtrack from an early-90s PC game:
// organ and string chords, an FM bass, a muted guitar riff, a brass theme, piano answers, bells
// and the three rhythm voices.
const BPM = 112;
const beat = 60 / BPM;
const notes = [];
const add = (b, preset, midi, velocity, len, gain = 1, extra = {}) =>
  notes.push({ t: b * beat, gain, opts: { preset, midi, velocity, duration: len * beat, ...extra } });

const prog = [
  { root: 43, chord: [55, 58, 62] },
  { root: 39, chord: [55, 58, 63] },
  { root: 41, chord: [53, 57, 60] },
  { root: 38, chord: [54, 57, 62] },
];
for (let bar = 0; bar < 16; bar++) {
  const c = prog[bar % 4], b0 = bar * 4;
  if (bar < 8) c.chord.forEach((m) => add(b0, 'organ', m, 0.6, 3.9, 0.3));
  else c.chord.forEach((m) => add(b0, 'strings', m + 12, 0.7, 3.9, 0.3));
  if (bar >= 2) {
    for (const [s, d, o] of [[0, 0.9, 0], [1, 0.4, 0], [1.5, 0.4, 12], [2.5, 0.4, 0], [3, 0.9, 7]]) {
      add(b0 + s, 'bass', c.root + o, s === 0 ? 1 : 0.75, d, 0.7);
    }
  }
  if (bar >= 4) {
    for (const s of [0, 1.5, 2.5]) add(b0 + s, 'drum-kick', 60, 1, 0.3, 0.75);
    for (const s of [1, 3]) add(b0 + s, 'drum-snare', 62, 0.9, 0.3, 0.45);
    for (let s = 0; s < 8; s++) add(b0 + s * 0.5, 'drum-hat', 60 + (s % 2) * 2, s % 2 ? 0.55 : 0.8, 0.1, 0.25);
  }
  if (bar >= 4 && bar < 12) {
    const riff = [c.chord[0], c.chord[1], c.chord[2], c.chord[1]];
    for (let s = 0; s < 8; s++) add(b0 + s * 0.5, 'guitar', riff[s % 4] - 12 + (s >= 4 ? 12 : 0), 0.7, 0.4, 0.3);
  }
}
const theme = [
  [32, 74, 1.5], [33.5, 72, 0.5], [34, 70, 1], [35, 69, 1], [36, 67, 3], [39, 70, 1],
  [40, 72, 1.5], [41.5, 70, 0.5], [42, 69, 2], [44, 66, 1], [45, 69, 1], [46, 74, 2],
];
for (const [b, m, d] of theme) add(b, 'brass', m, 0.85, d * 0.95, 0.5);
const answer = [[48, 79, 0.5], [48.5, 77, 0.5], [49, 74, 1], [52, 75, 0.5], [52.5, 74, 0.5], [53, 70, 1],
  [56, 77, 0.5], [56.5, 76, 0.5], [57, 72, 1], [60, 74, 0.5], [60.5, 72, 0.5], [61, 69, 1], [62, 66, 2]];
for (const [b, m, d] of answer) add(b, 'piano', m, 0.8, d, 0.5);
for (const b of [14, 30, 46]) add(b, 'bell', 86, 0.7, 1, 0.3);
add(64, 'bell', 79, 0.7, 2, 0.35);
add(64, 'organ', 55, 0.6, 2, 0.3);
add(64, 'organ', 59, 0.6, 2, 0.3);
add(64, 'organ', 62, 0.6, 2, 0.3);
add(64, 'bass', 31, 1, 2, 0.7);

const t0 = performance.now();
// The file ends where the last release has died away, so it closes exactly at zero.
const rendered = notes.map((n, i) => render({ ...n.opts, seed: i + 1 }));
const total = Math.max(...notes.map((n, i) => Math.round(n.t * SR) + rendered[i].length)) / SR;
const [mono] = buffer(total);
notes.forEach((n, i) => mixInto(mono, rendered[i], Math.round(n.t * SR), n.gain));
normalizePeak([mono], -1);
writeWav(outPath('fm-chip.wav'), [mono]);
console.log(`${notes.length} notes, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('fm-chip.wav', stats([mono]));
