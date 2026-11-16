import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/chiptune.mjs';
import { truePeakDb } from '../instruments/acid/dsp.mjs';
import { outPath } from './lib/out.mjs';

// An original 8-bit tune in A minor at 150 BPM: one sixteenth is exactly six frames. Two passes
// of eight bars, the second with an echo voice and busier drums, then a closing bar.
const STEP = 60 / 150 / 4;
const at = (bar, step) => Math.round((bar * 16 + step) * STEP * SR);

const CHORDS = [[57, 'minor', 33], [53, 'major', 29], [60, 'major', 36], [55, 'major', 31],
  [57, 'minor', 33], [53, 'major', 29], [55, 'major', 31], [52, 'major', 28]];

const MELODY = [
  [[0, 3, 76], [3, 1, 74], [4, 2, 72], [6, 2, 74], [8, 4, 76], [12, 2, 79], [14, 2, 76]],
  [[0, 4, 77], [4, 2, 76], [6, 2, 74], [8, 6, 72], [14, 2, 69]],
  [[0, 3, 72], [3, 1, 74], [4, 2, 76], [6, 2, 79], [8, 4, 84], [12, 2, 83], [14, 2, 79]],
  [[0, 6, 81], [6, 2, 79], [8, 2, 77], [10, 2, 76], [12, 4, 74]],
  [[0, 2, 69], [2, 2, 72], [4, 2, 76], [6, 2, 81], [8, 3, 79], [11, 1, 77], [12, 4, 76]],
  [[0, 2, 77], [2, 2, 81], [4, 4, 84], [8, 2, 83], [10, 2, 81], [12, 4, 77]],
  [[0, 3, 79], [3, 1, 81], [4, 2, 83], [6, 2, 86], [8, 4, 83], [12, 4, 79]],
  [[0, 4, 80], [4, 2, 83], [6, 2, 88], [8, 4, 83], [12, 4, 80]],
];

// A chip channel plays one note at a time: each voice is a list of notes, and a new note cuts
// the one before it with a 3 ms fade.
const voices = { lead: [], echo: [], arp: [], bass: [], drums: [] };
const note = (voice, n, opts) => voices[voice].push({ n, opts });

for (let pass = 0; pass < 2; pass++) {
  for (let b = 0; b < 8; b++) {
    const bar = pass * 8 + b, [root, quality, low] = CHORDS[b];
    for (const [s, len, m] of MELODY[b]) {
      note('lead', at(bar, s), { preset: 'lead', midi: m, velocity: 0.9, duration: len * STEP - 0.02 });
      if (pass === 1) note('echo', at(bar, s + 3), { preset: 'pulse12', midi: m, velocity: 0.35, duration: len * STEP - 0.02 });
    }
    for (const half of [0, 8]) note('arp', at(bar, half), { preset: 'arp', midi: root, arp: quality, velocity: 0.45, duration: 7 * STEP });
    [0, 0, 12, 0, 0, 12, 0, 12].forEach((o, i) => note('bass', at(bar, 2 * i), { preset: 'bass', midi: low + o, velocity: 0.9, duration: 1.6 * STEP }));

    const full = pass === 1 || b >= 4;
    const kicks = pass === 1 ? [0, 6, 8, 10] : [0, 8];
    const snares = b === 7 && pass === 1 ? [4, 12, 13, 14, 15] : [4, 12];
    for (let s = 0; s < 16; s++) {
      if (kicks.includes(s)) note('drums', at(bar, s), { preset: 'kick', midi: 53, velocity: 1 });
      else if (full && snares.includes(s)) note('drums', at(bar, s), { preset: 'snare', midi: 62, velocity: s > 12 ? 0.6 : 0.85 });
      else if (s % 2 === 0) note('drums', at(bar, s), { preset: 'hat', midi: 84, velocity: s % 4 === 2 ? 0.5 : 0.3 });
    }
    if (pass === 0 && b === 7) note('echo', at(bar, 12), { preset: 'laser', midi: 88, velocity: 0.6 });
  }
}
note('lead', at(16, 0), { preset: 'lead', midi: 81, velocity: 0.9, duration: 10 * STEP, vibrato: 0.8 });
note('arp', at(16, 0), { preset: 'arp', midi: 57, arp: 'minor', velocity: 0.45, duration: 10 * STEP });
note('bass', at(16, 0), { preset: 'bass', midi: 33, velocity: 0.9, duration: 10 * STEP });
note('drums', at(16, 0), { preset: 'kick', midi: 53, velocity: 1 });
note('echo', at(16, 12), { preset: 'coin', midi: 81, velocity: 0.6 });

const LEVEL = { lead: 0.8, echo: 0.8, arp: 0.65, bass: 1, drums: 0.8 };
const t0 = performance.now();
const [mix] = buffer(at(17, 8) / SR + 0.5);
let seed = 1, count = 0;
for (const [voice, list] of Object.entries(voices)) {
  list.sort((a, b) => a.n - b.n);
  list.forEach(({ n, opts }, i) => {
    const x = render({ ...opts, seed: seed++ });
    const next = list[i + 1];
    if (next && voice !== 'echo') {
      const cut = next.n - n, fade = Math.round(0.003 * SR);
      for (let j = Math.max(0, cut - fade); j < x.length; j++) x[j] *= j >= cut ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (j - cut + fade) / fade);
    }
    mixInto(mix, x, n, LEVEL[voice]);
    count++;
  });
}
normalizePeak([mix], -1);
let tp = truePeakDb(mix);
if (tp > -0.5) {
  const g = 10 ** ((-0.6 - tp) / 20);
  for (let i = 0; i < mix.length; i++) mix[i] *= g;
  tp = truePeakDb(mix);
}
writeWav(outPath('chiptune.wav'), [mix]);
console.log(`${count} notes, ${(mix.length / SR).toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('chiptune.wav', { ...stats([mix]), truePeakDb: tp });
