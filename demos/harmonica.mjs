import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/harmonica.mjs';
import { render as renderAccordion } from '../instruments/accordion.mjs';
import { outPath } from './lib/out.mjs';

// Ten-hole diatonic in C played in second position (blues in G), shuffle feel.
const BPM = 92;
const beat = 60 / BPM;
const SWING = 0.66;
const sw = (b) => {
  const whole = Math.floor(b), frac = b - whole;
  return (whole + (Math.abs(frac - 0.5) < 1e-9 ? SWING : frac)) * beat;
};

const events = [];
const play = (b, midi, len, opts = {}) => events.push({ t: sw(b), midi, dur: len * beat, ...opts });

const D123 = [62, 67, 71];      // draw 1-2-3: G major with D in the bass
const B123 = [60, 64, 67];      // blow 1-2-3: C major
const D234 = [67, 71, 74];      // draw 2-3-4: G major
const D45 = [74, 77];           // draw 4-5

// Bars 1-2: the train. Short breathy chugs, draw on the beat, blow on the off-beat.
for (let bar = 0; bar < 2; bar++) {
  for (let k = 0; k < 4; k++) {
    const b = bar * 4 + k;
    const accent = k % 2 === 0 ? 0.85 : 0.65;
    play(b, D123, 0.32, { velocity: accent, attack: 0.012, breathiness: 0.7, wah: 0.35 });
    play(b + 0.5, B123, 0.28, { velocity: accent * 0.8, attack: 0.012, breathiness: 0.7, wah: 0.5 });
  }
}
// Train whistle: draw 4+5 bent down and released, hands opening.
play(7.5, D45, 1.9, { velocity: 0.9, bend: [[0, -0.8], [0.25, 0], [0.9, 0], [1.2, -0.6]],
  wah: [[0, 1], [0.3, 0], [0.9, 0.2], [1.2, 1]] });

// Bars 3-4: the blues line, single notes with draw bends.
play(10, 67, 1.4, { velocity: 0.75, vibrato: { rate: 5, depth: 0.7, type: 'throat' } }); // draw 2, G
play(11.5, 71, 0.5, { velocity: 0.7, bend: -1 });                                         // draw 3 bent: B flat
play(12, 74, 0.5, { velocity: 0.8 });                                                     // draw 4, D
play(12.5, 72, 0.5, { velocity: 0.7 });                                                   // blow 4, C
play(13, 74, 1, { velocity: 0.85, bend: [[0, -1], [0.3, 0]] });                           // draw 4 scooped up
play(14, 71, 1.5, { velocity: 0.8, bend: [[0, 0], [0.15, -2], [0.9, -2], [1.3, -1]] });   // draw 3 down a whole tone
play(15.5, 67, 2.4, { velocity: 0.75, vibrato: { rate: 4.8, depth: 0.9, type: 'hand' } }); // draw 2 with hand vibrato

// Bars 5-6: wah chords, then a fast tongue-slapped fill.
play(18, D234, 0.9, { velocity: 0.85, wah: [[0, 1], [0.25, 0]] });
play(19, D234, 0.9, { velocity: 0.85, wah: [[0, 1], [0.25, 0]] });
play(20, D234, 1.8, { velocity: 0.9, wah: [[0, 1], [0.2, 0], [0.8, 0], [1.4, 0.9]], vibrato: { rate: 5.5, depth: 0.5, type: 'hand' } });
const fill = [[22, 74], [22.5, 72], [23, 71, -1], [23.5, 67]];
for (const [b, m, bd = 0] of fill) play(b, m, 0.45, { velocity: 0.8, attack: 0.01, bend: bd });

// Bars 7-8: final draw 2 with a slow bend release, then the closing chord.
play(24, 67, 2, { velocity: 0.8, bend: [[0, -1.5], [0.35, -1.5], [0.7, 0]], vibrato: { rate: 5, depth: 0.6 } });
play(26.5, [62, 67], 3, { velocity: 0.7, vibrato: { rate: 4.5, depth: 0.8, type: 'hand' }, wah: [[0, 0], [2.4, 0.9]] });

