// Resonance with impedance peak Z at f (bilinear band-pass, prewarped). Transposed direct form, so
// the part of the next output that does not depend on the next input is available as `hist`.
export class Mode {
  constructor(fs) { this.fs = fs; this.s1 = 0; this.s2 = 0; this.b0 = 0; this.a1 = 0; this.a2 = 0; }
  set(f, q, z) {
    const w = 2 * Math.PI * Math.min(f, 0.45 * this.fs) / this.fs, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    this.b0 = z * al / a0; this.a1 = -2 * Math.cos(w) / a0; this.a2 = (1 - al) / a0;
  }
  get hist() { return this.s1; }
  tick(x) {
    const y = this.b0 * x + this.s1;
    this.s1 = -this.a1 * y + this.s2;
    this.s2 = -this.b0 * x - this.a2 * y;
    return y;
  }
}

// Resonance ratios of a long, slightly flaring bore. A cone would give 1 : 2 : 3, a cylinder closed at
// the lips 1 : 3 : 5; the irregular flared bore sits in between and drifts further from harmonic.
const RATIOS = [1, 2.64, 4.38, 6.1, 7.85, 9.6, 11.4, 13.2, 15.0, 16.8];
const QS = [11, 13, 14, 14, 13, 12, 11, 10, 9, 8];
const ZS = [1, 0.85, 0.62, 0.48, 0.38, 0.3, 0.24, 0.19, 0.15, 0.12];

// Each instrument (seed) gets its own irregular bore: resonances above the third scatter by a few
// percent. The lowest three stay fixed, they set the drone pitch and the toot.
export function boreModes(f1, rand, fs) {
  const out = [];
  for (let k = 0; k < RATIOS.length; k++) {
    const f = f1 * RATIOS[k] * (k > 2 ? 1 + 0.035 * (rand() - 0.5) : 1);
    if (f > 0.4 * fs || f > 4000) break;
    out.push({ f, q: QS[k] * (k > 2 ? 1 + 0.15 * (rand() - 0.5) : 1), z: ZS[k] });
  }
  return out;
}

// Upstream impedance peaks of the player's vocal tract (glottis nearly closed). vowel 0 is a dark,
// rounded "oo" with the tongue back, 1 a bright "ee" with the tongue high and forward.
export function vocalTract(v) {
  return [
    { f: 750 + 450 * v, q: 6, z: 0.6 },
    { f: 1300 + 1000 * v, q: 7, z: 1.0 },
    { f: 2700 + 400 * v, q: 8, z: 0.6 },
  ];
}
