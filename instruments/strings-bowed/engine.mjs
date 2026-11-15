import { SR } from '../../lib/audio.mjs';

// Friction curve: mu(x) = sign(x) * (muD + (muS - muD) * v0 / (v0 + |x|)), x = bow minus string velocity.
// Positive-slip solution of  a - x = k * mu(x)  (a: slip if the bow exerted no force).
function slipRoot(a, k, muS, muD, v0) {
  const B = a - v0 - k * muD;
  const D = B * B + 4 * v0 * (a - k * muS);
  if (D < 0) return -1;
  const r = 0.5 * (B + Math.sqrt(D));
  return r > 0 ? r : -1;
}

// One bowed string as two waveguide segments that meet at the bow.
// ctl arrays (per sample): f0 [Hz], vb (signed bow velocity), k (bow force / 2Z).
export function bowString(ctl, p) {
  const { f0, vb, k, v0s } = ctl;
  const n = f0.length;
  const out = new Float64Array(n);
  const { beta, muS = 0.8, muD = 0.3, noise, rnd } = p;

  let fMin = Infinity;
  for (let i = 0; i < n; i++) if (f0[i] < fMin) fMin = f0[i];
  const fRef = p.bowRefHz ?? fMin;
  const Lb = Math.max(1, Math.round((beta * SR) / fRef / 2));

  const bufB = new Float64Array(Lb + 1);
  const bufB2 = new Float64Array(Lb + 1);
  let iB = 0;
  const nutLen = Math.ceil(SR / fMin) + 8;
  const bufN = new Float64Array(nutLen);
  let iN = 0;

  // Bridge reflection: -g * one-pole lowpass. Its phase delay at f0 is subtracted from the nut segment.
  let lpB = 0, lpN = 0;
  let noiseLp = 0;
  const lossFn = p.loss;

  // Torsional waves: the bow drives the string surface, which also rolls. Torsion travels
  // faster (speedRatio) and is strongly damped; it adds a second, lossy impedance at the contact
  // that absorbs the secondary slips responsible for multi-slip motion.
  const eps = p.torsion ?? 0;
  const ratio = p.torsionSpeed ?? 5;
  const gT = p.torsionLoss ?? 0.6;
  const LtB = Math.max(1, Math.round((2 * Lb) / ratio));
  const LtN = Math.max(1, Math.round((SR / fRef - 2 * Lb) / ratio));
  const tB = new Float64Array(LtB), tN = new Float64Array(LtN);
  let lpTB = 0, lpTN = 0;

  let state = 0;
  for (let i = 0; i < n; i++) {
    const f = f0[i];
    const P = SR / f;
    const { g, a: aB, gN, aN } = lossFn(f, i);
    const tauB = phaseDelay(aB, f);
    const tauN = phaseDelay(aN, f);
    // Two integer bridge delays, nut round trip, filters and the one-sample write/read latency of each loop.
    let Dn = P - 2 * Lb - tauB - tauN;
    if (Dn < 3) Dn = 3;

    const vinB = bufB2[iB % (Lb + 1)];
    const rp = iN - Dn;
    const vinNraw = lagrange(bufN, nutLen, rp);
    lpN = (1 - aN) * vinNraw + aN * lpN;
    const vinN = -gN * lpN;

    const vh = vinB + vinN;
    const tinB = tB[i % LtB], tinN = tN[i % LtN];
    const wh = tinB + tinN;
    const kk = k[i] * (1 + eps);
    let delta = 0;
    if (kk > 0) {
      noiseLp += 0.08 * ((rnd() - 0.5) - noiseLp);
      const ke = kk * (1 + noise * noiseLp * 6);
      const v0 = v0s[i];
      const a = vb[i] - vh - wh;
      const lim = ke * muS;
      let x;
      if (Math.abs(a) > lim) {
        if (state === 0 && p.debug && i >= p.debug.from && i < p.debug.to) { p.debug.slips++; p.debug.t?.push(i); }
        x = a > 0 ? slipRoot(a, ke, muS, muD, v0) : -slipRoot(-a, ke, muS, muD, v0);
        state = a > 0 ? 1 : -1;
      } else if (state === 0) {
        x = 0;
      } else {
        const r = state > 0 ? slipRoot(a, ke, muS, muD, v0) : slipRoot(-a, ke, muS, muD, v0);
        if (r > 0) x = state > 0 ? r : -r;
        else { x = 0; state = 0; }
      }
      delta = (a - x) / (1 + eps);
    } else {
      state = 0;
    }

    lpTB = 0.5 * (tinN + eps * delta) + 0.5 * lpTB;
    lpTN = 0.5 * (tinB + eps * delta) + 0.5 * lpTN;
    tB[i % LtB] = -gT * lpTB;
    tN[i % LtN] = -gT * lpTN;

    const toBridge = vinN + delta;
    const toNut = vinB + delta;

    // bridge segment: toBridge travels Lb, reflects, travels Lb back
    const w = bufB[iB % (Lb + 1)];
    bufB[(iB + Lb) % (Lb + 1)] = toBridge;
    lpB = (1 - aB) * w + aB * lpB;
    const refl = -g * lpB;
    bufB2[(iB + Lb) % (Lb + 1)] = refl;
    iB++;
    out[i] = w - refl;

    bufN[iN % nutLen] = toNut;
    iN++;
  }
  return out;
}

function phaseDelay(a, f) {
  if (a <= 0) return 0;
  const w = (2 * Math.PI * f) / SR;
  // H = (1-a)/(1 - a e^{-jw}); phase = -atan(a sin w / (1 - a cos w))
  return Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w;
}

// Third-order Lagrange read at fractional position pos (absolute write index units).
function lagrange(buf, len, pos) {
  const ip = Math.floor(pos);
  const d = pos - ip + 1;
  const x0 = buf[((ip - 1) % len + len) % len];
  const x1 = buf[((ip) % len + len) % len];
  const x2 = buf[((ip + 1) % len + len) % len];
  const x3 = buf[((ip + 2) % len + len) % len];
  const c0 = (-(d - 1) * (d - 2) * (d - 3)) / 6;
  const c1 = (d * (d - 2) * (d - 3)) / 2;
  const c2 = (-d * (d - 1) * (d - 3)) / 2;
  const c3 = (d * (d - 1) * (d - 2)) / 6;
  return c0 * x0 + c1 * x1 + c2 * x2 + c3 * x3;
}
