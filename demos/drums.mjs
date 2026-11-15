import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render, meta } from '../instruments/drums.mjs';
import { outPath } from './lib/out.mjs';

const t0 = Date.now();
const r = rng(85);
const events = [];
const hit = (time, voice, velocity) => events.push({ time, voice, velocity });

// Part 1: every voice alone.
const gaps = { hihatOpen: 1.3, ride: 1.7, crash: 2.2, kick: 1.0, snare: 1.0 };
let t = 0.3;
for (const v of meta.voices) { hit(t, v, 0.85); t += gaps[v] ?? 0.9; }

// Part 2: boom-bap groove, 85 BPM, swung 16ths, ghost notes, fill and crash.
const bpm = 85, sixteenth = 60 / bpm / 4, swing = 0.58;
const start = t + 0.6;
const at = (bar, step) => {
  const pair = Math.floor(step / 2), off = step % 2 ? 2 * swing * sixteenth : 0;
  return start + bar * 16 * sixteenth + pair * 2 * sixteenth + off + (r() - 0.5) * 0.008;
};
const hv = (v, spread = 0.08) => Math.min(1, Math.max(0.05, v + (r() - 0.5) * spread));
for (let bar = 0; bar < 4; bar++) {
  const kicks = bar % 2 === 0 ? [0, 7, 10] : [0, 3, 10, 13];
  for (const s of kicks) hit(at(bar, s), 'kick', hv(s === 0 ? 0.95 : 0.8));
  for (const s of [4, 12]) if (!(bar === 3 && s === 12)) hit(at(bar, s), 'snare', hv(0.9));
  for (const s of bar % 2 ? [6, 9, 15] : [2, 9, 14]) if (!(bar === 3 && s > 8)) hit(at(bar, s), 'snare', hv(0.2, 0.1));
  if (bar === 2) {
    for (let s = 0; s < 16; s += 2) hit(at(bar, s), 'ride', hv(s % 4 === 0 ? 0.75 : 0.55));
    for (let s = 1; s < 16; s += 2) hit(at(bar, s), 'shaker', hv(0.6));
    hit(at(bar, 15), 'rim', hv(0.5));
  } else {
    for (let s = 0; s < (bar === 3 ? 8 : 16); s += 2) {
      const open = bar === 1 && s === 14;
      hit(at(bar, s), open ? 'hihatOpen' : 'hihatClosed', hv(s % 4 === 0 ? 0.75 : 0.5));
      if (s % 4 === 2 && bar !== 3) hit(at(bar, s + 1), 'hihatClosed', hv(0.25));
    }
  }
}
const fill = [[8, 'snare', 0.8], [9, 'snare', 0.45], [10, 'tomHigh', 0.85], [11, 'tomHigh', 0.6],
  [12, 'tomMid', 0.85], [13, 'tomMid', 0.6], [14, 'tomLow', 0.9], [15, 'tomLow', 0.7]];
for (const [s, v, vel] of fill) hit(at(3, s), v, hv(vel));
hit(at(4, 0), 'kick', 1);
hit(at(4, 0), 'crash', 0.9);
hit(at(4, 4), 'snare', 0.25);

const pan = { kick: 0, snare: -0.05, rim: -0.1, hihatClosed: 0.35, hihatOpen: 0.35, ride: -0.4, crash: -0.3,
  tomHigh: -0.25, tomMid: 0.1, tomLow: 0.4, shaker: 0.55 };

const cache = new Map(), seedCounter = {};
events.sort((a, b) => a.time - b.time);
const rendered = events.map((e, idx) => {
  const seed = ((seedCounter[e.voice] = (seedCounter[e.voice] ?? 0) + 1) % 7) + 1;
  const vel = Math.round(e.velocity * 50) / 50;
  const key = `${e.voice}|${vel}|${seed}`;
  if (!cache.has(key)) cache.set(key, render({ voice: e.voice, velocity: vel, seed }));
  let x = cache.get(key);
  if (e.voice === 'hihatOpen') {
    // A closed hat closes the open one: choke with a short fade.
    const next = events.slice(idx + 1).find((n) => n.voice === 'hihatClosed');
    if (next) {
      const cut = Math.round((next.time - e.time) * SR), fade = Math.round(0.02 * SR);
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
  const p = ((pan[e.voice] + 1) * Math.PI) / 4;
  const start = Math.round(e.time * SR);
  mixInto(L, e.x, start, Math.cos(p));
  mixInto(R, e.x, start, Math.sin(p));
}
normalizePeak([L, R], -3);
writeWav(outPath('drums.wav'), [L, R]);
console.log({ seconds: +end.toFixed(2), hits: events.length, renderMs: Date.now() - t0, ...stats([L, R]) });
