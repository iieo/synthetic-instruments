import { SR, midiToHz, rng } from '../lib/audio.mjs';
import {
  freeFreeShape, hertzPulse, contactTime, addMode, resonate, decayLength, fadeTail,
  contactNoise, jitter, clamp, airRolloff, lerp, logInterp, strikeGain, noteMidi, finite,
} from './mallets/core.mjs';

export const meta = { name: 'Vibraphone', range: [53, 89] };

// Fixed output scale: the loudest note of the range at velocity 1 peaks near -3 dBFS over all options.
const OUT_GAIN = 0.251;

// Fundamental T60 of an aluminium bar over its tube with the pedal down (seconds).
const FUND_T60 = [[175, 22], [349, 14], [698, 8], [1397, 4.5]];

// `duration`: how long the damper stays off (pedal held). `motor`: disc rotation rate in Hz, 0 = off.
export function render({
  midi, velocity = 0.8, duration = 1, seed = 1, motor = 0, hardness = 0.5, position = 0.42, motorPhase = 0,
} = {}) {
  midi = noteMidi('vibraphone', midi, meta.range);
  for (const [k, v] of Object.entries({ velocity, seed, motor, hardness, position, motorPhase })) finite('vibraphone', k, v);
  if (typeof duration !== 'number' || Number.isNaN(duration)) throw new Error(`vibraphone: duration must be a number, got ${duration}`);
  const rand = rng(seed * 104729 + midi * 977 + 3);
  const f1 = midiToHz(midi) * 2 ** (((rand() * 2 - 1) * 1) / 1200);
  const vel = clamp(velocity, 0.02, 1);
  const hard = clamp(hardness + (midi - 71) / 100 + 0.3 * (vel - 0.5), 0, 1);
  const hi = clamp((midi - 53) / 36, 0, 1);

  // Undercut aluminium bar tuned 1 : 4 (and ~10 in the low register).
  const transverse = [1, 4.0, lerp(9.95, 8.6, hi), lerp(17.5, 15, hi), lerp(26, 22, hi)];
  const weights = [1, 1.8, 2.6, 1.0, 0.5];
  const xs = clamp(position + (rand() - 0.5) * 0.03, 0.02, 0.5);
  const damp = Number.isFinite(duration) ? Math.max(0.03, duration) : Infinity;
  const dampAt = Number.isFinite(damp) ? Math.round(damp * SR) : Infinity;
  const tauDamped = 0.05;

  const modes = transverse.map((r, n) => {
    const f = f1 * r * (n === 0 ? 1 : jitter(rand, 0.003));
    const tau = n === 0 ? logInterp(FUND_T60, f1) / 6.91 : (2600 * (f / 1000) ** -0.45) / (Math.PI * f);
    const amp = (freeFreeShape(n, xs) / 2) * weights[n] * jitter(rand, 0.06) * airRolloff(f, 7000, 2);
    return { f, tau, amp, tauDamped, dampAt };
  });
  for (const [r, a] of [[3.0, 0.03], [7.0, 0.025]]) {
    const f = f1 * r * jitter(rand, 0.02);
    modes.push({ f, tau: 900 / (Math.PI * f), amp: a * jitter(rand, 0.3) * airRolloff(f, 7000, 2), tauDamped, dampAt });
  }

  const speed = 0.15 + 0.85 * vel;
  const p = lerp(2.2, 1.5, hard);
  const t0 = lerp(0.8e-3, 0.2e-3, hard) * (349 / f1) ** 0.3;
  const contact = contactTime(t0, p, speed);
  const force = hertzPulse(contact, p, speed);

  const natural = decayLength(modes.map((m) => m.tau), 60, 24);
  const lenSec = Math.min(natural, damp + 0.4);
  const len = Math.ceil(lenSec * SR);

  const out = new Float64Array(len);
  for (const m of modes.slice(1)) addMode(out, force, m);
  const fund = new Float64Array(len);
  addMode(fund, force, modes[0]);

  // Rotating discs at the top of the tubes open and close the resonator: the tube part of the
  // fundamental is amplitude modulated, the direct bar sound is not.
  let mod = null;
  if (motor > 0) {
    mod = new Float64Array(len);
    const w = (2 * Math.PI * motor) / SR;
    const depth = 0.85;
    for (let i = 0; i < len; i++) mod[i] = 1 - depth * (0.5 - 0.5 * Math.cos(w * i + motorPhase));
  }
  const tube = resonate(fund, f1 * 1.002, lerp(40, 25, hi), 1);
  const tubeGain = lerp(1.1, 0.6, hi);
  for (let i = 0; i < len; i++) out[i] += 0.7 * fund[i] + tubeGain * tube[i] * (mod ? mod[i] : 1);

  const tick = contactNoise(len, contact, 0.015 * speed * (0.3 + hard), rand);
  for (let i = 0; i < tick.length; i++) out[i] += tick[i];
  const gain = OUT_GAIN * strikeGain(weights, xs);
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return fadeTail(out, Number.isFinite(damp) ? 0.1 : 0.3);
}
