import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/theremin.mjs';
import { outPath } from './lib/out.mjs';

// One legato phrase in D minor on the classic voice, an answer on the soft voice and a sci-fi
// swoop at the end. Each phrase is one continuous tone, the pitch hand glides between the notes.
const beat = 60 / 66;
const phrase = (notes) => notes.map(([b, m]) => [b * beat, m]);

const parts = [
  { t: 0.2, opts: { preset: 'classic', velocity: 0.85, duration: 15.6 * beat, from: 62,
    line: phrase([[0, 69], [2, 74], [3, 72], [4, 70], [5, 69], [6, 65], [8, 67], [9, 69], [10, 70], [11, 74], [12, 76], [14.5, 73], [15, 74]]) } },
  { t: 0.2 + 16.5 * beat, opts: { preset: 'soft', velocity: 0.75, duration: 11.5 * beat,
    line: phrase([[0, 62], [1.5, 65], [2, 69], [3, 67], [4, 65], [5, 64], [6, 62], [8, 61], [9, 64], [10, 62]]) } },
  { t: 0.2 + 29 * beat, opts: { preset: 'scifi', velocity: 0.9, duration: 7.5, glide: 0.45, from: 50,
    line: [[0, 74], [1.3, 86], [2.4, 62], [3.6, 81], [4.8, 57], [6, 69]] } },
];

const t0 = performance.now();
const rendered = parts.map((p, i) => ({ at: Math.round(p.t * SR), x: render({ ...p.opts, seed: i + 1 }) }));
const total = Math.max(...rendered.map((r) => r.at + r.x.length)) / SR + 0.3;
const [mono] = buffer(total);
for (const r of rendered) mixInto(mono, r.x, r.at);
normalizePeak([mono], -1);
writeWav(outPath('theremin.wav'), [mono]);
console.log(`${parts.length} phrases, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('theremin.wav', stats([mono]));
