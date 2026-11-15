import { SR, rng, midiToHz } from '../lib/audio.mjs';
import { biquad, butter, decimate, upsample, svfBandpass, peakAbs, fadeOut } from './techno-kick/dsp.mjs';
import { bridgedT, triggerPulse, diodeClipper, diffPair, folder } from './techno-kick/circuits.mjs';
import { fdnReverb } from './techno-kick/reverb.mjs';

const OS = 8;

const PRESETS = {
  hard: {
    fEnd: 50, sweep: 4.5, tauSweep: 0.03, punch: 5, tauPunch: 0.0012, drift: 0.12, tauDrift: 0.12,
    hold: 0.55, vcaTau: 0.07, tau: 0.32, len: 0.42, release: 0.05, pulseW: 0.0006,
    click: 0.28, clickF: 3800, noise: 0.08, noiseTau: 0.003, clickIntoDrive: 0, grit: 0,
    dpGain: 2.4, dpBias: 0.3, clipV: 4, fold: null,
    lp: 11000, eq: [['peak', 280, 1.2, -3], ['peak', 95, 1.0, 2]],
  },
  industrial: {
    fEnd: 46, sweep: 5.5, tauSweep: 0.036, punch: 6, tauPunch: 0.0018, drift: 0.1, tauDrift: 0.15,
    hold: 0.5, vcaTau: 0.08, tau: 0.3, len: 0.46, release: 0.06, pulseW: 0.0009,
    click: 0.25, clickF: 2600, noise: 0.5, noiseTau: 0.025, clickIntoDrive: 0.5, grit: 0.35,
    dpGain: 4.5, dpBias: 0.6, clipV: 7, fold: null,
    lp: 8000, eq: [['peak', 2400, 0.9, 4], ['peak', 320, 1.2, -4], ['peak', 85, 1.0, 2]],
  },
  gabber: {
    fEnd: 62, sweep: 6, tauSweep: 0.05, punch: 4, tauPunch: 0.0015, drift: 0.18, tauDrift: 0.25,
    hold: 0.6, vcaTau: 0.08, tau: 0.55, len: 0.56, release: 0.06, pulseW: 0.0008,
    click: 0.15, clickF: 3000, noise: 0.1, noiseTau: 0.004, clickIntoDrive: 0.3, grit: 0,
    dpGain: 9, dpBias: 0.2, clipV: 8, fold: { G: 1.35, thr: 0.75, stages: 1 },
    lp: 6500, eq: [['peak', 190, 0.8, 3], ['peak', 600, 1.0, -3], ['peak', 3500, 1.5, 2]],
  },
  rumble: {
    fEnd: 50, sweep: 4.5, tauSweep: 0.028, punch: 5, tauPunch: 0.0012, drift: 0.04, tauDrift: 0.1,
    hold: 0.5, vcaTau: 0.06, tau: 0.24, len: 0.34, release: 0.05, pulseW: 0.0006,
    click: 0.3, clickF: 4000, noise: 0.06, noiseTau: 0.003, clickIntoDrive: 0, grit: 0,
    dpGain: 2.0, dpBias: 0.25, clipV: 3.5, fold: null,
    lp: 12000, eq: [['peak', 280, 1.2, -3]],
  },
};

export const meta = {
  name: 'Techno Kick',
  presets: Object.keys(PRESETS),
  oversampling: OS,
};

const jit = (r, x, amt) => x * (1 + amt * (2 * r() - 1));
const clamp = (x, lo, hi, d) => (x == null || !Number.isFinite(+x) ? d : Math.min(hi, Math.max(lo, +x)));
const CEIL = 0.89;

// Documented ranges; anything outside is pulled to the nearest edge.
function opts(o) {
  return {
    velocity: clamp(o.velocity, 0, 1, 0.9),
    seed: Math.round(clamp(o.seed, 0, 1e6, 1)),
    pitch: o.pitch == null ? undefined : clamp(o.pitch, 30, 120, undefined),
    decay: clamp(o.decay, 0.25, 3, 1),
    drive: clamp(o.drive, 0.25, 3, 1),
    bpm: clamp(o.bpm, 60, 200, 150),
  };
}

