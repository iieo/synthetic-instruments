import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { biquad, filterInPlace } from './epiano/filters.mjs';

export const meta = { name: 'E-Piano', range: [28, 100] };

// Fixed output scale: the loudest note of the range at velocity 1 peaks near -3 dBFS.
const OUT_GAIN = 0.275;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const t60ToRadius = (t60) => Math.exp(-6.907755 / (t60 * SR));

// Smooth envelope of the force spectrum of a half-sine hammer contact of length tau:
// flat below ~0.6/tau, falling with f^-2 above (the exact spectrum's sidelobe zeros are averaged
// out, since a real felt-like contact is not a perfect half sine).
const contactSpectrum = (f, tau) => 1 / (1 + (f * tau / 0.6) ** 2);

export function render({ midi, velocity = 0.8, duration = 1, seed = 1 }) {
  const r = rng(((seed * 7919) ^ (midi * 104729)) >>> 0);
  const jit = (s) => 1 + s * (2 * r() - 1);
  const v = clamp(velocity, 0.02, 1);
  const f0 = midiToHz(midi) * 2 ** (((2 * r() - 1) * 1.5) / 1200);
  const p = clamp((midi - 28) / 72, 0, 1);

  // Neoprene hammer tip: contact time shrinks with velocity and toward the stiffer treble tines.
  const tauC = (1.3 - 0.7 * v) * (1 - 0.5 * p) * 1e-3 * jit(0.05);
  // Peak tine-tip excursion in units of the pickup's field width; treble tines are shorter and move less.
  const A = (0.12 + 1.25 * v ** 1.6) * (1 - 0.8 * p) * jit(0.04);

  const t60 = 18 * (f0 / 41) ** -0.5 * jit(0.08);
  const beat = 0.35 + 0.7 * r();
  const eps = beat / (2 * f0);
  // Clamped-free beam: f2/f1 = 6.27, f3/f1 = 17.55; the tuning-spring mass near the tip raises these ratios.
  const r2 = (6.9 + 0.5 * p) * jit(0.02);
  const r3 = (19.2 + 1.5 * p) * jit(0.02);
  const H = (f) => contactSpectrum(f, tauC) / contactSpectrum(f0, tauC);
  const bellGain = 1.6 * (0.4 + 0.8 * v);

  const modes = [
    { f: f0, a: A, t60 },
    { f: f0 * (1 + 2 * eps), a: A * 0.14, t60: t60 * 1.7 },
    { f: f0 * r2, a: (A * bellGain * H(f0 * r2)) / r2, t60: clamp(0.7 * (f0 / 100) ** -0.45, 0.06, 1.5) * jit(0.1) },
    { f: f0 * r3, a: (A * 0.5 * bellGain * H(f0 * r3)) / r3, t60: clamp(0.12 * (f0 / 100) ** -0.4, 0.02, 0.3) },
  ].filter((m) => m.f < 0.4 * SR);

  // Drive pulse kept short enough to have no spectral zero below the highest mode; its own
  // spectrum is divided out so each mode starts at the amplitude set above.
  const fMax = modes[modes.length - 1].f;
  const L = Math.max(4, Math.round(Math.min(6e-4, 0.7 / fMax) * SR));
  const pulse = new Float64Array(L);
  let psum = 0;
  for (let i = 0; i < L; i++) { pulse[i] = Math.sin((Math.PI * (i + 0.5)) / L); psum += pulse[i]; }
  for (let i = 0; i < L; i++) pulse[i] /= psum;

  const tDamp = 0.09 + 0.35 * p ** 2;
  const nRel = Math.max(L + 2, Math.round(duration * SR));
  const n = nRel + Math.round(Math.max(0.25, 2.2 * tDamp) * SR);
  const ramp = Math.round(0.012 * SR);

  const res = modes.map((m) => {
    const w = (2 * Math.PI * m.f) / SR;
    let re = 0, im = 0;
    for (let i = 0; i < L; i++) { re += pulse[i] * Math.cos(w * i); im -= pulse[i] * Math.sin(w * i); }
    const mag = Math.hypot(re, im);
    return {
      c: 2 * Math.cos(w), rHeld: t60ToRadius(m.t60),
      rDamp: t60ToRadius(Math.min(m.t60, tDamp * (m.f > 2 * f0 ? 0.5 : 1))),
      g: (Math.sin(w) * m.a) / mag, y1: 0, y2: 0,
    };
  });

  // Voicing: rest offset of the tine tip from the pole-piece axis. The flux curve's inflection lies at
// 0.577, where the 2nd harmonic vanishes; bass is voiced closer to the axis (more even harmonics).
  const x0 = (0.28 + 0.22 * p) * jit(0.1);
  const phi = (x) => { const u = x + x0; return 1 / (1 + u * u); };
  const out = new Float64Array(n);
  const vNorm = (OUT_GAIN * SR) / (2 * Math.PI * f0);
  let prevPhi = phi(0);

  for (let i = 0; i < n; i++) {
    const drive = i >= 1 && i <= L ? pulse[i - 1] : 0;
    const k = i < nRel ? 0 : Math.min(1, (i - nRel) / ramp);
    let x = 0;
    for (const s of res) {
      const rr = s.rHeld + (s.rDamp - s.rHeld) * k;
      const y = rr * s.c * s.y1 - rr * rr * s.y2 + s.g * drive;
      s.y2 = s.y1; s.y1 = y;
      x += y;
    }
    // Faraday: pickup voltage is the time derivative of the flux through the coil, flux depending
    // nonlinearly on the tine tip position relative to the pole piece.
    const ph = phi(x);
    out[i] = (ph - prevPhi) * vNorm;
    prevPhi = ph;
  }

  filterInPlace(out, biquad('hp', 45, 0.6));
  filterInPlace(out, biquad('peak', 180, 0.8, 2));
  filterInPlace(out, biquad('peak', 2600, 1.2, -3));
  filterInPlace(out, biquad('lp', 6500, 0.7));

  const fade = Math.round(0.004 * SR);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
  out[n - 1] = 0;
  return out;
}
