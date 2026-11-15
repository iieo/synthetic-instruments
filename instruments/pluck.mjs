import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { clamp, decimate, dcBlock, fadeIn, fadeOut, adsr, pitchCurve, noteSeed, ceilPeak } from './synth/dsp.mjs';
import { sawPluck, bell, mallet, chip } from './pluck/voices.mjs';
import { pingPong, echoTail } from './pluck/echo.mjs';

export const meta = { name: 'Pluck', presets: ['pluck', 'bell', 'mallet', 'chip'], range: [36, 96] };

const OS = 4, FS = SR * OS;

// decay: time constant of the free decay at middle C, shorter for higher notes.
const PRESETS = {
  pluck: { voice: sawPluck, a: 0.0015, decay: 0.26, s: 0, r: 0.05, echo: { time: 0.3, feedback: 0.38, mix: 0.3 }, gain: 0.5 },
  bell: { voice: bell, a: 0.001, decay: 0.9, s: 0, r: 0.08, echo: { time: 0.36, feedback: 0.35, mix: 0.24 }, gain: 0.73 },
  mallet: { voice: mallet, a: 0.001, decay: 0.38, s: 0, r: 0.05, echo: { time: 0.25, feedback: 0.3, mix: 0.16 }, gain: 0.8 },
  chip: {
    voice: chip, a: 0.002, decay: 0.25, s: 0.7, r: 0.03, echo: { time: 0.2, feedback: 0.3, mix: 0.14 }, gain: 0.85,
    vib: { rate: 6, depth: 0.3, delay: 0.18 },
  },
};

export function render({ preset = 'pluck', midi = 72, velocity = 0.8, duration = 0.3, seed = 1, delay, feedback, mix, bend, glide = 0.02 }) {
  const P = PRESETS[preset];
  if (!P) throw new Error(`unknown preset ${preset}`);
  const v = clamp(velocity, 0.05, 1), gate = Math.max(0.02, duration);
  const r = rng(noteSeed(seed, [midi], preset));
  const f0 = midiToHz(midi);
  const decay = P.decay * 2 ** (-(midi - 60) / 30);
  const ring = P.s > 0 ? gate : Math.min(gate, 7 * decay);
  const echo = { ...P.echo, ...(delay != null && { time: delay }), ...(feedback != null && { feedback: clamp(feedback, 0, 0.9) }), ...(mix != null && { mix: clamp(mix, 0, 1) }) };
  const tail = echoTail(echo);
  const n = Math.round((ring + P.r + 0.03) * FS);

  const vib = P.vib;
  const extra = vib ? (t) => vib.depth * clamp((t - vib.delay) / 0.25, 0, 1) * Math.sin(2 * Math.PI * vib.rate * t) : () => 0;
  const pm = pitchCurve(n, FS, { bend, glide, extra });
  const [L, R] = P.voice({ fs: FS, f0, pm, r, v, n });
  const env = adsr({ a: P.a, d: decay, s: P.s, r: P.r, gate: ring });
  const g = P.gain * (0.35 + 0.65 * v);
  for (let i = 0; i < n; i++) {
    const e = env(i / FS) * g;
    L[i] *= e; R[i] *= e;
  }

  const dry = [decimate(L, OS), decimate(R, OS)];
  fadeIn(dry, 0.0005);
  const len = dry[0].length + Math.round((tail + 0.05) * SR);
  const out = dry.map((x) => { const y = new Float64Array(len); y.set(x); return y; });
  pingPong(out[0], out[1], echo);
  for (const x of out) dcBlock(x);
  fadeOut(out, 0.03);
  return ceilPeak(out);
}
