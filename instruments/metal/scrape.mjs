import { SR } from '../../lib/audio.mjs';
import { STEEL, C_L, NYQ_SAFE, t60ToR, smoothNoise } from './modal.mjs';
import { freeFreeShape, t60Of } from './objects.mjs';

const { E, rho, nu } = STEEL;

// Stick-slip friction between the edge of a hand-held steel bar and a steel plate.
// Both are modal systems; the contact is solved implicitly each sample (stick if the force needed to
// hold v_rel = 0 stays below mu_s N, else slip with a Stribeck curve). The tangential friction reaches
// the plate's bending modes through the tilt of the bar (projection s). Surface roughness modulates
// the normal force along the path, so its spectrum follows the stroke speed.
export function scrape({ velocity, size, damping, dur, rand }) {
  const a = 0.7 * size, b = 0.5 * size, h = 3e-3 * size;
  const beta = h * Math.sqrt(E / (12 * rho * (1 - nu * nu)));
  const Mp = rho * a * b * h;
  const pm = [], pn = [], pf = [];
  const kMax = Math.sqrt((2 * Math.PI * 13000) / beta);
  for (let m = 1; m <= Math.ceil((kMax * a) / Math.PI); m++) {
    for (let n = 1; n <= Math.ceil((kMax * b) / Math.PI); n++) {
      const f = (beta * ((m * Math.PI / a) ** 2 + (n * Math.PI / b) ** 2)) / (2 * Math.PI);
      if (f > 30 && f < 13000) { pm.push(m); pn.push(n); pf.push(f); }
    }
  }
  // Scraper: flat bar 0.3 m x 25 mm x 5 mm, bending about the thin axis, damped by the hand.
  const Ls = 0.3 * size, ts = 5e-3 * size, ws = 0.025 * size;
  const rgS = ts / Math.sqrt(12), Ms = rho * Ls * ts * ws;
  const sf = [];
  for (let n = 0; n < 10; n++) {
    const bb = [4.73004, 7.8532, 10.99561, 14.13717, 17.27876][n] ?? ((2 * n + 3) * Math.PI) / 2;
    const f = ((bb * bb) / (2 * Math.PI * Ls * Ls)) * C_L * rgS / Math.sqrt(1 + (bb / Ls * rgS) ** 2 * 7);
    if (f < NYQ_SAFE * 0.9) sf.push(f);
  }
  const P = pf.length, S = sf.length, K = P + S;
  const w = new Float64Array(K), r = new Float64Array(K), m = new Float64Array(K), g = new Float64Array(K);
  const cr = new Float64Array(K), ci = new Float64Array(K), zr = new Float64Array(K), zi = new Float64Array(K);
  const phi = new Float64Array(K);
  const ym = 0.31 * b, xm = 0.63 * a, yPath = (0.35 + 0.3 * rand()) * b;
  for (let k = 0; k < K; k++) {
    const plate = k < P;
    const f = plate ? pf[k] : sf[k - P];
    w[k] = 2 * Math.PI * f;
    r[k] = t60ToR(plate ? t60Of(f, 2e-3 * damping, 2e-3 * damping, 1.5) : 2.2 / (f * (4e-3 * damping + 0.01 * (400 / f) ** 2)));
    m[k] = plate ? Mp / 4 : Ms;
    cr[k] = r[k] * Math.cos(w[k] / SR); ci[k] = r[k] * Math.sin(w[k] / SR);
    // Below the coincidence frequency fc = c^2 / (1.8 c_L h) a plate radiates with efficiency ~ f/fc.
    const fc = (343 * 343) / (1.8 * C_L * h);
    const rad = (plate ? Math.sqrt(Math.min(1, f / fc)) : (f / (f + 150)) ** 2) * (f < 9000 ? 1 : Math.exp(-(f - 9000) / 3000));
    g[k] = rad * w[k] * (plate
      ? Math.sin((pm[k] * Math.PI * xm) / a) * Math.sin((pn[k] * Math.PI * ym) / b)
      : 0.2 * freeFreeShape(k - P, 0.4));
    if (!plate) phi[k] = freeFreeShape(k - P, 0);
  }
  const proj = 0.55, muS = 0.7, muD = 0.3, vS = 0.02;
  const v0 = 0.12 + 0.45 * velocity, N0 = 6 + 35 * velocity;
  const n = Math.round((dur + 1.2) * SR), nStroke = Math.round(dur * SR);
  const out = new Float64Array(n);
  const jitter = smoothNoise(rand, 64), press = smoothNoise(rand, 64);
  const rough = smoothNoise(rand, 4096), groove = smoothNoise(rand, 512);
  let x = (0.15 + 0.1 * rand()) * a, Yp = 0, Ys = 0, Nlp = N0;
  for (let k = P; k < K; k++) Ys += (phi[k] * phi[k]) / m[k];
  const fade = Math.round(0.06 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = i < nStroke ? Math.min(1, i / fade, (nStroke - i) / fade) : 0;
    const vb = v0 * env * Math.max(0.05, 1 + 0.45 * jitter(t * 7) + 0.2 * jitter(t * 23 + 17));
    x += vb / SR;
    if (i % 32 === 0) {
      Yp = 0;
      const xx = Math.min(a, Math.max(0, x));
      for (let k = 0; k < P; k++) {
        phi[k] = Math.sin((pm[k] * Math.PI * xx) / a) * Math.sin((pn[k] * Math.PI * yPath) / b);
        Yp += (phi[k] * phi[k]) / m[k];
      }
    }
    // Asperities every ~0.2 mm and grooves every ~3 mm along the path.
    const asp = 0.55 * rough(x / 2e-4) + 0.35 * groove(x / 3e-3);
    const N = env * N0 * (1 + 0.3 * press(t * 3)) * Math.max(0.02, 1 + asp);
    let vp = 0, vs = 0, y = 0;
    for (let k = 0; k < K; k++) {
      const re = zr[k], im = zi[k];
      const nr = cr[k] * re - ci[k] * im, ni = cr[k] * im + ci[k] * re;
      zr[k] = nr; zi[k] = ni;
      y += g[k] * ni;
      if (k < P) vp += phi[k] * w[k] * nr; else vs += phi[k] * w[k] * nr;
    }
    out[i] = y;
    let F = 0;
    if (N > 1e-6) {
      const vrel = vb + vs - proj * vp;
      const Y = (Ys + proj * proj * Yp) / SR;
      const Fst = vrel / Y;
      if (Math.abs(Fst) <= muS * N) F = Fst;
      else {
        const sg = Math.sign(vrel), av = Math.abs(vrel);
        let lo = 0, hi = muS * N;
        for (let it = 0; it < 24; it++) {
          const mid = 0.5 * (lo + hi);
          const vr = Math.max(0, av - Y * mid);
          const gm = mid - N * (muD + (muS - muD) * Math.exp(-vr / vS));
          if (gm > 0) hi = mid; else lo = mid;
        }
        F = sg * 0.5 * (lo + hi);
      }
    }
    // Normal-force fluctuation (asperity impacts) also drives the plate directly.
    Nlp += 0.002 * (N - Nlp);
    const Jp = (proj * F + 0.3 * (N - Nlp)) / SR, Js = -F / SR;
    for (let k = 0; k < P; k++) zr[k] += (phi[k] / (m[k] * w[k])) * Jp;
    for (let k = P; k < K; k++) zr[k] += (phi[k] / (m[k] * w[k])) * Js;
  }
  return out;
}
