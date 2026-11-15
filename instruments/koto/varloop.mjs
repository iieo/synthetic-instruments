// String loop with a length that may change during the note (pressed or pulled strings). One
// delay line read at a fractional position with third-order Lagrange interpolation, followed by a
// one-pole loss filter g (1 - a) / (1 - a z^-1). The read position is set every sample so that the
// whole loop, including the phase delay of the loss filter, is exactly one period of the current pitch.

const onePoleMag = (a, w) => (1 - a) / Math.sqrt(1 - 2 * a * Math.cos(w) + a * a);
const onePoleDelay = (a, w) => Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w;

// Per-period gains 10^(-3 / (T60 f0)) at f0 and at fh fix a and g of the loss filter.
export function lossDesign({ f0, t60lo, t60hi, fh, fs }) {
  const w0 = 2 * Math.PI * f0 / fs, wh = 2 * Math.PI * Math.min(fh, 0.45 * fs) / fs;
  const G0 = 10 ** (-3 / (t60lo * f0)), ratio = Math.min(0.99999, 10 ** (-3 / (t60hi * f0)) / G0);
  let a = 0;
  if (wh > w0 * 1.01) {
    let lo = 0, hi = 0.999;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (onePoleMag(m, wh) / onePoleMag(m, w0) > ratio) lo = m; else hi = m;
    }
    a = (lo + hi) / 2;
  }
  return { a, g: Math.min(0.99999, G0 / onePoleMag(a, w0)) };
}

// ratio: per-sample pitch factor (null = constant). damp: per-sample extra loop gain (null = none).
export function runVarLoop({ fs, f0, ratio = null, loss, excite, length, damp = null }) {
  const minR = ratio ? Math.min(1, ...sampleMin(ratio)) : 1;
  const maxD = fs / (f0 * minR) + 8;
  let size = 16;
  while (size < maxD) size *= 2;
  const mask = size - 1, buf = new Float64Array(size), out = new Float64Array(length);
  const b0 = loss.g * (1 - loss.a), a = loss.a;
  let lp = 0, D = 0, lastR = NaN;
  for (let n = 0; n < length; n++) {
    const r = ratio ? ratio[n] : 1;
    if (r !== lastR) {
      const f = f0 * r;
      D = fs / f - onePoleDelay(a, 2 * Math.PI * f / fs);
      lastR = r;
    }
    const Di = Math.floor(D) - 1, d = D - Di;
    const p = n - Di;
    const x0 = buf[p & mask], x1 = buf[(p - 1) & mask], x2 = buf[(p - 2) & mask], x3 = buf[(p - 3) & mask];
    const dm1 = d - 1, dm2 = d - 2, dm3 = d - 3;
    const s = -dm1 * dm2 * dm3 / 6 * x0 + d * dm2 * dm3 / 2 * x1 - d * dm1 * dm3 / 2 * x2 + d * dm1 * dm2 / 6 * x3;
    lp = b0 * s + a * lp;
    let v = damp ? lp * damp[n] : lp;
    if (n < excite.length) v += excite[n];
    buf[n & mask] = v;
    out[n] = v;
  }
  return out;
}

function sampleMin(x) {
  let m = Infinity;
  for (let i = 0; i < x.length; i++) if (x[i] < m) m = x[i];
  return [m];
}
