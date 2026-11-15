import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { saw, square } from './acid/osc.mjs';
import { LADDER, makeLadder, ladderTick } from './acid/ladder.mjs';
import { kaiserLowpass, decimate, dcBlock } from './acid/dsp.mjs';
import { seedInt } from './synth/dsp.mjs';

export const meta = { name: 'Acid Bass', range: [24, 72] };

const OS = 4;
const FSO = SR * OS;
const DECIM = kaiserLowpass(255, 21000 / FSO, 9);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pole = (tau) => 1 - Math.exp(-1 / (tau * SR));

const DEFAULTS = {
  waveform: 'saw', cutoff: 0.3, resonance: 0.75, envMod: 0.6, decay: 0.35, accentAmount: 0.75,
  drive: 0, gateLength: 0.55, slideTime: 0.06, level: 0.4,
};

// A parameter is a number, a function of time in seconds, or an array of per-step values
// (linearly interpolated between step starts).
function automation(v, stepSec) {
  if (typeof v === 'function') return v;
  if (Array.isArray(v)) {
    const last = v.length - 1;
    return (t) => {
      const x = clamp(t / stepSec, 0, last), i = Math.min(Math.floor(x), Math.max(0, last - 1));
      return last === 0 ? v[0] : v[i] + (v[i + 1] - v[i]) * (x - i);
    };
  }
  return () => v;
}

// Cutoff knob 0..1 maps exponentially to 40 Hz..5.1 kHz; values above 1 are taken as Hz.
const cutoffHz = (c) => (c > 1 ? c : 40 * 2 ** (7 * clamp(c, 0, 1)));

// Diode clipper: series resistor into a capacitor shunted by an antiparallel diode pair,
//   C v' = (x - v) / R - 2 Is sinh(v / (n Vt)),  normalised, trapezoidal, solved by Newton.
function makeClipper(fc) {
  const g = Math.tan(Math.PI * fc / FSO), beta = 0.004, nu = 0.12;
  let s = 0, v = 0;
  return (x) => {
    for (let it = 0; it < 40; it++) {
      const sh = Math.sinh(v / nu);
      const F = v - s - g * (x - v - beta * sh);
      // Newton on an exponential overshoots from far away; limit the step to a few thermal voltages.
      const dv = clamp(-F / (1 + g * (1 + (beta / nu) * Math.cosh(v / nu))), -2 * nu, 2 * nu);
      v += dv;
      if (Math.abs(dv) < 1e-11) break;
    }
    s = v + g * (x - v - beta * Math.sinh(v / nu));
    return v;
  };
}

