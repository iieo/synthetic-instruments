// Circular membrane fixed at the rim (radius a, tension per length T, areal density sigma):
// transverse modes w_mn = J_m(j_mn r / a) cos(m theta) with f_mn = j_mn / (2 pi a) * sqrt(T / sigma),
// j_mn the n-th positive zero of the Bessel function J_m. Tension only scales the whole set.

// J_m(x) = 1/pi * integral over [0, pi] of cos(m t - x sin t) dt. The integrand is smooth and
// periodic, so the trapezoid rule converges very fast.
export function besselJ(m, x) {
  const K = 96;
  let s = 0;
  for (let k = 0; k <= K; k++) {
    const t = Math.PI * k / K, w = k === 0 || k === K ? 0.5 : 1;
    s += w * Math.cos(m * t - x * Math.sin(t));
  }
  return s / K;
}

// Zeros of J_m below xMax by a sign scan and bisection.
export function besselZeros(m, xMax, step = 0.05) {
  const z = [];
  let x0 = Math.max(step, m * 0.9), f0 = besselJ(m, x0);
  for (let x = x0 + step; x <= xMax; x += step) {
    const f = besselJ(m, x);
    if (f0 * f < 0) {
      let lo = x - step, hi = x;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (besselJ(m, lo) * besselJ(m, mid) <= 0) hi = mid; else lo = mid;
      }
      z.push((lo + hi) / 2);
    }
    f0 = f;
  }
  return z;
}

let table = null;
function zeroTable() {
  if (table) return table;
  table = [];
  for (let m = 0; m <= 14; m++) for (const [i, j] of besselZeros(m, 48).entries()) table.push({ m, n: i + 1, j });
  return table;
}

// Mode list [freq, q, gain] for a head whose lowest mode sits at f01, driven by a bridge foot at
// radius rFrac (0 centre, 1 rim). The gain is the mode shape at the foot times a radiation weight:
// the m = 0 modes move air like a piston, m >= 1 modes partly cancel themselves.
export function headModes({ f01, rFrac, q, fMax }) {
  const j01 = zeroTable()[0].j;
  const list = [];
  for (const { m, j } of zeroTable()) {
    const f = f01 * j / j01;
    if (f > fMax) continue;
    const shape = besselJ(m, j * rFrac);
    const rad = m === 0 ? 1 : m === 1 ? 0.55 : 0.35;
    // Larger mode numbers lose energy to the air more slowly relative to their frequency.
    list.push([f, q * (1 + 0.08 * m), shape * rad]);
  }
  return list;
}
