import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { seedInt } from './synth/dsp.mjs';
import { OnePoleLP, OnePoleHP, Biquad, Delay, Wander, phaseDelay, decimate } from './trumpet/dsp.mjs';
import { NonlinearSlice } from './trumpet/bore.mjs';
import { PRESETS, fingering, foldIntoRange } from './tuba/bore.mjs';
import { tuningCents } from './tuba/tuning.mjs';

// Union of the preset ranges: tuba D1 to F4, euphonium B1 to C5 (sounding pitch). Notes outside
// the chosen preset's own range (meta.ranges) are folded into it by octaves.
export const meta = {
  name: 'Tuba',
  presets: Object.keys(PRESETS),
  range: [26, 72],
  ranges: Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, [...p.range]])),
};

const RHO = 1.2, C = 343;
const SLICES = 8, SLICE_LEN = 12;
const OS = 2, RS = SR * OS;
const TONGUE_KICK = 1.5, TONGUE_OVER = 0.4;
const VIB_MAX = 2;

export const tune = { correct: true };

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function num(name, x, fallback) {
  if (x === undefined || x === null) return fallback;
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`tuba: ${name} must be a finite number, got ${x}`);
  return x;
}

/**
 * preset: 'tuba' (default) or 'euphonium'. midi is folded by octaves into the preset's range.
 * velocity: 0..1, or [start, end] for a crescendo/diminuendo across the note.
 * vibrato: undefined = automatic on long notes, 0 = none, number 0..2 = depth.
 * tongue: true (hard 't'), a number 0..1 for a softer 'd', or false for a breath attack.
 */