// One kick hit. Everything nonlinear runs at SR*OS and is decimated through a 100 dB anti-alias filter.
function kickVoice(p, { velocity, seed, pitch, decay, drive, oversample = OS }) {
  const FSO = SR * oversample;
  const r = rng(seed * 7919 + 13);
  const vel = Math.max(0.05, Math.min(1, velocity));
  const dScale = decay ?? 1, dr = drive ?? 1;
  const len = p.len * dScale, n = Math.ceil(len * SR) * oversample;
  const fEnd = jit(r, pitch ?? p.fEnd, 0.004);

  const pulse = triggerPulse(n, FSO, p.pulseW, 0.00004);
  const { y: osc } = bridgedT({
    n, fs: FSO, fEnd, sweep: p.sweep * (0.7 + 0.3 * vel), tauSweep: jit(r, p.tauSweep, 0.03),
    punch: p.punch * vel, tauPunch: p.tauPunch, drift: p.drift, tauDrift: p.tauDrift,
    tau: p.tau * dScale, excite: pulse,
  });
  const po = peakAbs(osc), body = osc.map((v) => v / po);

  // Transient: the trigger edge through the click network, plus a short noise burst (rail spike).
  const edge = biquad(pulse, 'bp', p.clickF, 0.9, 0, FSO);
  const nk = Math.exp(-1 / (p.noiseTau * FSO));
  const nz = new Float64Array(n);
  let e = 1;
  for (let i = 0; i < n; i++) { nz[i] = (2 * r() - 1) * e; e *= nk; }
  const hiss = butter(biquad(nz, 'hp', 1200, 0.7, 0, FSO), 'lp', 9000, 2, FSO);
  const click = new Float64Array(n);
  const pe = peakAbs(edge) || 1, ph = peakAbs(hiss) || 1;
  for (let i = 0; i < n; i++) click[i] = edge[i] / pe + p.noise * hiss[i] / ph;
  const pc = peakAbs(click);
  for (let i = 0; i < n; i++) click[i] *= (p.click * vel) / pc;

  // VCA after the resonator: holds, then lets the body fall out of the drive stage.
  // Grit: wideband noise riding the body amplitude, so the drive stage crackles with the kick.
  const hold = p.hold * len, kv = Math.exp(-1 / (p.vcaTau * dScale * FSO)), nh = Math.round(hold * FSO);
  let vca = 1;
  const s = new Float64Array(n);
  const gritN = p.grit ? biquad(Float64Array.from({ length: n }, () => 2 * r() - 1), 'hp', 900, 0.7, 0, FSO) : null;
  for (let i = 0; i < n; i++) {
    let v = body[i] * (0.55 + 0.45 * vel) + click[i] * p.clickIntoDrive;
    if (gritN) v += p.grit * gritN[i] * Math.abs(body[i]) ** 2;
    if (i >= nh) vca *= kv;
    s[i] = v * vca;
  }

  let d = diffPair(s, p.dpGain * dr * (0.6 + 0.4 * vel), p.dpBias);
  if (p.fold) d = folder(d, p.fold.G, p.fold.thr, p.fold.stages);
  const cv = p.clipV * dr;
  d = diodeClipper(d.map((v) => v * cv), FSO);

  let y = decimate(d, oversample);
  y = butter(y, 'hp', 28, 2);
  y = butter(y, 'lp', p.lp, 4);
  for (const [t, f, q, g] of p.eq) y = biquad(y, t, f, q, g);
  if (p.clickIntoDrive < 1) {
    const cd = decimate(click, oversample);
    const w = 0.35 * (1 - p.clickIntoDrive);
    for (let i = 0; i < y.length; i++) y[i] += w * cd[i];
  }
  const pk = peakAbs(y);
  const out = CEIL * (0.45 + 0.55 * vel);
  for (let i = 0; i < y.length; i++) y[i] *= out / pk;
  y[0] = 0;
  return fadeOut(y, p.release * dScale * SR);
}

const rootHz = (midi) => {
  let f = midiToHz(midi);
  while (f >= 80) f /= 2;
  while (f < 40) f *= 2;
  return f;
};

