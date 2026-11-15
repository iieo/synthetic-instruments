import { SR, rng } from '../lib/audio.mjs';
import { stringParams, decayRate } from './harp/strings.mjs';
import { designString, runString } from './harp/waveguide.mjs';
import { fingerPluck, fingerRelease, contactNoise } from './harp/excitation.mjs';
import { soundbox } from './harp/body.mjs';

export const meta = { name: 'Harp', range: [24, 103] };

// Real part of the soundboard admittance seen by each polarisation (m / (N s)). Motion across the
// string plane (the direction the finger pulls) barely moves the board and rings long; motion in
// the string plane pushes the board and gives the loud, faster first decay.
const Y_STRONG = 5e-3;
const Y_WEAK = 0.5e-3;
const RADIATE_WEAK = 0.3;

// Output scale: the loudest string over the whole pluckPosition range at velocity 1 peaks near -3 dBFS.
const OUT_GAIN = 0.4;

const SYMPATHETIC = [-12, 12, 7, 19];
const SYMPATHETIC_COUPLING = 0.01;

const cache = new Map();

function designs(midi) {
  if (cache.has(midi)) return cache.get(midi);
  const s = stringParams(midi);
  const strong = designString({ f0: s.f0, B: s.B, sigma: (f) => decayRate(s, f, () => Y_STRONG) });
  // The two polarisations see a slightly different termination, so their partials drift apart.
  const weak = designString({ f0: s.f0 * 2 ** (0.6 / 1200), B: s.B * 1.2, sigma: (f) => decayRate(s, f, () => Y_WEAK) });
  const out = { s, strong, weak };
  cache.set(midi, out);
  return out;
}

function sympatheticDesign(midi) {
  const key = `s${midi}`;
  if (cache.has(key)) return cache.get(key);
  const s = stringParams(midi);
  const d = designString({ f0: s.f0, B: 0, sigma: (f) => decayRate(s, f, () => Y_STRONG) });
  cache.set(key, d);
  return d;
}

// Hand on the string: the per-period loop gain drops to reach a short T60 and the soft
// fingertip removes the highs first (larger loss pole).
function damper(d, f0, start, ramp, t60) {
  const gEnd = Math.exp(-6.91 / (t60 * f0));
  const aEnd = Math.max(d.a, 0.55);
  const r = Math.max(1, Math.round(ramp * SR));
  let last = -1;
  return (i) => {
    if (i < start) return null;
    const k = Math.min(1, (i - start) / r);
    if (k === last) return null;
    last = k;
    const w = 0.5 - 0.5 * Math.cos(Math.PI * k);
    return { g: d.g + (gEnd - d.g) * w, a: d.a + (aEnd - d.a) * w };
  };
}

function finite(key, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`harp: ${key} must be a finite number, got ${v}`);
  return v;
}

export function render({ midi = 60, velocity = 0.8, duration = 4, seed = 1, pluckPosition, muted = false, sympathetic = true } = {}) {
  for (const [k, v] of Object.entries({ midi, velocity, duration, seed })) finite(k, v);
  if (pluckPosition !== undefined) finite('pluckPosition', pluckPosition);
  midi = Math.round(Math.min(meta.range[1], Math.max(meta.range[0], midi)));
  duration = Math.max(0, duration);
  const v = Math.min(1, Math.max(0.05, velocity));
  const r = rng(seed * 7919 + midi * 104729 + 13);
  const { s, strong, weak } = designs(midi);

  const beta = Math.min(0.9, Math.max(0.1, pluckPosition ?? 0.47 + 0.05 * (r() - 0.5)));
  // The fingertip contact is about 8 mm wide; on short treble strings it covers a large share.
  const width = Math.min(0.3, 0.008 / s.L);
  const period = SR / s.f0;
  const pulse = fingerPluck({ period, beta, width });
  // Short, stiff treble strings leave the finger faster than the long bass strings.
  const brightness = Math.min(7000, (300 + 1700 * v * v) * (1 + s.f0 / 500));
  const exc = fingerRelease(pulse, brightness, period);

  const damp = muted ? Math.min(duration, 0.07 + 0.03 * r()) : duration;
  const dampT60 = muted ? 0.05 : Math.max(0.12, Math.min(0.35, 30 / s.f0));
  const tail = dampT60 * 1.6 + 0.12;
  const n = Math.ceil((damp + tail) * SR);
  const startDamp = Math.round(damp * SR);

  const angle = (18 + 14 * r()) * (Math.PI / 180);
  // A given finger force gives the same bridge force on every string: the displacement under the
  // finger is F beta (1 - beta) L / T, so plucks near either end move the string less.
  const amp = OUT_GAIN * v * (1 + 0.004 * (midi - 60)) * 4 * beta * (1 - beta);
  const inStrong = exc.map((x) => x * amp * Math.sin(angle));
  const inWeak = exc.map((x) => x * amp * Math.cos(angle));

  const yStrong = runString(strong, inStrong, n, damper(strong, s.f0, startDamp, 0.02, dampT60));
  const yWeak = runString(weak, inWeak, n, damper(weak, s.f0, startDamp, 0.02, dampT60));
  const force = new Float64Array(n);
  for (let i = 0; i < n; i++) force[i] = yStrong[i] + RADIATE_WEAK * yWeak[i];

  // Undamped neighbours at the octaves and fifths pick up energy through the board.
  if (sympathetic && !muted) {
    const drive = force.map((x) => x * SYMPATHETIC_COUPLING);
    for (const step of SYMPATHETIC) {
      const m = midi + step;
      if (m < meta.range[0] || m > meta.range[1]) continue;
      const ys = runString(sympatheticDesign(m), drive, n, null);
      for (let i = 0; i < n; i++) force[i] += ys[i] * SYMPATHETIC_COUPLING;
    }
  }

  const skin = contactNoise(r, { seconds: 0.004, lowHz: 1800, highHz: 7000, gain: 0.05 * amp * v });
  for (let i = 0; i < skin.length && i < n; i++) force[i] += skin[i];
  if (muted) {
    const palm = contactNoise(r, { seconds: 0.025, lowHz: 60, highHz: 900, gain: 0.5 * amp });
    for (let i = 0; i < palm.length && startDamp + i < n; i++) force[startDamp + i] += palm[i];
  }

  const out = soundbox(force);
  // The bridge force carries a slowly decaying offset that the modal path passes; block it below 10 Hz.
  const R = Math.exp((-2 * Math.PI * 10) / SR);
  for (let i = 0, x1 = 0, y1 = 0; i < n; i++) { const yv = out[i] - x1 + R * y1; x1 = out[i]; y1 = yv; out[i] = yv; }
  const fade = Math.round(0.03 * SR);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
  out[0] = 0;
  return out;
}
