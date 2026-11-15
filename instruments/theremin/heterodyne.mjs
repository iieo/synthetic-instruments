// Beat-frequency oscillator. Two radio-frequency oscillators near 170 kHz differ by the audio
// frequency; their sum goes to an envelope detector. The phase difference phi between them obeys
// Adler's equation (Adler 1946) for weakly coupled oscillators:
//   dphi/dt = dw - K sin(phi)
// Without coupling phi grows evenly and the detector gives a pure tone. With coupling the
// oscillators pull towards each other: phi lingers near one angle and races through the rest, so
// the beat becomes asymmetric and rich in harmonics. The mean beat rate is sqrt(dw^2 - K^2), so
// for a wanted audio frequency w the free detuning is set to dw = w * sqrt(1 + kappa^2), K = kappa w.
//
// The detector sees the envelope of the sum of two sines with amplitude ratio r:
//   e = sqrt(1 + r^2 + 2 r cos(phi))
// Its harmonics fall roughly as r^n, so r sets how sharp the tone is.

// At the oversampled rate fs a harmonic folds back into the audio band only above fs - 20.5 kHz
// (about 0.89 fs); there it must have fallen below -100 dB. Returns the largest harmonic ratio
// that guarantees this for a beat at f Hz.
export function maxRatio(f, fs) {
  const h = (0.89 * fs) / f;
  return Math.exp(Math.log(1e-5) / h);
}

// Harmonic ratio of the Adler beat for a coupling kappa.
export const adlerRatio = (kappa) => (Math.sqrt(1 + kappa * kappa) - 1) / Math.max(kappa, 1e-9);

// One step of length dt (seconds) of the Adler equation, second-order Runge-Kutta.
export function adlerStep(phi, w, kappa, dt) {
  const dw = w * Math.sqrt(1 + kappa * kappa), K = kappa * w;
  const k1 = dw - K * Math.sin(phi);
  const k2 = dw - K * Math.sin(phi + 0.5 * dt * k1);
  return phi + dt * k2;
}

export const detector = (phi, r) => Math.sqrt(1 + r * r + 2 * r * Math.cos(phi));
