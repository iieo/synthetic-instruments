import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { OnePoleLP, OnePoleHP, Biquad, Delay, Wander, phaseDelay } from './trumpet/dsp.mjs';
import { decimate, seedInt } from './synth/dsp.mjs';
import { PRESETS } from './oboe/presets.mjs';
import { tuningCents } from './oboe/tuning.mjs';

// Sounding range: oboe B-flat 3 to A6, English horn E3 to C6. Both presets play the whole span,
// beyond their nominal range the model simply lengthens or shortens the bore.
export const meta = {
  name: 'Oboe',
  range: [52, 93],
  presets: Object.keys(PRESETS),
  ranges: Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, p.nominal])),
};

const OS = 2, RS = SR * OS;
const C = 343;
const DUR_MAX = 30, VIB_MAX = 1.5;
// Output scale outside the feedback loop (does not change tuning). Calibrated so that the loudest
// note over all presets and options peaks near -3 dBFS.
const OUT_GAIN = { oboe: 2.95, 'english-horn': 2.8 };

// Model switches for calibration and parameter sweeps: `correct` applies the tuning table, `over`
// overrides preset fields.
export const tune = { correct: true, over: null };

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Flow through the reed slit for opening h (0..1, scaled by the reed's characteristic number zeta)
// when the bore pair presents impedance 1/2: solve u = k sign(D) sqrt|D|, D = A - u/2, k = zeta h,
// in closed form (quadratic in u).
function reedFlow(A, k) {
  if (k <= 0) return 0;
  const k2 = k * k, b = 0.5 * k2, c = k2 * Math.abs(A);
  const u = 2 * c / (b + Math.sqrt(b * b + 4 * c));
  return A >= 0 ? u : -u;
}

function num(name, x, def) {
  if (x === undefined || x === null) return def;
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`oboe: ${name} must be a finite number, got ${x}`);
  return x;
}

// Resonance the reed plays on: the first, or the second with the octave key open. In the third
// register the model shortens the bore and plays its first resonance again.
function modeOf(p, midi) {
  const m = Math.round(midi);
  return m >= p.second && m < p.third ? 2 : 1;
}

/**
 * preset: 'oboe' | 'english-horn'.
 * velocity 0..1 (breath pressure), duration in seconds (0.02..30).
 * vibrato: undefined = automatic delayed vibrato on notes longer than 0.6 s, 0 = none, 0..1.5 = depth.
 * articulation: 'tongue' (default) or 'legato'. breath: amount of turbulence noise 0..2 (default 1).
 */
