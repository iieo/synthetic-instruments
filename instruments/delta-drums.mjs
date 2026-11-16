import { SR, rng } from '../lib/audio.mjs';
import { noteSeed, seedInt } from './synth/dsp.mjs';
import { RC, num, cached } from './delta-drums/bl.mjs';
import { RATES, PERIODS, MAX_BITS, encode, play } from './delta-drums/chip.mjs';
import { source, VOICE_NAMES } from './delta-drums/sounds.mjs';

export const meta = {
  name: 'Delta Drums',
  voices: VOICE_NAMES,
  rate: Array.from({ length: 16 }, (_, i) => i),
};

// Fixed gains in dB. Low rates lose level to the slew limit; MAKEUP lifts them by the median loss
// across voices. Per voice, the loudest hit over all rates, tunings, velocities and 200 seeds then
// peaks near -2 dBFS.
const MAKEUP = [9.5, 8.6, 7.9, 6.7, 5.9, 4.8, 5.2, 4.6, 3.6, 2.7, 2.3, 1.4, 1, 1, 0.3, 0];
const GAIN = {
  kick: -2.1, snare: 3.7, 'tom-high': -0.3, 'tom-low': -1.8, clap: 7, cowbell: 7, crash: 8.5, shout: 2.9, slap: 0.3,
};
// Full-velocity source amplitude in counter steps around the rest level 64.
const AMP = 60;
const streams = new Map();

// Index of the table rate nearest (in log frequency) to rate i shifted by `semis`.
export function tunedIndex(i, semis) {
  const want = Math.log2(RATES[i]) + semis / 12;
  let best = 0;
  for (let j = 1; j < 16; j++) if (Math.abs(Math.log2(RATES[j]) - want) < Math.abs(Math.log2(RATES[best]) - want)) best = j;
  return best;
}

/**
 * One hit on the delta sample channel. The voice is synthesized at the playback rate given by
 * `rate` (0 to 15, low is crunchy), encoded to a 1-bit delta stream and played back at the table
 * rate nearest to `tune` semitones away, which shifts pitch and speed together.
 */
export function render({ voice = 'kick', velocity = 0.8, seed = 1, rate = 15, tune = 0 } = {}) {
  if (voice == null) voice = 'kick';
  if (typeof voice !== 'string' || !VOICE_NAMES.includes(voice)) throw new Error(`delta-drums: unknown voice ${voice}, use one of ${VOICE_NAMES.join(', ')}`);
  const vel = num('delta-drums', 'velocity', velocity, 0.8, 0, 1);
  const ri = Math.round(num('delta-drums', 'rate', rate, 15, 0, 15));
  const tn = num('delta-drums', 'tune', tune, 0, -12, 12);
  num('delta-drums', 'seed', seed, 1, -Infinity, Infinity);
  const s = seedInt(seed);

  const bits = cached(streams, 48, `${voice}|${ri}|${s}|${vel}`, () => {
    const fs = RATES[ri];
    const src = source(voice, fs, rng(noteSeed(s, [ri], `delta-${voice}`)), MAX_BITS / fs);
    let end = src.length;
    while (end > 0 && Math.abs(src[end - 1]) * AMP * vel < 1) end--;
    const a = AMP * vel, x = new Float64Array(Math.min(end + 8, MAX_BITS));
    for (let i = 0; i < x.length; i++) x[i] = (i < src.length ? src[i] : 0) * a;
    return encode(x);
  });

  const pj = tunedIndex(ri, tn);
  const y = play(bits, PERIODS[pj], Math.round(0.04 * SR));
  // Output stage: two coupling high-passes (37 Hz, 90 Hz) and an RC low-pass at 14 kHz.
  const h1 = new RC(37), h2 = new RC(90), l = new RC(14000), g = 10 ** ((GAIN[voice] + MAKEUP[ri]) / 20) / 50;
  for (let i = 0; i < y.length; i++) y[i] = l.lp(h2.hp(h1.hp(y[i]))) * g;
  const f = Math.round(0.003 * SR), n = y.length;
  for (let i = 0; i < f; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / f);
  y[0] = 0;
  return y;
}
