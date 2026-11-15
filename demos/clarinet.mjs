import { SR, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/clarinet.mjs';
import { renderScore } from '../instruments/winds/score.mjs';
import { outPath } from './lib/out.mjs';

// [midi, beats, velocity, articulation]; sounding pitch of a B-flat clarinet
const L = 'legato', S = 'stacc';
const notes = [
  // chalumeau: dark, soft melody
  [57, 1.5, 0.35], [60, 0.5, 0.4, L], [64, 1, 0.45, L], [62, 1, 0.45, L], [60, 1, 0.4], [59, 1, 0.4, L], [57, 2, 0.35, L],
  [52, 2.5, 0.5], [null, 0.5],
  // clarion: the same idea a twelfth higher, louder
  [69, 1, 0.55], [72, 1, 0.6, L], [76, 1.5, 0.75, L], [74, 0.5, 0.7, L], [72, 1, 0.65], [71, 1, 0.6, L], [69, 2, 0.6, L],
  [null, 0.5],
  // tongued arpeggios across the break
  [64, 0.25, 0.65, S], [69, 0.25, 0.65, S], [72, 0.25, 0.7, S], [76, 0.25, 0.7, S], [81, 0.25, 0.75, S], [76, 0.25, 0.7, S], [72, 0.25, 0.7, S], [69, 0.25, 0.65, S],
  [65, 0.25, 0.65, S], [69, 0.25, 0.7, S], [72, 0.25, 0.7, S], [77, 0.25, 0.75, S], [81, 0.5, 0.8], [84, 0.5, 0.85], [88, 2.5, 0.9],
  // back down to the bottom of the instrument
  [84, 0.5, 0.75, L], [81, 1, 0.65, L], [76, 1, 0.55], [72, 1, 0.5, L], [64, 1, 0.45, L], [57, 1.5, 0.4],
  [50, 3, 0.35],
];

const t0 = performance.now();
const y = renderScore(render, notes, { bpm: 76, seed: 5, room: { rt60: 1.6, wet: 0.18 } });
normalizePeak([y], -3);
writeWav(outPath('clarinet.wav'), [y]);
console.log('out/clarinet.wav', (y.length / SR).toFixed(1) + ' s', stats([y]), Math.round(performance.now() - t0) + ' ms');
