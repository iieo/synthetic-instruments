import { SR, mixInto, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/arcade-sfx.mjs';
import { truePeakDb } from '../instruments/acid/dsp.mjs';
import { outPath } from './lib/out.mjs';

// An invented attract-and-play sequence: coin and jingle, a steady bass march with power-ups and
// coins over it, then a saucer that is shot down, siren, alarm, engine and the losing jingle.
const out = new Float64Array(Math.round(32 * SR));
const put = (sec, args, gain = 1) => mixInto(out, render(args), Math.round(sec * SR), gain);

put(0.2, { voice: 'coin', velocity: 0.9 }, 0.8);
put(0.8, { voice: 'coin', midi: 91, velocity: 0.9 }, 0.8);
put(1.5, { voice: 'fanfare', velocity: 0.9 }, 0.8);

// The march at one steady tempo, its root moving between three notes.
const TEMPO = 132, bar = 4 * 60 / TEMPO;
let t = 3;
[40, 45, 40, 43].forEach((midi, k) => {
  put(t + k * bar, { voice: 'march', midi, tempo: TEMPO, length: bar, velocity: 0.95, seed: k + 1 }, 0.9);
});
const marchStart = t, marchEnd = t + 4 * bar;
[0.5, 1.5, 2.5].forEach((b, k) => put(marchStart + b * bar, { voice: 'coin', midi: 84 + 3 * k, velocity: 0.8 }, 0.6));
put(marchStart + 3 * bar, { voice: 'powerup', midi: 60, velocity: 0.9 }, 0.7);
put(marchStart + 3.5 * bar, { voice: 'powerup', midi: 67, velocity: 0.9, length: 0.7 }, 0.7);

// The saucer crosses alone, shots and hits, then it explodes.
const fight = marchEnd + 0.3, flight = 5;
put(fight, { voice: 'ufo', length: flight, velocity: 0.7, seed: 4 }, 0.5);
const shots = [0.6, 1.3, 1.7, 2.6, 3.0, 3.8, 4.2];
shots.forEach((s, k) => {
  put(fight + s, { voice: 'laser', midi: 90 + (k * 5) % 12, velocity: 0.8, seed: k }, 0.45);
  if (k % 2 === 1) put(fight + s + 0.28, { voice: 'hit', midi: 52 + (k % 4) * 3, velocity: 0.8, seed: k }, 0.6);
});
put(fight + flight - 0.1, { voice: 'explosion', length: 2.6, velocity: 1, seed: 7 }, 1);
const fightEnd = fight + flight;

let u = fightEnd + 2.4;
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
