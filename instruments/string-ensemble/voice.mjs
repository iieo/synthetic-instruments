import { SR, midiToHz } from '../../lib/audio.mjs';
import { bowString } from '../strings-bowed/engine.mjs';

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const highRelief = (f) => 1 - 0.45 * smooth(Math.log2(f / 350) / 2);

// Bow stroke length in seconds. A string needs a few periods to speak, so very short notes on low
// strings are held a little longer than asked.
export function strokeSeconds(preset, dur, f) {
  const minS = Math.max(0.07, 6 / f);
  if (preset === 'staccato') return Math.max(Math.min(Math.max(dur, 0.07), 0.2), minS);
  return Math.max(dur, minS);
}

// One bowed player. p: { midi, cents, start, n, dur, vel, preset, sec, rand, vib: {rate, depth, delay},
// pressure, speed, beta, trem (tremolo bow cycles per second, two strokes each) }. Returns the
// bridge force of that player's string, length n.
export function bowedVoice(p) {
  const { midi, cents, start, n, dur, vel, preset, sec, rand } = p;
  const cfg = sec.cfg;
  const f0 = new Float64Array(n), vb = new Float64Array(n), k = new Float64Array(n), v0s = new Float64Array(n);
  const damp = new Float64Array(n);
  const fNom = midiToHz(midi);
  const ear = -4 * smooth(Math.log2(fNom / 350) / 2.5);
  const speed = (cfg.vMin + (cfg.vMax - cfg.vMin) * vel ** 1.4) * p.speed;
  const press = cfg.pressure * highRelief(fNom) * p.pressure;
  const beta = p.beta;

  const playS = strokeSeconds(preset, dur, fNom);
  const play = Math.round(playS * SR);
  let attack, accent = 0.3;
  if (preset === 'staccato') { attack = Math.max(0.018, 5 / fNom); accent = 0.6; }
  else {
    // A short note is played with a quick, accented bow start, otherwise the bow would leave the
    // string before the stick-slip motion has built up.
    attack = preset === 'tremolo' ? Math.max(0.03, 6 / fNom) : Math.max(p.attack, 12 / fNom);
    attack = Math.min(attack, Math.max(Math.max(0.018, 5 / fNom), 0.35 * playS));
    accent += 0.3 * (1 - smooth((playS - 0.15) / 0.35));
  }
  const aS = Math.max(1, Math.round(attack * SR));
  const outS = Math.min(preset === 'staccato' ? 0.02 : 0.06, 0.3 * playS);
  const lift = Math.round((preset === 'staccato' ? 0.025 : 0.05) * SR);
  const end = start + play;

  const ph0 = rand() * 2 * Math.PI, wob = rand() * 6.28;
  let ph = ph0;
  const { rate, depth, delay } = p.vib;
  const tremRate = p.trem;
  let tph = rand();
  for (let i = 0; i < n; i++) {
    const t = (i - start) / SR;
    ph += (2 * Math.PI * rate * (1 + 0.04 * Math.sin(0.9 * t + wob))) / SR;
    const vd = preset === 'legato' ? depth * smooth((t - delay) / 0.4) * smooth((end - i) / (0.08 * SR)) : preset === 'tremolo' ? 0.3 * depth : 0;
    const drift = 0.8 * Math.sin(0.27 * t + wob);
    f0[i] = midiToHz(midi + (cents + ear + drift + vd * Math.sin(ph)) / 100);
    if (i < start || i >= end + lift) continue;
    const tin = i - start;
    const envIn = smooth(tin / aS);
    let dir = 1, sp = speed;
    if (preset === 'tremolo') {
      // Alternating short strokes; the bow passes through zero speed at each change of direction.
      tph += tremRate / SR;
      const u = tph % 1;
      dir = Math.sin(2 * Math.PI * u) >= 0 ? 1 : -1;
      sp = speed * Math.min(1, Math.abs(Math.sin(2 * Math.PI * u)) * 2.2);
    }
    const envOut = smooth((end - i) / (outS * SR));
    vb[i] = dir * sp * envIn * envOut;
    v0s[i] = cfg.v0 * speed;
    const acc = 1 + accent * (1 - smooth(tin / (aS * 2)));
    const fIn = smooth(tin / Math.max(1, Math.round(aS * 0.3)));
    const fOut = smooth((end + lift - i) / lift);
    k[i] = ((press * speed) / beta) * acc * fIn * fOut;
  }
  for (let i = 0; i < n; i++) if (i < start) v0s[i] = cfg.v0 * speed;
  // After the stroke the player stops the string: the bow rests on it (staccato) or a finger lifts.
  const stop = (preset === 'staccato' ? 0.04 : 0.12) * SR;
  for (let i = end; i < n; i++) damp[i] = smooth((i - end) / stop);
  const t60 = sec.t60, tRel = preset === 'staccato' ? 0.08 : 0.3;
  const loss = (f, i) => {
    const gd = damp[i] > 0 ? 10 ** ((-3 / (tRel * f)) * damp[i]) : 1;
    return { g: 10 ** (-3 / (t60 * f)), a: cfg.hfLoss, gN: 0.9995 * gd, aN: 0.02 };
  };
  return bowString({ f0, vb, k, v0s }, {
    beta, noise: cfg.bowNoise * 1.5, rnd: rand, loss, muS: cfg.muS, muD: cfg.muD,
    torsion: cfg.torsion, torsionSpeed: cfg.torsionSpeed, torsionLoss: cfg.torsionLoss,
  });
}

// Pizzicato: the finger pulls the string aside at relative position beta and lets go. The bridge
// force of partial m is proportional to sin(m pi beta) / m (string slope times tension); the width
// of the fingertip smooths the corner, which removes the upper partials.
export function pizzVoice({ midi, cents, start, n, dur, vel, sec, rand }) {
  const y = new Float64Array(n);
  const f = midiToHz(midi + cents / 100);
  const beta = 0.24 + 0.1 * rand();
  const width = 0.03 - 0.015 * vel;
  const T1 = sec.pizzT60 * (0.85 + 0.3 * rand()) * Math.min(1.6, Math.sqrt(220 / f) + 0.3);
  const stopAt = start + Math.round(Math.max(dur, 0.12) * SR);
  const sStop = 6.91 / 0.12;
  const rampN = Math.round(0.03 * SR);
  const atk = Math.round(0.0025 * SR);
  for (let m = 1; m * f < Math.min(16000, 0.45 * SR); m++) {
    const fm = f * m * Math.sqrt(1 + 2e-5 * m * m);
    const a = (Math.sin(m * Math.PI * beta) / m) * Math.exp(-0.5 * (m * Math.PI * width) ** 2);
    if (Math.abs(a) < 1e-5) continue;
    const s = 6.91 / (T1 / (1 + (fm / 1800) ** 2));
    const w = (2 * Math.PI * fm) / SR;
    let e = a;
    const d = Math.exp(-s / SR), ph = 0.3 * rand();
    let dd = d;
    const cw = Math.cos(w), sw = Math.sin(w);
    let c = Math.cos(ph), si = Math.sin(ph);
    for (let i = start; i < n; i++) {
      const j = i - start;
      if (i >= stopAt) { const u = Math.min(1, (i - stopAt) / rampN); dd = d * Math.exp((-sStop * u) / SR); }
      const env = j < atk ? 0.5 - 0.5 * Math.cos((Math.PI * j) / atk) : 1;
      y[i] += e * env * si;
      const nc = c * cw - si * sw; si = si * cw + c * sw; c = nc;
      e *= dd;
      if (Math.abs(e) < 1e-7) break;
    }
  }
  return y;
}
