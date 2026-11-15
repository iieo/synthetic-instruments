// Four-capacitor diode ladder. Neighbouring capacitors are coupled by diode pairs whose current is
// tanh of the voltage across them, so each stage loads the previous one (unlike a buffered
// transistor ladder). The top capacitor has half the value of the others (C4 rate x2).
// Normalised ODE with unit angular cutoff:
//   v1' = T(x - k v4 - v1) - T(v1 - v2)
//   v2' = T(v1 - v2) - T(v2 - v3)
//   v3' = T(v2 - v3) - T(v3 - v4)
//   v4' = C4 T(v3 - v4)
// Discretised with the trapezoidal rule in TPT form (state s = v + g f(v)), solved by Newton.
const C4 = 2;

function openLoop(w) {
  // G(jw) = v4/x of the linearised ladder without feedback, solved by complex Gaussian elimination.
  const A = [[-2, 1, 0, 0], [1, -2, 1, 0], [0, 1, -2, 1], [0, 0, C4, -C4]];
  const re = [], im = [];
  for (let r = 0; r < 4; r++) {
    re.push([...A[r].map((a) => -a), r === 0 ? 1 : 0]);
    im.push([0, 0, 0, 0, 0]);
    im[r][r] = w;
  }
  for (let c = 0; c < 4; c++) {
    for (let r = c + 1; r < 4; r++) {
      const dr = re[c][c], di = im[c][c], d2 = dr * dr + di * di;
      const fr = (re[r][c] * dr + im[r][c] * di) / d2, fi = (im[r][c] * dr - re[r][c] * di) / d2;
      for (let k = c; k < 5; k++) {
        const ar = re[c][k], ai = im[c][k];
        re[r][k] -= fr * ar - fi * ai; im[r][k] -= fr * ai + fi * ar;
      }
    }
  }
  const xr = [0, 0, 0, 0], xi = [0, 0, 0, 0];
  for (let r = 3; r >= 0; r--) {
    let br = re[r][4], bi = im[r][4];
    for (let k = r + 1; k < 4; k++) {
      br -= re[r][k] * xr[k] - im[r][k] * xi[k];
      bi -= re[r][k] * xi[k] + im[r][k] * xr[k];
    }
    const dr = re[r][r], di = im[r][r], d2 = dr * dr + di * di;
    xr[r] = (br * dr + bi * di) / d2; xi[r] = (bi * dr - br * di) / d2;
  }
  return [xr[3], xi[3]];
}

// Frequency where the loop phase reaches -180 deg, and the feedback gain that makes it oscillate.
function calibrate() {
  let lo = 0.01, hi = 100;
  for (let i = 0; i < 100; i++) {
    const mid = Math.sqrt(lo * hi);
    const [r, im] = openLoop(mid);
    if (im < 0) lo = mid; else hi = mid;
  }
  const [r] = openLoop(lo);
  return { wRes: lo, kCrit: -1 / r };
}
export const LADDER = calibrate();

export function makeLadder() {
  return { v1: 0, v2: 0, v3: 0, v4: 0, s1: 0, s2: 0, s3: 0, s4: 0 };
}

const sech2 = (t) => 1 - t * t;

// One sample. g = tan(pi * fc / fs) with fc the unit-cutoff frequency of the ODE.
export function ladderTick(st, x, g, k) {
  let v1 = st.v1, v2 = st.v2, v3 = st.v3, v4 = st.v4;
  const { s1, s2, s3, s4 } = st;
  let t0, t1, t2, t3;
  for (let it = 0; it < 12; it++) {
    t0 = Math.tanh(x - k * v4 - v1); t1 = Math.tanh(v1 - v2);
    t2 = Math.tanh(v2 - v3); t3 = Math.tanh(v3 - v4);
    const F1 = v1 - s1 - g * (t0 - t1);
    const F2 = v2 - s2 - g * (t1 - t2);
    const F3 = v3 - s3 - g * (t2 - t3);
    const F4 = v4 - s4 - g * C4 * t3;
    const a0 = g * sech2(t0), a1 = g * sech2(t1), a2 = g * sech2(t2), a3 = g * sech2(t3);
    // Jacobian rows: [1+a0+a1, -a1, 0, a0 k], [-a1, 1+a1+a2, -a2, 0], [0, -a2, 1+a2+a3, -a3], [0, 0, -C4 a3, 1+C4 a3].
    // Eliminate the tridiagonal part from the bottom up, carrying the v4 coupling of row 1.
    const d4 = 1 + C4 * a3;
    // Row 4: v4 = (-F4 + C4 a3 dv3) / d4
    const p4 = -F4 / d4, q4 = C4 * a3 / d4;
    // Row 3: (1+a2+a3) dv3 - a2 dv2 - a3 (p4 + q4 dv3) = -F3
    const d3 = 1 + a2 + a3 - a3 * q4;
    const p3 = (-F3 + a3 * p4) / d3, q3 = a2 / d3;
    // Row 2: (1+a1+a2) dv2 - a1 dv1 - a2 (p3 + q3 dv2) = -F2
    const d2 = 1 + a1 + a2 - a2 * q3;
    const p2 = (-F2 + a2 * p3) / d2, q2 = a1 / d2;
    // dv3 = p3 + q3 dv2, dv4 = p4 + q4 dv3, all affine in dv1.
    const P3 = p3 + q3 * p2, Q3 = q3 * q2;
    const P4 = p4 + q4 * P3, Q4 = q4 * Q3;
    // Row 1: (1+a0+a1) dv1 - a1 dv2 + a0 k dv4 = -F1
    const dv1 = (-F1 + a1 * p2 - a0 * k * P4) / (1 + a0 + a1 - a1 * q2 + a0 * k * Q4);
    const dv2 = p2 + q2 * dv1, dv3 = P3 + Q3 * dv1, dv4 = P4 + Q4 * dv1;
    v1 += dv1; v2 += dv2; v3 += dv3; v4 += dv4;
    if (Math.abs(dv1) + Math.abs(dv2) + Math.abs(dv3) + Math.abs(dv4) < 1e-10) break;
  }
  t0 = Math.tanh(x - k * v4 - v1); t1 = Math.tanh(v1 - v2);
  t2 = Math.tanh(v2 - v3); t3 = Math.tanh(v3 - v4);
  st.s1 = v1 + g * (t0 - t1); st.s2 = v2 + g * (t1 - t2);
  st.s3 = v3 + g * (t2 - t3); st.s4 = v4 + g * C4 * t3;
  st.v1 = v1; st.v2 = v2; st.v3 = v3; st.v4 = v4;
  return v4;
}
