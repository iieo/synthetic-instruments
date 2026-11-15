import { STEEL, C_L, C_T, NYQ_SAFE } from './modal.mjs';

const { E, rho, nu } = STEEL;
const FF = [4.73004, 7.8532, 10.99561, 14.13717, 17.27876, 20.42035, 23.56194, 26.70354];
const CF = [1.8751, 4.69409, 7.85476, 10.99554, 14.13717, 17.27876];
const ffBeta = (n) => (n < FF.length ? FF[n] : ((2 * n + 3) * Math.PI) / 2);
const cfBeta = (n) => (n < CF.length ? CF[n] : ((2 * n + 1) * Math.PI) / 2);

// Free-free Euler-Bernoulli shape, x in [0,1], unit mean square (|phi| = 2 at the ends).
export function freeFreeShape(n, x) {
  const b = ffBeta(n);
  if (b > 20) return Math.SQRT2 * Math.cos(b * x - Math.PI / 4) + Math.exp(-b * x) + (n % 2 ? -1 : 1) * Math.exp(-b * (1 - x));
  const s = (Math.cosh(b) - Math.cos(b)) / (Math.sinh(b) - Math.sin(b));
  return Math.cosh(b * x) + Math.cos(b * x) - s * (Math.sinh(b * x) + Math.sin(b * x));
}

export function cantileverShape(n, x) {
  const b = cfBeta(n);
  if (b > 20) return Math.SQRT2 * Math.sin(b * x - Math.PI / 4) + Math.exp(-b * x);
  const s = (Math.cosh(b) + Math.cos(b)) / (Math.sinh(b) + Math.sin(b));
  return Math.cosh(b * x) - Math.cos(b * x) - s * (Math.sinh(b * x) - Math.sin(b * x));
}

// Loss factor model: material loss plus a term rising with frequency (thermoelastic and
// radiation losses lumped), capped by a fixed decay for very low modes (air drag, mounting).
export function t60Of(f, eta0, eta1 = 0, cap = Infinity) {
  const eta = eta0 + eta1 * Math.sqrt(f / 1000);
  return Math.min(cap, 2.2 / (f * eta));
}

function set() { return { f: [], t60: [], m: [], gout: [], phi: [], kk: [], wq: [] }; }
function push(s, f, t60, m, phi, gout, kk = 0, wq = 0.25) {
  if (!(f > 15 && f < 16000)) return;
  s.f.push(f); s.t60.push(t60); s.m.push(m); s.phi.push(phi); s.gout.push(gout); s.kk.push(kk); s.wq.push(wq);
}

// Free-free beam bending with a Timoshenko correction for shear and rotary inertia:
// f = f_EB / sqrt(1 + (k rg)^2 (1 + E/(kappa G))).
export function beamBending({ L, rg, A, kappa, x0, xm, nModes, eta0, eta1, gain = 1, cantilever = false }) {
  const s = set();
  const M = rho * A * L;
  const EG = 2 * (1 + nu);
  for (let n = 0; n < nModes; n++) {
    const b = cantilever ? cfBeta(n) : ffBeta(n);
    const k = b / L;
    const fEB = ((b * b) / (2 * Math.PI * L * L)) * C_L * rg;
    const f = fEB / Math.sqrt(1 + (k * rg) ** 2 * (1 + EG / kappa));
    const shape = cantilever ? cantileverShape : freeFreeShape;
    push(s, f, t60Of(f, eta0, eta1), M, shape(n, x0), gain * shape(n, xm));
  }
  return s;
}

export function axialModes({ L, c, M, x0, xm, nModes, eta0, eta1, gain }) {
  const s = set();
  for (let n = 1; n <= nModes; n++) {
    const f = (n * c) / (2 * L);
    push(s, f, t60Of(f, eta0, eta1), M / 2, Math.cos(n * Math.PI * x0), gain * Math.cos(n * Math.PI * xm));
  }
  return s;
}

// Thin cylindrical shell, simply supported ends, Donnell-Mushtari frequency equation (Soedel):
// w^2 = E/(rho R^2 (1-nu^2)) * [ (1-nu^2) l^4/(l^2+n^2)^2 + kk (l^2+n^2)^2 ],  l = m pi R/L, kk = h^2/(12 R^2).
export function shellModes({ R, L, h, z0, zm, thm, mMax, nMax, eta0, eta1, gain, fMax = NYQ_SAFE }) {
  const s = set();
  const M = rho * 2 * Math.PI * R * L * h;
  const kk = (h * h) / (12 * R * R);
  const c2 = E / (rho * R * R * (1 - nu * nu));
  for (let m = 1; m <= mMax; m++) {
    const l = (m * Math.PI * R) / L, l2 = l * l;
    for (let n = 2; n <= nMax; n++) {
      const q = l2 + n * n;
      const f = Math.sqrt(c2 * (((1 - nu * nu) * l2 * l2) / (q * q) + kk * q * q)) / (2 * Math.PI);
      if (f > fMax) continue;
      const phi = Math.sin((m * Math.PI * z0) / L);
      const out = gain * Math.sin((m * Math.PI * zm) / L) * Math.cos(n * thm);
      // Each (m,n) is a degenerate cos/sin pair; only the cos partner is struck at theta = 0.
      push(s, f, t60Of(f, eta0, eta1), M / 4, phi, out);
    }
  }
  return s;
}

