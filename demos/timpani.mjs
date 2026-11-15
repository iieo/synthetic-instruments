import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/timpani.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const beat = 60 / 96;
const [L, R] = buffer(18.6, 2);
// Four kettles from left to right as seen from the audience: lowest on the right.
const pans = { 38: 0.35, 45: 0.1, 50: -0.1, 55: -0.3 };
let seed = 1;
function hit(t, midi, velocity, preset = 'normal', duration = 4) {
  const y = render({ midi, velocity, preset, duration, seed: seed++ });
  const p = pans[midi] ?? 0, th = ((p + 1) * Math.PI) / 4;
  const s = Math.round(t * SR);
  mixInto(L, y, s, Math.cos(th)); mixInto(R, y, s, Math.sin(th));
}

// 1. Tonic and dominant, soft mallets, growing louder.
let t = 0.1;
[[0, 38, 0.3], [1, 45, 0.35], [2, 38, 0.45], [3, 45, 0.5], [4, 38, 0.6], [4.5, 45, 0.5], [5, 38, 0.75]].forEach(([b, m, v]) => hit(t + b * beat, m, v, 'soft', b === 5 ? 3 : beat * 1.2));
t += 7 * beat;

// 2. Normal felt: a rhythmic figure over four kettles, damped by hand on the short notes.
const fig = [[0, 50, 0.7, 0.3], [0.5, 50, 0.5, 0.3], [0.75, 50, 0.55, 0.3], [1, 45, 0.8, 0.6], [2, 55, 0.7, 0.3], [2.5, 50, 0.6, 0.3], [3, 45, 0.7, 0.3], [3.5, 38, 0.9, 1.4]];
for (const [b, m, v, d] of fig) hit(t + b * beat, m, v, 'normal', d);
t += 5 * beat;

// 3. Hard mallets, staccato.
[[0, 45], [0.25, 45], [0.5, 50], [1, 45], [1.5, 38], [1.75, 38], [2, 45]].forEach(([b, m], i) => hit(t + b * beat, m, 0.7 + 0.04 * i, 'hard', 0.25));
t += 3 * beat;

// 4. Rolls: quiet, then louder, then a final stroke that rings out.
hit(t, 45, 0.25, 'roll', 2.2);
hit(t + 2.4, 38, 0.55, 'roll', 1.6);
hit(t + 4.1, 38, 0.85, 'roll', 1.2);
hit(t + 5.4, 38, 1, 'normal', 4);

const ch = normalizePeak([L, R], -3);
writeWav(outPath('timpani.wav'), ch);
const s = stats(ch);
console.log(`timpani.wav: ${(L.length / SR).toFixed(1)} s, peak ${s.peakDb.toFixed(2)} dBFS, max jump ${s.maxJump.toFixed(4)}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
