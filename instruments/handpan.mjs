import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { seedInt, noteSeed } from './synth/dsp.mjs';
import { TAU, propagator, step, makeBank } from './steelpan/model.mjs';
import { BODY, LO, HI, DING, NEIGHBOURS } from './handpan/body.mjs';
import { biquad } from './drums/dsp.mjs';

const PRESETS = {
  soft: { tau: 2.2e-3, pos: 0, couple: 0.004, upper: 0.7, sustain: 1, dbl: 0.22, helm: 1, shell: 0.8, gain: 0.999 },
  bright: { tau: 1.3e-3, pos: 0.18, couple: 0.009, upper: 1, sustain: 0.9, dbl: 0.18, helm: 0.8, shell: 1.2, gain: 0.852 },
  ding: { tau: 2.1e-3, pos: -0.05, couple: 0.006, upper: 0.7, sustain: 1.3, dbl: 0.32, helm: 1.9, shell: 1.4, gain: 0.859 },
};
const STRIKES = { center: 0.15, edge: 0.72, muted: 0.3 };

export const meta = { name: 'Handpan', range: [LO, HI], presets: Object.keys(PRESETS), strike: Object.keys(STRIKES) };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const cents = (c) => 2 ** (c / 1200);
const F_HELM = 128, Q_HELM = 7;

function num(name, x, def) {
  if (x === undefined || x === null) return def;
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`handpan: ${name} must be a finite number, got ${String(x)}`);
  return x;
}

function pick(name, x, table, def) {
  if (x === undefined || x === null || x === '') return def;
  if (!Object.hasOwn(table, x)) throw new Error(`handpan: unknown ${name} "${String(x)}", expected one of ${Object.keys(table).join(', ')}`);
  return x;
}

// Tuned modes of one note field: fundamental, octave and compound fifth (1 : 2 : 3), then the
// untuned higher modes where the field geometry puts them.
function fieldModes(midi, sustain) {
  const fd = BODY.fields.get(midi);
  const f0 = midiToHz(midi) * cents(fd.cents[0]);
  const p = clamp((midi - LO) / (HI - LO), 0, 1);
  const T1 = (7.5 - 4.5 * p) * sustain;
  const modes = [
    { f: f0, t60: T1, split: fd.split[0] },
    { f: 2 * f0 * cents(fd.cents[1]), t60: 0.75 * T1, split: fd.split[1] },
    { f: 3 * f0 * cents(fd.cents[2]), t60: 0.5 * T1, split: fd.split[2] },
  ];
  for (const r of fd.upper) modes.push({ f: r * f0, t60: clamp(0.5 * (r * f0 / 1000) ** -0.5, 0.08, 0.8) });
  return modes.filter((m) => m.f < 0.4 * SR);
}

