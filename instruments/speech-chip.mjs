import { SR, rng } from '../lib/audio.mjs';
import { clamp, OnePole, fadeOut, noteSeed } from './synth/dsp.mjs';
import { CHIP_SR } from './speech-chip/lpc.mjs';
import { FRAME, P_MIN, P_MAX, quantizer, quantPeriod, encode, runChip } from './speech-chip/chip.mjs';
import { VOWELS, ONSETS, scaleSpec } from './speech-chip/phonemes.mjs';
import { StepBus, HALF } from './arcade-sfx/blep.mjs';

const PRESETS = {
  aah: { vowel: 'a', vib: [5.2, 0.22, 0.3], attack: 2, release: 2, rough: 0 },
  ooh: { vowel: 'u', vib: [5.2, 0.22, 0.3], attack: 2, release: 2, rough: 0 },
  eee: { vowel: 'i', vib: [5.2, 0.22, 0.3], attack: 2, release: 2, rough: 0 },
  robot: { vowel: 'a', vib: null, attack: 1, release: 1, rough: 0.6 },
  choir: { vowel: 'a', vib: [4.8, 0.18, 0.2], attack: 6, release: 5, rough: 0, voices: 4 },
  vocoder: { vowel: 'a', vib: null, attack: 1, release: 2, rough: 0.25, noise: -4, fScale: 1.08, bScale: 0.7 },
  ba: { onset: 'ba', vowel: 'a', vib: [5.2, 0.15, 0.35], attack: 0, release: 2, rough: 0 },
  da: { onset: 'da', vowel: 'a', vib: [5.2, 0.15, 0.35], attack: 0, release: 2, rough: 0 },
  ka: { onset: 'ka', vowel: 'a', vib: [5.2, 0.15, 0.35], attack: 0, release: 2, rough: 0 },
  sa: { onset: 'sa', vowel: 'a', vib: [5.2, 0.15, 0.35], attack: 0, release: 2, rough: 0 },
};

export const meta = {
  name: 'Sprachchip', range: [36, 72], presets: Object.keys(PRESETS), vowel: Object.keys(VOWELS),
};

