// Polynomial band-limited step residual for a unit-height falling edge at phase 0.
function blep(t, dt) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

export const saw = (ph, dt) => 2 * ph - 1 - blep(ph, dt);

// The square is not a second oscillator: the saw drives a single transistor switch that flips
// halfway up the ramp. Two offset band-limited saws give the switching edges; the residual ramp
// (collector sag) and the soft transistor knee are added on top.
const SQ_TILT = 0.22, SQ_KNEE = 1.6, SQ_NORM = Math.tanh(SQ_KNEE * 1.2);
export function square(ph, dt) {
  let p2 = ph + 0.5; if (p2 >= 1) p2 -= 1;
  const s1 = saw(ph, dt);
  const pulse = s1 - saw(p2, dt);
  return Math.tanh(SQ_KNEE * (pulse - SQ_TILT * s1)) / SQ_NORM;
}
