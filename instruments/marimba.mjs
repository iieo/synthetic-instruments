import { SR, midiToHz, rng } from '../lib/audio.mjs';
import {
  freeFreeShape, hertzPulse, contactTime, addMode, resonate, decayLength, fadeTail,
  contactNoise, jitter, clamp, airRolloff, lerp, logInterp, strikeGain, noteMidi, finite,
} from './mallets/core.mjs';

export const meta = { name: 'Marimba', range: [36, 96] };

// Fixed output scale: the loudest note of the range at velocity 1 peaks near -3 dBFS over all options.
const OUT_GAIN = 0.325;

// Fundamental T60 of a rosewood bar over its resonator (seconds), loosely after published decay data.
const FUND_T60 = [[65, 2.4], [130, 1.8], [262, 1.25], [523, 0.85], [1046, 0.55], [2093, 0.32]];

export function render({ midi, velocity = 0.8, duration = 1, seed = 1, hardness = 0.5, position = 0.42 } = {}) {
  midi = noteMidi('marimba', midi, meta.range);
  for (const [k, v] of Object.entries({ velocity, seed, hardness, position })) finite('marimba', k, v);
  const rand = rng(seed * 7919 + midi * 131 + 17);
  const f1 = midiToHz(midi) * 2 ** (((rand() * 2 - 1) * 1.5) / 1200);
  const vel = clamp(velocity, 0.02, 1);
  // A hard stroke compresses the yarn wrap so the mallet core takes part in the contact.
  const hard = clamp(hardness + (midi - 66) / 120 + 0.3 * (vel - 0.5), 0, 1);

  // Undercut bar: modes 2 and 3 are tuned to two octaves and ~ two octaves plus a major third in the
  // low register; above about C6 only the second mode stays tuned and the third drifts flat.
  const hi = clamp((midi - 72) / 24, 0, 1);
  const r3 = lerp(9.85, 8.2, hi);
  const transverse = [1, 3.98, r3, lerp(17.2, 14.5, hi), lerp(26.5, 21, hi), lerp(37, 29, hi)];
  const xs = clamp(position + (rand() - 0.5) * 0.03, 0.02, 0.5);
  const weights = [1, 1.4, 1.8, 0.9, 0.5, 0.3];

  const modes = transverse.map((r, n) => {
    const f = f1 * r * (n === 0 ? 1 : jitter(rand, 0.004));
    const q = n === 0 ? null : 160 * (f / 1000) ** -0.2;
    const tau = n === 0 ? logInterp(FUND_T60, f1) / 6.91 : q / (Math.PI * f);
    const amp = (freeFreeShape(n, xs) / 2) * weights[n] * jitter(rand, 0.08) * airRolloff(f, 5000, 3);
    return { f, tau, amp };
  });
  // Weak torsional modes, excited because the mallet never hits the bar's centre line exactly.
  for (const [r, a] of [[3.05, 0.035], [6.3, 0.02]]) {
    const f = f1 * r * jitter(rand, 0.02);
    modes.push({ f, tau: 60 / (Math.PI * f), amp: a * jitter(rand, 0.3) * airRolloff(f, 5000, 3) });
  }

  const speed = 0.15 + 0.85 * vel;
  const p = lerp(2.4, 1.6, hard);
  const t0 = lerp(1.0e-3, 0.25e-3, hard) * (262 / f1) ** 0.25;
  const contact = Math.max(0.3e-3, contactTime(t0, p, speed));
  const force = hertzPulse(contact, p, speed);

  const len = Math.ceil(decayLength(modes.map((m) => m.tau), 70, 6) * SR);
  const bar = new Float64Array(len);
  for (const m of modes.slice(1)) addMode(bar, force, m);

  const fund = new Float64Array(len);
  addMode(fund, force, modes[0]);
  // Quarter-wave tube under the bar, tuned slightly sharp, radiating most of the fundamental.
  const tubeQ = lerp(35, 18, hi);
  const tube = resonate(fund, f1 * 1.003, tubeQ, 1);
  const lo = clamp((60 - midi) / 24, 0, 1);
  const tubeGain = lerp(1.2, 0.5, hi) + 1.3 * lo;
  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = bar[i] + 0.45 * fund[i] + tubeGain * tube[i];

  const tick = contactNoise(len, contact, 0.1 * speed * (0.3 + hard), rand);
  for (let i = 0; i < tick.length; i++) out[i] += tick[i];
  const gain = OUT_GAIN * strikeGain(weights, xs);
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return fadeTail(out, 0.04);
}
