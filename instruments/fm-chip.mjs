import { midiToHz, rng } from '../lib/audio.mjs';
import { clamp, dcBlock, fadeIn, fadeOut, ceilPeak, noteSeed } from './synth/dsp.mjs';
import { FS, MULT2, WAVES, opOut, envInc, fnumFor, dac, resample } from './fm-chip/chip.mjs';
import { PRESETS } from './fm-chip/presets.mjs';

export const meta = { name: 'FM-Soundkarte', range: [24, 96], presets: Object.keys(PRESETS), waveforms: WAVES };

// Fixed output gain per preset: the loudest note of the sweep over range, options, velocities and
// seeds peaks near -2 dBFS.
const GAIN = {
  piano: 0.658, organ: 0.434, brass: 0.449, bass: 0.562, strings: 0.31, bell: 0.637, guitar: 0.555,
  'drum-kick': 0.531, 'drum-snare': 0.607, 'drum-hat': 0.598,
};

const ATTACK = 0, DECAY = 1, SUSTAIN = 2, RELEASE = 3;
const VIB_STEPS = [0, 1, 2, 1, 0, -1, -2, -1];
const TREM_PERIOD = 13440, PAD = 24, TIMER_HZ = 70;
// An operator is silent once its attenuation reaches 384 steps (72 dB); tremolo can lift it by 26.
const SILENT = 410;

function num(name, v, def, lo, hi) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`fm-chip: ${name} must be a finite number, got ${v}`);
  return clamp(v, lo, hi);
}

class Op {
  constructor(p, block, fnum, hz) {
    this.p = p; this.acc = 0; this.att = 511; this.stage = ATTACK;
    this.setPitch(block, fnum);
    const oct = Math.max(0, Math.log2(hz / 65.4));
    this.ksl = Math.round([0, 1.5, 3, 6][p.ksl] * oct / 0.1875);
    this.tl = p.tl * 4;
    this.slAtt = p.sl === 15 ? 496 : p.sl * 16;
  }
  setPitch(block, fnum) {
    this.block = block; this.fnum = fnum;
    const kc = (block << 1) | (fnum >> 9), off = this.p.ksr ? kc : kc >> 2;
    const r = (R) => (R === 0 ? 0 : Math.min(63, 4 * R + off));
    this.rates = [r(this.p.ar), r(this.p.dr), r(this.p.rr)];
  }
  env(cnt, keyOn) {
    if (!keyOn && this.stage !== RELEASE) this.stage = RELEASE;
    const [ar, dr, rr] = this.rates;
    switch (this.stage) {
      case ATTACK: {
        if (ar >= 60) this.att = 0;
        else {
          const inc = envInc(ar, cnt);
          if (inc) this.att -= ((this.att * inc) >> 3) + inc;
        }
        if (this.att <= 0) { this.att = 0; this.stage = DECAY; }
        break;
      }
      case DECAY:
        this.att += envInc(dr, cnt);
        if (this.att >= this.slAtt) { this.att = this.slAtt; this.stage = SUSTAIN; }
        break;
      case SUSTAIN:
        if (!this.p.sus) this.att = Math.min(511, this.att + envInc(rr, cnt));
        break;
      default:
        this.att = Math.min(511, this.att + envInc(rr, cnt));
    }
  }
  // Phase step per chip sample: the F-number shifted by the block, times the multiplier.
  step(fnum) { this.acc = (this.acc + ((fnum * MULT2[this.p.mult] << this.block) >> 1)) & 0xfffff; }
}

/**
 * One note on the modelled two-operator FM chip. `brightness` (0..1, default 0.5) moves the
 * modulator's total level by +-9 dB, `waveform` replaces the carrier's waveform with one of
 * sine, half, abs, quarter. Drums use midi as their tuning and ignore `duration`.
 */
