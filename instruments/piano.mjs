import { SR, rng } from '../lib/audio.mjs';
import { pianoParams, promptLoss } from './piano/params.mjs';
import { strike } from './piano/hammer.mjs';
import { coupledModes } from './piano/unison.mjs';
import { bodyGain, bridgeLossMod, bridgePull, knock } from './piano/soundboard.mjs';

export const meta = { name: 'Piano', range: [21, 108] };

const OUT_GAIN = 2.2e-3;
const KNOCK_GAIN = 2.5e-7;
const AFTER_RATIO = 0.28; // aftersound loss / prompt loss (antisymmetric vs symmetric unison motion)

function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

function finite(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`piano.render: ${name} must be a finite number, got ${String(v)}`);
  return v;
}

export function render({ midi = 60, velocity = 0.8, duration = 1, seed = 1 } = {}) {
  midi = Math.max(meta.range[0], Math.min(meta.range[1], Math.round(finite('midi', midi))));
  const vel = Math.max(0.01, Math.min(1, finite('velocity', velocity)));
  duration = Math.max(0, finite('duration', duration));
  seed = finite('seed', seed);
  const P = pianoParams(midi);
  const r = rng((seed * 2654435761 + midi * 40503) >>> 0);
  const Ns = P.nStrings;

  const fMax = Math.min(19000, 0.45 * SR);
  const freq = [];
  for (let n = 1; n <= 240; n++) {
    const f = n * P.f0 * Math.sqrt(1 + P.B * n * n);
    if (f > fMax) break;
    freq.push(f);
  }
  const N = freq.length;
  const beta = P.beta * (1 + 0.03 * gauss(r));
  const omega = Float64Array.from(freq, (f) => 2 * Math.PI * f);
  const phi = Float64Array.from(freq, (_, i) => Math.sin((i + 1) * Math.PI * beta));
  // Bridge sits at x = L, where mode n has slope proportional to n * (-1)^n.
  const weights = Float64Array.from(freq, (f, i) => (i % 2 ? -1 : 1) * (i + 1) * Math.PI * Ns * P.T / P.L * bodyGain(f) * OUT_GAIN);
  const v0 = 0.15 + 5 * vel ** 2; // hammer speed, m/s

  const hit = strike({ omega, phi, modalMass: Ns * P.mu * P.L / 2, weights, mH: P.mH, K: P.K, p: P.p, v0 });
  const t0 = 1 + hit.nWin; // sample 0 stays silent

  // Unison string detuning (cents) and small differences in stiffness and hammer contact.
  const detune = [];
  if (Ns === 1) detune.push(0);
  else if (Ns === 2) { const d = 0.25 + 0.8 * r(); detune.push(-d / 2, d / 2); }
  else { detune.push(-(0.2 + 0.7 * r()), 0.25 * gauss(r), 0.2 + 0.7 * r()); }
  const Bk = detune.map(() => P.B * (1 + 0.015 * gauss(r)));
  const share = detune.map(() => { const m = 1 + 0.05 * gauss(r), ph = 0.04 * gauss(r); return [m * Math.cos(ph), m * Math.sin(ph)]; });
  const shareSum = share.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
  const polAmp = detune.map(() => 0.03 + 0.06 * r());
  const polShift = detune.map(() => (r() < 0.5 ? -1 : 1) * 2 * Math.PI * (0.05 + 0.3 * r()));
  const polPhase = detune.map(() => 2 * Math.PI * r());

  const comps = [];
  for (let n = 0; n < N; n++) {
    const f = freq[n], nn = (n + 1) * (n + 1);
    const sFast = promptLoss(P, f);
    const sInt = AFTER_RATIO * sFast;
    const g = (sFast - sInt) / Ns * bridgeLossMod(f);
    const c = [-g, -g * 0.4 * bridgePull(f)];
    // Complex amplitude at t0 (relative to the effective string), divided among strings.
    const Z = [hit.Zr[n] * weights[n], hit.Zi[n] * weights[n]];
    const zs = [(Z[0] * shareSum[0] + Z[1] * shareSum[1]) / (shareSum[0] ** 2 + shareSum[1] ** 2),
      (Z[1] * shareSum[0] - Z[0] * shareSum[1]) / (shareSum[0] ** 2 + shareSum[1] ** 2)];
    const d = [], a0 = [];
    for (let k = 0; k < Ns; k++) {
      const wk = omega[n] * 2 ** ((detune[k] + 0.15 * gauss(r)) / 1200) * Math.sqrt((1 + Bk[k] * nn) / (1 + P.B * nn));
      d.push([-sInt, wk - omega[n]]);
      let a = [zs[0] * share[k][0] - zs[1] * share[k][1], zs[0] * share[k][1] + zs[1] * share[k][0]];
      // Horizontal polarisation: weakly coupled to the bridge, so it decays slowly (aftersound).
      const pa = Math.hypot(...a) * polAmp[k] / Math.sqrt(1 + n / 8);
      const pr = [pa * Math.cos(polPhase[k] + n), pa * Math.sin(polPhase[k] + n)];
      a = [a[0] - pr[0], a[1] - pr[1]];
      a0.push(a);
      comps.push({ s: sInt * 1.15, w: wk + polShift[k] * (0.5 + r()), r: pr, f });
    }
    for (const { mu, r: res } of coupledModes(d, c, a0)) comps.push({ s: -mu[0], w: omega[n] + mu[1], r: res, f });
  }

  const relIdx = Math.max(t0, Math.round(duration * SR));
  const ramp = Math.round(0.03 * SR);
  const sDamp = P.hasDamper ? 6.91 / P.Tdamp : 0;
  let ref = 0;
  for (const cp of comps) ref += Math.hypot(...cp.r);
  const thr = ref * 10 ** (-100 / 20);
  let len = t0;
  for (const cp of comps) {
    const a = Math.hypot(...cp.r);
    if (a < thr) { cp.end = t0; continue; }
    const s = Math.max(cp.s, 0.05);
    let end = t0 + Math.ceil(Math.log(a / thr) / s * SR);
    if (P.hasDamper && end > relIdx) {
      const aRel = a * Math.exp(-s * (relIdx - t0) / SR);
      end = relIdx + ramp + Math.ceil(Math.max(0, Math.log(aRel / thr)) / (s + sDamp) * SR);
    }
    cp.end = end;
    len = Math.max(len, end);
  }
  len = Math.min(len, relIdx + Math.round(25 * SR));
  const fadeN = Math.round(0.03 * SR);
  len += fadeN;
  const out = new Float64Array(len);
  out.set(hit.out, 1);

  for (const cp of comps) {
    const end = Math.min(cp.end, len);
    if (end <= t0) continue;
    const e = Math.exp(-cp.s / SR);
    let cr = e * Math.cos(cp.w / SR), ci = e * Math.sin(cp.w / SR);
    let zr = cp.r[0], zi = cp.r[1];
    const relEnd = P.hasDamper ? Math.min(end, relIdx) : end;
    let i = t0;
    for (; i < relEnd; i++) {
      out[i] += zr;
      const nr = zr * cr - zi * ci; zi = zr * ci + zi * cr; zr = nr;
    }
    if (i >= end) continue;
    // Damper felt descends: extra loss fades in over `ramp` samples.
    const q = Math.exp(-sDamp / (ramp * SR));
    let m = 1;
    for (let k = 0; k < ramp && i < end; k++, i++) {
      out[i] += zr;
      m *= q;
      const nr = (zr * cr - zi * ci) * m; zi = (zr * ci + zi * cr) * m; zr = nr;
    }
    const ed = Math.exp(-sDamp / SR);
    cr *= ed; ci *= ed;
    for (; i < end; i++) {
      out[i] += zr;
      const nr = zr * cr - zi * ci; zi = zr * ci + zi * cr; zr = nr;
    }
  }

  const kn = knock(hit.force, Math.min(len, Math.round(1.5 * SR)), KNOCK_GAIN * OUT_GAIN * 1e3);
  for (let i = 0; i + 1 < len && i < kn.length; i++) out[i + 1] += kn[i];

  for (let k = 0; k < fadeN; k++) out[len - fadeN + k] *= 0.5 + 0.5 * Math.cos(Math.PI * (k + 1) / fadeN);
  return out;
}
