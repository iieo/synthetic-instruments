import { SR, rng } from '../../lib/audio.mjs';
import { OnePoleLP, OnePoleHP, Biquad, Delay, Wander, decimate } from '../trumpet/dsp.mjs';
import { NonlinearSlice } from '../trumpet/bore.mjs';
import { tuningCents } from './tuning.mjs';
import { PEDAL, slideMetres } from './slide.mjs';

const RHO = 1.2, C = 343;
const BORE_R = 0.0069;                         // slide tube radius in metres
const ZC = RHO * C / (Math.PI * BORE_R ** 2);
const LIP_W = 0.012;
const NL_BASE = 1.5;                           // cylindrical length with the slide closed
const SLICES = 8, SLICE_LEN = 12;
export const OS = 2, RS = SR * OS;
const F1 = 440 * 2 ** ((PEDAL - 69) / 12);
const BLOCK = 16;

export const tune = {
  lam: 0.88, qLip: 5, mu: 3, fRef: 262, muExp: 1.5,
  gR: 0.94, bellFc: 800, bellQ: 0.5,
  p0: 600, p0Exp: 1.2, p1: 11000, pExp: 0.2,
  kick: 1.5, over: 0.5,
  noise: 0.03,
  correct: true,
};

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// One-pole high-pass whose corner can move (it follows the pedal resonance as the slide moves).
class MovingHP {
  constructor() { this.a = 0; this.x1 = 0; this.y = 0; }
  set(fc) { this.a = Math.exp(-2 * Math.PI * fc / RS); }
  tick(x) { this.y = 0.5 * (1 + this.a) * (x - this.x1) + this.a * this.y; this.x1 = x; return this.y; }
  phase(w) {
    const a = this.a, nr = 1 - Math.cos(w), ni = Math.sin(w), dr = 1 - a * Math.cos(w), di = a * Math.sin(w);
    return Math.atan2(ni * dr - nr * di, nr * dr + ni * di);
  }
}

const biquadPhase = (f, w) => { const [re, im] = f.resp(w); return Math.atan2(im, re); };

/**
 * Core lip/bore simulation. plan.s(t): slide in semitones, plan.n(t): lip partial.
 * v0/v1: velocity at start and end of the note. Returns mono at SR, unscaled.
 */
