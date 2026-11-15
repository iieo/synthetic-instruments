import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/harpsichord.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const beat = 60 / 104;
const [L, R] = buffer(24.5, 2);
let seed = 1;
// The bass strings sit on the right of the bentside as seen by the listener, the treble on the left.
function note(t, midi, dur, preset = '8ft', velocity = 0.7) {
  const y = render({ midi, preset, velocity, duration: dur, seed: seed++ });
  const p = -0.5 + (midi - 29) / 60, th = ((-p * 0.6 + 1) * Math.PI) / 4, s = Math.round(t * SR);
  mixInto(L, y, s, Math.cos(th)); mixInto(R, y, s, Math.sin(th));
}

// 1. Two voices on the front 8-foot: a running upper line over a stepping bass.
const upper = [69, 72, 76, 74, 72, 71, 72, 69, 67, 71, 74, 72, 71, 69, 71, 67, 65, 69, 72, 71, 69, 67, 69, 65, 64, 67, 71, 69, 68, 64, 68, 71];
const lower = [45, 52, 43, 50, 41, 48, 40, 47];
let t = 0.15;
upper.forEach((m, i) => note(t + i * beat * 0.5, m, beat * 0.45));
lower.forEach((m, i) => note(t + i * beat * 2, m, beat * 1.9, '8ft', 0.75));
t += upper.length * beat * 0.5 + 0.3;

// 2. The same idea an octave lower on the 4-foot, which sounds at the written pitch again.
const run = [57, 60, 64, 62, 60, 59, 60, 57, 55, 59, 62, 60, 59, 57, 56, 52];
run.forEach((m, i) => note(t + i * beat * 0.5, m, beat * 0.45, '4ft'));
t += run.length * beat * 0.5 + 0.3;

// 3. Lute stop: plucked chords, quiet and short like a lute.
[[45, 57, 60, 64], [43, 55, 59, 62], [41, 53, 57, 60], [40, 52, 56, 59]].forEach((c, i) => {
  c.forEach((m, k) => note(t + i * beat * 1.5 + k * 0.045, m, beat * 1.2, 'lute', 0.8));
});
t += 6 * beat + 0.2;

// 4. Both 8-foot choirs coupled: a cadence with a spread final chord that rings out.
[[0, [40, 52, 59, 64, 68]], [1.5, [45, 52, 57, 60, 64, 69]]].forEach(([b, c]) => {
  c.forEach((m, k) => note(t + b * beat + k * 0.05, m, b ? 4.5 : beat * 1.4, '8ft+8ft', 0.9));
});

const ch = normalizePeak([L, R], -3);
writeWav(outPath('harpsichord.wav'), ch);
const s = stats(ch);
console.log(`harpsichord.wav: ${(L.length / SR).toFixed(1)} s, peak ${s.peakDb.toFixed(2)} dBFS, max jump ${s.maxJump.toFixed(4)}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
