import { SR } from '../../lib/audio.mjs';

// The chip's sample rate: its 14.318 MHz clock divided by 288.
export const FS = 14318180 / 288;

// Quarter sine in the log domain: attenuation in 1/256 octave (about 0.0235 dB), 256 steps.
export const LOGSIN = new Uint16Array(256);
for (let i = 0; i < 256; i++) LOGSIN[i] = Math.round(-Math.log2(Math.sin((i + 0.5) * Math.PI / 512)) * 256);
// Back to linear: an 11-bit mantissa for the fractional part, the integer part is a right shift.
export const MANT = new Uint16Array(256);
for (let i = 0; i < 256; i++) MANT[i] = Math.round(2048 * 2 ** (-i / 256));

export const MULT2 = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 24, 24, 30, 30];
export const WAVES = ['sine', 'half', 'abs', 'quarter'];

// One operator output for a 10-bit phase and a total attenuation in envelope steps (0.1875 dB).
export function opOut(phase, att, ws) {
  const p = phase & 1023;
  const neg = (p & 512) !== 0, mirror = (p & 256) !== 0;
  if (ws === 1 && neg) return 0;
  if (ws === 3 && mirror) return 0;
  const idx = mirror ? 255 - (p & 255) : p & 255;
  const A = LOGSIN[idx] + (att << 3);
  if (A >= 3072) return 0;
  const m = MANT[A & 255] >> (A >> 8);
  return neg && ws === 0 ? -m : m;
}

// Envelope increments: within every eight ticks of a rate's clock, 4 to 7 of them step.
const PATTERN = [
  [0, 1, 0, 1, 0, 1, 0, 1], [0, 1, 0, 1, 1, 1, 0, 1], [0, 1, 1, 1, 0, 1, 1, 1], [0, 1, 1, 1, 1, 1, 1, 1],
];
export function envInc(rate, cnt) {
  if (rate < 4) return 0;
  if (rate >= 60) return 8;
  const shift = 12 - (rate >> 2);
  const pat = PATTERN[rate & 3];
  if (shift > 0) {
    if (cnt & ((1 << shift) - 1)) return 0;
    return pat[(cnt >>> shift) & 7];
  }
  return pat[cnt & 7] << -shift;
}

// Pitch to block (octave) and 10-bit F-number: f = fnum * FS * 2^(block - 20). The lowest block
// that still fits keeps the F-number large and the pitch error small.
export function fnumFor(hz) {
  for (let block = 0; block < 8; block++) {
    const fnum = Math.round(hz * 2 ** (20 - block) / FS);
    if (fnum <= 1023) return { block, fnum: Math.max(1, fnum) };
  }
  return { block: 7, fnum: 1023 };
}
export const hzOf = (block, fnum) => fnum * FS * 2 ** (block - 20);

// Companding DAC: a 10-bit mantissa with a 3-bit exponent, so loud samples lose their low bits.
export function dac(v) {
  let e = 0;
  const a = Math.abs(v);
  while (e < 7 && a >= 512 << e) e++;
  return Math.trunc(v / (1 << e)) * (1 << e);
}

// Resampler from the chip rate to 48 kHz: the DAC holds each value for one chip sample, then a
// Kaiser-windowed sinc at 20.5 kHz. Tabulated at 1/RES input sample.
const HALF = 20, RES = 256, FC = 20500 / FS, BETA = 8.5;
function i0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 60; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-16 * s) break; }
  return s;
}
const KERNEL = (() => {
  const n = 2 * HALF * RES, h = new Float64Array(n + 2), b = i0(BETA);
  const lp = (u) => {
    const w = Math.abs(u) >= HALF ? 0 : i0(BETA * Math.sqrt(1 - (u / HALF) ** 2)) / b;
    return (u === 0 ? 2 * FC : Math.sin(2 * Math.PI * FC * u) / (Math.PI * u)) * w;
  };
  for (let i = 0; i <= n; i++) {
    const u = i / RES - HALF;
    let s = 0;
    for (let j = 0; j < 8; j++) s += lp(u - (j + 0.5) / 8);
    h[i] = s / 8;
  }
  return h;
})();

export function resample(x) {
  const ratio = FS / SR, m = Math.floor((x.length - HALF) / ratio);
  const y = new Float64Array(Math.max(0, m));
  for (let j = 0; j < m; j++) {
    const p = j * ratio, k0 = Math.floor(p);
    let acc = 0;
    for (let k = k0 - HALF + 1; k <= k0 + HALF; k++) {
      if (k < 0 || k >= x.length) continue;
      const u = (p - k + HALF) * RES, i = Math.floor(u), f = u - i;
      if (i < 0 || i >= 2 * HALF * RES) continue;
      acc += x[k] * (KERNEL[i] + f * (KERNEL[i + 1] - KERNEL[i]));
    }
    y[j] = acc;
  }
  return y;
}