export function play({ plan, v0, v1, duration, seed, vibrato, tongue, muteFilters = [], correct = tune.correct }) {
  const T = tune;
  const clampV = (v) => Math.max(0.05, Math.min(1, v));
  const rand = rng(seed);
  const tg = tongue;
  const release = 0.04 + 0.03 * (1 - tg), tail = 0.3;
  const total = Math.round((duration + tail) * RS);
  const noteEnd = Math.round(duration * RS);

  const bellLp = Biquad.lowpass(T.bellFc, T.bellQ, RS);
  const pedalHp = new MovingHP();
  const slices = Array.from({ length: SLICES }, () => new NonlinearSlice(SLICE_LEN, 0));
  const fwd = SLICES * SLICE_LEN;
  const ret = new Delay(Math.ceil(RS / (F1 * 2 ** (-6.6 / 12)) * 1.05) + 16);

  const wanderP = new Wander(rand, 3, RS), wanderL = new Wander(rand, 1.5, RS);
  const turbHp = new OnePoleHP(300, RS), turbLp = new OnePoleLP(3500, RS);
  const vibDepth = vibrato === undefined ? (duration > 0.8 ? 0.5 : 0) : vibrato;
  const vibRate = 5 + 0.6 * (rand() - 0.5);
  const vibDelay = Math.min(0.5, duration * 0.35);
  const outHp = new OnePoleHP(30, RS), outLp = new OnePoleLP(12000, RS);
  const out = new Float64Array(total);

  // Block-rate control values, linearly interpolated per sample.
  const ctl = (t, v) => {
    const s = plan.s(t), n = plan.n(t);
    const F = F1 * 2 ** (-s / 12);
    const f = n * F;
    const corr = correct ? tuningCents(n, s, v) : 0;
    const k = 2 ** (-corr / 1200);
    pedalHp.set(F * 0.5);
    const w = 2 * Math.PI * f / RS;
    const fd = -(biquadPhase(bellLp, w) + pedalHp.phase(w)) / w;
    const len = Math.max(fwd + 4, RS / (F * k) - fd - fwd);
    return { len, logN: Math.log(n), F: F * k, s, f };
  };

  const p0 = ctl(0, clampV(v0));
  const pressure = (v, f) => T.p0 * (f / 116.5) ** T.p0Exp + T.p1 * v ** 2.2 * (f / 116.5) ** T.pExp;
  const muOf = (f) => T.mu * (T.fRef / f) ** T.muExp;
  let logN = p0.logN, pm = 0, y = 0, yv = 0;
  const attackTc = 0.008 + 0.03 * (1 - tg);
  {
    const f = p0.f, wl = 2 * Math.PI * f * T.lam;
    y = (0.5 + (T.kick - 0.5) * tg) * pressure(clampV(v0), f) / (muOf(f) * wl * wl);
  }
  let cA = p0, cB = p0;
  const nAlpha = 1 - Math.exp(-1 / (0.012 * RS));
  for (let i = 0; i < total; i++) {
    const t = i / RS;
    const vNow = clampV(v0 + (v1 - v0) * smooth(t / duration));
    if (i % BLOCK === 0) {
      cA = cB;
      cB = ctl((i + BLOCK) / RS, vNow);
      if (i === 0) cA = ctl(0, vNow);
      const nl = NL_BASE + 2 * slideMetres(cA.s);
      const beta = nl * 1.2 / (RHO * C ** 3) * RS / SLICES;
      for (const sl of slices) sl.beta = beta;
    }
    const fr = (i % BLOCK) / BLOCK;
    const len = cA.len + (cB.len - cA.len) * fr;
    const Fn = cA.F + (cB.F - cA.F) * fr;
    logN += (cA.logN + (cB.logN - cA.logN) * fr - logN) * nAlpha;
    const f = Math.exp(logN) * Fn;

    const sounding = i < noteEnd;
    const P = pressure(vNow, f);
    const target = sounding ? P * (1 + tg * T.over * Math.exp(-t / 0.03)) : 0;
    const vib = vibDepth ? vibDepth * smooth((t - vibDelay) / 0.4) * Math.sin(2 * Math.PI * vibRate * t) : 0;
    const tc = sounding ? attackTc : release;
    pm += (target * (1 + 0.012 * wanderP.tick() + 0.04 * vib) - pm) * (1 - Math.exp(-1 / (tc * RS)));

    const pminus = ret.read(len);
    const h = y > 0 ? y : 0;
    const k = LIP_W * h * Math.sqrt(2 / RHO);
    const a = pm - 2 * pminus;
    let u = 0;
    if (k > 0) {
      const r = Math.sqrt(k * k * ZC * ZC + 4 * Math.abs(a));
      u = 2 * k * a / (k * ZC + r);
    }
    u *= 1 + T.noise * turbLp.tick(turbHp.tick(rand() * 2 - 1)) * 3;
    const p = 2 * pminus + ZC * u;
    const pplus = pminus + ZC * u;

    const wl = 2 * Math.PI * f * T.lam * (1 + 0.0015 * wanderL.tick() + 0.06 * vib);
    const mu = muOf(f);
    yv += ((pm - p) / mu - (wl / T.qLip) * yv - wl * wl * y) / RS;
    y += yv / RS;

    let s = pplus;
    for (let j = 0; j < SLICES; j++) s = slices[j].tick(s);
    const lp = bellLp.tick(s);
    ret.write(T.gR * pedalHp.tick(lp));
    let o = outLp.tick(outHp.tick(s - lp));
    for (const mf of muteFilters) o = mf.tick(o);
    out[i] = o;
  }
  return decimate(out, OS);
}
