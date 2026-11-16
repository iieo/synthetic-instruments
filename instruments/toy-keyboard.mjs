import { SR, rng } from '../lib/audio.mjs';
import { clamp, OnePole, SVF, fadeOut, noteSeed } from './synth/dsp.mjs';
import { Stairs, HALF } from './toy-keyboard/blep.mjs';
import { CLOCK, TOP, DIVIDERS, PRESETS, SAMPLES } from './toy-keyboard/voices.mjs';
import { renderRhythm as rhythm, PATTERNS } from './toy-keyboard/rhythm.mjs';

export const meta = {
  name: 'Toy Keyboard', range: [36, 96], presets: Object.keys(PRESETS),
  vibrato: ['on', 'off'], sustain: ['off', 'on'], patterns: Object.keys(PATTERNS),
};

const PAD = HALF + 2;
// Fixed vibrato of the master clock: triangle LFO, 5.8 Hz, +-0.55 % (about +-9.5 cents).
const VIB_RATE = 5.8, VIB_DEPTH = 0.0055;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`toy-keyboard: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

function onOff(name, v, def) {
  if (v === undefined || v === null) return def;
  if (v === true || v === 'on') return true;
  if (v === false || v === 'off') return false;
  throw new Error(`toy-keyboard: ${name} must be 'on' or 'off', got ${v}`);
}

export function makeFilter([kind, fc, q]) {
  if (kind === 'lp') { const f = new OnePole(fc); return (x) => f.lp(x); }
  if (kind === 'hp') { const f = new OnePole(fc); return (x) => f.hp(x); }
  const f = new SVF(); f.set(fc, q); return (x) => f.tick(x);
}

/**
 * One key. `preset` picks the voice, `vibrato` ('on'/'off', default from the preset) switches the
 * clock vibrato, `sustain` ('off'/'on') the long release. The keyboard has no touch response:
 * `velocity` acts like the volume slider.
 */
export function render({
  midi = 60, velocity = 0.8, duration = 0.5, seed = 1, preset = 'organ', vibrato, sustain = 'off',
} = {}) {
  if (preset == null) preset = 'organ';
  const P = typeof preset === 'string' && Object.hasOwn(PRESETS, preset) ? PRESETS[preset] : null;
  if (!P) throw new Error(`toy-keyboard: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  midi = Math.round(num('midi', midi, 60, ...meta.range));
  const vel = num('velocity', velocity, 0.8, 0, 1);
  const dur = num('duration', duration, 0.5, 0.01, 30);
  num('seed', seed, 1, -Infinity, Infinity);
  const vib = onOff('vibrato', vibrato, P.vibrato);
  const sus = onOff('sustain', sustain, false);

  const rand = rng(noteSeed(seed, [midi], `toy-keyboard-${preset}`));
  const pc = midi % 12, oct = (TOP + pc - midi) / 12;
  const D0 = DIVIDERS[pc] * 2 ** oct / 32;
  const { a, d, s, r, rs } = P.env, rel = sus ? rs : r;
  const echo = P.echo || { period: 0, fall: 0, count: 1 };
  const heldEnd = s > 0 ? Infinity : (echo.count - 1) * echo.period + 8 * d;
  const gate = Math.min(dur, heldEnd);
  const n = PAD + Math.round((gate + 5 * rel + 0.03) * SR);

  const env = (t) => {
    if (t <= 0) return 0;
    let e = 0, g = 1;
    for (let i = 0; i < echo.count; i++, g *= echo.fall) {
      const u = t - i * echo.period;
      if (u <= 0) break;
      e += g * (1 - Math.exp(-u / a)) * (s + (1 - s) * Math.exp(-u / d));
    }
    return t > gate ? e * Math.exp(-(t - gate) / rel) : e;
  };

  const st = new Stairs(n);
  const sample = P.sample ? SAMPLES[P.sample] : null;
  const table = P.table;
  const dPhi = CLOCK / SR;
  let phi = 0, q = Math.floor(rand() * 64), D = D0, next = D0 * rand(), lfo = rand();
  const step = (t) => {
    q = (q + 1) & 63;
    if (sample) {
      const L = Math.min(15, Math.round(15 * env((t - PAD) / SR)));
      st.set(t, Math.floor((sample[q & 31] - 8) * L / 16));
    } else st.set(t, table[q]);
    if (P.drop) {
      const u = Math.max(0, (t - PAD) / SR);
      D = D0 * (1 + Math.round(16 * (2 ** Math.min(4, u / P.drop) - 1)) / 16);
    }
  };
  if (!sample) st.v = table[q];
  for (let i = 1; i < n; i++) {
    let rate = dPhi;
    if (vib) {
      lfo += VIB_RATE / SR; if (lfo >= 1) lfo -= 1;
      rate *= 1 + VIB_DEPTH * (lfo < 0.5 ? 4 * lfo - 1 : 3 - 4 * lfo);
    }
    const p1 = phi + rate;
    while (next <= p1) { step(i - 1 + (next - phi) / rate); next += D; }
    phi = p1;
  }
  const y = st.finish();

  if (!sample) for (let i = 0; i < n; i++) y[i] *= env((i - PAD) / SR);
  const filters = P.filters.map(makeFilter);
  const out = new OnePole(20), g = P.gain * vel;
  for (let i = 0; i < n; i++) {
    let v = y[i];
    for (const f of filters) v = f(v);
    y[i] = out.hp(v) * g;
  }
  fadeOut([y], 0.004);
  return y;
}

/**
 * The rhythm box: `pattern` 'rock' | 'waltz' | 'bossa' | 'march', `bpm` 60..200, `bars` 1..16.
 */
export function renderRhythm(opts = {}) {
  return rhythm(opts);
}
