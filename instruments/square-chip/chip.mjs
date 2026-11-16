import { SR } from '../../lib/audio.mjs';
import { StepRenderer } from './blep.mjs';

// Master clock of the chip. Tone and noise counters run at CLK / 8 (one "tick"), so every output
// change of the chip falls on that grid.
export const CLK = 1773400;
export const TICK = CLK / 8;

// 16-step logarithmic DAC, 3 dB per step, step 0 silent.
export const VOL = Float64Array.from({ length: 16 }, (_, n) => (n === 0 ? 0 : 2 ** (-(15 - n) / 2)));

export const hz = (semis) => 440 * 2 ** ((semis - 69) / 12);
// Tone: the output toggles every TP ticks, f = CLK / (16 TP).
export const tonePeriod = (f) => Math.min(4095, Math.max(1, Math.round(CLK / (16 * f))));
export const toneHz = (tp) => CLK / (16 * tp);
// Envelope: one step every 2 EP ticks; a 16-step sawtooth repeats at CLK / (256 EP), the 32-step
// triangle at CLK / (512 EP).
export const envPeriod = (f, steps) => Math.min(65535, Math.max(1, Math.round(CLK / (16 * steps * f))));
export const envHz = (ep, steps) => CLK / (16 * steps * ep);

// Envelope shapes by their 4 control bits (continue, attack, alternate, hold).
export const SHAPES = {
  decay: 0, attack: 4, 'saw-down': 8, 'tri-down': 10, 'decay-high': 11, 'saw-up': 12, 'attack-hold': 13, 'tri-up': 14,
};
export const REPEATING = ['saw-down', 'tri-down', 'saw-up', 'tri-up'];

// 17-bit shift register, feedback from bits 0 and 3 (maximal length 131071).
const lfsrStep = (r) => (r >>> 1) | (((r ^ (r >>> 3)) & 1) << 16);

export function makeRegs() {
  return {
    tp: [1, 1, 1], np: 1, tone: [false, false, false], noise: [false, false, false],
    vol: [0, 0, 0], env: [false, false, false], ep: 1, shape: null, stopAtZero: [false, false, false], envLevel: 0,
  };
}

/**
 * Runs the chip for `ticks` driver calls at `rate` Hz. `drive(k, regs)` writes the registers at
 * the start of each driver tick; setting regs.shape restarts the envelope. Returns the
 * band-limited sum of the three channel DACs at SR with `pad` samples of silence in front.
 */
export function runChip({ ticks, rate, drive, rand, pad, tail }) {
  const endT = Math.round(ticks * TICK / rate);
  const nOut = pad + Math.ceil(endT * SR / TICK) + tail;
  const out = new StepRenderer(nOut);
  const off = rand();
  const toS = (t) => pad + (t + off) * SR / TICK;
  const regs = makeRegs();

  const tc = [0, 1, 2].map(() => Math.floor(rand() * 4096));
  const tb = [0, 1, 2].map(() => (rand() < 0.5 ? 1 : 0));
  let nc = Math.floor(rand() * 62), lfsr = 1 + Math.floor(rand() * 131070), nbit = lfsr & 1;
  let ec = 0, epos = 0, eup = false, ehold = true, elev = 0, eshape = 0;

  const restartEnv = (shape) => {
    eshape = shape; ec = 0; epos = 0; ehold = false;
    eup = (shape & 4) !== 0; elev = eup ? 0 : 15;
  };
  const envStep = () => {
    if (ehold) return;
    epos++;
    if (epos < 16) { elev = eup ? epos : 15 - epos; return; }
    const cont = eshape & 8, alt = eshape & 2, hold = eshape & 1;
    if (!cont) { ehold = true; elev = 0; return; }
    if (hold) { ehold = true; elev = alt ? (eup ? 0 : 15) : (eup ? 15 : 0); return; }
    if (alt) eup = !eup;
    epos = 0; elev = eup ? 0 : 15;
  };
  const level = () => {
    let s = 0;
    for (let c = 0; c < 3; c++) {
      if (regs.env[c] && regs.stopAtZero[c] && elev === 0) { regs.env[c] = false; regs.vol[c] = 0; regs.stopAtZero[c] = false; }
      const a = regs.env[c] ? VOL[elev] : VOL[regs.vol[c]];
      if (a === 0) continue;
      const bit = (tb[c] | !regs.tone[c]) & (nbit | !regs.noise[c]);
      s += a * bit;
    }
    return s;
  };

  let cur = 0;
  for (let k = 0; k < ticks; k++) {
    let t = Math.round(k * TICK / rate);
    const tEnd = Math.round((k + 1) * TICK / rate);
    regs.shape = null; regs.envLevel = elev;
    drive(k, regs);
    if (regs.shape != null) restartEnv(regs.shape);
    let v = level();
    if (v !== cur) { out.step(toS(t), v - cur); cur = v; }
    const np2 = 2 * Math.max(1, regs.np), ep2 = 2 * Math.max(1, regs.ep);
    while (t < tEnd) {
      let dt = tEnd - t;
      // Generators that the mixer ignores still count, but they need not stop the clock.
      for (let c = 0; c < 3; c++) if (regs.tone[c]) dt = Math.min(dt, Math.max(1, regs.tp[c] - tc[c]));
      if (regs.noise[0] || regs.noise[1] || regs.noise[2]) dt = Math.min(dt, Math.max(1, np2 - nc));
      if (!ehold) dt = Math.min(dt, Math.max(1, ep2 - ec));
      t += dt;
      for (let c = 0; c < 3; c++) {
        tc[c] += dt;
        if (tc[c] >= regs.tp[c]) {
          if (regs.tone[c]) { tc[c] = 0; tb[c] ^= 1; } else { tb[c] ^= Math.floor(tc[c] / regs.tp[c]) & 1; tc[c] %= regs.tp[c]; }
        }
      }
      nc += dt;
      if (nc >= np2) {
        if (nc === np2) nc = 0; else { let m = Math.floor(nc / np2); nc %= np2; while (--m > 0) lfsr = lfsrStep(lfsr); }
        lfsr = lfsrStep(lfsr); nbit = lfsr & 1;
      }
      if (!ehold) { ec += dt; if (ec >= ep2) { ec = 0; envStep(); } }
      v = level();
      if (v !== cur) { out.step(toS(t), v - cur); cur = v; }
    }
  }
  if (cur !== 0) out.step(toS(endT), -cur);
  return out.finish();
}
