import { SR } from '../../lib/audio.mjs';
import { StepSum, HALF } from './bl.mjs';

// CPU clock of the console (about 1.79 MHz). The delta channel's timer counts in pairs of CPU
// cycles, so every playback period is an even number of clocks.
export const CLK = 1789773;
// Sixteen rates on a pentatonic ladder (semitones above 4186 Hz), three octaves wide.
export const LADDER = [0, 2, 5, 7, 10, 12, 14, 17, 19, 22, 24, 26, 29, 31, 34, 36];
const BASE = 4186.01;
export const PERIODS = LADDER.map((s) => 2 * Math.round(CLK / (2 * BASE * 2 ** (s / 12))));
export const RATES = PERIODS.map((p) => CLK / p);
// Longest sample the length register can describe: 16 * 255 + 1 bytes.
export const MAX_BITS = (16 * 255 + 1) * 8;
export const REST = 64;

// Resistive DAC into a shared load: the step size shrinks as the counter grows.
const K = 230;
export const dac = (c) => c / (1 + c / K);

// 1-bit delta encoding as the console's sample tools do it: per bit, step towards the target.
// `src` is in counter units around the rest level. The stream is padded to a legal length.
export function encode(src) {
  const bytes = Math.min(16 * 255 + 1, 16 * Math.ceil((Math.ceil(src.length / 8) - 1) / 16) + 1);
  const n = bytes * 8, bits = new Uint8Array(n);
  let c = REST, alt = 0;
  for (let i = 0; i < n; i++) {
    const tgt = REST + (i < src.length ? src[i] : 0);
    let b;
    if (tgt > c + 1e-9) b = 1;
    else if (tgt < c - 1e-9) b = 0;
    else b = alt ^= 1;
    bits[i] = b;
    if (b) { if (c <= 125) c += 2; } else if (c >= 2) c -= 2;
  }
  return bits;
}

// Plays a bit stream at period P (CPU clocks per bit). Returns the band-limited DAC output
// relative to the rest level, with `tail` extra samples after the stream ends.
export function play(bits, P, tail) {
  const dt = P * SR / CLK, pad = HALF + 2;
  const n = pad + Math.ceil(bits.length * dt) + HALF + tail;
  const out = new StepSum(n);
  let c = REST, lv = dac(REST);
  for (let i = 0; i < bits.length; i++) {
    const c2 = bits[i] ? (c <= 125 ? c + 2 : c) : (c >= 2 ? c - 2 : c);
    if (c2 !== c) { const l2 = dac(c2); out.add(pad + (i + 1) * dt, l2 - lv); lv = l2; c = c2; }
  }
  return out.done();
}
