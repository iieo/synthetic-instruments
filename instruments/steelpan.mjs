import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { TAU, propagator, step, makeBank } from './steelpan/model.mjs';

export const meta = { name: 'Steel Pan', range: [60, 88] };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const cents = (c) => 2 ** (c / 1200);
const LO = meta.range[0], HI = meta.range[1];

// The pan itself is one fixed object: shell and skirt modes depend on the instrument, not the strike.
function panBody() {
  const r = rng(90210);
  const skirt = [];
  for (const f of [142, 231, 318, 447, 596]) skirt.push({ f: f * (0.97 + 0.06 * r()), t60: 0.18 + 0.25 * r(), g: 0.5 + 0.5 * r() });
  const shell = [];
  for (let i = 0; i < 18; i++) {
    const f = 700 * 1.17 ** i * (0.94 + 0.12 * r());
    shell.push({ f, t60: clamp(0.25 * (f / 1000) ** -0.7, 0.03, 0.3) * (0.7 + 0.6 * r()), g: (0.4 + 0.6 * r()) / (1 + (f / 3500) ** 2) });
  }
  // Every note area carries a small fixed tuning error, a few cents per mode.
  const tune = new Map();
  for (let m = LO - 12; m <= HI + 12; m++) tune.set(m, [r(), r(), r(), r()].map((u) => (2 * u - 1)));
  return { skirt, shell, tune };
}
const BODY = panBody();

function noteModes(midi, p) {
  const err = BODY.tune.get(midi) ?? [0, 0, 0, 0];
  const f0 = midiToHz(midi) * cents(2 * err[0]);
  // Larger (lower) note areas are tuned to 1:2:3:4; the small high notes only get fundamental and
  // octave, their next modes stay where the dome geometry puts them.
  const tuned = midi < 77;
  return [
    { f: f0, t60: 2.5 - 1.3 * p },
    { f: 2 * f0 * cents(4 * err[1]), t60: 2.0 - 1.0 * p },
    { f: (tuned ? 3 * cents(6 * err[2]) : 3.55 + 0.3 * err[2]) * f0, t60: 1.1 - 0.55 * p },
    { f: (tuned ? 4 * cents(12 * err[3]) : 4.7 + 0.3 * err[3]) * f0, t60: 0.7 - 0.4 * p },
    { f: (5.6 + 0.4 * err[2]) * f0, t60: 0.25 - 0.12 * p },
  ].filter((m) => m.f < 9000);
}

