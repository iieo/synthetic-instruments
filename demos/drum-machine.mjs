import { SR, buffer, mixInto, stats, writeWav, rng } from '../lib/audio.mjs';
import { render } from '../instruments/drum-machine.mjs';
import { truePeak } from '../instruments/drum-machine/dsp.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const r = rng(150);
const events = [];
let seed = 1;
const hit = (time, voice, opts = {}, pan = 0, gain = 1) => events.push({ time, voice, opts: { ...opts, seed: seed++ }, pan, gain });

// Part 1: every voice on its own.
let t = 0.15;
for (const v of [0.45, 0.7, 1, 0.6]) { hit(t, 'hatClosed', { velocity: v }); t += 0.22; }
t += 0.2; hit(t, 'hatOpen', { velocity: 0.9 }); t += 1.0;
hit(t, 'ride', { velocity: 0.9 }); t += 1.5;
hit(t, 'clap', { velocity: 0.9 }); t += 0.7; hit(t, 'clap', { velocity: 1, decay: 1.1 }); t += 0.9;
hit(t, 'snare', { velocity: 0.9, snappy: 0.4 }); t += 0.45; hit(t, 'snare', { velocity: 0.9, snappy: 1 }); t += 0.55;
hit(t, 'rim', { velocity: 0.8 }); t += 0.25; hit(t, 'rim', { velocity: 1 }); t += 0.4;
for (const tn of [-7, 0, 5, 12]) { hit(t, 'perc', { velocity: 0.85, tune: tn }); t += 0.36; }
t += 0.3;

// Part 2 and 3: hard techno at 150 BPM. Closed hats skip the offbeat, where the open hat sits and is choked.
const s16 = 60 / 150 / 4;
const hatAcc = [0.62, 0.38, 0, 0.5];
const percLine = [[0, -5], [3, 0], [6, 7], [8, -5], [10, 0], [11, 3], [13, 7], [14, 0]];
function bar(start, b, industrial) {
  const d = industrial ? 0.65 : 0;
  for (let k = 0; k < 16; k++) {
    const tk = start + k * s16, beat = k >> 2, pos = k & 3;
    if (pos === 2) hit(tk, 'hatOpen', { velocity: 0.8 + 0.1 * r(), decay: 0.45, drive: d * 0.8 }, 0.3, 0.75);
    else hit(tk, 'hatClosed', { velocity: Math.min(1, hatAcc[pos] + 0.12 * r() + (k === 15 ? 0.3 : 0)), drive: d * 0.6 }, 0.25, 0.7);
    if (beat % 2 === 1 && pos === 0) {
      hit(tk, 'clap', { velocity: 0.95, drive: d }, 0, 1);
      if (industrial) hit(tk, 'snare', { velocity: 0.9, snappy: 1, drive: d, tune: -2 }, 0, 0.8);
    }
    if (b >= 4 && pos === 0) hit(tk, 'ride', { velocity: 0.75 + 0.1 * r(), decay: 1.5, drive: d * 0.5 }, -0.45, 0.45);
    if (b >= 2) {
      const p = percLine.find(([s]) => s === k);
      if (p) hit(tk, 'perc', { velocity: 0.6 + 0.3 * r(), tune: p[1] + (industrial ? -3 : 0), decay: 0.35, drive: d }, p[1] > 2 ? -0.5 : 0.5, 0.4);
    }
    if ((k === 7 || k === 12) && b % 2 === 1) hit(tk, 'rim', { velocity: 0.75, drive: d * 0.5 }, -0.2, 0.5);
  }
}
const barLen = 16 * s16;
for (let b = 0; b < 8; b++) bar(t + b * barLen, b, false);
t += 8 * barLen;
for (let b = 0; b < 4; b++) bar(t + b * barLen, b + 2, true);
t += 4 * barLen;
hit(t, 'clap', { velocity: 1, decay: 0.9, drive: 0.65 });
hit(t, 'perc', { velocity: 1, tune: -10, decay: 0.8, drive: 0.65 }, 0, 0.8);

events.sort((a, b) => a.time - b.time);
const rendered = events.map((e, idx) => {
  let x = render({ voice: e.voice, ...e.opts });
  if (e.voice === 'hatOpen') {
    // The hats share one VCA path, so the next closed hat chokes the open one.
    const next = events.slice(idx + 1).find((n) => n.voice === 'hatClosed');
    if (next) {
      const cut = Math.round((next.time - e.time) * SR), fade = Math.round(0.008 * SR);
      if (cut + fade < x.length) {
        x = x.slice(0, cut + fade);
        for (let i = 0; i < fade; i++) x[cut + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fade);
        x[x.length - 1] = 0;
      }
    }
  }
  return { ...e, x };
});

const end = Math.max(...rendered.map((e) => e.time + e.x.length / SR)) + 0.2;
const [L, R] = buffer(end, 2);
for (const e of rendered) {
  const p = ((e.pan + 1) * Math.PI) / 4, start = Math.round(e.time * SR);
  mixInto(L, e.x, start, e.gain * Math.cos(p) * Math.SQRT2);
  mixInto(R, e.x, start, e.gain * Math.sin(p) * Math.SQRT2);
}
// Linear gain only: sample peak -1 dBFS unless the inter-sample peak would exceed -0.5 dBTP.
const sp = stats([L, R]).peak, tp = Math.max(truePeak(L), truePeak(R));
const g = Math.min(10 ** (-1 / 20) / sp, 10 ** (-0.5 / 20) / tp);
for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) ch[i] *= g;
writeWav(outPath('drum-machine.wav'), [L, R]);
console.log({ seconds: +end.toFixed(2), hits: events.length, renderMs: Math.round(performance.now() - t0), truePeakDb: +(20 * Math.log10(tp * g)).toFixed(2), ...stats([L, R]) });