export function render({ midi = 69, velocity = 0.8, duration = 1, seed = 1, preset = 'oboe', vibrato, articulation = 'tongue', breath = 1 } = {}) {
  if (!Object.hasOwn(PRESETS, preset)) throw new Error(`oboe: unknown preset ${preset} (use ${meta.presets.join(', ')})`);
  const P = tune.over ? { ...PRESETS[preset], ...tune.over } : PRESETS[preset];
  if (articulation !== 'tongue' && articulation !== 'legato') throw new Error(`oboe: articulation must be 'tongue' or 'legato', got ${articulation}`);
  midi = Math.max(meta.range[0], Math.min(meta.range[1], num('midi', midi, 69)));
  const v = Math.max(0.05, Math.min(1, num('velocity', velocity, 0.8)));
  duration = Math.max(0.02, Math.min(DUR_MAX, num('duration', duration, 1)));
  const sd = seedInt(num('seed', seed, 1));
  const vibIn = num('vibrato', vibrato, undefined);
  const vibDepth = vibIn === undefined ? (duration > 0.6 ? 0.7 : 0) : Math.max(0, Math.min(VIB_MAX, vibIn));
  const breathAmt = Math.max(0, Math.min(2, num('breath', breath, 1)));

  const f = midiToHz(midi);
  const mode = modeOf(P, midi);
  const w = 2 * Math.PI * f / RS;

  // Bore: main branch (reed to open end, with register hole) in parallel with a short open branch of
  // the length of the missing cone tip. Resonances lie at k (L + x0) = n pi, all harmonics. In the
  // top register the tip is limited to a fraction of the sounding length.
  const endLp = new OnePoleLP(P.latticeFc + 25 * (midi - P.nominal[0]), RS);
  const endHp = new OnePoleHP(30, RS);
  const g = P.wallLoss - 0.004 * (mode - 1);
  const corr = tune.correct ? tuningCents(preset, midi, v) : 0;
  const stretch = 2 ** (corr / 1200);
  const total = mode * RS / (2 * f) * stretch;           // one-way length of the whole cone
  const apexLoss = 0.997;
  const apexLp = new OnePoleLP(9000, RS);
  const ta = Math.min(P.x0 / C * RS, P.apexMax * total);
  const tau = phaseDelay([endLp, endHp], w) + phaseDelay([apexLp], w);
  const main = total - ta - tau / 2;
  // Register hole near the pressure node of the wanted mode closest to the reed.
  const d1 = mode === 1 ? main / 2 : Math.max(2, (RS / (2 * f) * stretch - ta) * P.holePos);
  const d2 = Math.max(2, main - d1);
  const holeK = mode === 1 ? 0 : P.holeK * (2 * Math.PI * f / mode) / RS;

  const vibRateR = rng(sd * 7 + 13);
  const A = new Delay(Math.ceil(2 * ta) + 8);
  const M1f = new Delay(Math.ceil(d1) + 8), M1b = new Delay(Math.ceil(d1) + 8);
  const M2f = new Delay(Math.ceil(d2 * 1.05) + 8), M2b = new Delay(Math.ceil(d2 * 1.05) + 8);
  let uh = 0;

  const tongued = articulation === 'tongue';
  const release = tongued ? 0.045 : 0.05, ring = 0.25;
  const n = Math.round((duration + release + ring) * RS);
  const noteEnd = Math.round(duration * RS), relN = Math.round(release * RS);
  // Tongued: the breath pressure builds up behind the tongue, which then leaves the reed within a
  // few milliseconds. Slurred: no tongue, the lips let the reed open more gently while the pressure
  // rises.
  const atkN = Math.round((tongued ? 0.012 : 0.03) * RS);
  const tongueAt = tongued ? Math.round(P.tongueAt * RS) : 0, tongueN = Math.round((tongued ? P.tongueN : 0.012) * RS);
  // Players push extra breath into the first few tens of milliseconds; the weak lowest resonance of
  // the cone needs it to speak promptly. More for low notes, less when slurred.
  const kick = P.kick * Math.max(0, Math.min(1, (P.nominal[0] + 24 - midi) / 18)) * (tongued ? 1 : 0.6);

  const gamma0 = P.gamma[0] + (P.gamma[1] - P.gamma[0]) * v;
  const zeta0 = P.zeta[0] + (P.zeta[1] - P.zeta[0]) * v;

  const rand = rng((sd * 104729 + Math.round(midi * 31) + 17) >>> 0);
  const turbHp = new OnePoleHP(700, RS), turbLp = new OnePoleLP(5000, RS);
  const wanderG = new Wander(rand, 1.5, RS), wanderP = new Wander(rand, 0.7, RS);
  const vibRate = 5.0 + 0.6 * vibRateR();
  const vibDelay = Math.min(0.45, duration * 0.3);

  const formants = P.formant.map(([fc, q, db]) => Biquad.peak(fc, q, db, RS));
  const bulb = P.bulb ? Biquad.peak(P.bulb[0], P.bulb[1], P.bulb[2], RS) : null;
  const outHp = new OnePoleHP(P.radHp, RS), outLp = new OnePoleLP(P.lp, RS), outLp2 = new OnePoleLP(P.lp * 1.6, RS);
  const breathLp = new OnePoleLP(3500, RS), breathHp = new OnePoleHP(900, RS);

  const out = new Float64Array(n);
  let prevVel = 0, dpPrev = 0;
  const reed = Biquad.lowpass(P.reedRatio * f, P.reedQ, RS);
  for (let i = 0; i < n; i++) {
    const t = i / RS;
    let env = i < atkN ? 0.5 - 0.5 * Math.cos(Math.PI * i / atkN) : 1;
    if (i >= noteEnd) env *= i - noteEnd >= relN ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (i - noteEnd) / relN);
    const vib = vibDepth ? vibDepth * smooth((t - vibDelay) / 0.5) * Math.sin(2 * Math.PI * vibRate * t) : 0;
    const nz = turbLp.tick(turbHp.tick(rand() * 2 - 1));
    const gamma = env * gamma0 * (1 + 0.01 * wanderG.tick() + 0.1 * vib + kick * Math.exp(-t / P.kickT));
    const open = smooth((i - tongueAt) / tongueN);
    const pitch = 1 + 0.0005 * wanderP.tick() + 0.016 * vib;

    const a1 = M1b.read(d1);
    const a2 = -apexLoss * apexLp.tick(A.read(2 * ta));
    // Reed blades with the lips on them: a damped mass-spring whose resonance the embouchure sets a
    // little above the played note, driven by the pressure difference of the previous sample.
    // xr is the closing displacement, 1 = closed.
    const xr = reed.tick(dpPrev);
    const h = Math.max(0, 1 - xr) * open;
    let u = reedFlow(gamma - a1 - a2, zeta0 * h);
    u *= 1 + 0.06 * breathAmt * nz * Math.min(1, 2 * gamma);
    const p = a1 + a2 + 0.5 * u;
    dpPrev = gamma - p;
    M1f.write(p - a1);
    A.write(p - a2);

    const b1 = M1f.read(d1), b2 = M2b.read(d2 / pitch);
    const pj = (b1 + b2 - 0.5 * uh) / (1 + 0.5 * holeK);
    uh = 0.9995 * uh + holeK * pj;
    M1b.write(pj - b1);
    M2f.write(pj - b2);

    const x = M2f.read(d2 / pitch);
    const refl = -g * endHp.tick(endLp.tick(x));
    M2b.write(refl);
    // Bell: flow leaving the end (incoming minus reflected wave). Tone holes: the part of the wave the
    // lattice does not reflect (x + refl, mostly above the cutoff) leaks out and radiates as well.
    const vel = x - refl + P.leak * (x + refl / g);
    let o = vel - prevVel;
    prevVel = vel;
    o += 0.004 * breathAmt * breathLp.tick(breathHp.tick(rand() * 2 - 1)) * env * Math.min(1, gamma0 * 2);
    for (const fm of formants) o = fm.tick(o);
    if (bulb) o = bulb.tick(o);
    out[i] = outLp2.tick(outLp.tick(outHp.tick(o)));
  }
  const y = decimate(out, OS);
  // The radiation filters favour high notes by about 6 dB per octave; take most of that back.
  const gain = OUT_GAIN[preset] * (440 / f) ** 0.85 * (0.35 + 0.65 * v);
  for (let i = 0; i < y.length; i++) y[i] *= gain;
  const fi = Math.round(0.001 * SR), fo = Math.round(0.02 * SR);
  for (let i = 0; i < fi; i++) y[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
  for (let i = 0; i < fo; i++) y[y.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fo);
  y[0] = 0; y[y.length - 1] = 0;
  return y;
}