// midi defaults to 60 and is clamped to meta.range.
export function render({ midi = 60, velocity = 0.8, duration = 3, seed = 1 }) {
  for (const [k, x] of Object.entries({ midi, velocity, duration, seed })) {
    if (!Number.isFinite(x)) throw new Error(`steelpan: ${k} must be a finite number, got ${x}`);
  }
  midi = clamp(Math.round(midi), LO, HI);
  duration = Math.max(0.02, duration);
  const r = rng(((seed * 7919) ^ (midi * 104729)) >>> 0);
  const jit = (s) => 1 + s * (2 * r() - 1);
  const v = clamp(velocity, 0.02, 1);
  const p = clamp((midi - LO) / (HI - LO), 0, 1);
  const h = 1 / SR;
  const NS = 8;

  const modes = noteModes(midi, p).map((m) => ({ ...m, w: TAU * m.f, q: 0, p: 0 }));
  const w1 = modes[0].w;
  for (const m of modes) { m.P = propagator(m.w, m.t60, h); m.Ps = propagator(m.w, m.t60, h / NS); }
  // Mode shapes at the strike point; players hit slightly off centre, which changes from stroke to stroke.
  const phi = [1, 0.55 * jit(0.25), 0.35 * jit(0.35), 0.25 * jit(0.4), 0.2 * jit(0.4)];

  // The shallow, curved note dome has a quadratic restoring force. Written as a cubic potential
  // c * q_i * q_j * q_k between modes whose frequencies satisfy f_i + f_j = f_k, it pumps energy from
  // the fundamental into the octave (1+1=2), twelfth (1+2=3) and double octave (2+2=4, 1+3=4) and back.
  // The quartic term is the membrane-stretch hardening that makes hard strokes start a little sharp.
  const W2 = w1 * w1;
  const ratio = (k) => (modes[k] ? modes[k].f / modes[0].f : 0);
  const near = (k, x) => Math.abs(ratio(k) - x) < 0.1;
  const triads = [[0, 0, 1, 0.06]];
  if (near(2, 3)) triads.push([0, 1, 2, 0.05]);
  if (near(3, 4)) triads.push([1, 1, 3, 0.03], [0, 2, 3, 0.03]);
  for (const t of triads) t[3] *= W2 * jit(0.12);
  const d4 = 0.004 * W2;

  // Rubber-tipped stick, Hertz contact with Hunt-Crossley loss. Units: the struck mode has unit mass,
  // stick speed is scaled so a full stroke gives a fundamental amplitude of order 0.5.
  const mStick = 0.6;
  const V0 = (0.05 + 0.95 * v ** 1.6) * w1 * 0.8 * jit(0.04);
  const Vref = 0.6 * w1;
  const tauRef = (1.25 - 0.35 * p) * 1e-3;
  const dmax = (tauRef * Vref) / 2.94;
  const K = (5 * mStick * Vref * Vref) / (4 * dmax ** 2.5);
  const lam = 0.45 / Vref;
  let y = 0, yv = V0, contact = true;

  // Neighbouring note areas: on a fourths-and-fifths layout the octave above and below and the
  // fifth below sit next to the struck note; their modes that land on its partials ring along.
  const nbr = [];
  for (const [dm, k] of [[12, 1], [-12, 0.8], [-7, 0.5], [7, 0.35]]) {
    const nm = midi + dm;
    if (nm < LO - 12 || nm > HI + 12) continue;
    for (const m of noteModes(nm, clamp((nm - LO) / (HI - LO), 0, 1)).slice(0, 3)) nbr.push({ ...m, t60: m.t60 * 0.8, k });
  }
  const nb = makeBank(nbr, h);
  const sk = makeBank(BODY.skirt, h);
  const sh = makeBank(BODY.shell, h);

  const nRing = Math.round(duration * SR);
  const nDamp = Math.round(0.12 * SR);
  const n = nRing + nDamp;
  const out = new Float64Array(n);
  const gMode = [1, 0.7, 0.55, 0.5, 0.25];
  const nbGain = 0.0003, skGain = 0.00004 * (1 - 0.5 * p), shGain = 0.000003 * (0.3 + v);

  const M = modes.length;
  const forces = (Fc, f) => {
    for (let k = 0; k < M; k++) f[k] = phi[k] * Fc;
    for (const [i, j, k, c] of triads) {
      const qi = modes[i].q, qj = modes[j].q, qk = modes[k].q;
      f[i] -= c * qj * qk; f[j] -= c * qi * qk; f[k] -= c * qi * qj;
    }
    f[0] -= d4 * modes[0].q ** 3;
  };
  const f = new Float64Array(M);
  const surf = () => { let s = 0; for (let k = 0; k < modes.length; k++) s += phi[k] * modes[k].q; return s; };
  const surfV = () => { let s = 0; for (let k = 0; k < modes.length; k++) s += phi[k] * modes[k].p; return s; };

  let lp1 = 0, lp2 = 0, vol1 = 0, vol2 = 0;
  const beta = 0.45 * jit(0.1), gamma = 0.3;
  const accNorm = (SR * SR) / W2;
  const cLp = 1 - Math.exp((-TAU * 6500) / SR);

  for (let i = 0; i < n; i++) {
    let Fsum = 0;
    if (contact) {
      const dt = h / NS;
      for (let s = 0; s < NS; s++) {
        const d = y - surf();
        let Fc = 0;
        if (contact && d > 0) Fc = Math.max(0, K * d ** 1.5 * (1 + lam * (yv - surfV())));
        forces(Fc, f);
        for (let k = 0; k < modes.length; k++) modes[k].p += f[k] * dt;
        yv -= (Fc / mStick) * dt;
        for (const m of modes) step(m, m.Ps);
        y += yv * dt;
        Fsum += Fc / NS;
        if (contact && yv < 0 && y < surf()) contact = false;
      }
    } else {
      forces(0, f);
      for (let k = 0; k < modes.length; k++) modes[k].p += f[k] * h;
      for (const m of modes) step(m, m.P);
    }
    // A late damping touch (the player's hand) only in the final stretch after `duration`.
    if (i === nRing) {
      for (const m of modes) m.P = propagator(m.w, Math.min(m.t60, 0.05), h);
      for (const m of nb) m.P = propagator(m.w, Math.min(m.t60, 0.05), h);
    }

    const ws = surf();
    // Radiated sound follows the volume acceleration of the note area. The volume swept by a curved
    // dome is not linear in its deflection, so large strokes radiate extra harmonics.
    let u = 0;
    for (let k = 0; k < M; k++) u += gMode[k] * modes[k].q;
    const vol = u + beta * u * u + gamma * u * u * u;
    const acc = (vol - 2 * vol1 + vol2) * accNorm;
    vol2 = vol1; vol1 = vol;
    let nAcc = 0;
    for (const m of nb) { m.p += m.k * m.w * m.w * ws * h; step(m, m.P); nAcc += (m.w / w1) ** 2 * m.q; }
    let sAcc = 0;
    for (const m of sk) { m.p += (Fsum / w1 + 0.3 * ws) * m.w * h; step(m, m.P); sAcc += m.g * m.w * m.p; }
    let hAcc = 0;
    for (const m of sh) { m.p += (Fsum / w1) * m.w * h; step(m, m.P); hAcc += m.g * m.w * m.p; }

    const x = acc + nbGain * nAcc + (skGain * sAcc + shGain * hAcc) / w1;
    out[i] = lp2;
    lp1 += cLp * (x - lp1);
    lp2 += cLp * (lp1 - lp2);
  }

  const fade = Math.round(0.03 * SR);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
  for (let i = 0; i < n; i++) out[i] *= 0.12;
  return out;
}