function renderCore(events, nSamples, opts, stepSec) {
  const o = { ...DEFAULTS, ...opts };
  const P = {};
  for (const key of ['cutoff', 'resonance', 'envMod', 'decay', 'accentAmount', 'drive']) {
    P[key] = automation(o[key], stepSec);
  }
  const r = rng((seedInt(o.seed ?? 1) * 2654435761) >>> 0);
  const osc = o.waveform === 'square' ? square : saw;

  // Slow analog drift of the expo converter: a few incommensurate slow sines, about +-3 cents.
  const drift = [0, 1, 2].map(() => ({ f: 0.04 + 0.35 * r(), p: 2 * Math.PI * r(), a: 1.1 / 1200 }));
  const cutDrift = { f: 0.03 + 0.1 * r(), p: 2 * Math.PI * r() };

  const out = new Float64Array(nSamples * OS);
  const lad = makeLadder();
  const clipper = makeClipper(6500);
  const aGlide = pole(o.slideTime / 3);
  const aAtt = pole(0.0015), aRel = pole(0.005), aSus = pole(4), aEnvAtt = pole(0.0007);
  const aCapUp = pole(0.03), aCapDown = pole(0.25);

  let ev = 0, phase = r(), cv = events.length ? events[0].midi : 48, target = cv;
  let gate = false, amp = 0, sus = 1, fEnv = 0, fAttack = false, fTau = 0.1;
  let acc = 0, accAttack = false, accCap = 0, accOn = false, noteGain = 1;
  let prevLogFc = null, prevAmp = 0;

  for (let n = 0; n < nSamples; n++) {
    while (ev < events.length && events[ev].n <= n) {
      const e = events[ev++];
      if (e.type === 'off') { gate = false; continue; }
      target = e.midi;
      if (e.type === 'slide') continue;
      cv = target; gate = true; sus = 1; fAttack = true;
      noteGain = e.gain ?? 1;
      accOn = !!e.accent;
      if (accOn) accAttack = true;
      const decayT = accOn ? 0.2 : 0.2 * 10 ** clamp(P.decay(n / SR), 0, 1);
      fTau = decayT / Math.log(10);
    }
    const t = n / SR;
    const res = clamp(P.resonance(t), 0, 1);
    const accAmt = clamp(P.accentAmount(t), 0, 1);
    const drv = clamp(P.drive(t), 0, 1);

    cv += (target - cv) * aGlide;
    if (gate) { amp += (1 - amp) * aAtt; sus -= sus * aSus; } else amp -= amp * aRel;
    if (fAttack) { fEnv += (1.02 - fEnv) * aEnvAtt; if (fEnv >= 1) { fEnv = 1; fAttack = false; } }
    else fEnv -= fEnv * pole(fTau);
    if (accAttack) { acc += (1.02 - acc) * aEnvAtt; if (acc >= 1) { acc = 1; accAttack = false; } }
    else acc -= acc * pole(0.2 / Math.log(10));
    // Accent sweep capacitor: charged through a diode, discharged slowly, so it climbs over consecutive accents.
    accCap += (acc - accCap) * (acc > accCap ? aCapUp : aCapDown);

    let dc = 0;
    for (const d of drift) dc += d.a * Math.sin(2 * Math.PI * d.f * t + d.p);
    const f0 = midiToHz(cv) * 2 ** dc;
    const dt = f0 / FSO;

    const accOct = accAmt * 3 * ((1 - 0.7 * res) * acc + res * 1.5 * accCap);
    const logFc = clamp(Math.log2(cutoffHz(P.cutoff(t))) + 5 * clamp(P.envMod(t), 0, 1) * fEnv + accOct
      + 0.03 * Math.sin(2 * Math.PI * cutDrift.f * t + cutDrift.p), Math.log2(20), Math.log2(20000));
    const ampNow = amp * (0.35 + 0.65 * sus) * (1 + accAmt * 1.2 * acc) * noteGain;
    if (prevLogFc === null) prevLogFc = logFc;
    if (o.probe) o.probe(n, 2 ** logFc, ampNow);

    const k = LADDER.kCrit * 1.04 * res;
    const makeup = 1 + 0.35 * k;
    const pre = 1.6 * 10 ** (1.7 * drv);
    for (let j = 0; j < OS; j++) {
      const w = (j + 1) / OS;
      const fc = 2 ** (prevLogFc + (logFc - prevLogFc) * w);
      const g = Math.tan(Math.PI * Math.min(fc / LADDER.wRes, 0.45 * FSO) / FSO);
      const x = 0.8 * osc(phase, dt);
      phase += dt; if (phase >= 1) phase -= 1;
      let y = ladderTick(lad, x, g, k) * makeup * (prevAmp + (ampNow - prevAmp) * w);
      if (drv > 0) {
        const c = clipper(pre * y + 0.15);
        y = y * (1 - Math.min(1, drv * 4)) + c * Math.min(1, drv * 4) * 0.9;
      }
      out[n * OS + j] = y * o.level;
    }
    prevLogFc = logFc; prevAmp = ampNow;
  }
  const y = dcBlock(decimate(out, OS, DECIM), SR, 12);
  // The linear-phase decimator rings slightly past both ends; 1 ms raised-cosine edges pin them to zero.
  const nE = Math.min(Math.round(0.001 * SR), y.length >> 1);
  for (let i = 0; i < nE; i++) { const w = 0.5 - 0.5 * Math.cos(Math.PI * i / nE); y[i] *= w; y[y.length - 1 - i] *= w; }
  return y;
}

export function renderSequence({ steps, bpm = 140, tail = 0.4, ...opts }) {
  const stepSec = 60 / bpm / 4;
  const at = (i) => Math.round(i * stepSec * SR);
  const gateLen = opts.gateLength ?? DEFAULTS.gateLength;
  const on = (s) => !!(s && s.gate !== false && s.midi != null);
  const events = [];
  steps.forEach((s, i) => {
    if (!on(s)) return;
    const slideIn = i > 0 && on(steps[i - 1]) && steps[i - 1].slide;
    events.push({ n: at(i), type: slideIn ? 'slide' : 'trig', midi: s.midi, accent: !!s.accent });
    const holds = s.slide && i + 1 < steps.length && on(steps[i + 1]);
    if (!holds) events.push({ n: s.slide ? at(i + 1) : at(i) + Math.round(gateLen * stepSec * SR), type: 'off' });
  });
  events.sort((a, b) => a.n - b.n || (a.type === 'off' ? -1 : 1));
  return renderCore(events, at(steps.length) + Math.round(tail * SR), opts, stepSec);
}

export function render({ midi, velocity = 0.8, duration = 0.5, seed = 1, ...opts }) {
  const off = Math.max(1, Math.round(duration * SR));
  const events = [
    { n: 0, type: 'trig', midi, accent: velocity >= 0.85, gain: 0.4 + 0.6 * clamp(velocity, 0, 1) },
    { n: off, type: 'off' },
  ];
  return renderCore(events, off + Math.round(0.25 * SR), { seed, ...opts }, Math.max(duration, 1e-3));
}
