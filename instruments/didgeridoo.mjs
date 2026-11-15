import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { decimate, seedInt, bendFn, OnePole, SVF, fadeIn, fadeOut } from './synth/dsp.mjs';
import { Mode, boreModes, vocalTract } from './didgeridoo/bore.mjs';
import { tuningCents } from './didgeridoo/tuning.mjs';

export const meta = { name: 'Didgeridoo', range: [33, 48], presets: ['drone', 'wow', 'pulse', 'toot'] };

const OS = 4, RS = SR * OS;
const RHO = 1.2, ZC = 1.2 * 343 / (Math.PI * 0.015 ** 2);
const LIP_W = 0.014;
const TOOT_LEN = 0.35, MAX_TOOTS = 64, MAX_POINTS = 256;

export const tune = {
  lam: 0.88, qLip: 4, d0: 0.0012, pRef: 1200,
  zBore: 14, zVt: 20,
  p0: 500, p1: 1700,
  lamToot: 0.9, tootBoost: 1.1, qToot: 8, tootCut: 0.7, tootLift: 0.8, reLift: 1,
  form: 1.5, formQ: 3,
  noise: 0.015, kick: 1, over: 0.6,
  correct: true,
};

const PRESETS = {
  drone: { vowel: 0.3, wow: 0, pulse: 0, breathe: 0, toot: [] },
  wow: { vowel: 0.1, wow: 1.6, pulse: 0, breathe: 0, toot: [] },
  pulse: { vowel: 0.35, wow: 0, pulse: 3, breathe: 2.8, toot: [] },
  toot: { vowel: 0.3, wow: 0, pulse: 0, breathe: 0, toot: 'auto' },
};
// One output scale for all presets and options: the loudest case found (top note, velocity 1, toots)
// peaks near -3 dBFS.
const GAIN = 1.74e-8;

const num = (name, x, lo, hi, def) => {
  if (x === undefined || x === null) return def;
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`didgeridoo: ${name} must be a finite number, got ${x}`);
  return Math.min(hi, Math.max(lo, x));
};

function vowelFn(vowel) {
  if (typeof vowel === 'number') { const v = num('vowel', vowel, 0, 1, 0); return () => v; }
  if (!Array.isArray(vowel)) throw new Error('didgeridoo: vowel must be a number 0..1 or a list of [time, value] points');
  const pts = vowel.slice(0, MAX_POINTS).map((p, i) => {
    if (!Array.isArray(p) || p.length < 2) throw new Error(`didgeridoo: vowel point ${i} must be [time, value]`);
    return [num(`vowel point ${i} time`, p[0], 0, 3600, 0), num(`vowel point ${i} value`, p[1], 0, 1, 0)];
  });
  return pts.length ? bendFn(pts) : null;
}

function tootTimes(toot, duration) {
  if (toot === 'auto') {
    const out = [];
    for (let t = 0.6; t + TOOT_LEN <= duration - 0.1; t += 1.2) out.push(t);
    return out;
  }
  const list = toot == null || toot === false ? [] : Array.isArray(toot) ? toot : [toot];
  const ts = list.slice(0, MAX_TOOTS * 4).map((t, i) => num(`toot ${i}`, t, 0, duration, 0));
  ts.sort((a, b) => a - b);
  const out = [];
  for (const t of ts) if (!out.length || t - out[out.length - 1] >= TOOT_LEN * 0.5) out.push(t);
  return out.slice(0, MAX_TOOTS);
}

const ramp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));

/**
 * midi: drone pitch, clamped to meta.range. velocity 0..1: blowing pressure.
 * vowel: 0 (dark "oo") .. 1 (bright "ee"), or breakpoints [[seconds, value], ...].
 * wow: rate in Hz (0..8) of a vowel sweep towards the opposite end of the vowel range.
 * pulse: rate in Hz (0..8) of rhythmic breath accents. breathe: circular-breathing interval in
 * seconds (0 = off, else 1..10). toot: start time or list of start times (seconds) of overblown toots.
 */
