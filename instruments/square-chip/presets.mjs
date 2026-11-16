import { hz, tonePeriod, envPeriod, CLK, SHAPES } from './chip.mjs';

export const CHORDS = {
  major: [0, 4, 7], minor: [0, 3, 7], sus4: [0, 5, 7], power: [0, 7, 12], octave: [0, 12], maj7: [0, 4, 7, 11],
};

// Software volume envelope of the music driver, one value per frame: full level at once, a few
// steps down to the sustain level, after the gate `rel` steps per frame down to silence.
function swEnv(V, k, gate, decay = 2, every = 3, rel = 2) {
  const held = (j) => Math.max(0, V - Math.min(decay, Math.floor(j / every)));
  if (k < gate) return held(k);
  return Math.max(0, held(gate - 1) - rel * (k - gate + 1));
}

// Delayed frame-rate vibrato in semitones: starts after 12 frames, fades in over 10, 8 frames
// per cycle, vib = 1 is +-0.5 semitone.
function vibrato(k, vib, rate) {
  const delay = Math.round(0.24 * rate), per = rate / 6.25;
  if (vib <= 0 || k < delay) return 0;
  const u = k - delay;
  return 0.5 * vib * Math.min(1, u / (0.2 * rate)) * Math.sin(2 * Math.PI * u / per);
}

const relFrames = (rel) => Math.ceil(15 / rel) + 2;
const drumShift = (midi) => Math.max(-12, Math.min(24, midi - 60));
const noisePeriod = (base, midi) => Math.max(1, Math.min(31, Math.round(base * 2 ** (-drumShift(midi) / 12))));

export const PRESETS = {
  square: {
    rate: 50, vibrato: 0, pitched: true,
    frames: (n) => n.gate + relFrames(2),
    drive(k, r, n) {
      r.tone[0] = true;
      r.tp[0] = tonePeriod(hz(n.midi + vibrato(k, n.vib, 50)));
      r.vol[0] = swEnv(n.V, k, n.gate);
    },
  },
  'echo-lead': {
    rate: 50, vibrato: 0.4, pitched: true,
    frames: (n) => n.gate + relFrames(1) + 9,
    drive(k, r, n) {
      // Channel B repeats channel A 9 frames later, 4 steps (12 dB) quieter and a few cents flat.
      for (const [c, lag, drop] of [[0, 0, 0], [1, 9, 4]]) {
        const j = k - lag;
        r.tone[c] = true;
        if (j < 0) { r.vol[c] = 0; continue; }
        const tp = tonePeriod(hz(n.midi + vibrato(j, n.vib, 50)));
        r.tp[c] = c === 0 ? tp : Math.min(4095, Math.max(tp + 1, Math.round(tp * 1.004)));
        r.vol[c] = Math.max(0, swEnv(n.V, j, n.gate, 3, 4, 1) - drop);
      }
    },
  },
  arp: {
    rate: 50, vibrato: 0, pitched: true,
    frames: (n) => n.gate + relFrames(2),
    drive(k, r, n) {
      r.tone[0] = true;
      const iv = n.chord[k % n.chord.length];
      r.tp[0] = tonePeriod(hz(n.midi + iv + vibrato(k, n.vib, 50)));
      r.vol[0] = swEnv(n.V, k, n.gate, 1, 6);
    },
  },
  'buzz-saw': {
    rate: 50, vibrato: 0, pitched: true, post: true, shape: 'saw-down', buzz: true,
    frames: (n) => n.gate + 4,
    drive: buzzDrive,
  },
  'buzz-tri': {
    rate: 50, vibrato: 0, pitched: true, post: true, shape: 'tri-up', buzz: true,
    frames: (n) => n.gate + 4,
    drive: buzzDrive,
  },
  'env-pluck': {
    rate: 50, vibrato: 0, pitched: true, post: true, shape: 'decay',
    frames: (n) => n.gate + relFrames(2),
    drive(k, r, n) {
      r.tone[0] = true;
      r.tp[0] = tonePeriod(hz(n.midi + vibrato(k, n.vib, 50)));
      if (k === 0) {
        // One-shot shapes stretch one ramp over the note, repeating shapes cycle at 4 Hz.
        const len = n.repeating ? 0.25 : Math.min(9, Math.max(0.05, n.dur));
        r.ep = Math.min(65535, Math.max(1, Math.round(len * CLK / 256)));
        r.shape = SHAPES[n.shape]; r.env[0] = true;
      } else if (k === n.gate) {
        r.env[0] = false; r.vol[0] = r.envLevel;
      } else if (k > n.gate) {
        r.vol[0] = Math.max(0, r.vol[0] - 2);
      }
    },
  },
  'noise-hat': {
    rate: 50, drum: true,
    frames: (n) => (n.dur >= 0.2 ? 17 : 6),
    drive(k, r, n) {
      r.noise[0] = true; r.tone[0] = false;
      r.np = noisePeriod(1, n.midi);
      r.vol[0] = Math.max(0, n.V - (n.dur >= 0.2 ? k : 4 * k));
    },
  },
  'noise-snare': {
    rate: 50, drum: true,
    frames: () => 10,
    drive(k, r, n) {
      r.noise[0] = true; r.tone[0] = k < 2;
      r.np = noisePeriod(6, n.midi);
      r.tp[0] = tonePeriod(hz(55 + drumShift(n.midi) - 3 * k));
      r.vol[0] = Math.max(0, n.V - 2 * k);
      r.tone[1] = true;
      r.tp[1] = tonePeriod(190 * 2 ** (drumShift(n.midi) / 12) * 0.82 ** k);
      r.vol[1] = Math.max(0, n.V - 2 - 4 * k);
    },
  },
  kick: {
    // The drum routine runs on a faster timer interrupt (300 Hz) to sweep the tone quickly.
    rate: 300, drum: true,
    frames: () => 36,
    drive(k, r, n) {
      const t = k / 300, f = 52 * 2 ** (drumShift(n.midi) / 12);
      r.tone[0] = true;
      r.tp[0] = tonePeriod(f * (1 + 7 * Math.exp(-t / 0.011)));
      r.vol[0] = Math.max(0, n.V - Math.max(0, Math.floor((k - 6) / 2)));
      r.noise[1] = true; r.tone[1] = false; r.np = 2;
      r.vol[1] = Math.max(0, n.V - 2 - 3 * k);
    },
  },
};

function buzzDrive(k, r, n) {
  if (k === 0) {
    r.tone[0] = false; r.noise[0] = false; r.env[0] = true;
    r.shape = SHAPES[n.shape];
  }
  const steps = n.shape.startsWith('tri') ? 32 : 16;
  r.ep = envPeriod(hz(n.midi + vibrato(k, n.vib, 50)), steps);
  // Release: the driver drops the channel at the next envelope zero, so the wave ends without a jump.
  if (k === n.gate) r.stopAtZero[0] = true;
}
