// Weinreich-style coupling of the unison strings of one partial through the bridge.
// a' = (D + c J) a, D = diag(d_k), J = all-ones, c = -(g + i h).
// Returns eigenvalues mu_j and output residues r_j so that sum_k a_k(t) = sum_j r_j exp(mu_j t).
// Complex numbers are [re, im] pairs.

const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

function charPoly(x, d, c) {
  let prod = [1, 0], sum = [0, 0];
  for (let k = 0; k < d.length; k++) {
    let t = [1, 0];
    for (let j = 0; j < d.length; j++) if (j !== k) t = mul(t, sub(x, d[j]));
    sum = add(sum, t);
    prod = mul(prod, sub(x, d[k]));
  }
  return sub(prod, mul(c, sum));
}

export function coupledModes(d, c, a0) {
  const N = d.length;
  if (N === 1) return [{ mu: add(d[0], c), r: a0[0] }];
  const scale = Math.max(1e-9, Math.hypot(...c), ...d.map((x) => Math.hypot(...x)));
  let roots = d.map((x, k) => add(x, [scale * 0.37 * (k + 1), scale * 0.21 * (k + 0.5)]));
  for (let it = 0; it < 200; it++) {
    let moved = 0;
    roots = roots.map((z, j) => {
      let den = [1, 0];
      for (let k = 0; k < N; k++) if (k !== j) den = mul(den, sub(z, roots[k]));
      const step = div(charPoly(z, d, c), den);
      moved = Math.max(moved, Math.hypot(...step));
      return sub(z, step);
    });
    if (moved < 1e-13 * scale) break;
  }
  return roots.map((mu) => {
    const v = d.map((dk) => div([1, 0], sub(dk, mu)));
    let s1 = [0, 0], sa = [0, 0], s2 = [0, 0];
    for (let k = 0; k < N; k++) { s1 = add(s1, v[k]); sa = add(sa, mul(v[k], a0[k])); s2 = add(s2, mul(v[k], v[k])); }
    return { mu, r: div(mul(s1, sa), s2) };
  });
}
