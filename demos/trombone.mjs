import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/trombone.mjs';
import { room } from '../instruments/trumpet/room.mjs';
import { outPath } from './lib/out.mjs';

// A slow blues-flavoured line in B-flat at 76 bpm that shows the slide: smears into notes, glissandi
// inside one breath, a straight-mute middle part and a lip rip to the top.
const BPM = 76, beat = 60 / BPM, START = 0.3;
const sec = (b) => b * beat;

// [beat, midi, beats, velocity, options]; path entries are [beat offset inside the note, midi].
const line = [
  // Phrase 1: open bell, smear up into the first note, then a slide down inside one breath.
  [0, 58, 2.5, [0.45, 0.65], { from: 53, glide: 0.5 }],
  [2.5, 62, 0.5, 0.55, { tongue: 0.4 }], [3, 60, 0.5, 0.55, { tongue: 0.4 }],
  [3.5, 58, 0.5, 0.55, { tongue: 0.4 }],
  [4, 65, 3, 0.62, { tongue: 0.5, glide: 0.7, path: [[1.6, 60]] }],
  [7.2, 56, 0.4, 0.5, { tongue: 0.5 }], [7.6, 58, 2.2, [0.55, 0.4], { from: 57, glide: 0.18 }],
  // Phrase 2: straight mute, tongued figure, then a gliss up and back down.
  [10.5, 58, 0.4, 0.6, { preset: 'mute' }], [11, 61, 0.4, 0.62, { preset: 'mute' }],
  [11.5, 63, 0.4, 0.64, { preset: 'mute' }], [12, 65, 0.9, 0.66, { preset: 'mute' }],
  [13, 63, 2.6, 0.66, { preset: 'mute', glide: 0.35, path: [[0.8, 68], [1.8, 63]] }],
  [16, 61, 0.5, 0.6, { preset: 'mute', from: 60, glide: 0.12 }], [16.5, 58, 1.8, [0.6, 0.45], { preset: 'mute' }],
  // Phrase 3: open again, loud. A rip up the harmonic series, a fall, and a long tailgate smear.
  [19, 46, 2.2, [0.75, 1], { glide: 0.45, path: [[0.6, 70]] }],
  [21.5, 68, 0.5, 0.85, { tongue: 0.8 }], [22, 65, 0.5, 0.85, { tongue: 0.8 }],
  [22.5, 63, 1.5, 0.9, { tongue: 0.8, glide: 0.45, path: [[1, 58]] }],
  [24.5, 40, 3.8, [0.85, 0.2], { glide: 1.2, path: [[0.4, 46]], vibrato: 0.6 }],
];

const total = START + sec(29.5);
const [dry] = buffer(total);
const t = performance.now();
line.forEach(([b, midi, len, velocity, extra = {}], i) => {
  const { path, ...rest } = extra;
  const opts = { midi, velocity, duration: sec(len) - 0.04, seed: 21 + i, ...rest };
  if (path) opts.path = path.map(([pb, m]) => [sec(pb), m]);
  mixInto(dry, render(opts), Math.round((START + sec(b)) * SR));
});
const [L, R] = room(dry, { wet: 0.3, rt60: 1.7 });
console.log(`rendered ${line.length} notes in ${((performance.now() - t) / 1000).toFixed(1)} s`);
normalizePeak([L, R], -3);
console.log(stats([L, R]));
writeWav(outPath('trombone.wav'), [L, R]);
