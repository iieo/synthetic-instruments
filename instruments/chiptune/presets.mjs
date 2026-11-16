import { K, periodFor } from './chip.mjs';

export const CHORDS = { major: [0, 4, 7], minor: [0, 3, 7], power: [0, 7, 12] };

// Volume fraction per frame for a held note: instant attack, linear decay by `d` per frame down
// to `s`, then `r` frames of release from wherever it is.
function held(f, gate, { d, s, r }) {
  const at = (g) => Math.max(s, 1 - d * g);
  if (f < gate) return at(f);
  return Math.max(0, at(gate - 1) * (1 - (f - gate + 1) / r));
}

const vibratoOffset = (f, depth, delay) => {
  if (depth <= 0 || f < delay) return 0;
  const ramp = Math.min(1, (f - delay + 1) / 15);
  // A 6 Hz triangle LFO sampled on the frame grid (10 frames per cycle).
  const ph = (f - delay) % 10;
  const tri = ph < 5 ? -1 + ph * 0.4 : 1 - (ph - 5) * 0.4;
  return 0.6 * depth * ramp * tri;
};

// Each preset: channel kinds, default vibrato, length in frames, and the frame driver.
// `n` is the note: { midi, V (peak 4-bit volume), gate (frames), vibrato, chord }.
const sustained = (kind, duty, env, extra = {}) => ({
  chans: [kind], vibrato: 0, ...extra,
  frames: (n) => n.gate + env.r,
  drive: (h, [c], n) => {
    if (h & 1) return;
    const f = h >> 1;
    if (duty) c.setDuty(typeof duty === 'function' ? duty(f) : duty);
    if (kind === 'noise') { c.short = !!extra.short; c.P = periodFor(n.midi, K.noise); }
    else c.P = periodFor(n.midi + vibratoOffset(f, n.vibrato, extra.delay ?? 12) + (extra.arp ? n.chord[f % 3] : 0), K[kind]);
    c.vol = Math.round(n.V * held(f, n.gate, env));
  },
});

// Sweep unit: every half frame the period grows by P >> shift (pitch falls), until `stop`.
const sweep = (c, shift, stop) => { c.P = Math.min(stop, c.P + (c.P >> shift)); };

export const PRESETS = {
  lead: sustained('pulse', (f) => (f < 3 ? 50 : 25), { d: 0.05, s: 0.7, r: 5 }, { vibrato: 0.5, delay: 12 }),
  arp: sustained('pulse', 12, { d: 0.03, s: 0.75, r: 4 }, { arp: true }),
  bass: {
    chans: ['triangle', 'pulse'], vibrato: 0,
    frames: (n) => n.gate + 3,
    drive: (h, [tri, pu], n) => {
      if (h & 1) return;
      const f = h >> 1, env = { d: 0, s: 1, r: 3 };
      tri.P = periodFor(n.midi + vibratoOffset(f, n.vibrato, 12), K.triangle);
      tri.vol = Math.round(n.V * held(f, n.gate, env));
      pu.setDuty(25);
      pu.P = periodFor(n.midi + 12, K.pulse);
      pu.vol = f < n.gate ? Math.round(n.V * 0.5 * Math.max(0, 1 - f / 5)) : 0;
    },
  },
  pulse12: sustained('pulse', 12, { d: 0.03, s: 0.75, r: 4 }),
  pulse25: sustained('pulse', 25, { d: 0.03, s: 0.75, r: 4 }),
  pulse50: sustained('pulse', 50, { d: 0.03, s: 0.75, r: 4 }),
  triangle: sustained('triangle', null, { d: 0, s: 1, r: 3 }),
  wave: sustained('wave', null, { d: 0.02, s: 0.8, r: 4 }),
  noise: sustained('noise', null, { d: 0.02, s: 0.6, r: 6 }),
  'noise-short': sustained('noise', null, { d: 0.02, s: 0.6, r: 6 }, { short: true }),
  kick: {
    chans: ['triangle', 'noise'], vibrato: 0, oneShot: true,
    frames: () => 10,
    drive: (h, [tri, nz], n) => {
      const f = h >> 1, stop = periodFor(n.midi - 24, K.triangle);
      if (h === 0) tri.P = periodFor(n.midi, K.triangle);
      else sweep(tri, 2, stop);
      if (h & 1) return;
      tri.vol = Math.round(n.V * [1, 1, 0.9, 0.8, 0.65, 0.5, 0.35, 0.2, 0.1, 0][f]);
      nz.P = periodFor(n.midi + 36, K.noise);
      nz.vol = f === 0 ? Math.round(n.V * 0.6) : 0;
    },
  },
  snare: {
    chans: ['noise', 'pulse'], vibrato: 0, oneShot: true,
    frames: () => 14,
    drive: (h, [nz, pu], n) => {
      if (h & 1) return;
      const f = h >> 1;
      nz.P = periodFor(n.midi + 12, K.noise);
      nz.vol = Math.round(n.V * Math.max(0, 1 - f / 13) ** 1.3);
      pu.setDuty(50);
      pu.P = periodFor(n.midi - 3 * f, K.pulse);
      pu.vol = f < 4 ? Math.round(n.V * 0.7 * (1 - f / 4)) : 0;
    },
  },
  hat: {
    chans: ['noise'], vibrato: 0, oneShot: true,
    frames: () => 5,
    drive: (h, [nz], n) => {
      if (h & 1) return;
      const f = h >> 1;
      nz.short = true;
      nz.P = periodFor(n.midi + 24, K.noise);
      nz.vol = Math.round(n.V * [1, 0.6, 0.35, 0.15, 0][f]);
    },
  },
  laser: {
    chans: ['pulse'], vibrato: 0, oneShot: true,
    frames: () => 14,
    drive: (h, [c], n) => {
      if (h === 0) { c.P = periodFor(n.midi + 12, K.pulse); c.setDuty(25); }
      else sweep(c, 3, 4095);
      if (h & 1) return;
      const f = h >> 1;
      c.vol = c.P >= 4095 ? 0 : Math.round(n.V * Math.min(1, Math.max(0, (13 - f) / 7)));
    },
  },
  coin: {
    chans: ['pulse'], vibrato: 0, oneShot: true,
    frames: () => 28,
    drive: (h, [c], n) => {
      if (h & 1) return;
      const f = h >> 1;
      c.setDuty(50);
      c.P = periodFor(n.midi + (f < 4 ? 0 : 7), K.pulse);
      c.vol = Math.round(n.V * (f < 4 ? 1 : Math.max(0, 1 - (f - 4) / 23)));
    },
  },
};
