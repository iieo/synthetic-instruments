import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { clamp, OnePole, noteSeed } from './synth/dsp.mjs';
import { Stairs, HALF } from './toy-keyboard/blep.mjs';
import { WAVES, PRESETS } from './wavetable-chip/waves.mjs';

export const meta = { name: 'Wavetable Chip', range: [28, 96], presets: Object.keys(PRESETS), volumeShift: [0, 1, 2, 3] };

// Chip clock; the wave channel advances one of 32 steps every 2 * P clocks, P = 1..2048,
// so f = CLOCK / (64 P) = 32768 Hz / P.
export const CLOCK = 2 ** 21;
const FRAME = SR / 60;
const PAD = HALF + 2;
const FADE_IN = Math.round(0.0015 * SR), FADE_OUT = Math.round(0.003 * SR);

export const periodFor = (midi) => clamp(Math.round(CLOCK / (64 * midiToHz(midi))), 1, 2048);

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`wavetable-chip: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

function waveAt(P, frame, morph) {
  const w = P.waves;
  if (w.length === 1) return w[0];
  const per = Math.max(1, Math.round(P.frames * 2 ** (3 * (0.5 - morph))));
  const k = Math.floor(frame / per);
  if (P.anim === 'once') return w[Math.min(k, w.length - 1)];
  if (P.anim === 'loop') return w[k % w.length];
  const m = 2 * (w.length - 1), j = k % m;
  return w[j < w.length ? j : m - j];
}

function shiftAt(P, frame) {
  let s = 0;
  for (const [f, v] of P.shifts || []) if (frame >= f) s = v;
  return s;
}

/**
 * One note on the wave channel. `volumeShift` 0..3 is the channel's coarse volume (100 %, 50 %,
 * 25 %, mute), `morph` 0..1 the speed of the animated presets (0.5 = preset speed). `velocity`
 * sets the 3-bit master volume of the console.
 */
export function render({
  midi = 60, velocity = 0.8, duration = 0.5, seed = 1, preset = 'soft-bass', volumeShift = 0, morph = 0.5,
} = {}) {
  if (preset == null) preset = 'soft-bass';
  const P = PRESETS[preset];
  if (!P) throw new Error(`wavetable-chip: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  midi = Math.round(num('midi', midi, 60, ...meta.range));
  const vel = num('velocity', velocity, 0.8, 0, 1);
  const dur = num('duration', duration, 0.5, 0.01, 30);
  num('seed', seed, 1, -Infinity, Infinity);
  const shift0 = Math.round(num('volumeShift', volumeShift, 0, 0, 3));
  const mo = num('morph', morph, 0.5, 0, 1);

  const rand = rng(noteSeed(seed, [midi], `wavetable-chip-${preset}`));
  const master = vel > 0 ? (1 + Math.round(vel * 7)) / 8 : 0;
  let muteFrame = Infinity;
  for (const [f, v] of P.shifts || []) if (shift0 + v >= 3 && f < muteFrame) muteFrame = f;
  if (shift0 >= 3) muteFrame = 0;
  const end = PAD + Math.max(FADE_IN + FADE_OUT, Math.round(Math.min(dur * SR, muteFrame * FRAME)));
  const n = end;
  if (shift0 >= 3 || master === 0) return new Float64Array(n);

  const Tstep = SR * 2 * periodFor(midi) / CLOCK;
  let wave = WAVES[waveAt(P, 0, mo)], pending = wave, shift = shift0 + shiftAt(P, 0);
  const level = (pos) => (wave[pos] >> shift) / 15;
  let dc = 0;
  for (let i = 0; i < 32; i++) dc += level(i) / 32;

  const st = new Stairs(n, dc);
  let pos = 0, frame = 0, nextFrame = PAD + FRAME;
  st.set(PAD, level(0));
  for (let t = PAD + Tstep * rand(); t < n + HALF; t += Tstep) {
    while (nextFrame <= t) {
      frame++;
      pending = WAVES[waveAt(P, frame, mo)];
      const s = Math.min(3, shift0 + shiftAt(P, frame));
      if (s !== shift) { shift = s; st.set(nextFrame, level(pos)); }
      nextFrame += FRAME;
    }
    pos = (pos + 1) & 31;
    if (pos === 0) wave = pending;
    st.set(t, level(pos));
  }
  const y = st.finish();

  // Output stage: coupling capacitor (38 Hz, already charged to the channel's mean level),
  // the thin small-speaker high-pass (70 Hz) and the amplifier's low-pass (12 kHz).
  const cap = new OnePole(38), thin = new OnePole(70), lp = new OnePole(12000);
  cap.x1 = dc;
  const g = P.gain * master;
  for (let i = 0; i < n; i++) {
    let w = 1;
    if (i < PAD) w = 0;
    else if (i < PAD + FADE_IN) w = 0.5 - 0.5 * Math.cos(Math.PI * (i - PAD) / FADE_IN);
    if (i >= n - FADE_OUT) w *= 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / FADE_OUT);
    y[i] = lp.lp(thin.hp(cap.hp(y[i]))) * g * w;
  }
  return y;
}
