import { SR, rng } from '../../lib/audio.mjs';

// Synthetic soundboard: a ribbed plate with roughly constant modal density.
// Its driving-point admittance gives per-partial gain, bridge loss and frequency pull;
// the lowest modes also ring as a body "knock" excited by the hammer force.
const modes = [];
{
  const r = rng(90217);
  let f = 48;
  while (f < 7000) {
    modes.push({ f: f * (1 + 0.12 * (r() - 0.5)), eta: 0.016 + 0.024 * Math.min(1, f / 2500), a: 0.4 + r() });
    f += 17 + f * 0.0045;
  }
}

function admittance(f) {
  const w = 2 * Math.PI * f;
  let re = 0, im = 0;
  for (const m of modes) {
    const wj = 2 * Math.PI * m.f;
    // Y = a * i w / (wj^2 - w^2 + i eta wj w)
    const dr = wj * wj - w * w, di = m.eta * wj * w;
    const den = dr * dr + di * di;
    const nr = 0, ni = m.a * w;
    re += (nr * dr + ni * di) / den;
    im += (ni * dr - nr * di) / den;
  }
  return [re, im];
}

const GN = 900, F_LO = 20, F_HI = 20000;
const gridF = Float64Array.from({ length: GN }, (_, i) => F_LO * (F_HI / F_LO) ** (i / (GN - 1)));
const gain = new Float64Array(GN), lossMod = new Float64Array(GN), pull = new Float64Array(GN);
{
  const absY = new Float64Array(GN), reY = new Float64Array(GN), imY = new Float64Array(GN);
  for (let i = 0; i < GN; i++) {
    const [re, im] = admittance(gridF[i]);
    reY[i] = re; imY[i] = im; absY[i] = Math.hypot(re, im);
  }
  const half = Math.round(GN / Math.log2(F_HI / F_LO) / 3); // +-1/3 octave smoothing
  for (let i = 0; i < GN; i++) {
    let sa = 0, sr = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(GN - 1, i + half); j++) { sa += absY[j]; sr += reY[j]; n++; }
    sa /= n; sr /= n;
    gain[i] = Math.min(2.5, Math.max(0.3, Math.sqrt(absY[i] / sa)));
    lossMod[i] = Math.min(3, Math.max(0.3, reY[i] / sr)) ** 0.6;
    pull[i] = Math.max(-1.5, Math.min(1.5, imY[i] / sr));
  }
}

function lookup(table, f) {
  const x = Math.log(Math.max(F_LO, Math.min(F_HI, f)) / F_LO) / Math.log(F_HI / F_LO) * (GN - 1);
  const i = Math.min(GN - 2, Math.floor(x)), t = x - i;
  return table[i] + t * (table[i + 1] - table[i]);
}

// Radiation: a finite board radiates bass fundamentals poorly (dipole-like below ~110 Hz).
export function bodyGain(f) {
  const x = (f / 110) ** 2;
  return lookup(gain, f) * (x / (1 + x)) / Math.sqrt(1 + (f / 7500) ** 2);
}
export const bridgeLossMod = (f) => lookup(lossMod, f);
export const bridgePull = (f) => lookup(pull, f);

// Rings the soundboard modes with the hammer force (action/board thump).
export function knock(force, length, gainScale) {
  const out = new Float64Array(length);
  for (const m of modes) {
    const w = 2 * Math.PI * m.f, s = 0.5 * m.eta * w * 1.5;
    const cr = Math.exp(-s / SR) * Math.cos(w / SR), ci = Math.exp(-s / SR) * Math.sin(w / SR);
    const g = gainScale * m.a / Math.sqrt(m.f / 100);
    let zr = 0, zi = 0;
    const nEnd = Math.min(length, force.length + Math.ceil(SR * 9.2 / s));
    for (let i = 0; i < nEnd; i++) {
      const x = i < force.length ? force[i] : 0;
      const nr = zr * cr - zi * ci + x * g, ni = zr * ci + zi * cr;
      zr = nr; zi = ni;
      out[i] += zi;
    }
  }
  return out;
}
