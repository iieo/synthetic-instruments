import { SR, rng } from '../lib/audio.mjs';
import { decimate, dcBlock, fadeIn, fadeOut, ceilPeak, noteSeed, clamp } from './synth/dsp.mjs';
import { wheelHz, wheelVoice, wheelFor, drawbarGain, DRAWBAR_SHIFT, WHEELS } from './tonewheel-organ/generator.mjs';
import { SCANNER, scanner, preamp, rotary, ROTOR_MODES } from './tonewheel-organ/effects.mjs';

const PRESETS = {
  jazz: { registration: '888000000', percussion: '3rd', percussionDecay: 'fast', percussionLevel: 'normal', vibrato: 'c3', rotor: 'slow', drive: 0.15, click: 0.6 },
  gospel: { registration: '888800008', percussion: 'off', vibrato: 'c3', rotor: 'slow-fast', drive: 0.35, click: 0.5 },
  rock: { registration: '888000000', percussion: 'off', vibrato: 'off', rotor: 'fast', drive: 0.8, click: 0.8 },
  ballad: { registration: '838000000', percussion: 'off', vibrato: 'c2', rotor: 'slow', drive: 0, click: 0.2 },
  full: { registration: '888888888', percussion: 'off', vibrato: 'v3', rotor: 'fast', drive: 0.4, click: 0.5 },
  clean: { registration: '888000000', percussion: 'off', vibrato: 'off', rotor: 'off', drive: 0, click: 0.5 },
};

export const meta = {
  name: 'Tonewheel Organ',
  range: [36, 96],
  presets: Object.keys(PRESETS),
  percussion: ['off', '2nd', '3rd'],
  percussionDecay: ['fast', 'slow'],
  percussionLevel: ['normal', 'soft'],
  vibrato: Object.keys(SCANNER),
  rotor: ROTOR_MODES,
};

