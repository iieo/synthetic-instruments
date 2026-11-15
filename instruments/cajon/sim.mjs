/*
 Time-domain simulation of the coupled cajon at an oversampled rate:
 - tapa plate modes (mass-normalised, damped oscillators, symplectic Euler with pre-warped stiffness),
 - Helmholtz resonator: cavity pressure from the volume swept by plate and port plug,
 - four higher cavity modes in stiffness form (U_j follows the plate projection below resonance),
 - four snare wires as small sprung masses pressed against the inside of the plate with a one-sided
   Hertz contact force K * delta^1.5.
 Couplings are unrolled to four wires and four cavity modes (unused ones have zero coupling).
 The output is the radiated volume velocity (plate monopole, port, weighted higher modes), which the
 caller differentiates and decimates.
*/
export function simulate(s) {
  const { fs, len, K, Klow, w2, damp, invM, eA, eB, fA, fB, vol, rad, cav, wph, wires,
    kH, S, mh, Rh, portG, kap, cw2, cz, wire } = s;
  const dt = 1 / fs, N = Math.round(len * fs);
  const q = new Float64Array(K), v = new Float64Array(K);
  const [c0, c1, c2, c3] = cav, [p0w, p1w, p2w, p3w] = wph;
  const U = new Float64Array(4), Uv = new Float64Array(4), proj = new Float64Array(4);
  const u = new Float64Array(4), uv = new Float64Array(4), fc = new Float64Array(4), wc = new Float64Array(4);
  const { mw, kw, rw, rest, Kc } = wire;
  const nC = Math.max(fA.length, fB.length);
  const out = new Float64Array(N);
  let xh = 0, vh = 0, volNow = 0, peak = 0, quiet = 0;
  const hold = Math.round(0.05 * fs);
  const settle = wires ? Math.round(0.015 * fs) : 0;
  for (let n = -settle; n < N; n++) {
    const kd = n < 0 ? 0.97 : 1;
    const FA = n >= 0 && n < fA.length ? fA[n] : 0, FB = n >= 0 && n < fB.length ? fB[n] : 0;
    const pH = kH * (volNow + S * xh);
    const P0 = kap[0] * (proj[0] - U[0]), P1 = kap[1] * (proj[1] - U[1]);
    const P2 = kap[2] * (proj[2] - U[2]), P3 = kap[3] * (proj[3] - U[3]);
    let acc = 0, vs = 0, j0 = 0, j1 = 0, j2 = 0, j3 = 0;
    if (wires) {
      for (let c = 0; c < 4; c++) {
        const d = wc[c] - u[c];
        const f = d > 0 ? Kc * d * Math.sqrt(d) : 0;
        fc[c] = f;
        uv[c] = kd * (uv[c] + dt * ((f - kw[c] * (u[c] - rest[c]) - rw[c] * uv[c]) / mw[c]));
        u[c] += dt * uv[c];
      }
      const f0 = fc[0], f1 = fc[1], f2 = fc[2], f3 = fc[3];
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let k = 0; k < Klow; k++) {
        const f = (eA[k] * FA + eB[k] * FB) - vol[k] * pH - p0w[k] * f0 - p1w[k] * f1 - p2w[k] * f2 - p3w[k] * f3
          - c0[k] * P0 - c1[k] * P1 - c2[k] * P2 - c3[k] * P3;
        const vk = kd * (v[k] + dt * (f * invM[k] - w2[k] * q[k] - damp[k] * v[k]));
        const qk = q[k] + dt * vk;
        v[k] = vk; q[k] = qk;
        vs += vol[k] * qk;
        j0 += c0[k] * qk; j1 += c1[k] * qk; j2 += c2[k] * qk; j3 += c3[k] * qk;
        a0 += p0w[k] * qk; a1 += p1w[k] * qk; a2 += p2w[k] * qk; a3 += p3w[k] * qk;
        acc += rad[k] * vk;
      }
      for (let k = Klow; k < K; k++) {
        const f = (eA[k] * FA + eB[k] * FB) - vol[k] * pH - p0w[k] * f0 - p1w[k] * f1 - p2w[k] * f2 - p3w[k] * f3;
        const vk = kd * (v[k] + dt * (f * invM[k] - w2[k] * q[k] - damp[k] * v[k]));
        const qk = q[k] + dt * vk;
        v[k] = vk; q[k] = qk;
        vs += vol[k] * qk;
        a0 += p0w[k] * qk; a1 += p1w[k] * qk; a2 += p2w[k] * qk; a3 += p3w[k] * qk;
        acc += rad[k] * vk;
      }
      wc[0] = a0; wc[1] = a1; wc[2] = a2; wc[3] = a3;
    } else {
      for (let k = 0; k < Klow; k++) {
        const f = (eA[k] * FA + eB[k] * FB) - vol[k] * pH - c0[k] * P0 - c1[k] * P1 - c2[k] * P2 - c3[k] * P3;
        const vk = v[k] + dt * (f * invM[k] - w2[k] * q[k] - damp[k] * v[k]);
        const qk = q[k] + dt * vk;
        v[k] = vk; q[k] = qk;
        vs += vol[k] * qk;
        j0 += c0[k] * qk; j1 += c1[k] * qk; j2 += c2[k] * qk; j3 += c3[k] * qk;
        acc += rad[k] * vk;
      }
      for (let k = Klow; k < K; k++) {
        const f = (eA[k] * FA + eB[k] * FB) - vol[k] * pH;
        const vk = v[k] + dt * (f * invM[k] - w2[k] * q[k] - damp[k] * v[k]);
        const qk = q[k] + dt * vk;
        v[k] = vk; q[k] = qk;
        vs += vol[k] * qk;
        acc += rad[k] * vk;
      }
    }
    volNow = vs; proj[0] = j0; proj[1] = j1; proj[2] = j2; proj[3] = j3;
    vh = kd * (vh + dt * ((-pH * S - Rh * vh) / mh));
    xh += dt * vh;
    for (let j = 0; j < 4; j++) {
      Uv[j] = kd * (Uv[j] + dt * (cw2[j] * (proj[j] - U[j]) - cz[j] * Uv[j]));
      U[j] += dt * Uv[j];
    }
    if (n >= 0) {
      const o = acc - portG * S * vh;
      out[n] = o;
      const a = Math.abs(o);
      if (a > peak) peak = a;
      if (a > 1e-4 * peak) quiet = 0;
      else if (++quiet > hold && n > nC) return out.subarray(0, n + 1);
    }
  }
  return out;
}
