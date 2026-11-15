import { SR, rng } from '../lib/audio.mjs';
import { SVF, filter, pulseBank, diodeClipper, noise, finish } from './drum-machine/dsp.mjs';

export const meta = {
  name: 'Drum Machine',
  voices: ['hatClosed', 'hatOpen', 'ride', 'clap', 'snare', 'rim', 'perc'],
};

// T60 in seconds for each voice's main envelope.
const DECAY = { hatClosed: 0.11, hatOpen: 0.75, ride: 2.4, clap: 0.6, snare: 0.2, rim: 0.05, perc: 0.55 };
// Calibrated so that the loudest full-velocity hit of each voice over all documented option ranges and seeds peaks near -3 dBFS.
const LEVEL = { hatClosed: 1.99, hatOpen: 1.91, ride: 1.28, clap: 1.4, snare: 1.11, rim: 1.17, perc: 20.4 };

// Six free-running oscillators whose pairwise ratios avoid small integers, so the summed
// spectrum is a dense inharmonic cluster instead of a chord.
const HAT_OSC = [263, 371, 412, 497, 586, 845];
const RIDE_OSC = [389, 457, 541, 619, 734, 947];

const tol = (r, x, amt) => x * (1 + amt * (2 * r() - 1));
const t60tau = (t60) => t60 / 6.91;

function metal(r, base, n, tune) {
  const k = 2 ** (tune / 12);
  return pulseBank(base.map((f) => ({
    f: tol(r, f, 0.003) * k, duty: tol(r, 0.5, 0.03), phase: r(), amp: tol(r, 1 / 6, 0.05),
  })), n);
}

function hat(r, vel, tune, t60, open) {
  const n = Math.ceil((t60 * 1.3 + 0.03) * SR);
  const m = metal(r, HAT_OSC, n, tune);
  const k = 2 ** (tune / 24);
  const bp1 = filter(m, 'bp', tol(r, 3450, 0.02) * k, 1.6);
  const bp2 = filter(m, 'bp', tol(r, 8000, 0.02) * k, 1.3);
  const air = filter(noise(n, r), 'hp', 6000);
  const tau = t60tau(t60), tauA = open ? tau * 0.18 : tau * 0.35, att = 0.0004 * SR;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // The VCA's discharge curve: a fast drop from the trigger spike, then the RC decay.
    const t = i / SR;
    const env = (0.6 * Math.exp(-t / tau) + 0.4 * Math.exp(-t / tauA)) * Math.min(1, i / att);
    y[i] = env * (0.18 * bp1[i] + bp2[i] + 0.04 * air[i]);
  }
  // Accented hits open the high-pass a little.
  return filter(filter(y, 'hp', tol(r, 7600, 0.02) * (1.15 - 0.25 * vel), 0.9), 'hp', 3000);
}

function ride(r, vel, tune, t60) {
  const n = Math.ceil((t60 * 1.15 + 0.05) * SR);
  const m = metal(r, RIDE_OSC, n, tune);
  const k = 2 ** (tune / 24);
  const bell = filter(m, 'bp', tol(r, 2300, 0.02) * k, 4);
  const shimmer = filter(m, 'bp', tol(r, 6000, 0.02) * k, 1.1);
  const top = filter(m, 'bp', tol(r, 9800, 0.02) * k, 1.4);
  const tau = t60tau(t60), att = 0.0006 * SR;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, a = Math.min(1, i / att);
    const eTop = 0.55 * Math.exp(-t / tau) + 0.45 * Math.exp(-t / (tau * 0.08));
    const eBell = Math.exp(-t / (tau * 0.45));
    y[i] = a * (0.08 * bell[i] * eBell + 0.7 * shimmer[i] * eTop + top[i] * eTop);
  }
  return filter(y, 'hp', tol(r, 4000, 0.02) * (1.1 - 0.2 * vel), 0.8);
}

function clap(r, vel, tune, t60) {
  const n = Math.ceil((t60 * 1.2 + 0.06) * SR);
  const k = 2 ** (tune / 12);
  const src = noise(n, r);
  const body = filter(src, 'bp', tol(r, 1150, 0.03) * k, 2.2);
  const edge = filter(src, 'bp', tol(r, 2600, 0.03) * k, 1.4);
  // A sawtooth discharge re-triggered 3 to 4 times by a short oscillator, with jittered spacing.
  const bursts = [0];
  const nb = r() < 0.7 ? 4 : 3;
  for (let b = 1; b < nb; b++) bursts.push(bursts[b - 1] + Math.round(tol(r, 0.0105, 0.18) * SR));
  const tail0 = bursts[nb - 1], tauB = 0.0042 * SR, tauT = t60tau(t60) * SR, att = 0.0003 * SR;
  const y = new Float64Array(n);
  let b = 0;
  for (let i = 0; i < n; i++) {
    while (b + 1 < nb && i >= bursts[b + 1]) b++;
    const d = i - bursts[b];
    const burst = Math.exp(-d / tauB) * Math.min(1, d / att) * (b === nb - 1 ? 0.9 : 1);
    const tail = i >= tail0 ? 0.55 * Math.exp(-(i - tail0) / tauT) * Math.min(1, (i - tail0) / (0.004 * SR)) : 0;
    y[i] = burst * (body[i] + 0.5 * edge[i]) + tail * (body[i] + 0.25 * edge[i]);
  }
  // The band-passes widen with tune, so noise power grows with k; keep the level constant.
  const g = 1 / Math.sqrt(k);
  for (let i = 0; i < n; i++) y[i] *= g;
  return filter(y, 'hp', 400, 0.7);
}

