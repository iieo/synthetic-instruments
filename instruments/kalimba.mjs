import { SR, midiToHz, rng } from '../lib/audio.mjs';
import {
  clampedFreeRatios, clampedFreeShape, hertzPulse, addMode, resonate, decayLength, fadeTail,
  jitter, clamp, airRolloff, lerp, logInterp, noteMidi, finite,
} from './mallets/core.mjs';

export const meta = { name: 'Kalimba', range: [55, 91] };

// Fixed output scale: the loudest note of the range at velocity 1 peaks near -3 dBFS over all options.
const OUT_GAIN = 0.297;

const FUND_T60 = [[196, 3.2], [262, 2.8], [523, 2.0], [1046, 1.3], [1568, 0.9]];

// Hollow wooden box: Helmholtz air resonance through the sound hole plus the first top-plate modes.
const BOX = [
  { f: 210, q: 9, g: 0.8 },
  { f: 455, q: 14, g: 0.45 },
  { f: 780, q: 16, g: 0.3 },
  { f: 1320, q: 18, g: 0.22 },
  { f: 2250, q: 20, g: 0.12 },
];

export function render({ midi, velocity = 0.8, duration = 1, seed = 1, buzz = 0.15 } = {}) {
  midi = noteMidi('kalimba', midi, meta.range);
  for (const [k, v] of Object.entries({ velocity, seed, buzz })) finite('kalimba', k, v);
  const rand = rng(seed * 15485863 + midi * 7243 + 11);
  const f1 = midiToHz(midi) * 2 ** (((rand() * 2 - 1) * 2) / 1200);
  const vel = clamp(velocity, 0.02, 1);

  // Clamped-free steel tine (cantilever); the thumb pushes the free end and slides off it.
  const weights = [1, 1.8, 0.9, 0.35];
  const modes = clampedFreeRatios.slice(0, 4).map((r, n) => {
    const f = f1 * r * (n === 0 ? 1 : jitter(rand, 0.006));
    const tau = n === 0 ? logInterp(FUND_T60, f1) / 6.91 : (500 * (f / 2000) ** -0.3) / (Math.PI * f);
    const amp = (clampedFreeShape(n, 0.97) / 2) * weights[n] * jitter(rand, 0.1) * airRolloff(f, 6500, 2);
    return { f, tau, amp };
  });
  // Second bending plane and the first torsional mode of the strip, weakly excited by an oblique push.
  modes.push({ f: f1 * 1.0025, tau: modes[0].tau * 0.8, amp: 0.04 * jitter(rand, 0.4) });
  const ft = f1 * 4.4 * jitter(rand, 0.03);
  modes.push({ f: ft, tau: 300 / (Math.PI * ft), amp: 0.03 * jitter(rand, 0.4) * airRolloff(ft, 6500, 2) });

  // Release time: soft thumb flesh ~3 ms, a firm flick with the nail well under 1 ms.
  const release = lerp(1.6e-3, 0.35e-3, vel) * (262 / f1) ** 0.2;
  const force = hertzPulse(release, 1.2, 0.15 + 0.85 * vel);

  const len = Math.ceil(decayLength(modes.map((m) => m.tau), 65, 6) * SR);
  const tine = new Float64Array(len);
  for (const m of modes) addMode(tine, force, m);

  // Nail and tine clicking against the bridge: a short damped burst of high bridge/tine-end modes.
  const tick = new Float64Array(len);
  for (const [fr, a] of [[2900, 0.6], [4100, 0.5], [5300, 0.35]]) {
    const f = fr * jitter(rand, 0.08);
    addMode(tick, force, { f, tau: 0.004, amp: a * 0.2 * vel });
  }

  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = 0.45 * tine[i] + tick[i];
  for (const b of BOX) {
    const body = resonate(tine, b.f, b.q, b.g * 1.6);
    for (let i = 0; i < len; i++) out[i] += body[i];
  }

  // Slight rattle: the tine touching the bridge saddle on large excursions, amplitude-gated.
  if (buzz > 0) {
    const thr = 0.5;
    let env = 0;
    const a = Math.exp(-1 / (0.002 * SR));
    const rattle = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      env = Math.max(Math.abs(tine[i]), env * a);
      const over = Math.max(0, tine[i] - thr * env);
      rattle[i] = over * over;
    }
    const hp = resonate(rattle, 3400, 3, buzz * 0.25 * vel);
    for (let i = 0; i < len; i++) out[i] += hp[i];
  }
  for (let i = 0; i < out.length; i++) out[i] *= OUT_GAIN;
  return fadeTail(out, 0.05);
}
