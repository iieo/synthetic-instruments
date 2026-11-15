// Tone generator of an electromechanical drawbar organ: one shaft at 20 rev/s drives twelve gear
// pairs, one per pitch class. Each pitch class has wheels with 2, 4, 8, ... 256 teeth, so all
// octaves of a pitch class are exact 2:1, while the twelve gear ratios only approximate equal
// temperament.
const SHAFT_HZ = 20;
const GEARS = [[85, 104], [71, 82], [67, 73], [35, 36], [69, 67], [12, 11], [37, 32], [49, 40], [48, 37], [11, 8], [67, 46], [54, 35]];

export const WHEELS = 91;
// MIDI pitch of wheel 1 (the lowest C, 32.7 Hz).
export const WHEEL1_MIDI = 24;

export function wheelHz(w) {
  const k = (w - 1) % 12, oct = Math.floor((w - 1) / 12);
  const [a, b] = GEARS[k];
  return SHAFT_HZ * (a / b) * 2 ** (oct + 1);
}

export function wheelCents(w) {
  const et = 440 * 2 ** ((w - 1 + WHEEL1_MIDI - 69) / 12);
  return 1200 * Math.log2(wheelHz(w) / et);
}

// Fixed per-wheel properties of this one generator (not seed dependent): small level scatter from
// the magnet gap, and the waveform. The pole piece of a low wheel sees a tooth profile that is not
// a pure sine, mostly a little 3rd and some 2nd harmonic; high wheels have a filter capacitor and
// are almost pure.
function hash(w, k) {
  let h = Math.imul(w * 374761393 + k * 668265263, 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function wheelVoice(w) {
  const x = (w - 1) / (WHEELS - 1);
  return {
    level: 10 ** (((hash(w, 1) - 0.5) * 2) / 20) * (1 - 0.25 * x * x),
    h2: 0.012 * (1 - x) * (0.5 + hash(w, 2)),
    h3: 0.045 * (1 - x) ** 1.5 * (0.6 + 0.8 * hash(w, 3)),
    p2: 2 * Math.PI * hash(w, 4),
    p3: 2 * Math.PI * hash(w, 5),
  };
}

// Drawbar footages as pitch offsets in semitones relative to the 8' drawbar:
// 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1'.
export const DRAWBAR_SHIFT = [-12, 7, 0, 12, 19, 24, 28, 31, 36];

// Wheel number for a key and pitch offset. Keys run from C (midi 36) to C (midi 96); the 8'
// drawbar of the lowest key uses wheel 13. Pitches above the last wheel fold back an octave.
export function wheelFor(midi, shift) {
  let w = midi - WHEEL1_MIDI + 1 + shift;
  while (w > WHEELS) w -= 12;
  while (w < 1) w += 12;
  return w;
}

// Each drawbar step is about 3 dB; 0 is silent.
export const drawbarGain = (n) => (n <= 0 ? 0 : 10 ** ((-3 * (8 - n)) / 20));