// A bridged-T network is a high-Q band-pass; a trigger pulse rings it at f with T60 = 6.91 Q / (pi f).
// k*bp rings at an amplitude proportional to 1/T60, so scaling by t60/ref keeps the level of a
// hit independent of its decay; at t60 = ref the output is unchanged.
function resonator(n, f, t60, pulse, sweep = 0, sweepTau = 0.01, ref = t60) {
  const q = (Math.PI * f * t60) / 6.91;
  const s = new SVF(f, q), y = new Float64Array(n), amp = t60 / ref;
  const pw = Math.max(2, Math.round(pulse * SR)), dk = Math.exp(-1 / (sweepTau * SR));
  let sw = sweep;
  for (let i = 0; i < n; i++) {
    if (sweep) { s.set(f * (1 + sw)); sw *= dk; }
    const x = i < pw ? Math.sin((Math.PI * i) / pw) : 0;
    y[i] = amp * s.k * s.tick(x).bp;
  }
  return y;
}

function snare(r, vel, tune, t60, snappy) {
  const n = Math.ceil((t60 * 1.2 + 0.05) * SR);
  const k = 2 ** (tune / 12);
  const lo = resonator(n, tol(r, 182, 0.01) * k, 0.2, 0.001, 0.06 * vel, 0.012);
  const hi = resonator(n, tol(r, 331, 0.01) * k, 0.13, 0.001, 0.04 * vel, 0.01);
  let nz = filter(noise(n, r), 'hp', tol(r, 1500, 0.04), 0.8);
  nz = filter(nz, 'lp', tol(r, 7000, 0.04), 0.7);
  const tau = t60tau(t60) * SR, att = 0.0005 * SR, y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const env = (0.75 * Math.exp(-i / tau) + 0.25 * Math.exp(-i / (0.012 * SR))) * Math.min(1, i / att);
    y[i] = 1.4 * lo[i] + 0.9 * hi[i] + snappy * 0.55 * env * nz[i];
  }
  return filter(y, 'hp', 90, 0.7);
}

function rim(r, vel, tune, t60) {
  const n = Math.ceil((t60 * 1.6 + 0.03) * SR);
  const k = 2 ** (tune / 12);
  const a = resonator(n, tol(r, 517, 0.01) * k, t60, 0.00025, 0, 0.01, DECAY.rim);
  const b = resonator(n, tol(r, 1690, 0.01) * k, t60 * 0.7, 0.00025, 0, 0.01, DECAY.rim * 0.7);
  const click = filter(noise(n, r).map((v, i) => v * Math.exp(-i / (0.0012 * SR))), 'hp', 2500);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = 0.5 * a[i] + 1.0 * b[i] + 0.6 * click[i];
  // The output transistor stage saturates on the rim's strike; model it with the diode pair.
  return filter(diodeClipper(y, 0.45 + 0.2 * vel), 'hp', 150, 0.7);
}

function perc(r, vel, tune, t60) {
  const n = Math.ceil((t60 * 1.15 + 0.03) * SR);
  const f = tol(r, 196, 0.006) * 2 ** (tune / 12);
  const body = resonator(n, f, t60, 0.0008, 0.55 + 0.25 * vel, 0.011, DECAY.perc);
  const over = resonator(n, f * 2.71, t60 * 0.22, 0.0008, 0.4, 0.008, DECAY.perc * 0.22);
  const click = filter(noise(Math.round(0.004 * SR), r), 'bp', 3200, 1);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = i < click.length ? click[i] * (1 - i / click.length) : 0;
    y[i] = body[i] + 0.12 * over[i] + 0.02 * c;
  }
  return filter(y, 'hp', 40, 0.7);
}

// Documented ranges; out-of-range values are clamped, non-numbers fall back to the default.
export const RANGE = { velocity: [0, 1], tune: [-12, 12], decay: [0.02, 4], drive: [0, 1], snappy: [0, 1] };
const clamp = (x, [lo, hi], def) => (Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def);

export function render({ voice, velocity = 0.8, seed = 1, tune = 0, decay, drive = 0, snappy = 0.7 }) {
  if (!meta.voices.includes(voice)) throw new Error(`unknown voice ${voice}`);
  const r = rng((seed * 2654435761) ^ (meta.voices.indexOf(voice) * 40503 + 7));
  const vel = clamp(velocity, RANGE.velocity, 0.8);
  const t60 = clamp(decay, RANGE.decay, DECAY[voice]);
  tune = clamp(tune, RANGE.tune, 0);
  drive = clamp(drive, RANGE.drive, 0);
  snappy = clamp(snappy, RANGE.snappy, 0.7);
  let y;
  if (voice === 'hatClosed') y = hat(r, vel, tune, t60, false);
  else if (voice === 'hatOpen') y = hat(r, vel, tune, t60, true);
  else if (voice === 'ride') y = ride(r, vel, tune, t60);
  else if (voice === 'clap') y = clap(r, vel, tune, t60);
  else if (voice === 'snare') y = snare(r, vel, tune, t60, snappy);
  else if (voice === 'rim') y = rim(r, vel, tune, t60);
  else y = perc(r, vel, tune, t60);
  const g = LEVEL[voice] * vel ** 1.5;
  for (let i = 0; i < y.length; i++) y[i] *= g;
  if (drive > 0) y = filter(diodeClipper(y, drive), 'hp', 25, 0.7);
  return finish(y);
}
