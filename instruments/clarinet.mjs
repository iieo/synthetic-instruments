import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { DelayLine, OnePole, onePolePhaseDelay, DcBlock, Wander, Resonator, breathEnvelope, fadeEdges } from './winds/dsp.mjs';

// Sounding pitch of a B-flat clarinet: low D3 up to about F6.
export const meta = { name: 'clarinet', range: [50, 89] };

const CLARION = 69; // first note played on the twelfth (register key open)

// Quasi-static reed flow in dimensionless units (pressure / reed closing pressure).
// dp = mouth pressure minus bore pressure; the reed closes completely at dp >= 1.
function reedFlow(dp, zeta) {
  if (dp >= 1) return 0;
  if (dp >= 0) return zeta * (1 - dp) * Math.sqrt(dp);
  return -zeta * (1 - dp) * Math.sqrt(-dp);
}

// Solve u = F(gamma - 2 p_minus - u) for the volume flow u (characteristic impedance = 1).
// u - F(a - u) is strictly increasing for zeta < 1, so bisection is safe.
function solveReed(a, zeta) {
  let lo, hi;
  if (a < 0) { lo = a; hi = 0; } else if (a < 1) { lo = 0; hi = zeta; } else return 0;
  for (let i = 0; i < 26; i++) {
    const u = 0.5 * (lo + hi);
    if (u - reedFlow(a - u, zeta) > 0) hi = u; else lo = u;
  }
  return 0.5 * (lo + hi);
}

// The nonlinear regime plays slightly sharp of the linear bore resonance (inharmonic resonances
// pull the harmonics, more so at high blowing pressure). Offsets measured on this model.
function tuningOffsetCents(midi, mode, v) {
  if (mode === 3) return 18 + 8.5 * v;
  return 2.8 + 3.5 * v + (midi - 50) * (0.06 + 0.3 * v);
}

export function render({ midi, velocity = 0.8, duration = 1, seed = 1, vibrato = 0, articulation = 'tongue' }) {
  const f = midiToHz(midi);
  const v = Math.max(0.05, Math.min(1, velocity));
  const mode = midi >= CLARION ? 3 : 1;

  // Open-end reflection: low-pass for radiation and the tone-hole lattice cutoff (about 1.5 kHz).
  const latticeFc = 1500 + 20 * (midi - 50);
  const endLp = new OnePole(latticeFc);
  const wallLoss = 0.985 - 0.0015 * mode;

  const w = 2 * Math.PI * f / SR;
  const stretch = 2 ** (tuningOffsetCents(midi, mode, v) / 1200);
  const loop = mode * SR / (2 * f) * stretch - onePolePhaseDelay(endLp.p, w);
  const oneWay = loop / 2;
  const d1 = mode === 1 ? oneWay / 2 : 0.9 * SR / (4 * f) * stretch;
  const d2 = oneWay - d1;

  const A_f = new DelayLine(Math.ceil(d1) + 4), A_b = new DelayLine(Math.ceil(d1) + 4);
  const B_f = new DelayLine(Math.ceil(d2) + 64), B_b = new DelayLine(Math.ceil(d2) + 64);

  // Register hole: an inertive shunt (air mass in the chimney), admittance ~ 1/(j w m). It sits close
  // to the first pressure node of the twelfth, so it barely loads that mode but strongly damps and
  // detunes the lowest resonance of the long bore.
  const holeK = mode === 1 ? 0 : 6 * (2 * Math.PI * f / mode) / SR;
  let uh = 0;

  const release = 0.06;
  const ring = 0.35;
  const n = Math.round((duration + release + ring) * SR);
  const tongued = articulation !== 'legato';
  const env = breathEnvelope(n, tongued ? 0.02 : 0.045, duration, release);

  const gamma0 = 0.40 + 0.26 * v;
  const zeta0 = 0.28 + 0.08 * v;
  const tongueN = Math.round(0.012 * SR);

  const r = rng(seed * 7919 + midi);
  const breathNoise = new OnePole(3000);
  const turb = new Resonator(2200, 0.7);
  const wanderG = new Wander(seed * 31 + 1, 0.8), wanderP = new Wander(seed * 31 + 2, 0.4);
  const vibDepth = vibrato ? (typeof vibrato === 'number' ? vibrato : 0.4) : 0;
  const outLp = new OnePole(4500), outLp2 = new OnePole(4500), dc = new DcBlock(30);

  const y = new Float64Array(n);
  let prevVel = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const nz = r() * 2 - 1;
    const bn = breathNoise.tick(nz);
    const vib = vibDepth ? Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.4) : 0;
    const gamma = env[i] * gamma0 * (1 + 0.012 * wanderG.tick() + 0.03 * bn + 0.02 * vib * vibDepth);
    const zeta = zeta0 * (tongued ? Math.min(1, i / tongueN) ** 1.5 : 1);
    const pitch = 1 + 0.0007 * wanderP.tick() + 0.0012 * vib * vibDepth;

    const pm = A_b.read(d1);
    const a1 = A_f.read(d1), a2 = B_b.read(d2 / pitch);
    const x = B_f.read(d2 / pitch);
    const u = solveReed(gamma - 2 * pm, zeta) * (1 + 0.04 * turb.tick(nz) * Math.min(1, gamma * 2));
    const pp = pm + u;
    A_f.write(pp);

    const pj = (a1 + a2 - 0.5 * uh) / (1 + 0.5 * holeK);
    uh = 0.9995 * uh + holeK * pj;
    A_b.write(pj - a1);
    B_f.write(pj - a2);

    const refl = -wallLoss * endLp.tick(x);
    B_b.write(refl);
    // Radiated pressure ~ d/dt of the volume flow leaving the bore (arriving minus reflected wave).
    const vel = x - refl;
    y[i] = dc.tick(outLp2.tick(outLp.tick(vel - prevVel)));
    prevVel = vel;
  }
  // Radiated level also follows embouchure and reed opening beyond what the reed model captures.
  const g = 2.5 * (0.35 + 0.65 * v);
  for (let i = 0; i < n; i++) y[i] *= g;
  return fadeEdges(y, 1, 30);
}
