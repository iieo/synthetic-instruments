import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render, meta } from '../instruments/cajon.mjs';
import { outPath } from './lib/out.mjs';

const t0 = Date.now();
const r = rng(23);
const events = [];
const hit = (time, voice, velocity, opts = {}) => events.push({ time, voice, velocity, ...opts });

// Part 1: every stroke alone, then the slap with the snare wires off and fully on.
let t = 0.3;
for (const v of meta.voices) { hit(t, v, v === 'ghost' ? 0.9 : 0.85); t += 0.75; }
hit(t, 'slap', 0.85, { snare: 0 }); t += 0.75;
hit(t, 'slap', 0.85, { snare: 1 }); t += 1.0;

// Part 2: a slow groove at 92 BPM in straight 16ths with ghost notes, then a busier bar,
// a muted bar with the other hand on the tapa, and a fill that ends on an open bass.
const bpm = 92, six = 60 / bpm / 4, start = t + 0.4;
const at = (bar, step) => start + (bar * 16 + step) * six + (r() - 0.5) * 0.006;
const hv = (v, spread = 0.08) => Math.min(1, Math.max(0.05, v + (r() - 0.5) * spread));
const bars = [
  'B.g.S.gtB.gBS.gt',
  'B.g.S.gtB.g.S.tg',
  'B.gtS.gBB.gtS.gT',
  'B.g.SgtgB.gBStgt',
  'B.g.S.gtB.g.S.gt',
  'TtgtSgtgBtgtSTSS',
];
const MAP = { B: ['bass', 0.95], S: ['slap', 0.85], T: ['tone', 0.8], t: ['tip', 0.6], g: ['ghost', 0.55] };
bars.forEach((pat, bar) => {
  [...pat].forEach((c, step) => {
    if (!MAP[c]) return;
    const [voice, v] = MAP[c];
    const accent = step % 4 === 0 ? 0.08 : 0;
    hit(at(bar, step), voice, hv(v + accent), bar === 4 ? { damping: 0.8 } : {});
  });
});
hit(at(6, 0), 'bass', 1);
hit(at(6, 0), 'slap', 0.5);

const cache = new Map(), count = {};
const rendered = events.sort((a, b) => a.time - b.time).map((e) => {
  const seed = ((count[e.voice] = (count[e.voice] ?? 0) + 1) % 6) + 1;
  const velocity = Math.round(e.velocity * 40) / 40;
  const o = { voice: e.voice, velocity, seed, snare: e.snare ?? 0.6, damping: e.damping ?? 0 };
  const key = JSON.stringify(o);
  if (!cache.has(key)) cache.set(key, render(o));
  return { time: e.time, x: cache.get(key) };
});

const end = Math.max(...rendered.map((e) => e.time + e.x.length / SR)) + 0.2;
const [out] = buffer(end, 1);
for (const e of rendered) mixInto(out, e.x, Math.round(e.time * SR));
normalizePeak([out], -3);
writeWav(outPath('cajon.wav'), [out]);
console.log({ seconds: +end.toFixed(2), hits: events.length, renders: cache.size, renderMs: Date.now() - t0, ...stats([out]) });
