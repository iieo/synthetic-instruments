import { SR, buffer, mixInto, stats, writeWav } from '../../lib/audio.mjs';
import { kaiserLowpass, fadeOut } from './dsp.mjs';

// Renders a list of { t, gain, opts } events into a stereo buffer, sample positions rounded once.
export function mixEvents(events, render) {
  const done = events.map((e) => {
    const x = render(e.opts);
    return { ...e, x: Array.isArray(x) ? x : [x, x] };
  });
  const total = Math.max(...done.map((e) => e.t + e.x[0].length / SR)) + 0.1;
  const [L, R] = buffer(total, 2);
  for (const e of done) {
    const at = Math.round(e.t * SR);
    mixInto(L, e.x[0], at, e.gain);
    mixInto(R, e.x[1], at, e.gain);
  }
  fadeOut([L, R], 0.05);
  return [L, R];
}

// Inter-sample peak by 4x polyphase interpolation, in the manner of the BS.1770 true-peak meter.
export function truePeak(chs, os = 4) {
  const h = kaiserLowpass(48 * os + 1, 0.5 / os * 0.92, 9), N = h.length, D = (N - 1) / 2;
  const phases = Array.from({ length: os }, (_, k) => {
    const taps = [];
    for (let i = (k + D) % os; i < N; i += os) taps.push([i, h[i] * os]);
    return taps;
  });
  let peak = 0;
  for (const x of chs) {
    for (let n = 0; n < x.length; n++) {
      for (let k = 0; k < os; k++) {
        const c = n * os + k + D;
        let acc = 0;
        for (const [i, w] of phases[k]) {
          const j = (c - i) / os;
          if (j >= 0 && j < x.length) acc += w * x[j];
        }
        if (Math.abs(acc) > peak) peak = Math.abs(acc);
      }
    }
  }
  return peak;
}

// One linear gain: sample peak to -1 dBFS unless that would push the true peak above -0.6 dBTP.
export function master(path, chs) {
  const sp = stats(chs).peak, tp = truePeak(chs);
  const g = Math.min(10 ** (-1 / 20) / sp, 10 ** (-0.6 / 20) / tp);
  for (const x of chs) for (let i = 0; i < x.length; i++) x[i] *= g;
  writeWav(path, chs);
  const s = stats(chs);
  console.log(`${path}: ${(chs[0].length / SR).toFixed(1)} s, peak ${s.peakDb.toFixed(2)} dBFS, true peak ${(20 * Math.log10(tp * g)).toFixed(2)} dBTP, maxJump ${s.maxJump.toFixed(3)}`);
}
