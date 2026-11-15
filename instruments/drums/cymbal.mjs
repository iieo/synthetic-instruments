import { SR } from '../../lib/audio.mjs';
import { contactWeight, t60ToDecay } from './dsp.mjs';

/*
 Thin plate: flexural mode density is roughly constant in frequency, so mode frequencies are drawn
 uniformly in [fLo, fHi] (with jitter). Each mode envelope is
   e^{-t/tau_d} * (W(f) + B(f) * (1 - e^{-t/tau_b}))
 W is the direct excitation through the stick contact (low-passed by the contact time). B is energy that
 nonlinear (von Karman type) coupling pumps from the low modes into higher ones over tens of
 milliseconds; it does not pass through the contact filter, so the sound brightens after the hit.
 Both terms are evaluated with two rotating phasors per mode, so no per-sample trig is needed.
*/
export function cymbal(o) {
  const { count, fLo, fHi, env, t60, bloom, bloomAmp, T, amp, len, r, extra = [], am = null } = o;
  const n = Math.round(len * SR);
  const out = new Float64Array(n);
  const modes = [];
  for (let k = 0; k < count; k++) {
    const f = fLo + (fHi - fLo) * (k + r()) / count;
    modes.push({ f, a: env(f) * (r() < 0.5 ? -1 : 1) * (0.4 + 1.2 * r()) });
  }
  for (const e of extra) modes.push(e);
  const norm = amp / Math.sqrt(count);
  for (const { f, a } of modes) {
    const W = a * norm * contactWeight(f, T), B = a * norm * bloomAmp(f);
    const dd = t60ToDecay(t60(f));
    const tb = bloom(f);
    const db = tb > 0 ? Math.exp(-1 / (tb * SR)) : 0;
    const w = (2 * Math.PI * f) / SR, c = Math.cos(w), s = Math.sin(w);
    const lim = Math.min(n, Math.ceil(Math.log(1e-5) / Math.log(dd)));
    let x1 = 1, y1 = 0, x2 = 1, y2 = 0;
    const c2 = c * dd * db, s2 = s * dd * db, c1 = c * dd, s1 = s * dd;
    const g1 = W + B, g2 = B;
    if (db > 0) {
      for (let i = 0; i < lim; i++) {
        out[i] += g1 * y1 - g2 * y2;
        const nx1 = x1 * c1 - y1 * s1; y1 = x1 * s1 + y1 * c1; x1 = nx1;
        const nx2 = x2 * c2 - y2 * s2; y2 = x2 * s2 + y2 * c2; x2 = nx2;
      }
    } else {
      const g = W;
      for (let i = 0; i < lim; i++) {
        out[i] += g * y1;
        const nx1 = x1 * c1 - y1 * s1; y1 = x1 * s1 + y1 * c1; x1 = nx1;
      }
    }
  }
  if (am) for (let i = 0; i < n; i++) out[i] *= am(i);
  return out;
}
