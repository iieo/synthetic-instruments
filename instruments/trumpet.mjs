import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { OnePoleLP, OnePoleHP, Biquad, Delay, Wander, phaseDelay, decimate } from './trumpet/dsp.mjs';
import { fingering, NonlinearSlice } from './trumpet/bore.mjs';
import { tuningCents } from './trumpet/tuning.mjs';

// Sounding range of a B-flat trumpet: E3 (all valves, second partial) up to D6.
export const meta = { name: 'Trumpet', range: [52, 86] };

const RHO = 1.2, C = 343;
const BORE_R = 0.0058;                         // valve-section radius in metres
const ZC = RHO * C / (Math.PI * BORE_R ** 2);  // characteristic impedance of the cylinder
const LIP_W = 0.009;                           // width of the lip opening
const NL_LEN = 0.7;                            // narrow tubing in which the wave steepens
const SLICES = 8, SLICE_LEN = 12;
const OS = 2, RS = SR * OS;              // the shock fronts need headroom above the audio band
// Output scale outside the feedback loop, so it does not change tuning: the loudest case over the
// option range (velocity 1, scoop 3) peaks near -3 dBFS.
const OUT_GAIN = 2e-5;
const SCOOP_MAX = 3, FALL_MAX = 12;

export const tune = {
  lam: 0.88,      // lip resonance / played frequency (outward-striking lips play above their resonance)
  qLip: 6, mu: 3, muExp: 2,
  gR: 0.93, bellFc: 1400,
  p0: 800, p1: 15000,
  kick: 1.5, over: 0.5,
  noise: 0.03,
  correct: true,
};

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * velocity: 0..1, or [start, end] for a crescendo/diminuendo across the note.
 * vibrato: undefined = automatic delayed vibrato on long notes, 0 = none, number = depth (1 = about +-15 cents).
 * scoop / fall: semitones of bend into the note (0..3) / falling off at its end (0..12).
 * midi defaults to 60 and is clamped to meta.range.
 * mute: null or 'cup'. tongue: true (hard 't'), a number 0..1 for a softer 'd', or false for a breath attack.
 */
