// Register values as the chip takes them. Per operator: mult (index into the multiplier table,
// 0 = x0.5, 1..10 = x1..x10, 12 = x12, 14 = x15), tl (total level, 0.75 dB steps), ar/dr/sl/rr
// (4-bit attack, decay, sustain level in 3 dB steps, release), sus (hold at the sustain level while
// the key is down, else keep decaying with the release rate), ksr, ksl (0..3), ws (waveform 0..3),
// am (tremolo), vib (vibrato). Per voice: fb (modulator feedback 0..7) and add (both operators
// to the output instead of the modulator driving the carrier). `layer` plays a second channel
// with the F-number raised by that many steps.
const op = (o) => ({ mult: 1, tl: 0, ar: 15, dr: 0, sl: 0, rr: 8, sus: true, ksr: false, ksl: 0, ws: 0, am: false, vib: false, ...o });

export const PRESETS = {
  piano: {
    fb: 4, add: false,
    mod: op({ mult: 1, tl: 27, ar: 15, dr: 5, sl: 5, rr: 6, sus: false, ksl: 2, ksr: true }),
    car: op({ mult: 1, tl: 0, ar: 15, dr: 3, sl: 7, rr: 6, sus: false, ksr: true }),
  },
  organ: {
    fb: 3, add: true, deepVib: false,
    mod: op({ mult: 2, tl: 9, ar: 14, dr: 0, sl: 0, rr: 8, ws: 2, vib: true }),
    car: op({ mult: 1, tl: 0, ar: 14, dr: 0, sl: 0, rr: 8, vib: true }),
  },
  brass: {
    fb: 6, add: false, deepVib: false,
    mod: op({ mult: 1, tl: 19, ar: 6, dr: 2, sl: 2, rr: 7, ksl: 1, vib: true }),
    car: op({ mult: 1, tl: 0, ar: 8, dr: 1, sl: 1, rr: 7, vib: true }),
  },
  bass: {
    fb: 5, add: false,
    mod: op({ mult: 1, tl: 17, ar: 15, dr: 6, sl: 6, rr: 9, ksl: 1 }),
    car: op({ mult: 1, tl: 0, ar: 15, dr: 4, sl: 3, rr: 9 }),
  },
  strings: {
    fb: 6, add: false, layer: 3, deepVib: true,
    mod: op({ mult: 1, tl: 26, ar: 6, dr: 1, sl: 1, rr: 6, vib: true }),
    car: op({ mult: 1, tl: 0, ar: 6, dr: 1, sl: 1, rr: 6, vib: true, am: true }),
  },
  bell: {
    fb: 0, add: false,
    mod: op({ mult: 7, tl: 18, ar: 15, dr: 3, sl: 15, rr: 4, sus: false, ksl: 1 }),
    car: op({ mult: 2, tl: 0, ar: 15, dr: 3, sl: 15, rr: 3, sus: false, ksl: 1 }),
  },
  guitar: {
    fb: 6, add: false,
    mod: op({ mult: 3, tl: 24, ar: 15, dr: 6, sl: 15, rr: 8, sus: false, ws: 1, ksl: 2, ksr: true }),
    car: op({ mult: 1, tl: 0, ar: 15, dr: 4, sl: 15, rr: 7, sus: false, ksr: true }),
  },
  // Rhythm voices. The kick is an ordinary two-operator voice whose pitch the driver lowers at its
  // timer rate; snare and hi-hat replace the operator phase by noise and phase bits.
  'drum-kick': {
    fb: 6, add: false, rhythm: 'kick', shift: -24, oneShot: 0.35,
    mod: op({ mult: 1, tl: 14, ar: 15, dr: 9, sl: 15, rr: 10, sus: false }),
    car: op({ mult: 1, tl: 0, ar: 15, dr: 6, sl: 15, rr: 9, sus: false }),
  },
  'drum-snare': {
    rhythm: 'snare', shift: -5, oneShot: 0.25,
    car: op({ mult: 1, tl: 0, ar: 14, dr: 8, sl: 15, rr: 9, sus: false }),
  },
  'drum-hat': {
    rhythm: 'hat', shift: 24, oneShot: 0.12,
    car: op({ mult: 1, tl: 0, ar: 14, dr: 10, sl: 15, rr: 10, sus: false }),
  },
};
