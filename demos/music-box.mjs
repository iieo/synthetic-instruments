import { normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { renderTune } from '../instruments/music-box.mjs';
import { outPath } from './lib/out.mjs';

// The built-in waltz as the cylinder plays it, with the spring running down towards the end.
const t0 = performance.now();
const x = renderTune({ seed: 3, tempo: 96, windDown: 0.7, jitter: 1 });
normalizePeak([x], -3);
writeWav(outPath('music-box.wav'), [x]);
console.log(`${(x.length / 48000).toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('music-box.wav', stats([x]));
