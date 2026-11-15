import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/rolling-bass.mjs';
import { kaiserLowpass } from '../instruments/rave/dsp.mjs';
import { outPath } from './lib/out.mjs';

const BPM = 158, beat = 60 / BPM, bar = 4 * beat, s16 = beat / 4;
const events = [];
const add = (t, opts) => events.push({ t, opts });

// Roots per bar (A, F, C, G and back), one octave each.
const roots = [33, 29, 36, 31, 33, 29, 36, 38];

// Four bars per preset, starting with plain offbeat eighths.
roots.slice(0, 4).forEach((m, b) => {
  for (let q = 0; q < 4; q++) add(b * bar + (q + 0.5) * beat, { preset: 'offbeat', midi: m + 12, velocity: 0.9, duration: 0.11, seed: b * 4 + q });
});

// Rolling: three sixteenths after each kick position, the octave on the middle one.
const T1 = 4 * bar;
roots.slice(4).forEach((m, b) => {
  for (let q = 0; q < 4; q++) {
    for (const [st, oct, v] of [[1, 0, 0.8], [2, 12, 0.95], [3, 0, 0.8]]) {
      add(T1 + b * bar + q * beat + st * s16, { preset: 'rolling', midi: m + 12 + oct, velocity: v, duration: 0.07, seed: 40 + b * 16 + q * 4 + st });
    }
  }
});

// Howl: offbeat eighths again with longer notes and a two-note move each bar.
const T2 = 8 * bar;
roots.slice(0, 4).forEach((m, b) => {
  for (let q = 0; q < 4; q++) {
    const midi = m + 12 + (q === 3 ? 3 : 0);
    add(T2 + b * bar + (q + 0.5) * beat, { preset: 'howl', midi, velocity: 0.9, duration: 0.2, seed: 80 + b * 4 + q });
  }
});

const rendered = events.map((e) => {
  const x = render(e.opts);
  return { ...e, x: ArrayBuffer.isView(x) ? [x, x] : x };
});
const total = Math.max(...rendered.map((e) => e.t + e.x[0].length / SR)) + 0.2;
const [L, R] = buffer(total, 2);
for (const e of rendered) {
  const at = Math.round(e.t * SR);
  mixInto(L, e.x[0], at);
  mixInto(R, e.x[1], at);
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

writeWav(outPath('rolling-bass.wav'), [L, R]);
console.log(`${events.length} events, ${total.toFixed(1)} s, true peak ${(20 * Math.log10(tp * gain)).toFixed(2)} dBTP`);
console.log('rolling-bass.wav', stats([L, R]));
