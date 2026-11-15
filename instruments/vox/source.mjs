import { OnePole } from '../synth/dsp.mjs';

const TAU = 2 * Math.PI;
const BLOCK = 32;

// Glottal source as a sum of harmonics. The spectrum falls with 1/k (closing phase of the glottal
// flow, including lip radiation) and gets a second slope above `tilt` Hz; harmonics fade out
// between 14 and 18 kHz, so nothing can alias, whatever the pitch or vibrato does.
// Returns the voiced part and, separately, breath noise gated by the glottal opening.
export function glottalSource({ fs, n, freq, tilt, r, jitter, shimmer }) {
  const voiced = new Float64Array(n), breath = new Float64Array(n);
  const jl = new OnePole(18, fs), sl = new OnePole(12, fs);
  const jScale = jitter * Math.sqrt(fs / 18) * 0.98, sScale = shimmer * Math.sqrt(fs / 12) * 0.98;
  const amps = new Float64Array(1024);
  let K = 1, ph = r();
  for (let i = 0; i < n; i++) {
    const jit = jl.lp((2 * r() - 1) * jScale);
    const f = freq(i / fs) * (1 + jit);
    if (i % BLOCK === 0) {
      const tl = tilt(i / fs);
      K = Math.min(1023, Math.floor(18000 / f));
      for (let k = 1; k <= K; k++) {
        const fk = k * f;
        const fade = fk < 14000 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (fk - 14000) / 4000);
        amps[k] = fade / (k * Math.sqrt(1 + (fk / tl) ** 2));
      }
    }
    ph += f / fs;
    ph -= Math.floor(ph);
    const s1 = Math.sin(TAU * ph), c2 = 2 * Math.cos(TAU * ph);
    let a = 0, b = s1, acc = amps[1] * s1;
    for (let k = 2; k <= K; k++) { const c = c2 * b - a; a = b; b = c; acc += amps[k] * c; }
    voiced[i] = acc * (1 + sl.lp((2 * r() - 1) * sScale));
    const open = 0.5 - 0.5 * Math.cos(TAU * ph);
    breath[i] = (2 * r() - 1) * open * open;
  }
  return { voiced, breath };
}