export function render({ midi, velocity = 0.8, duration = 1, seed = 1, preset = 'tuba', vibrato, tongue = true } = {}) {
  preset = preset ?? 'tuba';
  const P = Object.hasOwn(PRESETS, preset) ? PRESETS[preset] : null;
  if (!P) throw new Error(`tuba: unknown preset ${preset} (use ${Object.keys(PRESETS).join(', ')})`);
  midi = num('midi', midi, P.defaultMidi);
  duration = clamp(num('duration', duration, 1), 0.02, 30);
  seed = num('seed', seed, 1);
  let v0, v1;
  if (Array.isArray(velocity)) {
    const vs = velocity.length ? velocity : [0.8];
    v0 = num('velocity start', vs[0], 0.8); v1 = num('velocity end', vs[vs.length - 1], v0);
  } else v0 = v1 = num('velocity', velocity, 0.8);
  const clampV = (v) => clamp(v, 0.05, 1);
  v0 = clampV(v0); v1 = clampV(v1);
  if (vibrato !== undefined && vibrato !== null) vibrato = clamp(num('vibrato', vibrato, 0), 0, VIB_MAX);
  else vibrato = undefined;
  if (typeof tongue !== 'boolean' && !(typeof tongue === 'number' && Number.isFinite(tongue))) {
    throw new Error(`tuba: tongue must be true, false or a number, got ${tongue}`);
  }

  midi = foldIntoRange(clamp(midi, meta.range[0], meta.range[1]), P.range);
  const f = midiToHz(midi);
  const { n: partial } = fingering(midi, P.pedal);
  const F = f / partial;
  const w = 2 * Math.PI * f / RS;

  const ZC = RHO * C / (Math.PI * P.boreR ** 2);
  const bellLp = Biquad.lowpass(P.bellFc, P.bellQ, RS);
  const pedalHp = new OnePoleHP(F * 0.5, RS);
  const filterDelay = phaseDelay([bellLp, pedalHp], w);
  const baseLoop = partial * RS / f;

  // Weak-shock speed law c(1 + (gamma + 1) / 2 * p / (rho c^2)), gamma = 1.4, spread over the slices.
  const beta = P.nlLen * 1.2 / (RHO * C ** 3) * RS / SLICES;
  const slices = Array.from({ length: SLICES }, () => new NonlinearSlice(SLICE_LEN, beta));
  const fwd = SLICES * SLICE_LEN;
  const ret = new Delay(Math.ceil(baseLoop * 1.1) + 8);

  const wl0 = 2 * Math.PI * f * 0.88;
  // Lip stiffness per area (mu * wl^2) is held constant over the range, so the static opening per
  // pascal is the same for every note; only the moving mass changes with pitch.
  const mu = P.stiff / (wl0 * wl0);
  let y, yv = 0;

  const tg = tongue === true ? 1 : tongue === false ? 0 : clamp(tongue, 0, 1);
  const release = 0.04 + 0.03 * (1 - tg);
  // Low notes ring longer in the long tube; give the tail time to die away before the fade.
  const tail = 0.3 + 10 / f;
  const total = Math.round((duration + tail) * RS);
  const noteEnd = Math.round(duration * RS);
  const lo = P.range[0];
  const pitchScale = 1 + P.pSlope * (midi - lo);
  const pressure = (v) => (P.p0 + P.p1 * v ** 2.2) * pitchScale;
  const rand = rng((Math.imul(seedInt(seed), 104729) + Math.round(midi * 13) + (preset === 'euphonium' ? 7919 : 7)) >>> 0);
  const wanderP = new Wander(rand, 2.5, RS), wanderL = new Wander(rand, 1.2, RS);
  const turbHp = new OnePoleHP(P.noiseLo, RS), turbLp = new OnePoleLP(P.noiseHi, RS);
  const vibDepth = vibrato === undefined ? (duration > 0.8 ? P.vib : 0) : vibrato;
  const vibRate = P.vibRate + 0.5 * (rand() - 0.5);
  const vibDelay = Math.min(0.6, duration * 0.4);

  const hp1 = new OnePoleHP(14, RS), hp2 = new OnePoleHP(14, RS), outLp = new OnePoleLP(9000, RS);
  const out = new Float64Array(total);

  let pm = 0, damp = 1;
  const attackTc = 0.01 + 0.03 * (1 - tg);
  y = (0.5 + (TONGUE_KICK - 0.5) * tg) * pressure(v0) / P.stiff;
  // The simple complementary bell filter radiates the deepest notes about 13 dB weaker than the
  // top of the range, while players push far more air into low notes. A per-note gain outside the
  // feedback loop restores part of that (it changes neither tone nor tuning).
  const kOut = P.gain * 1e-4 * (midiToHz(P.range[1]) / f) ** P.tilt;
  for (let i = 0; i < total; i++) {
    const t = i / RS;
    const vNow = clampV(v0 + (v1 - v0) * smooth(t / duration));
    const pTarget = pressure(vNow);
    const sounding = i < noteEnd;
    const target = sounding ? pTarget * (1 + tg * TONGUE_OVER * Math.exp(-t / 0.03)) : 0;
    const vib = vibDepth ? vibDepth * smooth((t - vibDelay) / 0.5) * Math.sin(2 * Math.PI * vibRate * t) : 0;
    const corr = tune.correct ? tuningCents(preset, midi, vNow) : 0;
    const scale = 2 ** (-corr / 1200);
    pm += (target * (1 + 0.01 * wanderP.tick() + 0.03 * vib) - pm) * (1 - Math.exp(-1 / ((sounding ? attackTc : release) * RS)));
    // After the release the closed, relaxed lips absorb part of each returning wave.
    if (!sounding) damp += (0.6 - damp) * (1 - Math.exp(-1 / (0.05 * RS)));

    const pminus = damp * ret.read(Math.max(2, baseLoop / scale - filterDelay - fwd));
    const h = y > 0 ? y : 0;
    const k = P.lipW * h * Math.sqrt(2 / RHO);
    const a = pm - 2 * pminus;
    let u = 0;
    if (k > 0) {
      const r = Math.sqrt(k * k * ZC * ZC + 4 * Math.abs(a));
      u = 2 * k * a / (k * ZC + r);
    }
    u *= 1 + P.noise * turbLp.tick(turbHp.tick(rand() * 2 - 1)) * 3;
    const p = 2 * pminus + ZC * u;
    const pplus = pminus + ZC * u;

    const wl = wl0 * scale * (1 + 0.0012 * wanderL.tick() + 0.05 * vib);
    yv += ((pm - p) / mu - (wl / P.qLip) * yv - wl * wl * y) / RS;
    y += yv / RS;

    let s = pplus;
    for (let j = 0; j < SLICES; j++) s = slices[j].tick(s);
    const lp = bellLp.tick(s);
    ret.write(P.gR * pedalHp.tick(lp));
    out[i] = outLp.tick(hp2.tick(hp1.tick(s - lp + P.lowRad * lp))) * kOut;
  }
  const y48 = decimate(out, OS);
  const fin = Math.min(y48.length, 24), fout = Math.min(y48.length, Math.round(0.006 * SR));
  for (let i = 0; i < fin; i++) y48[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fin);
  for (let i = 0; i < fout; i++) y48[y48.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fout);
  y48[0] = 0; y48[y48.length - 1] = 0;
  return y48;
}
