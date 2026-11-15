import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { oscStack, subOsc } from './rave/osc.mjs';
import { SVF, Ladder, decimate, chorus, tightenLowSide, dcBlock, fadeOut } from './rave/dsp.mjs';
import { seedInt } from './synth/dsp.mjs';

export const meta = { name: 'Rave Synth', presets: ['stab', 'whoop', 'screech', 'pad'] };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// `bend` may be a number, a function of time, or breakpoints [[t, semitones], ...] joined linearly.
function bendFn(bend) {
  if (bend == null) return () => 0;
  if (typeof bend === 'number') return () => bend;
  if (typeof bend === 'function') return bend;
  const pts = [...bend].sort((a, b) => a[0] - b[0]);
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        const [t0, s0] = pts[i - 1], [t1, s1] = pts[i];
        return t1 === t0 ? s1 : s0 + (s1 - s0) * (t - t0) / (t1 - t0);
      }
    }
    return pts[pts.length - 1][1];
  };
}

// Per-sample frequency ratio. The user bend runs through an exponential lag (portamento); `extra`
// adds preset-internal pitch modulation in semitones.
function pitchRatio(n, fs, bend, glide, extra = () => 0) {
  const b = bendFn(bend), pm = new Float64Array(n);
  const a = glide > 0 ? 1 - Math.exp(-1 / (glide * fs)) : 1;
  let s = b(0);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    s += a * (b(t) - s);
    pm[i] = 2 ** ((s + extra(t)) / 12);
  }
  return pm;
}

// Attack and release are raised cosines, so every note starts and ends at exactly zero.
function envelope({ a, d, s, r, gate }) {
  const sus = (t) => (t < a ? 0.5 - 0.5 * Math.cos(Math.PI * t / a) : s + (1 - s) * Math.exp(-(t - a) / d));
  const atGate = sus(gate);
  return (t) => {
    if (t < gate) return sus(t);
    const u = t - gate;
    return u >= r ? 0 : atGate * (0.5 + 0.5 * Math.cos(Math.PI * u / r));
  };
}

function finish(L, R, os, { chorusOpts, tail = 0.04 } = {}) {
  let l = decimate(L, os), rr = decimate(R, os);
  dcBlock(l); dcBlock(rr);
  if (chorusOpts) [l, rr] = chorus(l, rr, chorusOpts);
  tightenLowSide(l, rr);
  fadeOut([l, rr], Math.min(tail, 0.02));
  // The linear-phase decimator pre-rings into sample 0; a 1 ms fade-in pins the start to zero.
  const nIn = Math.round(0.001 * SR);
  for (const x of [l, rr]) for (let i = 0; i < nIn; i++) x[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / nIn);
  return [l, rr];
}

function stab({ notes, v, duration, r, bend, glide }) {
  const os = 2, fs = SR * os, rel = 0.07, gate = duration;
  const n = Math.round((gate + rel + 0.03) * fs);
  const pm = pitchRatio(n, fs, bend, glide ?? 0);
  const L = new Float64Array(n), R = new Float64Array(n);
  const lvl = 0.55 / Math.sqrt(notes.length);
  for (const m of notes) oscStack(L, R, { fs, f0: midiToHz(m), pm, r, voices: 7, spread: 34, mix: 0.75, width: 0.85, level: lvl });
  const fl = new Ladder(fs), fr = new Ladder(fs);
  const env = envelope({ a: 0.0015, d: 0.16, s: 0.55, r: rel, gate });
  const root = midiToHz(Math.min(...notes));
  const fBase = 220 + 0.8 * root, fEnv = 2200 + 9000 * v * v;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const fc = fBase + fEnv * Math.exp(-t / 0.1);
    fl.set(fc, 0.38); fr.set(fc, 0.38);
    const g = env(t) * (0.6 + 0.4 * v);
    L[i] = fl.tick(L[i], 2.2) * g;
    R[i] = fr.tick(R[i], 2.2) * g;
  }
  return finish(L, R, os);
}

function whoop({ notes, v, duration, r, bend, glide }) {
  const os = 2, fs = SR * os, rel = 0.14, gate = duration;
  const n = Math.round((gate + rel + 0.05) * fs);
  const dive = 8 + 6 * v, tDive = 0.035, tRise = 0.075;
  const extra = (t) => {
    let s = t < tDive ? -dive * Math.sin(0.5 * Math.PI * t / tDive) : -dive * Math.exp(-(t - tDive) / tRise);
    const vib = clamp((t - 0.35) / 0.4, 0, 1);
    s += 0.12 * vib * Math.sin(2 * Math.PI * 5.3 * t);
    if (t > gate) s -= 4 * ((t - gate) / rel) ** 2;
    return s;
  };
  const pm = pitchRatio(n, fs, bend, glide ?? 0.045, extra);
  const L = new Float64Array(n), R = new Float64Array(n);
  const lvl = 0.5 / Math.sqrt(notes.length);
  for (const m of notes) {
    const f0 = midiToHz(m);
    oscStack(L, R, { fs, f0, pm, r, voices: 5, spread: 20, mix: 0.8, width: 0.55, shape: 'pwmsaw', pulseAmt: 0.75, pwmRate: 0.55, pwmDepth: 0.3, pwmCenter: 0.45, level: lvl });
    subOsc(L, R, { fs, f0, pm, r, level: 0.35 * lvl });
  }
  const fl = new Ladder(fs), fr = new Ladder(fs);
  const env = envelope({ a: 0.004, d: 0.6, s: 0.85, r: rel, gate });
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const fc = 3200 + (2000 + 6000 * v) * Math.exp(-t / 0.35);
    fl.set(fc, 0.12); fr.set(fc, 0.12);
    const g = env(t) * (0.6 + 0.4 * v);
    L[i] = fl.tick(L[i], 3) * g;
    R[i] = fr.tick(R[i], 3) * g;
  }
  return finish(L, R, os, { chorusOpts: { rate: 0.45, base: 0.008, depth: 0.003, mix: 0.6, lp: 9000 } });
}