const t0 = performance.now();
const total = Math.max(...events.map((e) => e.t + e.dur)) + 1;
const [mono] = buffer(total);
events.forEach((e, i) => {
  const { t, midi, dur, ...opts } = e;
  mixInto(mono, render({ midi, duration: dur, seed: i + 1, ...opts }), Math.round(t * SR));
});
const fadeN = Math.round(0.3 * SR);
for (let i = 0; i < fadeN; i++) mono[mono.length - 1 - i] *= i / fadeN;

normalizePeak([mono], -3);
writeWav(outPath('harmonica.wav'), [mono]);
console.log(`${events.length} events, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('harmonica.wav', stats([mono]));

// Musette waltz in A minor: melody on the treble (three reed ranks), oom-pah-pah on the
// Stradella bass (bass button on 1, chord button on 2 and 3).
const A_BPM = 156;
const aBeat = 60 / A_BPM;
const aEvents = [];
const at = (bar, b) => (bar * 3 + b) * aBeat;

const harmony = ['Am', 'Am', 'E7', 'E7', 'E7', 'E7', 'Am', 'Am', 'Dm', 'Am', 'E7', 'Am', 'Am'];
const CH = { Am: { bass: [45, 40], root: 57, type: 'min' }, E7: { bass: [40, 47], root: 52, type: '7' }, Dm: { bass: [50, 45], root: 50, type: 'min' } };
harmony.forEach((h, bar) => {
  const c = CH[h];
  const last = bar === harmony.length - 1;
  aEvents.push({ t: at(bar, 0), midi: c.bass[bar % 2], dur: (last ? 2.6 : 0.8) * aBeat, voice: 'bass', velocity: 0.75 });
  if (last) { aEvents.push({ t: at(bar, 0), midi: c.root, dur: 2.6 * aBeat, voice: 'chord', chord: c.type, velocity: 0.5 }); return; }
  for (const b of [1, 2]) aEvents.push({ t: at(bar, b), midi: c.root, dur: 0.42 * aBeat, voice: 'chord', chord: c.type, velocity: 0.5 });
});

const melody = [
  [[0, 76, 1], [1, 72, 0.5], [1.5, 71, 0.5], [2, 72, 1]],
  [[0, 69, 2], [2, 64, 1]],
  [[0, 68, 1], [1, 71, 1], [2, 74, 1]],
  [[0, 76, 2], [2, 74, 0.5], [2.5, 72, 0.5]],
  [[0, 71, 1], [1, 68, 0.5], [1.5, 71, 0.5], [2, 74, 1]],
  [[0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 0.5], [2.5, 71, 0.5]],
  [[0, 72, 1], [1, 76, 1], [2, 81, 1]],
  [[0, 79, 0.5], [0.5, 77, 0.5], [1, 76, 2]],
  [[0, 77, 1], [1, 81, 1], [2, 77, 1]],
  [[0, 76, 1], [1, 72, 1], [2, 69, 1]],
  [[0, 71, 0.5], [0.5, 72, 0.5], [1, 74, 0.5], [1.5, 71, 0.5], [2, 68, 1]],
  [[0, 69, 3]],
  [[0, 69, 2.6]],
];
melody.forEach((notes, bar) => notes.forEach(([b, m, len], k) => {
  const long = len >= 2;
  aEvents.push({ t: at(bar, b), midi: m, dur: len * aBeat * 0.92, velocity: k === 0 ? 0.72 : 0.62,
    vibrato: long ? { rate: 5.5, depth: 0.25 } : undefined });
}));

const a0 = performance.now();
const aTotal = Math.max(...aEvents.map((e) => e.t + e.dur)) + 0.8;
const [acc] = buffer(aTotal);
aEvents.forEach((e, i) => {
  const { t, ...opts } = e;
  mixInto(acc, renderAccordion({ seed: i + 1, ...opts }), Math.round(t * SR));
});
for (let i = 0; i < fadeN; i++) acc[acc.length - 1 - i] *= i / fadeN;
normalizePeak([acc], -3);
writeWav(outPath('accordion.wav'), [acc]);
console.log(`${aEvents.length} events, ${aTotal.toFixed(1)} s, rendered in ${((performance.now() - a0) / 1000).toFixed(1)} s`);
console.log('accordion.wav', stats([acc]));
