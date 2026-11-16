import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/delta-drums.mjs';
import { truePeak } from '../instruments/drum-machine/dsp.mjs';
import { outPath } from './lib/out.mjs';

// The console has a single delta channel, so every hit cuts the one before it.
const t0 = performance.now();
const events = [];
let seed = 1;
const hit = (time, voice, opts = {}) => events.push({ time, voice, opts: { velocity: 0.9, ...opts, seed: seed++ } });

// Part 1: every voice clean at the top rate, then crunchy at rate 3.
let t = 0.1;
for (const v of ['kick', 'snare', 'tom-high', 'tom-low', 'clap', 'cowbell', 'shout', 'slap']) {
  hit(t, v, { rate: 15 }); t += 0.42;
  hit(t, v, { rate: 3 }); t += 0.55;
}
hit(t, 'crash', { rate: 15 }); t += 1.0;
hit(t, 'crash', { rate: 3 }); t += 1.3;

// Part 2: a groove at 112 BPM. Slap bass answers the drums on the same channel, its notes come
// from tuning the playback rate along the table's pentatonic ladder.
const s16 = 60 / 112 / 4;
const riff = [0, 5, 7, 0, 10, 7, 5, -5];
function bar(start, b, rate) {
  const at = (k) => start + k * s16;
  const r = (k) => riff[(b * 4 + k) % riff.length];
  hit(at(0), b % 4 === 0 ? 'crash' : 'kick', { rate, velocity: 1 });
  hit(at(2), 'slap', { rate: 7, tune: r(0), velocity: 0.8 });
  hit(at(3), 'slap', { rate: 7, tune: r(1), velocity: 0.55 });
  hit(at(4), b >= 4 ? 'clap' : 'snare', { rate, velocity: 0.95 });
  hit(at(6), 'kick', { rate, velocity: 0.8 });
  hit(at(7), 'slap', { rate: 7, tune: r(2), velocity: 0.7 });
  hit(at(8), 'kick', { rate, velocity: 0.95 });
  hit(at(10), 'cowbell', { rate, velocity: 0.6, tune: b % 2 ? 2 : 0 });
  hit(at(11), 'slap', { rate: 7, tune: r(3), velocity: 0.75 });
  if (b % 4 === 3) {
    hit(at(12), 'tom-high', { rate, velocity: 0.9 });
    hit(at(13), 'tom-high', { rate, velocity: 0.8, tune: -3 });
    hit(at(14), 'tom-low', { rate, velocity: 0.9 });
    hit(at(15), 'shout', { rate: Math.max(rate, 9), velocity: 1 });
  } else {
    hit(at(12), 'snare', { rate, velocity: 0.95 });
    hit(at(14), 'slap', { rate: 7, tune: r(0) + 12, velocity: 0.6 });
    hit(at(15), 'snare', { rate, velocity: 0.35 });
  }
}
for (let b = 0; b < 4; b++) bar(t + b * 16 * s16, b, 12);
t += 64 * s16;
for (let b = 4; b < 8; b++) bar(t + (b - 4) * 16 * s16, b, 4);
t += 64 * s16;
hit(t, 'crash', { rate: 12, velocity: 1 });

events.sort((a, b) => a.time - b.time);
const fade = Math.round(0.004 * SR);
const parts = events.map((e, i) => {
  let x = render({ voice: e.voice, ...e.opts });
  const next = events[i + 1];
  if (next) {
    const cut = Math.round((next.time - e.time) * SR);
    if (cut + fade < x.length) {
      x = x.slice(0, cut + fade);
      for (let j = 0; j < fade; j++) x[cut + j] *= 0.5 + 0.5 * Math.cos(Math.PI * j / fade);
      x[x.length - 1] = 0;
    }
  }
  return { start: Math.round(e.time * SR), x };
});
const end = Math.max(...parts.map((p) => p.start + p.x.length)) / SR + 0.2;
const [y] = buffer(end, 1);
for (const p of parts) mixInto(y, p.x, p.start);
const sp = stats([y]).peak, tp = truePeak(y);
const g = Math.min(10 ** (-1 / 20) / sp, 10 ** (-0.5 / 20) / tp);
for (let i = 0; i < y.length; i++) y[i] *= g;
writeWav(outPath('delta-drums.wav'), [y]);
console.log({ seconds: +end.toFixed(2), hits: events.length, renderMs: Math.round(performance.now() - t0), truePeakDb: +(20 * Math.log10(tp * g)).toFixed(2), ...stats([y]) });
