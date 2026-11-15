// Natural resonances of the open B-flat trumpet sit near n * 116.5 Hz (pedal B-flat 2). Valves add
// tubing that lowers the whole series by 0 to 6 semitones. A player picks the partial that needs the
// fewest semitones of extra tubing.
const PEDAL = 46;
const PARTIALS = [2, 3, 4, 5, 6, 8, 9, 10, 12];

export function fingering(midi) {
  let best = null;
  for (const n of PARTIALS) {
    const s = PEDAL + 12 * Math.log2(n) - midi;
    if (s < -0.5 || s > 6.5) continue;
    const valves = Math.max(0, Math.round(s));
    if (!best || valves < best.valves) best = { n, valves };
  }
  return best ?? { n: midi < 58 ? 2 : 12, valves: 0 };
}

// One slice of the cylindrical leadpipe/tuning-slide section with amplitude-dependent sound speed.
// A pressure sample p travels at c * (1 + (gamma + 1) / 2 * p / (rho c^2)), so its arrival time is
// shifted by -beta * p. Every input sample is placed at its own (warped) arrival time and the output
// is read back by interpolation at integer times. Arrival times are kept strictly increasing; where
// the wave would fold over itself (a shock) the samples crowd together instead.
export class NonlinearSlice {
  constructor(nominal, beta) {
    this.d0 = nominal; this.beta = beta; this.maxShift = nominal - 2;
    this.size = 1; while (this.size < nominal * 2 + 16) this.size <<= 1;
    this.m = this.size - 1;
    this.tau = new Float64Array(this.size); this.val = new Float64Array(this.size);
    this.n = 0; this.head = 0; this.rd = 0; this.mean = 0;
    for (let i = 0; i < this.size; i++) this.tau[i] = i - this.size;
  }
  tick(x) {
    const m = this.m;
    // Only the acoustic part of the pressure changes the sound speed; the slow mean comes from the
    // steady blowing pressure and must not shift the arrival time (that would detune the bore).
    this.mean += 0.0008 * (x - this.mean);
    let sh = this.beta * (x - this.mean);
    if (sh > this.maxShift) sh = this.maxShift; else if (sh < -this.maxShift) sh = -this.maxShift;
    let t = this.n + this.d0 - sh;
    const prev = this.tau[(this.head - 1) & m];
    if (t < prev + 0.05) t = prev + 0.05;
    this.tau[this.head] = t; this.val[this.head] = x; this.head = (this.head + 1) & m;
    const now = this.n++;
    while (this.tau[(this.rd + 1) & m] <= now && ((this.rd + 1) & m) !== this.head) this.rd = (this.rd + 1) & m;
    const t0 = this.tau[this.rd], t1 = this.tau[(this.rd + 1) & m];
    if (t1 <= t0 || now < t0) return this.val[this.rd];
    const f = (now - t0) / (t1 - t0);
    return this.val[this.rd] + f * (this.val[(this.rd + 1) & m] - this.val[this.rd]);
  }
}
