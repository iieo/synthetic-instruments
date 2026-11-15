import { SR } from '../../lib/audio.mjs';
import { biquad, butter, decimate, upsample, fadeOut } from '../techno-kick/dsp.mjs';

const OS = 4;
const tol = (r, x, amt) => x * (1 + amt * (2 * r() - 1));
const sat = (v) => v / Math.sqrt(1 + v * v);

function noise(n, r) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = 2 * r() - 1;
  return x;
}

// Raised-cosine fade-in and fade-out so every hit starts and ends at exactly zero.
export function edges(y, fin = 16, fout = 0.01 * SR) {
  const fi = Math.min(y.length, Math.round(fin));
  for (let i = 0; i < fi; i++) y[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
  y[0] = 0;
  return fadeOut(y, fout);
}

// Smooth saturation on a 48 kHz signal: four times up, sigmoid, back down.
function drive(x, gain) {
  const u = upsample(x, OS);
  const g = sat(gain) / gain;
  for (let i = 0; i < u.length; i++) u[i] = sat(gain * u[i]) / (gain * g);
  return decimate(u, OS);
}

// Short, tight kick: a sine that falls about two octaves in 15 ms onto ~54 Hz, saturated at 4x.
export function kick(r, vel, { tune = 0, decay = 1 }) {
  const fso = SR * OS, len = 0.3 * decay, n = Math.round(len * SR) * OS;
  const fEnd = tol(r, 54, 0.01) * 2 ** (tune / 12);
  const oct = 1.6 + 0.7 * vel, ks = Math.exp(-1 / (0.016 * fso)), kc = Math.exp(-1 / (0.0013 * fso));
  const hold = Math.round(0.012 * fso), ka = Math.exp(-1 / (0.075 * decay * fso));
  const y = new Float64Array(n);
  let es = 1, ec = 1, ea = 1, ph = 0;
  for (let i = 0; i < n; i++) {
    y[i] = sat(1.8 * Math.sin(ph) * ea);
    ph += (2 * Math.PI * fEnd * 2 ** (oct * es + 1.1 * ec)) / fso;
    es *= ks; ec *= kc;
    if (i >= hold) ea *= ka;
  }
  const out = butter(decimate(y, OS), 'hp', 30, 2);
  const cl = biquad(noise(Math.round(0.012 * SR), r).map((v, i) => v * Math.exp(-i / (0.0018 * SR))), 'bp', 4200, 0.9);
  for (let i = 0; i < cl.length; i++) out[i] += (0.25 + 0.2 * vel) * cl[i];
  return out;
}

// Snare: three drum-head modes with a short pitch drop, snare wires as band-passed noise and a
// crack of high-passed noise at the stick. The sum runs through a gentle saturation at 4x.
// `ghost` hits barely move the head, so body and crack shrink and the wires die faster.
export function snare(r, vel, { tune = 0, decay = 1, ghost = false }) {
  const len = (ghost ? 0.22 : 0.38) * decay, n = Math.round(len * SR);
  const k = 2 ** (tune / 12);
  const modes = [[tol(r, 205, 0.01), 1, 0.05], [tol(r, 328, 0.01), 0.55, 0.034], [tol(r, 462, 0.01), 0.3, 0.022]];
  const body = new Float64Array(n);
  for (const [f, a, tau] of modes) {
    let ph = 0, e = a;
    const kd = Math.exp(-1 / (tau * decay * SR)), kp = Math.exp(-1 / (0.006 * SR));
    let ep = 1;
    for (let i = 0; i < n; i++) {
      body[i] += e * Math.sin(ph);
      ph += (2 * Math.PI * f * k * (1 + 0.25 * vel * ep)) / SR;
      e *= kd; ep *= kp;
    }
  }
  let wires = butter(biquad(noise(n, r), 'bp', tol(r, 4800, 0.03), 0.55), 'hp', 1800, 2);
  const crack = biquad(noise(n, r), 'hp', 3500, 0.7);
  const tw = (ghost ? 0.035 : 0.065) * decay, kw = Math.exp(-1 / (tw * SR)), kl = Math.exp(-1 / (0.18 * decay * SR));
  const kc = Math.exp(-1 / (0.0035 * SR)), att = 0.0006 * SR;
  const [gb, gw, gc] = ghost ? [0.45, 0.8, 0.3] : [1, 0.75, 0.6];
  const x = new Float64Array(n);
  let ew = 1, el = 1, ec = 1;
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, i / att);
    x[i] = gb * body[i] + gw * a * (0.85 * ew + 0.15 * el) * wires[i] + gc * ec * crack[i];
    ew *= kw; el *= kl; ec *= kc;
  }
  return butter(drive(x, ghost ? 1.2 : 1.6 + 0.6 * vel), 'hp', 110, 2);
}

