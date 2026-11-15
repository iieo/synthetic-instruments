import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/didgeridoo.mjs';
import { room } from '../instruments/trumpet/room.mjs';
import { outPath } from './lib/out.mjs';

// A drone on D at 96 bpm in three breaths: spoken vowel rhythm, pulsing breath with toots, a slow wow.
const beat = 60 / 96;
const vowels = (pattern) => pattern.map(([b, v]) => [b * beat, v]);

const parts = [
  {
    t: 0.2, opts: {
      preset: 'drone', midi: 38, velocity: 0.75, duration: 16 * beat, seed: 4,
      vowel: vowels([[0, 0.1], [3.5, 0.1], [4, 0.7], [4.5, 0.15], [5.5, 0.15], [6, 0.8], [6.5, 0.2], [7, 0.6], [7.5, 0.1],
        [11.5, 0.1], [12, 0.9], [12.25, 0.3], [12.75, 0.9], [13, 0.3], [13.5, 0.8], [14, 0.1], [16, 0.1]]),
    },
  },
  {
    t: 0.2 + 16.4 * beat, opts: {
      preset: 'pulse', midi: 38, velocity: 0.85, duration: 16 * beat, seed: 4, pulse: 96 / 60 * 2, breathe: 8 * beat,
      vowel: vowels([[0, 0.3], [6, 0.3], [8, 0.75], [10, 0.4], [16, 0.4]]),
      toot: [3 * beat, 7 * beat, 11 * beat, 13.5 * beat],
    },
  },
  {
    t: 0.2 + 32.8 * beat, opts: { preset: 'wow', midi: 38, velocity: 0.7, duration: 12 * beat, seed: 4, wow: 96 / 60 / 2, vowel: 0.1 },
  },
];

const total = 0.2 + 46 * beat;
const [dry] = buffer(total);
const t = performance.now();
for (const { t: t0, opts } of parts) mixInto(dry, render(opts), Math.round(t0 * SR));
const [L, R] = room(dry, { wet: 0.18, rt60: 1.2 });
console.log(`rendered ${parts.length} breaths in ${((performance.now() - t) / 1000).toFixed(1)} s`);
normalizePeak([L, R], -3);
console.log(stats([L, R]));
writeWav(outPath('didgeridoo.wav'), [L, R]);
