import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/fm-synth.mjs';
import { outPath } from './lib/out.mjs';

// Eight bars in E minor: FM e-piano chords, a bass line, a marimba pattern, bell answers and a
// brass swell at the end. Every preset of the instrument appears once.
const BPM = 100;
const beat = 60 / BPM, bar = 4 * beat;
const notes = [];
const add = (b, preset, midi, velocity, len, gain = 1, extra = {}) =>
  notes.push({ t: b * beat, gain, opts: { preset, midi, velocity, duration: len * beat, ...extra } });

const chords = [[52, 55, 59, 62], [48, 52, 55, 59], [50, 54, 57, 62], [47, 50, 54, 57]];
const roots = [40, 36, 38, 35];
for (let k = 0; k < 8; k++) {
  const c = chords[k % 4], r = roots[k % 4], b0 = k * 4;
  c.forEach((m, i) => add(b0 + 0.01 * i, 'epiano', m + 12, 0.55, 1.6, 0.6));
  c.forEach((m, i) => add(b0 + 2.5 + 0.01 * i, 'epiano', m + 12, 0.45, 1.3, 0.5));
  if (k >= 2) {
    for (const [s, d, v] of [[0, 0.75, 0.9], [1.5, 0.4, 0.7], [2, 0.75, 0.85], [3.5, 0.4, 0.7]]) add(b0 + s, 'bass', r + (s === 3.5 ? 7 : 0), v, d, 0.9);
  }
  if (k >= 4) {
    const arp = [c[0] + 24, c[2] + 12, c[1] + 24, c[3] + 12];
    for (let s = 0; s < 8; s++) add(b0 + s * 0.5, 'marimba', arp[s % 4], s % 2 ? 0.5 : 0.7, 0.4, 0.5);
  }
}
for (const [b, m, v] of [[6, 79, 0.7], [7, 83, 0.6], [14, 81, 0.7], [15, 78, 0.6], [22, 86, 0.7], [23, 83, 0.6], [24, 88, 0.75]]) add(b, 'bell', m, v, 1.5, 0.45);
for (const m of [64, 67, 71]) add(28, 'brass', m, 0.85, 3.6, 0.45);

const t0 = performance.now();
const total = 8 * bar + 2.5;
const [mono] = buffer(total);
notes.forEach((n, i) => mixInto(mono, render({ ...n.opts, seed: i + 1 }), Math.round(n.t * SR), n.gain));
normalizePeak([mono], -1);
writeWav(outPath('fm-synth.wav'), [mono]);
console.log(`${notes.length} notes, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('fm-synth.wav', stats([mono]));
