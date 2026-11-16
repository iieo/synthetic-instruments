import { SR, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/arcade-sfx.mjs';
import { truePeakDb } from '../instruments/acid/dsp.mjs';
import { outPath } from './lib/out.mjs';

// An invented attract-and-play sequence: coin, jingle, a bass march that speeds up while shots,
// hits and a warbling saucer fly over it, an explosion, a power-up, then siren, alarm, engine
// and the losing jingle.
const out = new Float64Array(Math.round(31 * SR));
const put = (sec, args, gain = 1) => mixInto(out, render(args), Math.round(sec * SR), gain);

put(0.2, { voice: 'coin', velocity: 0.9 }, 0.8);
put(0.8, { voice: 'coin', midi: 91, velocity: 0.9 }, 0.8);
put(1.5, { voice: 'fanfare', velocity: 0.9 }, 0.8);

// The march: eight segments of four steps, each a little faster.
let t = 3;
const marchStart = t;
for (let k = 0; k < 8; k++) {
  const tempo = 100 + 22 * k, len = 4 * 60 / tempo;
  put(t, { voice: 'march', tempo, length: len, velocity: 0.95, seed: k + 1 }, 0.9);
  t += len;
}
const marchEnd = t;

put(marchStart + 0.6, { voice: 'ufo', length: marchEnd - marchStart - 0.6, velocity: 0.55, seed: 4 }, 0.35);
const shots = [0.9, 1.7, 2.2, 3.1, 3.5, 4.4, 4.8, 5.1, 6.0, 6.3, 6.6, 7.4];
shots.forEach((s, k) => {
  put(marchStart + s, { voice: 'laser', midi: 92 + (k * 5) % 12, velocity: 0.8, seed: k }, 0.45);
  if (k % 3 === 1) put(marchStart + s + 0.28, { voice: 'hit', midi: 52 + (k % 4) * 3, velocity: 0.8, seed: k }, 0.6);
});
put(marchEnd - 0.1, { voice: 'explosion', length: 2.6, velocity: 1, seed: 7 }, 1);
put(marchEnd + 1.8, { voice: 'powerup', midi: 60, velocity: 0.9 }, 0.8);
put(marchEnd + 2.6, { voice: 'powerup', midi: 67, velocity: 0.9, length: 0.7 }, 0.8);

let u = marchEnd + 3.8;
put(u, { voice: 'siren', length: 4.2, tempo: 50, velocity: 0.8 }, 0.5);
put(u + 4.4, { voice: 'alarm', length: 2.2, velocity: 0.8 }, 0.45);
put(u + 6.8, { voice: 'engine', rpm: 1300, length: 1.6, velocity: 0.9, seed: 3 }, 0.8);
put(u + 8.2, { voice: 'engine', rpm: 3600, length: 1.8, velocity: 0.9, seed: 4 }, 0.8);
put(u + 10.3, { voice: 'lose', velocity: 0.9 }, 0.8);

let end = out.length;
while (end > 0 && out[end - 1] === 0) end--;
const y = out.subarray(0, Math.min(out.length, end + Math.round(0.3 * SR)));
let peak = 0;
for (const v of y) peak = Math.max(peak, Math.abs(v));
const g = 10 ** (-1 / 20) / peak;
for (let i = 0; i < y.length; i++) y[i] *= g;
writeWav(outPath('arcade-sfx.wav'), [y]);
console.log('out/arcade-sfx.wav', (y.length / SR).toFixed(2), 's', { ...stats([y]), truePeakDb: truePeakDb(y) });
