import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { SVF, clamp, dcBlock, fadeIn, fadeOut, adsr, pitchCurve, noteSeed, ceilPeak } from './synth/dsp.mjs';
import { glottalSource } from './vox/source.mjs';
import { FormantCascade, vowelTrack } from './vox/formants.mjs';

export const meta = { name: 'Vox', presets: ['lead', 'pitched', 'choir'], vowel: ['a', 'e', 'i', 'o', 'u', 'ah-oh'], range: [45, 88] };

// shift: formant scaling. 'pitched' moves the whole vocal tract up, like a vocal played back faster.
const PRESETS = {
  lead: {
    voices: 1, shift: 1, detune: 0, width: 0, a: 0.03, r: 0.09, scoop: -0.6,
    vib: { rate: 5.4, depth: 0.25, delay: 0.25 }, jitter: 0.004, shimmer: 0.03, breath: 0.05,
    air: 2, tilt: [1800, 2600], gain: 0.071,
  },
  pitched: {
    voices: 1, shift: 1.34, detune: 0, width: 0, a: 0.006, r: 0.04, scoop: 0,
    vib: { rate: 6.4, depth: 0.12, delay: 0.15 }, jitter: 0.002, shimmer: 0.02, breath: 0.025,
    air: 2.5, tilt: [2600, 3400], gain: 0.064,
  },
  choir: {
    voices: 6, shift: 0.94, detune: 11, width: 0.9, a: 0.35, r: 0.9, scoop: -0.25,
    vib: { rate: 5, depth: 0.18, delay: 0.2 }, jitter: 0.005, shimmer: 0.04, breath: 0.12,
    air: 1, tilt: [1300, 1500], dark: 7000, gain: 0.037,
  },
};

// Fixed per-vowel level trim so the vowels come out at similar loudness.
const TRIM = { a: 0.87, e: 1.58, i: 2, o: 1.26, u: 1.58 };

function voice({ P, f0, v, gate, n, r, vowel, bend, glide, form }) {
  const vib = P.vib, rate = vib.rate * (P.voices > 1 ? 0.9 + 0.2 * r() : 1), vph = r();
  const extra = (t) => vib.depth * clamp((t - vib.delay) / 0.35, 0, 1) * Math.sin(2 * Math.PI * (rate * t + vph));
  const detune = P.detune * (2 * r() - 1);
  const pm = pitchCurve(n, SR, { bend, glide: glide ?? 0.05, from: P.scoop, extra });
  const fDet = f0 * 2 ** (detune / 1200);
  const tl = P.tilt[0] + P.tilt[1] * v;
  const { voiced, breath } = glottalSource({
    fs: SR, n, r, jitter: P.jitter, shimmer: P.shimmer,
    freq: (t) => fDet * pm[Math.min(n - 1, Math.round(t * SR))], tilt: () => tl,
  });
  const casc = new FormantCascade(SR), bhp = new SVF(SR), air = new SVF(SR);
  bhp.set(1200, 0.6);
  air.set(Math.min(5200 * P.shift * form, 9000), 0.7);
  const track = vowelTrack(vowel, gate), bl = P.breath * (1.3 - 0.6 * v), airLvl = P.air * Math.min(1, Math.sqrt(440 / f0));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (i % 16 === 0) casc.set(track(i / SR), P.shift * form, fDet * pm[i]);
    bhp.tick(breath[i]);
    const src = voiced[i] + bl * bhp.hp;
    // The cascade falls off steeply above the fifth formant; a little of the source above it keeps
    // the presence a real voice has up there.
    air.tick(src);
    out[i] = casc.tick(src) + airLvl * air.hp;
  }
  return out;
}

export function render({ preset = 'lead', midi = 69, velocity = 0.8, duration = 0.6, seed = 1, vowel = 'a', bend, glide }) {
  const P = PRESETS[preset];
  if (!P) throw new Error(`unknown preset ${preset}`);
  const v = clamp(velocity, 0.05, 1), gate = Math.max(0.03, duration);
  const r = rng(noteSeed(seed, [midi], preset + vowel));
  const f0 = midiToHz(midi);
  const n = Math.round((gate + P.r + 0.05) * SR);
  const L = new Float64Array(n), R = new Float64Array(n);
  for (let j = 0; j < P.voices; j++) {
    const x = P.voices === 1 ? 0 : (2 * j) / (P.voices - 1) - 1;
    const form = P.voices === 1 ? 1 : 1 + 0.05 * (2 * r() - 1);
    const y = voice({ P, f0, v, gate, n, r, vowel, bend, glide, form });
    const pan = P.width * x * (j % 2 ? 1 : -1);
    const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2 / Math.sqrt(P.voices);
    const gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2 / Math.sqrt(P.voices);
    for (let i = 0; i < n; i++) { L[i] += gl * y[i]; R[i] += gr * y[i]; }
  }
  const env = adsr({ a: P.a, d: 1, s: 1, r: P.r, gate });
  const hl = new SVF(SR), hr = new SVF(SR), dl = new SVF(SR), dr = new SVF(SR);
  hl.set(110, 0.6); hr.set(110, 0.6); dl.set(P.dark || 16000, 0.6); dr.set(P.dark || 16000, 0.6);
  const vowelTrim = TRIM[vowel] ?? Math.sqrt((TRIM[vowel[0]] ?? 1) * (TRIM[vowel.at(-1)] ?? 1));
  const g = P.gain * vowelTrim * (0.4 + 0.6 * v);
  for (let i = 0; i < n; i++) {
    const e = env(i / SR) * g;
    hl.tick(L[i]); hr.tick(R[i]);
    L[i] = dl.tick(hl.hp) * e;
    R[i] = dr.tick(hr.hp) * e;
  }
  const out = [L, R];
  for (const x of out) dcBlock(x);
  fadeIn(out, 0.001);
  fadeOut(out, 0.02);
  return ceilPeak(out);
}
