import { SR } from '../../lib/audio.mjs';
import { SVF } from '../synth/dsp.mjs';

// Four-point cubic Hermite read at a fractional delay (in samples) behind write index `w`.
function readFrac(buf, mask, w, d) {
  const p = w - d, i = Math.floor(p), f = p - i;
  const xm = buf[(i - 1) & mask], x0 = buf[i & mask], x1 = buf[(i + 1) & mask], x2 = buf[(i + 2) & mask];
  const c1 = 0.5 * (x1 - xm), c2 = xm - 2.5 * x0 + 2 * x1 - 0.5 * x2, c3 = 0.5 * (x2 - xm) + 1.5 * (x0 - x1);
  return ((c3 * f + c2) * f + c1) * f + x0;
}

// Scanner vibrato: the signal runs through a lumped delay line with taps; a rotating capacitive
// pickup sweeps from the first tap to the last and back, crossfading between neighbouring taps.
// depth is the delay of the last tap in seconds. In chorus mode the swept signal is mixed with the
// dry one, which gives the shimmer of two slightly detuned copies.
export const SCANNER = {
  off: null,
  v1: { depth: 0.00026, mix: 1 }, v2: { depth: 0.00048, mix: 1 }, v3: { depth: 0.00085, mix: 1 },
  c1: { depth: 0.00026, mix: 0.5 }, c2: { depth: 0.00048, mix: 0.5 }, c3: { depth: 0.00085, mix: 0.5 },
};

export function scanner(x, fs, { depth, mix }, phase0 = 0, rate = 6.87) {
  const TAPS = 9, size = 1 << Math.ceil(Math.log2(depth * fs + 16)), mask = size - 1;
  const buf = new Float64Array(size), out = new Float64Array(x.length);
  const tapD = Array.from({ length: TAPS }, (_, k) => 2 + (k / (TAPS - 1)) * depth * fs);
  // Each LC section rolls off the highs a little, so the late taps are duller.
  const lp = new SVF(fs); lp.set(7500, 0.6);
  let ph = phase0;
  const dph = rate / fs;
  for (let i = 0; i < x.length; i++) {
    buf[i & mask] = x[i];
    const tri = ph < 0.5 ? 2 * ph : 2 - 2 * ph;
    // A triangle sweep rounded at the turning points (the pickup plates overlap there).
    const pos = (0.5 - 0.5 * Math.cos(Math.PI * tri)) * 0.35 + tri * 0.65;
    const p = pos * (TAPS - 1), k = Math.min(TAPS - 2, Math.floor(p)), f = p - k;
    const wet = (1 - f) * readFrac(buf, mask, i, tapD[k]) + f * readFrac(buf, mask, i, tapD[k + 1]);
    const w = lp.tick(wet);
    out[i] = mix === 1 ? w : (1 - mix) * readFrac(buf, mask, i, 2) + mix * w;
    ph += dph; if (ph >= 1) ph -= 1;
  }
  return out;
}

// Tube preamp: an asymmetric soft characteristic, bias shifted so it compresses one half-wave a bit
// more than the other. Small signals gain sqrt(g), loud ones saturate. Must run oversampled.
export function preamp(x, drive) {
  const g = 1 + 7 * drive, b = 0.2 * drive, off = Math.tanh(b);
  const norm = 1 / (Math.sqrt(g) * (1 - off * off));
  for (let i = 0; i < x.length; i++) x[i] = (Math.tanh(g * x[i] + b) - off) * norm;
}

// Rotor speeds in Hz and acceleration time constants in seconds. The light horn reaches its speed
// within about a second, the heavy drum takes several.
const ROTORS = {
  horn: { slow: 0.83, fast: 6.75, up: 0.6, down: 0.9, radius: 0.15, am: 0.55, muffle: 0.65 },
  drum: { slow: 0.7, fast: 5.9, up: 3.5, down: 5, radius: 0.08, am: 0.32, muffle: 0 },
};
export const ROTOR_MODES = ['off', 'slow', 'fast', 'slow-fast', 'fast-slow'];

