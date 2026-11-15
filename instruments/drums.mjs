import { SR, rng } from '../lib/audio.mjs';
import { biquad, hertzT, addInto, edges, trimTail } from './drums/dsp.mjs';
import { membrane } from './drums/membrane.mjs';
import { cymbal } from './drums/cymbal.mjs';
import { shaker } from './drums/shaker.mjs';

export const meta = {
  name: 'Drums',
  voices: ['kick', 'snare', 'rim', 'hihatClosed', 'hihatOpen', 'ride', 'crash', 'tomLow', 'tomMid', 'tomHigh', 'shaker'],
};

// LEVEL is the peak of seed 1; other seeds peak up to about 6 dB higher. The fixed output scale
// keeps the loudest hit of any voice and seed near -3 dBFS.
const OUT_GAIN = 0.44;
const LEVEL = {
  kick: 0.85, snare: 0.78, rim: 0.45, hihatClosed: 0.32, hihatOpen: 0.3, ride: 0.28, crash: 0.4,
  tomLow: 0.68, tomMid: 0.66, tomHigh: 0.64, shaker: 0.2,
};

const jit = (r, x, amt) => x * (1 + amt * (2 * r() - 1));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function noise(n, r) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = 2 * r() - 1;
  return x;
}

// Upper head modes are dense and strongly damped: during and just after contact they sum to
// band-limited noise that rises with the contact force and rings out within milliseconds.
function slapBurst(n, T, ring, r) {
  const x = new Float64Array(n), nc = Math.round(T * SR), m = Math.min(n, nc + Math.round(ring * 6 * SR));
  for (let i = 0; i < m; i++) {
    const env = i < nc ? Math.sin((Math.PI * i) / (2 * nc)) ** 2 : Math.exp(-(i - nc) / (ring * SR));
    x[i] = (2 * r() - 1) * env;
  }
  return x;
}

function kick(vel, r) {
  const f0 = jit(r, 57, 0.01);
  const T = hertzT(jit(r, 0.0021, 0.08), vel);
  const { out } = membrane({
    f0, maxRatio: 22, rho: jit(r, 0.12, 0.3), T, amp: vel, len: 0.9, r,
    massLoad: 0.12, glide: 0.11 * vel * vel, glideTau: 0.035,
    t60: (f, m) => (m.m === 0 && m.n === 1 ? 0.55 : clamp(0.32 * (f0 / f) ** 0.8 * (m.m === 0 ? 0.6 : 1), 0.03, 0.4)),
  });
  // Beater on head: the dense, heavily damped upper mode region acts like band-limited noise during contact.
  let s = biquad(biquad(slapBurst(out.length, T, 0.006, r), 'bp', jit(r, 2600, 0.05), 0.9), 'lp', 5000, 0.7);
  addInto(out, s, 20 * vel ** 1.6);
  let y = biquad(out, 'hp', 42, 0.8);
  y = biquad(y, 'peak', 3200, 1.2, -2);
  y = biquad(y, 'lp', 8000, 0.6);
  return { y, a: T * SR };
}

function snareHead(f0, vel, r, rho, T, amp) {
  return membrane({
    f0, maxRatio: 16, rho, T, amp, len: 0.8, r, massLoad: 0.08, airStiff: 0.05,
    glide: 0.04 * vel * vel, glideTau: 0.03,
    t60: (f, m) => (m.m === 0 && m.n === 1 ? 0.4 : clamp(0.32 * (f0 / f) ** 0.5 * (m.m === 0 ? 0.6 : 1), 0.04, 0.3)),
  });
}

// Snare wires rattle when the snare-side head moves faster than the wires can follow; the head's
// motion is driven through the enclosed air, which mainly transmits axisymmetric (m=0) and m=1 modes.
function wires(head, vel, r, level, bright) {
  const { out, modes, phi } = head;
  const n = out.length, h = new Float64Array(n);
  for (const md of modes.slice(0, 10)) {
    if (md.m > 1) continue;
    const w = md.m === 0 ? 1 : 0.35;
    let e = md.a * w;
    const d = md.d ** 1.3;
    for (let i = 0; i < n; i++) { h[i] += e * Math.sin(md.f * phi[i]); e *= d; }
  }
  let vpk = 0;
  const v = new Float64Array(n);
  for (let i = 1; i < n; i++) { v[i] = Math.abs(h[i] - h[i - 1]); vpk = Math.max(vpk, v[i]); }
  const th = (0.05 * vpk) / Math.max(vel, 0.05);
  const att = Math.exp(-1 / (0.0004 * SR)), rel = Math.exp(-1 / (0.03 * SR));
  let env = 0;
  const nz = noise(n, r), wire = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dr = Math.max(0, v[i] - th);
    env = dr > env ? att * env + (1 - att) * dr : rel * env + (1 - rel) * dr;
    wire[i] = nz[i] * env;
  }
  let pk = 0; for (const x of out) pk = Math.max(pk, Math.abs(x));
  const scale = (pk / vel) / ((vpk / vel) + 1e-12);
  let y = biquad(wire, 'hp', 1400, 0.7);
  y = biquad(y, 'peak', jit(r, 3600, 0.04), 1.0, 3);
  y = biquad(y, 'lp', bright, 0.6);
  return addInto(out, y, level * scale);
}

