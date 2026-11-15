import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/bass.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const r = rng(808);
let [out] = buffer(30);
let seed = 1;

function note(time, midi, { velocity = 0.75, duration = 0.5, style = 'electric', gain = 1 } = {}) {
  const y = render({ midi, velocity: Math.min(1, velocity * (0.9 + 0.2 * r())), duration, style, seed: seed++ });
  mixInto(out, y, Math.round((time + (r() - 0.5) * 0.014) * SR), gain);
}

// Walking line over Em7 | A7 | Dmaj7 | B7, laid back at 92 bpm. Second chorus climbs high on the upright.
const beat = 60 / 92;
const chorus1 = [
  [40, 43, 47, 50], [33, 37, 40, 43], [38, 42, 45, 49], [35, 39, 42, 45],
];
const chorus2 = [
  [52, 50, 47, 43], [45, 47, 49, 52], [54, 57, 61, 62], [63, 59, 54, 51],
];
let t = 0.1;
for (const [line, style, gain] of [[chorus1, 'electric', 1], [chorus2, 'upright', 1.1]]) {
  for (const bar of line) {
    for (let k = 0; k < 4; k++) {
      const legato = k === 3 ? 0.55 : 0.9;
      note(t + k * beat, bar[k], { velocity: k === 0 ? 0.85 : 0.7, duration: beat * legato, style, gain });
      // A ghosted approach note before the next bar now and then, lofi style.
      if (k === 3 && r() < 0.6) note(t + 3.66 * beat, bar[k] + (r() < 0.5 ? 1 : -1), { velocity: 0.45, duration: beat * 0.25, style, gain: gain * 0.7 });
    }
    t += 4 * beat;
  }
}
// Final low E, left ringing on the electric bass.
note(t, 28, { velocity: 0.9, duration: 3.2 });
t += 3.5;

out = out.subarray(0, Math.min(out.length, Math.round(t * SR)));
// Notes may still ring at the cut: fade the last 50 ms to exactly zero.
for (let i = 0, nf = Math.round(0.05 * SR); i < nf; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / nf);
normalizePeak([out], -3);
writeWav(outPath('bass.wav'), [out]);
console.log('bass.wav', (out.length / SR).toFixed(1), 's', stats([out]), `${((performance.now() - t0) / 1000).toFixed(1)} s render`);