function screech({ notes, v, duration, r, bend, glide }) {
  const os = 4, fs = SR * os, rel = 0.1, gate = duration;
  const n = Math.round((gate + rel + 0.03) * fs);
  const root = midiToHz(notes[0]);
  const fmRatio = 1.5, rmRatio = 2.37;
  const sweep = (t) => clamp(t / Math.max(0.2, gate), 0, 1);
  // Linear FM on the shared pitch ratio; the index stays below 0.9 so the frequency never crosses zero.
  const fmIdx = (t) => 0.15 + 0.45 * v * (0.5 - 0.5 * Math.cos(Math.PI * sweep(t)));
  const base = pitchRatio(n, fs, bend, glide ?? 0.02, (t) => 0.2 * Math.sin(2 * Math.PI * 6.2 * t) * clamp(t / 0.3, 0, 1));
  const pm = new Float64Array(n);
  let phM = 0;
  for (let i = 0; i < n; i++) {
    phM += root * fmRatio * base[i] / fs;
    phM -= Math.floor(phM);
    pm[i] = base[i] * (1 + fmIdx(i / fs) * Math.sin(2 * Math.PI * phM));
  }
  const L = new Float64Array(n), R = new Float64Array(n);
  const lvl = 0.6 / Math.sqrt(notes.length);
  for (const m of notes) oscStack(L, R, { fs, f0: midiToHz(m), pm, r, voices: 3, spread: 14, mix: 0.8, width: 0.6, level: lvl });
  const bpL = new SVF(fs), bpR = new SVF(fs), nL = new SVF(fs), nR = new SVF(fs), pL = new SVF(fs), pR = new SVF(fs);
  pL.set(7000, 0.8); pR.set(7000, 0.8);
  const env = envelope({ a: 0.003, d: 1.2, s: 0.9, r: rel, gate });
  let phR = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs, sw = sweep(t);
    phR += root * rmRatio * base[i] / fs;
    phR -= Math.floor(phR);
    const ring = Math.sin(2 * Math.PI * phR), rm = 0.35 + 0.3 * sw;
    const lfo = Math.sin(2 * Math.PI * 4.1 * t);
    const fBP = 350 * 2 ** (4.2 * sw + 0.35 * lfo);
    const fN = 3200 * 2 ** (-2.2 * sw - 0.25 * lfo);
    bpL.set(fBP, 7); bpR.set(fBP * 1.03, 7); nL.set(fN, 1.2); nR.set(fN * 0.97, 1.2);
    const g = env(t);
    const chans = [[L, bpL, nL, pL], [R, bpR, nR, pR]];
    for (const [X, bp, nt, post] of chans) {
      const x = X[i] * ((1 - rm) + rm * ring);
      bp.tick(x);
      const y1 = 2.5 * bp.bp + 0.35 * x;
      nt.tick(y1);
      const y2 = y1 - nt.k * nt.bp;
      const drive = 3 + 5 * v;
      const d = Math.tanh(drive * (y2 + 0.12)) - Math.tanh(drive * 0.12);
      X[i] = post.tick(d) * 0.32 * g;
    }
  }
  return finish(L, R, os);
}

function pad({ notes, v, duration, r, bend, glide }) {
  const os = 2, fs = SR * os, rel = 1.4, gate = duration;
  const n = Math.round((gate + rel + 0.05) * fs);
  const pm = pitchRatio(n, fs, bend, glide ?? 0.1);
  const L = new Float64Array(n), R = new Float64Array(n);
  const lvl = 0.5 / Math.sqrt(notes.length + 1);
  for (const m of notes) oscStack(L, R, { fs, f0: midiToHz(m), pm, r, voices: 7, spread: 22, mix: 0.85, width: 1, level: lvl, drift: 4 });
  oscStack(L, R, { fs, f0: midiToHz(Math.min(...notes) - 12), pm, r, voices: 3, spread: 8, mix: 0.6, width: 0.2, level: lvl * 0.8 });
  const fl = new Ladder(fs), fr = new Ladder(fs);
  const a = Math.min(1.2, 0.4 * gate);
  const env = envelope({ a, d: 3, s: 0.85, r: rel, gate });
  const lfoPh = r();
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const swell = clamp(t / (2 * a + 0.5), 0, 1);
    const fc = 380 + 900 * v * swell + 350 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (0.12 * t + lfoPh)));
    fl.set(fc, 0.28); fr.set(fc, 0.28);
    const g = env(t);
    L[i] = fl.tick(L[i], 1.3) * g;
    R[i] = fr.tick(R[i], 1.3) * g;
  }
  return finish(L, R, os, { chorusOpts: { rate: 0.22, base: 0.009, depth: 0.004, mix: 0.5, lp: 7000, phase: 0.25 } });
}

const PRESETS = { stab, whoop, screech, pad };

export function render({ preset = 'stab', midi = 57, chord, velocity = 0.8, duration = 0.25, seed = 1, bend, glide }) {
  const fn = PRESETS[preset];
  if (!fn) throw new Error(`unknown preset ${preset}`);
  const notes = chord && chord.length ? [...chord] : [midi];
  let h = Math.imul(seedInt(seed), 2654435761) >>> 0;
  for (const m of notes) h = (Math.imul(h ^ m, 2246822519) + 3266489917) >>> 0;
  const r = rng(h ^ (preset.length * 374761393));
  return fn({ notes, v: clamp(velocity, 0.05, 1), duration: Math.max(0.02, duration), r, bend, glide });
}
