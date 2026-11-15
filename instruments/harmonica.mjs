import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { makeReed, makeHole, simulate, tune } from './harmonica/reed.mjs';
import { Svf, DcBlock, decimator, wander, breakpoints, finite, curveParam, vibratoParam } from './harmonica/dsp.mjs';

// Ten-hole diatonic in C (Richter tuning); other keys transpose via `key`.
export const meta = { name: 'Harmonica', range: [55, 98] };

const BLOW = [0, 4, 7, 12, 16, 19, 24, 28, 31, 36];
const DRAW = [2, 7, 11, 14, 17, 21, 23, 26, 29, 33];
const OS = 4;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Which reed sounds a note and which reed shares its chamber. Notes outside the layout get a
// partner a whole tone below, as on a blow/draw pair of the middle register.
export function layout(midi, key = 60, preferDraw = true) {
  const rel = midi - key;
  const d = DRAW.indexOf(rel), b = BLOW.indexOf(rel);
  let hole = d, draw = true;
  if (d < 0 || (b >= 0 && !preferDraw)) { hole = b; draw = false; }
  if (hole < 0) return { draw: false, partner: midi - 2, hole: -1 };
  return { draw, hole, partner: key + (draw ? BLOW[hole] : DRAW[hole]) };
}

// Gap (rest offset of the tip above the slot) as set on a playable instrument: wider for long reeds.
const gapFor = (f) => clamp(0.55e-3 * (f / 262) ** -0.45, 0.12e-3, 0.8e-3);

// Effective rounding of the slot edge as seen by the flow; short treble reeds pass the edge
// with a smaller excursion, so the same physical radius rounds their aperture more.
const edgeFor = (f) => 0.045e-3 * (f / 440) ** 0.5;

function buildHole(f, fPartner, side) {
  const main = makeReed({ f, side, gap: gapFor(f), edge: edgeFor(f) });
  const part = makeReed({ f: fPartner, side: -side, gap: gapFor(fPartner), edge: edgeFor(fPartner) });
  // The onset of the air jet plucks the blade; without this kick the oscillation would have to
  // grow from numerical noise.
  main.v = -side * 0.2 * main.gap * 2 * Math.PI * f;
  return makeHole([main, part]);
}

const pressureFor = (v) => 120 + 900 * v ** 1.5;

function bendCurve(bend, holdT) {
  if (Array.isArray(bend)) return (t) => breakpoints(bend, t);
  if (!bend) return () => 0;
  const pts = [[0, 0], [0.04, 0], [clamp(holdT * 0.6, 0.06, 0.17), bend]];
  return (t) => breakpoints(pts, t);
}

// Hand cup: 0 = open hands, 1 = sealed cup (dark, muffled, quieter).
function wahCurve(wah, handDepth, rate) {
  const base = Array.isArray(wah) ? (t) => clamp(breakpoints(wah, t), 0, 1) : () => clamp(wah, 0, 1);
  if (!handDepth) return base;
  return (t) => clamp(base(t) + handDepth * (0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t)) * Math.min(1, t / 0.25), 0, 1);
}

// Fixed output scale: the loudest single note at velocity 1 peaks near -3 dBFS.
const OUT_GAIN = 0.435;

// Fit to the steady-state output level of this model across the range, so that equal velocity
// gives roughly equal loudness (the raw radiated pressure rises with frequency).
const levelFor = (f) => OUT_GAIN * 0.3 * (f / 440) ** -0.1;

const W = 'harmonica.render';