function snare(vel, r) {
  const f0 = jit(r, 208, 0.01);
  const T = hertzT(jit(r, 0.00055, 0.1), vel);
  const head = snareHead(f0, vel, r, jit(r, 0.33, 0.25), T, vel);
  let y = wires(head, vel, r, 2.2, 3800 + 2600 * vel);
  y = biquad(y, 'hp', 70, 0.7);
  y = biquad(y, 'lp', 9000, 0.6);
  return { y, a: T * SR };
}

function rim(vel, r) {
  // Cross stick: free-free bar modes of the stick, the hoop/shell ringing, and a weak head excitation.
  const T = hertzT(0.00022, vel), n = Math.round(0.5 * SR), out = new Float64Array(n);
  const f1 = jit(r, 410, 0.03);
  const bar = [[1, 1, 0.09], [2.756, 0.7, 0.06], [5.404, 0.45, 0.04], [8.933, 0.25, 0.03], [13.34, 0.12, 0.02]];
  for (const [ratio, a, t] of bar) {
    const f = f1 * ratio, w = (2 * Math.PI * f) / SR, d = Math.exp(-6.9 / (t * SR));
    let e = vel * a * (0.9 + 0.2 * r());
    for (let i = 0; i < n; i++) { out[i] += e * Math.sin(w * i); e *= d; }
  }
  const shell = cymbal({
    count: 30, fLo: 650, fHi: 3400, env: () => 1, t60: (f) => 0.12 * (1000 / f) ** 0.6,
    bloom: () => 0, bloomAmp: () => 0, T, amp: vel * 2.2, len: 0.5, r,
  });
  addInto(out, shell, 1);
  const head = snareHead(jit(r, 208, 0.01), vel * 0.3, r, 0.85, 0.001, vel * 0.25);
  addInto(out, wires(head, vel * 0.3, r, 3, 5000), 1);
  let y = biquad(out, 'hp', 120, 0.7);
  y = biquad(y, 'lp', 7000, 0.7);
  return { y, a: Math.max(6, T * SR) };
}

function tom(f0base, vel, r) {
  const f0 = jit(r, f0base, 0.008);
  const T = hertzT(jit(r, 0.0008, 0.1), vel);
  const fund = 1.3 * (100 / f0) ** 0.3;
  const batter = membrane({
    f0, maxRatio: 12, rho: jit(r, 0.3, 0.2), T, amp: vel, len: 2.0, r, massLoad: 0.1, airStiff: 0.04,
    glide: 0.07 * vel * vel, glideTau: 0.07,
    t60: (f, m) => (m.m === 0 && m.n === 1 ? fund : clamp(0.55 * (f0 / f) ** 0.6 * (m.m === 0 ? 0.7 : 1), 0.04, fund)),
  });
  // Resonant head, tuned slightly higher and driven through the shell air (axisymmetric only, rho = 0).
  const reso = membrane({
    f0: f0 * jit(r, 1.035, 0.005), maxRatio: 6, rho: 0, T: 0.002, amp: vel * 0.35, len: 2.0, r,
    massLoad: 0.1, airStiff: 0.04, t60: (f) => clamp(fund * 0.9 * (f0 / f) ** 0.6, 0.05, 1),
  });
  let y = addInto(batter.out, reso.out, 1);
  addInto(y, biquad(slapBurst(y.length, T, 0.005, r), 'bp', jit(r, 2400, 0.05), 0.8), 14 * vel ** 1.5);
  y = biquad(y, 'hp', 45, 0.7);
  y = biquad(y, 'lp', 6000, 0.7);
  return { y, a: T * SR };
}

const bump = (f, fc, oct) => Math.exp(-0.5 * (Math.log2(f / fc) / oct) ** 2);

