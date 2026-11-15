import { SR } from '../../lib/audio.mjs';

const TAU = 2 * Math.PI;

// Exact one-step propagator of a damped oscillator q'' + 2a q' + w^2 q = 0 over h seconds,
// so pitch and decay stay exact; only the nonlinear and contact forces are integrated numerically.
export function propagator(w, t60, h) {
  const a = 6.907755 / t60;
  const wd = Math.sqrt(Math.max(1e-9, w * w - a * a));
  const e = Math.exp(-a * h), c = Math.cos(wd * h), s = Math.sin(wd * h);
  return {
    qq: e * (c + (a / wd) * s), qp: e * (s / wd),
    pq: -e * (w * w / wd) * s, pp: e * (c - (a / wd) * s),
  };
}

export function step(m, P) {
  const q = m.q, p = m.p;
  m.q = P.qq * q + P.qp * p;
  m.p = P.pq * q + P.pp * p;
}

// One linear resonator family (a neighbouring note area, the skirt, shell modes):
// a struck-area quantity drives them, they never act back (weak coupling).
export function makeBank(list, h) {
  return list.map((r) => ({ ...r, w: TAU * r.f, q: 0, p: 0, P: propagator(TAU * r.f, r.t60, h) }));
}

export { TAU, SR };