export function render({
  midi = 60, velocity = 0.8, duration = 1, seed = 1, bend = 0, vibrato,
  wah = 0, key = 60, attack, draw, breathiness = 0,
} = {}) {
  // Notes follow the key; keys from C3 to C5 cover the usual low to high harps.
  key = clamp(Math.round(finite(W, 'key', key)), 48, 72);
  const lo = meta.range[0] + key - 60, hi = meta.range[1] + key - 60;
  const notes = (Array.isArray(midi) ? midi : [midi]).map((m) => clamp(finite(W, 'midi', m), lo, hi));
  if (notes.length === 0) throw new Error(`${W}: midi must be a number or a non-empty array`);
  const r = rng(((finite(W, 'seed', seed) * 7919) ^ (notes[0] * 104729)) >>> 0);
  const v = clamp(finite(W, 'velocity', velocity), 0.02, 1);
  duration = Math.max(0, finite(W, 'duration', duration));
  bend = curveParam(W, 'bend', bend);
  wah = curveParam(W, 'wah', wah);
  breathiness = clamp(finite(W, 'breathiness', breathiness), 0, 1);
  if (attack !== undefined) attack = Math.max(0, finite(W, 'attack', attack));
  if (draw !== undefined && typeof draw !== 'boolean') throw new TypeError(`${W}: draw must be true or false, got ${String(draw)}`);
  const vib = vibratoParam(W, vibrato, { rate: 5.2, depth: 0.6, types: ['both', 'throat', 'hand'] });
  const vibDepth = vib ? vib.depth : 0, vibRate = vib ? vib.rate : 5.2;
  const vibType = vib ? vib.type : 'none';
  const tAtk = attack ?? 0.075 - 0.055 * v;
  const tRel = 0.045;
  const nHold = Math.max(1, Math.round(duration * SR));
  const n = nHold + Math.round(0.3 * SR);

  const inDraw = notes.every((m) => DRAW.includes(m - key)), inBlow = notes.every((m) => BLOW.includes(m - key));
  const isDraw = draw ?? (inDraw ? true : inBlow ? false : layout(notes[0], key).draw);
  const side = isDraw ? -1 : 1;
  const Pnom = pressureFor(v);

  const breath = wander(r, 3, n);
  const P = new Float64Array(n);
  const throatDepth = vibType === 'hand' ? 0 : vibDepth;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = t < tAtk ? 0.5 - 0.5 * Math.cos((Math.PI * t) / tAtk) : 1;
    const rr = i < nHold ? 1 : Math.max(0, 1 - (i - nHold) / (tRel * SR));
    const rel = 0.5 - 0.5 * Math.cos(Math.PI * rr);
    // Throat vibrato pulses the breath pressure; pitch and timbre follow through the reed.
    const throat = 1 + 0.18 * throatDepth * Math.sin(2 * Math.PI * vibRate * t) * Math.min(1, t / 0.3);
    P[i] = side * Pnom * a * rel * (1 + 0.02 * breath[i]) * throat;
  }

  const bendAt = bendCurve(bend, duration);
  // The vocal tract tuned near the bent pitch loads the sounding reed reactively; its net effect
  // is modelled as a lower effective stiffness of that reed.
  const kAt = (t) => 2 ** (bendAt(t) / 6);
  const flow = new Float64Array(n * OS);
  for (const m of notes) {
    const l = layout(m, key, isDraw);
    const f = midiToHz(m) * 2 ** (((2 * r() - 1) * 2) / 1200);
    const fPart = midiToHz(l.hole >= 0 && l.draw === isDraw ? l.partner : m - 2);
    const build = (fr) => buildHole(fr, fPart, side);
    const hole = build(tune(build, f, side * Pnom, SR, OS, `h${fPart.toFixed(2)}${side}`));
    const fl = simulate(hole, P, SR, OS, kAt);
    for (let i = 0; i < fl.length; i++) flow[i] += fl[i];
  }

  // Radiated pressure of a small source is proportional to the time derivative of its volume flow.
  const dU = new Float64Array(flow.length);
  for (let i = 1; i < flow.length; i++) dU[i] = (flow[i] - flow[i - 1]) * SR * OS;
  const x = decimator(OS)(dU);

  const f0 = midiToHz(notes[0]);
  // Loudness reference: the sustained signal after the fixed cover-plate filtering.
  let xs = 0, us = 0;
  const c1 = new Svf(), c2 = new Svf();
  c1.set(6500, 0.55); c2.set(9500, 0.6);
  for (let i = 0; i < nHold; i++) { const q = c2.tick(c1.tick(x[i])); xs += q * q; us += Math.abs(flow[i * OS]); }
  xs = Math.sqrt(xs / nHold) || 1; us = us / nHold || 1;
  const gain = levelFor(f0) * (0.35 + 0.65 * v) * notes.length ** 0.2;

  const handDepth = vibType === 'throat' ? 0 : vibDepth * 0.7;
  const wahAt = wahCurve(wah, handDepth, vibRate);
  const cup = new Svf(), formant = new Svf(), noiseBp = new Svf();
  noiseBp.set(2800, 0.7);
  const cover = new Svf(), cover2 = new Svf(), dc = new DcBlock(50);
  cover.set(6500, 0.55);
  cover2.set(9500, 0.6);
  const noiseGain = 0.05 + 0.25 * breathiness;
  const y = new Float64Array(n);
  let envU = 0, w = 0, bd = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 15) === 0) {
      w = wahAt(t);
      cup.set(480 + 2800 * (1 - w) ** 2, 0.8 + 2.4 * w);
      bd = Math.min(1, Math.abs(bendAt(t)));
      formant.set(f0 * 2 ** (-Math.abs(bendAt(t)) / 12), 2 + 3 * bd);
    }
    // Breath noise: turbulence in the slot jets, following the flow (squared for jet noise).
    envU += 0.004 * (Math.abs(flow[i * OS]) / us - envU);
    const noise = noiseBp.tick((2 * r() - 1) * envU * envU) * noiseGain * 3;
    let s = cover2.tick(cover.tick(x[i] / xs + noise));
    cup.tick(s);
    s = (1 - w) * s + w * 0.8 * cup.lp * cup.k;
    // A bent note is sung into: the tract resonance sits on the fundamental and darkens the tone.
    formant.tick(s);
    s = s * (1 - 0.4 * bd) + 0.7 * bd * formant.bp * formant.k;
    y[i] = dc.tick(s) * gain;
  }
  // The level is set on the sustain; a note whose onset or bend transition stands far above it
  // is scaled down as a whole. The cap leaves out the chord factor, so a chord peaks no higher
  // than the loudest single note.
  const cap = (5 * gain) / notes.length ** 0.2;
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(y[i]));
  if (pk > cap) { const s = cap / pk; for (let i = 0; i < n; i++) y[i] *= s; }
  const fade = Math.round(0.004 * SR);
  for (let i = 0; i < fade; i++) { y[n - 1 - i] *= i / fade; y[i] *= i / fade; }
  return y;
}
