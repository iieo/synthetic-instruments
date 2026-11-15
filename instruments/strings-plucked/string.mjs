import { SR } from '../../lib/audio.mjs';
import { onePoleMag, lowpassPhase, allpassPhase, allpassForDelay } from './filters.mjs';

// Loop gain per period for a given T60 (seconds) at fundamental f0.
const periodGain = (t60, f0) => 10 ** (-3 / (t60 * f0));

function lossFilter(f0, t60lo, t60hi, fh) {
  const w0 = 2 * Math.PI * f0 / SR, wh = 2 * Math.PI * Math.min(fh, 0.45 * SR) / SR;
  const G0 = periodGain(t60lo, f0), r = periodGain(t60hi, f0) / G0;
  let a = 0;
  if (r < 1 && wh > w0) {
    let lo = 0, hi = 0.999;
    while (onePoleMag(hi, w0) < G0 * 1.00001 && hi > 1e-6) hi *= 0.98;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (onePoleMag(m, wh) / onePoleMag(m, w0) > r) lo = m; else hi = m;
    }
    a = (lo + hi) / 2;
  }
  return { g: Math.min(0.99999, G0 / onePoleMag(a, w0)), a };
}

function loopPhase(w, d) {
  return -w * d.N + lowpassPhase(d.a, w) + d.nDisp * allpassPhase(d.cd, w) + allpassPhase(d.cf, w);
}

// Integer delay plus Thiran-style allpass so that the whole loop has exactly P samples phase delay at f0.
function tune(d, f0) {
  const P = SR / f0, w0 = 2 * Math.PI * f0 / SR;
  const fixed = -(lowpassPhase(d.a, w0) + d.nDisp * allpassPhase(d.cd, w0)) / w0;
  const rem = P - fixed;
  d.N = Math.max(1, Math.floor(rem - 0.6));
  d.cf = allpassForDelay(rem - d.N, w0);
  return d;
}

// Frequency of partial n of the loop (where the loop phase reaches -2 pi n).
function partialFreq(d, n) {
  let lo = 1e-6, hi = Math.PI;
  if (-loopPhase(hi, d) < 2 * Math.PI * n) return NaN;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (-loopPhase(m, d) < 2 * Math.PI * n) lo = m; else hi = m;
  }
  return (lo + hi) / 2 * SR / (2 * Math.PI);
}

// Designs one string loop: loss filter, stiffness allpass cascade fitted to inharmonicity B, fine tuning.
export function designLoop({ f0, t60lo, t60hi, fh = 3000, B = 0, nDisp = 0 }) {
  const { g, a } = lossFilter(f0, t60lo, t60hi, fh);
  const d = { g, a, nDisp, cd: 0, N: 0, cf: 0 };
  if (nDisp > 0 && B > 0) {
    const K = Math.max(3, Math.min(30, Math.floor(6000 / f0)));
    const err = (cd) => {
      d.cd = cd; tune(d, f0);
      if (d.N < 2) return 1e9;
      let e = 0;
      for (let n = 2; n <= K; n++) {
        const target = n * f0 * Math.sqrt((1 + B * n * n) / (1 + B));
        const got = partialFreq(d, n);
        if (!Number.isFinite(got)) return 1e9;
        e += (1200 * Math.log2(got / target)) ** 2;
      }
      return e;
    };
    let lo = -0.995, hi = 0;
    const phi = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 40; i++) {
      const m1 = hi - phi * (hi - lo), m2 = lo + phi * (hi - lo);
      if (err(m1) < err(m2)) hi = m2; else lo = m1;
    }
    d.cd = (lo + hi) / 2;
  }
  tune(d, f0);
  d.partial = (n) => partialFreq(d, n);
  return d;
}

// Runs one polarisation of the string loop. `excite` is added into the loop, `damp` gives per-sample extra loss.
export function runLoop(d, excite, length, damp) {
  const out = new Float64Array(length);
  const buf = new Float64Array(d.N);
  const b0 = d.g * (1 - d.a), a = d.a, cd = d.cd, cf = d.cf, M = d.nDisp;
  const dx = new Float64Array(M), dy = new Float64Array(M);
  let lp = 0, fx = 0, fy = 0, idx = 0;
  for (let n = 0; n < length; n++) {
    let v = buf[idx];
    lp = b0 * v + a * lp;
    v = lp;
    for (let k = 0; k < M; k++) {
      const y = cd * v + dx[k] - cd * dy[k];
      dx[k] = v; dy[k] = y; v = y;
    }
    const y = cf * v + fx - cf * fy;
    fx = v; fy = y;
    let s = y * damp[n];
    if (n < excite.length) s += excite[n];
    buf[idx] = s; out[n] = s;
    if (++idx === d.N) idx = 0;
  }
  return out;
}

