import { SR } from '../../lib/audio.mjs';

export const OS = 4;
const FSO = SR * OS;

// Topology-preserving state variable filter (trapezoidal integrators), cutoff may change per sample.
export class SVF {
  constructor(fc, q) { this.ic1 = 0; this.ic2 = 0; this.k = 1 / q; this.set(fc); }
  set(fc, fs = SR) {
    const g = Math.tan((Math.PI * Math.min(fc, 0.45 * fs)) / fs);
    this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  tick(v0) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = v0 - this.k * v1 - v2;
    return this;
  }
}

export function filter(x, mode, fc, q = Math.SQRT1_2) {
  const f = new SVF(fc, q), y = new Float64Array(x.length);
  // Band-pass is taken as k*bp so its peak gain is 1 regardless of Q.
  if (mode === 'bp') for (let i = 0; i < x.length; i++) y[i] = f.k * f.tick(x[i]).bp;
  else for (let i = 0; i < x.length; i++) y[i] = f.tick(x[i])[mode];
  return y;
}

function besselI0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-12 * s) break; }
  return s;
}

// Kaiser-windowed sinc low-pass at the oversampled rate: pass to 20 kHz, about -90 dB from 24 kHz.
const H = (() => {
  const N = 287, M = (N - 1) / 2, fc = 22000 / FSO, beta = 8.96, h = new Float64Array(N);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const m = i - M, s = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
    h[i] = s * besselI0(beta * Math.sqrt(1 - (m / M) ** 2)) / besselI0(beta);
    sum += h[i];
  }
  for (let i = 0; i < N; i++) h[i] /= sum;
  return h;
})();
const HM = (H.length - 1) / 2;

export function decimate(xo) {
  const n = Math.floor(xo.length / OS), y = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const c = j * OS;
    let acc = 0;
    const k0 = Math.max(0, c + HM - (xo.length - 1)), k1 = Math.min(H.length - 1, c + HM);
    for (let k = k0; k <= k1; k++) acc += H[k] * xo[c + HM - k];
    y[j] = acc;
  }
  return y;
}

export function interpolate(x) {
  const n = x.length * OS, y = new Float64Array(n);
  for (let m = 0; m < n; m++) {
    let acc = 0;
    // Only every OS-th tap meets a non-zero input sample.
    for (let k = (m + HM) % OS; k < H.length; k += OS) {
      const idx = (m + HM - k) / OS;
      if (idx >= 0 && idx < x.length) acc += H[k] * x[idx];
    }
    y[m] = acc * OS;
  }
  return y;
}

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Bank of free-running pulse oscillators, PolyBLEP edges, generated at 4x and decimated.
// osc: [{ f, duty, phase, amp }]
export function pulseBank(osc, n) {
  const no = n * OS, y = new Float64Array(no);
  for (const o of osc) {
    const dt = o.f / FSO;
    let p = o.phase;
    for (let i = 0; i < no; i++) {
      let v = p < o.duty ? 1 : -1;
      v += blep(p, dt) - blep((p - o.duty + 1) % 1, dt);
      y[i] += o.amp * (v + 1 - 2 * o.duty);
      p += dt; if (p >= 1) p -= 1;
    }
  }
  return decimate(y);
}

// Antiparallel silicon diode pair after a series resistor, shunt capacitor: C dv/dt = (vin - v)/R - 2 Is sinh(v/(n Vt)).
// Backward Euler with Newton steps at 4x, so the stiff exponential stays stable.
export function diodeClipper(x, drive) {
  if (!(drive > 0)) return x;
  const R = 2200, C = 4.7e-9, Is = 2.52e-9, nVt = 1.752 * 0.02585, h = 1 / FSO;
  const gin = 0.15 + 6 * drive * drive;
  const up = interpolate(x);
  let v = 0;
  const a = h / (R * C), b = (h * 2 * Is) / C;
  for (let i = 0; i < up.length; i++) {
    const vin = up[i] * gin, prev = v;
    for (let it = 0; it < 6; it++) {
      const e = Math.exp(v / nVt), sh = (e - 1 / e) / 2, ch = (e + 1 / e) / 2;
      const F = v - prev - a * (vin - v) + b * sh;
      const dF = 1 + a + (b / nVt) * ch;
      const dv = F / dF;
      v -= dv;
      if (Math.abs(dv) < 1e-10) break;
    }
    up[i] = v;
  }
  const y = decimate(up);
  // Make-up gain: an input at REF leaves the stage at REF again, so drive changes the shape, not the peak.
  const g = REF / staticClip(gin * REF, R, Is, nVt);
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return y;
}

const REF = 0.5;

// DC operating point of the clipper: (vin - v) / R = 2 Is sinh(v / nVt), by bisection.
function staticClip(vin, R, Is, nVt) {
  let lo = 0, hi = vin;
  for (let i = 0; i < 60; i++) {
    const v = (lo + hi) / 2;
    if ((vin - v) / R > 2 * Is * Math.sinh(v / nVt)) lo = v; else hi = v;
  }
  return (lo + hi) / 2;
}

export function noise(n, r) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = 2 * r() - 1;
  return x;
}

// Raised-cosine fade-in, trim below -90 dB of peak, raised-cosine fade-out ending at exactly zero.
export function finish(y, fadeIn = 24, fadeOut = 480) {
  let peak = 0;
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]));
  const thr = peak * 10 ** (-90 / 20);
  let end = y.length;
  while (end > 1 && Math.abs(y[end - 1]) < thr) end--;
  end = Math.min(y.length, end + fadeOut);
  const out = y.slice(0, end);
  for (let i = 0; i < Math.min(fadeIn, out.length); i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
  const fo = Math.min(fadeOut, out.length);
  for (let i = 0; i < fo; i++) out[end - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
  out[0] = 0; out[end - 1] = 0;
  return out;
}

// Inter-sample peak estimate via the 4x interpolator.
export function truePeak(x) {
  const up = interpolate(x);
  let p = 0;
  for (let i = 0; i < up.length; i++) p = Math.max(p, Math.abs(up[i]));
  return p;
}
