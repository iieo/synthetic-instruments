import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/chord-stab.mjs';
import { kaiserLowpass } from '../instruments/rave/dsp.mjs';
import { outPath } from './lib/out.mjs';

const BPM = 132, beat = 60 / BPM, bar = 4 * beat, s16 = beat / 4;
const events = [];
const add = (t, opts) => events.push({ t, opts });

// Part 1: each preset, two chords.
['minor7', 'major', 'sus', 'organ', 'piano'].forEach((preset, i) => {
  add(i * 1.4, { preset, midi: 57, velocity: 0.95, duration: 0.25 });
  add(i * 1.4 + 0.55, { preset, midi: 53, velocity: 0.85, duration: 0.4 });
});

// Part 2: two four-bar phrases. Roots per bar and a syncopated stab rhythm in sixteenths.
const T0 = 7.6;
const roots = [57, 53, 60, 55];
const rhythm = [[0, 2], [3, 1], [6, 2], [10, 1], [12, 2]];
for (let phrase = 0; phrase < 2; phrase++) {
  roots.forEach((root, b) => {
    const t = T0 + (phrase * 4 + b) * bar;
    for (const [st, len] of rhythm) {
      const v = st === 0 ? 1 : 0.8;
      if (phrase === 0) add(t + st * s16, { preset: 'piano', midi: root, velocity: v, duration: len * s16, seed: b * 16 + st });
      else add(t + st * s16, { preset: 'minor7', midi: root, velocity: v, duration: len * s16 - 0.01, seed: b * 16 + st });
    }
    // Organ fifths on the offbeats of the second phrase.
    if (phrase === 1) for (const q of [1, 3]) add(t + (q + 0.5) * beat, { preset: 'organ', midi: root - 12, velocity: 0.7, duration: 0.1, seed: 200 + b * 4 + q });
  });
}

const rendered = events.map((e) => ({ ...e, x: render(e.opts) }));
const total = Math.max(...rendered.map((e) => e.t + e.x[0].length / SR)) + 0.2;
const [L, R] = buffer(total, 2);
for (const e of rendered) {
  const at = Math.round(e.t * SR);
  const g = e.opts.preset === 'organ' && e.t > T0 ? 0.55 : 1;
  mixInto(L, e.x[0], at, g);
  mixInto(R, e.x[1], at, g);
}

function truePeak(chs) {
  const os = 4, h = kaiserLowpass(4 * 48 - 1, 0.5 / os * 0.92, 9), D = (h.length - 1) / 2;
  let peak = 0;
  for (const x of chs) {
    for (let n = 0; n < x.length; n++) {
      for (let k = 0; k < os; k++) {
        let acc = 0;
        const c = n * os + k + D;
        for (let i = c % os; i < h.length; i += os) {
          const j = (c - i) / os;
          if (j >= 0 && j < x.length) acc += h[i] * x[j];
        }
        peak = Math.max(peak, Math.abs(acc * os));
      }
    }
  }
  return peak;
}
const tp = truePeak([L, R]), gain = Math.min(10 ** (-1 / 20) / stats([L, R]).peak, 10 ** (-0.6 / 20) / tp);
for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) ch[i] *= gain;

writeWav(outPath('chord-stab.wav'), [L, R]);
console.log(`${events.length} events, ${total.toFixed(1)} s, true peak ${(20 * Math.log10(tp * gain)).toFixed(2)} dBTP`);
console.log('chord-stab.wav', stats([L, R]));
