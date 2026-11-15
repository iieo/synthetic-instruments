import { SR, rng } from '../../lib/audio.mjs';

// Parallel bank of two-pole resonators driven by the bridge force.
// Each mode: { f [Hz], q, g (linear peak gain) }.
export function makeBody({ modes, dense, direct = 0, lowpassHz = 6000, lowpassOrder = 2, seed = 7 }) {
  const all = modes.slice();
  if (dense) {
    // Above roughly 1 kHz the measured modal density of violin-family bodies is high and the
    // individual modes overlap; they are placed log-uniformly with a fixed jitter so the response
    // is irregular like a real plate response, and weighted by a smooth envelope (bridge hill).
    const r = rng(seed);
    const { from, to, count, q, envelope } = dense;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.2 + 0.6 * r()) / count;
      const f = from * (to / from) ** u;
      // radiated (transfer) response: mode polarities differ, which avoids the systematic
      // cancellation notches a same-sign resonator sum would produce
      const g = envelope(f) * (0.55 + 0.9 * r()) * (r() < 0.5 ? -1 : 1);
      all.push({ f, q: q * (0.7 + 0.6 * r()), g });
    }
  }
  return function apply(x) {
    const n = x.length;
    const y = new Float64Array(n);
    for (const m of all) {
      const w = (2 * Math.PI * m.f) / SR;
      const rad = Math.exp(-Math.PI * m.f / (m.q * SR));
      const c1 = 2 * rad * Math.cos(w), c2 = -rad * rad;
      const b = ((1 - rad * rad) / 2) * m.g;
      let y1 = 0, y2 = 0, x1 = 0, x2 = 0;
      for (let i = 0; i < n; i++) {
        const xi = x[i];
        const yi = b * (xi - x2) + c1 * y1 + c2 * y2;
        x2 = x1; x1 = xi; y2 = y1; y1 = yi;
        y[i] += yi;
      }
    }
    if (direct) for (let i = 0; i < n; i++) y[i] += direct * x[i];
    // Cascaded one-pole lowpasses for the radiation roll-off at high frequencies.
    const a = Math.exp((-2 * Math.PI * lowpassHz) / SR);
    for (let o = 0; o < lowpassOrder; o++) {
      let s1 = 0;
      for (let i = 0; i < n; i++) { s1 = (1 - a) * y[i] + a * s1; y[i] = s1; }
    }
    return y;
  };
}