export function render({ midi = 60, velocity = 0.8, duration = 0.5, seed = 1, preset = 'piano', brightness = 0.5, waveform } = {}) {
  if (preset == null) preset = 'piano';
  const P = PRESETS[preset];
  if (!P) throw new Error(`fm-chip: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  if (waveform != null && !WAVES.includes(waveform)) throw new Error(`fm-chip: waveform must be one of ${WAVES.join(', ')}, got ${waveform}`);
  midi = Math.round(num('midi', midi, 60, ...meta.range));
  const vel = num('velocity', velocity, 0.8, 0, 1);
  const dur = num('duration', duration, 0.5, 0.01, 30);
  num('seed', seed, 1, -Infinity, Infinity);
  const bright = num('brightness', brightness, 0.5, 0, 1);

  const rand = rng(noteSeed(seed, [midi], `fm-chip-${preset}`));
  const hz = midiToHz(midi + (P.shift || 0));
  const { block, fnum } = fnumFor(hz);
  const velTl = Math.round((1 - vel) * 20);
  const carP = { ...P.car, tl: Math.min(63, P.car.tl + velTl), ws: waveform != null ? WAVES.indexOf(waveform) : P.car.ws };
  const modP = P.mod && { ...P.mod, tl: clamp(P.mod.tl + Math.round((1 - vel) * 8) + Math.round((0.5 - bright) * 24), 0, 63) };

  const chans = [{ block, fnum }];
  if (P.layer) chans.push({ block, fnum: Math.min(1023, fnum + P.layer) });
  const voices = chans.map((c) => ({ car: new Op(carP, c.block, c.fnum, hz), mod: modP && new Op(modP, c.block, c.fnum, hz), fnum: c.fnum, m1: 0, m2: 0 }));
  // Rhythm phase sources: two free-running phase generators and the noise register.
  const tone2 = fnumFor(hz * 1.47);
  const aux = new Op(P.car, tone2.block, tone2.fnum, hz);
  let lfsr = 1 + Math.floor(rand() * 0x7ffffe);

  // The chip's global counters run all the time, so the LFO phases at key-on are arbitrary.
  let cnt = Math.floor(rand() * 65536);
  let vibCnt = Math.floor(rand() * 8192), tremCnt = Math.floor(rand() * TREM_PERIOD);
  const deep = P.deepVib ? 7 : 8;
  const fb = P.fb ? 8 - P.fb : 0;
  const off = PAD + Math.round((P.oneShot ?? dur) * FS);
  const maxN = off + Math.round(30 * FS);
  const timer = Math.round(FS / TIMER_HZ);
  const x = [];
  for (let i = 0; i < PAD; i++) x.push(0);
  for (let i = PAD; i < maxN; i++) {
    const keyOn = i < off;
    cnt = (cnt + 1) & 0xffff;
    vibCnt = (vibCnt + 1) & 8191;
    tremCnt = tremCnt + 1 === TREM_PERIOD ? 0 : tremCnt + 1;
    const tp = tremCnt < TREM_PERIOD / 2 ? tremCnt : TREM_PERIOD - tremCnt;
    let trem = Math.floor(tp * 26 / (TREM_PERIOD / 2));
    if (!P.deepTrem) trem >>= 2;
    if (P.rhythm === 'kick' && (i - PAD) % timer === 0) {
      const k = (i - PAD) / timer, f = fnumFor(hz * (1 + 2.2 * 0.55 ** k));
      for (const v of voices) { v.car.setPitch(f.block, f.fnum); v.mod.setPitch(f.block, f.fnum); v.fnum = f.fnum; }
    }
    const nb = ((lfsr >> 22) ^ (lfsr >> 4)) & 1;
    lfsr = ((lfsr << 1) | nb) & 0x7fffff;

    let sum = 0, live = false;
    for (const v of voices) {
      const { car, mod } = v;
      const vstep = VIB_STEPS[vibCnt >> 10] * (v.fnum >> deep);
      car.env(cnt, keyOn);
      const ca = Math.min(511, car.att + car.tl + car.ksl + (car.p.am ? trem : 0));
      if (car.att + car.tl + car.ksl < SILENT || car.stage === ATTACK) live = true;
      let out;
      if (P.rhythm === 'snare' || P.rhythm === 'hat') {
        car.step(v.fnum); aux.step(tone2.fnum);
        const p1 = car.acc >> 10, p2 = aux.acc >> 10;
        let ph;
        if (P.rhythm === 'snare') ph = ((p1 & 256) ? 0x200 : 0x100) ^ (nb << 8);
        else ph = ((((p1 >> 7) ^ (p1 >> 2)) | ((p2 >> 5) ^ (p2 >> 3))) & 1 ? 0x200 : 0) | (nb ? 0xd0 : 0x30);
        out = opOut(ph, ca, car.p.ws);
      } else {
        mod.env(cnt, keyOn);
        const ma = Math.min(511, mod.att + mod.tl + mod.ksl + (mod.p.am ? trem : 0));
        const fbIn = fb ? (v.m1 + v.m2) >> fb : 0;
        const m = opOut((mod.acc >> 10) + fbIn, ma, mod.p.ws);
        v.m2 = v.m1; v.m1 = m;
        if (P.add) {
          out = m + opOut(car.acc >> 10, ca, car.p.ws);
          if (mod.att + mod.tl + mod.ksl < SILENT || mod.stage === ATTACK) live = true;
        } else out = opOut((car.acc >> 10) + m, ca, car.p.ws);
        const fv = (mod.p.vib ? vstep : 0) + v.fnum, fc = (car.p.vib ? vstep : 0) + v.fnum;
        mod.step(fv); car.step(fc);
      }
      sum += out;
    }
    x.push(dac(sum * 4) / 8192);
    if (!keyOn && !live) break;
  }
  for (let i = 0; i < 2 * PAD; i++) x.push(0);

  const y = resample(x);
  dcBlock(y, 20);
  const g = GAIN[preset];
  for (let i = 0; i < y.length; i++) y[i] *= g;
  fadeIn([y], 0.0004);
  fadeOut([y], 0.004);
  ceilPeak([y], -1);
  return y;
}
