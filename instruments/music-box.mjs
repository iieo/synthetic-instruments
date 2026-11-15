import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { addMode, resonate, contactNoise, fadeTail, clamp } from './mallets/core.mjs';
import { noteSeed } from './synth/dsp.mjs';
import { cantileverBetas, tipMass, toothCents } from './music-box/comb.mjs';

export const meta = { name: 'Music Box', range: [53, 100] };

// Time from the start of the buffer to the moment the pin lets go of the tooth. The damper wire
// touches the tooth in the milliseconds before that.
export const PLUCK_AT = 0.012;

// Fixed output scale: the loudest tooth at velocity 1 over all options peaks near -3 dBFS.
const OUT_GAIN = 0.76;
// The tune sums many teeth; its fixed gain keeps the loudest of many seeds near -3 dBFS.
const TUNE_GAIN = 0.53;

// The comb is screwed to a heavy base inside a small thin-walled wooden box. Its lowest modes lie
// around 400 Hz, so the bass teeth are heard mostly through their overtones and the box.
const BOX = [
  { f: 430, q: 8, g: 0.55 }, { f: 770, q: 12, g: 0.7 }, { f: 1190, q: 14, g: 0.6 }, { f: 1760, q: 16, g: 0.45 },
  { f: 2620, q: 18, g: 0.35 }, { f: 3900, q: 20, g: 0.22 }, { f: 5600, q: 22, g: 0.12 },
];

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`music-box: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

// T60 of the fundamental: long in the bass, about a second at the top.
const t60 = (f) => clamp(6 * (f / 175) ** -0.7, 0.8, 7);

/**
 * One tooth plucked by one pin. A music box has no keys, so there is no note length: the tooth
 * rings until it dies away or, if `ring` (seconds after the pluck) is given, until the damper or
 * the next pin stops it. `velocity` is the lift of the pin. `damper` (0..1) is how much the tooth
 * still vibrates from an earlier pluck when the damper wire touches it; that gives the short buzz
 * just before the pluck. Only teeth below about A5 have a damper.
 */
export function render({ midi = 72, velocity = 0.8, seed = 1, ring, damper = 0.15 } = {}) {
  midi = Math.round(num('midi', midi, 72, ...meta.range));
  const vel = num('velocity', velocity, 0.8, 0.02, 1);
  num('seed', seed, 1, -Infinity, Infinity);
  const dmp = num('damper', damper, 0.15, 0, 1);
  const ringT = ring == null ? null : num('ring', ring, 1, 0.02, 20);
  const rand = rng(noteSeed(seed, [midi], 'music-box'));
  const jit = (a) => 1 + a * (2 * rand() - 1);

  const f1 = midiToHz(midi) * 2 ** (toothCents(midi) / 1200);
  const betas = cantileverBetas(tipMass(midi));
  const tau1 = t60(f1) / 6.91 * jit(0.08);
  // The pin slides off the tip in a fraction of a millisecond; a deeper lift snaps off faster.
  const T = (0.55 - 0.3 * vel) * 1e-3 * (523 / f1) ** 0.15 * jit(0.1);
  const L = Math.max(3, Math.round(T * SR));
  const pulse = new Float64Array(L);
  let ps = 0;
  for (let i = 0; i < L; i++) { pulse[i] = Math.sin(Math.PI * (i + 0.5) / L) ** 2; ps += pulse[i]; }
  for (let i = 0; i < L; i++) pulse[i] /= ps;

  const at = Math.round(PLUCK_AT * SR);
  const ringN = ringT == null ? Infinity : at + Math.round(ringT * SR);
  const natural = Math.max(tau1 * 7, 0.3);
  const len = at + Math.round((ringT == null ? natural : Math.min(natural, ringT + 0.15)) * SR) + Math.round(0.05 * SR);
  const tooth = new Float64Array(len);
  const input = new Float64Array(at + L);
  input.set(pulse, at);
  // Bass teeth are wider and get longer pins, so they swing further.
  const lift = (0.25 + 0.75 * vel) * clamp((523 / f1) ** 0.3, 0.8, 1.6);
  // Mode amplitudes as root bending moment: a tip deflection puts 1/beta^4 into each mode, the
  // moment at the clamp weighs it by beta^2, so the overtones enter with (beta1/beta_n)^2; all overtones get an extra tonal factor 1.6.
  betas.forEach((b, n) => {
    const f = f1 * (b / betas[0]) ** 2 * (n ? jit(0.004) : 1);
    if (f > 0.42 * SR) return;
    const tau = Math.min(tau1, 900 / (Math.PI * f));
    const amp = lift * (n % 2 ? -1 : 1) * (betas[0] / b) ** 2 * (n ? 1.6 : 1);
    addMode(tooth, input, { f, tau, amp, tauDamped: 0.015, dampAt: ringN });
  });
  // Twisting of the tooth when the pin catches it off centre: a weak torsional mode.
  const ft = f1 * 4.1 * jit(0.03);
  if (ft < 0.4 * SR) addMode(tooth, input, { f: ft, tau: 300 / (Math.PI * ft), amp: 0.03 * lift * jit(0.3), tauDamped: 0.01, dampAt: ringN });

  // Damper buzz: a thin wire spring rattles against a tooth that is still moving, until the tooth
  // is quiet. Rendered before the pluck.
  const pre = new Float64Array(len);
  const buzz = midi < 81 ? dmp : 0;
  if (buzz > 0) {
    const noise = new Float64Array(at);
    for (let i = 0; i < at; i++) noise[i] = 2 * rand() - 1;
    const bp = resonate(noise, 3300 * jit(0.1), 2.5, 1);
    for (let i = 0; i < at; i++) {
      const w = Math.sin(Math.PI * i / at) ** 2;
      const decay = Math.exp(-i / (0.004 * SR));
      const tone = Math.sin(2 * Math.PI * f1 * i / SR);
      pre[i] = 0.5 * buzz * w * (0.35 * decay * tone + 0.6 * bp[i] * Math.abs(tone) ** 3);
    }
  }
  // The tick of the pin leaving the tooth tip.
  const tick = contactNoise(len - at, T, 0.05 * lift, rand);

  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = 0.2 * tooth[i] + pre[i] + (i >= at ? tick[i - at] : 0);
  for (const b of BOX) {
    const body = resonate(tooth, b.f, b.q, b.g * 1.4);
    for (let i = 0; i < len; i++) out[i] += body[i];
  }
  let x1 = 0, y1 = 0;
  const a = Math.exp(-2 * Math.PI * 120 / SR);
  for (let i = 0; i < len; i++) { const y = a * (y1 + out[i] - x1); x1 = out[i]; y1 = y; out[i] = y * OUT_GAIN; }
  out[0] = 0;
  return fadeTail(out, 0.05);
}

// An original waltz in C major, 16 bars of 3/4: [beat, midi]. Beats count from 0.
const MELODY = [
  [0, 76], [1, 79], [2, 84], [3, 83], [5, 81], [6, 79], [7, 81], [7.5, 83], [8, 84], [9, 86],
  [12, 88], [13, 86], [14, 84], [15, 81], [17, 77], [18, 79], [19, 76], [20, 74], [21, 72],
  [24, 79], [25, 84], [26, 88], [27, 86], [29, 83], [30, 84], [31, 81], [32, 77], [33, 79],
  [36, 81], [37, 83], [37.5, 84], [38, 86], [39, 88], [40, 91], [41, 88], [42, 86], [43, 84], [44, 83], [45, 84],
];
// Harmony per bar: bass on beat 1, a dyad on beats 2 and 3.
const HARMONY = [
  [60, [64, 67]], [55, [65, 71]], [57, [64, 69]], [55, [62, 67]], [60, [64, 67]], [53, [65, 69]], [55, [65, 71]], [60, [64, 67]],
  [60, [64, 67]], [55, [62, 67]], [53, [65, 69]], [55, [65, 71]], [53, [65, 69]], [60, [64, 67]], [55, [65, 71]], [60, [64, 72]],
];

/**
 * Plays the waltz on the comb as a cylinder would: pins sit with small position errors, the
 * spring governor lets the speed wobble a little, and with `windDown` the spring runs down so the
 * last bars slow. Returns mono at 48 kHz.
 */
export function renderTune({ seed = 1, tempo = 92, windDown = 0.6, jitter = 1, transpose = 0, velocity = 0.8 } = {}) {
  tempo = num('tempo', tempo, 92, 30, 200);
  const wd = num('windDown', windDown, 0.6, 0, 1);
  const jt = num('jitter', jitter, 1, 0, 3);
  const tr = Math.round(num('transpose', transpose, 0, -12, 12));
  const vel = num('velocity', velocity, 0.8, 0.02, 1);
  const rand = rng(noteSeed(seed, [tempo], 'music-box-tune'));
  const gauss = () => (rand() + rand() + rand() - 1.5) * 2;
  const events = [];
  MELODY.forEach(([b, m]) => events.push({ b, m, v: vel }));
  HARMONY.forEach(([bass, dyad], bar) => {
    events.push({ b: bar * 3, m: bass, v: vel * 0.8 });
    for (const beat of [1, 2]) for (const m of dyad) events.push({ b: bar * 3 + beat, m, v: vel * 0.6 });
  });
  events.push({ b: 48, m: 60, v: vel * 0.75 }, { b: 48, m: 72, v: vel * 0.75 }, { b: 48, m: 84, v: vel * 0.8 });
  const fold = (m) => { while (m < meta.range[0]) m += 12; while (m > meta.range[1]) m -= 12; return m; };

  // Cylinder position (in beats) against time, integrated in 1 ms steps.
  const totalBeats = 49, dt = 0.001, wob = 2 * Math.PI * rand();
  const pos = [0];
  for (let p = 0, t = 0; p < totalBeats; t += dt) {
    const speed = 1 - wd * 0.35 * (p / totalBeats) ** 2.5 + 0.012 * Math.sin(2 * Math.PI * 0.55 * t + wob);
    p += (tempo / 60) * speed * dt;
    pos.push(p);
  }
  const timeAt = (b) => {
    let lo = 0, hi = pos.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pos[m] < b) lo = m; else hi = m; }
    return (lo + (b - pos[lo]) / Math.max(1e-12, pos[hi] - pos[lo])) * dt;
  };

  const last = new Map();
  const notes = events.map((e) => ({ ...e, m: fold(e.m + tr) })).sort((a, b) => a.b - b.b).map((e) => {
    const t0 = Math.max(0, timeAt(e.b) + gauss() * 0.002 * jt);
    const prev = last.get(e.m);
    const f = midiToHz(e.m);
    const residual = prev ? prev.v * Math.exp(-(t0 - prev.t) * 6.91 / t60(f)) : 0;
    last.set(e.m, { t: t0, v: e.v });
    return { t0, m: e.m, v: e.v * (0.93 + 0.14 * rand()), damper: clamp(residual * 2, 0, 1) };
  });
  // A tooth plucked again is stopped by its damper and the new pin.
  for (const nt of notes) {
    const next = notes.find((o) => o.m === nt.m && o.t0 > nt.t0);
    nt.ring = next ? next.t0 - nt.t0 : undefined;
  }
  const rendered = notes.map((nt, i) => ({ at: Math.round(nt.t0 * SR), x: render({ midi: nt.m, velocity: nt.v, seed: seed * 1000 + i, ring: nt.ring, damper: nt.damper }) }));
  const n = Math.max(...rendered.map((r) => r.at + r.x.length)) + 1;
  const out = new Float64Array(n);
  for (const r of rendered) for (let i = 0; i < r.x.length; i++) out[r.at + i] += r.x[i] * TUNE_GAIN;
  return out;
}
