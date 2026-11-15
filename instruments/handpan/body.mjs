import { rng } from '../../lib/audio.mjs';

export const LO = 45, HI = 79;
export const DING = 50;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// The instrument itself is fixed: shell modes, the hand tuning of every note field and the split of
// its mode pairs belong to the steel, not to the stroke.
function build() {
  const r = rng(4417);
  const u = () => 2 * r() - 1;
  const shell = [];
  for (let i = 0; i < 14; i++) {
    const f = 165 * 1.27 ** i * (0.93 + 0.14 * r());
    shell.push({ f, t60: clamp(0.55 * (f / 300) ** -0.55, 0.06, 0.6) * (0.75 + 0.5 * r()), g: (0.5 + 0.5 * r()) / (1 + (f / 2500) ** 2) });
  }
  const fields = new Map();
  for (let m = LO - 24; m <= HI + 24; m++) {
    fields.set(m, {
      cents: [1.2 * u(), 2.5 * u(), 4 * u()],
      split: [0.25 + 0.6 * r(), 0.4 + 0.9 * r(), 0.6 + 1.4 * r()],
      upper: [3.85 + 0.25 * u(), 4.6 + 0.3 * u(), 5.45 + 0.35 * u(), 6.7 + 0.4 * u()],
    });
  }
  return { shell, fields };
}

export const BODY = build();

// Neighbours of a note field on a typical layout and in the shell around it: octave above and below,
// the fifth below whose third partial lands on the struck octave, the twelfth whose fundamental lands
// on the struck fifth, and the central ding.
export const NEIGHBOURS = [[12, 1], [-12, 0.9], [-7, 0.6], [7, 0.4], [19, 0.5], [-19, 0.4]];
