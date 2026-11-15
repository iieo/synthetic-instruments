import { SR } from '../../lib/audio.mjs';
import { makeBody } from '../strings-bowed/body.mjs';

// Soundboard and case. The board of a harpsichord is thin (about 3 mm) and lightly barred, so it
// stays lively high up: a few strong low modes (the air in the case near 100 Hz, the first board
// modes between 150 and 600 Hz), then a dense field of overlapping modes whose envelope rises
// toward 2 to 4 kHz. That treble region is what makes the instrument sound bright.
export const board = makeBody({
  modes: [
    { f: 98, q: 14, g: 0.7 },
    { f: 162, q: 18, g: 0.8 },
    { f: 231, q: 20, g: 0.9 },
    { f: 318, q: 22, g: 0.7 },
    { f: 405, q: 24, g: 0.75 },
    { f: 517, q: 24, g: 0.6 },
    { f: 640, q: 26, g: 0.55 },
  ],
  dense: {
    from: 700, to: 14000, count: 46, q: 18,
    envelope: (f) => 0.35 + 0.9 * Math.exp(-0.5 * (Math.log2(f / 3000) / 0.9) ** 2),
  },
  direct: 0.25,
  lowpassHz: 15000, lowpassOrder: 1,
  seed: 1709,
});

// Short noise burst with raised-cosine envelope, band-limited by two one-pole sections.
export function noiseBurst(out, start, len, amp, loHz, hiHz, rand) {
  const aHi = Math.exp((-2 * Math.PI * hiHz) / SR), aLo = Math.exp((-2 * Math.PI * loHz) / SR);
  let lp = 0, lp2 = 0;
  for (let j = 0; j < len && start + j < out.length; j++) {
    const env = Math.sin((Math.PI * j) / len) ** 2 * Math.exp((-4 * j) / len);
    lp = (1 - aHi) * (2 * rand() - 1) + aHi * lp;
    lp2 = (1 - aLo) * lp + aLo * lp2;
    out[start + j] += amp * env * (lp - lp2);
  }
}
