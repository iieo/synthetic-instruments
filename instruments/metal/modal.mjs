import { SR } from '../../lib/audio.mjs';

export const STEEL = { E: 2.0e11, rho: 7850, nu: 0.29 };
export const C_L = Math.sqrt(STEEL.E / STEEL.rho);
export const C_T = Math.sqrt(STEEL.E / (2 * (1 + STEEL.nu)) / STEEL.rho);
export const NYQ_SAFE = 0.46 * SR;

// Hertz contact F = K d^1.5 with Hunt-Crossley dissipation (factor 1 + lam*d'), which sets the
// restitution e. Integrated with sub-steps; the result is the momentum transferred per output sample.
export function hertzContact({ mass, K, v, e = 0.7, os = 32, maxMs = 30 }) {
  const dt = 1 / (SR * os);
  const lam = (1.5 * (1 - e)) / Math.max(v, 1e-3);
  const nMax = Math.ceil(maxMs * 1e-3 * SR * os);
  const imp = [];
  let d = 0, u = v, acc = 0, s = 0;
  for (; s < nMax; s++) {
    const F = d > 0 ? Math.max(0, K * d ** 1.5 * (1 + lam * u)) : 0;
    u -= (F / mass) * dt;
    d += u * dt;
    acc += F * dt;
    if ((s + 1) % os === 0) { imp.push(acc); acc = 0; }
    if (d <= 0 && s > 0) break;
  }
  if (acc > 0) imp.push(acc);
  return { imp: Float64Array.from(imp), vOut: -u, T: s * dt };
}

export const t60ToR = (t60) => Math.exp(-6.907755 / (t60 * SR));

// Modes: { f, t60, m (modal mass), gout (listening weight) , kk (wavenumber^2, only for Berger) }.
// Each mode is a complex one-pole z <- r e^{iw} z + b*J with b = phi/(m w): Im(z) is then the modal
// displacement in metres and w*Re(z) its velocity. Drives: [{ start, imp, phi: Float64Array }].
// berger: { coef, lpHz } adds the membrane-stretching term w^2 = w0^2 + coef * <|grad w|^2> * k^2.
export function modalBank(modes, drives, nMax, { berger = null, block = 32, floorDb = -100, probe = null } = {}) {
  const K0 = modes.f.length;
  const f0 = Float64Array.from(modes.f, (f) => Math.min(f, NYQ_SAFE));
  const w0 = Float64Array.from(f0, (f) => (2 * Math.PI * f) / SR);
  const r = Float64Array.from(modes.t60, t60ToR);
  const g = Float64Array.from(modes.gout);
  const kk = berger ? Float64Array.from(modes.kk) : null;
  const kq = berger ? Float64Array.from(modes.kk, (k, i) => k * (modes.wq ? modes.wq[i] : 0.25)) : null;
  const invMW = Float64Array.from(modes.m, (m, i) => 1 / (m * w0[i] * SR));
  const zr = new Float64Array(K0), zi = new Float64Array(K0);
  const cr = new Float64Array(K0), ci = new Float64Array(K0);
  const idx = Int32Array.from({ length: K0 }, (_, i) => i);
  for (let k = 0; k < K0; k++) { cr[k] = r[k] * Math.cos(w0[k]); ci[k] = r[k] * Math.sin(w0[k]); }
  const bins = drives.map((d) => Float64Array.from(d.phi, (p, i) => p * invMW[i]));
  let lastDrive = 0;
  for (const d of drives) lastDrive = Math.max(lastDrive, d.start + d.imp.length);
  const out = new Float64Array(nMax);
  let K = K0, tension = 0, peakE = 0, n = 0;
  const aLp = berger ? 1 - Math.exp((-2 * Math.PI * berger.lpHz) / SR) : 0;
  const coefB = berger ? berger.coef / (SR * SR) : 0;
  // Initial deflection (imperfection) w_i of a real sheet: the stretching tension acting on that
  // curvature forces every mode with T(t) itself, a quadratic nonlinearity that feeds sum and
  // difference frequencies into higher modes (energy cascade of shallow shells).
  // Tension uses the stretching relative to the initial shape, <|grad(w + w_i)|^2> - <|grad w_i|^2>,
  // so the coupling is derived from one potential.
  const bnl = berger && modes.imp0 ? Float64Array.from(modes.imp0, (wi, i) => (-berger.coef * kk[i] * wi) / (w0[i] * SR * SR)) : null;
  const kw2 = bnl ? Float64Array.from(modes.imp0, (wi, i) => 2 * kq[i] * wi) : null;
  // Passivity guard. With the tension low-passed and held per block, the scheme is not exactly
  // energy conserving, and a small thin sheet hit hard can pump itself up. The free sheet only loses
  // energy, so H = sum M (v^2 + w0^2 q^2) / 2 + lam coefB S^2 / 4 may grow only by the work of the
  // drives (with 1 dB of slack for the exchange the low-pass blurs); above that the state is scaled
  // back. M is the mass a mode stands for (thinned modes carry wq / 0.25 times their own), which
  // makes the Berger force the gradient of the S^2 term.
  const Mm = berger ? Float64Array.from(modes.m, (m, i) => (kk[i] > 0 ? (m * kq[i]) / (0.25 * kk[i]) : m)) : null;
  const lam = berger ? 4 * (modes.m[modes.kk.findIndex((k) => k > 0)] ?? 0) : 0;
  const wNow = berger ? Float64Array.from(w0) : null;
  const sc = berger ? new Float64Array(K0).fill(1) : null;
  const decay = berger ? Math.max(...r) ** (2 * block) : 1;
  let stPrev = 0, hAllowed = 0;
  for (; n < nMax && K > 0; n += block) {
    if (probe) probe(n, tension);
    if (berger) {
      for (let j = 0; j < K; j++) {
        const k = idx[j];
        const w = Math.min(Math.sqrt(w0[k] * w0[k] + coefB * tension * kk[k]), (2 * Math.PI * NYQ_SAFE) / SR);
        cr[j] = r[k] * Math.cos(w); ci[j] = r[k] * Math.sin(w);
        // Re(z) is velocity / w: keep the velocity when the stiffness changes.
        zr[j] *= wNow[j] / w;
        wNow[j] = w; sc[j] = w0[k] / w;
      }
    }
    const end = Math.min(nMax, n + block);
    for (let i = n; i < end; i++) {
      if (i < lastDrive) {
        for (let d = 0; d < drives.length; d++) {
          const o = i - drives[d].start;
          if (o < 0 || o >= drives[d].imp.length) continue;
          const x = drives[d].imp[o], b = bins[d];
          if (berger) {
            for (let j = 0; j < K; j++) {
              const k = idx[j], dz = b[k] * x * sc[j];
              hAllowed += 0.5 * Mm[k] * wNow[j] * wNow[j] * dz * (2 * zr[j] + dz);
              zr[j] += dz;
            }
          } else for (let j = 0; j < K; j++) zr[j] += b[idx[j]] * x;
        }
      }
      let s = 0, st = 0;
      if (berger) {
        let sx = 0;
        if (bnl) for (let j = 0; j < K; j++) zr[j] += bnl[idx[j]] * sc[j] * stPrev;
        for (let j = 0; j < K; j++) {
          const a = zr[j], bb = zi[j];
          const ni = cr[j] * bb + ci[j] * a;
          zr[j] = cr[j] * a - ci[j] * bb; zi[j] = ni;
          const k = idx[j];
          s += g[k] * ni; st += kq[k] * ni * ni;
          if (kw2) sx += kw2[k] * ni;
        }
        tension += aLp * (st - tension);
        stPrev = st + sx;
      } else {
        for (let j = 0; j < K; j++) {
          const a = zr[j], bb = zi[j];
          const ni = cr[j] * bb + ci[j] * a;
          zr[j] = cr[j] * a - ci[j] * bb; zi[j] = ni;
          s += g[idx[j]] * ni;
        }
      }
      out[i] = s;
    }
    if (berger) {
      let h = 0.25 * lam * coefB * stPrev * stPrev;
      for (let j = 0; j < K; j++) {
        const k = idx[j], v = wNow[j] * zr[j], q = zi[j];
        h += 0.5 * Mm[k] * (v * v + w0[k] * w0[k] * q * q);
      }
      if (h > hAllowed && h > 0) {
        const a = Math.sqrt(hAllowed / h);
        for (let j = 0; j < K; j++) { zr[j] *= a; zi[j] *= a; }
        stPrev *= a;
      } else hAllowed = Math.min(hAllowed, 1.25 * h);
      hAllowed *= decay;
    }
    if (end >= lastDrive) {
      let E = 0;
      const e = new Float64Array(K);
      for (let j = 0; j < K; j++) { const gg = g[idx[j]]; e[j] = (zr[j] * zr[j] + zi[j] * zi[j]) * gg * gg; E += e[j]; }
      peakE = Math.max(peakE, E);
      const thr = peakE * 10 ** (floorDb / 10);
      let w = 0;
      for (let j = 0; j < K; j++) {
        // A mode that matters only through the Berger tension is kept as long as it moves noticeably.
        if (e[j] > thr || (berger && kq[idx[j]] * (zr[j] * zr[j] + zi[j] * zi[j]) > 1e-12)) {
          idx[w] = idx[j]; if (berger) { wNow[w] = wNow[j]; sc[w] = sc[j]; } zr[w] = zr[j]; zi[w] = zi[j]; cr[w] = cr[j]; ci[w] = ci[j]; w++;
        }
      }
      K = w;
    }
  }
  return out.subarray(0, Math.min(nMax, n));
}

