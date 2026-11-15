import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { seedInt, decimate } from './synth/dsp.mjs';
import { pluckExcitation, renderTwoPolarisations, dampCurve, pickString } from './strings-plucked/string.mjs';
import { num, pick, design, upsample, edges } from './electric-guitar/dsp.mjs';
import { pickupSignal } from './electric-guitar/pickup.mjs';
import { Stage, toneStack, PowerAmp, cabinet, runChain } from './electric-guitar/amp.mjs';

const OPEN = [40, 45, 50, 55, 59, 64];
const SCALE = 0.648;
// Distance of each pickup from the bridge in metres.
const PICKUPS = { bridge: [0.042], middle: [0.1], neck: [0.158], both: [0.042, 0.158] };

// Steel strings 0.010 to 0.046 inch, B = pi^3 E d^4 / (64 T L^2) for the open strings.
const B_OPEN = [8.5e-5, 6.0e-5, 4.2e-5, 2.6e-5, 2.0e-5, 1.7e-5];

// stages: [gain, coupling high-pass Hz, Miller low-pass Hz] per triode stage.
const PRESETS = {
  clean: {
    pickup: 'neck', drive: 0.35, tone: { bass: 0.6, mid: 0.65, treble: 0.6 },
    stages: [[1.6, 25, 12000]], power: { drive: 0.9, sag: 0.3 }, os: 4, master: 0.4, out: 0.458,
  },
  crunch: {
    pickup: 'bridge', drive: 0.5, tone: { bass: 0.55, mid: 0.7, treble: 0.65 },
    stages: [[3.5, 30, 10000], [2.5, 60, 9000]], power: { drive: 1.6, sag: 0.5 }, os: 4, master: 0.2, out: 0.222,
  },
  lead: {
    pickup: 'bridge', drive: 0.6, tone: { bass: 0.45, mid: 0.8, treble: 0.6 }, sustain: 1.4,
    stages: [[12, 30, 9000], [9, 160, 8000], [5, 120, 7000]], power: { drive: 1.8, sag: 0.6 }, os: 8, master: 0.05, out: 0.223,
  },
  muted: {
    pickup: 'bridge', drive: 0.5, tone: { bass: 0.7, mid: 0.7, treble: 0.55 }, palm: true,
    stages: [[4, 30, 10000], [3, 60, 9000]], power: { drive: 1.6, sag: 0.5 }, os: 4, master: 0.2, out: 0.229,
  },
};

export const meta = {
  name: 'Electric guitar',
  range: [40, 86],
  presets: Object.keys(PRESETS),
  pickups: Object.keys(PICKUPS),
};

const W = 'electric-guitar.render';

function interp(f, f1, v1, f2, v2) {
  const t = Math.min(1.3, Math.max(-0.3, Math.log(f / f1) / Math.log(f2 / f1)));
  return Math.exp(Math.log(v1) + t * (Math.log(v2) - Math.log(v1)));
}

