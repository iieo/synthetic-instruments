import { SR, buffer, stats, writeWav } from '../lib/audio.mjs';
import { render, renderBreak, meta } from '../instruments/breakbeat.mjs';
import { truePeak } from '../instruments/techno-kick/dsp.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const [L, R] = buffer(32, 2);
const at = (t) => Math.round(t * SR);
const add = (x, t, gl = 0.7, gr = 0.7) => {
  const s = at(t);
  const [a, b] = Array.isArray(x) ? x : [x, x];
  for (let i = 0; i < a.length && s + i < L.length; i++) { L[s + i] += gl * a[i]; R[s + i] += gr * b[i]; }
};

// Part 1: every voice alone, two velocities.
let t = 0.15;
for (const voice of meta.voices) {
  for (const velocity of [0.6, 1]) { add(render({ voice, velocity, seed: 2 }), t); t += voice === 'ride' ? 1.4 : 0.42; }
  t += 0.2;
}

// Part 2: the pattern at 174 BPM, eight bars on hats, then eight bars with the ride on the beat.
const a = renderBreak({ bpm: 174, bars: 8, seed: 5 });
add(a, t, 1, 1);
t += (8 * 4 * 60) / 174;
const b = renderBreak({ bpm: 174, bars: 8, seed: 9, withRide: true });
add(b, t, 1, 1);
t += b[0].length / SR;

const end = at(t + 0.1);
const chans = [L.slice(0, end), R.slice(0, end)];
const sp = stats(chans).peak, tp = Math.max(...chans.map(truePeak));
const g = Math.min(10 ** (-1 / 20) / sp, 10 ** (-0.5 / 20) / tp);
for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= g;
writeWav(outPath('breakbeat.wav'), chans);
const s = stats(chans);
console.log({ seconds: +(end / SR).toFixed(2), peakDb: +s.peakDb.toFixed(2), truePeakDb: +(20 * Math.log10(tp * g)).toFixed(2), maxJump: +s.maxJump.toFixed(4), renderMs: Math.round(performance.now() - t0) });
