// Circuit-level models, all run at the oversampled rate fs.

// Bridged-T resonator as a time-varying two-pole bandpass (trapezoidal state-variable form).
// The trigger charges a capacitor whose discharge shifts the bias of the resonator's tuning
// element: f(t) follows the slow envelope; a second, much faster discharge gives the punch chirp.
// Pole radius is tied to f so the decay time stays tau even while the frequency moves.
export function bridgedT({ n, fs, fEnd, sweep, tauSweep, punch, tauPunch, drift, tauDrift, tau, excite }) {
  const y = new Float64Array(n), freq = new Float64Array(n);
  let ic1 = 0, ic2 = 0;
  const ks = Math.exp(-1 / (tauSweep * fs)), kp = Math.exp(-1 / (tauPunch * fs)), kd = Math.exp(-1 / (tauDrift * fs));
  let es = 1, ep = 1, ed = 1;
  for (let i = 0; i < n; i++) {
    const f = Math.min(fEnd * (1 + sweep * es) * (1 + punch * ep) * (1 + drift * ed), fs * 0.2);
    freq[i] = f;
    es *= ks; ep *= kp; ed *= kd;
    const g = Math.tan((Math.PI * f) / fs);
    const k = 1 / (Math.PI * f * tau);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = excite[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    y[i] = v1;
  }
  return { y, freq };
}

// Trigger pulse: a rectangular gate of width w through an RC lowpass (time constant tr),
// sampled from its closed form so the waveform does not depend on the sample rate.
export function triggerPulse(n, fs, w, tr) {
  const x = new Float64Array(n), top = 1 - Math.exp(-w / tr);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    x[i] = t < w ? 1 - Math.exp(-t / tr) : top * Math.exp(-(t - w) / tr);
  }
  return x;
}

// Shunt diode clipper with series R and shunt C, one silicon diode forward and two in series
// reverse (asymmetric). C dv/dt = (vin - v)/R - Is(exp(v/nVt) - exp(-v/(2nVt))).
// Trapezoidal rule. The implicit equation g(v) = 0 is monotonic in v, so a Newton step that
// leaves the current bracket falls back to bisection and every sample converges.
export function diodeClipper(x, fs, { R = 2200, C = 10e-9, Is = 2.52e-9, nVt = 1.752 * 0.02585, reverse = 2 } = {}) {
  const y = new Float64Array(x.length);
  const T = 1 / fs, h = T / (2 * C), nVr = reverse * nVt;
  const fn = (vin, v) => (vin - v) / R - Is * (Math.exp(v / nVt) - Math.exp(-v / nVr));
  const dfn = (v) => -1 / R - Is * (Math.exp(v / nVt) / nVt + Math.exp(-v / nVr) / nVr);
  let v = 0, fPrev = 0;
  for (let i = 0; i < x.length; i++) {
    const vin = x[i], rhs = v + h * fPrev;
    let lo = -4, hi = 4, u = v;
    for (let it = 0; it < 80; it++) {
      const g = u - h * fn(vin, u) - rhs;
      if (g > 0) hi = u; else lo = u;
      let un = u - g / (1 - h * dfn(u));
      if (!(un > lo && un < hi)) un = 0.5 * (lo + hi);
      const done = Math.abs(un - u) < 1e-11;
      u = un;
      if (done) break;
    }
    v = u; fPrev = fn(vin, v); y[i] = v;
  }
  return y;
}

// Emitter-coupled (long-tailed) pair: collector current difference is I*tanh(vd/2Vt).
// A mismatch offset `bias` makes it asymmetric (even harmonics); the static part is removed.
export function diffPair(x, gain, bias = 0) {
  const y = new Float64Array(x.length), off = Math.tanh(bias);
  for (let i = 0; i < x.length; i++) y[i] = Math.tanh(gain * x[i] + bias) - off;
  return y;
}

// Folding stage: the input minus an amplified diode-clipped residual. Below the threshold the
// diodes do not conduct and y = x; above it the slope becomes 1 - G, negative for G > 1.
export function folder(x, G, thr, stages = 1) {
  let y = x;
  for (let s = 0; s < stages; s++) {
    const z = new Float64Array(y.length);
    for (let i = 0; i < y.length; i++) {
      const v = y[i];
      z[i] = Math.tanh(v - G * (v - thr * Math.tanh(v / thr)));
    }
    y = z;
  }
  return y;
}
