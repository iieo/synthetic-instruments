import { SR, buffer, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/fx.mjs';
import { renderBreak } from '../instruments/breakbeat.mjs';
import { render as hardKick } from '../instruments/hardstyle-kick.mjs';
import { truePeak } from '../instruments/techno-kick/dsp.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const bpm = 150, beat = 60 / bpm;
const [L, R] = buffer(50, 2);
const at = (t) => Math.round(t * SR);
const add = (x, t, g = 1) => {
  const s = at(t);
  const [a, b] = Array.isArray(x) ? x : [x, x];
  for (let i = 0; i < a.length && s + i < L.length; i++) { L[s + i] += g * a[i]; R[s + i] += g * b[i]; }
};

// Part 1: each effect alone.
let t = 0.1;
for (const [voice, opts] of [['laser', {}], ['laser', { seconds: 0.6, seed: 2 }], ['impact', {}], ['sweep', { beats: 4 }], ['downlifter', { beats: 4 }]]) {
  const x = render({ voice, velocity: 1, bpm, ...opts });
  add(x, t);
  t += x[0].length / SR + 0.3;
}

// Part 2: in context. Riser into an impact and four bars of kicks, a snare roll into the next drop,
// downlifter out of it.
add(render({ voice: 'riser', velocity: 1, bpm, beats: 16 }), t, 0.9);
t += 16 * beat;
add(render({ voice: 'impact', velocity: 1 }), t, 0.8);
for (let q = 0; q < 16; q++) {
  add(hardKick({ preset: 'euphoric', midi: q < 8 ? 30 : 33, velocity: 0.95, duration: beat - 0.04 }), t + q * beat, 0.7);
  if (q % 4 === 2) add(render({ voice: 'laser', velocity: 0.6, seed: q }), t + (q + 0.5) * beat, 0.5);
}
add(render({ voice: 'sweep', velocity: 0.7, bpm, beats: 8 }), t + 8 * beat, 0.6);
t += 16 * beat;
add(render({ voice: 'snareRoll', velocity: 1, bpm: 174, beats: 8 }), t);
t += (8 * 60) / 174;
add(render({ voice: 'impact', velocity: 1, seed: 3 }), t, 0.8);
add(renderBreak({ bpm: 174, bars: 4, seed: 7 }), t, 0.8);
add(render({ voice: 'downlifter', velocity: 0.9, bpm: 174, beats: 8 }), t + (8 * 60) / 174, 0.8);
t += (16 * 60) / 174 + 0.6;

const end = at(t);
const chans = [L.slice(0, end), R.slice(0, end)];
const sp = stats(chans).peak, tp = Math.max(...chans.map(truePeak));
const g = Math.min(10 ** (-1 / 20) / sp, 10 ** (-0.5 / 20) / tp);
for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= g;
writeWav(outPath('fx.wav'), chans);
const s = stats(chans);
console.log({ seconds: +(end / SR).toFixed(2), peakDb: +s.peakDb.toFixed(2), truePeakDb: +(20 * Math.log10(tp * g)).toFixed(2), maxJump: +s.maxJump.toFixed(4), renderMs: Math.round(performance.now() - t0) });
