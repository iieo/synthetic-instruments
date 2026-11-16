import { ORDER, CHIP_SR, polyFromFormants, toReflection, latticeTick, kTable, nearest } from './lpc.mjs';
import { inventory } from './phonemes.mjs';

export const FRAME = 200; // 25 ms at 8 kHz
export const SUBSTEPS = 8;
export const P_MIN = 12, P_MAX = 255;
const K_BITS = [5, 5, 4, 4, 4, 4, 4, 3, 3, 3];
export const E_LEVELS = 15;
export const NOISE_AMP = 0.35;

// Voiced excitation: one short descending chirp per pitch period, 40 samples, stored as 8-bit.
export const CHIRP = (() => {
  const L = 40, c = new Float64Array(L);
  let ph = 0;
  for (let n = 0; n < L; n++) {
    const f = 3000 * (110 / 3000) ** (n / (L - 1));
    c[n] = Math.sin(2 * Math.PI * ph) * Math.exp(-n / 11) * Math.min(1, (n + 1) / 2);
    ph += f / CHIP_SR;
  }
  let m = 0;
  for (const v of c) m += v / L;
  let pk = 0;
  for (let n = 0; n < L; n++) { c[n] -= m; pk = Math.max(pk, Math.abs(c[n])); }
  for (let n = 0; n < L; n++) c[n] = Math.round(127 * c[n] / pk) / 127;
  return c;
})();

// Coefficient ranges fitted to the phoneme inventory, with a margin in the arcsin domain.
const K_RANGE = (() => {
  const lo = new Float64Array(ORDER).fill(1), hi = new Float64Array(ORDER).fill(-1);
  for (const s of inventory()) {
    const k = toReflection(polyFromFormants(s.F, s.B));
    for (let i = 0; i < ORDER; i++) { lo[i] = Math.min(lo[i], k[i]); hi[i] = Math.max(hi[i], k[i]); }
  }
  return Array.from({ length: ORDER }, (_, i) => {
    const a = Math.asin(lo[i]), b = Math.asin(hi[i]), m = 0.08 * (b - a) + 0.01;
    return [Math.max(-0.998, Math.sin(a - m)), Math.min(0.998, Math.sin(b + m))];
  });
})();

const quantCache = new Map();
// Tables for a roughness 0..1: fewer coefficient, energy and pitch levels and a coarser DAC.
export function quantizer(rough) {
  const key = Math.round(rough * 1000);
  if (quantCache.has(key)) return quantCache.get(key);
  const shrink = 2 ** (-1.5 * rough);
  const kTabs = K_BITS.map((b, i) => kTable(K_RANGE[i][0], K_RANGE[i][1], Math.max(3, Math.round(2 ** b * shrink))));
  // Energy steps of 3 dB at the top that widen towards the bottom, 71 dB in 15 levels.
  const eTab = [0], eStride = 1 + Math.round(rough);
  for (let j = E_LEVELS - 1; j >= 0; j--) if (j % eStride === 0) eTab.push(10 ** (-(3 * j + 0.15 * j * j) / 20));
  const pTab = [];
  for (let p = P_MIN; p <= P_MAX; p = Math.max(p + 1, Math.round(p * (1 + 0.05 * rough)))) pTab.push(p);
  const dacLevels = Math.round(2 ** (7 - 3 * rough));
  const q = { kTabs, eTab, pTab, dacLevels };
  if (quantCache.size > 64) quantCache.clear();
  quantCache.set(key, q);
  return q;
}

export function quantPeriod(q, P) {
  const t = q.pTab;
  let best = t[0];
  for (const v of t) if (Math.abs(Math.log(v / P)) < Math.abs(Math.log(best / P))) best = v;
  return best;
}

export function powerGain(k, voiced, P) {
  const g = new Float64Array(ORDER + 1);
  let e = 0;
  const L = voiced ? Math.min(CHIRP.length, P) : 1;
  for (let n = 0; n < 640; n++) {
    const x = voiced ? (n < L ? CHIRP[n] : 0) : (n === 0 ? 1 : 0);
    const y = latticeTick(x, k, g);
    e += y * y;
  }
  return voiced ? e / P : e * NOISE_AMP * NOISE_AMP;
}

