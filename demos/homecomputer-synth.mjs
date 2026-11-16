import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/homecomputer-synth.mjs';
import { outPath } from './lib/out.mjs';

// Sixteen bars in D minor at 124 BPM: pad intro, filtered bass, frame arpeggios, a PWM lead with
// a sync-lead answer, ring-modulated bells, combined-waveform stabs and the two drum presets.
const BPM = 124;
const beat = 60 / BPM;
const notes = [];
const add = (b, preset, midi, velocity, len, gain = 1, extra = {}) =>
  notes.push({ t: b * beat, gain, opts: { preset, midi, velocity, duration: len * beat, ...extra } });

const prog = [
  { root: 38, chord: 'minor', pad: [62, 65, 69] },
  { root: 34, chord: 'major', pad: [62, 65, 70] },
  { root: 36, chord: 'major', pad: [60, 64, 67] },
  { root: 33, chord: 'sus4', pad: [61, 64, 69] },
];
for (let bar = 0; bar < 16; bar++) {
  const c = prog[bar % 4], b0 = bar * 4;
  if (bar < 4 || bar >= 12) c.pad.forEach((m) => add(b0, 'pad', m, 0.7, 3.8, 0.38));
  if (bar >= 2) {
    const pat = [0, 12, 0, 0, 12, 0, 10, 12];
    pat.forEach((s, i) => add(b0 + i * 0.5, 'bass', c.root + s, i % 2 ? 0.7 : 1, 0.4, 0.85, { filter: 0.1 + 0.02 * (bar % 4) }));
  }
  if (bar >= 4) {
    for (const s of [0, 2]) add(b0 + s, 'drum-kick', 60, 1, 0.2, 0.9);
    for (const s of [1, 3]) add(b0 + s, 'drum-snare', 62, 0.9, 0.2, 0.6);
    if (bar % 2) add(b0 + 3.5, 'drum-snare', 67, 0.5, 0.2, 0.35);
  }
  if (bar >= 4 && bar < 8) {
    for (const s of [0, 1.5, 3]) add(b0 + s, 'arp', c.root + 24, 0.8, 1.2, 0.45, { chord: c.chord });
  }
  if (bar >= 8 && bar < 12) {
    for (const s of [0.5, 2.5]) add(b0 + s, 'combo', c.root + 24, 0.75, 0.35, 0.3);
  }
}
const lead = [
  [32, 69, 1.5], [33.5, 72, 0.5], [34, 74, 1], [35, 72, 1], [36, 70, 2], [38, 69, 1], [39, 67, 1],
  [40, 69, 3], [43, 64, 1], [44, 62, 1.5], [45.5, 64, 0.5], [46, 69, 2],
];
for (const [b, m, d] of lead) add(b, 'lead', m, 0.9, d * 0.95, 0.55);
const answer = [[48, 74, 1], [49, 77, 1], [50, 76, 2], [52, 74, 1.5], [53.5, 72, 0.5], [54, 70, 2], [56, 69, 4]];
for (const [b, m, d] of answer) add(b, 'sync-lead', m, 0.9, d * 0.95, 0.5);
for (const b of [15, 31, 47, 63]) add(b, 'ring-bell', 86, 0.8, 1, 0.35);
add(60, 'ring-bell', 74, 0.7, 4, 0.35);

const t0 = performance.now();
const total = 64 * beat + 3;
const [mono] = buffer(total);
notes.forEach((n, i) => mixInto(mono, render({ ...n.opts, seed: i + 1 }), Math.round(n.t * SR), n.gain));
normalizePeak([mono], -1);
writeWav(outPath('homecomputer-synth.wav'), [mono]);
console.log(`${notes.length} notes, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('homecomputer-synth.wav', stats([mono]));