export function render({ preset = 'drone', midi = 38, velocity = 0.8, duration = 2, seed = 1, vowel, wow, pulse, breathe, toot } = {}) {
  const P = PRESETS[preset];
  if (!P) throw new Error(`didgeridoo: unknown preset ${preset}`);
  const T = tune;
  midi = num('midi', midi, meta.range[0], meta.range[1], 38);
  velocity = num('velocity', velocity, 0, 1, 0.8);
  duration = num('duration', duration, 0.05, 60, 2);
  const s32 = seedInt(num('seed', seed, -1e15, 1e15, 1));
  const wowHz = num('wow', wow, 0, 8, P.wow);
  const pulseHz = num('pulse', pulse, 0, 8, P.pulse);
  let breatheS = num('breathe', breathe, 0, 10, P.breathe);
  if (breatheS > 0) breatheS = Math.max(1, breatheS);
  const vBase = vowelFn(vowel ?? P.vowel) || vowelFn(P.vowel);
  const toots = tootTimes(toot === undefined ? P.toot : toot, duration);

  const f = midiToHz(midi);
  const rand = rng((Math.imul(s32, 2654435761) ^ (midi * 7919)) >>> 0 || 1);
  const modes = boreModes(1, rand, Infinity);
  const bore = modes.map(() => new Mode(RS));
  const vt = [0, 1, 2].map(() => new Mode(RS));
  const form = new SVF(RS);
  let corrNow = NaN;

  const vowelAt = (t) => {
    let v = Math.min(1, Math.max(0, vBase(t)));
    if (wowHz > 0) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * wowHz * t);
      v += ((v <= 0.5 ? 1 : 0) - v) * 0.85 * w;
    }
    return v;
  };
  const accent = (t) => {
    let g = 1;
    if (pulseHz > 0) {
      const ph = (t * pulseHz) % 1, beat = Math.floor(t * pulseHz);
      const bump = ph < 0.4 ? Math.sin(Math.PI * ph / 0.4) ** 2 : 0;
      g *= 0.82 + (beat % 2 ? 0.25 : 0.45) * bump;
    }
    if (breatheS > 0 && t > 0.5) {
      const ph = (t - 0.5) % breatheS;
      if (ph < 0.3) g *= 1 - 0.5 * Math.sin(Math.PI * ph / 0.3) ** 2;
      else if (ph < 0.45) g *= 1 + 0.3 * Math.sin(Math.PI * (ph - 0.3) / 0.15);
    }
    return g;
  };
  let since = 1e9;
  const tootAt = (t) => {
    let w = 0;
    since = t;
    for (const t0 of toots) {
      if (t < t0) break;
      const u = t - t0;
      if (u < TOOT_LEN) w = Math.max(w, ramp(u / 0.03) * ramp((TOOT_LEN - u) / 0.05));
      else since = u - TOOT_LEN;
    }
    return w;
  };

  const wl0 = 2 * Math.PI * f * T.lam;
  const kLip = T.pRef / T.d0;
  const total = Math.round((duration + 0.3) * RS), noteEnd = Math.round(duration * RS);
  const P0 = T.p0 + T.p1 * velocity;
  const out = new Float64Array(total);
  const lp = new OnePole(7000, RS), hp = new OnePole(25, RS);
  const nHp = new OnePole(500, RS), nLp = new OnePole(3000, RS);
  let tootPrev = -1, qLip = T.qLip;
  let y = T.kick * P0 / kLip, yv = 0, pm = 0, prev = 0, wl = wl0, tootW = 0, ratio2 = modes[1] ? modes[1].f : 2.6;
  for (let i = 0; i < total; i++) {
    const t = i / RS;
    if ((i & 31) === 0) {
      const v = vowelAt(t);
      vocalTract(v).forEach((m, k) => vt[k].set(m.f, m.q, m.z * T.zVt * ZC));
      form.set(600 + 1400 * v, T.formQ);
      tootW = tootAt(t);
      const c = T.correct ? tuningCents(midi, velocity * accent(t) + (accent(t) - 1) * T.p0 / T.p1, v) : 0;
      const back = since < 0.4 ? T.reLift * Math.exp(-since / 0.06) : 0;
      if (c !== corrNow || tootW !== tootPrev || back) {
        corrNow = c; tootPrev = tootW;
        const f1 = f * 2 ** (-c / 1200);
        modes.forEach((m, k) => bore[k].set(f1 * m.f, m.q, m.z * T.zBore * ZC * (k === 1 ? 1 + T.tootLift * tootW : (1 - T.tootCut * tootW) * (k ? 1 : 1 + back))));
      }
      wl = wl0 * (1 + (ratio2 * T.lamToot / T.lam - 1) * tootW);
      qLip = T.qLip + (T.qToot - T.qLip) * tootW;
    }
    const sounding = i < noteEnd;
    const target = sounding ? P0 * (1 + T.over * Math.exp(-since / 0.03)) * accent(t) * (1 + (T.tootBoost - 1) * tootW) : 0;
    pm += (target - pm) * (1 - Math.exp(-1 / ((sounding ? 0.015 : 0.04) * RS)));
    let hb = 0, zb = 0, hv = 0, zv = 0;
    for (const m of bore) { hb += m.hist; zb += m.b0; }
    for (const m of vt) { hv += m.hist; zv += m.b0; }
    const h = y > 0 ? y : 0;
    const k = LIP_W * h * Math.sqrt(2 / RHO);
    const Z = zb + zv, a = pm - hb - hv;
    let u = 0;
    if (k > 0) u = 2 * k * a / (k * Z + Math.sqrt(k * k * Z * Z + 4 * Math.abs(a)));
    u *= 1 + T.noise * 3 * nLp.lp(nHp.hp(rand() * 2 - 1));
    let p = 0, pv = 0;
    for (const m of bore) p += m.tick(u);
    for (const m of vt) pv += m.tick(u);
    yv += ((pm - pv - p) * (wl * wl) / kLip - (wl / qLip) * yv - wl * wl * y) / RS;
    y += yv / RS;
    const d = hp.hp((p - prev) * RS); prev = p;
    form.tick(d);
    out[i] = lp.lp(d + T.form * form.bp);
  }
  const y48 = decimate(out, OS);
  for (let i = 0; i < y48.length; i++) y48[i] *= GAIN;
  fadeIn([y48], 0.004);
  fadeOut([y48], 0.06);
  return y48;
}