// Fixed output scale. All nine drawbars out at velocity 1 without drive can only reach -1.15 dBFS if
// every wheel and harmonic peaks at the same instant (the in-phase sum of their amplitudes, worst at
// MIDI 36); measured over many seeds the loudest key stays near -2 dBFS. ceilPeak below is a guard only.
const OUT_GAIN = 0.43;
const BUS = 0.22;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`tonewheel-organ: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

function pick(name, v, def, list) {
  if (v === undefined || v === null) return def;
  if (!list.includes(v)) throw new Error(`tonewheel-organ: unknown ${name} ${v}, use one of ${list.join(', ')}`);
  return v;
}

// "888000000" or an array of nine numbers 0..8, from 16' to 1'.
export function parseRegistration(r) {
  const arr = typeof r === 'string' ? [...r.replace(/[\s-]/g, '')].map(Number) : Array.isArray(r) ? r.map(Number) : null;
  if (!arr || arr.length !== 9 || arr.some((x) => !Number.isFinite(x))) {
    throw new Error(`tonewheel-organ: registration must be nine drawbar settings 0..8 like "888000000", got ${r}`);
  }
  return arr.map((x) => clamp(Math.round(x), 0, 8));
}

// Key contacts: one per drawbar busbar. They close a few milliseconds apart and may bounce once;
// every transition is a short raised-cosine ramp. A short ramp lets the free-running wheel start
// at whatever phase it has, which is the key click.
function makeGate(events, rampN) {
  let k = 0, from = 0, to = 0, start = -Infinity;
  return (i) => {
    while (k < events.length && i >= events[k][0]) {
      const cur = level(events[k][0]);
      from = cur; to = events[k][1]; start = events[k][0]; k++;
    }
    return level(i);
  };
  function level(i) {
    const u = (i - start) / rampN;
    if (u >= 1) return to;
    if (u <= 0) return from;
    return from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * u));
  }
}

function contactEvents(rand, onN, offN, spreadN, bounce, fs) {
  const close = onN + Math.round(rand() * spreadN);
  const ev = [[close, 1]];
  if (rand() < bounce) {
    const a = close + Math.round((0.2 + 0.5 * rand()) * 1e-3 * fs);
    const b = a + Math.round((0.08 + 0.25 * rand()) * 1e-3 * fs);
    if (b < offN) ev.push([a, 0.15 * rand()], [b, 1]);
  }
  ev.push([Math.max(offN + Math.round(rand() * spreadN * 0.6), ev[ev.length - 1][0] + 1), 0]);
  return ev;
}

/**
 * One key of a drawbar organ. Organs are not touch sensitive: `velocity` acts like the expression
 * pedal. `registration` is nine drawbars 16' 5 1/3' 8' 4' 2 2/3' 2' 1 3/5' 1 1/3' 1'. Preset values
 * are defaults; every explicit option overrides them. Returns [L, R].
 */
export function render({
  midi = 60, velocity = 0.8, duration = 1, seed = 1, preset = 'jazz', registration, percussion,
  percussionDecay, percussionLevel, vibrato, rotor, switchAt = 0, drive, click, legato = false,
} = {}) {
  const P = PRESETS[pick('preset', preset, 'jazz', meta.presets)];
  midi = Math.round(num('midi', midi, 60, ...meta.range));
  const vel = num('velocity', velocity, 0.8, 0, 1);
  duration = num('duration', duration, 1, 0.02, 60);
  num('seed', seed, 1, -Infinity, Infinity);
  switchAt = num('switchAt', switchAt, 0, 0, 60);
  const bars = parseRegistration(registration ?? P.registration);
  const perc = pick('percussion', percussion, P.percussion, meta.percussion);
  const percDecay = pick('percussionDecay', percussionDecay, P.percussionDecay || 'fast', meta.percussionDecay);
  const percLevel = pick('percussionLevel', percussionLevel, P.percussionLevel || 'normal', meta.percussionLevel);
  const vib = pick('vibrato', vibrato, P.vibrato, meta.vibrato);
  const rot = pick('rotor', rotor, P.rotor, meta.rotor);
  const drv = num('drive', drive, P.drive, 0, 1);
  const clk = num('click', click, P.click, 0, 1);

  const rand = rng(noteSeed(seed, [midi], 'tonewheel-organ'));
  const os = drv > 0 ? 4 : 2, fs = SR * os;
  const rampN = Math.max(2, Math.round((0.00008 + (1 - clk) * 0.005) * fs));
  const spreadN = Math.round((0.6 + 2.4 * clk) * 1e-3 * fs);
  const bounce = 0.6 * clk;
  const onN = Math.round(0.0015 * fs), offN = onN + Math.round(duration * fs);
  const tailN = Math.round(0.035 * fs) + rampN + spreadN;
  const n = offN + tailN;

  const percOn = perc !== 'off' && !legato;
  // With percussion on, the 1' busbar keys the percussion instead of sounding; at normal
  // percussion level the drawbars are dropped by about 3 dB.
  const busGain = BUS * (percOn && percLevel === 'normal' ? 0.708 : 1);

  const phases = new Map();
  const wheelPhase = (w) => { if (!phases.has(w)) phases.set(w, rand()); return phases.get(w); };
  const voices = [];
  const addVoice = (w, amp, gate) => {
    const v = wheelVoice(w), f = wheelHz(w), p0 = 2 * Math.PI * wheelPhase(w);
    const parts = [[1, 1, 0], [2, v.h2, v.p2], [3, v.h3, v.p3]].filter(([k]) => k * f < 0.45 * fs && k * f < 19000);
    for (const [k, a, p] of parts) {
      const dw = 2 * Math.PI * k * f / fs, ph = k * p0 + p;
      voices.push({ c: Math.cos(ph), s: Math.sin(ph), dc: Math.cos(dw), ds: Math.sin(dw), a: a * amp * v.level, gate: makeGate(gate, rampN) });
    }
  };

  const gates = [];
  for (let d = 0; d < 9; d++) gates.push(contactEvents(rand, onN, offN, spreadN, bounce, fs));
  for (let d = 0; d < 9; d++) {
    const g = drawbarGain(bars[d]);
    if (g === 0 || (d === 8 && percOn)) continue;
    const w = wheelFor(midi, DRAWBAR_SHIFT[d]);
    addVoice(w, g, gates[d]);
    // Crosstalk: the wheel sharing the magnet compartment leaks in faintly.
    const partner = w + 48 <= WHEELS ? w + 48 : w - 48;
    if (partner >= 1) addVoice(partner, g * 0.008, gates[d]);
  }

  const bus = new Float64Array(n), percBus = new Float64Array(n);
  for (const v of voices) {
    const { dc, ds, a, gate } = v;
    let c = v.c, s = v.s;
    for (let i = 0; i < n; i++) {
      const gv = gate(i);
      bus[i] += a * gv * s;
      const c2 = c * dc - s * ds; s = s * dc + c * ds; c = c2;
    }
  }

  if (percOn) {
    const w = wheelFor(midi, perc === '2nd' ? 12 : 19);
    const tau = (percDecay === 'fast' ? 0.12 : 0.42) * fs;
    const amp = percLevel === 'normal' ? 1.15 : 0.55;
    const pv = [];
    const v = wheelVoice(w), f = wheelHz(w), p0 = 2 * Math.PI * wheelPhase(w), dw = 2 * Math.PI * f / fs;
    pv.push({ c: Math.cos(p0), s: Math.sin(p0), dc: Math.cos(dw), ds: Math.sin(dw), a: amp * v.level });
    const start = onN;
    for (const q of pv) {
      const gate = makeGate(gates[8], rampN);
      let c = q.c, s = q.s;
      for (let i = 0; i < n; i++) {
        percBus[i] += q.a * gate(i) * Math.exp(-Math.max(0, i - start) / tau) * s;
        const c2 = c * q.dc - s * q.ds; s = s * q.dc + c * q.ds; c = c2;
      }
    }
  }

  let x = SCANNER[vib] ? scanner(bus, fs, SCANNER[vib], rand()) : bus;
  for (let i = 0; i < n; i++) x[i] = (x[i] * busGain + percBus[i] * BUS) * vel;
  if (drv > 0) preamp(x, drv);
  let mono = decimate(x, os);
  dcBlock(mono, 8);
  let out;
  if (rot === 'off') out = [mono, Float64Array.from(mono)];
  else out = rotary(mono, { mode: rot, switchAt, phase: [rand(), rand()] });
  for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= OUT_GAIN;
  fadeIn(out, 0.001);
  fadeOut(out, 0.003);
  ceilPeak(out, -1);
  return out;
}