// midi defaults to 57 and is rounded and clamped to meta.range.
export function render({ midi = 57, velocity = 0.8, duration = 3, preset = 'soft', strike = 'center', seed = 1 } = {}) {
  midi = clamp(Math.round(num('midi', midi, 57)), LO, HI);
  const v = clamp(num('velocity', velocity, 0.8), 0.01, 1);
  duration = clamp(num('duration', duration, 3), 0.02, 30);
  seed = seedInt(num('seed', seed, 1));
  preset = pick('preset', preset, PRESETS, 'soft');
  const P = PRESETS[preset];
  strike = pick('strike', strike, STRIKES, 'center');
  const muted = strike === 'muted';
  const r = rng(noteSeed(seed, [midi], 'handpan' + preset + strike));
  const jit = (s) => 1 + s * (2 * r() - 1);
  const h = 1 / SR, NS = 8;

  const pos = clamp(STRIKES[strike] + P.pos + 0.06 * (2 * r() - 1), 0, 1);
  const sustain = P.sustain * (muted ? 0.035 : 1);
  const modes = fieldModes(midi, sustain).map((m) => ({ ...m, w: TAU * m.f, q: 0, p: 0 }));
  for (const m of modes) { m.P = propagator(m.w, m.t60, h); m.Ps = propagator(m.w, m.t60, h / NS); }
  const M = modes.length, w1 = modes[0].w, W2 = w1 * w1;
  const phi = modes.map((_, k) => (k === 0 ? 1 - 0.55 * pos : k === 1 ? 0.4 + 0.5 * pos : k === 2 ? 0.28 + 0.45 * pos : P.upper * (0.12 + 0.35 * pos)) * (k ? jit(0.15) : 1));
  const rad = [1, 0.8, 0.6, 0.12, 0.1, 0.08, 0.06];
  const mono = [1, 0.08, 0.12, 0.05, 0.03, 0.03, 0.02];
  const membrane = [1, 0.5, 0.4, 0.2, 0.15, 0.1, 0.1];

  // Each tuned mode is a near-degenerate pair; the slightly split partner gives the slow beating.
  const dbl = makeBank(modes.slice(0, 3).map((m) => ({ f: m.f + m.split, t60: m.t60 * 0.9 })), h);
  for (const d of dbl) d.Ps = propagator(d.w, d.t60, h / NS);
  const dPhi = dbl.map((_, k) => P.dbl * phi[k] * jit(0.3));

  // Quadratic stiffness of the curved field: cubic potential terms between modes with f_i + f_j = f_k.
  const triads = [[0, 0, 1, P.couple], [0, 1, 2, 0.8 * P.couple]].filter((t) => t[2] < M).map((t) => [t[0], t[1], t[2], t[3] * W2 * jit(0.1)]);
  const d4 = 0.006 * W2;

  // Hand strike: a smooth contact force pulse; a heavier, harder stroke is shorter.
  // Smaller, higher note fields are stiffer under the hand, so the contact is shorter there.
  const tau = P.tau * (modes[0].f / 220) ** -0.6 * (1.3 - 0.45 * v) * jit(0.05) * (muted ? 1.4 : 1);
  const nPulse = Math.ceil(tau * SR) + 1;
  const V = (0.04 + 0.96 * v ** 1.4) * jit(0.03);
  const sig = tau / 6, tc = tau / 2;
  const Famp = (V * w1) / (sig * Math.sqrt(Math.PI));
  const force = (t) => (t < tau ? Famp * Math.exp(-(((t - tc) / sig) ** 2)) : 0);

  const nbr = [];
  for (const [dm, k] of NEIGHBOURS) {
    const nm = midi + dm;
    if (!BODY.fields.has(nm)) continue;
    for (const m of fieldModes(nm, sustain * 0.85).slice(0, 3)) nbr.push({ ...m, k });
  }
  if (midi !== DING) for (const m of fieldModes(DING, sustain).slice(0, 3)) nbr.push({ ...m, k: 0.7 });
  const nb = makeBank(nbr, h);
  const sh = makeBank(BODY.shell.map((m) => ({ ...m, t60: m.t60 * (muted ? 0.5 : 1) })), h);
  const wH = TAU * F_HELM;
  const helm = { q: 0, p: 0, w: wH, P: propagator(wH, 6.907755 * 2 * Q_HELM / wH, h) };

  const nRing = Math.round(duration * SR);
  const nDamp = Math.round((muted ? 0.05 : 0.15) * SR);
  const n = nRing + nDamp;
  const out = new Float64Array(n);
  const f = new Float64Array(M);
  const nonlin = () => {
    f.fill(0);
    for (const [i, j, k, c] of triads) {
      const qi = modes[i].q, qj = modes[j].q, qk = modes[k].q;
      f[i] -= c * qj * qk; f[j] -= c * qi * qk; f[k] -= c * qi * qj;
    }
    f[0] -= d4 * modes[0].q ** 3;
  };

  const accNorm = (SR * SR) / W2;
  const nbGain = 0.0002, shGain = 0.05 * P.shell * (muted ? 2.5 : 1), hGain = 0.35 * P.helm, kH = 0.3;
  let h1 = 0, h2 = 0;

  for (let i = 0; i < n; i++) {
    let Fmean = 0;
    if (i < nPulse) {
      const dt = h / NS;
      for (let s = 0; s < NS; s++) {
        const F = force((i + (s + 0.5) / NS) * h);
        nonlin();
        for (let k = 0; k < M; k++) { modes[k].p += (phi[k] * F + f[k]) * dt; step(modes[k], modes[k].Ps); }
        for (let k = 0; k < dbl.length; k++) { dbl[k].p += dPhi[k] * F * dt; step(dbl[k], dbl[k].Ps); }
        Fmean += F / NS;
      }
    } else {
      nonlin();
      for (let k = 0; k < M; k++) { modes[k].p += f[k] * h; step(modes[k], modes[k].P); }
      for (const d of dbl) step(d, d.P);
    }
    if (i === nRing) {
      const cut = (m) => { m.P = propagator(m.w, Math.min(m.t60, 0.06), h); };
      modes.forEach(cut); dbl.forEach(cut); nb.forEach(cut);
    }

    let y = 0, u = 0, U = 0;
    for (let k = 0; k < M; k++) {
      const q = modes[k].q, wr = modes[k].w / w1;
      y += rad[k] * wr * wr * q;
      u += membrane[k] * q;
      U += mono[k] * q;
    }
    for (let k = 0; k < dbl.length; k++) { const wr = dbl[k].w / w1; y += rad[k] * wr * wr * dbl[k].q; U += mono[k] * dbl[k].q; }

    let nAcc = 0;
    for (const m of nb) { m.p += m.k * m.w * m.w * u * h; step(m, m.P); nAcc += (m.w / w1) ** 2 * m.q; }
    let sAcc = 0;
    for (const m of sh) { m.p += (Fmean / w1 + 0.3 * u * w1) * h; step(m, m.P); sAcc += m.g * (m.f / 1000) * m.p; }

    // Helmholtz resonance of the air inside the shell, driven by the net volume change of the field.
    helm.p += kH * wH * wH * U * h;
    step(helm, helm.P);
    const hAcc = (helm.q - 2 * h1 + h2) * accNorm;
    h2 = h1; h1 = helm.q;

    out[i] = y + nbGain * nAcc + shGain * sAcc + hGain * hAcc;
  }

  // The modal sum leaves out the direct force term of the field acceleration, so each stroke would carry
  // a net offset equal to its impulse. A closed shell cannot radiate that; a 4th order high-pass at 20 Hz
  // removes it and leaves the lowest fields and their neighbours untouched.
  const hp = biquad(biquad(out, 'hp', 20, 0.5412), 'hp', 20, 1.3066);
  const gain = 0.2 * P.gain;
  const fin = 24, fade = Math.round(0.03 * SR);
  for (let i = 0; i < n; i++) out[i] = hp[i] * gain;
  for (let i = 0; i < fin; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fin);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
  return out;
}
