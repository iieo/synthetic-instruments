import { kaiserLowpass } from '../synth/dsp.mjs';

// The chip runs at 960 kHz in the model: twenty times 48 kHz and close to the roughly 1 MHz of
// the original. The player routine writes registers once per video frame (50 Hz).
export const CLK = 960000;
export const FRAME_HZ = 50;
export const FRAME_TICKS = CLK / FRAME_HZ;
export const DECIM = 20;

// Attack times in ms for the 16 rate settings; one envelope step comes every period clocks, and
// 255 steps make the full attack.
const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
export const RATE_PERIOD = ATTACK_MS.map((ms) => Math.max(1, Math.round(ms * CLK / 1000 / 255)));

// Decay and release divide the rate clock further, the more the lower the level: a piecewise
// exponential falling curve that takes about three times as long as the attack.
const EXP_DIV = new Uint8Array(256);
for (let l = 0; l < 256; l++) EXP_DIV[l] = l > 93 ? 1 : l > 54 ? 2 : l > 26 ? 4 : l > 14 ? 8 : l > 6 ? 16 : 30;

export const hzToReg = (hz) => Math.max(0, Math.min(0xffff, Math.round(hz * 16777216 / CLK)));
export const regToHz = (r) => r * CLK / 16777216;

// Cutoff register (11 bit) to Hz: nearly linear with a slight bend at the low end.
export const cutoffHz = (reg) => 30 + 11970 * (reg / 2047) ** 1.15;

const ATTACK = 0, DECAY = 1, RELEASE = 2;
// Waveform pedestal: a zero waveform value does not sit at the voice's centre, so the envelope
// also moves a DC level. The analog output coupling turns that into the soft thump on attacks.
const PED = 260;

class Voice {
  constructor() {
    this.acc = 0; this.freq = 0; this.pw = 2048;
    this.tri = false; this.saw = false; this.pulse = false; this.noise = false;
    this.ring = false; this.sync = false; this.gate = false;
    this.a = 0; this.d = 0; this.s = 15; this.r = 0;
    this.level = 0; this.stage = RELEASE; this.rc = 0; this.ec = 0;
    this.lfsr = 0x7ffff8; this.filt = false;
  }
  hz(f) { this.freq = hzToReg(f); }
  wave(w) {
    const set = new Set(Array.isArray(w) ? w : [w]);
    this.tri = set.has('tri'); this.saw = set.has('saw'); this.pulse = set.has('pulse'); this.noise = set.has('noise');
  }
  env(a, d, s, r) { this.a = a; this.d = d; this.s = s; this.r = r; }
  setGate(g) {
    if (g && !this.gate) { this.stage = ATTACK; this.rc = 0; }
    if (!g && this.gate) this.stage = RELEASE;
    this.gate = g;
  }
}

export class Chip {
  constructor() {
    this.v = [new Voice(), new Voice(), new Voice()];
    this.cut = 1024; this.res = 0; this.lp = true; this.bp = false; this.hp = false; this.vol = 15;
    this.fLp = 0; this.fBp = 0;
    // Output RC low-pass of the analog stage, 16 kHz.
    this.rcA = Math.exp(-2 * Math.PI * 16000 / CLK); this.rcY = 0;
    // Stage 1 of the resampler: 960 kHz to 96 kHz.
    this.h = kaiserLowpass(121, 48000 / CLK, 9.5);
    this.N = this.h.length; this.ring = new Float64Array(2 * this.N); this.pos = 0; this.phase = 0;
  }

  mode(m) { this.lp = m.includes('lp'); this.bp = m.includes('bp'); this.hp = m.includes('hp'); }

