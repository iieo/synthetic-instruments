import { SR, buffer, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/rave.mjs';
import { kaiserLowpass, fadeOut } from '../instruments/rave/dsp.mjs';
import { outPath } from './lib/out.mjs';

const BPM = 150;
const beat = 60 / BPM, bar = 4 * beat, s16 = beat / 4;
const events = [];
const add = (t, gain, opts) => events.push({ t, gain, opts });

// Part 1: each preset on its own.
const Am = [57, 60, 64, 69], Fm = [53, 56, 60, 65], Gm = [55, 58, 62, 67], Em = [52, 55, 59, 64];
[[0, 1], [0.4, 0.75], [0.8, 0.9], [1.1, 0.8], [1.5, 1]].forEach(([t, v], i) =>
  add(t, 0.8, { preset: 'stab', chord: i < 3 ? Am : Fm, velocity: v, duration: 0.14 }));
add(2.4, 0.75, { preset: 'whoop', midi: 57, velocity: 0.95, duration: 1.6 });
add(4.5, 0.8, { preset: 'screech', midi: 45, velocity: 0.9, duration: 2.4, bend: [[0, 0], [2.4, 7]] });
add(7.2, 0.95, { preset: 'pad', chord: [45, 52, 57, 60, 64, 71], velocity: 0.7, duration: 2.4 });

// Part 2: eight bars of hard techno at 150 BPM.
const T0 = 10.6;
const prog = [Am, Am, Fm, Fm, Gm, Gm, Em, Am];
const stabSteps = [[2, 0.85], [5, 1], [8, 0.8], [10, 0.9], [13, 1], [15, 0.7]];
prog.forEach((ch, b) => {
  for (const [st, v] of stabSteps) {
    add(T0 + b * bar + st * s16, 0.75, { preset: 'stab', chord: ch, velocity: v, duration: 0.11, seed: b * 16 + st });
  }
  // Off-beat bass: single low stab notes on every second eighth.
  for (let e = 1; e < 8; e += 2) {
    add(T0 + b * bar + e * 2 * s16, 0.6, { preset: 'stab', midi: ch[0] - 24, velocity: 0.75, duration: 0.13, seed: 100 + b * 8 + e });
  }
});

// Whoop riff over bars 3 to 6: two quarter notes per gesture, the second reached by portamento.
const riff = [[0, 3], [0, -2], [0, 5], [3, 0], [0, 3], [7, 5], [3, 0], [-2, 0]];
riff.forEach(([a, b], i) => {
  const gate = 2 * beat - 0.06;
  add(T0 + 2 * bar + i * 2 * beat, 0.6, {
    preset: 'whoop', midi: 57 + a, velocity: 0.9, duration: gate, glide: 0.05, seed: 300 + i,
    bend: [[0, 0], [beat - 0.02, 0], [beat - 0.02, b - a], [gate, b - a]],
  });
});

// Screech sweep over bars 7 and 8, rising an octave.
add(T0 + 6 * bar, 0.5, { preset: 'screech', midi: 45, velocity: 1, duration: 2 * bar - 0.1, bend: [[0, 0], [2 * bar - 0.1, 12]], seed: 400 });

// Part 3: breakdown on the pad.
const TB = T0 + 8 * bar;
add(TB, 0.75, { preset: 'pad', chord: [45, 52, 57, 60, 64, 71], velocity: 0.6, duration: 3.3, seed: 500 });
add(TB + 3.3, 0.75, { preset: 'pad', chord: [41, 48, 53, 56, 60, 67], velocity: 0.75, duration: 3.1, seed: 501 });

const t0 = performance.now();
const rendered = events.map((e) => ({ ...e, x: render(e.opts) }));
const total = Math.max(...rendered.map((e) => e.t + e.x[0].length / SR)) + 0.1;
const [L, R] = buffer(total, 2);
for (const e of rendered) {
  const at = Math.round(e.t * SR);
  mixInto(L, e.x[0], at, e.gain);
  mixInto(R, e.x[1], at, e.gain);
}
fadeOut([L, R], 0.05);

// True peak by 4x polyphase interpolation (as in the ITU-R BS.1770 meter, with our own filter).
function truePeak(chs) {
  const os = 4, h = kaiserLowpass(4 * 48 - 1, 0.5 / os * 0.92, 9), D = (h.length - 1) / 2;
  let peak = 0;
  for (const x of chs) {
    for (let n = 0; n < x.length; n++) {
      for (let k = 0; k < os; k++) {
        let acc = 0;
        const c = n * os + k + D;
        for (let i = (c % os); i < h.length; i += os) {
          const j = (c - i) / os;
          if (j >= 0 && j < x.length) acc += h[i] * x[j];
        }
        peak = Math.max(peak, Math.abs(acc * os));
      }
    }
  }
  return peak;
}

const sp = stats([L, R]).peak, tp = truePeak([L, R]);
const gain = Math.min(10 ** (-1 / 20) / sp, 10 ** (-0.6 / 20) / tp);
for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) ch[i] *= gain;

writeWav(outPath('rave.wav'), [L, R]);
console.log(`${events.length} events, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log(`true peak ${(20 * Math.log10(tp * gain)).toFixed(2)} dBTP`);
console.log('rave.wav', stats([L, R]));
