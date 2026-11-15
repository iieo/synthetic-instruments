import { design, OnePole } from './dsp.mjs';

// Static transfer of one triode stage around its bias point, normalised so the slope at the bias
// point is 1. Driving the grid positive draws grid current and flattens the top hard (scale 1);
// driving it negative runs into cutoff more gradually (scale k > 1). Both branches are tanh, so the
// curve and its slope are continuous at the bias point; the asymmetry makes even harmonics and a
// signal-dependent DC shift that the next coupling capacitor removes.
export function triode(u, k) {
  return u >= 0 ? Math.tanh(u) : k * Math.tanh(u / k);
}

// One preamp stage at rate fs: coupling capacitor (high-pass), gain, triode curve, plate load with
// Miller capacitance (low-pass), phase inversion.
export class Stage {
  constructor({ gain, hp, lp, k = 1.8, bias = 0 }, fs) {
    this.g = gain; this.k = k; this.b = bias; this.f0 = triode(bias, k);
    this.hp = new OnePole(hp, fs); this.lp = new OnePole(lp, fs);
  }
  step(x) {
    const u = this.g * this.hp.hp(x) + this.b;
    return -this.lp.lp(triode(u, this.k) - this.f0);
  }
}

// Tone stack. Three controls 0..1 act on a low shelf (bass), a broad peak in the middle (mid) and a
// high shelf (treble). A passive network can only cut: the flat setting is the 1, 1, 1 corner and
// every control removes level from its band, mid down to the familiar scoop.
export function toneStack({ bass, mid, treble }, fs) {
  const cut = (v, range) => -range * (1 - v) ** 1.5;
  const cb = cut(bass, 14), cm = cut(mid, 10), ct = cut(treble, 14);
  // Make-up gain of the following stage, so the knobs mostly change the colour, not the level.
  const makeup = 10 ** (-0.6 * (cb + cm + ct) / 3 / 20);
  const f = [design('low', 140, 0.6, cb, fs), design('peak', 600, 0.7, cm, fs), design('high', 1800, 0.6, ct, fs)];
  f[0].c = { ...f[0].c, b0: f[0].c.b0 * makeup, b1: f[0].c.b1 * makeup, b2: f[0].c.b2 * makeup };
  return f;
}

// Push-pull power stage: both halves clip the same way, so the curve is odd. A slow envelope of the
// output lowers the drive a little (supply sag), which gives the compression of a loaded amp.
export class PowerAmp {
  constructor({ drive, sag }, fs) {
    this.d = drive; this.sag = sag; this.env = 0;
    this.att = 1 - Math.exp(-1 / (0.01 * fs)); this.rel = 1 - Math.exp(-1 / (0.15 * fs));
  }
  step(x) {
    const g = this.d / (1 + this.sag * this.env);
    const y = Math.tanh(g * x);
    const a = Math.abs(y);
    this.env += (a > this.env ? this.att : this.rel) * (a - this.env);
    return y;
  }
}

// Closed cabinet with one 12 inch speaker, as a sum of resonances read off a typical response: the
// box resonance with the air spring around 100 Hz and steep loss below it, a dip around 450 Hz, the
// cone presence region at 2 to 3.5 kHz and the fast roll-off above the cone breakup near 5 kHz.
export function cabinet() {
  return [
    design('hp', 72, 0.9),
    design('peak', 110, 1.4, 3.5),
    design('peak', 450, 1.1, -4),
    design('peak', 2300, 1.4, 3.5),
    design('peak', 3600, 3, 2.5),
    design('lp', 5200, 0.9),
    design('lp', 5600, 0.6),
    design('lp', 9000, 0.7),
  ];
}

export const runChain = (buf, chain) => { for (const f of chain) f.run(buf); return buf; };
