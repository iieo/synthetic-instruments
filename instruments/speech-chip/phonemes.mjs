// Formant targets (Hz) and bandwidths for an adult voice, sampled at 8 kHz. Four resonances plus
// a fifth pole pair at 0 Hz: two real poles that give the spectral tilt of the glottal pulse.
const TILT_F = 0, TILT_B = 560;

export const VOWELS = {
  a: { F: [730, 1090, 2440, 3400, TILT_F], B: [90, 110, 170, 250, TILT_B] },
  e: { F: [530, 1840, 2480, 3400, TILT_F], B: [70, 100, 160, 250, TILT_B] },
  i: { F: [270, 2290, 3010, 3500, TILT_F], B: [60, 100, 170, 250, TILT_B] },
  o: { F: [570, 840, 2410, 3400, TILT_F], B: [80, 90, 160, 250, TILT_B] },
  u: { F: [300, 870, 2240, 3400, TILT_F], B: [70, 90, 160, 250, TILT_B] },
};

// Consonant loci: where the formants start before they move to the vowel.
const LOCUS = {
  b: { F: [250, 800, 2200, 3300, TILT_F], B: [80, 120, 200, 300, TILT_B] },
  d: { F: [300, 1700, 2700, 3400, TILT_F], B: [80, 120, 200, 300, TILT_B] },
  k: { F: [320, 1950, 2300, 3300, TILT_F], B: [90, 140, 200, 300, TILT_B] },
  s: { F: [380, 1650, 2600, 3400, TILT_F], B: [90, 140, 200, 300, TILT_B] },
};

// Noise spectra for bursts and frication. A resonance at 0 Hz with a wide band acts as tilt, one
// near 4 kHz with a wide band as a lift towards the top.
const NOISE = {
  bBurst: { F: [400, 1000, 2100, 3000, TILT_F], B: [500, 500, 600, 700, 900] },
  dBurst: { F: [600, 1800, 2900, 3500, 3900], B: [600, 350, 300, 350, 1200] },
  kBurst: { F: [700, 1950, 2350, 3300, TILT_F], B: [500, 180, 250, 500, 1400] },
  s: { F: [900, 2500, 3350, 3750, 3950], B: [1500, 700, 420, 300, 900] },
  voiceBar: { F: [180, 900, 2300, 3300, TILT_F], B: [60, 400, 500, 600, TILT_B] },
};

const lerpSpec = (p, q, w) => ({
  F: p.F.map((f, i) => (f > 0 && q.F[i] > 0 ? f * (q.F[i] / f) ** w : f + (q.F[i] - f) * w)),
  B: p.B.map((b, i) => b + (q.B[i] - b) * w),
});

const transition = (from, to, n, dbFrom) => Array.from({ length: n }, (_, j) => {
  const w = (j + 1) / (n + 1), s = w * w * (3 - 2 * w);
  return { voiced: true, spec: lerpSpec(from, to, s), db: dbFrom * (1 - s) };
});

// Frames before the vowel for each syllable: voiced flag, spectrum, level in dB relative to the
// vowel. `null` spectrum means a silent frame (energy 0).
export const ONSETS = {
  ba: (v) => [
    { voiced: true, spec: NOISE.voiceBar, db: -24 },
    { voiced: true, spec: NOISE.voiceBar, db: -22 },
    { voiced: false, spec: NOISE.bBurst, db: -12 },
    ...transition(LOCUS.b, v, 3, -5),
  ],
  da: (v) => [
    { voiced: true, spec: NOISE.voiceBar, db: -24 },
    { voiced: true, spec: NOISE.voiceBar, db: -22 },
    { voiced: false, spec: NOISE.dBurst, db: -8 },
    ...transition(LOCUS.d, v, 3, -5),
  ],
  ka: (v) => [
    { voiced: false, spec: null, db: -Infinity },
    { voiced: false, spec: NOISE.kBurst, db: -6 },
    { voiced: false, spec: lerpSpec(LOCUS.k, v, 0.5), db: -12 },
    ...transition(LOCUS.k, v, 2, -4),
  ],
  sa: (v) => [
    { voiced: false, spec: NOISE.s, db: -18 },
    { voiced: false, spec: NOISE.s, db: -9 },
    { voiced: false, spec: NOISE.s, db: -6 },
    { voiced: false, spec: NOISE.s, db: -6 },
    { voiced: false, spec: NOISE.s, db: -7 },
    { voiced: false, spec: NOISE.s, db: -10 },
    ...transition(LOCUS.s, v, 2, -4),
  ],
};

export const scaleSpec = (s, fScale, bScale = 1) => ({
  F: s.F.map((f) => Math.min(3920, f * fScale)),
  B: s.B.map((b, i) => (s.F[i] > 0 ? b * bScale : b)),
});

// Every spectrum the instrument can ask for, used to fit the coefficient tables.
export function inventory() {
  const out = [];
  for (const v of Object.values(VOWELS)) {
    out.push(v, scaleSpec(v, 1.08, 0.7));
    for (const make of Object.values(ONSETS)) for (const f of make(v)) if (f.spec) out.push(f.spec);
  }
  return out;
}
