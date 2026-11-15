import { SR } from '../../lib/audio.mjs';

// Small algorithmic room: two input allpass diffusers into a four-line feedback delay network
// with a Householder mixing matrix and per-line high-frequency damping.
export function room(x, { rt60 = 1.6, wet = 0.18, damping = 0.35 } = {}) {
  const lens = [1427, 1759, 2083, 2539];
  const lines = lens.map((L) => ({ buf: new Float64Array(L), i: 0, L, g: 10 ** (-3 * L / (SR * rt60)), lp: 0 }));
  const ap = [113, 337].map((L) => ({ buf: new Float64Array(L), i: 0, L }));
  const pre = new Float64Array(Math.round(0.015 * SR));
  let pi = 0;
  const y = new Float64Array(x.length);
  const o = [0, 0, 0, 0];
  for (let n = 0; n < x.length; n++) {
    let s = pre[pi];
    pre[pi] = x[n];
    pi = (pi + 1) % pre.length;
    for (const a of ap) {
      const d = a.buf[a.i];
      const v = s + 0.6 * d;
      a.buf[a.i] = v;
      s = d - 0.6 * v;
      a.i = (a.i + 1) % a.L;
    }
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const l = lines[k];
      l.lp = l.buf[l.i] + damping * (l.lp - l.buf[l.i]);
      o[k] = l.lp * l.g;
      sum += o[k];
    }
    const h = sum * 0.5;
    for (let k = 0; k < 4; k++) {
      const l = lines[k];
      l.buf[l.i] = o[k] - h + s * 0.5;
      l.i = (l.i + 1) % l.L;
    }
    y[n] = x[n] * (1 - wet) + wet * (o[0] - o[1] + o[2] - o[3]) * 0.7;
  }
  return y;
}
