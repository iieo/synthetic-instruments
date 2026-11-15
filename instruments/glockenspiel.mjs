import { SR, midiToHz, rng } from '../lib/audio.mjs';
import {
  freeFreeRatios, freeFreeShape, hertzPulse, contactTime, addMode, decayLength, fadeTail,
  contactNoise, jitter, clamp, airRolloff, lerp, logInterp, strikeGain, noteMidi, finite,
} from './mallets/core.mjs';

export const meta = { name: 'Glockenspiel', range: [79, 108] };

// Fixed output scale: the loudest note of the range at velocity 1 peaks near -3 dBFS over all options.
const OUT_GAIN = 0.46;

const FUND_T60 = [[784, 6.5], [1568, 4.2], [3136, 2.4], [4186, 1.8]];

export function render({ midi, velocity = 0.8, duration = 1, seed = 1, hardness = 0.7, position = 0.47 } = {}) {
  midi = noteMidi('glockenspiel', midi, meta.range);
  for (const [k, v] of Object.entries({ velocity, seed, hardness, position })) finite('glockenspiel', k, v);
  const rand = rng(seed * 2654435761 + midi * 40503 + 5);
  const f1 = midiToHz(midi) * 2 ** (((rand() * 2 - 1) * 1.5) / 1200);
  const vel = clamp(velocity, 0.02, 1);
  const hard = clamp(hardness + 0.25 * (vel - 0.5), 0, 1);
  const xs = clamp(position + (rand() - 0.5) * 0.04, 0.02, 0.5);

  // Uniform rectangular steel bar (no undercut): free-free Euler-Bernoulli ratios 1 : 2.76 : 5.40 : 8.93 ...
  // Shear and rotary inertia (Timoshenko) pull the upper modes slightly flat on these thick, short bars.
  const weights = [1, 1.0, 2.0, 1.2, 0.7];
  const modes = freeFreeRatios.slice(0, 5).map((r, n) => {
    const timo = 1 - 0.006 * n * n;
    const f = f1 * r * timo * (n === 0 ? 1 : jitter(rand, 0.004));
    const tau = n === 0 ? logInterp(FUND_T60, f1) / 6.91 : (3500 * (f / 2000) ** -0.4) / (Math.PI * f);
    const amp = (freeFreeShape(n, xs) / 2) * weights[n] * jitter(rand, 0.08) * airRolloff(f, 6000, 2);
    return { f, tau, amp };
  });
  // First torsional mode, excited by strikes off the bar's centre line.
  const ft = f1 * lerp(3.4, 2.9, (midi - 79) / 29) * jitter(rand, 0.03);
  modes.push({ f: ft, tau: 1200 / (Math.PI * ft), amp: 0.06 * jitter(rand, 0.4) * airRolloff(ft, 6000, 2) });

  const speed = 0.15 + 0.85 * vel;
  const p = lerp(1.9, 1.5, hard);
  const contact = contactTime(lerp(0.55e-3, 0.25e-3, hard), p, speed);
  const force = hertzPulse(contact, p, speed);

  const len = Math.ceil(decayLength(modes.map((m) => m.tau), 60, 8) * SR);
  const out = new Float64Array(len);
  for (const m of modes) addMode(out, force, m);
  const tick = contactNoise(len, contact, 0.03 * speed * hard, rand);
  for (let i = 0; i < tick.length; i++) out[i] += tick[i];
  const gain = OUT_GAIN * strikeGain(weights, xs);
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return fadeTail(out, 0.1);
}