// Ideal plucked-string bridge force for one period: the slope of a triangle with apex at beta,
// smoothed by the finger or plectrum contact width (Hann kernel), so harmonics fall as sin(n pi beta)/n.
export function pluckExcitation({ f0, beta, widthSec, noise = 0, noiseSec = 0.003, rand }) {
  const L = Math.max(4, Math.round(SR / f0));
  const split = beta * L;
  const shape = new Float64Array(L);
  for (let i = 0; i < L; i++) {
    const x = i + 0.5;
    shape[i] = x < split ? 1 - beta : -beta;
  }
  const W = Math.max(3, Math.round(widthSec * SR));
  const ker = new Float64Array(W);
  let ks = 0;
  for (let i = 0; i < W; i++) { ker[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 1) / (W + 1)); ks += ker[i]; }
  const out = new Float64Array(L + W);
  for (let i = 0; i < L; i++) for (let k = 0; k < W; k++) out[i + k] += shape[i] * ker[k] / ks;
  if (noise > 0) {
    const nl = Math.round(noiseSec * SR);
    let lp1 = 0, lp2 = 0;
    for (let i = 0; i < nl && i < out.length; i++) {
      const e = Math.sin(Math.PI * (i + 1) / (nl + 1)) ** 2;
      lp1 += 0.35 * ((rand() * 2 - 1) - lp1);
      lp2 += 0.35 * (lp1 - lp2);
      out[i] += noise * e * lp2;
    }
  }
  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i];
  mean /= out.length;
  for (let i = 0; i < out.length; i++) out[i] -= mean * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / out.length));
  return out;
}

// Per-sample loop multiplier: 1 while ringing, then a fast extra loss when the player damps the string.
export function dampCurve(length, dampAt, dampT60, rampSec = 0.03) {
  const m = new Float64Array(length).fill(1);
  const mD = 10 ** (-3 / (dampT60 * SR));
  const s0 = Math.round(dampAt * SR), rs = Math.max(1, Math.round(rampSec * SR));
  for (let n = Math.max(0, s0); n < length; n++) {
    const r = Math.min(1, (n - s0) / rs);
    m[n] = 1 - r * (1 - mD);
  }
  return m;
}

// Two transverse polarisations: one couples strongly to the bridge (faster decay), one weakly.
export function renderTwoPolarisations({ f0, B, nDisp, t60lo, t60hi, fh, excite, length, damp, angle, detuneCents, decayRatio, weakGain }) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const dV = designLoop({ f0, t60lo: t60lo * decayRatio, t60hi: t60hi * decayRatio, fh, B, nDisp });
  const f1 = f0 * 2 ** (detuneCents / 1200);
  const dH = designLoop({ f0: f1, t60lo, t60hi, fh, B, nDisp });
  const eV = excite.map((x) => x * ca), eH = excite.map((x) => x * sa);
  const v = runLoop(dV, eV, length, damp), h = runLoop(dH, eH, length, damp);
  const out = new Float64Array(length);
  for (let i = 0; i < length; i++) out[i] = v[i] + weakGain * h[i];
  return { out, loop: dV };
}

export function fadeEdges(buf, inSec = 0.0005, outSec = 0.02) {
  const ni = Math.max(1, Math.round(inSec * SR)), no = Math.max(1, Math.round(outSec * SR));
  for (let i = 0; i < ni && i < buf.length; i++) buf[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / ni);
  for (let i = 0; i < no && i < buf.length; i++) buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / no);
  return buf;
}

export function finite(where, name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${where}: ${name} must be a finite number, got ${String(v)}`);
  return v;
}

// Without `string`, the highest string whose open pitch is at or below the note.
export function pickString(where, midi, open, string, maxFret = 24) {
  if (string === undefined) {
    let s = 0;
    for (let i = 0; i < open.length; i++) if (open[i] <= midi) s = i;
    return s;
  }
  if (!Number.isInteger(string) || string < 0 || string >= open.length) {
    throw new Error(`${where}: string must be an integer from 0 to ${open.length - 1}, got ${String(string)}`);
  }
  if (midi < open[string] || midi - open[string] > maxFret) {
    throw new Error(`${where}: midi ${midi} is not playable on string ${string} (open ${open[string]}, frets 0 to ${maxFret})`);
  }
  return string;
}

// Pluck point as a fraction of the vibrating length from the bridge; a point and its mirror
// image excite the same harmonics.
export function pluckParam(where, p) {
  if (p === undefined) return undefined;
  finite(where, 'pluckPosition', p);
  if (p <= 0 || p >= 1) throw new RangeError(`${where}: pluckPosition must lie between 0 and 1, got ${p}`);
  return Math.min(0.5, Math.max(0.02, Math.min(p, 1 - p)));
}
