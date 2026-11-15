import { SR, buffer, mixInto, normalizePeak, stats, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/handpan.mjs';
import { outPath } from './lib/out.mjs';

// A handpan in D minor: ding D3 in the middle, nine fields around it.
const DING = 50;
const S = [57, 58, 60, 62, 64, 65, 67, 69, 72];
const rand = rng(2718);
const hits = [];
let seed = 1;
const hit = (t, midi, vel, ring, preset = 'soft', strike = 'center') =>
  hits.push({ t: Math.max(0, t + 0.007 * (2 * rand() - 1)), midi, vel: Math.min(1, vel * (0.94 + 0.12 * rand())), ring, preset, strike, seed: seed++ });

const beat = 60 / 92;
const T = (bar, b) => (bar * 4 + b) * beat;

// Groove: ding on one, muted ghost taps on the off-beats, a tone field answering.
function groove(bar, answer, vel = 0.7) {
  hit(T(bar, 0), DING, vel, 3.2, 'ding');
  hit(T(bar, 0.75), S[0], 0.3 * vel, 0.1, 'soft', 'muted');
  hit(T(bar, 1.5), answer[0], 0.6 * vel, 2.2);
  hit(T(bar, 2), DING, 0.55 * vel, 2.4, 'ding', 'edge');
  hit(T(bar, 2.75), S[3], 0.28 * vel, 0.1, 'soft', 'muted');
  hit(T(bar, 3), answer[1], 0.65 * vel, 2.2);
  hit(T(bar, 3.5), answer[2], 0.5 * vel, 2.0);
}

groove(0, [S[3], S[4], S[5]], 0.55);
groove(1, [S[5], S[4], S[2]], 0.6);
groove(2, [S[3], S[6], S[5]], 0.7);
groove(3, [S[4], S[2], S[1]], 0.75);

// Melody over the groove, brighter edge strokes.
const mel = [[0, 7, 1], [0.5, 6, 0.5], [1, 5, 0.5], [1.5, 6, 1], [2.5, 4, 0.5], [3, 5, 1],
  [4, 8, 1], [4.75, 7, 0.25], [5, 6, 0.5], [5.5, 5, 0.5], [6, 4, 1], [7, 3, 1]];
for (let rep = 0; rep < 2; rep++) {
  for (let i = 0; i < 4; i++) hit(T(4 + rep * 2 + (i >> 1), (i & 1) * 2), DING, 0.5 + 0.1 * rep, 3, 'ding');
  for (const [b, k, len] of mel) hit(T(4 + rep * 2, b), S[k], 0.62 + 0.25 * rep, len * beat + 1.6, rep ? 'bright' : 'soft', rep ? 'edge' : 'center');
  for (let b = 0.5; b < 8; b += 1) hit(T(4 + rep * 2, b), S[(b * 2) % 3], 0.22, 0.1, 'soft', 'muted');
}

// Ending: a slow arpeggio down to the ding, left to ring.
const tEnd = T(8, 0);
[S[8], S[6], S[4], S[2], S[0]].forEach((m, i) => hit(tEnd + i * 0.42, m, 0.5 - 0.05 * i, 3.4));
hit(tEnd + 2.3, DING, 0.6, 5.5, 'ding');
hit(tEnd + 2.31, S[3], 0.32, 5, 'soft', 'edge');

const end = Math.max(...hits.map((h) => h.t + h.ring + 0.25)) + 0.2;
const [out] = buffer(end);
for (const h of hits) {
  const x = render({ midi: h.midi, velocity: h.vel, duration: h.ring, preset: h.preset, strike: h.strike, seed: h.seed });
  mixInto(out, x, Math.round(h.t * SR));
}

const fade = Math.round(0.05 * SR);
for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
normalizePeak([out], -3);
writeWav(outPath('handpan.wav'), [out]);
console.log({ seconds: +(out.length / SR).toFixed(2), strokes: hits.length, ...stats([out]) });
