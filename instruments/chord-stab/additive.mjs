import { SR } from '../../lib/audio.mjs';

// Adds one decaying sinusoid by complex rotation (no sin() per sample). `tau` may be an array of
// [weight, seconds] pairs for a two-stage decay. Partials above 0.42*SR are skipped, so the sum is
// band-limited by construction.
export function partial(L, R, { f, amp, tau, pan = 0, n, phase = 0 }) {
  if (f <= 0 || f >= 0.42 * SR || amp === 0) return;
  const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w);
  const gl = amp * Math.cos((pan + 1) * Math.PI / 4), gr = amp * Math.sin((pan + 1) * Math.PI / 4);
  const stages = Array.isArray(tau) ? tau : [[1, tau]];
  for (const [wt, t] of stages) {
    const k = t === Infinity ? 1 : Math.exp(-1 / (t * SR));
    let x = Math.cos(phase), y = Math.sin(phase), e = wt;
    for (let i = 0; i < n; i++) {
      L[i] += gl * e * y;
      R[i] += gr * e * y;
      const xn = x * c - y * s;
      y = x * s + y * c;
      x = xn;
      e *= k;
    }
  }
}

// Drawbar-style organ voice: sine partials at chosen harmonics plus a decaying percussion partial.
export function organNote(L, R, { f0, n, pan, v, r }) {
  const bars = [[1, 1], [2, 0.75], [3, 0.55], [4, 0.45], [6, 0.25], [8, 0.3]];
  // Like a tonewheel set that runs out of wheels, harmonics above 9 kHz fold back an octave.
  for (const [h, lv] of bars) partial(L, R, { f: (f0 * h > 9000 ? f0 * h / 2 : f0 * h) * (1 + 0.0004 * (r() - 0.5)), amp: lv, tau: Infinity, pan, n, phase: 2 * Math.PI * r() });
  partial(L, R, { f: f0 * 3, amp: 0.6 * v, tau: 0.12, pan, n, phase: 0 });
  partial(L, R, { f: f0 * 5, amp: 0.25 * v, tau: 0.06, pan, n, phase: 0 });
}

// Struck-string voice: two slightly mistuned strings, stiff-string partials f_n = n f0 sqrt(1 + B n^2),
// amplitudes shaped by the strike position and a velocity-dependent brightness, higher partials
// decaying faster, each with a fast prompt decay and a slower aftersound.
export function pianoNote(L, R, { f0, n, pan, v, r, midi }) {
  const B = 0.00025 * 2 ** ((midi - 60) / 20);
  const beta = 1 / 7.3;
  const bright = 1200 + 5500 * v * v;
  const t1 = 0.9 * Math.min(2, Math.sqrt(262 / f0));
  for (const det of [-0.7, 0.7]) {
    const fs = f0 * 2 ** ((det + 0.3 * (r() - 0.5)) / 1200);
    for (let k = 1; k <= 48; k++) {
      const f = k * fs * Math.sqrt(1 + B * k * k);
      if (f > 16000) break;
      const amp = 0.5 * Math.abs(Math.sin(Math.PI * k * beta)) / k ** 0.85 * Math.exp(-f / bright);
      const tk = t1 / (1 + (f / 1800) ** 1.4);
      partial(L, R, { f, amp, tau: [[0.75, tk], [0.25, 4 * tk]], pan, n, phase: 0 });
    }
  }
}
