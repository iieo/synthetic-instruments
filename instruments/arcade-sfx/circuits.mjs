import { SR } from '../../lib/audio.mjs';
import { StepBus } from './blep.mjs';

export const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// Crystal-derived tone generator: a down-counter divides the clock by N and a flip-flop halves it.
export const DIV_CLK = 250000;
export const divN = (f) => Math.max(2, Math.min(65535, Math.round(DIV_CLK / (2 * f))));
export const divHz = (f) => DIV_CLK / (2 * divN(f));

/**
 * Band-limited pulse oscillator with free frequency and duty per sample (Hz, 0..1). Output
 * switches between +1 and -1 with the mean of the duty cycle removed, as after a coupling
 * capacitor; the edges are placed at their exact crossing time.
 */
export function pulse(n, freq, duty = () => 0.5, phase0 = 0) {
  const bus = new StepBus(n), dc = new Float64Array(n);
  let p = phase0 % 1, hi = p < duty(0);
  bus.step(0, hi ? 1 : -1);
  for (let i = 0; i < n; i++) {
    const dt = Math.min(0.45, Math.max(1e-9, freq(i) / SR)), d = Math.min(0.98, Math.max(0.02, duty(i)));
    let q = p + dt;
    // At most one rising and one falling edge per sample because dt < 0.5.
    if (hi && q >= d) { bus.step(i + Math.max(0, d - p) / dt, -2); hi = false; }
    if (q >= 1) {
      q -= 1;
      bus.step(i + (1 - p) / dt, hi ? 0 : 2);
      hi = true;
      if (q >= d) { bus.step(i + (1 + d - p) / dt, -2); hi = false; }
    }
    p = q;
    dc[i] = 2 * d - 1;
  }
  const y = bus.out();
  for (let i = 0; i < n; i++) y[i] -= dc[i];
  return y;
}

// A long maximal-length shift register (17 bits) clocked at a variable rate, as a +-1 signal.
export function lfsr(n, clock, state = 1) {
  const bus = new StepBus(n);
  let reg = state & 0x1ffff || 1, p = 0, v = reg & 1 ? 1 : -1;
  bus.step(0, v);
  for (let i = 0; i < n; i++) {
    const dt = Math.min(0.95, clock(i) / SR);
    p += dt;
    if (p >= 1) {
      p -= 1;
      const bit = ((reg >> 0) ^ (reg >> 3)) & 1;
      reg = (reg >> 1) | (bit << 16);
      const nv = reg & 1 ? 1 : -1;
      if (nv !== v) { bus.step(i + 1 - p / dt, nv - v); v = nv; }
    }
  }
  return bus.out();
}

// Shot noise of a reverse-biased junction: white and Gaussian.
export function whiteNoise(n, r) {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i += 2) {
    const u = Math.max(1e-12, r()), v = r(), m = Math.sqrt(-2 * Math.log(u));
    y[i] = m * Math.cos(2 * Math.PI * v);
    if (i + 1 < n) y[i + 1] = m * Math.sin(2 * Math.PI * v);
  }
  return y;
}

// One RC section with a cutoff that may move per sample.
export function rcLow(x, fc) {
  const y = new Float64Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    const a = 1 - Math.exp(-2 * Math.PI * Math.min(fc(i), 0.45 * SR) / SR);
    s += a * (x[i] - s);
    y[i] = s;
  }
  return y;
}

export function rcHigh(x, fc) {
  const a = Math.exp(-2 * Math.PI * fc / SR), y = new Float64Array(x.length);
  let x1 = 0, s = 0;
  for (let i = 0; i < x.length; i++) { s = a * (s + x[i] - x1); x1 = x[i]; y[i] = s; }
  return y;
}

/**
 * Two-pole active low-pass (one op-amp, two RCs) as a trapezoidal state-variable filter; cutoff
 * may move per sample. `mode` picks the low-pass or band-pass output.
 */
export function twoPole(x, fc, q, mode = 'lp') {
  const y = new Float64Array(x.length);
  let s1 = 0, s2 = 0;
  const k = 1 / q;
  for (let i = 0; i < x.length; i++) {
    const g = Math.tan(Math.PI * Math.min(fc(i), 0.45 * SR) / SR);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x[i] - s2, v1 = a1 * s1 + a2 * v3, v2 = s2 + a2 * s1 + a3 * v3;
    s1 = 2 * v1 - s1; s2 = 2 * v2 - s2;
    y[i] = mode === 'bp' ? v1 : v2;
  }
  return y;
}

// Capacitor envelope: charged through a small resistor (tauA), then discharged (tauD).
export const capEnv = (t, tauA, tauD) => (t <= 0 ? 0 : (1 - Math.exp(-t / tauA)) * Math.exp(-t / tauD));

// Voltage across a capacitor that a 555-style astable charges and discharges between 1/3 and 2/3
// of the supply, mapped to -1..1: a triangle with exponentially bent flanks. `u` is the phase
// 0..1, `d` the share of the period spent charging.
export function rcTriangle(u, d) {
  const v = u < d ? 1 - (2 / 3) * Math.exp(-Math.LN2 * u / d) : (2 / 3) * Math.exp(-Math.LN2 * (u - d) / (1 - d));
  return 6 * v - 3;
}
