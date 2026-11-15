import { SR, rng, midiToHz } from '../lib/audio.mjs';
import { noteSeed } from './synth/dsp.mjs';
import { biquad } from './drums/dsp.mjs';
import { pluckedString } from './harpsichord/string.mjs';
import { board, noiseBurst } from './harpsichord/board.mjs';

export const meta = {
  name: 'Harpsichord',
  range: [29, 89],
  presets: ['8ft', '4ft', 'lute', '8ft+8ft'],
};

export const RANGE = { velocity: [0.01, 1], duration: [0.02, 20] };

// Level per preset in dB, set so that the loudest note over the range, velocities and seeds peaks
// near -3 dBFS. A harpsichord has almost no dynamics, and its register is even, so one value each.
const LEVEL = { '8ft': 17.5, '4ft': 18.4, lute: 20.2, '8ft+8ft': 11.3 };
const OUT = 0.05;

function num(name, v, def, [lo, hi]) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`harpsichord: ${name} must be a finite number, got ${String(v)}`);
  return Math.min(hi, Math.max(lo, v));
}

// Scaling of one string, from the note it sounds. Brass strings in the bass, iron above; the
// plucking point moves from about a tenth of the string in the bass to a quarter in the treble,
// because the treble strings are short and the jack rows stay put.
function stringOf(m, choir) {
  const u = (m - 29) / 72;
  return {
    f0: midiToHz(m),
    B: Math.min(2e-4, 4e-6 * 2 ** ((m - 29) / 14)),
    beta: choir === 'back' ? (0.1 + 0.13 * u) * 1.18 : choir === 'four' ? 0.12 + 0.16 * u : 0.1 + 0.13 * u,
    T0: 16 * 2 ** (-(m - 29) / 24) * (choir === 'four' ? 0.8 : 1),
    dampT60: m < 44 ? 0.25 : 0.15,
  };
}

export function render({ midi = 60, velocity = 0.8, duration = 1, preset = '8ft', seed = 1 } = {}) {
  if (preset == null) preset = '8ft';
  if (!meta.presets.includes(preset)) throw new Error(`harpsichord: unknown preset ${String(preset)}`);
  midi = Math.round(num('midi', midi, 60, meta.range));
  const vel = num('velocity', velocity, 0.8, RANGE.velocity);
  const dur = num('duration', duration, 1, RANGE.duration);
  seed = num('seed', seed, 1, [-Infinity, Infinity]);
  const r = rng(noteSeed(seed, [midi], `harpsichord-${preset}`));

  const choirs = preset === '4ft' ? [['four', midi + 12]] : preset === '8ft+8ft' ? [['front', midi], ['back', midi]] : [['front', midi]];
  const start = 1;
  const keyDelay = Math.round((0.004 + 0.004 * r()) * SR);
  let natural = 0;
  for (const [choir, m] of choirs) natural = Math.max(natural, stringOf(m, choir).T0);
  if (preset === 'lute') natural = Math.min(natural, 1.5);
  const relIdx = start + keyDelay + Math.round(dur * SR);
  const tailSec = Math.min(dur + 0.35, natural * 1.1 + 0.1);
  const n = start + keyDelay + Math.round((tailSec + 0.05) * SR);
  const force = new Float64Array(n);

  choirs.forEach(([choir, m], k) => {
    const s = stringOf(m, choir);
    const cents = choir === 'back' ? 0.8 + 1.2 * r() : choir === 'four' ? 0.6 * (r() - 0.5) : 0;
    const t0 = start + (k === 0 ? 0 : keyDelay);
    pluckedString(force, {
      f0: s.f0 * 2 ** (cents / 1200), B: s.B * (0.95 + 0.1 * r()), beta: s.beta * (0.97 + 0.06 * r()),
      amp: (0.85 + 0.15 * vel) * (choir === 'four' ? 0.8 : 1),
      quillHz: 3200 + 5200 * vel,
      t60: (f) => Math.max(0.05, s.T0 / (1 + (f / 2200) ** 1.3)),
      start: t0, release: relIdx, dampT60: s.dampT60,
      buff: preset === 'lute' ? (f) => 0.3 + 0.9 / (1 + (f / 450) ** 2) : null,
      rand: r,
    });
    // The quill clicks as it slips off; the jack's tongue clicks again on the way back.
    noiseBurst(force, t0, Math.round(0.0008 * SR), 0.01, 1800, 9000, r);
    noiseBurst(force, relIdx + Math.round(0.006 * SR), Math.round(0.002 * SR), 0.004, 1200, 7000, r);
  });
  // Key bottoming out on the key bed, and the damper felt landing on the string.
  noiseBurst(force, start, Math.round(0.006 * SR), 0.03, 60, 900, r);
  noiseBurst(force, relIdx, Math.round(0.014 * SR), 0.012, 150, 2500, r);

  let y = board(force);
  y = biquad(biquad(y, 'hp', 38, 0.7), 'hp', 38, 0.7);
  const g = OUT * 10 ** (LEVEL[preset] / 20);
  for (let i = 0; i < n; i++) y[i] *= g;
  const fade = Math.round(0.03 * SR);
  for (let i = 0; i < fade; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
  y[0] = 0; y[n - 1] = 0;
  return y;
}
