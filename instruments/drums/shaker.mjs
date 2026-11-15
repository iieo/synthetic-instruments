import { SR } from '../../lib/audio.mjs';
import { biquad, addInto } from './dsp.mjs';

/*
 Stochastic particle model: N beads inside a shell. A hand stroke injects kinetic energy E(t);
 bead-wall and bead-bead collisions happen at a rate proportional to N * bead speed ~ sqrt(E),
 each collision dissipates a fraction of E. Every collision is a tiny impact (short raised-cosine click
 with random strength) that rings the shell resonances.
*/
export function shaker({ vel, r, len = 0.3, beads = 48, shell = [[3200, 6], [5100, 7], [7300, 5]] }) {
  const n = Math.round(len * SR);
  const clicks = new Float64Array(n);
  let E = 0;
  const strokeAt = 0.012 * SR, strokeW = 0.008 * SR;
  const loss = 0.0016;
  const inject = vel * vel * 0.035;
  for (let i = 0; i < n; i++) {
    const g = (i - strokeAt) / strokeW;
    E += inject * Math.exp(-g * g) * (0.8 + 0.4 * r());
    E *= 0.99985;
    const rate = beads * 420 * Math.sqrt(E);
    if (r() < rate / SR) {
      const a = Math.sqrt(E) * (0.2 + r());
      const w = 2 + Math.floor(r() * 3);
      for (let k = 0; k < w && i + k < n; k++) clicks[i + k] += a * Math.sin((Math.PI * (k + 0.5)) / w);
      E *= 1 - loss * (0.5 + r());
    }
  }
  const out = new Float64Array(n);
  for (const [f, q] of shell) addInto(out, biquad(clicks, 'bp', f * (0.97 + 0.06 * r()), q), 1);
  addInto(out, biquad(clicks, 'hp', 1800, 0.7), 0.25);
  return out;
}
