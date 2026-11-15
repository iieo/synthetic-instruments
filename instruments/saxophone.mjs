import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { OnePoleLP, OnePoleHP, Wander, phaseDelay } from './trumpet/dsp.mjs';
import { decimate, seedInt } from './synth/dsp.mjs';
import { fadeEdges } from './winds/dsp.mjs';
import { C, PRESETS, reedFlow, solveReed, wallLoss, ConeBore, tipLength } from './saxophone/bore.mjs';
import { tuningCents } from './saxophone/tuning.mjs';

// Sounding range: low A-flat of the tenor (Ab2) up to the top A-flat of the alto (Ab5).
export const meta = { name: 'Saxophone', range: [44, 80], presets: Object.keys(PRESETS) };

const OS = 2, RS = SR * OS;

// Model constants shared by all presets (register vent, attack times, growl coupling).
export const tune = { correct: true, ventK: 2.5, ventPos: 0.8, tongue: 0.002, legato: 0.004, growlDepth: 0.3, growlLip: 0.3, growlFlow: 0.15 };

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function num(name, x, def, lo, hi) {
  if (x === undefined || x === null) return def;
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`saxophone: ${name} must be a finite number, got ${x}`);
  return clamp(x, lo, hi);
}

/**
 * midi: clamped to meta.range. velocity: 0..1, or [start, end] for a crescendo/diminuendo.
 * preset: 'alto' | 'tenor' | 'soft' (subtone) | 'growl'.
 * vibrato: undefined = preset default on notes longer than 0.6 s, 0 = off, 0..1 = depth.
 * breath: 0..1 air noise, growl: 0..1 voice into the horn (undefined = preset value).
 * articulation: 'tongue' or 'legato'.
 */
