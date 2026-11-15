import { Biquad } from '../trumpet/dsp.mjs';

function highpass(fc, q, sr) {
  const f = new Biquad(), w = 2 * Math.PI * fc / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  f.b0 = f.b2 = (1 + c) / 2 / a0; f.b1 = -(1 + c) / a0; f.a1 = -2 * c / a0; f.a2 = (1 - al) / a0;
  return f;
}

// Radiation filters for mutes placed in the bell.
// Straight mute: a hollow cone sealed by cork strips. Below its own Helmholtz resonance (the
// cone volume against the open ring gap) little sound passes, so the lows are cut; the narrow ring
// gap adds a nasal band near 1.8 kHz and a buzzy band near 4.5 kHz.
// Bucket mute: a felt-lined can held in front of the bell; the felt absorbs the highs.
export function muteFilters(kind, sr) {
  if (kind === 'mute') return [highpass(620, 0.9, sr), Biquad.peak(1800, 1.6, 8, sr), Biquad.peak(4500, 2.2, 4, sr), Biquad.lowpass(7500, 0.7, sr)];
  if (kind === 'bucket') return [Biquad.lowpass(1100, 0.55, sr), Biquad.peak(320, 1, 2, sr), Biquad.lowpass(3000, 0.7, sr)];
  return [];
}
