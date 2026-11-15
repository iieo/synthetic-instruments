import { makeInstrument } from './strings-bowed/expression.mjs';

export const meta = { name: 'Violin (bowed waveguide)', range: [55, 96] };

// Low body modes after published violin measurements (signature modes A0, CBR, B1-, B1+);
// see docs/bowed-strings.md for sources.
const modes = [
  { f: 275, q: 18, g: 1.0 },   // A0, Helmholtz air mode of the f-holes
  { f: 405, q: 22, g: 0.25 },  // CBR, centre bout rotation
  { f: 470, q: 24, g: 1.2 },   // B1-, first corpus bending mode
  { f: 545, q: 26, g: 1.1 },   // B1+
  { f: 655, q: 28, g: 0.45 },
  { f: 760, q: 28, g: 0.5 },
  { f: 870, q: 30, g: 0.4 },
  { f: 1010, q: 30, g: 0.3 },
];

export const config = {
  beta: 0.15,
  vMin: 0.06, vMax: 0.32,
  pressure: 0.7,
  attack: 0.12,
  muS: 0.8, muD: 0.3, v0: 0.25,
  hfLoss: 0.6,
  t60: 1.6, t60Release: 0.35,
  bowNoise: 0.03,
  torsion: 0.4, torsionSpeed: 5, torsionLoss: 0.6,
  vibrato: { rate: 5.6, cents: 17, delay: 0.3, ramp: 0.45 },
  body: {
    modes,
    // "bridge hill": broad hump of many overlapping modes around 2 to 3 kHz
    dense: {
      from: 1100, to: 9500, count: 28, q: 22,
      envelope: (f) => 0.1 + 0.6 * Math.exp(-0.5 * (Math.log2(f / 2900) / 0.5) ** 2),
    },
    lowpassHz: 8000, lowpassOrder: 2,
    seed: 11,
  },
  highpassHz: 215, highpassStages: 2,
  gain: 0.25,
  tail: 0.5,
};

const inst = makeInstrument(config);

export const render = inst.render;
export const renderPhrase = inst.renderPhrase;
