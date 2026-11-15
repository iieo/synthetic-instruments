// PolyBLEP correction for a step of height h located at phase p, given the current phase t and the
// phase increment dt. The two-sample polynomial residual replaces the naive step with an
// integrated, band-limited one.
function blep(t, p, dt, h) {
  let d = t - p;
  if (d < 0) d += 1;
  if (d < dt) { const x = d / dt - 1; return -0.5 * h * x * x; }
  if (d > 1 - dt) { const x = (d - 1) / dt + 1; return 0.5 * h * x * x; }
  return 0;
}

const CTRL = 64;

// Detuned oscillator stack. Voice offsets follow a power curve (outer voices spread further than a
// linear layout), each voice gets a random start phase, a fixed component tolerance and a slow drift.
// `pm` is a per-sample frequency ratio shared by all voices (bends, glide, vibrato, FM).
export function oscStack(L, R, o) {
  const {
    fs, f0, pm, r, voices = 7, spread = 25, mix = 0.7, shape = 'saw', width = 0.8,
    level = 1, drift = 3, pwmRate = 0.4, pwmDepth = 0.25, pwmCenter = 0.5, pulseAmt = 0.7,
    start = 0, n = pm.length,
  } = o;
  const aDrift = 1 - Math.exp(-2 * Math.PI * 0.3 * CTRL / fs);
  const driftNorm = drift / (Math.sqrt(aDrift / (2 - aDrift)) * 0.577);
  for (let j = 0; j < voices; j++) {
    const x = voices === 1 ? 0 : (j - (voices - 1) / 2) / ((voices - 1) / 2);
    const cents = spread * Math.sign(x) * Math.abs(x) ** 1.4 * (1 + 0.16 * (r() - 0.5)) + 2.5 * (r() - 0.5);
    const lv = level * (x === 0 ? 1 - 0.4 * mix : mix * (0.95 - 0.25 * Math.abs(x)));
    const pan = Math.max(-1, Math.min(1, width * x * (j % 2 ? -1 : 1)));
    const gl = lv * Math.cos((pan + 1) * Math.PI / 4), gr = lv * Math.sin((pan + 1) * Math.PI / 4);
    const base = f0 * 2 ** (cents / 1200) / fs;
    const lfoRate = pwmRate * (0.8 + 0.4 * r()) / fs, lfoPh = r();
    let t = r(), ds = 0, ratio = 1;
    for (let i = 0; i < n; i++) {
      if (i % CTRL === 0) {
        ds += aDrift * ((2 * r() - 1) * driftNorm - ds);
        ratio = 2 ** (ds / 1200);
      }
      const dt = Math.min(0.45, base * pm[i] * ratio);
      t += dt;
      if (t >= 1) t -= 1;
      let y;
      if (shape === 'saw') {
        y = 2 * t - 1 + blep(t, 0, dt, -2);
      } else {
        const ph = lfoPh + lfoRate * i;
        const pw = pwmCenter + pwmDepth * Math.sin(2 * Math.PI * (ph - Math.floor(ph)));
        // Saw plus a pulse built as the difference of two saws: the pulse's falling edge sits at 1 - pw.
        let t2 = t + pw;
        if (t2 >= 1) t2 -= 1;
        const a = shape === 'pulse' ? 1 : pulseAmt;
        const s = shape === 'pulse' ? 0 : 1;
        y = s * (2 * t - 1) + a * ((2 * t - 1) - (2 * t2 - 1));
        y += blep(t, 0, dt, -2 * (s + a)) + blep(t, 1 - pw, dt, 2 * a);
      }
      L[start + i] += gl * y;
      R[start + i] += gr * y;
    }
  }
}

// Band-limited square one octave below, as a sub-oscillator divided down from the main clock.
export function subOsc(L, R, { fs, f0, pm, r, level }) {
  let t = r();
  for (let i = 0; i < pm.length; i++) {
    const dt = Math.min(0.45, 0.5 * f0 * pm[i] / fs);
    t += dt;
    if (t >= 1) t -= 1;
    const y = (t < 0.5 ? 1 : -1) + blep(t, 0, dt, 2) + blep(t, 0.5, dt, -2);
    L[i] += level * y;
    R[i] += level * y;
  }
}
