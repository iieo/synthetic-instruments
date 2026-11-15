import { SR, rng } from '../lib/audio.mjs';
import { noteSeed } from './synth/dsp.mjs';
import { besselJ } from './drums/membrane.mjs';
import { hertzContact, modalBank, biquad } from './metal/modal.mjs';
import { headModes, stretchCoef } from './timpani/head.mjs';

export const meta = {
  name: 'Timpani',
  range: [36, 62],
  presets: ['normal', 'soft', 'hard', 'roll'],
};

export const RANGE = { velocity: [0.01, 1], duration: [0.05, 12] };

// Mallets: head mass (kg) and felt stiffness of the Hertz law F = K d^1.5. Contact times from
// velocity 0.2 to 1: 2.8 to 1.9 ms (normal felt), 5.6 to 3.8 ms (soft, thick felt), 1.1 to 0.74 ms (hard).
const MALLET = {
  normal: { mass: 0.024, K: 1.6e6, e: 0.55 },
  soft: { mass: 0.026, K: 3.2e5, e: 0.45 },
  hard: { mass: 0.02, K: 1.4e7, e: 0.6 },
};
MALLET.roll = { ...MALLET.normal, mass: 0.02 };

// Level trim in dB at MIDI 36, 38, ..., 62, set so that the loudest of six seeds at velocity 0.2,
// 0.6 and 1 peaks near -3 dBFS at every pitch.
const TRIM = {
  normal: [-29.8, -30.7, -31.1, -31.6, -31.8, -32.0, -32.2, -32.1, -32.1, -31.7, -31.2, -30.3, -29.1, -28.2],
  soft: [-29.4, -29.4, -29.5, -29.4, -28.9, -28.0, -27.2, -25.8, -24.8, -24.0, -22.9, -21.9, -20.6, -19.1],
  hard: [-28.9, -29.7, -30.9, -31.7, -32.5, -32.4, -33.5, -34.1, -34.7, -35.2, -35.3, -35.2, -35.6, -35.7],
  roll: [-33.4, -34.3, -34.4, -34.4, -34.7, -35.0, -34.5, -34.4, -34.8, -34.4, -33.2, -33.2, -32.6, -31.7],
};

function trimDb(preset, midi) {
  const t = TRIM[preset], u = (midi - 36) / 2, i = Math.min(t.length - 2, Math.floor(u));
  return t[i] + (t[i + 1] - t[i]) * (u - i);
}

function num(name, v, def, [lo, hi]) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`timpani: ${name} must be a finite number, got ${String(v)}`);
  return Math.min(hi, Math.max(lo, v));
}

// Kettle sizes from about 81 cm (lowest drum) down to 58 cm.
const radius = (midi) => 0.405 - (0.115 * (midi - 36)) / 26;

// Decay times: the principal and its harmonic partners ring for seconds; axisymmetric modes
// radiate strongly (monopoles) and lose their energy within a few tenths of a second; modes with
// two or more nodal circles are damped by the felt collar and the air in the kettle.
function t60Of(md, f11) {
  const base = 3.6 * Math.sqrt(100 / f11);
  if (md.m === 0) return 0.25 + 0.1 * Math.sqrt(100 / f11);
  if (md.n === 1) return Math.max(0.2, base * (1.0 / md.ratio) ** 0.9);
  return Math.max(0.08, 0.7 * base / md.ratio);
}

// Radiation weight of a mode with m nodal diameters.
const RAD = [1.6, 1, 0.55, 0.36, 0.26, 0.2, 0.16, 0.13, 0.11, 0.1, 0.09, 0.08, 0.07];

