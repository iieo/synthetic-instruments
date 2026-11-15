import { SR } from '../../lib/audio.mjs';

// Small concert hall: a few discrete early reflections, then an 8-line feedback delay network
// with an orthogonal (Hadamard) mixing matrix. Every line loses energy through a gain and a
// one-pole low-pass chosen from its length, so the low-frequency T60 is `t60` and high frequencies
// die faster, as air and seats absorb them.
const LINES_MS = [31.7, 37.1, 41.3, 47.9, 53.3, 59.9, 67.1, 73.7];
const EARLY = [
  [0.0071, 0.55, -0.0113, 0.5], [0.0179, -0.4, 0.0151, 0.42], [0.0263, 0.32, -0.0287, 0.35],
  [0.0347, -0.3, 0.0419, 0.26], [0.0521, 0.22, -0.0463, 0.24],
];

function hadamard8(v) {
  for (let h = 1; h < 8; h <<= 1) {
    for (let i = 0; i < 8; i += h << 1) {
      for (let j = i; j < i + h; j++) { const a = v[j], b = v[j + h]; v[j] = a + b; v[j + h] = a - b; }
    }
  }
  const s = 1 / Math.sqrt(8);
  for (let i = 0; i < 8; i++) v[i] *= s;
}

export const HALL_T60 = 2.1;

// Returns wet [L, R] of length n (input padded with silence) from dry [L, R].
export function hall([xl, xr], n, { t60 = HALL_T60, predelay = 0.019, hfRatio = 0.4 } = {}) {
  const yl = new Float64Array(n), yr = new Float64Array(n);
  const pd = Math.round(predelay * SR);
  const len = LINES_MS.map((ms) => Math.round((ms * SR) / 1000));
  const bufs = len.map((L) => new Float64Array(L));
  const pos = new Int32Array(8);
  const g = len.map((L) => 10 ** ((-3 * L) / (SR * t60)));
  // Per line low-pass pole so that the T60 at about 5 kHz is hfRatio * t60.
  const lpA = len.map((L, i) => {
    const gHf = 10 ** ((-3 * L) / (SR * t60 * hfRatio)) / g[i];
    const c = Math.cos((2 * Math.PI * 5000) / SR);
    // |H(5 kHz)| of (1-a)/(1-a z^-1) equals gHf: solve the quadratic for a.
    const k = gHf * gHf, A = k - 1, B = 2 - 2 * k * c, C = k - 1;
    if (A === 0) return 0;
    const disc = Math.sqrt(Math.max(0, B * B - 4 * A * C));
    // The two roots are a and 1/a; the stable pole is the smaller one.
    const a = Math.min((-B + disc) / (2 * A), (-B - disc) / (2 * A));
    return Math.min(0.95, Math.max(0, a));
  });
  const lp = new Float64Array(8), v = new Float64Array(8);
  const inLp = Math.exp((-2 * Math.PI * 7000) / SR);
  let sl = 0, sr = 0;
  const signsL = [1, -1, 1, 1, -1, 1, -1, -1], signsR = [1, 1, -1, 1, 1, -1, -1, 1];
  const at = (x, i) => (i >= 0 && i < x.length ? x[i] : 0);
  const early = EARLY.map(([tl, gl, tr, gr]) => [tl > 0 ? xl : xr, Math.round(Math.abs(tl) * SR), gl, tr > 0 ? xr : xl, Math.round(Math.abs(tr) * SR), gr]);
  for (let i = 0; i < n; i++) {
    const j = i - pd;
    sl = (1 - inLp) * at(xl, j) + inLp * sl;
    sr = (1 - inLp) * at(xr, j) + inLp * sr;
    let el = 0, er = 0;
    for (const [srcL, dl, gl, srcR, dr, gr] of early) { el += gl * at(srcL, j - dl); er += gr * at(srcR, j - dr); }
    for (let k = 0; k < 8; k++) v[k] = bufs[k][pos[k]];
    let ol = 0, or = 0;
    for (let k = 0; k < 8; k++) { ol += signsL[k] * v[k]; or += signsR[k] * v[k]; }
    yl[i] = 0.35 * el + 0.5 * ol;
    yr[i] = 0.35 * er + 0.5 * or;
    for (let k = 0; k < 8; k++) { lp[k] = (1 - lpA[k]) * v[k] + lpA[k] * lp[k]; v[k] = g[k] * lp[k]; }
    hadamard8(v);
    for (let k = 0; k < 8; k++) {
      bufs[k][pos[k]] = v[k] + (k < 4 ? sl : sr) * (k & 1 ? -0.5 : 0.5);
      if (++pos[k] === len[k]) pos[k] = 0;
    }
  }
  return [yl, yr];
}
