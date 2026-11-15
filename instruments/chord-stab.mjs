import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { Ladder } from './rave/dsp.mjs';
import { sawInto, increments, envelope, finish, monoBelow, edges, lowpass } from './reese/osc.mjs';
import { organNote, pianoNote } from './chord-stab/additive.mjs';
import { seedInt, ceilPeak } from './synth/dsp.mjs';

const OS = 2, FS = SR * OS;

export const SHAPES = {
  minor7: [0, 3, 7, 10], minor: [0, 3, 7, 12], major: [0, 4, 7, 12], maj7: [0, 4, 7, 11],
  sus: [0, 5, 7, 12], fifths: [0, 7, 12, 19],
};

// Synth timbres: per chord tone `voices` saws spread over ±spread cents, one ladder per channel for
// the whole chord. Additive timbres skip the filter.
const PRESETS = {
  minor7: {
    shape: 'minor7', kind: 'synth', voices: 3, spread: 9, pulse: 0.35, width: 0.5,
    amp: { a: 0.001, d: 0.18, s: 0.3, r: 0.07 }, cutoff: 350, envAmt: 5200, envTau: 0.09, res: 0.25, drive: 1.6, gain: 1.2,
  },
  major: {
    shape: 'major', kind: 'synth', voices: 5, spread: 24, pulse: 0, width: 0.9,
    amp: { a: 0.0012, d: 0.2, s: 0.35, r: 0.08 }, cutoff: 600, envAmt: 8000, envTau: 0.12, res: 0.2, drive: 1.8, gain: 1.36,
  },
  sus: {
    shape: 'sus', kind: 'synth', voices: 2, spread: 6, pulse: 0.6, width: 0.6,
    amp: { a: 0.001, d: 0.12, s: 0.15, r: 0.06 }, cutoff: 450, envAmt: 6500, envTau: 0.05, res: 0.5, drive: 1.4, gain: 1.15,
  },
  organ: {
    shape: 'fifths', kind: 'organ', width: 0.6,
    amp: { a: 0.002, d: 0.3, s: 0.55, r: 0.05 }, gain: 0.122,
  },
  piano: {
    shape: 'minor', kind: 'piano', width: 0.5,
    amp: { a: 0.0008, d: 5, s: 1, r: 0.09 }, gain: 0.24,
  },
};

export const meta = { name: 'Chord Stab', presets: Object.keys(PRESETS), range: [36, 79] };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function synth(p, notes, v, gate, r) {
  const n = Math.round((gate + p.amp.r + 0.02) * FS);
  const L = new Float64Array(n), R = new Float64Array(n);
  const lvl = 0.6 / Math.sqrt(notes.length * p.voices);
  for (const m of notes) {
    const f0 = midiToHz(m);
    for (let j = 0; j < p.voices; j++) {
      const x = p.voices === 1 ? 0 : (j / (p.voices - 1)) * 2 - 1;
      const cents = p.spread * x + 1.5 * (r() - 0.5);
      const buf = new Float64Array(n);
      sawInto(buf, increments(n, FS, f0, null, () => cents), { phase: r(), pulse: p.pulse, pw: 0.5 });
      const pan = clamp(p.width * x * (j % 2 ? -1 : 1), -1, 1);
      const gl = lvl * Math.cos((pan + 1) * Math.PI / 4), gr = lvl * Math.sin((pan + 1) * Math.PI / 4);
      for (let i = 0; i < n; i++) { L[i] += gl * buf[i]; R[i] += gr * buf[i]; }
    }
  }
  const env = envelope({ ...p.amp, gate });
  const fl = new Ladder(FS), fr = new Ladder(FS);
  const base = p.cutoff + 0.6 * midiToHz(Math.min(...notes));
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    const fc = base + p.envAmt * (0.25 + 0.75 * v * v) * Math.exp(-t / p.envTau);
    fl.set(fc, p.res); fr.set(fc, p.res);
    const g = env(t) * (0.55 + 0.45 * v);
    L[i] = fl.tick(L[i], p.drive) * g;
    R[i] = fr.tick(R[i], p.drive) * g;
  }
  return finish([L, R], OS, { gain: p.gain });
}

function additive(p, notes, v, gate, r) {
  const n = Math.round((gate + p.amp.r + 0.02) * SR);
  const L = new Float64Array(n), R = new Float64Array(n);
  notes.forEach((m, k) => {
    const pan = notes.length === 1 ? 0 : p.width * ((k / (notes.length - 1)) * 2 - 1) * (k % 2 ? -0.6 : 1);
    const opts = { f0: midiToHz(m), n, pan, v, r, midi: m };
    if (p.kind === 'organ') organNote(L, R, opts); else pianoNote(L, R, opts);
  });
  if (p.kind === 'piano') {
    // Hammer knock: a short noise burst through a two-pole low-pass, centred.
    const lp = lowpass(900 + 1500 * v, 0.7), nb = Math.round(0.03 * SR);
    for (let i = 0; i < nb; i++) {
      const y = lp.tick((2 * r() - 1) * Math.exp(-i / (0.004 * SR))) * 0.6 * v;
      L[i] += y; R[i] += y;
    }
  }
  const env = envelope({ ...p.amp, gate });
  const g0 = 0.6 + 0.4 * v;
  for (let i = 0; i < n; i++) { const g = env(i / SR) * g0 * p.gain; L[i] *= g; R[i] *= g; }
  return finish([L, R], 1, {});
}

export function render({ preset = 'minor7', midi = 60, velocity = 0.8, duration = 0.2, seed = 1, shape, chord }) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset ${preset}`);
  const sh = SHAPES[shape ?? p.shape];
  if (!sh) throw new Error(`unknown shape ${shape}`);
  const notes = chord && chord.length ? [...chord] : sh.map((s) => midi + s);
  const v = clamp(velocity, 0.05, 1), gate = Math.max(0.02, duration);
  let h = Math.imul(seedInt(seed), 2654435761) >>> 0;
  for (const m of notes) h = (Math.imul(h ^ m, 2246822519) + 3266489917) >>> 0;
  const r = rng(h || 1);
  const [L, R] = p.kind === 'synth' ? synth(p, notes, v, gate, r) : additive(p, notes, v, gate, r);
  monoBelow(L, R, 120);
  edges(L); edges(R);
  return ceilPeak([L, R]);
}
