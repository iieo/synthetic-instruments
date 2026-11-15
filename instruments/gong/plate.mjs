import { SR } from '../../lib/audio.mjs';
import { besselJ } from '../drums/membrane.mjs';

export const BRONZE = { E: 1.1e11, rho: 8600, nu: 0.34 };

// Eigenvalue lambda_mn (k a) of a thin circular plate whose turned rim holds the edge roughly like
// a support: close to the Bessel zeros j_m,n+1. Olver's expansion for the first zero of large
// order, McMahon's for the higher ones.
function lambda(m, n) {
  if (n === 0) {
    if (m === 0) return 2.4048;
    const c = Math.cbrt(m);
    return m + 1.8558 * c + 1.033 / c - 0.00397 / m;
  }
  const b = (n + 1 + m / 2 - 0.25) * Math.PI, mu = 4 * m * m;
  return Math.max(lambda(m, n - 1) + 2.5, b - (mu - 1) / (8 * b));
}

// J_m(x) for large arguments: the power series loses all digits once x is large against m, so
// the leading asymptotic term takes over there.
function bessel(m, x) {
  if (m > 1.3 * x + 8) return 0;
  if (x < 14 || m > 0.9 * x) return besselJ(m, x);
  return Math.sqrt(2 / (Math.PI * x)) * Math.cos(x - (m * Math.PI) / 2 - Math.PI / 4);
}

// Plate modes for the modal bank. o: { a, h, fMin, fMax, fAll, keep, r0 (strike radius / a),
// t60 (f => seconds), imp (initial deflection scale, m), rand }.
// Above fAll the mode set is thinned to keep a roughly constant number of modes per critical
// band; a kept mode stands for 1/p modes, so its output weight grows by 1/sqrt(p) and its share
// of the stretching by 1/p.
export function plateModes(o) {
  const { a, h, fMin = 20, fMax, fAll, keep, r0, t60, imp, rand, outLow = 120 } = o;
  const { E, rho, nu } = BRONZE;
  const beta = h * Math.sqrt(E / (12 * rho * (1 - nu * nu)));
  const freq = (lam) => (beta * lam * lam) / (2 * Math.PI * a * a);
  const cand = [];
  for (let m = 0; m < 400; m++) {
    if (freq(lambda(m, 0)) > fMax) break;
    for (let n = 0; n < 200; n++) {
      const lam = lambda(m, n), f = freq(lam);
      if (f > fMax) break;
      if (f < fMin) continue;
      cand.push([m, n, lam, f]);
      // m > 0 comes in pairs (cos and sin); the hammered metal splits them a little.
      if (m > 0) cand.push([m, n, lam, f * (1 + 0.004 + 0.012 * rand())]);
    }
  }
  let wsum = 0;
  for (const c of cand) if (c[3] > fAll) wsum += fAll / c[3];
  const q = wsum > 0 ? keep / wsum : 1;
  const s = { f: [], t60: [], m: [], gout: [], phi: [], kk: [], wq: [], imp0: [] };
  const M = rho * h * Math.PI * a * a;
  const k1 = (lambda(2, 0) / a) ** 2;
  const th = 2 * Math.PI * rand();
  for (const [m, n, lam, f0] of cand) {
    const p = f0 > fAll ? Math.min(1, (q * fAll) / f0) : 1;
    if (p < 1 && rand() > p) continue;
    // Hammering leaves the modes a few percent away from the ideal plate.
    const f = Math.min(0.45 * SR, f0 * (1 + 0.03 * (rand() - 0.5)));
    const k2 = (lam / a) ** 2;
    const ph = rand() * 2 * Math.PI;
    const phi = bessel(m, lam * r0) * Math.cos(m * th + ph);
    const listen = (0.4 + rand()) * (rand() < 0.5 ? -1 : 1);
    const rad = (f / (f + outLow)) ** 2;
    s.f.push(f); s.t60.push(t60(f)); s.m.push(M / 4); s.phi.push(phi);
    s.gout.push(2 * Math.PI * f * rad * listen / Math.sqrt(p));
    s.kk.push(k2); s.wq.push(0.25 / p);
    s.imp0.push(imp * (rand() * 2 - 1) * Math.sqrt(k1 / k2));
  }
  return s;
}