export function concatModes(...sets) {
  const keys = ['f', 't60', 'm', 'gout', 'kk', 'wq'];
  const o = {};
  for (const key of keys) {
    if (!sets.every((s) => s[key])) continue;
    o[key] = sets.flatMap((s) => Array.from(s[key]));
  }
  o.phi = sets.flatMap((s) => Array.from(s.phi));
  return o;
}

// Smooth onset and raised-cosine release; also trims trailing near-silence.
export function finish(x, { floorDb = -90, release = 0.05, attack = 8 } = {}) {
  let pk = 0;
  for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  if (pk === 0) return new Float64Array(16);
  const th = pk * 10 ** (floorDb / 20);
  let last = x.length - 1;
  while (last > 0 && Math.abs(x[last]) < th) last--;
  const rel = Math.round(release * SR);
  const n = Math.min(x.length, last + rel);
  const y = Float64Array.from(x.subarray(0, n));
  for (let i = 0; i < attack && i < n; i++) y[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / attack);
  const r = Math.min(rel, n);
  for (let i = 0; i < r; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / r);
  y[0] = 0; y[n - 1] = 0;
  return y;
}

// RBJ biquad, used only for gentle tone shaping and the anti-harshness low-pass.
export function biquad(x, type, f, q = 0.707) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
  const c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else throw new Error(type);
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// Value noise with cubic interpolation, deterministic from an rng.
export function smoothNoise(rand, n) {
  const pts = Float64Array.from({ length: n + 4 }, () => rand() * 2 - 1);
  return (t) => {
    const i = Math.floor(t), u = t - i;
    const p0 = pts[(i + n * 4) % (n + 4)], p1 = pts[(i + 1 + n * 4) % (n + 4)];
    const p2 = pts[(i + 2 + n * 4) % (n + 4)], p3 = pts[(i + 3 + n * 4) % (n + 4)];
    return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
  };
}
