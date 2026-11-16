import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render, renderRhythm } from '../instruments/toy-keyboard.mjs';
import { outPath } from './lib/out.mjs';

// Sixteen bars on a toy keyboard at 112 BPM in F major: the rock rhythm box, an organ bass, a
// melody that changes voice every four bars (piano, flute, trumpet, violin), bell answers, a
// synth-drum fill and a fantasy chord to end.
const BPM = 112, beat = 60 / BPM, bar = 4 * beat;
const notes = [];
const add = (b, preset, midi, len, gain, extra = {}) =>
  notes.push({ t: b * beat, gain, opts: { preset, midi, velocity: 1, duration: len * beat, ...extra } });

const roots = [41, 38, 46, 48];
for (let k = 0; k < 16; k++) {
  const r = roots[k % 4], b0 = k * 4;
  for (const [s, d, o] of [[0, 0.9, 0], [1, 0.45, 12], [2, 0.9, 7], [3, 0.45, 12]]) add(b0 + s, 'organ', r + o, d, 0.32);
}
// Phrase in scale degrees of F major over four bars, repeated with new voices.
const phrase = [
  [0, 72, 1], [1, 74, 0.5], [1.5, 76, 0.5], [2, 77, 1.5], [3.5, 76, 0.5],
  [4, 74, 1], [5, 70, 1], [6, 74, 1.5], [7.5, 72, 0.5],
  [8, 70, 1], [9, 72, 0.5], [9.5, 74, 0.5], [10, 77, 1], [11, 79, 1],
  [12, 81, 1.5], [13.5, 79, 0.5], [14, 77, 2],
];
const voices = [['piano', 0.55, {}], ['flute', 0.5, {}], ['trumpet', 0.5, { vibrato: 'on' }], ['violin', 0.5, { sustain: 'on' }]];
voices.forEach(([preset, gain, extra], v) => {
  for (const [b, m, d] of phrase) add(v * 16 + b, preset, m, d * 0.95, gain, extra);
});
for (const b of [6, 14, 22, 30, 38, 46, 54]) add(b + 1.5, 'bells', 84, 1.5, 0.3, { sustain: 'on' });
for (const [b, m] of [[31, 60], [31.5, 57], [31.75, 55], [47, 62], [47.5, 58], [47.75, 55]]) add(b, 'synth-drum', m, 0.3, 0.45);
for (const m of [65, 69, 72, 77]) add(64, 'fantasy', m, 3, 0.3, { sustain: 'on' });

const t0 = performance.now();
const total = 16 * bar + 3;
const [mono] = buffer(total);
mixInto(mono, renderRhythm({ pattern: 'rock', bpm: BPM, bars: 16, seed: 3 }), 0, 0.93);
notes.forEach((n, i) => mixInto(mono, render({ ...n.opts, seed: i + 1 }), Math.round(n.t * SR), n.gain));
normalizePeak([mono], -1);
writeWav(outPath('toy-keyboard.wav'), [mono]);
console.log(`${notes.length} notes, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('toy-keyboard.wav', stats([mono]));