export function render({ midi = 60, velocity = 0.8, duration = 1, seed = 1, preset = 'alto', vibrato, breath, growl, articulation = 'tongue' } = {}) {
  const P = PRESETS[preset];
  if (!P || !Object.hasOwn(PRESETS, preset)) throw new Error(`saxophone: unknown preset ${preset} (use ${meta.presets.join(', ')})`);
  if (articulation !== 'tongue' && articulation !== 'legato') throw new Error(`saxophone: articulation must be 'tongue' or 'legato', got ${articulation}`);
  midi = num('midi', midi, 60, meta.range[0], meta.range[1]);
  duration = num('duration', duration, 1, 0.02, 60);
  seed = num('seed', seed, 1, -Infinity, Infinity);
  let v0, v1;
  if (Array.isArray(velocity)) {
    if (velocity.length === 0) throw new Error('saxophone: velocity array must not be empty');
    v0 = num('velocity', velocity[0], 0.8, 0, 1);
    v1 = num('velocity end', velocity[velocity.length - 1], v0, 0, 1);
  } else v0 = v1 = num('velocity', velocity, 0.8, 0, 1);
  const vib = num('vibrato', vibrato, duration > 0.6 ? P.vib : 0, 0, 1);
  const breathAmt = num('breath', breath, P.breath, 0, 1);
  const growlAmt = num('growl', growl, P.growl, 0, 1);
  const tongued = articulation === 'tongue';

  const f = midiToHz(midi);
  const mode = midi >= P.brk ? 2 : 1;
  const w = 2 * Math.PI * f / RS;

  // Complete cone of length mode * lambda / 2; the waveguide covers everything but the tip.
  const x0 = tipLength(P.x0, midi);
  const L0 = mode * C / (2 * f) - x0;
  const holes = new OnePoleLP(P.fc * 2 ** ((midi - 44) / 24), RS);
  const wl = wallLoss(L0 + x0, f / mode, P.kappa);
  const wall = new OnePoleLP(Math.min(wl.fc, 0.45 * RS), RS);
  const tau = phaseDelay([holes, wall], w);
  // Register vent on the mouthpiece side of the pressure node of the second mode: it barely loads
  // that mode but damps and detunes the first.
  const node = L0 - C / (2 * f);
  const xv = mode === 2 ? tune.ventPos * node : L0 / 2;
  const holeK = mode === 2 ? tune.ventK * Math.PI * f / RS : 0;
  const bore = new ConeBore({ L: L0, x0, xv, holeK, filters: [holes, wall], loss: wl.g, tau, rs: RS, maxScale: 2 ** (60 / 1200) });

  const release = 0.05, ring = 0.3;
  const total = Math.round((duration + release + ring) * RS);
  const noteEnd = Math.round(duration * RS);
  const atkN = Math.max(1, Math.round((tongued ? tune.tongue : tune.legato) * RS));
  const relN = Math.round(release * RS);

  const rand = rng(seedInt(seed) * 7919 + Math.round(midi * 16) + 1);
  const wanderG = new Wander(rand, 1.2, RS), wanderP = new Wander(rand, 0.6, RS), wanderV = new Wander(rand, 2, RS);
  const turbHp = new OnePoleHP(800, RS), turbLp = new OnePoleLP(4000, RS);
  const airHp = new OnePoleHP(1500, RS), airLp = new OnePoleLP(6000, RS);
  const vibRate = 5.3 + 0.5 * (rand() - 0.5);
  const vibDelay = Math.min(0.35, duration * 0.3);
  const fv = 92 + 30 * rand();
  let vPh = rand();
  const vH = Math.max(1, Math.floor(2500 / fv));
  let vNorm = 0;
  for (let h = 1; h <= vH; h++) vNorm += h ** -1.5;

  const outHp = new OnePoleHP(25, RS), outLp = new OnePoleLP(P.tone[0], RS), outLp2 = new OnePoleLP(P.tone[0], RS);
  const toneAt = (v) => P.tone[0] * (P.tone[1] / P.tone[0]) ** v;
  const out = new Float64Array(total);

  let prevVel = 0;
  for (let i = 0; i < total; i++) {
    const t = i / RS;
    const v = v0 + (v1 - v0) * smooth(t / duration);
    let env = i < atkN ? 0.5 - 0.5 * Math.cos(Math.PI * i / atkN) : 1;
    if (i >= noteEnd) env *= i - noteEnd >= relN ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (i - noteEnd) / relN);
    const vibS = vib ? vib * smooth((t - vibDelay) / 0.4) * Math.sin(2 * Math.PI * vibRate * t) : 0;

    let voice = 0;
    if (growlAmt) {
      vPh += fv * (1 + 0.01 * wanderV.tick()) / RS;
      if (vPh >= 1) vPh -= 1;
      for (let h = 1; h <= vH; h++) voice += Math.sin(2 * Math.PI * h * vPh) * h ** -1.5;
      voice /= vNorm;
    }
    const gamma0 = P.gamma[0] + (P.gamma[1] - P.gamma[0]) * v;
    const gamma = env * gamma0 * (1 + 0.01 * wanderG.tick() + tune.growlDepth * growlAmt * voice);
    const zeta = (P.zeta[0] + (P.zeta[1] - P.zeta[0]) * v) * (1 + 0.06 * vibS + tune.growlLip * growlAmt * voice);

    const corr = tune.correct ? tuningCents(preset, midi, v) : 0;
    const scale = 2 ** ((corr + 14 * vibS + 2 * wanderP.tick()) / 1200);
    const a = bore.begin(scale);
    const nz = turbLp.tick(turbHp.tick(rand() * 2 - 1));
    const u = reedFlow(solveReed(gamma, a, bore.G, zeta), zeta) * (1 + 0.15 * breathAmt * nz) + tune.growlFlow * growlAmt * voice * zeta * env;
    const p = (a + u) / bore.G;
    const vel = bore.end(p);
    const air = breathAmt * 0.02 * airLp.tick(airHp.tick(rand() * 2 - 1)) * Math.sqrt(Math.max(0, u));
    if ((i & 31) === 0) { const fcT = toneAt(v); outLp.set(fcT); outLp2.set(fcT); }
    const level = P.level[0] + (P.level[1] - P.level[0]) * v;
    out[i] = level * outLp2.tick(outLp.tick(outHp.tick(vel - prevVel + air)));
    prevVel = vel;
  }
  const y = decimate(out, OS);
  for (let i = 0; i < y.length; i++) y[i] *= P.gain;
  return fadeEdges(y, 1, 20);
}