const frameCache = new Map();
const kqCache = new Map();
// Nearest table entries first; where that lifts the filter's gain far above the unquantised one
// (a pole pushed against the unit circle), the encoder tries the other neighbour of each
// coefficient and keeps whatever brings the gain back closer.
function quantK(q, rough, kRaw) {
  const key = `${rough}|${kRaw.join()}`;
  const hit = kqCache.get(key);
  if (hit) return hit;
  const k = new Float64Array(ORDER), alt = new Float64Array(ORDER);
  for (let i = 0; i < ORDER; i++) {
    const t = q.kTabs[i], j = nearest(t, kRaw[i]);
    k[i] = t[j];
    alt[i] = kRaw[i] > t[j] ? t[Math.min(t.length - 1, j + 1)] : t[Math.max(0, j - 1)];
  }
  const ref = Math.log(powerGain(kRaw, false, 1));
  let err = Math.abs(Math.log(powerGain(k, false, 1)) - ref);
  for (let pass = 0; pass < 2 && err > Math.log(4); pass++) {
    for (let i = ORDER - 1; i >= 0; i--) {
      const keep = k[i];
      k[i] = alt[i];
      const e = Math.abs(Math.log(powerGain(k, false, 1)) - ref);
      if (e < err) { err = e; alt[i] = keep; } else k[i] = keep;
    }
  }
  if (kqCache.size > 2048) kqCache.clear();
  kqCache.set(key, k);
  return k;
}

const kCache = new Map();
function reflection(spec) {
  const key = spec.F.map((f) => f.toFixed(1)).join() + '|' + spec.B.map((b) => b.toFixed(1)).join();
  let k = kCache.get(key);
  if (!k) {
    k = toReflection(polyFromFormants(spec.F, spec.B));
    if (kCache.size > 2048) kCache.clear();
    kCache.set(key, k);
  }
  return k;
}

/**
 * The encoder: turns a frame description into the chip's quantised parameters. The energy index is
 * chosen so the frame reaches `rms` at the output with the already quantised coefficients, as an
 * analysis encoder would do from a recording.
 */
export function encode(q, rough, frame, P, rms) {
  if (!frame.spec || !(rms > 0)) return { voiced: frame.voiced, k: null, E: 0, P };
  const kRaw = reflection(frame.spec);
  const key = `${rough}|${frame.voiced ? 1 : 0}|${kRaw.join()}|${P}|${rms.toPrecision(6)}`;
  const hit = frameCache.get(key);
  if (hit) return hit;
  const k = quantK(q, rough, kRaw);
  const want = rms / Math.sqrt(powerGain(k, frame.voiced, P));
  // Cautious rounding: the largest energy that overshoots the target by at most 1 dB, so the
  // lattice does not run into the DAC rails.
  let best = 1;
  for (let i = 1; i < q.eTab.length; i++) if (q.eTab[i] <= want * 1.122) best = i;
  const out = { voiced: frame.voiced, k, E: q.eTab[best], P };
  if (frameCache.size > 4096) frameCache.clear();
  frameCache.set(key, out);
  return out;
}

// Samples where the lattice output reached the DAC rails (the chip clamps them), for measurement.
export const CLIPS = { count: 0 };

/**
 * Runs the chip over encoded frames. Parameters move to each new frame in SUBSTEPS linear steps;
 * a change between voiced and unvoiced switches coefficients and pitch at once. Returns the DAC
 * output at the chip rate.
 */
export function runChip(frames, { q, outScale, lfsr = 1, phase = 0, tailFrames = 4 }) {
  const n = (frames.length + tailFrames) * FRAME;
  const y = new Float64Array(n), g = new Float64Array(ORDER + 1);
  const sub = FRAME / SUBSTEPS, dac = q.dacLevels;
  let prev = { voiced: frames[0]?.voiced ?? true, k: frames.find((f) => f.k)?.k ?? new Float64Array(ORDER), E: 0, P: frames[0]?.P ?? 100 };
  let pc = phase, reg = lfsr & 0x7fff || 1;
  const k = new Float64Array(ORDER);
  let idx = 0;
  for (let f = 0; f < frames.length + tailFrames; f++) {
    const raw = frames[f] ?? { voiced: prev.voiced, k: null, E: 0, P: prev.P };
    const cur = { voiced: raw.voiced, k: raw.k ?? prev.k, E: raw.E, P: raw.P };
    const jump = cur.voiced !== prev.voiced;
    for (let s = 0; s < SUBSTEPS; s++) {
      const w = (s + 1) / SUBSTEPS;
      for (let i = 0; i < ORDER; i++) k[i] = jump ? cur.k[i] : prev.k[i] + (cur.k[i] - prev.k[i]) * w;
      const E = prev.E + (cur.E - prev.E) * w;
      const P = Math.round(jump ? cur.P : prev.P + (cur.P - prev.P) * w);
      for (let j = 0; j < sub; j++) {
        let x;
        if (cur.voiced) {
          x = pc < CHIRP.length ? CHIRP[pc] : 0;
          if (++pc >= P) pc = 0;
        } else {
          const bit = (reg ^ (reg >> 1)) & 1;
          reg = (reg >> 1) | (bit << 14);
          x = reg & 1 ? NOISE_AMP : -NOISE_AMP;
        }
        const v = latticeTick(x * E, k, g) * outScale;
        if (v > 1 || v < -1) CLIPS.count++;
        y[idx++] = Math.max(-1, Math.min(1, Math.round(v * dac) / dac));
      }
    }
    prev = cur;
  }
  return y;
}
