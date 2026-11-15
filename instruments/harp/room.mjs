import { SR } from '../../lib/audio.mjs';

// Small hall: eight-line feedback delay network with a Householder matrix (lossless mixing),
// per-line gains for the wanted T60 and a one-pole lowpass per line for air absorption.
export function room([left, right], { t60 = 1.7, mix = 0.16, predelay = 0.018, damping = 0.35 } = {}) {
  const lengths = [1123, 1361, 1597, 1831, 2069, 2297, 2539, 2777];
  const N = lengths.length;
  const lines = lengths.map((l) => new Float64Array(l));
  const pos = new Int32Array(N);
  const gain = lengths.map((l) => 10 ** ((-3 * l) / (t60 * SR)));
  const lp = new Float64Array(N);
  const pre = Math.round(predelay * SR);
  const n = left.length;
  const outL = new Float64Array(n), outR = new Float64Array(n);
  const o = new Float64Array(N);
  for (let i = 0; i < n; i++) {
    const inL = i >= pre ? left[i - pre] : 0, inR = i >= pre ? right[i - pre] : 0;
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const v = lines[k][pos[k]] * gain[k];
      lp[k] = (1 - damping) * v + damping * lp[k];
      o[k] = lp[k];
      sum += o[k];
    }
    const h = (2 / N) * sum;
    let wl = 0, wr = 0;
    for (let k = 0; k < N; k++) {
      const fb = o[k] - h;
      lines[k][pos[k]] = fb + (k & 1 ? inR : inL) * 0.5;
      pos[k] = pos[k] + 1 === lengths[k] ? 0 : pos[k] + 1;
      if (k < 4) wl += o[k] * (k & 2 ? -1 : 1); else wr += o[k] * (k & 2 ? -1 : 1);
    }
    outL[i] = left[i] + mix * wl;
    outR[i] = right[i] + mix * wr;
  }
  return [outL, outR];
}