// Sum of sine partials with random phases and per-partial decay; sines are band-limited by nature.
function partials(r, n, list) {
  const y = new Float64Array(n);
  for (const { f, a, tau } of list) {
    if (f >= 20000) continue;
    // Damped rotation: (re, im) turns by w and shrinks by kd each sample.
    const w = (2 * Math.PI * f) / SR, kd = Math.exp(-1 / (tau * SR));
    const cr = kd * Math.cos(w), ci = kd * Math.sin(w), ph = 2 * Math.PI * r();
    let re = a * Math.cos(ph), im = a * Math.sin(ph);
    const m = Math.min(n, Math.ceil(tau * 16 * SR));
    for (let i = 0; i < m; i++) {
      y[i] += im;
      const t = re * cr - im * ci;
      im = re * ci + im * cr; re = t;
    }
  }
  return y;
}

// Closed hat: a dense cluster of inharmonic partials between 3 and 14 kHz plus high noise.
export function hat(r, vel, { decay = 1 }) {
  const tau = 0.024 * decay, n = Math.round(Math.min(2, tau * 9 + 0.02) * SR);
  const list = [];
  for (let j = 0; j < 14; j++) {
    const f = 3000 * (14000 / 3000) ** ((j + r()) / 14);
    list.push({ f, a: 0.5 + 0.5 * r(), tau: tau * (1.3 - 0.5 * (j / 14)) }, { f: f * tol(r, 1.013, 0.005), a: 0.4 * r(), tau });
  }
  const metal = partials(r, n, list);
  const air = butter(noise(n, r), 'hp', 7000, 2);
  const kn = Math.exp(-1 / (tau * 0.8 * SR));
  const y = new Float64Array(n);
  let e = 1;
  for (let i = 0; i < n; i++) { y[i] = 0.12 * metal[i] + (0.5 + 0.4 * vel) * air[i] * e; e *= kn; }
  return butter(y, 'hp', tol(r, 6500, 0.02) * (1.1 - 0.2 * vel), 2);
}

// Ride: many partials whose decay shortens with frequency, a few strong bell partials near the cup,
// detuned pairs that beat into the wash, and a short stick tick.
export function ride(r, vel, { decay = 1 }) {
  const T = 1.7 * decay, n = Math.round(Math.min(6, T * 1.6 + 0.05) * SR);
  const list = [];
  for (let j = 0; j < 140; j++) {
    const f = 700 * (16000 / 700) ** ((j + r()) / 140);
    const tau = (T * (2000 / f) ** 0.45 * (0.6 + 0.8 * r())) / 2.5;
    const a = (0.3 + 0.7 * r()) * Math.min(1, (f / 4000) ** 0.6);
    list.push({ f, a, tau }, { f: f + 0.7 + 2.5 * r(), a: 0.6 * a, tau });
  }
  for (const f of [1270, 1940, 2710]) list.push({ f: tol(r, f, 0.006), a: 0.5, tau: T * 0.3 });
  const y = partials(r, n, list);
  const wash = butter(noise(n, r), 'hp', 6000, 2);
  const kw = Math.exp(-1 / (T * 0.18 * SR));
  let e = 1;
  for (let i = 0; i < n; i++) { y[i] += 0.5 * e * wash[i]; e *= kw; }
  const tick = butter(noise(Math.round(0.02 * SR), r), 'hp', 5000, 2);
  for (let i = 0; i < tick.length; i++) y[i] += (2 + 2 * vel) * tick[i] * Math.exp(-i / (0.0025 * SR));
  return butter(y, 'hp', 600, 2);
}
