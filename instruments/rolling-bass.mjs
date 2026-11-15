import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { Ladder } from './rave/dsp.mjs';
import { sawInto, increments, envelope, finish, monoBelow, edges } from './reese/osc.mjs';
import { seedInt } from './synth/dsp.mjs';

const OS = 2, FS = SR * OS;

// Each layer: [detune in cents, pulse amount, level]. `sub` is a sine one octave down.
const PRESETS = {
  offbeat: {
    layers: [[0, 0.45, 0.75], [7, 0, 0.35]], sub: 0.35, width: 0,
    amp: { a: 0.0012, d: 0.09, s: 0.35, r: 0.03 },
    cutoff: 140, keyTrack: 1.2, envAmt: 3200, envTau: 0.055, res: 0.28, drive: 2.2, scoop: 0, gain: 1.2,
  },
  rolling: {
    layers: [[-5, 0, 0.6], [5, 0, 0.6]], sub: 0.55, width: 0,
    amp: { a: 0.0015, d: 0.07, s: 0.2, r: 0.025 },
    cutoff: 110, keyTrack: 1, envAmt: 1700, envTau: 0.04, res: 0.42, drive: 1.6, scoop: 0, gain: 0.92,
  },
  howl: {
    layers: [[-19, 0.6, 0.45], [-6, 0.6, 0.45], [6, 0.6, 0.45], [19, 0.6, 0.45]], sub: 0.4, width: 0.9,
    pwm: { rate: 1.3, depth: 0.25 },
    amp: { a: 0.004, d: 0.16, s: 0.5, r: 0.06 },
    cutoff: 260, keyTrack: 2, envAmt: 2600, envTau: 0.14, res: 0.2, drive: 1.8, scoop: -3, scoopTau: 0.045, gain: 0.68,
  },
};

export const meta = { name: 'Rolling Bass', presets: Object.keys(PRESETS), range: [28, 64] };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function render({ preset = 'offbeat', midi = 40, velocity = 0.8, duration = 0.15, seed = 1 }) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset ${preset}`);
  const v = clamp(velocity, 0.05, 1), gate = Math.max(0.02, duration);
  const r = rng((seedInt(seed) * 2246822519 + midi * 3266489917) >>> 0 || 1);
  const n = Math.round((gate + p.amp.r + 0.02) * FS);
  const f0 = midiToHz(midi);
  const semis = p.scoop ? (t) => p.scoop * Math.exp(-t / p.scoopTau) : null;
  const stereo = p.width > 0;
  const L = new Float64Array(n), R = stereo ? new Float64Array(n) : L;

  p.layers.forEach(([cents, pulse, lvl], j) => {
    const off = cents + 1.2 * (r() - 0.5);
    const inc = increments(n, FS, f0, semis, () => off);
    const buf = new Float64Array(n);
    if (p.pwm) {
      // Pulse width moves per layer; sawInto takes one width, so render in short blocks.
      const rate = p.pwm.rate * (0.8 + 0.4 * r()), ph0 = r();
      let phase = r();
      for (let s = 0; s < n; s += 256) {
        const e = Math.min(n, s + 256);
        const pw = 0.5 + p.pwm.depth * Math.sin(2 * Math.PI * (rate * s / FS + ph0));
        phase = sawInto(buf, inc.subarray(s, e), { phase, pulse, pw, start: s });
      }
    } else {
      sawInto(buf, inc, { phase: preset === 'howl' ? r() : 0, pulse });
    }
    const x = p.layers.length === 1 ? 0 : (j / (p.layers.length - 1)) * 2 - 1;
    const pan = clamp(x * p.width * (j % 2 ? -1 : 1), -1, 1);
    const gl = lvl * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = lvl * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    for (let i = 0; i < n; i++) {
      if (stereo) { L[i] += gl * buf[i]; R[i] += gr * buf[i]; } else L[i] += lvl * buf[i];
    }
  });

  const env = envelope({ ...p.amp, gate });
  const chans = stereo ? [L, R] : [L];
  const filters = chans.map(() => new Ladder(FS));
  const base = p.cutoff + p.keyTrack * f0;
  let sp = 0;
  const subInc = increments(n, FS, f0 / 2, semis, null);
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    const fc = base + p.envAmt * (0.35 + 0.65 * v) * Math.exp(-t / p.envTau);
    sp += subInc[i]; sp -= Math.floor(sp);
    const sub = p.sub * Math.sin(2 * Math.PI * sp);
    const g = env(t) * (0.5 + 0.5 * v);
    for (let c = 0; c < chans.length; c++) {
      filters[c].set(fc, p.res);
      chans[c][i] = (filters[c].tick(chans[c][i], p.drive) + sub) * g;
    }
  }
  const out = finish(chans, OS, { gain: p.gain });
  if (!stereo) return out[0];
  monoBelow(out[0], out[1], 120);
  edges(out[0]); edges(out[1]);
  return out;
}
