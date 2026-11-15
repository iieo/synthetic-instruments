// Key-dependent physical parameters of a concert grand, interpolated between anchor keys.
// Anchor values are rounded from published measurements (see docs/piano.md).

function interp(points, m, log = true) {
  if (m <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [m1, v1] = points[i];
    if (m <= m1) {
      const [m0, v0] = points[i - 1];
      const t = (m - m0) / (m1 - m0);
      return log ? Math.exp(Math.log(v0) + t * (Math.log(v1) - Math.log(v0))) : v0 + t * (v1 - v0);
    }
  }
  return points[points.length - 1][1];
}

export function stretchCents(midi) {
  return midi < 69 ? -14 * ((69 - midi) / 48) ** 2 : 22 * ((midi - 69) / 39) ** 2;
}

export function pianoParams(midi) {
  const B = interp([[21, 2.5e-4], [33, 1.4e-4], [45, 1.0e-4], [60, 3.5e-4], [72, 7e-4], [84, 2e-3], [96, 5.5e-3], [108, 1.5e-2]], midi);
  // Stretched tuning (Railsback curve, cents) applies to the sounding first partial f0·√(1+B), so f0 is the ideal-string value below it.
  const cents = stretchCents(midi);
  const f0 = 440 * 2 ** ((midi - 69) / 12 + cents / 1200) / Math.sqrt(1 + B);
  const nStrings = midi <= 28 ? 1 : midi <= 46 ? 2 : 3;

  const Lfree = 0.62 * 2 ** (-(midi - 60) / 12 * 0.92);
  const L = 1 / (Lfree ** -4 + 1.95 ** -4) ** 0.25;
  const T = interp([[21, 1500], [36, 1100], [48, 800], [108, 700]], midi);
  const mu = T / (2 * L * f0) ** 2;

  const mH = interp([[21, 11e-3], [60, 7.5e-3], [108, 4e-3]], midi);
  const p = 2.2 + 0.9 * (midi - 21) / 87;
  // Felt force at 1 mm compression; K follows from F = K * delta^p.
  const Fref = interp([[21, 300], [60, 1300], [108, 5000]], midi);
  const K = Fref / 1e-3 ** p;
  const beta = interp([[21, 0.122], [72, 0.12], [108, 0.075]], midi, false);

  // Prompt-sound T60 of the fundamental and frequency-dependent loss.
  const T60 = interp([[21, 16], [48, 10], [60, 8], [72, 6], [84, 3.5], [96, 1.6], [108, 0.6]], midi);
  const hasDamper = midi <= 89;
  const Tdamp = interp([[21, 1.0], [48, 0.5], [72, 0.26], [89, 0.16]], midi);

  return { f0, B, nStrings, L, T, mu, mH, p, K, beta, T60, hasDamper, Tdamp };
}

// Decay rate (1/s) of the in-phase string motion (prompt sound) at frequency f.
export function promptLoss(P, f) {
  const k = (x) => 0.12 * x + 0.09 * x * x;
  return 6.91 / P.T60 + k(f / 1000) - k(P.f0 / 1000);
}
