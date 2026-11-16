import { SR, rng, buffer, mixInto } from '../../lib/audio.mjs';
import { clamp, OnePole, SVF, fadeOut, noteSeed } from '../synth/dsp.mjs';
import { Stairs, HALF } from './blep.mjs';
import { CLOCK } from './voices.mjs';

// One row per sound, one character per sixteenth: X accent, x normal, . rest.
export const PATTERNS = {
  rock: {
    steps: 16,
    kick: 'X.....x.X.x.....', snare: '....X.......X..x', hat: 'X.x.x.x.X.x.x.x.', rim: '................',
  },
  waltz: {
    steps: 12,
    kick: 'X...........', snare: '....x...x...', hat: 'x.x.x.x.x.x.', rim: '..........x.',
  },
  bossa: {
    steps: 16,
    kick: 'X..xX..xX..xX..xX..xX..xX..xX..x',
    snare: '................................',
    hat: 'xxXxxxXxxxXxxxXxxxXxxxXxxxXxxxXx',
    rim: 'x..x..x...x..x....x..x...x..x...',
  },
  march: {
    steps: 16,
    kick: 'X.......X.......', snare: 'X..xx.x.X.xxX.x.', hat: '................', rim: '....x.......x...',
  },
};

const VOICE = {
  kick: { len: 0.4, gain: 0.86 },
  snare: { len: 0.3, gain: 0.48 },
  hat: { len: 0.12, gain: 0.4 },
  rim: { len: 0.08, gain: 0.345 },
};

// Overall level of the rhythm box: with hits overlapping, the loudest pattern over all tempos and
// seeds peaks near -2 dBFS.
const MIX = 0.86;

const PAD = HALF + 2;

function lfsr17(state) {
  let s = state & 0x1ffff || 1;
  return () => {
    const b = (s ^ (s >> 3)) & 1;
    s = (s >> 1) | (b << 16);
    return s & 1;
  };
}

// Square from an integer divider of the master clock whose period follows freq(t); each half
// period is a whole number of clock ticks.
function squareEdges(st, n, freq, phase0) {
  let t = PAD + phase0, v = 0.5;
  st.set(PAD, v);
  while (t < n) {
    const half = Math.max(1, Math.round(CLOCK / (2 * freq((t - PAD) / SR))));
    t += half * SR / CLOCK;
    v = -v;
    st.set(t, v);
  }
}

function noiseEdges(st, n, rate, bit) {
  const dt = SR / rate;
  for (let t = PAD; t < n; t += dt) st.set(t, bit() ? 0.5 : -0.5);
}

function hit(kind, accent, seed) {
  const rand = rng(seed);
  const n = PAD + Math.round(VOICE[kind].len * SR);
  let a, d, filters, y;
  if (kind === 'kick') {
    const st = new Stairs(n);
    squareEdges(st, n, (t) => 46 + 120 * Math.exp(-t / 0.022), 0);
    y = st.finish();
    a = 0.0008; d = 0.11; filters = [['lp', 900], ['lp', 2400]];
  } else if (kind === 'snare') {
    const sn = new Stairs(n), tone = new Stairs(n);
    noiseEdges(sn, n, 15000, lfsr17(1 + Math.floor(rand() * 131070)));
    squareEdges(tone, n, () => 186, rand());
    const yn = sn.finish(), yt = tone.finish();
    y = yn.map((v, i) => v + 0.45 * yt[i]);
    a = 0.0005; d = 0.065; filters = [['hp', 180], ['lp', 7000]];
  } else if (kind === 'hat') {
    const st = new Stairs(n);
    noiseEdges(st, n, 31000, lfsr17(1 + Math.floor(rand() * 131070)));
    y = st.finish();
    a = 0.0003; d = 0.02; filters = [['hp', 5500], ['hp', 5500], ['lp', 14000]];
  } else {
    const st = new Stairs(n);
    squareEdges(st, n, () => 1650, rand());
    y = st.finish();
    a = 0.0002; d = 0.011; filters = [['svf', 1650, 3], ['hp', 400]];
  }
  const fs = filters.map(([k, fc, q]) => {
    if (k === 'svf') { const f = new SVF(); f.set(fc, q); return (x) => f.tick(x); }
    const f = new OnePole(fc); return k === 'lp' ? (x) => f.lp(x) : (x) => f.hp(x);
  });
  const g = VOICE[kind].gain * (accent ? 1 : 0.62);
  for (let i = 0; i < n; i++) {
    const t = (i - PAD) / SR;
    let v = t <= 0 ? 0 : y[i] * (1 - Math.exp(-t / a)) * Math.exp(-t / d);
    for (const f of fs) v = f(v);
    y[i] = v * g;
  }
  fadeOut([y], 0.003);
  return y;
}

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`toy-keyboard: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

export function renderRhythm({ pattern = 'rock', bpm = 120, bars = 2, seed = 1 } = {}) {
  if (pattern == null) pattern = 'rock';
  const P = typeof pattern === 'string' && Object.hasOwn(PATTERNS, pattern) ? PATTERNS[pattern] : null;
  if (!P) throw new Error(`toy-keyboard: unknown pattern ${pattern}, use one of ${Object.keys(PATTERNS).join(', ')}`);
  bpm = num('bpm', bpm, 120, 60, 200);
  bars = Math.round(num('bars', bars, 2, 1, 16));
  num('seed', seed, 1, -Infinity, Infinity);
  const stepSec = 60 / bpm / 4, total = bars * P.steps;
  const [out] = buffer(total * stepSec + 0.5);
  for (let i = 0; i < total; i++) {
    for (const kind of ['kick', 'snare', 'hat', 'rim']) {
      const row = P[kind], c = row[i % row.length];
      if (c === '.') continue;
      mixInto(out, hit(kind, c === 'X', noteSeed(seed, [i], kind)), Math.round(i * stepSec * SR), MIX);
    }
  }
  return out;
}
