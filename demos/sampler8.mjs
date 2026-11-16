import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/sampler8.mjs';
import { truePeak } from '../instruments/drum-machine/dsp.mjs';
import { outPath } from './lib/out.mjs';

// A four-channel module: 6 ticks per row at 50 Hz, so a row lasts 0.12 s. Each channel plays one
// note at a time, a new note cuts the old one. Channels 0 and 3 sit left, 1 and 2 right, with a
// little crossfeed as through the computer's monitor speaker.
const t0 = performance.now();
const ROW = 0.12, BAR = 16;
const chans = [[], [], [], []];
let seed = 1;
const note = (ch, bar, row, midi, rows, preset, opts = {}) =>
  chans[ch].push({ time: 0.1 + (bar * BAR + row) * ROW, args: { midi, preset, duration: rows * ROW - 0.01, velocity: 0.85, seed: seed++, ...opts } });

const CH = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]];
const ROOT = [38, 34, 36, 33];
const prog = (b) => b % 4;

for (let b = 0; b < 8; b++) {
  const c = prog(b), led = b < 2 ? { filter: 'led' } : {};
  // Drums.
  for (const r of [0, 8, 10]) if (b >= 1 && !(r === 10 && b % 2 === 0)) note(0, b, r, 60, 2, 'drum-kick', { velocity: 0.95, ...led });
  for (const r of [4, 12]) if (b >= 1) note(0, b, r, 62, 2, 'drum-snare', { velocity: 0.85, ...led });
  if (b === 4) note(0, b, 0, 62, 4, 'orchestra-hit', { velocity: 1 });
  // Bass.
  [[0, 0], [3, 0], [6, 12], [8, 0], [11, 7], [14, 12]].forEach(([r, iv]) => note(1, b, r, ROOT[c] + iv, 2, 'bass', { velocity: r % 8 === 0 ? 0.95 : 0.75, ...led }));
  // Pads.
  note(3, b, 0, CH[c][1] + 12, 16, b < 4 ? 'strings' : 'choir', { velocity: 0.7, ...led });
  // Upper channel: piano, then tracker arpeggio, then the melody.
  if (b < 2) [0, 3, 6, 8, 11, 14].forEach((r, i) => note(2, b, r, CH[c][i % 3] + 12, 3, 'piano', { velocity: 0.7 + 0.1 * (i % 2), ...led }));
  else if (b < 4) for (let r = 0; r < 16; r++) note(2, b, r, CH[c][r % 3] + 24, 1, 'chip', { velocity: r % 4 === 0 ? 0.7 : 0.5, bits: 6 });
}
const MEL = [
  [[69, 0, 4], [65, 4, 2], [67, 6, 2], [69, 8, 6], [74, 14, 2]],
  [[72, 0, 4], [70, 4, 4], [69, 8, 2], [67, 10, 2], [65, 12, 4]],
  [[64, 0, 4], [67, 4, 2], [72, 6, 6], [76, 12, 4]],
  [[74, 0, 6], [72, 6, 2], [69, 8, 8]],
];
MEL.forEach((bar, i) => bar.forEach(([m, r, len]) => note(2, 4 + i, r, m, len, 'lead', { velocity: 0.8 })));
note(0, 8, 0, 62, 8, 'orchestra-hit', { velocity: 1 });
note(1, 8, 0, 38, 8, 'bass', { velocity: 0.95 });
note(2, 8, 0, 74, 8, 'lead', { velocity: 0.75 });
note(3, 8, 0, 62, 10, 'choir', { velocity: 0.8 });

const fade = Math.round(0.003 * SR);
const tracks = chans.map((evs) => evs.map((e, i) => {
  let x = render(e.args);
  const next = evs[i + 1];
  if (next) {
    const cut = Math.round((next.time - e.time) * SR);
    if (cut + fade < x.length) {
      x = x.slice(0, cut + fade);
      for (let j = 0; j < fade; j++) x[cut + j] *= 0.5 + 0.5 * Math.cos(Math.PI * j / fade);
      x[x.length - 1] = 0;
    }
  }
  return { start: Math.round(e.time * SR), x };
}));
const end = Math.max(...tracks.flat().map((p) => p.start + p.x.length)) / SR + 0.2;
const [L, R] = buffer(end, 2);
const side = [0, 1, 1, 0], mix = [0.65, 0.35];
tracks.forEach((tr, c) => tr.forEach((p) => {
  mixInto(side[c] ? R : L, p.x, p.start, mix[0]);
  mixInto(side[c] ? L : R, p.x, p.start, mix[1]);
}));
const sp = stats([L, R]).peak, tp = Math.max(truePeak(L), truePeak(R));
const g = Math.min(10 ** (-1 / 20) / sp, 10 ** (-0.5 / 20) / tp);
for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) ch[i] *= g;
writeWav(outPath('sampler8.wav'), [L, R]);
console.log({ seconds: +end.toFixed(2), notes: chans.flat().length, renderMs: Math.round(performance.now() - t0), truePeakDb: +(20 * Math.log10(tp * g)).toFixed(2), ...stats([L, R]) });
