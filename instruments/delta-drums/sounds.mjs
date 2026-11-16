import { SVF } from '../synth/dsp.mjs';

// Drum sources, synthesized directly at the delta channel's rate fs. Everything stays below fs/2:
// noise is white at fs, tones are sums of harmonics that stop at 0.45 fs. Output peaks at 1.
const TAU = 2 * Math.PI;
const att = (t, a) => (t >= a ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * t / a));
const tol = (r, x, amt) => x * (1 + amt * (2 * r() - 1));

function bp(fs, fc, q) { const s = new SVF(fs); s.set(Math.min(fc, 0.42 * fs), q); return (x) => { s.tick(x); return s.k * s.bp; }; }
function hp(fs, fc, q = 0.7) { const s = new SVF(fs); s.set(Math.min(fc, 0.42 * fs), q); return (x) => { s.tick(x); return s.hp; }; }
function lp(fs, fc, q = 0.7) { const s = new SVF(fs); s.set(Math.min(fc, 0.42 * fs), q); return (x) => s.tick(x); }

// Band-limited square of frequency f at rate fs, from its odd harmonics.
function square(f, fs, n, phase = 0) {
  const y = new Float64Array(n), K = [];
  for (let k = 1; k * f < 0.45 * fs; k += 2) K.push(k);
  for (const k of K) {
    const w = TAU * k * f / fs, a = 4 / (Math.PI * k);
    for (let i = 0; i < n; i++) y[i] += a * Math.sin(w * i + k * phase);
  }
  return y;
}

function sweep(fs, n, f, amp) {
  const y = new Float64Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / fs; y[i] = Math.sin(ph) * amp(t); ph += TAU * f(t) / fs; }
  return y;
}