// Rotating speaker: crossover at 800 Hz, the treble horn and the bass drum rotate independently.
// Each microphone sees a source whose distance changes with the rotor angle, which gives a delay
// (Doppler shift), a level change and for the horn a duller sound when it faces away.
// Returns [L, R]. `schedule` lists speed changes [[seconds, 'slow' | 'fast'], ...]; the first
// entry is the speed at the start. Alternatively `mode` is one of ROTOR_MODES with the change at
// `switchAt`. Each rotor approaches a new speed exponentially with its own time constant.
export function rotary(x, { mode = 'slow', switchAt = 0, schedule, phase = [0, 0] } = {}) {
  const n = x.length;
  const lo1 = new SVF(), lo2 = new SVF(), hi1 = new SVF(), hi2 = new SVF();
  for (const f of [lo1, lo2, hi1, hi2]) f.set(800, Math.SQRT1_2);
  const lowB = new Float64Array(n), highB = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lowB[i] = lo2.tick(lo1.tick(x[i]));
    hi1.tick(x[i]); hi2.tick(hi1.hp);
    highB[i] = hi2.hp;
  }
  if (!schedule) {
    const [from, to] = mode === 'fast' ? ['fast', 'fast'] : mode === 'slow-fast' ? ['slow', 'fast']
      : mode === 'fast-slow' ? ['fast', 'slow'] : ['slow', 'slow'];
    schedule = [[0, from], [switchAt, to]];
  }
  const sched = [...schedule].sort((p, q) => p[0] - q[0]);
  const c = 343, size = 256, mask = size - 1;
  const mics = [-Math.PI / 3, Math.PI / 3];
  const out = [new Float64Array(n), new Float64Array(n)];
  for (const [ri, [name, band]] of [['horn', highB], ['drum', lowB]].entries()) {
    const r = ROTORS[name];
    let speed = r[sched[0][1]], target = speed, k = 0, th = 2 * Math.PI * phase[ri];
    const buf = new Float64Array(size);
    const dAmp = (r.radius / c) * SR, d0 = dAmp + 4;
    const lps = mics.map(() => ({ y: 0 }));
    for (let i = 0; i < n; i++) {
      buf[i & mask] = band[i];
      while (k < sched.length && i >= sched[k][0] * SR) target = r[sched[k++][1]];
      speed += (target - speed) / ((target > speed ? r.up : r.down) * SR);
      th += 2 * Math.PI * speed / SR;
      for (let m = 0; m < 2; m++) {
        const cs = Math.cos(th - mics[m]);
        let y = readFrac(buf, mask, i, d0 - dAmp * cs) * (1 - r.am * 0.5 * (1 - cs));
        if (r.muffle) {
          // Off axis the horn radiates less treble: one-pole low-pass from ~9 kHz down to ~2.5 kHz.
          const fc = 2500 + 6500 * (0.5 + 0.5 * cs) ** 1.5;
          const k = 1 - Math.exp(-2 * Math.PI * fc / SR);
          const s = lps[m];
          s.y += k * (y - s.y);
          y = r.muffle * s.y + (1 - r.muffle) * y;
        }
        out[m][i] += y;
      }
    }
  }
  // A couple of early reflections inside the cabinet, crossed between the channels.
  const refl = [[0.0031, 0.16, 1], [0.0053, 0.11, 0], [0.0077, 0.08, 1]];
  const res = [new Float64Array(n), new Float64Array(n)];
  for (let m = 0; m < 2; m++) {
    for (let i = 0; i < n; i++) {
      let y = out[m][i];
      for (const [dt, g, cross] of refl) {
        const j = i - Math.round(dt * SR * (m ? 1.07 : 1));
        if (j >= 0) y += g * out[cross ? 1 - m : m][j];
      }
      res[m][i] = y;
    }
  }
  return res;
}