// Kick plus rumble: the kick bus feeds an FDN reverb, the wet signal is driven, low-passed,
// tuned with a bandpass that follows the current root, and ducked by a sidechain follower on
// the kick. `roots` holds one MIDI note per bar (cycled).
export function renderRumble(o = {}) {
  const { bpm, velocity, seed, decay, drive } = opts(o);
  const bars = Math.round(clamp(o.bars, 1, 64, 1));
  const nBeats = o.beats == null ? bars * 4 : Math.round(clamp(o.beats, 1, 256, 4));
  const roots = o.roots?.length ? o.roots.map((m) => clamp(m, 0, 127, 33)) : [33];
  const rumble = clamp(o.rumble, 0, 2, 1), kick = clamp(o.kick, 0, 2, 1), tail = clamp(o.tail, 0, 4, 0);
  const pattern = o.pattern?.length ? o.pattern : null;
  const beat = 60 / bpm;
  const total = Math.round((nBeats * beat + tail) * SR);
  const kicks = new Float64Array(total);
  const tuneHz = new Float64Array(total);
  const p = PRESETS.rumble;
  const cache = new Map();
  for (let b = 0; b < nBeats; b++) {
    const bar = Math.floor(b / 4), f = rootHz(roots[bar % roots.length]);
    const start = Math.round(b * beat * SR);
    for (let i = start; i < total; i++) tuneHz[i] = f;
    if (pattern && !pattern[b % pattern.length]) continue;
    const key = `${f}|${b % 4}`;
    if (!cache.has(key)) cache.set(key, kickVoice(p, { velocity: b % 4 === 0 ? velocity : velocity * 0.96, seed: seed + b % 4, pitch: f, decay, drive }));
    const k = cache.get(key);
    for (let i = 0; i < k.length && start + i < total; i++) kicks[start + i] += k[i];
  }

  // Send: the low body of the kick, so the reverb rings in the bass and not on the click.
  const send = butter(kicks, 'lp', 400, 2);
  const wet = fdnReverb(send, { t60: 2.6, damp: 0.55, size: 1.1 });
  let w = wet.subarray(0, total);
  const wp = peakAbs(w) || 1;
  const up = upsample(w.map((v) => (v / wp) * 3.2), 4);
  const sat = diodeClipper(diffPair(up, 1.6, 0.35).map((v) => v * 3), SR * 4);
  w = decimate(sat, 4);
  w = butter(w, 'lp', 180, 4);
  w = butter(w, 'hp', 32, 2);
  const tuned = svfBandpass(w, (i) => tuneHz[i], 4);
  const mix = new Float64Array(total);
  for (let i = 0; i < total; i++) mix[i] = 0.55 * w[i] + 1.3 * tuned[i];

  // Sidechain: peak follower on the kick, fast attack, release about a third of a beat.
  const atk = Math.exp(-1 / (0.0008 * SR)), rel = Math.exp(-1 / (0.3 * beat * SR));
  let env = 0;
  const kp = peakAbs(kicks) || 1;
  for (let i = 0; i < total; i++) {
    const a = Math.abs(kicks[i]) / kp;
    env = a > env ? atk * env + (1 - atk) * a : rel * env;
    const g = 1 - 0.92 * Math.min(1, env * 2.2);
    mix[i] *= g;
  }
  const mp = peakAbs(mix) || 1;
  const out = new Float64Array(total);
  const lvl = 0.62 * rumble * (0.45 + 0.55 * velocity);
  for (let i = 0; i < total; i++) out[i] = kick * kicks[i] + (lvl * mix[i]) / mp;
  // Overlapping kick tails plus the rumble can sum past full scale: one linear gain for the
  // whole passage keeps it under -1 dBFS (no limiter, the balance stays as set).
  const op = peakAbs(out);
  if (op > CEIL) for (let i = 0; i < total; i++) out[i] *= CEIL / op;
  out[0] = 0;
  return fadeOut(out, Math.min(0.06 * SR, total / 4));
}

export function render({ preset = 'hard', oversample, ...rest } = {}) {
  const { velocity, seed, pitch, decay, drive, bpm } = opts(rest);
  if (oversample != null) oversample = Math.round(clamp(oversample, 1, 16, OS));
  if (preset === 'rumble') return renderRumble({ bpm, beats: 1, velocity, seed, decay, drive, roots: [pitch ? 12 * Math.log2(pitch / 440) + 69 : 33] });
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset ${preset}`);
  return kickVoice(p, { velocity, seed, pitch, decay, drive, oversample });
}
