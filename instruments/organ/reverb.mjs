import { SR } from '../../lib/audio.mjs';

// Schroeder allpass section: flat magnitude, smears the input in time.
function allpass(len, g) {
  const buf = new Float64Array(len);
  let p = 0;
  return (x) => {
    const d = buf[p];
    const v = x + g * d;
    buf[p] = v;
    p = p + 1 === len ? 0 : p + 1;
    return d - g * v;
  };
}

/**
 * Stereo room reverb built as a feedback delay network: eight delay lines whose outputs are mixed
 * by an orthogonal (Hadamard) matrix and fed back. Each line has a one-pole absorption filter whose
 * gain at DC and at Nyquist follows from the wanted decay times, so every recirculation loses the
 * same number of decibels per second regardless of the line length. A few early reflections and
 * an allpass diffuser in front give the onset of a large stone room.
 */
export function churchReverb(L, R, { t60Low = 4.2, t60High = 1.6, size = 1.6, preDelay = 0.022, wet = 1, dry = 0.35 } = {}) {
  const n = L.length;
  const outL = new Float64Array(n), outR = new Float64Array(n);
  const lensMs = [53.3, 61.9, 70.7, 79.1, 89.9, 97.3, 108.1, 116.9];
  const lines = lensMs.map((ms) => {
    const len = Math.round((ms * size * SR) / 1000);
    const gDc = 10 ** ((-3 * len) / (SR * t60Low));
    const gNy = 10 ** ((-3 * len) / (SR * t60High));
    const a1 = (gDc - gNy) / (gDc + gNy);
    return { buf: new Float64Array(len), len, p: 0, a1, b0: gDc * (1 - a1), z: 0 };
  });
  const diff = [allpass(Math.round(0.0047 * SR), 0.7), allpass(Math.round(0.0036 * SR), 0.7),
    allpass(Math.round(0.0127 * SR), 0.6), allpass(Math.round(0.0093 * SR), 0.6)];
  // Early reflections: [delay s, gain, pan 0..1] for floor, side walls, pillars.
  const early = [[0.011, 0.5, 0.3], [0.019, 0.42, 0.75], [0.027, 0.35, 0.15], [0.034, 0.33, 0.9],
    [0.043, 0.28, 0.45], [0.052, 0.25, 0.65], [0.063, 0.2, 0.2], [0.071, 0.18, 0.85]];
  const pre = Math.round(preDelay * SR);
  const erMax = Math.round(0.08 * SR) + pre + 1;
  const hist = new Float64Array(erMax);
  let hp = 0;
  const s = new Float64Array(8), y = new Float64Array(8);
  const inSign = [1, -1, 1, -1, 1, 1, -1, -1];
  const lSign = [1, 1, -1, 1, -1, 1, -1, -1];
  const rSign = [1, -1, 1, 1, -1, -1, 1, -1];
  const lineGain = 1 / Math.sqrt(8);
  // Air absorption on the dry path: the listener sits some distance down the nave.
  const aAir = Math.exp((-2 * Math.PI * 9000) / SR);
  let airL = 0, airR = 0;
  for (let i = 0; i < n; i++) {
    const m = 0.5 * (L[i] + R[i]);
    hist[hp] = m;
    const tap = (d) => { let k = hp - d; if (k < 0) k += erMax; return hist[k]; };
    let eL = 0, eR = 0;
    for (const [t, g, pan] of early) {
      const v = tap(pre + Math.round(t * SR)) * g;
      eL += v * Math.cos((pan * Math.PI) / 2); eR += v * Math.sin((pan * Math.PI) / 2);
    }
    let d = tap(pre);
    hp = hp + 1 === erMax ? 0 : hp + 1;
    for (const ap of diff) d = ap(d);
    for (let k = 0; k < 8; k++) {
      const ln = lines[k];
      const v = ln.buf[ln.p];
      ln.z = ln.b0 * v + ln.a1 * ln.z;
      y[k] = ln.z;
    }
    // Fast Walsh-Hadamard transform, scaled to stay orthogonal (energy preserving).
    for (let k = 0; k < 8; k++) s[k] = y[k];
    for (let h = 1; h < 8; h <<= 1) {
      for (let a = 0; a < 8; a += h << 1) {
        for (let b = a; b < a + h; b++) { const u = s[b], w = s[b + h]; s[b] = u + w; s[b + h] = u - w; }
      }
    }
    let wl = 0, wr = 0;
    for (let k = 0; k < 8; k++) {
      const ln = lines[k];
      ln.buf[ln.p] = s[k] * lineGain + inSign[k] * d * 0.35;
      ln.p = ln.p + 1 === ln.len ? 0 : ln.p + 1;
      wl += lSign[k] * y[k]; wr += rSign[k] * y[k];
    }
    airL = (1 - aAir) * L[i] + aAir * airL;
    airR = (1 - aAir) * R[i] + aAir * airR;
    outL[i] = dry * airL + wet * (0.6 * eL + 0.35 * wl);
    outR[i] = dry * airR + wet * (0.6 * eR + 0.35 * wr);
  }
  return [outL, outR];
}
