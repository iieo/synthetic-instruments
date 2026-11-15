import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { DelayLine, OnePole, onePolePhaseDelay, DcBlock, dcBlockPhaseDelay, Wander, Resonator, breathEnvelope, fadeEdges } from './winds/dsp.mjs';

export const meta = { name: 'flute', range: [60, 96] };

// The jet's own phase lag (and its low-pass) pulls the regime flat of the bore resonance.
// Offsets measured on this model and compensated by shortening the bore.
function tuningOffsetCents(midi, mode, v) {
  if (mode === 3) return 1.3 + 0.13 * (midi - 86);
  if (mode === 2) return -8.7 - 0.9 * v + 0.11 * (midi - 76);
  return -14.1 - 0.4 * v - Math.max(0, midi - 65) * (0.55 + 0.3 * v);
}

export function render({ midi, velocity = 0.8, duration = 1, seed = 1, vibrato = true, articulation = 'tongue' }) {
  const f = midiToHz(midi);
  const v = Math.max(0.05, Math.min(1, velocity));
  // Fingered tube length: first octave on the fundamental, second octave overblown on the
  // second mode of the same tube, third octave on the third mode.
  const mode = midi >= 86 ? 3 : midi >= 74 ? 2 : 1;

  // Bore round trip (open at both ends, so the two inverting reflections cancel), with losses.
  const boreLp = new OnePole(4000 + 40 * (midi - 60));
  const boreGain = 0.92;
  const dcIn = new DcBlock(40);
  const w = 2 * Math.PI * f / SR;
  const stretch = 2 ** (tuningOffsetCents(midi, mode, v) / 1200);
  const D = mode * SR / f * stretch - onePolePhaseDelay(boreLp.p, w) - dcBlockPhaseDelay(dcIn.r, w);
  const bore = new DelayLine(Math.ceil(D) + 64);

  // Jet travel time from lip to labium as a fraction of the period. The player sets the lip
  // distance so that the wanted mode is favoured; harder blowing makes the jet faster.
  const tau0 = (mode === 3 ? 0.45 : 0.55) * SR / f;
  const jet = new DelayLine(Math.ceil(tau0 * 1.3) + 64);
  // Jet receptivity falls off at high frequency (the shear-layer waves are damped).
  const jetLp = new OnePole(3 * f), jetLp2 = new OnePole(3 * f);

  const release = 0.08, ring = 0.3;
  const n = Math.round((duration + release + ring) * SR);
  const tongued = articulation !== 'legato';
  const env = breathEnvelope(n, tongued ? 0.03 : 0.05, duration, release);
  const P0 = 0.5 + 0.5 * v;
  const jetGain = 0.4, jetSlope = 1.5, jetBias = 0.8, noiseAmt = 0.04;

  const r = rng(seed * 104729 + midi);
  const turb = new Resonator(1500 + 2 * f, 0.6);
  const breathRes = new Resonator(2600, 0.5);
  const breathAmt = 0.012;
  const wanderP = new Wander(seed * 17 + 3, 1.2), wanderT = new Wander(seed * 17 + 4, 0.5);
  const vibOn = vibrato !== false && vibrato !== 0;
  const vibDepth = typeof vibrato === 'number' ? vibrato : 1;
  const vibRate = 4.9 + 0.4 * r();
  const vibDelay = 0.25, vibRise = 0.4;
  const outDc = new DcBlock(30), outLp = new OnePole(3000), outLp2 = new OnePole(3000);
  const puffN = Math.round(0.004 * SR);
  const holdN = duration * SR;

  const y = new Float64Array(n);
  let prevOut = 0, qPrev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vibEnv = vibOn && i < holdN ? Math.min(1, Math.max(0, (t - vibDelay) / vibRise)) : 0;
    const vib = vibEnv * vibDepth * Math.sin(2 * Math.PI * vibRate * t);
    // Breath pressure: envelope, slow wander, vibrato and the short pressure kick of a tongued attack.
    const P = env[i] * P0 * (1 + 0.015 * wanderP.tick() + 0.06 * vib + (tongued ? 0.6 * Math.exp(-t / 0.04) : 0));
    const U = Math.sqrt(Math.max(P, 1e-6));
    const tau = tau0 * Math.min(1.25, Math.sqrt(P0) / Math.max(U, 1e-3)) * (1 + 0.002 * wanderT.tick());

    // Tongue release: a burst of extra turbulence (the "chiff") and a pressure puff into the bore.
    const chiff = 1 + (tongued ? 3 : 0.8) * Math.exp(-t / 0.018);
    const puff = i < puffN ? (tongued ? 3 : 0.3) * U * Math.sin(Math.PI * i / puffN) : 0;

    const nz = r() * 2 - 1;
    const turbulence = turb.tick(nz) * P * chiff;

    const e = boreGain * boreLp.tick(bore.read(D));
    const eta = jetLp2.tick(jetLp.tick(jet.read(tau)));
    // Jet deflection at the labium splits the flow; the offset puts the jet slightly off-centre,
    // which is what produces the even harmonics.
    const q = U * Math.tanh(jetSlope * (eta + noiseAmt * turbulence) + jetBias);
    // Jet drive: the injected flow acts as a pressure source, partly proportional to dq/dt.
    const drive = -jetGain * (q + 0.3 * (q - qPrev) * SR / (2 * Math.PI * f));
    qPrev = q;
    const sb = dcIn.tick(e + drive + puff);
    bore.write(sb);
    jet.write(e);
    // Radiated pressure ~ d/dt of the volume flow leaving the embouchure and the open end.
    const o = sb + 0.5 * jetGain * q;
    y[i] = outDc.tick(outLp2.tick(outLp.tick(o - prevOut))) + breathAmt * breathRes.tick(nz) * P * chiff;
    prevOut = o;
  }
  // Low notes radiate less efficiently than the differentiated model suggests (partial compensation).
  // Players also shape loudness with lip opening, which the jet model leaves out.
  // Scaled so the loudest note at velocity 1 peaks near -3 dBFS.
  const g = (262 / f) ** 0.4 * (0.45 + 0.55 * v);
  for (let i = 0; i < n; i++) y[i] *= g;
  return fadeEdges(y, 1, 30);
}
