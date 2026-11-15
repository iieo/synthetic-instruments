import { SVF, sawBL, pulseBL, clamp } from '../synth/dsp.mjs';

const TAU = 2 * Math.PI;

// Three saws (centre plus two detuned, panned apart) and a quiet square an octave down, through a
// two-stage low-pass whose cutoff snaps shut within a few tens of milliseconds.
export function sawPluck({ fs, f0, pm, r, v, n }) {
  const L = new Float64Array(n), R = new Float64Array(n);
  const vs = [[0, 0, 0.55], [-9, -0.6, 0.42], [9, 0.6, 0.42]];
  for (const [cents, pan, lv] of vs) {
    const inc = f0 * 2 ** ((cents + 1.2 * (r() - 0.5)) / 1200) / fs;
    const gl = lv * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = lv * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    let t = r();
    for (let i = 0; i < n; i++) {
      const dt = Math.min(0.45, inc * pm[i]);
      t += dt; if (t >= 1) t -= 1;
      const y = sawBL(t, dt);
      L[i] += gl * y; R[i] += gr * y;
    }
  }
  let t = r();
  for (let i = 0; i < n; i++) {
    const dt = Math.min(0.45, 0.5 * f0 * pm[i] / fs);
    t += dt; if (t >= 1) t -= 1;
    const y = 0.22 * pulseBL(t, dt, 0.5);
    L[i] += y; R[i] += y;
  }
  const f = [[new SVF(fs), new SVF(fs)], [new SVF(fs), new SVF(fs)]];
  const env = (2500 + 9500 * v * v), base = 150 + 1.3 * f0;
  for (let i = 0; i < n; i++) {
    if (i % 8 === 0) {
      const fc = Math.min(base + env * Math.exp(-i / fs / 0.05), 18000);
      for (const [a, b] of f) { a.set(fc, 1.4); b.set(fc, 0.54); }
    }
    L[i] = f[0][1].tick(f[0][0].tick(L[i]));
    R[i] = f[1][1].tick(f[1][0].tick(R[i]));
  }
  return [L, R];
}

// Two-operator phase modulation; the index envelope decays faster than the note, so the attack is
// bright and the tail turns into an almost pure tone.
function fmPair(out, { fs, f0, pm, r, cRatio, mRatio, index, level, detune = 0 }) {
  const fc = f0 * cRatio * 2 ** (detune / 1200) / fs, fm = f0 * mRatio / fs;
  let pc = r(), pmod = r();
  for (let i = 0; i < out.length; i++) {
    pc += fc * pm[i]; pmod += fm * pm[i];
    pc -= Math.floor(pc); pmod -= Math.floor(pmod);
    out[i] += level * Math.sin(TAU * pc + index(i / fs) * Math.sin(TAU * pmod));
  }
}

export function bell({ fs, f0, pm, r, v, n }) {
  const L = new Float64Array(n), R = new Float64Array(n);
  const hiCut = clamp(1 - Math.log2(f0 / 523) / 2.5, 0.35, 1);
  fmPair(L, { fs, f0, pm, r, cRatio: 1, mRatio: 3.5, level: 0.7, index: (t) => hiCut * ((0.8 + 2.4 * v) * Math.exp(-t / 0.22) + 0.25) });
  fmPair(R, { fs, f0, pm, r, cRatio: 1, mRatio: 3.5, level: 0.7, detune: 3, index: (t) => hiCut * ((0.8 + 2.4 * v) * Math.exp(-t / 0.2) + 0.25) });
  const shine = new Float64Array(n);
  fmPair(shine, { fs, f0, pm, r, cRatio: 2, mRatio: 1, level: 0.3, index: (t) => (0.6 + 1.4 * v) * hiCut * Math.exp(-t / 0.06) });
  for (let i = 0; i < n; i++) { L[i] += shine[i]; R[i] += shine[i]; }
  return [L, R];
}

export function mallet({ fs, f0, pm, r, v, n }) {
  const x = new Float64Array(n);
  const hiCut = clamp(1 - Math.log2(f0 / 523) / 2.5, 0.3, 1);
  fmPair(x, { fs, f0, pm, r, cRatio: 1, mRatio: 4, level: 0.8, index: (t) => hiCut * (0.4 + 2.2 * v) * Math.exp(-t / 0.025) });
  const tone = new Float64Array(n);
  fmPair(tone, { fs, f0, pm, r, cRatio: 4, mRatio: 1, level: 0.18 * hiCut, index: () => 0 });
  for (let i = 0; i < n; i++) x[i] += tone[i] * Math.exp(-i / fs / 0.07);
  return [x, Float64Array.from(x)];
}

// Pulse lead in the style of early game consoles: fixed duty cycle steps instead of smooth PWM.
export function chip({ fs, f0, pm, r, n }) {
  const x = new Float64Array(n);
  let t = r();
  const step = Math.round(0.06 * fs);
  let pw = 0.125;
  for (let i = 0; i < n; i++) {
    const dt = Math.min(0.45, f0 * pm[i] / fs);
    t += dt;
    // The duty cycle only changes at a period boundary, otherwise an edge would jump unsmoothed.
    if (t >= 1) { t -= 1; if (i >= step) pw = 0.25; }
    x[i] = 0.5 * pulseBL(t, dt, pw);
  }
  const lp = new SVF(fs); lp.set(11000, 0.6);
  for (let i = 0; i < n; i++) x[i] = lp.tick(x[i]);
  return [x, Float64Array.from(x)];
}
