import { SR, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/flute.mjs';
import { renderScore } from '../instruments/winds/score.mjs';
import { outPath } from './lib/out.mjs';

// [midi, beats, velocity, articulation]
const L = 'legato', S = 'tongue';
const notes = [
  // lyrical opening in the low register, soft
  [62, 1.5, 0.35], [64, 0.5, 0.4, L], [66, 1, 0.45, L], [69, 1, 0.5], [67, 1.5, 0.5], [66, 0.5, 0.45, L], [64, 2, 0.4, L],
  [null, 0.5],
  // the line rises and opens up into the second octave
  [69, 1, 0.55], [74, 1, 0.65, L], [73, 0.5, 0.65, L], [71, 0.5, 0.6, L], [69, 1, 0.6], [78, 1.5, 0.8], [76, 0.5, 0.75, L], [74, 2, 0.7, L],
  [null, 0.5],
  // quick tongued figures
  [81, 0.25, 0.75, S], [76, 0.25, 0.7, S], [78, 0.25, 0.7, S], [79, 0.25, 0.7, S], [81, 0.25, 0.75, S], [83, 0.25, 0.75, S], [81, 0.25, 0.7, S], [78, 0.25, 0.7, S],
  [74, 0.25, 0.65, S], [76, 0.25, 0.7, S], [78, 0.25, 0.75, S], [81, 0.25, 0.8, S], [86, 0.5, 0.85], [88, 0.5, 0.85], [90, 1, 0.9],
  // high and loud, then down
  [93, 2.5, 0.95], [90, 0.5, 0.8, L], [86, 1, 0.7, L], [81, 1, 0.6], [78, 1, 0.5, L], [74, 1.5, 0.45, L],
  // close in the low register, very soft
  [62, 4, 0.3],
];

const t0 = performance.now();
const y = renderScore(render, notes, { bpm: 76, seed: 3, room: { rt60: 1.8, wet: 0.2 } });
normalizePeak([y], -3);
writeWav(outPath('flute.wav'), [y]);
console.log('out/flute.wav', (y.length / SR).toFixed(1) + ' s', stats([y]), Math.round(performance.now() - t0) + ' ms');
