import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SR = 48000;

export function buffer(seconds, channels = 1) {
  const n = Math.ceil(seconds * SR);
  return Array.from({ length: channels }, () => new Float64Array(n));
}

// Adds `src` into `dst` starting at an integer sample index (never recompute index from time per sample).
export function mixInto(dst, src, startSample, gain = 1) {
  const start = Math.round(startSample);
  for (let i = 0; i < src.length; i++) {
    const j = start + i;
    if (j >= 0 && j < dst.length) dst[j] += src[i] * gain;
  }
}

export function stats(channels) {
  let peak = 0, maxJump = 0, sumSq = 0, n = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      if (!Number.isFinite(v)) throw new Error(`non-finite sample at ${i}`);
      peak = Math.max(peak, Math.abs(v));
      if (i > 0) maxJump = Math.max(maxJump, Math.abs(v - ch[i - 1]));
      sumSq += v * v; n++;
    }
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sumSq / n)), maxJump, peak };
}

export function normalizePeak(channels, targetDb = -3) {
  const { peak } = stats(channels);
  if (peak === 0) return channels;
  const g = 10 ** (targetDb / 20) / peak;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return channels;
}

export function writeWav(path, channels) {
  const nCh = channels.length, n = channels[0].length, bps = 3;
  const data = Buffer.alloc(n * nCh * bps);
  let o = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      data.writeIntLE(Math.round(v * 8388607), o, 3);
      o += 3;
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(nCh, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * nCh * bps, 28); h.writeUInt16LE(nCh * bps, 32);
  h.writeUInt16LE(24, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([h, data]));
}

export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

// Deterministic PRNG so every render is reproducible.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
