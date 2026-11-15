import { SR } from '../../lib/audio.mjs';

// Small feedback delay network (4 lines, Householder feedback matrix, damped loops) used as a
// room for the demo. Returns [left, right] = dry in the centre plus a decorrelated reverb tail.
export function room(dry, { wet = 0.2, rt60 = 1.6, damp = 6500, predelay = 0.018 } = {}) {
  const lens = [1423, 1777, 2131, 2557];
  const lines = lens.map((n) => ({ buf: new Float64Array(n), i: 0, n, g: 10 ** (-3 * n / (rt60 * SR)), lp: 0 }));
  const a = Math.exp(-2 * Math.PI * damp / SR);
  const pre = Math.round(predelay * SR), preBuf = new Float64Array(pre + 1);
  let pi = 0;
  const n = dry.length, L = new Float64Array(n), R = new Float64Array(n);
  const o = new Float64Array(4);
  for (let k = 0; k < n; k++) {
    const x = preBuf[pi]; preBuf[pi] = dry[k]; pi = (pi + 1) % preBuf.length;
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      const ln = lines[j];
      ln.lp = (1 - a) * ln.buf[ln.i] + a * ln.lp;
      o[j] = ln.lp * ln.g; sum += o[j];
    }
    const h = sum * 0.5;
    for (let j = 0; j < 4; j++) {
      const ln = lines[j];
      ln.buf[ln.i] = o[j] - h + x * 0.5;
      ln.i = (ln.i + 1) % ln.n;
    }
    L[k] = dry[k] + wet * (o[0] - o[2]);
    R[k] = dry[k] + wet * (o[1] - o[3]);
  }
  return [L, R];
}