export function render({
  midi = 52, velocity = 0.8, duration = 1.5, seed = 1, preset = 'crunch', pickup, drive,
  bass, mid, treble, pluckPosition, string,
} = {}) {
  preset = pick(W, 'preset', preset, 'crunch', meta.presets);
  const P = PRESETS[preset];
  pickup = pick(W, 'pickup', pickup, P.pickup, meta.pickups);
  midi = num(W, 'midi', midi, 52, meta.range[0], meta.range[1]);
  const v = num(W, 'velocity', velocity, 0.8, 0.05, 1);
  duration = num(W, 'duration', duration, 1.5, 0, 30);
  const dr = num(W, 'drive', drive, P.drive, 0, 1);
  const tone = {
    bass: num(W, 'bass', bass, P.tone.bass, 0, 1),
    mid: num(W, 'mid', mid, P.tone.mid, 0, 1),
    treble: num(W, 'treble', treble, P.tone.treble, 0, 1),
  };
  const pp = num(W, 'pluckPosition', pluckPosition, null, 0.02, 0.98);
  const sd = num(W, 'seed', seed, 1, -1e15, 1e15);
  const s = pickString(W, Math.round(midi), OPEN, string ?? undefined, 22);
  const r = rng((Math.imul(seedInt(sd) ^ 0x5bd1e995, 2654435761) + Math.round(midi * 64) * 40503 + 7) >>> 0 || 1);

  const fret = Math.max(0, midi - OPEN[s]);
  const L = SCALE * 2 ** (-fret / 12);
  const f0 = midiToHz(midi) * 2 ** ((r() - 0.5) * 1.2 / 1200);
  const period = SR / f0;
  const B = B_OPEN[s] * 2 ** (2 * fret / 12);
  // A plectrum about 9 to 13 cm from the bridge; the palm-muting hand forces the pick closer.
  const pickFrom = (P.palm ? 0.07 : 0.11) * (0.85 + 0.3 * r());
  const beta = pp == null ? Math.min(0.45, pickFrom / L) : Math.min(0.5, Math.min(pp, 1 - pp));

  let lo = interp(f0, 82, 9, 660, 3.5) * (P.sustain ?? 1), hi = interp(f0, 82, 1.6, 660, 1.1) * (P.sustain ?? 1), fh = 5000;
  if (P.palm) { lo = 0.6; hi = 0.07; fh = 900; }
  const jitter = 0.92 + 0.16 * r();

  const length = Math.round((duration + 0.25) * SR);
  const c = 2 * L * f0;
  const widthSec = (0.002 + (1 - v) * 0.004) * (0.85 + 0.3 * r()) / c + 0.00002;
  const excite = pluckExcitation({ f0, beta, widthSec, noise: 0.05 * v, rand: r });
  const amp = v ** 1.2;
  for (let i = 0; i < excite.length; i++) excite[i] *= amp;

  const { out: wave } = renderTwoPolarisations({
    f0, B, nDisp: fret < 5 && s < 3 ? 5 : 3, t60lo: lo * jitter, t60hi: hi * jitter, fh,
    excite, length, damp: dampCurve(length, duration, 0.08),
    angle: Math.PI * (0.3 + 0.15 * r()), detuneCents: 0.3 + 0.4 * r(), decayRatio: 0.75, weakGain: 0.7,
  });

  // Pickup mix: comb from the pickup position, coil aperture of about 2 cm, then the coil inductance
  // with the cable capacitance as a resonant low-pass.
  const g = new Float64Array(length);
  const pos = PICKUPS[pickup];
  for (const x of pos) {
    const p = pickupSignal(wave, { frac: Math.min(0.5, x / L), apertureFrac: 0.02 / L, period });
    for (let i = 0; i < length; i++) g[i] += p[i] / pos.length;
  }
  // The hard bridge pickup sees less string motion; a single neck or middle pickup sounds louder.
  const pickupGain = pickup === 'bridge' ? 1.5 : pickup === 'both' ? 1.6 : 1;
  for (let i = 0; i < length; i++) g[i] *= pickupGain;
  design('lp', pickup === 'neck' ? 3600 : 4200, 1.6).run(g);
  design('hp', 30, 0.7).run(g);

  // Preamp, tone stack and power amp at os times the sample rate; the curves would alias otherwise.
  const os = P.os, fs = SR * os;
  const x = upsample(g, os);
  const inGain = 0.25 * 16 ** dr;
  const stages = P.stages.map(([gain, hp, lp], k) => new Stage({ gain: k === 0 ? gain * inGain : gain, hp, lp, k: 1.8, bias: k % 2 ? 0.15 : 0.25 }, fs));
  const ts = toneStack(tone, fs);
  const pa = new PowerAmp(P.power, fs);
  for (let i = 0; i < x.length; i++) {
    let y = x[i];
    for (const st of stages) y = st.step(y);
    for (const f of ts) y = f.step(y);
    x[i] = pa.step(y);
  }
  const y = decimate(x, os).subarray(0, length);
  runChain(y, cabinet());
  design('hp', 20, 0.7).run(y);
  // The master volume follows the drive knob, so turning up the gain changes the sound more than the level.
  const out = P.out * 16 ** (-(dr - P.drive) * P.master);
  for (let i = 0; i < length; i++) y[i] *= out;
  return edges(y, 0.0005, 0.02);
}