// Fixed output gain per preset from random sweeps over all options. The loudest single chip lands
// at -2 dBFS. The vocoder (two chips) and the choir (four panned chips) would stay below -1 dBFS
// even if every chip reached that loudest peak at the same sample.
const GAIN = { aah: 0.95, ooh: 0.95, eee: 0.95, robot: 0.95, choir: 0.29, vocoder: 0.53, ba: 0.95, da: 0.95, ka: 0.95, sa: 0.95 };
// Output RMS the encoder aims for at full velocity, in lattice units, and the DAC scaling.
const R0 = 0.4, OUT_SCALE = 0.55;
const FRAME_SEC = FRAME / CHIP_SR;
const PAD = HALF + 2;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`speech-chip: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// Frame list for one chip: each frame has voicing, spectrum, level (dB) and pitch offset.
function script(P, vowel, holdFrames) {
  const v = P.fScale ? scaleSpec(VOWELS[vowel], P.fScale, P.bScale) : VOWELS[vowel];
  const onset = P.onset ? ONSETS[P.onset](v) : [];
  const nVowel = Math.max(2, holdFrames - onset.length);
  const frames = [...onset];
  for (let j = 0; j < nVowel; j++) {
    const lin = j < P.attack ? (j + 1) / (P.attack + 1) : 1;
    frames.push({ voiced: true, spec: v, db: 20 * Math.log10(lin) });
  }
  for (let j = 0; j < P.release; j++) frames.push({ voiced: true, spec: v, db: 20 * Math.log10((P.release - j) / (P.release + 1)) });
  return frames;
}

function chipVoice({ frames, P, q, rough, midi, bend, dur, vel, clock, vibPhase, r, layerNoise }) {
  const fs = CHIP_SR * clock;
  const enc = frames.map((fr, f) => {
    const t = f * FRAME_SEC;
    let semis = bend * Math.min(1, t / dur);
    if (P.vib) {
      const [rate, depth, delay] = P.vib;
      const grow = clamp((t - delay) / 0.3, 0, 1);
      semis += depth * grow * Math.sin(2 * Math.PI * rate * t + vibPhase);
    }
    const period = quantPeriod(q, clamp(fs / hz(midi + semis), P_MIN, P_MAX));
    // Long periods put all energy into one chirp, so the encoder aims lower to keep the peaks in range.
    const rms = R0 * 10 ** (-(1 - vel)) * 10 ** (fr.db / 20) * Math.min(1, (60 / period) ** 0.4);
    return encode(q, rough, fr, period, rms);
  });
  const make = (list, lfsr) => runChip(list, { q, outScale: OUT_SCALE, lfsr, phase: Math.floor(r() * 40) });
  const y = make(enc, 1 + Math.floor(r() * 32766));
  if (layerNoise !== undefined) {
    const enc2 = frames.map((fr, f) => encode(q, rough, { ...fr, voiced: false }, enc[f].P,
      R0 * 10 ** (-(1 - vel)) * 10 ** ((fr.db + layerNoise) / 20)));
    const z = make(enc2, 1 + Math.floor(r() * 32766));
    for (let i = 0; i < y.length; i++) y[i] += z[i];
  }
  return { y, fs };
}

/**
 * One sung note on the modelled speech chip. `midi` sets the pitch through an integer period at
 * 8 kHz, `velocity` the energy index, `duration` the number of 25 ms frames held. `vowel`
 * overrides the preset's vowel, `bend` glides by that many semitones over the note, `rough` 0..1
 * coarsens all quantisation tables. Returns [L, R].
 */
export function render({
  midi = 48, velocity = 0.8, duration = 0.6, seed = 1, preset = 'aah', vowel, bend = 0, rough,
} = {}) {
  if (preset == null) preset = 'aah';
  const P = typeof preset === 'string' && Object.hasOwn(PRESETS, preset) ? PRESETS[preset] : null;
  if (!P) throw new Error(`speech-chip: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  if (vowel == null) vowel = P.vowel;
  if (typeof vowel !== 'string' || !Object.hasOwn(VOWELS, vowel)) throw new Error(`speech-chip: vowel must be one of ${meta.vowel.join(', ')}, got ${vowel}`);
  midi = num('midi', midi, 48, meta.range[0], meta.range[1]);
  const vel = num('velocity', velocity, 0.8, 0, 1);
  const dur = num('duration', duration, 0.6, FRAME_SEC, 30);
  num('seed', seed, 1, -Infinity, Infinity);
  const b = num('bend', bend, 0, -12, 12);
  const rgh = Math.round(num('rough', rough, P.rough, 0, 1) * 100) / 100;

  const r = rng(noteSeed(seed, [midi], `speech-chip-${preset}`));
  const q = quantizer(rgh);
  const hold = Math.max(1, Math.round(dur / FRAME_SEC));
  const frames = script(P, vowel, hold);
  const nVoices = P.voices || 1;
  const voices = [];
  for (let v = 0; v < nVoices; v++) {
    const clock = nVoices > 1 ? 1 + 0.006 * (2 * r() - 1) : 1;
    const delay = nVoices > 1 ? Math.floor(r() * FRAME) : 0;
    voices.push({ ...chipVoice({ frames, P, q, rough: rgh, midi, bend: b, dur, vel, clock, vibPhase: 2 * Math.PI * r(), r, layerNoise: P.noise }), delay });
  }

  let len = 0;
  for (const v of voices) len = Math.max(len, Math.ceil(PAD + (v.delay + v.y.length) * SR / v.fs) + HALF + 96);
  const L = new Float64Array(len), R = new Float64Array(len);
  voices.forEach((v, i) => {
    const bus = new StepBus(len), step = SR / v.fs;
    let last = 0;
    for (let n = 0; n < v.y.length; n++) {
      if (v.y[n] !== last) { bus.step(PAD + (v.delay + n) * step, v.y[n] - last); last = v.y[n]; }
    }
    bus.step(PAD + (v.delay + v.y.length) * step, -last);
    const y = bus.out();
    const pan = nVoices > 1 ? -0.75 + 1.5 * i / (nVoices - 1) : 0;
    const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    for (let n = 0; n < len; n++) { L[n] += y[n] * gl; R[n] += y[n] * gr; }
  });

  // Output stage: RC low-pass after the DAC, coupling capacitor, speaker amplifier.
  const g = GAIN[preset];
  for (const x of [L, R]) {
    const lp = new OnePole(6000), hp = new OnePole(40);
    for (let n = 0; n < len; n++) x[n] = hp.hp(lp.lp(x[n])) * g;
  }
  fadeOut([L, R], 0.004);
  return [L, R];
}