export function render({ midi = 45, velocity = 0.8, duration = 4, preset = 'normal', seed = 1 } = {}) {
  if (preset == null) preset = 'normal';
  if (!meta.presets.includes(preset)) throw new Error(`timpani: unknown preset ${String(preset)}`);
  midi = Math.round(num('midi', midi, 45, meta.range));
  const vel = num('velocity', velocity, 0.8, RANGE.velocity);
  const dur = num('duration', duration, 4, RANGE.duration);
  seed = num('seed', seed, 1, [-Infinity, Infinity]);
  const r = rng(noteSeed(seed, [midi], `timpani-${preset}`));
  const a = radius(midi);
  const list = headModes(midi, a);
  const f11 = list.find((md) => md.m === 1 && md.n === 1).f;
  const mal = MALLET[preset];

  const modes = {
    f: list.map((md) => md.f * (1 + 0.0015 * (r() - 0.5) * (md.m === 1 && md.n === 1 ? 0 : 1))),
    t60: list.map((md) => t60Of(md, f11) * (0.9 + 0.2 * r())),
    m: list.map((md) => md.M),
    gout: list.map((md) => 2 * Math.PI * md.f * RAD[Math.min(md.m, RAD.length - 1)]),
    kk: list.map((md) => md.k2),
    wq: list.map((md) => md.N),
  };

  // Strokes: one, or a single-stroke roll with two mallets whose rate rises with pitch.
  const strokes = [];
  const shape = (rho, th) => Float64Array.from(list, (md) => besselJ(md.m, md.j * rho) * Math.cos(md.m * th));
  if (preset === 'roll') {
    const rate = 10 + (6 * (midi - 36)) / 26;
    const hands = [{ rho: 0.74 + 0.03 * r(), th: 0.22 }, { rho: 0.76 + 0.03 * r(), th: -0.2 }];
    let t = 0, k = 0;
    while (t < dur) {
      const h = hands[k & 1];
      const swell = 0.75 + 0.25 * Math.min(1, t / 0.4);
      strokes.push({ t, v: vel * swell * (0.85 + 0.15 * r()) * (k & 1 ? 0.95 : 1), rho: h.rho + 0.02 * (r() - 0.5), th: h.th + 0.1 * (r() - 0.5) });
      t += (1 / rate) * (0.9 + 0.2 * r());
      k++;
    }
  } else {
    strokes.push({ t: 0, v: vel, rho: 0.74 + 0.05 * r(), th: 0.2 * (r() - 0.5) });
  }
  const drives = strokes.map((s) => {
    const c = hertzContact({ mass: mal.mass, K: mal.K, v: 0.25 + 3.75 * s.v ** 1.5, e: mal.e, maxMs: 40 });
    return { start: 1 + Math.round(s.t * SR), imp: c.imp, phi: shape(s.rho, s.th) };
  });

  // The player damps the head with the hand at `duration` (single strokes) or lets the last stroke
  // of a roll ring for a while.
  const ringEnd = preset === 'roll' ? dur + 1.6 : dur;
  const natural = Math.max(...modes.t60);
  const nMax = Math.round(((preset === 'roll' ? dur + Math.min(1.6, natural) : Math.min(dur, natural * 1.05)) + 0.4) * SR);
  // The rim takes up most of the stretch. The factor is fitted so that a fortissimo stroke on the
  // low drum glides by up to half a semitone; the tighter heads of the high drums glide far less.
  const berger = { coef: stretchCoef(list, 0.12 * (f11 / 98) ** 1.2), lpHz: 30 };
  let y = modalBank(modes, drives, nMax, { berger, floorDb: -90 });
  y = biquad(biquad(y, 'hp', 28, 0.7), 'lp', 9000, 0.6);

  const g = 10 ** (trimDb(preset, midi) / 20);
  const muteAt = Math.round(ringEnd * SR), muteTau = 0.07 * SR, muteIn = Math.round(0.02 * SR);
  let end = y.length;
  if (muteAt < y.length) end = Math.min(y.length, muteAt + Math.round(muteTau * 9.2));
  const out = new Float64Array(end);
  for (let i = 0; i < end; i++) {
    let env = 1;
    if (i > muteAt) { const u = i - muteAt; env = Math.exp(-(u < muteIn ? (u * u) / (2 * muteIn) : u - muteIn / 2) / muteTau); }
    out[i] = g * y[i] * env;
  }
  const fade = Math.min(end, Math.round(0.05 * SR));
  for (let i = 0; i < fade; i++) out[end - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
  const atk = 8;
  for (let i = 0; i < atk && i < end; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / atk);
  out[0] = 0; out[end - 1] = 0;
  return out;
}