// Rectangular plate, simply supported approximation of the edges. f_mn = (pi/2) sqrt(D/rho h) ((m/a)^2 + (n/b)^2).
// Above fAll the dense mode set is thinned at random to about `keep` modes; kept modes are scaled up
// by 1/sqrt(p) so the spectral energy density is preserved.
export function plateModes({ a, b, h, x0, y0, xm, ym, fAll, fMax, keep, eta0, eta1, cap, gain, rand }) {
  const s = set();
  const beta = h * Math.sqrt(E / (12 * rho * (1 - nu * nu)));
  const M = rho * a * b * h;
  const kMax = Math.sqrt((2 * Math.PI * fMax) / beta);
  const cand = [];
  for (let m = 1; m <= Math.ceil((kMax * a) / Math.PI); m++) {
    for (let n = 1; n <= Math.ceil((kMax * b) / Math.PI); n++) {
      const k2 = (m * Math.PI / a) ** 2 + (n * Math.PI / b) ** 2;
      const f = (beta * k2) / (2 * Math.PI);
      if (f <= fMax) cand.push([m, n, k2, f]);
    }
  }
  // Thinning keeps about the same number of modes per critical band: p(f) ~ 1/f above fAll.
  let wsum = 0;
  for (const c of cand) if (c[3] > fAll) wsum += fAll / c[3];
  const q = wsum > 0 ? keep / wsum : 1;
  for (const [m, n, k2, f] of cand) {
    const p = f > fAll ? Math.min(1, (q * fAll) / f) : 1;
    if (p < 1 && rand() > p) continue;
    const w = 1 / Math.sqrt(p);
    const phi = Math.sin((m * Math.PI * x0) / a) * Math.sin((n * Math.PI * y0) / b);
    const out = gain * w * Math.sin((m * Math.PI * xm) / a) * Math.sin((n * Math.PI * ym) / b);
    const len = s.f.length;
    push(s, f, t60Of(f, eta0, eta1, cap), M / 4, phi, out, k2, 0.25 / p);
    if (s.f.length > len) { (s.km ??= []).push((m * Math.PI) / a); (s.kn ??= []).push((n * Math.PI) / b); }
  }
  return s;
}

// Clamped circular plate. lambda^2 from Leissa's tables for the lowest modes, asymptotic
// lambda ~ pi (s + n/2) beyond. Modal mass about 0.18 M for the fundamental; 0.2 M used throughout.
const CLAMPED = { '0,1': 10.2158, '1,1': 21.26, '2,1': 34.88, '0,2': 39.771, '3,1': 51.04, '1,2': 60.82, '4,1': 69.666, '2,2': 84.58, '0,3': 89.104, '5,1': 90.739 };
export function clampedDisk({ a, h, r0, rm, fMax, eta0, eta1, cap, gain, nMax = 12, sMax = 6 }) {
  const s = set();
  const beta = h * Math.sqrt(E / (12 * rho * (1 - nu * nu)));
  const M = rho * Math.PI * a * a * h;
  for (let n = 0; n <= nMax; n++) {
    for (let k = 1; k <= sMax; k++) {
      const lam2 = CLAMPED[`${n},${k}`] ?? (Math.PI * (k + n / 2)) ** 2;
      const f = (lam2 * beta) / (2 * Math.PI * a * a);
      if (f > fMax) continue;
      const lam = Math.sqrt(lam2);
      // Radial shape approximated by a Bessel-like oscillation that vanishes at the clamped rim.
      const rad = (r) => (r < 1e-6 && n > 0 ? 0 : Math.cos(lam * r - (n + 0.5) * Math.PI / 2) * Math.sqrt(1 / Math.max(lam * r, 0.5)) * (1 - r ** 2));
      push(s, f, t60Of(f, eta0, eta1, cap), M * 0.2, rad(r0) * 1.6, gain * rad(rm) * 1.6, lam2 / (a * a));
    }
  }
  return s;
}

// Closed air cylinder: f = c/(2 pi) sqrt((alpha/R)^2 + (p pi/L)^2).
export function cavityModes({ R, L, gain, t60 }) {
  const s = set();
  const c = 343;
  for (const alpha of [0, 1.841, 3.054, 3.832]) {
    for (let p = alpha === 0 ? 1 : 0; p <= 2; p++) {
      const f = (c / (2 * Math.PI)) * Math.sqrt((alpha / R) ** 2 + ((p * Math.PI) / L) ** 2);
      push(s, f, t60, 1, 1, gain / (1 + p + alpha));
    }
  }
  return s;
}

// Thin ring flexural modes (Rayleigh / Hoppe): w = (c rg / R^2) n(n^2-1)/sqrt(n^2+1) in plane,
// out of plane n(n^2-1)/sqrt(n^2+1+nu).
export function ringModes({ R, rg, M, nMax, split, eta0, eta1, gain, rand }) {
  const s = set();
  const w1 = (C_L * rg) / (R * R);
  for (let n = 2; n <= nMax; n++) {
    for (const plane of [0, 1]) {
      const den = plane ? Math.sqrt(n * n + 1 + nu) : Math.sqrt(n * n + 1);
      const f = (w1 * n * (n * n - 1)) / den / (2 * Math.PI);
      for (const sg of [-1, 1]) {
        const fs = f * (1 + sg * split * (0.5 + rand()) / n);
        push(s, fs, t60Of(fs, eta0, eta1), M / 2, rand() * 2 - 1, gain * (rand() * 2 - 1));
      }
    }
  }
  return s;
}

export { C_L, C_T };
