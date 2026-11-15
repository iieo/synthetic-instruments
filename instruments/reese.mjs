import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { Ladder, SVF } from './rave/dsp.mjs';
import { sawInto, increments, envelope, finish, monoBelow, edges } from './reese/osc.mjs';
import { seedInt } from './synth/dsp.mjs';

const OS = 4, FS = SR * OS;

const PRESETS = {
  clean: {
    saws: 2, detune: 11, wobble: 0.35, wobbleRate: 0.17, width: 0.55,
    cutoff: 700, keyTrack: 1.5, envAmt: 1400, envTau: 0.35, lfoOct: 0.45, lfoRate: 0.21, res: 0.15,
    drive: 0, sub: 0.6, release: 0.08, gain: 0.55,
  },
  dark: {
    saws: 3, detune: 17, wobble: 0.45, wobbleRate: 0.09, width: 0.65,
    cutoff: 300, keyTrack: 0.8, envAmt: 500, envTau: 0.6, lfoOct: 0.7, lfoRate: 0.11, res: 0.32,
    drive: 0.4, sub: 0.7, release: 0.12, gain: 0.6,
  },
  growl: {
    saws: 3, detune: 24, wobble: 0.5, wobbleRate: 0.23, width: 0.45,
    cutoff: 1300, keyTrack: 2, envAmt: 2200, envTau: 0.2, lfoOct: 0.3, lfoRate: 0.35, res: 0.25,
    drive: 1, formant: { rate: 1.6, lo: 380, hi: 1500, q: 5, amt: 1.6 }, post: 5200,
    sub: 0.5, release: 0.08, gain: 0.82,
  },
};

export const meta = { name: 'Reese Bass', presets: Object.keys(PRESETS), range: [24, 60] };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Asymmetric soft clip, zero at zero input; the bias adds even harmonics.
const clip = (x, d, b) => (Math.tanh(d * (x + b)) - Math.tanh(d * b)) / d;

export function render({ preset = 'clean', midi = 36, velocity = 0.8, duration = 1, seed = 1, glide = 0, from }) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset ${preset}`);
  const v = clamp(velocity, 0.05, 1), gate = Math.max(0.02, duration);
  const r = rng((seedInt(seed) * 2654435761 + midi * 40503) >>> 0 || 1);
  const n = Math.round((gate + p.release + 0.03) * FS);
  const f0 = midiToHz(midi);
  // Optional slide from another note into this one (exponential approach, time constant `glide`).
  const semis = from != null && glide > 0 ? (t) => (from - midi) * Math.exp(-t / glide) : null;

  const L = new Float64Array(n), R = new Float64Array(n), M = new Float64Array(n);
  for (let j = 0; j < p.saws; j++) {
    const x = p.saws === 1 ? 0 : (j / (p.saws - 1)) * 2 - 1;
    const ph = r(), rate = p.wobbleRate * (0.7 + 0.6 * r()), off = 1.5 * (r() - 0.5);
    // Detune breathes slowly, so the beating between the saws speeds up and slows down.
    const cents = (t) => x * p.detune * (1 + p.wobble * Math.sin(2 * Math.PI * (rate * t + ph))) + off;
    const inc = increments(n, FS, f0, semis, cents);
    const buf = new Float64Array(n);
    sawInto(buf, inc, { phase: r() });
    const pan = clamp(x * p.width, -1, 1), lv = 0.6;
    const gl = lv * Math.cos((pan + 1) * Math.PI / 4), gr = lv * Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < n; i++) { L[i] += gl * buf[i]; R[i] += gr * buf[i]; }
  }
  {
    const inc = increments(n, FS, f0, semis, null);
    let ph = 0;
    for (let i = 0; i < n; i++) { ph += inc[i]; ph -= Math.floor(ph); M[i] = Math.sin(2 * Math.PI * ph); }
  }

  const env = envelope({ a: 0.006, d: 0.5, s: 0.85, r: p.release, gate });
  const fl = new Ladder(FS), fr = new Ladder(FS);
  const fmL = new SVF(FS), fmR = new SVF(FS), pl = new SVF(FS), pr = new SVF(FS);
  if (p.post) { pl.set(p.post, 0.7); pr.set(p.post, 0.7); }
  const lfoPh = r(), fPh = r();
  const base = p.cutoff + p.keyTrack * f0;
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    const lfo = Math.sin(2 * Math.PI * (p.lfoRate * t + lfoPh));
    const fc = (base + p.envAmt * v * Math.exp(-t / p.envTau)) * 2 ** (p.lfoOct * lfo);
    fl.set(fc, p.res); fr.set(fc, p.res);
    let yl = fl.tick(L[i], 1.2), yr = fr.tick(R[i], 1.2);
    if (p.drive) {
      const d = 1 + 5 * p.drive * (0.5 + 0.5 * v);
      yl = clip(yl * 1.5, d, 0.15); yr = clip(yr * 1.5, d, 0.15);
    }
    if (p.formant) {
      const q = p.formant, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (q.rate * t + fPh));
      const ff = q.lo * (q.hi / q.lo) ** w;
      fmL.set(ff, q.q); fmR.set(ff * 1.04, q.q);
      fmL.tick(yl); fmR.tick(yr);
      yl += q.amt * fmL.bp / q.q; yr += q.amt * fmR.bp / q.q;
    }
    if (p.post) { yl = pl.tick(yl); yr = pr.tick(yr); }
    const g = env(t) * (0.55 + 0.45 * v);
    const sub = p.sub * M[i];
    L[i] = (yl + sub) * g;
    R[i] = (yr + sub) * g;
  }
  const [l, rr] = finish([L, R], OS, { gain: p.gain });
  monoBelow(l, rr, 120);
  edges(l); edges(rr);
  return [l, rr];
}
