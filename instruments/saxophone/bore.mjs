import { Delay } from '../trumpet/dsp.mjs';

export const C = 343;

// Bore and reed settings per preset. x0: effective length of the missing cone tip (apex to
// mouthpiece) in metres, [low notes, high notes, from midi, to midi]. fc: tone-hole lattice cutoff
// at the lowest note. kappa: wall loss, exp(-kappa L sqrt(f)) per round trip. gamma/zeta: blowing
// pressure and reed opening at velocity 0 and 1 (dimensionless). brk: first note on the second
// register. tone: radiation low-pass (Hz) and level: radiated level, both at velocity 0 and 1.
export const PRESETS = {
  alto: { x0: [0.21, 0.08, 62, 76], fc: 1800, kappa: 0.004, gamma: [0.38, 0.42], zeta: [0.7, 1.1], brk: 65, breath: 0.3, vib: 0.45, growl: 0, tone: [2500, 7500], level: [0.3, 1], gain: 3.95 },
  tenor: { x0: [0.24, 0.08, 58, 74], fc: 1500, kappa: 0.004, gamma: [0.38, 0.42], zeta: [0.7, 1.1], brk: 60, breath: 0.3, vib: 0.45, growl: 0, tone: [2200, 7000], level: [0.3, 1], gain: 4.33 },
  soft: { x0: [0.24, 0.08, 58, 74], fc: 1100, kappa: 0.005, gamma: [0.38, 0.41], zeta: [0.65, 0.9], brk: 60, breath: 0.9, vib: 0.6, growl: 0, tone: [1500, 3000], level: [0.3, 0.7], gain: 11.6 },
  growl: { x0: [0.24, 0.08, 58, 74], fc: 1500, kappa: 0.004, gamma: [0.38, 0.42], zeta: [0.7, 1.1], brk: 60, breath: 0.45, vib: 0.2, growl: 0.8, tone: [3000, 7500], level: [0.4, 1], gain: 4.22 },
};

export function tipLength([lo, hi, m0, m1], midi) {
  const t = Math.max(0, Math.min(1, (midi - m0) / (m1 - m0)));
  return lo + (hi - lo) * t * t * (3 - 2 * t);
}

// Quasi-static reed flow (dimensionless): dp = mouth pressure minus mouthpiece pressure,
// closed at dp >= 1.
export function reedFlow(dp, zeta) {
  if (dp >= 1) return 0;
  if (dp >= 0) return zeta * (1 - dp) * Math.sqrt(dp);
  return -zeta * (1 - dp) * Math.sqrt(-dp);
}

// Pressure across the reed: solves G (gamma - x) - a = F(x) for x = gamma - p, where the
// mouthpiece pressure is p = (a + u) / G. Strictly decreasing in x as long as zeta < G.
export function solveReed(gamma, a, G, zeta) {
  const xs = gamma - a / G;
  if (xs >= 1) return xs;
  let lo, hi;
  if (xs >= 0) { lo = 0; hi = xs; } else { lo = xs; hi = 0; }
  for (let i = 0; i < 28; i++) {
    const x = 0.5 * (lo + hi);
    if (G * (gamma - x) - a - reedFlow(x, zeta) > 0) lo = x; else hi = x;
  }
  return 0.5 * (lo + hi);
}

// Visco-thermal wall loss over a round trip, exp(-kappa L sqrt(f)), fitted by a gain and a one-pole
// low-pass at f1 and 6 f1.
export function wallLoss(L, f1, kappa) {
  const f2 = 6 * f1, D = kappa * L * (Math.sqrt(f2) - Math.sqrt(f1));
  const lhs = (fc) => 0.5 * (Math.log(1 + (f2 / fc) ** 2) - Math.log(1 + (f1 / fc) ** 2));
  let lo = Math.log(20), hi = Math.log(40000);
  for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); if (lhs(Math.exp(m)) > D) lo = m; else hi = m; }
  const fc = Math.exp(0.5 * (lo + hi));
  const g = Math.exp(-kappa * L * Math.sqrt(f1)) * Math.sqrt(1 + (f1 / fc) ** 2);
  return { g: Math.min(0.995, g), fc };
}

// Complete cone seen from the mouthpiece, in spherical-wave variables (Zc = 1 at the throat).
// The truncated cone of length L is a cylinder of length L in parallel with the apex inertance;
// the mouthpiece stands in for the missing tip of length x0. Together these two are exactly a
// second, open cylinder of length x0 in parallel: Y = -j (cot kL + cot k x0). A register vent
// (inertive shunt) can sit at distance xv from the mouthpiece.
export class ConeBore {
  constructor({ L, x0, xv, holeK, filters, loss, tau, rs, maxScale }) {
    this.rs = rs; this.L = L; this.x0 = x0; this.loss = loss; this.filters = filters; this.holeK = holeK; this.tau = tau;
    this.d1 = Math.max(2, xv / C * rs);
    this.dA = Math.max(2, 2 * x0 / C * rs);
    this.s = 1;
    const dMax = Math.ceil(this.d2(maxScale)) + 8, d1Max = Math.ceil(this.d1 * maxScale) + 8;
    this.Af = new Delay(d1Max); this.Ab = new Delay(d1Max);
    this.Bf = new Delay(dMax); this.Bb = new Delay(dMax);
    this.Sf = new Delay(Math.ceil(this.dA * maxScale) + 8);
    this.uh = 0; this.pm = 0; this.sm = 0;
    this.G = 2;
  }
  // scale stretches the whole instrument (tip and vent position included).
  d2(scale) { return Math.max(2, this.L * scale / C * this.rs - this.d1 * scale - this.tau / 2); }
  // Known part of the throat equation p = (a + u) / G, with u the reed flow.
  begin(scale) {
    this.s = scale;
    this.pm = this.Ab.read(this.d1 * scale);
    this.sm = -this.Sf.read(this.dA * scale);
    return 2 * (this.pm + this.sm);
  }
  // Advance one sample with the throat pressure p; returns the flow leaving the open end.
  end(p) {
    const scale = this.s;
    this.Af.write(p - this.pm);
    this.Sf.write(p - this.sm);
    const d2 = this.d2(scale);
    const a1 = this.Af.read(this.d1 * scale), a2 = this.Bb.read(d2);
    const pj = (a1 + a2 - 0.5 * this.uh) / (1 + 0.5 * this.holeK);
    this.uh = 0.9995 * this.uh + this.holeK * pj;
    this.Ab.write(pj - a1);
    this.Bf.write(pj - a2);
    const xe = this.Bf.read(d2);
    let r = xe;
    for (const f of this.filters) r = f.tick(r);
    r *= -this.loss;
    this.Bb.write(r);
    return xe - r;
  }
}
