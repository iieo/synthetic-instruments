import { SR } from '../../lib/audio.mjs';
import { SVF, sawBL } from '../synth/dsp.mjs';

// Detuned saw stack. Offsets grow faster than linear towards the outer voices, each voice starts at
// a random phase (free-running oscillators) and carries a small fixed tuning error. Voices are
// panned alternately so the lowest and highest detuned ones sit on opposite sides.
export function sawStack(L, R, { fs, f0, pm, r, voices, spread, width, level }) {
  const n = pm.length;
  for (let j = 0; j < voices; j++) {
    const x = voices === 1 ? 0 : (2 * j) / (voices - 1) - 1;
    const cents = spread * x * (0.55 + 0.45 * x * x) + 1.6 * (r() - 0.5);
    const lv = level * (x === 0 ? 1 : 0.88 - 0.18 * Math.abs(x)) / Math.sqrt(voices);
    const pan = Math.max(-1, Math.min(1, width * Math.abs(x) * (j % 2 ? 1 : -1)));
    const gl = lv * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const gr = lv * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const inc = f0 * 2 ** (cents / 1200) / fs;
    let t = r();
    for (let i = 0; i < n; i++) {
      const dt = Math.min(0.45, inc * pm[i]);
      t += dt;
      if (t >= 1) t -= 1;
      const y = sawBL(t, dt);
      L[i] += gl * y;
      R[i] += gr * y;
    }
  }
}

// High-passed, delayed copy of the mid signal added only to the side channel: wider top end,
// the mono sum stays untouched.
export function airLayer(L, R, amount, { fc = 900, delay = 0.011 } = {}) {
  if (!amount) return;
  const h1 = new SVF(SR), h2 = new SVF(SR);
  h1.set(fc, 0.54); h2.set(fc, 1.3);
  const d = Math.round(delay * SR), buf = new Float64Array(d + 1);
  for (let i = 0; i < L.length; i++) {
    h1.tick(0.5 * (L[i] + R[i]));
    h2.tick(h1.hp);
    buf[i % (d + 1)] = h2.hp;
    const s = amount * buf[(i + 1) % (d + 1)];
    L[i] += s;
    R[i] -= s;
  }
}

// Hardstyle-type distortion at the oversampled rate: asymmetric soft clip, a resonant mid boost
// after it, then a gentle low-pass that takes off the fizz.
export class Drive {
  constructor(fs, { pre, bias, peakHz, peakQ, peakGain, post }) {
    Object.assign(this, { pre, bias, peakGain });
    this.off = Math.tanh(bias);
    this.peak = new SVF(fs); this.peak.set(peakHz, peakQ);
    this.lp = new SVF(fs); this.lp.set(post, 0.6);
  }
  tick(x) {
    const y = Math.tanh(this.pre * x + this.bias) - this.off;
    this.peak.tick(y);
    return 0.7 * this.lp.tick(y + this.peakGain * this.peak.bp);
  }
}
