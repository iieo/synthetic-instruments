// Software tone routines for a 1-bit speaker port. Each engine calls out(T, bit) with the CPU time
// T in clock cycles (T-states) at which the routine writes the port, and returns the end time.

export const CPU = 3500000;
// Countdown tone loop: half period = A + B * N cycles for the inner count N.
export const LOOP_A = 74, LOOP_B = 26;
// Piezo games: a 4-bit controller toggles the pin from a 32768 Hz timer.
export const PIEZO_CLK = 32768;
// Multiplexing engines: one pass of the main loop per channel slot.
export const SLOT = { chord: 84, pin: 64 };

export const hz = (semis) => 440 * 2 ** ((semis - 69) / 12);

export const loopCount = (f) => Math.min(65535, Math.max(1, Math.round((CPU / (2 * f) - LOOP_A) / LOOP_B)));
export const loopHz = (n) => CPU / (2 * (LOOP_A + LOOP_B * n));
export const piezoCount = (f) => Math.max(1, Math.round(PIEZO_CLK / (2 * f)));
export const piezoHz = (n) => PIEZO_CLK / (2 * n);
// 16-bit phase accumulator advanced once per main loop of `cycles` T-states.
export const accInc = (f, cycles) => Math.min(32767, Math.max(1, Math.round(65536 * f * cycles / CPU)));
export const accHz = (inc, cycles) => inc * CPU / (65536 * cycles);

export function square(n, out) {
  const N = loopCount(hz(n.midi)), H = LOOP_A + LOOP_B * N, end = n.dur * CPU;
  let T = 0, bit = 1;
  while (T < end || bit === 0) { out(T, bit); T += H; bit ^= 1; }
  out(T, 0);
  return T;
}

// Two delay loops per period. The high count follows duty(t); the period N_high + N_low stays at
// 2N, so the pitch holds while the width moves.
export function pwm(n, out) {
  const N = loopCount(hz(n.midi)), end = n.dur * CPU, total = 2 * N + 2 * LOOP_A / LOOP_B;
  let T = 0;
  while (T < end) {
    const d = n.duty(T / CPU);
    const nh = Math.min(2 * N, Math.max(0, Math.round(d * total - LOOP_A / LOOP_B)));
    out(T, 1); T += LOOP_A + LOOP_B * nh;
    out(T, 0); T += LOOP_A + LOOP_B * (2 * N - nh);
  }
  out(T, 0);
  return T;
}

// Time multiplexing: per pass of the main loop each channel adds its step to a 16-bit accumulator
// and owns the speaker for its slot, showing the accumulator's top bit.
export function chord(n, out) {
  const K = n.notes.length, L = SLOT.chord * K, end = n.dur * CPU;
  const inc = n.notes.map((m) => accInc(hz(m), L)), acc = n.notes.map(() => Math.floor(n.rand() * 65536));
  let T = 0;
  while (T < end) {
    for (let k = 0; k < K; k++) {
      acc[k] = (acc[k] + inc[k]) & 0xffff;
      out(T + k * SLOT.chord, acc[k] >> 15);
    }
    T += L;
  }
  out(T, 0);
  return T;
}

// Pulse interleaving: a channel whose accumulator overflows fires one short pulse inside its own
// slot. Pulses never overlap, the speaker sums them in time. Pulse width is the channel volume
// and shrinks over the note.
export function pin(n, out) {
  const K = n.notes.length, L = SLOT.pin * K, end = n.dur * CPU;
  const inc = n.notes.map((m) => accInc(hz(m), L)), acc = n.notes.map(() => Math.floor(n.rand() * 65536));
  let T = 0;
  while (T < end) {
    const w = Math.round(n.width(T / CPU));
    for (let k = 0; k < K; k++) {
      const s = acc[k] + inc[k];
      acc[k] = s & 0xffff;
      if (s > 0xffff && w > 0) { const t = T + k * SLOT.pin + 8; out(t, 1); out(t + w, 0); }
    }
    T += L;
  }
  out(T, 0);
  return T;
}

// Pitch-sweeping click: every half period the delay count grows by a fixed amount.
export function kick(n, out) {
  const s = 2 ** (n.shift / 12);
  const n0 = loopCount(900 * s), n1 = loopCount(45 * s), halves = 15, dn = (n1 - n0) / halves;
  let T = 0;
  for (let i = 0; i < halves; i++) { out(T, (i & 1) ^ 1); T += LOOP_A + LOOP_B * Math.round(n0 + dn * i); }
  out(T, 0);
  return T;
}

// 1-bit noise: per loop pass the next bit of a 16-bit shift register; a set bit drives the
// speaker high for w(t) cycles, so the pulses thin out as the hit decays.
export function noise(n, out) {
  const L = Math.round(120 * 2 ** (-n.shift / 12)), tau = n.decay * CPU;
  let r = 1 + Math.floor(n.rand() * 65535), T = 0;
  for (;;) {
    const w = Math.round(L * Math.exp(-T / tau));
    if (w < 3) break;
    r = (r >>> 1) ^ (-(r & 1) & 0xb400);
    if (r & 1) { out(T, 1); out(T + w, 0); }
    T += L;
  }
  out(T, 0);
  return T;
}

export function piezo(n, out) {
  const N = piezoCount(hz(n.midi)), end = n.dur * CPU, H = N * CPU / PIEZO_CLK;
  let i = 0, bit = 1;
  // The controller's timer is the time base; T is kept in CPU-cycle units for the renderer.
  while (i * H < end || bit === 0) { out(i * H, bit); i++; bit ^= 1; }
  out(i * H, 0);
  return i * H;
}
