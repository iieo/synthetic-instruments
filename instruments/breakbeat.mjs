import { SR, rng } from '../lib/audio.mjs';
import { kick, snare, hat, ride, edges } from './breakbeat/voices.mjs';
import { seedInt } from './synth/dsp.mjs';

export const meta = {
  name: 'Breakbeat',
  voices: ['kick', 'snare', 'ghost', 'hat', 'ride'],
};

// Fixed gains so a full-velocity hit peaks just under -1 dBFS (measured over many seeds).
const LEVEL = { kick: 0.785, snare: 0.4, ghost: 0.3, hat: 0.57, ride: 0.035 };
const FADE = { kick: 0.02, snare: 0.03, ghost: 0.02, hat: 0.01, ride: 0.15 };

export function render({ voice = 'snare', velocity = 0.8, seed = 1, tune = 0, decay: decayIn = 1 } = {}) {
  if (!meta.voices.includes(voice)) throw new Error(`unknown voice ${voice}`);
  const decay = decayIn >= 0.25 ? Math.min(3, decayIn) : 0.25;
  const r = rng((seedInt(seed) * 2654435761) ^ (meta.voices.indexOf(voice) * 40503 + 11));
  const vel = Math.max(0, Math.min(1, velocity));
  let y;
  if (voice === 'kick') y = kick(r, vel, { tune, decay });
  else if (voice === 'snare') y = snare(r, vel, { tune, decay });
  else if (voice === 'ghost') y = snare(r, vel, { tune, decay, ghost: true });
  else if (voice === 'hat') y = hat(r, vel, { decay });
  else y = ride(r, vel, { decay });
  const g = LEVEL[voice] * vel ** 1.3;
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return edges(y, 16, FADE[voice] * SR);
}

// Bars of 16 steps: [step, voice, velocity]. Bar D is the fill that leads into the next phrase.
const BARS = {
  A: [[0, 'kick', 1], [10, 'kick', 0.9], [4, 'snare', 1], [12, 'snare', 1], [7, 'ghost', 0.55], [14, 'ghost', 0.4]],
  B: [[0, 'kick', 1], [10, 'kick', 0.9], [11, 'kick', 0.65], [4, 'snare', 1], [12, 'snare', 1], [9, 'ghost', 0.45], [15, 'ghost', 0.5], [13, 'hat', 0.35]],
  C: [[0, 'kick', 1], [6, 'kick', 0.8], [10, 'kick', 0.9], [4, 'snare', 1], [12, 'snare', 1], [2, 'ghost', 0.35], [7, 'ghost', 0.5], [11, 'ghost', 0.4], [13, 'ghost', 0.45], [15, 'hat', 0.35]],
  D: [[0, 'kick', 1], [10, 'kick', 0.9], [4, 'snare', 1], [12, 'snare', 0.95], [14, 'snare', 0.8], [15, 'snare', 0.9], [7, 'ghost', 0.35], [9, 'ghost', 0.45], [11, 'ghost', 0.5], [13, 'ghost', 0.6]],
};
const ORDER = ['A', 'B', 'A', 'C', 'A', 'B', 'C', 'D'];
const PAN = { kick: 0, snare: 0, ghost: 0.12, hat: 0.3, ride: -0.35 };

// A syncopated two-step pattern, written for this instrument. The seed adds or drops a few ghost
// notes, humanises velocities and pushes ghosts a few milliseconds late. Returns [L, R].
export function renderBreak({ bpm = 172, bars = 4, seed = 1, velocity = 0.9, withRide = false, fill = true, tail = 0.4 } = {}) {
  const r = rng(seedInt(seed) * 9973 + 1), s16 = 60 / bpm / 4;
  const events = [];
  for (let b = 0; b < bars; b++) {
    let name = ORDER[b % ORDER.length];
    if (name === 'D' && !fill) name = 'C';
    if (fill && b === bars - 1 && bars > 1) name = 'D';
    const notes = BARS[name].map((e) => [...e]);
    const fillBar = name === 'D';
    for (let k = 0; k < 16; k += 2) {
      if (fillBar && k > 8) break;
      if (withRide && k % 4 === 0) notes.push([k, 'ride', 0.55 + (k === 0 ? 0.15 : 0)]);
      else notes.push([k, 'hat', k % 4 === 2 ? 0.75 : 0.45]);
    }
    if (!fillBar && r() < 0.5) notes.push([[3, 5, 8][Math.floor(r() * 3)], 'ghost', 0.3 + 0.15 * r()]);
    for (const [step, voice, v] of notes) {
      if (voice === 'ghost' && !fillBar && r() < 0.15) continue;
      const late = voice === 'ghost' ? 0.002 + 0.003 * r() : 0;
      events.push({ t: (b * 16 + step) * s16 + late, voice, vel: Math.min(1, velocity * v * (1 + 0.08 * (2 * r() - 1))) });
    }
  }
  const total = Math.round((bars * 16 * s16 + tail) * SR);
  const L = new Float64Array(total), R = new Float64Array(total);
  // Velocities snap to 1/32 and each voice cycles through four seeds, so repeated hits come from a cache.
  const cache = new Map(), count = {};
  for (const e of events) {
    count[e.voice] = (count[e.voice] || 0) + 1;
    const vel = Math.round(e.vel * 32) / 32, sd = seed + (count[e.voice] % 4), key = `${e.voice}|${vel}|${sd}`;
    if (!cache.has(key)) cache.set(key, render({ voice: e.voice, velocity: vel, seed: sd }));
    const x = cache.get(key);
    const p = ((PAN[e.voice] + 1) * Math.PI) / 4, gl = Math.cos(p) * Math.SQRT2 * 0.55, gr = Math.sin(p) * Math.SQRT2 * 0.55;
    const start = Math.round(e.t * SR);
    for (let i = 0; i < x.length && start + i < total; i++) { L[start + i] += gl * x[i]; R[start + i] += gr * x[i]; }
  }
  edges(L, 2, 0.05 * SR); edges(R, 2, 0.05 * SR);
  return [L, R];
}
