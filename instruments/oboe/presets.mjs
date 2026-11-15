// Bore and reed data per instrument. Lengths in metres; x0 is the length of the missing cone tip
// (apex to reed), which stays the same for every fingering.
export const PRESETS = {
  oboe: {
    nominal: [58, 93],      // B-flat 3 to A6
    x0: 0.08,
    second: 74, third: 80,  // first notes with the octave key and of the third register
    latticeFc: 2500,        // loss filter of the open tone-hole lattice at the lowest note
    wallLoss: 0.975,
    zeta: [0.8, 0.8], gamma: [0.45, 0.65],
    reedRatio: 1.3, reedQ: 4,
    holePos: 0.92, holeK: 5, apexMax: 0.25, leak: 2,
    kick: 0.5, kickT: 0.04, tongueAt: 0.008, tongueN: 0.003,
    formant: [[1250, 1.2, 8], [3000, 2, 5]],
    radHp: 600,
    bulb: null,
    lp: 6500,
  },
  'english-horn': {
    nominal: [52, 84],      // E3 to C6, a fifth below the oboe
    x0: 0.11,
    second: 67, third: 72,
    latticeFc: 1800,
    wallLoss: 0.975,
    zeta: [0.8, 0.8], gamma: [0.45, 0.65],
    reedRatio: 1.3, reedQ: 4,
    holePos: 0.92, holeK: 5, apexMax: 0.25, leak: 2,
    kick: 0.5, kickT: 0.04, tongueAt: 0.008, tongueN: 0.003,
    formant: [[900, 1.2, 7], [2300, 2, 3]],
    radHp: 400,
    // Bulb bell: a cavity behind a narrow throat, resonance [Hz, Q, dB] in the radiated sound.
    bulb: [620, 2, 6],
    lp: 4800,
  },
};