export function render({ midi = 60, velocity = 0.8, duration = 1, seed = 1, vibrato, scoop = 0, fall = 0, mute = null, tongue = true }) {
  const T = tune;
  const [v0, v1] = Array.isArray(velocity) ? velocity : [velocity, velocity];
  for (const [k, x] of Object.entries({ midi, velocity: v0, 'velocity end': v1, duration, seed, scoop, fall })) {
    if (!Number.isFinite(x)) throw new Error(`trumpet: ${k} must be a finite number, got ${x}`);
  }
  if (vibrato !== undefined && !Number.isFinite(vibrato)) throw new Error(`trumpet: vibrato must be a finite number, got ${vibrato}`);
  if (typeof tongue !== 'boolean' && !Number.isFinite(tongue)) throw new Error(`trumpet: tongue must be true, false or a number, got ${tongue}`);
  if (mute && mute !== 'cup') throw new Error(`trumpet: unknown mute ${mute}`);
  midi = Math.max(meta.range[0], Math.min(meta.range[1], midi));
  duration = Math.max(0.02, duration);
  scoop = Math.max(0, Math.min(SCOOP_MAX, scoop));
  fall = Math.max(0, Math.min(FALL_MAX, fall));
  const f = midiToHz(midi);
  const clampV = (v) => Math.max(0.05, Math.min(1, v));
  const { n: partial } = fingering(midi);
  const F = f / partial;
  const w = 2 * Math.PI * f / RS;

  const bellLp = Biquad.lowpass(T.bellFc, 0.6, RS);
  const pedalHp = new OnePoleHP(F * 0.5, RS);
  const filterDelay = phaseDelay([bellLp, pedalHp], w);
  const baseLoop = partial * RS / f;

  // Shift per pascal from the weak-shock speed law c(1 + (gamma + 1) / 2 * p / (rho c^2)), gamma = 1.4.
  const beta = NL_LEN * 1.2 / (RHO * C ** 3) * RS / SLICES;
  const slices = Array.from({ length: SLICES }, () => new NonlinearSlice(SLICE_LEN, beta));
  const fwd = SLICES * SLICE_LEN;
  const ret = new Delay(Math.ceil(baseLoop * 2 ** ((Math.max(scoop, fall) + 1) / 12)) + 8);

  const wl0 = 2 * Math.PI * f * T.lam;
  const mu = T.mu * (262 / f) ** T.muExp;
  let y = 0, yv = 0;

  const tg = tongue === true ? 1 : tongue === false ? 0 : Math.max(0, Math.min(1, tongue));
  const release = 0.03 + 0.02 * (1 - tg), tail = 0.25;
  const fallDur = fall ? Math.min(0.45, 0.25 + 0.03 * fall) : 0;
  const total = Math.round((duration + fallDur + tail) * RS);
  const noteEnd = Math.round(duration * RS);
  const pitchScale = 1 + 0.03 * (midi - 60);
  const pressure = (v) => (T.p0 + T.p1 * v ** 2.2) * pitchScale;
  const rand = rng(seed * 104729 + midi * 13 + 7);
  const wanderP = new Wander(rand, 3, RS), wanderL = new Wander(rand, 1.5, RS);
  const turbHp = new OnePoleHP(400, RS), turbLp = new OnePoleLP(4000, RS);
  const vibDepth = vibrato === undefined ? (duration > 0.7 ? 0.6 : 0) : vibrato;
  const vibRate = 5.2 + 0.6 * (rand() - 0.5);
  const vibDelay = Math.min(0.5, duration * 0.35);

  const outHp = new OnePoleHP(40, RS), outLp = new OnePoleLP(12000, RS);
  const muteF = mute === 'cup' ? [Biquad.peak(250, 1.2, -14, RS), Biquad.peak(1500, 1.5, 5, RS), Biquad.lowpass(3200, 0.7, RS)] : [];
  const out = new Float64Array(total);

  let pm = 0;
  // Tongue release: the lips are already pressed open by the pressure built up behind the tongue,
  // so they start from a displaced position instead of rest.
  const attackTc = 0.006 + 0.024 * (1 - tg);
  y = (0.5 + (T.kick - 0.5) * tg) * pressure(clampV(v0)) / (mu * wl0 * wl0);
  for (let i = 0; i < total; i++) {
    const t = i / RS;
    const vNow = clampV(v0 + (v1 - v0) * smooth(t / duration));
    const P = pressure(vNow);
    const sounding = i < noteEnd;
    let target = sounding ? P * (1 + tg * T.over * Math.exp(-t / 0.025)) : 0;

    // Pitch path in semitones: scoop up into the note, fall off after it.
    let bend = 0;
    if (scoop) bend -= scoop * (1 - smooth(t / 0.14));
    if (fall && !sounding) {
      const q = Math.min(1, (t - duration) / fallDur);
      bend -= fall * q * q;
      target = P * (1 - q) ** 1.5;
    }
    const vib = vibDepth ? vibDepth * smooth((t - vibDelay) / 0.4) * Math.sin(2 * Math.PI * vibRate * t) : 0;
    const corr = T.correct ? tuningCents(midi, vNow) : 0;
    const scale = 2 ** ((bend - corr / 100) / 12);
    const tc = sounding || fall ? attackTc : release;
    pm += (target * (1 + 0.012 * wanderP.tick() + 0.04 * vib) - pm) * (1 - Math.exp(-1 / (tc * RS)));

    const pminus = ret.read(Math.max(2, baseLoop / scale - filterDelay - fwd));
    const h = y > 0 ? y : 0;
    const k = LIP_W * h * Math.sqrt(2 / RHO);
    const a = pm - 2 * pminus;
    let u = 0;
    if (k > 0) {
      const r = Math.sqrt(k * k * ZC * ZC + 4 * Math.abs(a));
      u = 2 * k * a / (k * ZC + r);
    }
    // Turbulence in the lip jet: flow fluctuations proportional to the jet flow.
    u *= 1 + T.noise * turbLp.tick(turbHp.tick(rand() * 2 - 1)) * 3;
    const p = 2 * pminus + ZC * u;
    const pplus = pminus + ZC * u;

    const wl = wl0 * scale * (1 + 0.0015 * wanderL.tick() + 0.06 * vib);
    yv += ((pm - p) / mu - (wl / T.qLip) * yv - wl * wl * y) / RS;
    y += yv / RS;

    let s = pplus;
    for (let j = 0; j < SLICES; j++) s = slices[j].tick(s);
    const lp = bellLp.tick(s);
    ret.write(T.gR * pedalHp.tick(lp));
    let o = outLp.tick(outHp.tick(s - lp));
    for (const mf of muteF) o = mf.tick(o);
    out[i] = o * OUT_GAIN;
  }
  const y48 = decimate(out, OS);
  for (let i = 0; i < 24; i++) y48[i] *= i / 24;
  const fadeN = Math.round(0.005 * SR);
  for (let i = 0; i < fadeN; i++) y48[y48.length - 1 - i] *= i / fadeN;
  return y48;
}
