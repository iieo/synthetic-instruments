import { SVF } from '../synth/dsp.mjs';

// Five formants per vowel (centre frequency and bandwidth in Hz), round values in the range of the
// published averages for adult voices, tilted towards a higher voice.
export const VOWELS = {
  a: { f: [800, 1250, 2700, 3700, 4600], b: [90, 110, 160, 250, 300] },
  e: { f: [450, 2150, 2850, 3800, 4700], b: [70, 110, 170, 250, 300] },
  i: { f: [300, 2500, 3200, 3900, 4800], b: [60, 120, 180, 250, 300] },
  o: { f: [480, 850, 2700, 3700, 4600], b: [80, 100, 160, 250, 300] },
  u: { f: [330, 750, 2650, 3700, 4600], b: [70, 100, 160, 250, 300] },
};

// Vowel position over time: a fixed vowel, or a glide between two vowels in log frequency.
export function vowelTrack(name, gate) {
  if (VOWELS[name]) { const v = VOWELS[name]; return () => v; }
  const m = /^([aeiou])h?-([aeiou])h?$/.exec(name || '');
  if (!m) throw new Error(`unknown vowel ${name}`);
  const A = VOWELS[m[1]], B = VOWELS[m[2]];
  const t0 = Math.min(0.08, 0.2 * gate), len = Math.max(0.05, Math.min(0.35, 0.6 * gate));
  const mixLog = (x, y, w) => x.map((xi, i) => xi * (y[i] / xi) ** w);
  return (t) => {
    const u = Math.min(1, Math.max(0, (t - t0) / len)), w = u * u * (3 - 2 * u);
    return { f: mixLog(A.f, B.f, w), b: mixLog(A.b, B.b, w) };
  };
}

// Cascade of five two-pole resonators, each with unity gain at DC and a peak of F/B at its centre
// frequency, which reproduces the relative formant levels of a real vocal tract without extra gains.
export class FormantCascade {
  constructor(fs) { this.fs = fs; this.res = Array.from({ length: 5 }, () => new SVF(fs)); }
  set({ f, b }, shift, f0) {
    const top = 0.42 * this.fs;
    for (let k = 0; k < 5; k++) {
      const fc = Math.min(f[k] * shift, top);
      // A high voice has wider formants; also keeps single harmonics from ringing on a sharp peak.
      const bw = Math.max(b[k] * Math.sqrt(shift), 0.25 * f0);
      this.res[k].set(fc, Math.max(0.6, fc / bw));
    }
  }
  tick(x) {
    for (let k = 0; k < 5; k++) x = this.res[k].tick(x);
    return x;
  }
}
