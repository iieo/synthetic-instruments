import { SR, midiToHz } from '../../lib/audio.mjs';
import { besselJ } from '../drums/membrane.mjs';

// Bessel zeros j_mn by bisection on J_m, bracketed by sign changes on a fine grid.
const ZEROS = (() => {
  const z = [];
  for (let m = 0; m <= 12; m++) {
    const row = [];
    let x = m + 0.5, prev = besselJ(m, x);
    while (row.length < 3 && x < 20) {
      const x2 = x + 0.05, v = besselJ(m, x2);
      if (prev !== 0 && Math.sign(v) !== Math.sign(prev)) {
        let lo = x, hi = x2;
        for (let k = 0; k < 50; k++) { const mid = 0.5 * (lo + hi); if (Math.sign(besselJ(m, mid)) === Math.sign(besselJ(m, lo))) lo = mid; else hi = mid; }
        row.push(0.5 * (lo + hi));
      }
      x = x2; prev = v;
    }
    z.push(row);
  }
  return z;
})();

// Air loading. The air on both sides of the head moves with it and adds mass per unit area that
// falls with the wavenumber, sigma_eff = sigma (1 + EPS / j^P). Fitting EPS and P to the measured
// ratios of the (m,1) modes (about 1 : 1.5 : 2 : 2.44 : 2.94) gives EPS = 9.33, P = 1.56; the
// residual is below 0.5 % for m = 1..5. Axisymmetric modes change the volume of the kettle, and
// the enclosed air stiffens them, which pushes (0,1) up to about 1.7 times the principal.
const EPS = 9.33, P = 1.56, AIR_K01 = 2.64;
export const loadFactor = (j) => 1 + EPS / j ** P;

const MYLAR = { E: 4.5e9, h: 1.9e-4, nu: 0.35, rho: 1390 };

// Mode table for a head of radius a tuned so that the (1,1) mode sits at midi.
// Strike at radius rho (0 centre, 1 rim) and angle th.
export function headModes(midi, a) {
  const f11 = midiToHz(midi);
  const sigma = MYLAR.rho * MYLAR.h;
  const j11 = ZEROS[1][0];
  const w11sq = j11 * j11 / loadFactor(j11);
  const list = [];
  for (let m = 0; m < ZEROS.length; m++) {
    for (let n = 1; n <= ZEROS[m].length; n++) {
      const j = ZEROS[m][n - 1];
      if (j / j11 > 4.6) continue;
      let r2 = (j * j / loadFactor(j)) / w11sq;
      if (m === 0) r2 += AIR_K01 * (ZEROS[0][0] / j) ** 2;
      const f = f11 * Math.sqrt(r2);
      if (f > 0.45 * SR) continue;
      const N = besselJ(m + 1, j) ** 2 * (m === 0 ? 1 : 0.5);
      const sEff = sigma * loadFactor(j);
      list.push({ m, n, j, f, ratio: f / f11, k2: (j / a) ** 2, N, M: sEff * Math.PI * a * a * N, sEff });
    }
  }
  return list.sort((x, y) => x.f - y.f);
}

// Membrane stretching (Kirchhoff-Carrier): the extra tension is E h S / (2 (1 - nu)) with S the
// mean square slope of the head. With the effective mass of the principal mode this is the
// Berger coefficient of the modal bank, scaled by `soft` because the rim and the felt collar
// take up part of the stretch.
export function stretchCoef(modes, soft = 1) {
  const p = modes.find((md) => md.m === 1 && md.n === 1);
  return (soft * MYLAR.E * MYLAR.h) / (2 * (1 - MYLAR.nu) * p.sEff);
}
