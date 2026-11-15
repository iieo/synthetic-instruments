import { SR, buffer, mixInto, stats, normalizePeak, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/piano.mjs';
import { outPath } from './lib/out.mjs';

const BEAT = 60 / 76;
// [beat, midi, velocity, held beats]
const score = [
  // Quiet opening: open fifth in the bass, broken chord rising into the middle register.
  [0, 36, 0.55, 7.5], [0, 43, 0.5, 7.5],
  [1, 60, 0.5, 0.9], [1.5, 64, 0.48, 0.9], [2, 67, 0.52, 0.9], [2.5, 71, 0.55, 1.4],
  [4, 72, 0.6, 1.8], [6, 74, 0.55, 0.9], [7, 71, 0.5, 0.9],
  // Loud entry: low A octave and a full A minor chord, held.
  [8, 33, 0.9, 5.5], [8, 45, 0.85, 5.5], [8, 57, 0.75, 5.5], [8, 60, 0.75, 5.5], [8, 64, 0.78, 5.5], [8, 69, 0.85, 5.5],
  [10, 76, 0.8, 1.6], [12, 74, 0.7, 1.6],
  // Staccato figure up high.
  [14, 84, 0.7, 0.12], [14.5, 88, 0.62, 0.12], [15, 91, 0.66, 0.12], [15.5, 96, 0.72, 0.12],
  [16, 93, 0.58, 0.12], [16.25, 91, 0.5, 0.12], [16.5, 88, 0.55, 0.12], [17, 84, 0.6, 0.6],
  // Deep bass staccato answer.
  [18, 28, 0.85, 0.25], [18.5, 31, 0.75, 0.25], [19, 33, 0.8, 0.25],
  // Final chord: soft, spread wide, long ring with a high bell on top.
  [20, 24, 0.6, 10], [20, 36, 0.55, 10], [20.5, 55, 0.48, 9.5], [20.5, 60, 0.48, 9.5], [21, 64, 0.5, 9], [21, 67, 0.5, 9],
  [22, 72, 0.55, 8], [23, 79, 0.6, 7], [24, 100, 0.55, 6],
];

// Small room: 4-line feedback delay network with damping, our own design.
function room(x, wet = 0.16) {
  const delays = [1597, 2039, 2617, 3191].map((d) => Math.round(d * SR / 48000));
  const lines = delays.map((d) => new Float64Array(d)), idx = [0, 0, 0, 0], lp = [0, 0, 0, 0];
  const fb = 0.78, damp = 0.35;
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const o = lines.map((l, k) => l[idx[k]]);
    const sum = (o[0] + o[1] + o[2] + o[3]) * 0.5;
    for (let k = 0; k < 4; k++) {
      lp[k] += (1 - damp) * ((o[k] - sum) * fb - lp[k]);
      lines[k][idx[k]] = x[i] + lp[k];
      idx[k] = (idx[k] + 1) % delays[k];
    }
    y[i] = x[i] + wet * (o[0] - o[1] + o[2] - o[3]) * 0.5;
  }
  return y;
}

const t0 = Date.now();
const [mix] = buffer(26.5);
score.forEach(([beat, midi, velocity, beats], i) => {
  const note = render({ midi, velocity, duration: beats * BEAT, seed: i + 1 });
  mixInto(mix, note, Math.round((0.05 + beat * BEAT) * SR));
});
let out = room(mix);
const fade = Math.round(1.5 * SR);
for (let k = 0; k < fade; k++) out[out.length - fade + k] *= 0.5 + 0.5 * Math.cos(Math.PI * (k + 1) / fade);
normalizePeak([out], -3);
console.log('render ms', Date.now() - t0, stats([out]));
writeWav(outPath('piano.wav'), [out]);
