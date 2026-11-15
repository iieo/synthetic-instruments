import { SR } from '../../lib/audio.mjs';

const FMAX = Math.min(19000, 0.45 * SR);

// One plucked string as a sum of its partials, each with two polarisations.
// o: { f0 (Hz of the first partial), B (inharmonicity), beta (plucking point / length), amp,
//      quillHz (corner of the quill release), t60 (f => s), start, release (sample index),
//      dampT60 (s, damper on the string), buff (f => extra loss factor or null), rand, n }.
// The quill draws the string aside at beta and slips off: a triangle released from rest. The
// force on the bridge of partial m is then proportional to sin(m pi beta) / m; the finite time the
// quill needs to slip off rounds the corner, a first-order roll-off above quillHz.
export function pluckedString(out, o) {
  const { f0, B, beta, amp, quillHz, t60, start, release, dampT60, buff, rand, rePluck = 0.02 } = o;
  const n = out.length;
  const ramp = Math.round(0.012 * SR);
  const sDamp = 6.91 / dampT60;
  const fadeIn = 6;
  for (let m = 1; ; m++) {
    const f = f0 * m * Math.sqrt((1 + B * m * m) / (1 + B));
    if (f > FMAX) break;
    let a = (amp * Math.sin(m * Math.PI * beta)) / m / Math.sqrt(1 + (f / quillHz) ** 2);
    if (Math.abs(a) < 1e-6 * amp) continue;
    let T = t60(f);
    if (buff) { T = Math.min(T, buff(f)); a *= 0.8; }
    // Second polarisation: weaker, slightly higher, loses its energy to the bridge more slowly.
    const pols = [[1, 0, 1], [0.12 + 0.08 * rand(), 0.25 + 0.5 * rand(), 1.7]];
    for (const [g, cents, slow] of pols) {
      const w = (2 * Math.PI * f * 2 ** (cents / 1200)) / SR;
      const s = 6.91 / (T * slow);
      let d = Math.exp(-s / SR);
      const cr = Math.cos(w), ci = Math.sin(w);
      let zr = 0, zi = 0;
      // Start in sine phase: the output Im(z) begins at zero and the kick only sets the velocity.
      zr = a * g;
      const thr = 1e-6 * Math.abs(amp);
      let i = start;
      for (; i < n; i++) {
        if (i === release) zr -= rePluck * a * g;
        if (i >= release) {
          const u = Math.min(1, (i - release) / ramp);
          d = Math.exp(-(s + sDamp * u * u) / SR);
        }
        const j = i - start;
        out[i] += j < fadeIn ? zi * (0.5 - 0.5 * Math.cos((Math.PI * j) / fadeIn)) : zi;
        const nr = (zr * cr - zi * ci) * d;
        zi = (zr * ci + zi * cr) * d; zr = nr;
        if ((j & 255) === 0 && zr * zr + zi * zi < thr * thr) {
          if (i > release) break;
          // Rung out before the key is let go: skip ahead to the damper.
          zr = 0; zi = 0; i = Math.max(i, release - 1);
        }
      }
    }
  }
}
