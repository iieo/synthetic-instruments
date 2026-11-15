import { midiToHz, rng } from '../lib/audio.mjs';
import { flue, reed, pipeHash } from './organ/pipes.mjs';

// Each stop is a set of ranks. `shift` is the pitch offset of the rank in semitones relative to
// 8' pitch (16' = -12, 4' = +12, 2 2/3' = +19, 2' = +24, 1 1/3' = +31, 1' = +36).
const PRINCIPAL = { Q: 32, lpCut: 9000, y0: 0.75, b: 0.5, drive: 3, tilt: 0.9, direct: 0.02, octave: 1.0, chiff: 0.35, noise: 0.015 };
const GEDACKT = { Q: 40, lpCut: 4000, y0: 0.2, b: 0.6, drive: 2, tilt: 0.5, direct: 0.03, octave: 0.3, chiff: 0.9, noise: 0.025 };
const STOPS = {
  principal8: { kind: 'flue', ranks: [0], voice: PRINCIPAL, gain: 1.2 },
  gedackt8: { kind: 'flue', stopped: true, ranks: [0], voice: GEDACKT, gain: 0.186, slope: 1.2 },
  octave4: { kind: 'flue', ranks: [12], voice: { ...PRINCIPAL, lpCut: 10000 }, gain: 0.92 },
  superoctave2: { kind: 'flue', ranks: [24], voice: { ...PRINCIPAL, lpCut: 11000, chiff: 0.15 }, gain: 0.8 },
  // Mixture IV 1 1/3': four high principal ranks that break back an octave whenever a rank would
  // exceed the top of the pipe scale, so the stop adds brilliance without whistling in the treble.
  mixture: { kind: 'flue', ranks: [19, 24, 31, 36], breakAt: 91, voice: { ...PRINCIPAL, lpCut: 12000, chiff: 0.12, octave: 0.3 }, gain: 0.62 },
  trumpet8: { kind: 'reed', ranks: [0], voice: { Q: 10, beat: 3, roll: 0.03, formant: 1200, bell: 2.5, outLp: 5000 }, gain: 0.056 },
  subbass16: { kind: 'flue', stopped: true, ranks: [-12], voice: { ...GEDACKT, lpCut: 2000, Q: 30 }, gain: 0.21, slope: 1 },
  trombone16: { kind: 'reed', ranks: [-12], voice: { Q: 10, beat: 3, roll: 0.04, formant: 900, bell: 2, outLp: 4000 }, gain: 0.043 },
};

export const meta = { name: 'Pipe Organ', range: [36, 96], stops: Object.keys(STOPS) };

// Fixed output scale: full organ (all stops) at velocity 1 peaks near -3 dBFS on any key.
const OUT_GAIN = 0.59;

const STOP_IDS = Object.fromEntries(Object.keys(STOPS).map((k, i) => [k, i + 1]));

/**
 * One key held on the given stops. `duration` is the time the key is held; the buffer also holds
 * the dying resonance after the pallet closes. Pipe organs are not touch sensitive, so `velocity`
 * only scales the output level (like a swell box). midi defaults to 60 and is clamped to meta.range.
 */
export function render({ midi = 60, velocity = 0.8, duration = 1, seed = 1, stops = ['principal8'] }) {
  for (const [k, x] of Object.entries({ midi, velocity, duration, seed })) {
    if (!Number.isFinite(x)) throw new Error(`organ: ${k} must be a finite number, got ${x}`);
  }
  midi = Math.max(meta.range[0], Math.min(meta.range[1], Math.round(midi)));
  duration = Math.max(0.02, duration);
  // A stop drawn twice is still one rank of pipes.
  const drawn = [...new Set(typeof stops === 'string' ? [stops] : stops)];
  if (drawn.length === 0) throw new Error('organ: no stops drawn, pass at least one of ' + meta.stops.join(', '));
  const voices = [];
  for (const name of drawn) {
    const stop = STOPS[name];
    if (!stop) throw new Error(`organ: unknown stop ${name}, known stops: ${meta.stops.join(', ')}`);
    stop.ranks.forEach((shift, rankIdx) => {
      let pitch = midi + shift;
      if (stop.breakAt) while (pitch > stop.breakAt && pitch - 12 >= midi + 12) pitch -= 12;
      // Every pipe is a separate object with its own small tuning error (about +-2 cents) and voicing.
      const h = (k) => pipeHash(STOP_IDS[name], rankIdx, pitch, k);
      const cents = (h(1) - 0.5) * 4;
      const f = midiToHz(pitch) * 2 ** (cents / 1200);
      const rand = rng((seed * 2654435761 + STOP_IDS[name] * 97 + rankIdx * 13 + pitch) >>> 0);
      const v = { ...stop.voice, f, dur: duration, rand, gain: stop.gain * (0.94 + 0.12 * h(2)) * scaleGain(pitch, stop.slope || 0) };
      if (v.drive) { v.drive *= 0.95 + 0.1 * h(3); v.y0 *= 0.8 + 0.4 * h(4); }
      voices.push(stop.kind === 'reed' ? reed(v) : flue({ ...v, stopped: !!stop.stopped }));
    });
  }
  const n = Math.max(...voices.map((x) => x.length));
  const out = new Float64Array(n);
  for (const x of voices) for (let i = 0; i < x.length; i++) out[i] += x[i] * velocity * OUT_GAIN;
  return out;
}

// Voicing curve over the compass: small treble pipes are voiced slightly softer than the bass,
// about 1.2 dB per octave. `slope` (dB per octave) lets a stop deviate from that.
function scaleGain(pitch, slope) {
  return 10 ** (((slope - 1.2) * (pitch - 60)) / 12 / 20);
}
