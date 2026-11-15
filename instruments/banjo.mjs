import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { seedInt } from './synth/dsp.mjs';
import { pluckExcitation, renderTwoPolarisations, dampCurve } from './strings-plucked/string.mjs';
import { applyBody } from './strings-plucked/body.mjs';
import { num, pick, design, edges, OnePole } from './electric-guitar/dsp.mjs';
import { headModes } from './banjo/head.mjs';

// Open G with the short fifth string: D3 G3 B3 D4 and the drone g4, which starts at the fifth fret
// and is only played open.
const OPEN = [50, 55, 59, 62];
const DRONE = 67;
const SCALE = 0.67;
const B_OPEN = [5.5e-5, 3.2e-5, 2.6e-5, 2.1e-5];
// Radiated peak of the pick scrape per unit of the preset's click level.
const CLICK_PEAK = 0.19;

const PRESETS = {
  // Metal finger picks near the bridge.
  finger: {
    from: 0.065, contact: 0.002, click: 0.35, t60: [3.2, 1.6, 0.55, 0.35], fh: 4500,
    headQ: 22, out: 1.52,
  },
  // Flat pick a little further up, slightly wider contact and a louder scrape.
  pick: {
    from: 0.09, contact: 0.003, click: 0.5, t60: [3.0, 1.5, 0.5, 0.32], fh: 4500,
    headQ: 22, out: 1.43,
  },
  // A mute clamped onto the bridge: it adds mass and damping where string and head meet.
  muted: {
    from: 0.09, contact: 0.0025, click: 0.105, t60: [0.9, 0.5, 0.12, 0.08], fh: 1800,
    headQ: 9, out: 1.745, lp: 2600,
  },
};

export const meta = { name: 'Banjo', range: [50, 84], presets: Object.keys(PRESETS) };

const W = 'banjo.render';

function interp(f, f1, v1, f2, v2) {
  const t = Math.min(1.4, Math.max(-0.3, Math.log(f / f1) / Math.log(f2 / f1)));
  return Math.exp(Math.log(v1) + t * (Math.log(v2) - Math.log(v1)));
}

const headCache = new Map();
function head(preset, tension) {
  const key = `${preset}:${tension.toFixed(3)}`;
  if (headCache.has(key)) return headCache.get(key);
  if (headCache.size > 64) headCache.delete(headCache.keys().next().value);
  const P = PRESETS[preset];
  // f ~ sqrt(T): the tension knob spans a slack head (about 250 Hz) to a very tight one (about 470 Hz).
  const f01 = 250 * Math.sqrt(1 + 2.5 * tension);
  const modes = headModes({ f01, rFrac: 0.42, q: P.headQ, fMax: 7500 });
  // Air in the pot behind the head, vented through the gap at the rim.
  modes.push([155, 5, 0.45]);
  headCache.set(key, modes);
  return modes;
}

// The bridge stands on the head; the head is light, so its modes carry most of the sound.
function radiate(x, preset, tens) {
  const P = PRESETS[preset];
  const y = applyBody(x, head(preset, tens), 0.35);
  design('hp', 90, 0.8).run(y);
  // A light head radiates like a small piston: pressure follows acceleration, rising 6 dB per octave
  // up to about 700 Hz.
  const tilt = new OnePole(700);
  for (let i = 0; i < y.length; i++) y[i] = tilt.hp(y[i]);
  if (P.lp) design('lp', P.lp, 0.7).run(y);
  design('lp', 9000, 0.7).run(y);
  return y;
}

