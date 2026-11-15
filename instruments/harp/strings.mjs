import { midiToHz } from '../../lib/audio.mjs';

// Physical table of a 47-string concert harp, C1 (midi 24) to G7 (midi 103).
// Lengths, tensions and materials are typical values; diameters follow from f = sqrt(T/mu) / 2L.

const AIR_VISCOSITY = 1.8e-5;
const AIR_DENSITY = 1.2;

const MATERIALS = {
  // Wound bass: steel core carries the stiffness, copper wrap adds mass and wrap friction.
  wire: { density: 5500, E: 200e9, coreRatio: 0.5, lossAngle: 4e-4, friction: 0.5e-4 },
  gut: { density: 1300, E: 3.5e9, coreRatio: 1, lossAngle: 0.018, friction: 4e-4 },
  nylon: { density: 1140, E: 4.5e9, coreRatio: 1, lossAngle: 0.012, friction: 2.5e-4 },
};

export function material(midi) {
  if (midi <= 43) return 'wire';
  if (midi <= 88) return 'gut';
  return 'nylon';
}

// Speaking lengths in metres at the C strings and the top G: the bass is strongly foreshortened,
// the treble comes close to halving per octave.
const LENGTHS = [[24, 1.5], [36, 1.27], [48, 0.97], [60, 0.64], [72, 0.38], [84, 0.205], [96, 0.105], [103, 0.075]];

function lengthOf(midi) {
  for (let i = 1; i < LENGTHS.length; i++) {
    const [m1, l1] = LENGTHS[i - 1], [m2, l2] = LENGTHS[i];
    if (midi <= m2 || i === LENGTHS.length - 1) return l1 * (l2 / l1) ** ((midi - m1) / (m2 - m1));
  }
}

const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

export function stringParams(midi) {
  const f0 = midiToHz(midi);
  const L = lengthOf(midi);
  const T = midi < 60 ? lerp(170, 95, (midi - 24) / 36) : lerp(95, 60, (midi - 60) / 43);
  const name = material(midi);
  const m = MATERIALS[name];
  const mu = T / (2 * L * f0) ** 2;
  const d = Math.sqrt((4 * mu) / (Math.PI * m.density));
  const dCore = d * m.coreRatio;
  const I = (Math.PI * dCore ** 4) / 64;
  const B = (Math.PI ** 2 * m.E * I) / (T * L * L);
  return { midi, f0, L, T, mu, d, B, EI: m.E * I, lossAngle: m.lossAngle, friction: m.friction, material: name };
}

// Amplitude decay rate sigma (1/s) of a partial at frequency f, sum of four mechanisms:
// air friction on a cylinder, viscoelastic loss in bending, a frequency-independent internal
// friction (fibres in gut, the wrap on wound strings) and energy flow into the soundboard
// through the bridge (sigma_b = T Re(Y) / L for a lossless string ending on admittance Y).
export function decayRate(s, f, admittance) {
  const w = 2 * Math.PI * f;
  const R = 2 * Math.PI * AIR_VISCOSITY + 2 * Math.PI * s.d * Math.sqrt(Math.PI * AIR_VISCOSITY * AIR_DENSITY * f);
  const qAir = R / (2 * Math.PI * s.mu * f);
  const bendShare = (s.EI * w * w * s.mu) / (s.T * s.T);
  const qVisc = s.lossAngle * bendShare;
  const sigmaBridge = (s.T * admittance(f)) / s.L;
  return Math.PI * f * (qAir + qVisc + s.friction) + sigmaBridge;
}
