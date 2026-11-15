import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/gong.mjs';
import { outPath } from './lib/out.mjs';

const t0 = performance.now();
const [L, R] = buffer(31.6, 2);
let seed = 1;
// Each gong is calibrated to the same peak; the gains here balance their loudness in the mix.
const MIX = { small: 0.8, chau: 0.3, tamtam: 1.5 };
function hit(t, preset, velocity, { midi, duration = 10, pan = 0 } = {}) {
  const y = render({ preset, velocity, midi, duration, seed: seed++ });
  const th = ((pan + 1) * Math.PI) / 4, s = Math.round(t * SR);
  mixInto(L, y, s, MIX[preset] * Math.cos(th)); mixInto(R, y, s, MIX[preset] * Math.sin(th));
}

// 1. Small gong: three strokes of rising strength, the last one blooms.
hit(0.1, 'small', 0.3, { duration: 2.5, pan: -0.4 });
hit(1.6, 'small', 0.6, { duration: 2.5, pan: -0.4 });
hit(3.1, 'small', 1, { duration: 4, pan: -0.4 });

// 2. Pitched centre gongs: a short figure on four gongs, the pitch sinks after hard strokes.
const tune = [[0, 50, 0.7], [0.9, 57, 0.6], [1.8, 55, 0.65], [2.7, 50, 0.9], [4.2, 45, 1]];
for (const [b, m, v] of tune) hit(7 + b, 'chau', v, { midi: m, duration: b === 4.2 ? 6 : 2.2, pan: 0.3 - (m - 45) / 30 });

// 3. Tam-tam: a soft stroke that stays dark, then a full stroke whose shimmer swells and is
// finally damped by hand.
hit(17.5, 'tamtam', 0.35, { duration: 4, pan: 0.1 });
hit(21.5, 'tamtam', 1, { duration: 11, pan: 0.1 });

const ch = normalizePeak([L, R], -3);
writeWav(outPath('gong.wav'), ch);
const s = stats(ch);
console.log(`gong.wav: ${(L.length / SR).toFixed(1)} s, peak ${s.peakDb.toFixed(2)} dBFS, max jump ${s.maxJump.toFixed(4)}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
