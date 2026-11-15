import { SR } from '../../lib/audio.mjs';
import { contactWeight, t60ToDecay } from './dsp.mjs';

// Zeros j_mn of the Bessel function J_m (tabulated for the lowest modes, McMahon expansion beyond).
const TABLE = [
  [2.4048, 5.5201, 8.6537, 11.7915, 14.9309],
  [3.8317, 7.0156, 10.1735, 13.3237, 16.4706],
  [5.1356, 8.4172, 11.6198, 14.7960, 17.9598],
  [6.3802, 9.7610, 13.0152, 16.2235, 19.4094],
  [7.5883, 11.0647, 14.3725, 17.6160, 20.8269],
  [8.7715, 12.3386, 15.7002, 18.9801, 22.2178],
  [9.9361, 13.5893, 17.0038, 20.3208, 23.5861],
  [11.0864, 14.8213, 18.2876, 21.6415, 24.9349],
  [12.2251, 16.0378, 19.5545, 22.9452, 26.2668],
];
function besselZero(m, n) {
  if (m < TABLE.length && n <= 5) return TABLE[m][n - 1];
  const b = (n + m / 2 - 0.25) * Math.PI, mu = 4 * m * m;
  return b - (mu - 1) / (8 * b) - (4 * (mu - 1) * (7 * mu - 31)) / (3 * (8 * b) ** 3);
}
export function besselJ(m, x) {
  let term = 1; for (let k = 1; k <= m; k++) term *= x / 2 / k;
  let sum = term;
  for (let k = 1; k < 80; k++) {
    term *= -(x * x) / 4 / (k * (k + m));
    sum += term;
    if (Math.abs(term) < 1e-14 * Math.abs(sum) && k > x) break;
  }
  return sum;
}

export function membraneModes(maxRatio) {
  const j01 = TABLE[0][0], modes = [];
  for (let m = 0; m < 60; m++) {
    if (besselZero(m, 1) / j01 > maxRatio) break;
    for (let n = 1; n < 30; n++) {
      const j = besselZero(m, n);
      if (j / j01 > maxRatio) break;
      modes.push({ m, n, j, ratio: j / j01 });
    }
  }
  return modes.sort((a, b) => a.ratio - b.ratio);
}

/*
 Ideal membrane modes with:
 - strike position rho (0 centre, 1 edge): mode amplitude ~ J_m(j*rho), times sqrt(j) for mode-shape normalisation,
 - half-sine contact force of duration T (low-pass weighting),
 - radiation efficiency falling with m (higher multipoles radiate poorly below coincidence),
 - air loading: the surrounding air mass lowers the lowest modes most; the enclosed air stiffens axisymmetric (m=0) modes,
 - tension modulation: large displacement raises tension, pitch glides down as the amplitude decays.
*/
export function membrane(o) {
  const { f0, maxRatio, rho, T, amp, t60, glide = 0, glideTau = 0.05, len, r,
    massLoad = 0, airStiff = 0, radM = [1, 0.6, 0.4, 0.3], jitter = 0.004, hiCut = 1e9 } = o;
  const modes = membraneModes(maxRatio);
  const n = Math.round(len * SR);
  const out = new Float64Array(n);
  const tau = glideTau * SR;
  const phi = new Float64Array(n);
  for (let i = 0; i < n; i++) phi[i] = (2 * Math.PI / SR) * (i + glide * tau * (1 - Math.exp(-i / tau)));
  const used = [];
  const loaded = (md) => md.ratio / (1 + massLoad / md.ratio) * (md.m === 0 ? 1 + airStiff / md.n : 1);
  const ref = loaded(modes[0]);
  for (const md of modes) {
    const f = f0 * (loaded(md) / ref) * (1 + jitter * (r() - 0.5) * 2);
    if (f > hiCut) continue;
    const shape = besselJ(md.m, md.j * rho) * Math.sqrt(md.j);
    const rad = radM[Math.min(md.m, radM.length - 1)];
    const a = amp * shape * rad * contactWeight(f, T) * (0.9 + 0.2 * r());
    if (Math.abs(a) < 1e-5 * amp) continue;
    const d = t60ToDecay(t60(f, md));
    let e = a;
    const lim = Math.min(n, Math.ceil(Math.log(1e-5) / Math.log(d)));
    for (let i = 0; i < lim; i++) { out[i] += e * Math.sin(f * phi[i]); e *= d; }
    used.push({ ...md, f, a, d });
  }
  return { out, modes: used, phi };
}
