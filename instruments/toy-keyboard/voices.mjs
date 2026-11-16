// Master clock of the tone generator (a cheap ceramic resonator) and the twelve integer dividers
// for the top octave C8..B8 (MIDI 108..119). Every lower octave comes from binary division.
export const CLOCK = 1_000_000;
export const TOP = 108;
export const DIVIDERS = Array.from({ length: 12 }, (_, pc) => Math.round(CLOCK / (440 * 2 ** ((TOP + pc - 69) / 12))));

const hexTable = (s) => Array.from(s, (c) => parseInt(c, 16));

// 4-bit sample tables (32 steps, 0..15) of the later sample voices.
export const SAMPLES = {
  piano: hexTable('efeeeffedccdcbaaaa9888886310137b'),
  bells: hexTable('fda857dc9bccdb78a62215ba54202339'),
  fantasy: hexTable('ffb989bc844666acddb646863200357a'),
};

// Footages available from the divider chain, as functions of the counter position q (0..63,
// 32 positions per cycle of the note): square, octave up, two octaves up, 25 % and 12.5 % pulse
// (AND of binary stages) and the sub-octave square from the next stage.
const BITS = {
  sq: (q) => ((q & 31) < 16 ? 1 : 0),
  oct: (q) => ((q & 15) < 8 ? 1 : 0),
  oct2: (q) => ((q & 7) < 4 ? 1 : 0),
  p25: (q) => ((q & 31) < 8 ? 1 : 0),
  p12: (q) => ((q & 31) < 4 ? 1 : 0),
  sub: (q) => (q < 32 ? 1 : 0),
};

// Resistor mix of the footages, AC coupled: the table holds the mix minus its mean over the cycle.
function mixTable(mix) {
  const t = new Float64Array(64);
  for (let q = 0; q < 64; q++) for (const [k, w] of Object.entries(mix)) t[q] += w * BITS[k](q);
  const mean = t.reduce((a, b) => a + b, 0) / 64;
  for (let q = 0; q < 64; q++) t[q] -= mean;
  return t;
}

// env: a attack and d decay time constants of the keying capacitor, s the level it holds,
// r the release with sustain off, rs with sustain on. filters run in order at 48 kHz.
export const PRESETS = {
  piano: {
    sample: 'piano', vibrato: false, gain: 0.099,
    env: { a: 0.002, d: 0.75, s: 0, r: 0.07, rs: 0.9 },
    filters: [['lp', 4200], ['lp', 9000]],
  },
  organ: {
    mix: { sq: 1, oct: 0.55, oct2: 0.3, sub: 0.45 }, vibrato: false, gain: 0.416,
    env: { a: 0.004, d: 1, s: 1, r: 0.02, rs: 0.45 },
    filters: [['lp', 3800], ['hp', 90]],
  },
  flute: {
    mix: { sq: 1 }, vibrato: true, gain: 1.27,
    env: { a: 0.045, d: 1, s: 1, r: 0.05, rs: 0.5 },
    filters: [['svf', 950, 0.6], ['lp', 3000]],
  },
  violin: {
    mix: { p25: 1, oct: 0.22 }, vibrato: true, gain: 0.906,
    env: { a: 0.09, d: 1, s: 1, r: 0.09, rs: 0.6 },
    filters: [['hp', 260], ['lp', 2600], ['lp', 6000]],
  },
  trumpet: {
    mix: { p12: 1, p25: 0.7 }, vibrato: false, gain: 0.412,
    env: { a: 0.03, d: 1, s: 1, r: 0.05, rs: 0.5 },
    filters: [['svf', 1700, 2.2], ['hp', 180]],
  },
  'synth-drum': {
    mix: { sq: 1, p25: 0.4 }, vibrato: false, gain: 0.83, drop: 0.22,
    env: { a: 0.0015, d: 0.16, s: 0, r: 0.04, rs: 0.3 },
    filters: [['lp', 2800]],
  },
  bells: {
    sample: 'bells', vibrato: false, gain: 0.0934,
    env: { a: 0.001, d: 1.1, s: 0, r: 0.25, rs: 1.4 },
    filters: [['lp', 6500], ['hp', 150]],
  },
  fantasy: {
    sample: 'fantasy', vibrato: true, gain: 0.1196, echo: { period: 0.15, fall: 0.55, count: 7 },
    env: { a: 0.003, d: 0.11, s: 0, r: 0.3, rs: 0.9 },
    filters: [['lp', 5500], ['hp', 120]],
  },
};

for (const p of Object.values(PRESETS)) if (p.mix) p.table = mixTable(p.mix);
