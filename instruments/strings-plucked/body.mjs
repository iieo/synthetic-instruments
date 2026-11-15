import { rng } from '../../lib/audio.mjs';
import { resonator } from './filters.mjs';

// Modal body: the bridge force drives a parallel bank of damped resonators (low, measured-style modes)
// plus a fixed pseudo-random set of weaker high modes that gives the dense "wood" coloration.
export function bodyModes({ modes, dense = null }) {
  const all = modes.map(([f, q, g]) => [f, q, g]);
  if (dense) {
    const r = rng(dense.seed);
    let f = dense.from;
    while (f < dense.to) {
      f *= 1 + dense.spacing * (0.5 + r());
      const g = dense.gain * (0.4 + 0.6 * r()) * (r() < 0.5 ? -1 : 1) * Math.sqrt(dense.from / f);
      all.push([f, dense.q * (0.7 + 0.6 * r()), g]);
    }
  }
  return all;
}

export function applyBody(input, modeList, direct = 1) {
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = direct * input[i];
  for (const [f, q, g] of modeList) {
    const bq = resonator(f, q, g);
    for (let i = 0; i < input.length; i++) out[i] += bq.step(input[i]);
  }
  return out;
}
