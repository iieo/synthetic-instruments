// Radial eigenproblem of a circular membrane (radius 1, tension 1) with radially varying areal density rho(r):
//   (r u')' + (lambda rho(r) r - m^2 / r) u = 0,  u(1) = 0,  u ~ r^m at the centre.
// Mode frequency is proportional to sqrt(lambda). Solved by shooting (RK4) and bisection on lambda.

function shoot(m, lam, rho, N) {
  const r0 = 1e-4, h = (1 - r0) / N;
  let r = r0, u = r0 ** m, p = r0 * (m ? m * r0 ** (m - 1) : 0);
  const f = (r, u, p) => [p / r, (m * m / r - lam * rho(r) * r) * u];
  for (let i = 0; i < N; i++) {
    const [a1, b1] = f(r, u, p);
    const [a2, b2] = f(r + h / 2, u + (h / 2) * a1, p + (h / 2) * b1);
    const [a3, b3] = f(r + h / 2, u + (h / 2) * a2, p + (h / 2) * b2);
    const [a4, b4] = f(r + h, u + h * a3, p + h * b3);
    u += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    p += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    r += h;
  }
  return u;
}

// Mode shape on a radial grid, normalised to unit modal mass  2*pi * int rho u^2 r dr  (times 1/2 for m > 0).
function shape(m, lam, rho, G) {
  const N = G * 4, r0 = 1e-4, h = (1 - r0) / N;
  let r = r0, u = r0 ** m, p = r0 * (m ? m * r0 ** (m - 1) : 0);
  const out = new Float64Array(G + 1);
  const f = (r, u, p) => [p / r, (m * m / r - lam * rho(r) * r) * u];
  let mass = 0;
  for (let i = 0; i < N; i++) {
    if (i % 4 === 0) out[i / 4] = u;
    mass += rho(r) * u * u * r * h;
    const [a1, b1] = f(r, u, p);
    const [a2, b2] = f(r + h / 2, u + (h / 2) * a1, p + (h / 2) * b1);
    const [a3, b3] = f(r + h / 2, u + (h / 2) * a2, p + (h / 2) * b2);
    const [a4, b4] = f(r + h, u + h * a3, p + h * b3);
    u += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    p += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    r += h;
  }
  out[G] = 0;
  const norm = 1 / Math.sqrt(2 * Math.PI * mass * (m ? 0.5 : 1));
  for (let i = 0; i <= G; i++) out[i] *= norm;
  return out;
}

// All modes with sqrt(lambda) up to kMax. Returns { m, n, k, shape } sorted by k (k = sqrt(lambda)).
export function loadedModes(rho, { mMax = 10, kMax = 40, N = 1200, G = 200 } = {}) {
  const modes = [];
  for (let m = 0; m <= mMax; m++) {
    let n = 0, kPrev = 0.05, uPrev = shoot(m, kPrev * kPrev, rho, N);
    const dk = 0.04;
    for (let k = kPrev + dk; k <= kMax; k += dk) {
      const u = shoot(m, k * k, rho, N);
      if (uPrev * u < 0) {
        let a = kPrev, b = k, ua = uPrev;
        for (let it = 0; it < 50; it++) {
          const c = 0.5 * (a + b), uc = shoot(m, c * c, rho, N);
          if (ua * uc <= 0) b = c; else { a = c; ua = uc; }
        }
        const kk = 0.5 * (a + b);
        modes.push({ m, n: ++n, k: kk, shape: shape(m, kk * kk, rho, G) });
      }
      kPrev = k; uPrev = u;
    }
  }
  return modes.sort((x, y) => x.k - y.k);
}

// Areal density of a head with a layered central load of radius b, peak density ratio sigma over the bare
// membrane, falling off towards the load edge as (1 - (r/b)^p): the paste is built up in layers, thickest in the middle.
export const syahiDensity = ({ sigma, b, p, edge = 0.03 }) => (r) => {
  if (r >= b + edge) return 1;
  const x = Math.min(1, r / b);
  const core = 1 + (sigma - 1) * (1 - x ** p);
  if (r <= b) return core;
  return 1 + (core - 1) * (1 - (r - b) / edge);
};

export const shapeAt = (mode, r) => {
  const G = mode.shape.length - 1, x = Math.min(1, Math.max(0, r)) * G, i = Math.min(G - 1, Math.floor(x)), t = x - i;
  return mode.shape[i] * (1 - t) + mode.shape[i + 1] * t;
};

// Paste built up as stacked layers of decreasing radius: layers [[density, radius], ...] from the
// centre outwards, each density relative to the bare membrane. Between layers the density changes
// linearly over `edge`; beyond the last layer the membrane is bare.
export const layeredDensity = ({ layers, edge = 0.03 }) => (r) => {
  let d = layers[0][0];
  for (let i = 0; i < layers.length; i++) {
    const [a, b] = layers[i], next = i + 1 < layers.length ? layers[i + 1][0] : 1;
    if (r < b) return d;
    if (r < b + edge) return a + (next - a) * (r - b) / edge;
    d = next;
  }
  return 1;
};