  // Runs `ticks` chip clocks and appends 96 kHz samples to `out` (a plain array).
  run(ticks, out) {
    const v = this.v, h = this.h, N = this.N, ring = this.ring;
    const fc = cutoffHz(Math.max(0, Math.min(2047, this.cut)));
    const f = 2 * Math.sin(Math.PI * fc / CLK);
    const q = 1 / (0.707 * 2 ** (this.res * 2.1 / 15));
    const vol = this.vol / 15;
    const lpOn = this.lp, bpOn = this.bp, hpOn = this.hp;
    let lp = this.fLp, bp = this.fBp, rcY = this.rcY;
    const rcA = this.rcA;
    const sl = v.map((x) => x.s * 17), per = v.map((x) => RATE_PERIOD[x.stage === ATTACK ? x.a : x.stage === DECAY ? x.d : x.r]);
    const prevMsb = [0, 0, 0], rose = [false, false, false];
    for (let t = 0; t < ticks; t++) {
      for (let i = 0; i < 3; i++) {
        const x = v[i];
        const old = x.acc;
        x.acc = (old + x.freq) & 0xffffff;
        prevMsb[i] = old & 0x800000;
        rose[i] = !prevMsb[i] && (x.acc & 0x800000) !== 0;
        if (!(old & 0x80000) && (x.acc & 0x80000)) {
          const l = x.lfsr;
          x.lfsr = ((l << 1) | (((l >> 22) ^ (l >> 17)) & 1)) & 0x7fffff;
        }
      }
      for (let i = 0; i < 3; i++) if (v[i].sync && rose[(i + 2) % 3]) v[i].acc = 0;
      let dry = 0, wet = 0;
      for (let i = 0; i < 3; i++) {
        const x = v[i];
        if (++x.rc >= per[i]) {
          x.rc = 0;
          if (x.stage === ATTACK) {
            if (++x.level >= 255) { x.level = 255; x.stage = DECAY; per[i] = RATE_PERIOD[x.d]; x.ec = 0; }
          } else if (++x.ec >= EXP_DIV[x.level]) {
            x.ec = 0;
            if (x.stage === DECAY) { if (x.level > sl[i]) x.level--; } else if (x.level > 0) x.level--;
          }
        }
        if (x.level === 0) continue;
        const a = x.acc;
        let w = 0xfff, n = 0;
        if (x.tri) {
          let msb = a & 0x800000;
          if (x.ring) msb ^= v[(i + 2) % 3].acc & 0x800000;
          w &= ((msb ? ~a : a) >> 11) & 0xfff; n++;
        }
        if (x.saw) { w &= a >> 12; n++; }
        if (x.pulse) { w &= (a >> 12) >= x.pw ? 0xfff : 0; n++; }
        if (x.noise) {
          const l = x.lfsr;
          w &= (((l >> 20) & 1) << 11 | ((l >> 18) & 1) << 10 | ((l >> 14) & 1) << 9 | ((l >> 11) & 1) << 8 |
            ((l >> 9) & 1) << 7 | ((l >> 5) & 1) << 6 | ((l >> 2) & 1) << 5 | (l & 1) << 4);
          n++;
        }
        // Combined waveforms: the outputs pull each other's bits low. A bit survives only where
        // all waveforms have it and a neighbouring bit holds it up.
        if (n > 1) w &= (w << 1) | (w >> 1);
        else if (n === 0) w = 2048;
        const s = (w - 2048 + PED) * x.level * (1 / (2048 * 255));
        if (x.filt) wet += s; else dry += s;
      }
      // State-variable filter, the band-pass state softly saturating like the chip's integrators.
      const hpv = wet - lp - q * bp;
      bp += f * hpv;
      if (bp > 3) bp = 3; else if (bp < -3) bp = -3;
      bp = bp * (27 + bp * bp) / (27 + 9 * bp * bp) * 1.0;
      lp += f * bp;
      let y = dry;
      if (lpOn) y += lp;
      if (bpOn) y += bp;
      if (hpOn) y += hpv;
      y *= vol;
      rcY = y + rcA * (rcY - y);
      const p = this.pos;
      ring[p] = rcY; ring[p + N] = rcY;
      this.pos = p + 1 === N ? 0 : p + 1;
      if (++this.phase === 10) {
        this.phase = 0;
        let acc = 0;
        const b = this.pos;
        for (let k = 0; k < N; k++) acc += h[k] * ring[b + k];
        out.push(acc);
      }
    }
    this.fLp = lp; this.fBp = bp; this.rcY = rcY;
  }

  levels() { return this.v.map((x) => x.level); }
}
