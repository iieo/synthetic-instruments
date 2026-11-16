import { SVF } from '../synth/dsp.mjs';

// Small cone speaker in a plastic case, driven with a voltage: cone resonance as a 2nd-order
// high-pass (380 Hz, Q 1.4), a cone break-up peak around 2.8 kHz, voice-coil inductance and cone
// mass as a 2nd-order low-pass at 7 kHz. DC gain is zero, so a held level decays to silence and
// every edge of the 1-bit signal is heard as a damped click.
export function cone(x) {
  const hp = new SVF(), bp = new SVF(), lp = new SVF();
  hp.set(380, 1.4); bp.set(2800, 3); lp.set(7000, 0.7);
  const kb = bp.k;
  for (let i = 0; i < x.length; i++) {
    hp.tick(x[i]);
    const a = hp.hp;
    bp.tick(a);
    x[i] = lp.tick(a + 0.8 * kb * bp.bp);
  }
  return x;
}

// Piezo disc on a small resonator: one strong mode at 3.6 kHz (Q 7), a weak second mode near
// 9 kHz and a steep fall below the resonance, so low notes come out as thin overtones.
export function piezo(x) {
  const m1 = new SVF(), m2 = new SVF(), hp = new SVF(), lp = new SVF();
  m1.set(3600, 7); m2.set(9200, 5); hp.set(1200, 0.7); lp.set(12000, 0.7);
  const k1 = m1.k, k2 = m2.k;
  for (let i = 0; i < x.length; i++) {
    hp.tick(x[i]);
    const a = hp.hp;
    m1.tick(a); m2.tick(a);
    x[i] = lp.tick(k1 * m1.bp + 0.25 * k2 * m2.bp + 0.12 * a);
  }
  return x;
}
