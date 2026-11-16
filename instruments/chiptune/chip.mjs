import { SR } from '../../lib/audio.mjs';

// Master clock of the sound chip (half the NTSC colour subcarrier) and the driver's frame rate.
export const CLK = 1789773;
export const FRAME_HZ = 60;
export const PERIOD_MAX = 4095;

// Clocks per waveform cycle per (period + 1): 8 steps every 2 clocks, 32 steps every clock,
// 32 samples every 2 clocks.
export const K = { pulse: 16, triangle: 32, wave: 64, noise: 93 };

export const DUTY = {
  12: [0, 1, 0, 0, 0, 0, 0, 0],
  25: [0, 1, 1, 0, 0, 0, 0, 0],
  50: [0, 1, 1, 1, 1, 0, 0, 0],
};

const TRIANGLE = Array.from({ length: 32 }, (_, i) => (i < 16 ? 15 - i : i - 16));
// Rounded bass wave: fundamental with a little second and third harmonic, 4-bit.
const WAVE = Array.from({ length: 32 }, (_, i) => {
  const p = 2 * Math.PI * i / 32;
  return Math.round(7.5 + 7.4 * (0.82 * Math.sin(p) + 0.22 * Math.sin(2 * p - 0.6) + 0.08 * Math.sin(3 * p)) / 1.02);
});

export const hzOf = (semis) => 440 * 2 ** ((semis - 69) / 12);

// Integer period register for a pitch: f = CLK / (k (P + 1)).
export function periodFor(semis, k) {
  return Math.min(PERIOD_MAX, Math.max(0, Math.round(CLK / (k * hzOf(semis))) - 1));
}
export const hzOfPeriod = (P, k) => CLK / (k * (P + 1));

// Band-limited step: Kaiser-windowed sinc at 20 kHz, 64 taps wide, integrated and tabulated at
// 1/1024 sample. Every jump in the chip's output is replaced by this step, so the sum is exactly
// the band-limited version of the stairstep signal.
const HALF = 32, RES = 1024, FC = 20000 / SR, BETA = 9;
function besselI0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 60; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-16 * s) break; }
  return s;
}
const STEP = (() => {
  const n = 2 * HALF * RES, h = new Float64Array(n + 1), i0 = besselI0(BETA);
  for (let i = 0; i <= n; i++) {
    const x = i / RES - HALF, u = x / HALF;
    const sinc = x === 0 ? 2 * FC : Math.sin(2 * Math.PI * FC * x) / (Math.PI * x);
    h[i] = sinc * besselI0(BETA * Math.sqrt(Math.max(0, 1 - u * u))) / i0;
  }
  const B = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) B[i] = B[i - 1] + 0.5 * (h[i - 1] + h[i]);
  for (let i = 0; i <= n; i++) B[i] /= B[n];
  return B;
})();

export const BLEP_HALF = HALF;

// Adds a band-limited step of height `d` at fractional sample time `tau`. The plain step goes into
// `steps` (summed later), the correction r(x) = B(x) - u(x) directly into `y`.
export function addStep(y, steps, tau, d) {
  const n0 = Math.ceil(tau);
  if (n0 < steps.length) steps[n0] += d;
  const lo = Math.ceil(tau - HALF), hi = Math.min(y.length - 1, Math.ceil(tau + HALF) - 1);
  for (let n = Math.max(0, lo); n <= hi; n++) {
    const x = n - tau, p = (x + HALF) * RES, i = Math.floor(p);
    if (i >= 2 * HALF * RES) continue;
    const b = STEP[i] + (STEP[i + 1] - STEP[i]) * (p - i);
    y[n] += d * (x >= 0 ? b - 1 : b);
  }
}

export class Channel {
  constructor(kind, { lfsr = 1, gain = 1 } = {}) {
    this.kind = kind;
    this.gain = gain;
    this.P = 0; this.vol = 0; this.step = 0;
    this.duty = 50; this.pendingDuty = 50;
    this.short = false; this.lfsr = lfsr;
    this.next = Infinity; this.level = 0;
    if (kind === 'triangle') this.step = 16;
    if (kind === 'wave') this.step = 24;
  }
  setDuty(d) { if (this.next === Infinity) this.duty = d; this.pendingDuty = d; }
  clocksPerStep() {
    if (this.kind === 'noise') return this.P + 1;
    return (this.P + 1) * (this.kind === 'triangle' ? 1 : 2);
  }
  value() {
    switch (this.kind) {
      case 'pulse': return DUTY[this.duty][this.step] * 15;
      case 'triangle': return TRIANGLE[this.step];
      case 'wave': return WAVE[this.step];
      default: return this.lfsr & 1 ? 0 : 15;
    }
  }
  tick() {
    if (this.kind === 'noise') {
      const fb = (this.lfsr ^ (this.lfsr >> (this.short ? 6 : 1))) & 1;
      this.lfsr = (this.lfsr >> 1) | (fb << 14);
      return;
    }
    const len = this.kind === 'pulse' ? 8 : 32;
    this.step = (this.step + 1) % len;
    // A new duty cycle takes effect only when the sequencer wraps around.
    if (this.kind === 'pulse' && this.step === 0) this.duty = this.pendingDuty;
  }
}

/**
 * Runs the chip for `halfFrames` driver ticks at 120 Hz. `driver(h, chans)` sets period, volume,
 * duty and noise mode; register writes act at once, a new period only at the next timer reload.
 * `dac` maps a channel's 0..1 level to its DAC output. Returns the band-limited output with
 * `pad` samples of silence in front.
 */
export function runChip(chans, driver, halfFrames, { dac, pad, tail }) {
  const endClk = Math.round(halfFrames * CLK / (2 * FRAME_HZ));
  const n = pad + Math.ceil(endClk * SR / CLK) + HALF + tail;
  const y = new Float64Array(n), steps = new Float64Array(n);
  const toSample = (c) => pad + c * SR / CLK;
  const emit = (ch, clk) => {
    const lv = ch.gain * dac(ch.value() * ch.vol / 225);
    if (lv !== ch.level) { addStep(y, steps, toSample(clk), lv - ch.level); ch.level = lv; }
  };
  let h = 0, frameClk = 0;
  for (;;) {
    let t = frameClk, who = null;
    for (const ch of chans) if (ch.next < t) { t = ch.next; who = ch; }
    if (t >= endClk) break;
    if (who) {
      who.tick();
      who.next += who.clocksPerStep();
      emit(who, t);
      continue;
    }
    driver(h, chans);
    for (const ch of chans) {
      if (ch.next === Infinity && ch.vol > 0) ch.next = t + ch.clocksPerStep();
      emit(ch, t);
    }
    h++;
    frameClk = Math.round(h * CLK / (2 * FRAME_HZ));
  }
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += steps[i]; y[i] += acc; }
  return y;
}
