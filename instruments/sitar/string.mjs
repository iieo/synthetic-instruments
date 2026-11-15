// Main sitar string as a two-way waveguide in displacement waves. The K samples next to the bridge
// are kept as explicit left- and right-going waves so the string's shape there is known; the rest
// of the string out to the nut and back is one long fractional delay with the loss filter.
//
// The bridge top is a wide, very flat surface. At k samples from the termination it lies
// h_k = curve * k^3 below the line of the string at rest. The string may lie on it but not go
// through it: whenever y_k = a_k + b_k < -h_k the penetration is pushed back out, half into each
// wave, which is the one-sided constraint of a rigid obstacle. A loud string wraps onto the bridge
// over many samples and its effective end point moves every period; this moving end point is what
// keeps feeding high partials into the string while it decays.

const onePoleDelay = (a, w) => Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w;

export function runSitarString({ fs, f0, ratio = null, loss, excite, length, damp = null, K, curve, stiff, offset = 0 }) {
  const a = new Float64Array(K), b = new Float64Array(K);
  const h = new Float64Array(K);
  for (let k = 0; k < K; k++) h[k] = curve * k * k * k;
  let minR = 1;
  if (ratio) for (let i = 0; i < ratio.length; i++) minR = Math.min(minR, ratio[i]);
  let size = 16;
  while (size < fs / (f0 * minR) + 8) size *= 2;
  const mask = size - 1, buf = new Float64Array(size);
  const g0 = loss.g * (1 - loss.a), pa = loss.a;
  const slope = new Float64Array(length), contact = new Float64Array(length);
  // Samples of loop delay outside the long delay: K - 1 each way through the bridge segment.
  const fixed = 2 * (K - 1) + offset;
  let lp = 0, D = 0, lastR = NaN;
  for (let n = 0; n < length; n++) {
    const r = ratio ? ratio[n] : 1;
    if (r !== lastR) {
      const f = f0 * r;
      D = Math.max(2.5, fs / f - fixed - onePoleDelay(pa, 2 * Math.PI * f / fs));
      lastR = r;
    }
    const Di = Math.floor(D) - 1, d = D - Di, p = n - Di;
    const x0 = buf[p & mask], x1 = buf[(p - 1) & mask], x2 = buf[(p - 2) & mask], x3 = buf[(p - 3) & mask];
    const dm1 = d - 1, dm2 = d - 2, dm3 = d - 3;
    const s = -dm1 * dm2 * dm3 / 6 * x0 + d * dm2 * dm3 / 2 * x1 - d * dm1 * dm3 / 2 * x2 + d * dm1 * dm2 / 6 * x3;
    lp = g0 * s + pa * lp;
    // Reflection at the nut inverts the wave.
    let inc = -(damp ? lp * damp[n] : lp);
    if (n < excite.length) inc += excite[n];

    for (let k = 0; k < K - 1; k++) a[k] = a[k + 1];
    a[K - 1] = inc;
    for (let k = K - 1; k > 0; k--) b[k] = b[k - 1];
    b[0] = -a[0];

    let push = 0;
    for (let k = 1; k < K; k++) {
      const y = a[k] + b[k];
      if (y < -h[k]) {
        const c = (-h[k] - y) * stiff;
        a[k] += 0.5 * c; b[k] += 0.5 * c;
        push += c;
      }
    }
    buf[n & mask] = b[K - 1];
    slope[n] = a[1] + b[1];
    contact[n] = push;
  }
  return { slope, contact };
}
