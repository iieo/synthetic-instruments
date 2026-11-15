// Windowed-sinc low-pass (Kaiser window), used for 4x decimation and true-peak estimation.
function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

export function kaiserLowpass(taps, cutoffNorm, beta) {
  const h = new Float64Array(taps);
  const m = (taps - 1) / 2, i0b = besselI0(beta);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - m;
    const sinc = x === 0 ? 2 * cutoffNorm : Math.sin(2 * Math.PI * cutoffNorm * x) / (Math.PI * x);
    const r = x / m;
    h[i] = sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0b;
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  return h;
}

export function decimate(x, factor, h) {
  const n = Math.floor(x.length / factor), L = h.length, half = (L - 1) >> 1;
  const y = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const c = j * factor + half;
    let acc = 0;
    const i0 = Math.max(0, c - x.length + 1), i1 = Math.min(L - 1, c);
    for (let i = i0; i <= i1; i++) acc += h[i] * x[c - i];
    y[j] = acc;
  }
  return y;
}

// 4x polyphase upsampling, peak of the interpolated signal (ITU-R BS.1770 style true peak).
export function truePeakDb(x) {
  const F = 4, h = kaiserLowpass(4 * 48 + 1, 0.5 / F * 0.95, 9);
  const half = (h.length - 1) >> 1;
  let peak = 0;
  for (let j = 0; j < x.length * F; j++) {
    let acc = 0;
    for (let i = (j + half) % F; i < h.length; i += F) {
      const k = (j + half - i) / F;
      if (k >= 0 && k < x.length) acc += h[i] * x[k];
    }
    peak = Math.max(peak, Math.abs(acc * F));
  }
  return 20 * Math.log10(peak);
}

export function dcBlock(x, sr, fc) {
  const R = Math.exp(-2 * Math.PI * fc / sr);
  let x1 = 0, y1 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] - x1 + R * y1;
    x1 = x[i]; y1 = y; x[i] = y;
  }
  return x;
}
