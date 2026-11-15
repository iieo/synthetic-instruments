import { SR, midiToHz, rng } from '../lib/audio.mjs';
import {
  freeFreeRatios, hertzPulse, contactTime, addMode, decayLength, fadeTail,
  contactNoise, jitter, clamp, airRolloff, lerp, noteMidi, finite,
} from './mallets/core.mjs';

export const meta = { name: 'Tubular bells', range: [60, 77] };

// Fixed output scale: the loudest note of the range at velocity 1 peaks near -3 dBFS over all options.
const OUT_GAIN = 0.133;

// A chime is a free-free brass tube. Its modes 4, 5 and 6 lie close to 2 : 3 : 4, so the ear hears a
// virtual "strike tone" one octave below mode 4. `midi` names that strike tone.
export function render({ midi, velocity = 0.8, duration = 1, seed = 1, hardness = 0.6 } = {}) {
  midi = noteMidi('bells', midi, meta.range);
  for (const [k, v] of Object.entries({ velocity, seed, hardness })) finite('bells', k, v);
  const rand = rng(seed * 2246822519 + midi * 3266489917 + 7);
  const strike = midiToHz(midi) * 2 ** (((rand() * 2 - 1) * 2) / 1200);
  const vel = clamp(velocity, 0.02, 1);
  const hard = clamp(hardness + 0.25 * (vel - 0.5), 0, 1);
  const f1 = (2 * strike) / freeFreeRatios[3];

  // Struck on the top cap, where every mode has an antinode; the end plug loads the low modes.
  const weights = [0.08, 0.25, 0.55, 1.0, 1.1, 1.1, 1.0, 0.8];
  const modes = [];
  freeFreeRatios.forEach((r, n) => {
    const f = f1 * r * (n === 3 ? 1 : jitter(rand, 0.003));
    // Brass: loss rises with frequency; T60 of mode 4 around 12 s in the low register.
    const tau = (6000 * (f / 500) ** -0.55) / (Math.PI * f);
    const amp = weights[n] * jitter(rand, 0.1) * airRolloff(f, 7000, 2);
    // Slight ovality splits each mode into a close pair, heard as slow beating.
    const split = 1 + (0.0004 + rand() * 0.0012);
    const mix = 0.25 + rand() * 0.25;
    modes.push({ f, tau, amp: amp * (1 - mix) });
    modes.push({ f: f * split, tau: tau * 0.9, amp: amp * mix });
  });

  const speed = 0.15 + 0.85 * vel;
  const p = lerp(2.0, 1.5, hard);
  const contact = contactTime(lerp(0.9e-3, 0.25e-3, hard), p, speed);
  const force = hertzPulse(contact, p, speed);

  const len = Math.ceil(decayLength(modes.map((m) => m.tau), 60, 14) * SR);
  const out = new Float64Array(len);
  for (const m of modes) addMode(out, force, m);
  const tick = contactNoise(len, contact, 0.05 * speed * hard, rand);
  for (let i = 0; i < tick.length; i++) out[i] += tick[i];
  for (let i = 0; i < out.length; i++) out[i] *= OUT_GAIN;
  return fadeTail(out, 0.3);
}
