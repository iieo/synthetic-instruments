// Magnetic pickup at distance x from the bridge. With w(n) the wave arriving at the bridge, the
// string at x carries w(n + tau) - w(n - tau), tau = x / c samples, which delayed by tau is
// w(n) - w(n - 2 tau) and 2 tau = (x / L) of a period. The coil senses the string over a window of
// width `aperture`, so both terms are averaged over their range of delays. The average comes from
// a running sum read with linear interpolation, which handles fractional window edges exactly.
export function pickupSignal(w, { frac, apertureFrac, period }) {
  const n = w.length, C = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) C[i + 1] = C[i] + w[i];
  const at = (t) => {
    if (t <= 0) return 0;
    if (t >= n) return C[n];
    const i = Math.floor(t), f = t - i;
    return C[i] + f * (C[i + 1] - C[i]);
  };
  const half = Math.max(0.5, apertureFrac * period / 2);
  const d = Math.max(half + 0.5, frac * period);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Average of w over [i - half, i + half] minus average over [i - d - half, i - d + half],
    // shifted by half so it is causal.
    const t = i + 1 - half;
    const near = (at(t + half) - at(t - half)) / (2 * half);
    const far = (at(t - d + half) - at(t - d - half)) / (2 * half);
    out[i] = near - far;
  }
  return out;
}
