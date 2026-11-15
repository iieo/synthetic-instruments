import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/oboe.mjs';
import { room } from '../instruments/winds/room.mjs';
import { outPath } from './lib/out.mjs';

// A pastoral tune in D minor, 6/8 at 54 dotted quarters per minute: the oboe sings it first, the
// English horn answers a fifth lower, and both close it together.
// [start in eighths, midi, length in eighths, velocity, articulation]
const L = 'legato';
const oboe = [
  [0, 69, 2, 0.5], [2, 74, 1, 0.55, L], [3, 77, 2, 0.6, L], [5, 76, 1, 0.55, L],
  [6, 74, 3, 0.6], [9, 72, 2, 0.5, L], [11, 70, 1, 0.5, L],
  [12, 69, 2, 0.55], [14, 70, 1, 0.55, L], [15, 72, 1, 0.6], [16, 74, 1, 0.62], [17, 76, 1, 0.66],
  [18, 77, 4, 0.75], [22, 76, 1, 0.6, L], [23, 74, 1, 0.55, L],
  [24, 73, 2, 0.55], [26, 76, 1, 0.6, L], [27, 81, 3, 0.8, L], [30, 79, 1, 0.65, L], [31, 77, 1, 0.6, L],
  [32, 76, 1, 0.55], [33, 74, 1, 0.5, L], [34, 73, 1, 0.5, L], [35, 74, 4, 0.45, L],
];
const englishHorn = [
  [42, 62, 2, 0.5], [44, 67, 1, 0.55, L], [45, 70, 2, 0.6, L], [47, 69, 1, 0.55, L],
  [48, 67, 3, 0.6], [51, 65, 2, 0.5, L], [53, 63, 1, 0.5, L],
  [54, 62, 2, 0.55], [56, 58, 1, 0.5], [57, 60, 1, 0.5], [58, 62, 1, 0.55], [59, 65, 1, 0.55],
  [60, 64, 3, 0.6, L], [63, 61, 3, 0.5, L],
  // together: the oboe holds the melody above the horn's line
  [66, 62, 3, 0.5], [69, 57, 3, 0.45, L], [72, 58, 2, 0.5], [74, 60, 1, 0.5, L], [75, 61, 3, 0.5, L], [78, 62, 6, 0.4, L],
];
const oboeEnd = [
  [66, 74, 2, 0.5], [68, 77, 1, 0.55, L], [69, 76, 3, 0.55, L], [72, 74, 2, 0.5], [74, 72, 1, 0.5, L],
  [75, 73, 3, 0.55, L], [78, 74, 6, 0.45, L],
];

const eighth = 60 / 54 / 3, start = 0.3;
const parts = [[oboe, 'oboe'], [englishHorn, 'english-horn'], [oboeEnd, 'oboe']];
const total = start + 84 * eighth + 3;
const [dry] = buffer(total);
const t = performance.now();
let k = 0;
for (const [line, preset] of parts) {
  line.forEach(([at, midi, len, velocity, art = 'tongue'], i) => {
    const next = line[i + 1];
    const slur = next && next[4] === L && next[0] === at + len;
    const t0 = start + at * eighth - (art === L ? 0.03 : 0);
    const duration = slur ? len * eighth + 0.03 : len * eighth * 0.88;
    mixInto(dry, render({ midi, velocity, duration, seed: 21 + k++, preset, articulation: art === L ? 'legato' : 'tongue' }), Math.round(t0 * SR));
  });
}
const wet = room(dry, { rt60: 1.7, wet: 0.2 });
console.log(`rendered ${k} notes in ${((performance.now() - t) / 1000).toFixed(1)} s`);
normalizePeak([wet], -3);
console.log(stats([wet]));
writeWav(outPath('oboe.wav'), [wet]);
