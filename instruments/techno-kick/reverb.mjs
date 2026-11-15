import { SR } from '../../lib/audio.mjs';

const LENGTHS = [1531, 1789, 2053, 2357, 2671, 2963, 3299, 3637];

// In-place 8-point Walsh-Hadamard transform scaled to be orthogonal (lossless mixing).
function hadamard8(v) {
  for (let len = 1; len < 8; len <<= 1) {
    for (let i = 0; i < 8; i += len << 1) {
      for (let j = i; j < i + len; j++) {
        const a = v[j], b = v[j + len];
        v[j] = a + b; v[j + len] = a - b;
      }
    }
  }
  const s = 1 / Math.sqrt(8);
  for (let i = 0; i < 8; i++) v[i] *= s;
}

// Feedback delay network: eight mutually prime delay lines, orthogonal feedback matrix, and per
// line an attenuation for the low-frequency T60 plus a one-pole lowpass that shortens the high
// frequency decay (absorptive delays after Jot).
export function fdnReverb(x, { t60 = 3, damp = 0.6, size = 1, tail = 0 } = {}) {
  const n = x.length + Math.round(tail * SR);
  const y = new Float64Array(n);
  const L = LENGTHS.map((l) => Math.max(8, Math.round(l * size)));
  const lines = L.map((l) => new Float64Array(l));
  const pos = new Int32Array(8);
  const g = L.map((l) => 10 ** ((-3 * l) / (t60 * SR)));
  const lp = new Float64Array(8), v = new Float64Array(8);
  const sgnIn = [1, -1, 1, -1, 1, 1, -1, -1], sgnOut = [1, 1, -1, -1, 1, -1, 1, -1];
  for (let i = 0; i < n; i++) {
    const inp = i < x.length ? x[i] : 0;
    let out = 0;
    for (let k = 0; k < 8; k++) {
      const d = lines[k][pos[k]];
      lp[k] = (1 - damp) * d + damp * lp[k];
      v[k] = lp[k] * g[k];
      out += sgnOut[k] * d;
    }
    hadamard8(v);
    for (let k = 0; k < 8; k++) {
      lines[k][pos[k]] = v[k] + sgnIn[k] * inp;
      if (++pos[k] >= L[k]) pos[k] = 0;
    }
    y[i] = out / Math.sqrt(8);
  }
  return y;
}
