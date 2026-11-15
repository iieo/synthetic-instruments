// Characteristic beam functions and a Rayleigh-Ritz (Warburton) estimate of the modes of an
// orthotropic rectangular plate, clamped on three edges and pinned along the top edge.

function rootCC(n) {
  let b = (n + 0.5) * Math.PI;
  for (let i = 0; i < 40; i++) {
    const f = Math.cos(b) - 1 / Math.cosh(b), d = -Math.sin(b) + Math.tanh(b) / Math.cosh(b);
    const s = f / d; b -= s;
    if (Math.abs(s) < 1e-13) break;
  }
  return b;
}

function rootCP(n) {
  let b = (n + 0.25) * Math.PI;
  for (let i = 0; i < 40; i++) {
    const th = Math.tanh(b);
    const f = Math.sin(b) - Math.cos(b) * th, d = Math.cos(b) + Math.sin(b) * th - Math.cos(b) * (1 - th * th);
    const s = f / d; b -= s;
    if (Math.abs(s) < 1e-13) break;
  }
  return b;
}

// Beam function with clamped end at 0. Both cases share sigma = (cosh b - cos b) / (sinh b - sin b);
// cosh and sinh are combined with 1 - sigma written out so large b does not cancel.
export function beam(kind, n) {
  const b = kind === 'cc' ? rootCC(n) : rootCP(n);
  const sh = Math.sinh(b) - Math.sin(b);
  const sigma = (Math.cosh(b) - Math.cos(b)) / sh;
  const oneMinus = (Math.cos(b) - Math.sin(b) - Math.exp(-b)) / sh;
  const grow = (x) => oneMinus * Math.exp(x);
  const E = (x) => 0.5 * (grow(x) + (1 + sigma) * Math.exp(-x));
  const F = (x) => 0.5 * (grow(x) - (1 + sigma) * Math.exp(-x));
  return {
    b,
    f: (s) => E(b * s) - Math.cos(b * s) + sigma * Math.sin(b * s),
    d1: (s) => b * (F(b * s) + Math.sin(b * s) + sigma * Math.cos(b * s)),
    d2: (s) => b * b * (E(b * s) + Math.cos(b * s) - sigma * Math.sin(b * s)),
  };
}

const GRID = 600;
function integrals(fn) {
  let i00 = 0, i22 = 0, i02 = 0, i11 = 0, i0 = 0;
  for (let i = 0; i < GRID; i++) {
    const s = (i + 0.5) / GRID, p = fn.f(s), p1 = fn.d1(s), p2 = fn.d2(s);
    i00 += p * p; i22 += p2 * p2; i02 += p * p2; i11 += p1 * p1; i0 += p;
  }
  return { i00: i00 / GRID, i22: i22 / GRID, i02: i02 / GRID, i11: i11 / GRID, i0: i0 / GRID };
}

const cosInt = (fn, l) => {
  let s = 0;
  for (let i = 0; i < GRID; i++) { const u = (i + 0.5) / GRID; s += fn.f(u) * Math.cos(l * Math.PI * u); }
  return s / GRID;
};

/*
 Plate a (width, x) by b (height, y), thickness h, flexural rigidities D1 (x), D2 (y), D12, D66.
 omega^2 rho h = [D1 X''^2 Y^2 + D2 X^2 Y''^2 + 2 D12 X X'' Y Y'' + 4 D66 X'^2 Y'^2] / [X^2 Y^2]
 with every term integrated over the plate (separable, so each is a product of 1D integrals).
*/
export function plateModes({ a, b, h, rho, E1, E2, G12, nu12, fMax, cavity }) {
  const nu21 = (nu12 * E2) / E1, den = 1 - nu12 * nu21;
  const D1 = (E1 * h ** 3) / (12 * den), D2 = (E2 * h ** 3) / (12 * den);
  const D12 = nu21 * D1, D66 = (G12 * h ** 3) / 12;
  const mh = rho * h;
  const xs = [], ys = [];
  const modes = [];
  for (let m = 1; m < 60; m++) {
    if (!xs[m]) { const fn = beam('cc', m); xs[m] = { fn, ...integrals(fn), cav: cavity.map((c) => cosInt(fn, c[0])) }; }
    let any = false;
    for (let n = 1; n < 80; n++) {
      if (!ys[n]) { const fn = beam('cp', n); ys[n] = { fn, ...integrals(fn), cav: cavity.map((c) => cosInt(fn, c[1])) }; }
      const X = xs[m], Y = ys[n];
      const num = D1 * (X.i22 / a ** 4) * Y.i00 + D2 * X.i00 * (Y.i22 / b ** 4)
        + 2 * D12 * (X.i02 * Y.i02) / (a * a * b * b) + 4 * D66 * (X.i11 * Y.i11) / (a * a * b * b);
      const w2 = num / (mh * X.i00 * Y.i00);
      const f = Math.sqrt(w2) / (2 * Math.PI);
      if (f > fMax) break;
      any = true;
      modes.push({
        m, n, f, X: X.fn, Y: Y.fn,
        norm: X.i00 * Y.i00,
        vol: a * b * X.i0 * Y.i0,
        cav: cavity.map((_, j) => a * b * X.cav[j] * Y.cav[j]),
      });
    }
    if (!any) break;
  }
  modes.sort((p, q) => p.f - q.f);
  return { modes, mass: mh * a * b, D1, D2 };
}
