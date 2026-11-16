import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/wavetable-chip.mjs';
import { outPath } from './lib/out.mjs';

// Sixteen bars at 128 BPM in A minor, every part on the wave channel: a soft bass, organ chords
// on the offbeat, a bit-harp arpeggio, a vocal lead, the PWM sweep as a pad, a saw counter line
// and bell accents.
const BPM = 128, beat = 60 / BPM, bar = 4 * beat;
const notes = [];
const add = (b, preset, midi, len, gain, extra = {}) =>
  notes.push({ t: b * beat, gain, opts: { preset, midi, velocity: 1, duration: len * beat, ...extra } });

const prog = [[45, [57, 60, 64]], [41, [57, 60, 65]], [43, [55, 59, 62]], [40, [56, 59, 64]]];
for (let k = 0; k < 16; k++) {
  const [r, ch] = prog[k % 4], b0 = k * 4;
  for (const [s, d, o] of [[0, 0.7, 0], [0.75, 0.2, 0], [1.5, 0.45, 12], [2, 0.7, 0], [3, 0.45, 7], [3.5, 0.45, 12]]) add(b0 + s, 'soft-bass', r + o, d, 0.5);
  if (k >= 2) for (const s of [0.5, 1.5, 2.5, 3.5]) ch.forEach((m) => add(b0 + s, 'organ', m, 0.3, 0.16, { volumeShift: 1 }));
  if (k >= 4 && k < 12) {
    const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24];
    for (let s = 0; s < 8; s++) add(b0 + s * 0.5, 'bit-harp', arp[s % 4], 0.45, 0.3);
  }
  if (k >= 8) ch.forEach((m) => add(b0, 'pwm-sweep', m + 12, 3.9, 0.12, { morph: 0.3 }));
}
const lead = [
  [0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1], [3, 71, 1], [4, 72, 2], [6, 69, 2],
  [8, 71, 1], [9, 72, 0.5], [9.5, 74, 0.5], [10, 76, 2], [12, 74, 1], [13, 71, 1], [14, 68, 2],
];
for (const off of [16, 32, 48]) for (const [b, m, d] of lead) add(off + b, off === 32 ? 'saw' : 'vocal', m, d * 0.95, off === 32 ? 0.3 : 0.4, { morph: 0.6 });
for (const b of [15, 31, 47, 63]) add(b, 'bell', 88, 2, 0.25);
add(60, 'square-ish', 81, 3.5, 0.3);

const t0 = performance.now();
const total = 16 * bar + 2;
const [mono] = buffer(total);
notes.forEach((n, i) => mixInto(mono, render({ ...n.opts, seed: i + 1 }), Math.round(n.t * SR), n.gain));
normalizePeak([mono], -1);
writeWav(outPath('wavetable-chip.wav'), [mono]);
console.log(`${notes.length} notes, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('wavetable-chip.wav', stats([mono]));