export function render({
  midi = 62, velocity = 0.8, duration = 1, seed = 1, preset = 'finger', tension, pluckPosition, string,
} = {}) {
  preset = pick(W, 'preset', preset, 'finger', meta.presets);
  const P = PRESETS[preset];
  midi = num(W, 'midi', midi, 62, meta.range[0], meta.range[1]);
  const v = num(W, 'velocity', velocity, 0.8, 0.05, 1);
  duration = num(W, 'duration', duration, 1, 0, 30);
  const sd = num(W, 'seed', seed, 1, -1e15, 1e15);
  const tens = num(W, 'tension', tension, 0.6, 0, 1);
  const pp = num(W, 'pluckPosition', pluckPosition, null, 0.02, 0.98);
  if (string !== undefined && string !== null && !(Number.isInteger(string) && string >= 0 && string <= 4)) {
    throw new Error(`${W}: string must be an integer from 0 to 4, got ${String(string)}`);
  }
  const r = rng((Math.imul(seedInt(sd) ^ 0x68e31da4, 2654435761) + Math.round(midi * 64) * 40503 + 29) >>> 0 || 1);

  // String 4 is the drone: open only, so any note asked of it sounds g4.
  let s = string ?? -1, L, B;
  if (s === 4) {
    midi = DRONE;
    L = SCALE * 2 ** (-5 / 12);
    B = 2.1e-5 * 2 ** (10 / 12);
  } else {
    if (s < 0) { s = 0; for (let i = 0; i < OPEN.length; i++) if (OPEN[i] <= midi) s = i; }
    if (midi < OPEN[s] || midi - OPEN[s] > 22) throw new Error(`${W}: midi ${midi} is not playable on string ${s}`);
    const fret = midi - OPEN[s];
    L = SCALE * 2 ** (-fret / 12);
    B = B_OPEN[s] * 2 ** (2 * fret / 12);
  }

  const f0 = midiToHz(midi) * 2 ** ((r() - 0.5) * 1.6 / 1200);
  const beta = pp == null ? Math.min(0.45, P.from * (0.85 + 0.3 * r()) / L) : Math.min(0.5, Math.min(pp, 1 - pp));
  const [l1, l2, h1, h2] = P.t60;
  const jitter = 0.92 + 0.16 * r();
  const length = Math.round((duration + 0.25) * SR);
  const c = 2 * L * f0;
  const widthSec = P.contact * (1 + (1 - v)) * (0.85 + 0.3 * r()) / c + 0.00002;
  const excite = pluckExcitation({ f0, beta, widthSec, noise: 0.06 * v, rand: r });
  const amp = v ** 1.3;
  for (let i = 0; i < excite.length; i++) excite[i] *= amp;

  const { out } = renderTwoPolarisations({
    f0, B, nDisp: 3, t60lo: interp(f0, 147, l1, 660, l2) * jitter, t60hi: interp(f0, 147, h1, 660, h2) * jitter, fh: P.fh,
    excite, length, damp: dampCurve(length, duration, 0.07),
    angle: Math.PI * (0.2 + 0.15 * r()), detuneCents: 0.4 + 0.5 * r(), decayRatio: 0.55, weakGain: 0.5,
  });

  // Pick scraping off the string, heard through the head. The radiation chain is linear, so the
  // scrape is radiated on its own and scaled to a fixed peak: the seed changes its grain, not its level.
  const m = Math.round(0.003 * SR), bp = design('bp', 4200 + 1800 * r(), 1.0);
  const scrape = new Float64Array(Math.min(length, Math.round(0.3 * SR)));
  for (let i = 0; i < m && i < scrape.length; i++) scrape[i] = bp.step(r() * 2 - 1) * Math.sin(Math.PI * i / m) ** 2;
  const sc = radiate(scrape, preset, tens);
  let cpk = 1e-12;
  for (let i = 0; i < sc.length; i++) cpk = Math.max(cpk, Math.abs(sc[i]));
  const y = radiate(out, preset, tens);
  const cg = P.click * v * CLICK_PEAK / cpk;
  for (let i = 0; i < sc.length; i++) y[i] += cg * sc[i];
  for (let i = 0; i < y.length; i++) y[i] *= P.out;
  return edges(y, 0.0005, 0.02);
}