const VOICES = {
  kick(fs, r) {
    const n = Math.round(0.42 * fs), f1 = tol(r, 52, 0.02);
    const body = sweep(fs, n, (t) => f1 + 125 * Math.exp(-t / 0.032), (t) => att(t, 0.0015) * Math.exp(-t / 0.15));
    const c = lp(fs, 3000);
    for (let i = 0; i < n; i++) { const t = i / fs; body[i] += t < 0.006 ? 0.35 * c(2 * r() - 1) * (1 - t / 0.006) : 0; }
    return body;
  },
  snare(fs, r) {
    const n = Math.round(0.32 * fs), f1 = tol(r, 188, 0.02);
    const tone = sweep(fs, n, (t) => f1 * (1 + 0.35 * Math.exp(-t / 0.01)), (t) => att(t, 0.001) * Math.exp(-t / 0.05));
    const b = bp(fs, 3800, 0.6), h = hp(fs, 900);
    for (let i = 0; i < n; i++) {
      const t = i / fs, e = att(t, 0.001) * (0.7 * Math.exp(-t / 0.1) + 0.3 * Math.exp(-t / 0.018));
      tone[i] = 0.7 * tone[i] + 1.1 * e * h(b(2 * r() - 1));
    }
    return tone;
  },
  'tom-high': (fs, r) => tom(fs, r, 172, 0.2, 0.55),
  'tom-low': (fs, r) => tom(fs, r, 108, 0.27, 0.7),
  clap(fs, r) {
    const n = Math.round(0.36 * fs), b1 = bp(fs, tol(r, 1150, 0.03), 2), b2 = bp(fs, tol(r, 2400, 0.03), 1.4);
    const bursts = [0];
    for (let k = 1; k < 4; k++) bursts.push(bursts[k - 1] + tol(r, 0.0105, 0.15));
    const y = new Float64Array(n), last = bursts[3];
    for (let i = 0; i < n; i++) {
      const t = i / fs, x = 2 * r() - 1;
      let k = 0;
      while (k < 3 && t >= bursts[k + 1]) k++;
      const d = t - bursts[k];
      const e = att(d, 0.0004) * Math.exp(-d / 0.0045) + (t >= last ? 0.55 * att(t - last, 0.003) * Math.exp(-(t - last) / 0.075) : 0);
      y[i] = e * (b1(x) + 0.5 * b2(x));
    }
    return y;
  },
  cowbell(fs, r) {
    const n = Math.round(0.42 * fs);
    const a = square(tol(r, 545, 0.004), fs, n), b = square(tol(r, 815, 0.004), fs, n, r() * TAU);
    const f = bp(fs, 2500, 1.4), g = bp(fs, 900, 1.2), y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / fs, x = a[i] + b[i];
      const e = att(t, 0.0008) * (0.6 * Math.exp(-t / 0.012) + 0.4 * Math.exp(-t / 0.13));
      y[i] = e * (f(x) + 0.6 * g(x));
    }
    return y;
  },
  crash(fs, r, maxLen) {
    const n = Math.round(Math.min(1.6, maxLen) * fs), m = new Float64Array(n);
    for (const f of [263, 371, 412, 497, 586, 845]) {
      const s = square(tol(r, f, 0.01), fs, n, r() * TAU);
      for (let i = 0; i < n; i++) m[i] += s[i] / 6;
    }
    const h = hp(fs, 3200), h2 = hp(fs, 5000), y = new Float64Array(n), fade = Math.round(0.06 * fs);
    for (let i = 0; i < n; i++) {
      const t = i / fs, e = att(t, 0.0015) * (0.75 * Math.exp(-t / 0.45) + 0.25 * Math.exp(-t / 0.04));
      const end = i >= n - fade ? 0.5 + 0.5 * Math.cos(Math.PI * (i - n + fade) / fade) : 1;
      y[i] = e * end * (0.8 * h(2 * r() - 1) + 0.6 * h2(m[i]));
    }
    return y;
  },
  shout(fs, r) {
    // "Hey": breathy onset, then a voiced glide from /e/ towards /i/ through three formants.
    const n = Math.round(0.36 * fs), y = new Float64Array(n);
    const f0 = tol(r, 205, 0.03);
    const F = [[540, 1850, 2500], [330, 2250, 2950]], BW = [90, 110, 150];
    const res = F[0].map(() => new SVF(fs));
    let ph = 0;
    const h = hp(fs, 1200);
    for (let i = 0; i < n; i++) {
      const t = i / fs, u = Math.min(1, Math.max(0, (t - 0.12) / 0.17)), w = u * u * (3 - 2 * u);
      const f = f0 * (1 + 0.08 * Math.exp(-t / 0.05)) * (1 - 0.1 * Math.max(0, (t - 0.2) / 0.16));
      ph += TAU * f / fs;
      let g = 0;
      for (let k = 1; k * f < 0.45 * fs && k < 60; k++) g += Math.sin(k * ph) / k;
      const voiced = att(Math.max(0, t - 0.03), 0.025) * (t > 0.29 ? 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (t - 0.29) / 0.07)) : 1);
      const breath = h(2 * r() - 1) * (att(t, 0.004) * Math.exp(-t / 0.05) * 1.2 + 0.08 * voiced);
      const x = voiced * g + breath;
      let s = 0;
      for (let j = 0; j < 3; j++) {
        const fc = F[0][j] + (F[1][j] - F[0][j]) * w;
        if (fc > 0.42 * fs) continue;
        res[j].set(fc, fc / BW[j]);
        res[j].tick(x);
        s += [1, 0.6, 0.35][j] * res[j].k * res[j].bp;
      }
      y[i] = s;
    }
    return y;
  },
  slap(fs, r) {
    const n = Math.round(0.6 * fs), y = new Float64Array(n), f0 = tol(r, 98, 0.01);
    const phs = [];
    for (let k = 1; k * f0 * 1.02 < 0.45 * fs && k <= 40; k++) phs.push(k);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fs, f = f0 * (1 + 0.025 * Math.exp(-t / 0.03));
      ph += TAU * f / fs;
      let s = 0;
      for (const k of phs) {
        const pop = k >= 3 && k <= 9 ? 1.8 * Math.exp(-t / 0.02) : 0;
        s += Math.sin(k * ph) / k * (Math.exp(-t * (2.2 + 1.4 * k)) * (1 + pop));
      }
      y[i] = att(t, 0.0008) * s;
    }
    const c = bp(fs, 2200, 0.8);
    for (let i = 0; i < Math.round(0.004 * fs); i++) y[i] += 0.5 * c(2 * r() - 1) * (1 - i / (0.004 * fs));
    return y;
  },
};

function tom(fs, r, f, tau, len) {
  const n = Math.round(len * fs), f1 = tol(r, f, 0.015);
  const y = sweep(fs, n, (t) => f1 * (1 + 0.45 * Math.exp(-t / 0.045)), (t) => att(t, 0.0012) * Math.exp(-t / tau));
  const c = bp(fs, 1800, 0.8);
  for (let i = 0; i < Math.round(0.005 * fs); i++) y[i] += 0.2 * c(2 * r() - 1) * (1 - i / (0.005 * fs));
  return y;
}

export const VOICE_NAMES = Object.keys(VOICES);

export function source(voice, fs, r, maxLen) {
  const y = VOICES[voice](fs, r, maxLen);
  let p = 0;
  for (const v of y) p = Math.max(p, Math.abs(v));
  for (let i = 0; i < y.length; i++) y[i] /= p;
  return y;
}
