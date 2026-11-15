import { SR } from '../../lib/audio.mjs';

// Nonlinear felt hammer striking a modal string (all unison strings lumped into one).
// Each string mode is advanced with the exact solution of a harmonic oscillator under a
// force held constant over one sub-step, so the scheme stays stable for any mode frequency.
// Returns the modal state after the contact window as complex amplitudes Z_n,
// with q_n(t) = Re(Z_n * exp(i w_n (t - tEnd))).
export function strike({ omega, phi, modalMass, weights, mH, K, p, v0, os = 8, maxMs = 10 }) {
  const N = omega.length, h = 1 / (SR * os);
  const q = new Float64Array(N), v = new Float64Array(N);
  const c = new Float64Array(N), s = new Float64Array(N), gEq = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    c[n] = Math.cos(omega[n] * h); s[n] = Math.sin(omega[n] * h);
    gEq[n] = phi[n] / (modalMass * omega[n] * omega[n]);
  }
  const maxSamples = Math.round(maxMs * 1e-3 * SR);
  const out = new Float64Array(maxSamples), force = new Float64Array(maxSamples);
  let yH = 0, vH = v0, contactEnded = false, everContact = false, nWin = maxSamples;
  for (let k = 0; k < maxSamples; k++) {
    let fAcc = 0;
    for (let sub = 0; sub < os; sub++) {
      let ys = 0;
      for (let n = 0; n < N; n++) ys += phi[n] * q[n];
      const d = yH - ys;
      const F = d > 0 ? K * d ** p : 0;
      if (F > 0) everContact = true;
      fAcc += F;
      for (let n = 0; n < N; n++) {
        const qe = F * gEq[n], x = q[n] - qe, w = omega[n];
        q[n] = qe + x * c[n] + (v[n] / w) * s[n];
        v[n] = -x * w * s[n] + v[n] * c[n];
      }
      vH -= (F / mH) * h;
      yH += vH * h;
    }
    force[k] = fAcc / os;
    let o = 0;
    for (let n = 0; n < N; n++) o += weights[n] * q[n];
    out[k] = o;
    if (everContact && force[k] === 0) contactEnded = true;
    // Stop once the hammer has left and fallen clearly behind the string.
    if (contactEnded && k > 24) {
      let ys = 0;
      for (let n = 0; n < N; n++) ys += phi[n] * q[n];
      if (yH - ys < -4e-4 && vH < 0) { nWin = k + 1; break; }
    }
  }
  const Zr = new Float64Array(N), Zi = new Float64Array(N);
  for (let n = 0; n < N; n++) { Zr[n] = q[n]; Zi[n] = -v[n] / omega[n]; }
  return { Zr, Zi, out: out.subarray(0, nWin), force: force.subarray(0, nWin), nWin, vRebound: vH };
}
