import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/reese.mjs';
import { kaiserLowpass } from '../instruments/rave/dsp.mjs';
import { outPath } from './lib/out.mjs';

const BPM = 174, beat = 60 / BPM, bar = 4 * beat;
const events = [];
const add = (t, opts) => events.push({ t, opts });

// Part 1: each preset as one held note.
add(0, { preset: 'clean', midi: 33, velocity: 0.9, duration: 2.2 });
add(2.6, { preset: 'dark', midi: 31, velocity: 0.9, duration: 2.2 });
add(5.2, { preset: 'growl', midi: 33, velocity: 1, duration: 2.2 });

// Part 2: eight bars of a half-time drum'n'bass line, [beat, midi, beats, preset, slide-from].
const T0 = 8.2;
const line = [
  [0, 28, 1.5], [2.5, 28, 0.5], [3, 31, 1, 28],
  [4, 26, 2], [6.5, 26, 0.5], [7, 24, 1],
  [8, 28, 1.5], [10.5, 31, 0.5], [11, 33, 1, 31],
  [12, 31, 1.75], [14, 26, 2, 31],
];
for (let rep = 0; rep < 2; rep++) {
  const preset = rep === 0 ? 'dark' : 'growl';
  for (const [b, m, len, from] of line) {
    add(T0 + rep * 4 * bar + b * beat, {
      preset, midi: m, velocity: b % 4 === 0 ? 1 : 0.85, duration: len * beat - 0.02, seed: 10 + b,
      ...(from != null ? { from, glide: 0.04 } : {}),
    });
  }
}

const rendered = events.map((e) => ({ ...e, x: render(e.opts) }));
const total = Math.max(...rendered.map((e) => e.t + e.x[0].length / SR)) + 0.2;
const [L, R] = buffer(total, 2);
for (const e of rendered) {
  const at = Math.round(e.t * SR);
  mixInto(L, e.x[0], at);
  mixInto(R, e.x[1], at);
}

// True peak by 4x polyphase interpolation, then one linear gain: peak -1 dBFS, true peak <= -0.6 dBTP.
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

writeWav(outPath('reese.wav'), [L, R]);
console.log(`${events.length} events, ${total.toFixed(1)} s, true peak ${(20 * Math.log10(tp * gain)).toFixed(2)} dBTP`);
console.log('reese.wav', stats([L, R]));
