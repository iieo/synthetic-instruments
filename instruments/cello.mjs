import { makeInstrument } from './strings-bowed/expression.mjs';

export const meta = { name: 'Cello (bowed waveguide)', range: [36, 84] };

// Low body modes in the ranges reported for cellos (air mode near 100 Hz, main corpus modes
// around 150 to 230 Hz); see docs/bowed-strings.md for sources.
const modes = [
  { f: 102, q: 12, g: 0.6 },  // A0 air mode
  { f: 148, q: 18, g: 0.3 },  // CBR
  { f: 182, q: 20, g: 1.1 },  // B1-
  { f: 218, q: 22, g: 1.1 },  // B1+
  { f: 290, q: 24, g: 0.55 },
  { f: 360, q: 26, g: 0.6 },
  { f: 445, q: 26, g: 0.45 },
  { f: 530, q: 28, g: 0.45 },
  { f: 640, q: 28, g: 1.0 },
  { f: 760, q: 30, g: 0.3 },
];

export const config = {
  beta: 0.15,
  vMin: 0.06, vMax: 0.32,
  pressure: 0.7,
  attack: 0.12,
  muS: 0.8, muD: 0.3, v0: 0.25,
  hfLoss: 0.6,
  t60: 2.5, t60Release: 0.5,
  bowNoise: 0.03,
  torsion: 0.4, torsionSpeed: 5, torsionLoss: 0.6,
  vibrato: { rate: 5.2, cents: 18, delay: 0.35, ramp: 0.5 },
  body: {
    modes,
    // bridge and plate region of the cello lies roughly an octave lower than the violin's
    dense: {
      from: 700, to: 5000, count: 24, q: 20,
      envelope: (f) => 0.1 + 1.3 * Math.exp(-0.5 * (Math.log2(f / 2000) / 0.45) ** 2),
    },
    lowpassHz: 3800, lowpassOrder: 2,
    seed: 23,
  },
  highpassHz: 78, highpassStages: 2,
  gain: 0.25,
  tail: 0.6,
};

const inst = makeInstrument(config);

export const render = inst.render;
export const renderPhrase = inst.renderPhrase;
