import { SR, buffer, mixInto, stats, normalizePeak, writeWav, rng } from '../lib/audio.mjs';
import { render, trimDb } from '../instruments/metal.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const [L, R] = buffer(29.5, 2);
const r = rng(145);
const cache = new Map();

function get(voice, velocity, seed, opts = {}) {
  const key = JSON.stringify([voice, velocity, seed, opts]);
  // The mix was balanced before the per-size level trim existed; undo the trim to keep it.
  if (!cache.has(key)) {
    const y = render({ voice, velocity, seed, ...opts });
    const g = 10 ** (-trimDb(voice, opts.size ?? 1) / 20);
    for (let i = 0; i < y.length; i++) y[i] *= g;
    cache.set(key, y);
  }
  return cache.get(key);
}

// Pitch down by reading slower (cubic Hermite); only factors <= 1, so nothing folds back.
function pitch(x, factor) {
  if (factor === 1) return x;
  const n = Math.floor((x.length - 3) / factor);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * factor, k = Math.floor(p), u = p - k;
    const a = x[Math.max(0, k - 1)], b = x[k], c = x[k + 1], d = x[k + 2];
    y[i] = b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)));
  }
  return y;
}

// Hard-ish gate with raised-cosine ramps so the cut never clicks.
function gate(x, hold, ramp = 0.004) {
  const h = Math.round(hold * SR), rr = Math.round(ramp * SR);
  const n = Math.min(x.length, h + rr);
  const y = Float64Array.from(x.subarray(0, n));
  for (let i = 0; i < rr && h + i < n; i++) y[h + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / rr);
  return y;
}

function place(time, x, gain = 1, pan = 0) {
  const a = ((pan + 1) * Math.PI) / 4;
  const s = Math.round(time * SR);
  mixInto(L, x, s, gain * Math.cos(a));
  mixInto(R, x, s, gain * Math.sin(a));
}

// Part 1: every voice alone, faded out before the next one starts.
const solo = [
  ['anvil', 0.2, 2.3, {}],
  ['pipe', 2.6, 2.4, {}],
  ['sheet', 5.1, 2.9, {}],
  ['barrel', 8.1, 1.7, {}],
  ['chain', 9.9, 1.3, {}],
  ['scrape', 11.3, 1.9, { duration: 1.3 }],
];
for (const [voice, t, len, opts] of solo) place(t, gate(get(voice, 0.85, 3, opts), len - 0.25, 0.25), 1.7, 0);

// Part 2: groove at 145 BPM, eight bars.
const s16 = 60 / 145 / 4;
const g0 = 13.4;
const at = (bar, step) => g0 + (bar * 16 + step) * s16;
const human = () => (r() - 0.5) * 0.004;

for (let bar = 0; bar < 8; bar++) {
  const late = bar >= 4;
  // Anvil as a gated off-beat tick, two pitches.
  for (const st of [2, 6, 10, 14]) {
    const p = st === 6 || st === 14 ? 0.94 : 1;
    place(at(bar, st) + human(), gate(pitch(get('anvil', 0.55 + 0.25 * r(), 10 + (st % 3)), p), 0.07, 0.03), 0.6, st < 8 ? -0.35 : 0.35);
  }
  // Barrel on the backbeat, gated.
  for (const st of [4, 12]) place(at(bar, st) + human(), gate(get('barrel', 0.9, 20 + (st >> 2)), 0.2, 0.05), 0.9, 0.05);
  if (late) place(at(bar, 15), gate(get('barrel', 0.45, 24), 0.08, 0.03), 0.5, -0.1);
  // Pipe: open hits in the first half, an octave down and gated in the second.
  if (!late) {
    place(at(bar, 0), gate(get('pipe', 0.8, 30 + (bar % 2)), 0.9, 0.3), 0.7, -0.2);
    place(at(bar, 7) + human(), gate(get('pipe', 0.5, 33, { size: 0.7 }), 0.25, 0.08), 0.5, 0.4);
  } else {
    place(at(bar, 0), gate(pitch(get('pipe', 0.9, 31), 0.5), 0.35, 0.06), 0.85, -0.15);
    place(at(bar, 10), gate(pitch(get('pipe', 0.7, 32), 0.5), 0.12, 0.03), 0.7, 0.2);
  }
  // Chain: a short gated rattle in the middle of each bar, the full drop as fill.
  if (bar % 4 === 3) place(at(bar, 12), get('chain', 0.6, 40 + bar, { size: 0.8 }), 0.7, 0.3);
  else place(at(bar, 9) + human(), gate(get('chain', 0.5, 50 + bar, { size: 0.7 }), 0.09, 0.03), 0.45, -0.4);
}
// Sheet: thunder pitched down an octave on bar 1, normal on bar 5, a big one at the end.
place(at(0, 0), gate(pitch(get('sheet', 1, 60), 0.5), 3.0, 0.8), 1.1, 0);
place(at(4, 0), gate(get('sheet', 0.8, 61, { size: 0.8 }), 1.5, 0.5), 0.5, 0.2);
// Scrape risers before bar 5 and into the end.
place(at(3, 4), get('scrape', 0.9, 70, { duration: 1.2 }), 0.7, -0.3);
place(at(7, 4), get('scrape', 1, 71, { duration: 1.25 }), 0.75, 0.3);
place(at(8, 0), get('sheet', 1, 62), 1.0, 0);
place(at(8, 0), get('anvil', 1, 63), 0.8, 0);

const end = Math.min(L.length, Math.round((at(8, 0) + 2.6) * SR));
const out = [L.subarray(0, end), R.subarray(0, end)];
const fade = Math.round(0.8 * SR);
for (const ch of out) for (let i = 0; i < fade; i++) ch[end - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
normalizePeak(out, -1);
writeWav(outPath('metal.wav'), out);
console.log('metal.wav', (end / SR).toFixed(1), 's', stats(out), `${((performance.now() - t0) / 1000).toFixed(1)} s render`);
