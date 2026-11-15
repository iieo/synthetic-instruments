// Instrument data per preset. A B-flat tuba (pedal B-flat 0, about 5.5 m of tubing) and a
// B-flat euphonium (pedal B-flat 1, about 2.7 m). Both have four valves, which add 0 to 11
// semitones of tubing. A player picks the natural partial that needs the least extra tubing.
export const PRESETS = {
  tuba: {
    range: [26, 65], pedal: 22, defaultMidi: 41,
    boreR: 0.0095, lipW: 0.02, stiff: 3.0e6, qLip: 5,
    nlLen: 1.2, gR: 0.9, bellFc: 480, bellQ: 0.6, lowRad: 0.12,
    p0: 550, p1: 4800, pSlope: 0.012,
    noise: 0.035, noiseLo: 150, noiseHi: 2200,
    vib: 0.25, vibRate: 4.6, gain: 0.6, tilt: 0.4,
  },
  euphonium: {
    range: [35, 72], pedal: 34, defaultMidi: 53,
    boreR: 0.0075, lipW: 0.016, stiff: 3.6e6, qLip: 5.5,
    nlLen: 1.0, gR: 0.91, bellFc: 720, bellQ: 0.6, lowRad: 0.1,
    p0: 700, p1: 7000, pSlope: 0.015,
    noise: 0.035, noiseLo: 200, noiseHi: 3000,
    vib: 0.55, vibRate: 5.2, gain: 0.305, tilt: 0.4,
  },
};

// Partial 7 is left out: on real instruments it sits far flat and players avoid it.
const PARTIALS = [2, 3, 4, 5, 6, 8, 9, 10, 12];
const MAX_VALVES = 11;

export function fingering(midi, pedal) {
  let best = null;
  for (const n of PARTIALS) {
    const s = pedal + 12 * Math.log2(n) - midi;
    if (s < -0.5 || s > MAX_VALVES + 0.5) continue;
    const valves = Math.max(0, Math.round(s));
    if (!best || valves < best.valves) best = { n, valves };
  }
  return best ?? { n: 2, valves: MAX_VALVES };
}

// Puts a pitch into the preset's range by whole octaves, so a tuba asked for a euphonium-high
// note plays the same pitch class an octave lower instead of a different note.
export function foldIntoRange(midi, [lo, hi]) {
  while (midi > hi) midi -= 12;
  while (midi < lo) midi += 12;
  return Math.max(lo, Math.min(hi, midi));
}