function hat(vel, r, open) {
  const T = hertzT(jit(r, 0.00012, 0.1), vel);
  const fc = jit(r, 7800, 0.05);
  const env = (f) => bump(f, fc, 1.1) + 0.12 * bump(f, 1500, 1.0);
  let y;
  if (!open) {
    y = cymbal({
      count: 260, fLo: 350, fHi: 14000, env, T, amp: vel, len: 0.4, r,
      t60: (f) => jit(r, 0.12, 0.08) * (3000 / f) ** 0.25,
      bloom: (f) => 0.003 * (f / 4000), bloomAmp: (f) => 0.2 * vel * bump(f, 7000, 1),
    });
  } else {
    // Loosely touching plates chatter against each other: slow random amplitude modulation.
    const n = Math.round(2.0 * SR), mod = new Float64Array(n);
    let a = 0, b = 0;
    const k = Math.exp(-1 / (0.006 * SR));
    for (let i = 0; i < n; i++) { a = k * a + (1 - k) * (2 * r() - 1); b = k * b + (1 - k) * a; mod[i] = 1 + 18 * b * Math.exp(-i / (0.4 * SR)); }
    y = cymbal({
      count: 340, fLo: 300, fHi: 14000, env, T, amp: vel, len: 2.0, r,
      t60: (f) => clamp(1.3 * (2000 / f) ** 0.4, 0.35, 1.6),
      bloom: (f) => 0.025 * (f / 5000), bloomAmp: (f) => 0.35 * vel * bump(f, 7000, 1), am: (i) => mod[i],
    });
  }
  y = biquad(y, 'hp', 300, 0.7);
  y = biquad(y, 'lp', 12500, 0.7);
  y = biquad(y, 'hshelf', 9000, 0.7, -2);
  return { y, a: Math.max(6, T * SR) };
}

function ride(vel, r) {
  const T = hertzT(jit(r, 0.0001, 0.1), vel);
  const env = (f) => bump(f, 5500, 1.3) + 0.25 * bump(f, 900, 0.8);
  const ping = [jit(r, 560, 0.03), jit(r, 1230, 0.03), jit(r, 2090, 0.03), jit(r, 3170, 0.03)]
    .map((f, k) => ({ f, a: [3.5, 3, 2.4, 1.8][k] }));
  let y = cymbal({
    count: 420, fLo: 300, fHi: 13000, env, T, amp: vel, len: 5.5, r, extra: ping,
    t60: (f) => clamp(3.6 * (1000 / f) ** 0.35, 0.9, 3.6),
    bloom: (f) => 0.02 * (f / 5000), bloomAmp: (f) => 0.25 * vel * bump(f, 6500, 1),
  });
  y = biquad(y, 'hp', 250, 0.7);
  y = biquad(y, 'lp', 12000, 0.7);
  y = biquad(y, 'hshelf', 8000, 0.7, -2);
  return { y, a: Math.max(6, T * SR) };
}

function crash(vel, r) {
  const T = hertzT(jit(r, 0.00018, 0.1), vel);
  const env = (f) => bump(f, 5200, 1.4) + 0.2 * bump(f, 700, 0.9);
  let y = cymbal({
    count: 620, fLo: 220, fHi: 14000, env, T, amp: vel, len: 4.5, r,
    t60: (f) => clamp(3.0 * (1000 / f) ** 0.3, 0.9, 3.4),
    bloom: (f) => 0.07 * (f / 4000) / (0.5 + vel), bloomAmp: (f) => 0.6 * vel * bump(f, 6500, 1),
  });
  y = biquad(y, 'hp', 200, 0.7);
  y = biquad(y, 'lp', 12000, 0.7);
  y = biquad(y, 'hshelf', 8000, 0.7, -2);
  return { y, a: Math.max(8, T * SR) };
}

function shake(vel, r) {
  let y = shaker({ vel, r });
  y = biquad(y, 'lp', 9000, 0.7);
  return { y, a: 6 };
}

const VOICES = {
  kick, snare, rim, crash, ride, shaker: shake,
  hihatClosed: (v, r) => hat(v, r, false),
  hihatOpen: (v, r) => hat(v, r, true),
  tomLow: (v, r) => tom(84, v, r),
  tomMid: (v, r) => tom(112, v, r),
  tomHigh: (v, r) => tom(150, v, r),
};

function raw(voice, velocity, seed) {
  const fn = VOICES[voice];
  if (!fn) throw new Error(`unknown voice ${voice}`);
  const r = rng(((seed * 2654435761) ^ (voice.length * 40503) ^ voice.charCodeAt(0)) >>> 0);
  for (let i = 0; i < 4; i++) r();
  const { y, a } = fn(clamp(velocity, 0.02, 1), r);
  return { y, a };
}

const calib = new Map();
function calibration(voice) {
  if (!calib.has(voice)) {
    const { y } = raw(voice, 1, 1);
    let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
    calib.set(voice, (OUT_GAIN * LEVEL[voice]) / pk);
  }
  return calib.get(voice);
}

export function render({ voice, velocity = 0.8, seed = 1 }) {
  const { y, a } = raw(voice, velocity, seed);
  const g = calibration(voice);
  for (let i = 0; i < y.length; i++) y[i] *= g;
  const t = trimTail(y, -75);
  return edges(t, a, Math.min(0.04 * SR, t.length * 0.2));
}
