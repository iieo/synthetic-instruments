export const ORDER = 10;
export const CHIP_SR = 8000;

// All-pole polynomial A(z) = 1 + a1 z^-1 + ... from resonances (Hz, bandwidth Hz) at rate fs.
export function polyFromFormants(F, B, fs = CHIP_SR) {
  let a = [1];
  for (let j = 0; j < F.length; j++) {
    const r = Math.exp(-Math.PI * B[j] / fs), c = -2 * r * Math.cos(2 * Math.PI * F[j] / fs), d = r * r;
    const nxt = new Array(a.length + 2).fill(0);
    for (let i = 0; i < a.length; i++) { nxt[i] += a[i]; nxt[i + 1] += c * a[i]; nxt[i + 2] += d * a[i]; }
    a = nxt;
  }
  return a;
}

// Step-down recursion: direct-form coefficients to reflection coefficients, with
// A_m(z) = A_{m-1}(z) + k_m z^-m A_{m-1}(1/z).
export function toReflection(a) {
  const M = a.length - 1, k = new Float64Array(M);
  let cur = a.slice();
  for (let m = M; m >= 1; m--) {
    const km = cur[m];
    k[m - 1] = km;
    const den = 1 - km * km, prev = new Array(m).fill(0);
    prev[0] = 1;
    for (let i = 1; i < m; i++) prev[i] = (cur[i] - km * cur[m - i]) / den;
    cur = prev;
  }
  return k;
}

// Step-up recursion, the inverse of toReflection.
export function fromReflection(k) {
  let a = [1];
  for (let m = 1; m <= k.length; m++) {
    const nxt = new Array(m + 1);
    nxt[0] = 1;
    for (let i = 1; i < m; i++) nxt[i] = a[i] + k[m - 1] * a[m - i];
    nxt[m] = k[m - 1];
    a = nxt;
  }
  return a;
}

// All-pole lattice: one sample through 1/A(z). `g` holds the backward path, length ORDER + 1.
export function latticeTick(x, k, g) {
  let f = x;
  for (let m = k.length; m >= 1; m--) {
    f -= k[m - 1] * g[m - 1];
    g[m] = k[m - 1] * f + g[m - 1];
  }
  g[0] = f;
  return f;
}

// Coefficient tables: 2^bits values spaced evenly in arcsin(k) over the range [lo, hi] that the
// phoneme inventory needs, so resolution is finest where |k| approaches 1.
export function kTable(lo, hi, levels) {
  const a = Math.asin(lo), b = Math.asin(hi), t = new Float64Array(levels);
  for (let i = 0; i < levels; i++) t[i] = Math.sin(a + (b - a) * (levels === 1 ? 0.5 : i / (levels - 1)));
  return t;
}

export function nearest(table, v) {
  let best = 0, d = Infinity;
  for (let i = 0; i < table.length; i++) { const e = Math.abs(table[i] - v); if (e < d) { d = e; best = i; } }
  return best;
}
