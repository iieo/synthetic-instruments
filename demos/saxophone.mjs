import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/saxophone.mjs';
import { room } from '../instruments/trumpet/room.mjs';
import { outPath } from './lib/out.mjs';

// Three short phrases: alto in D minor, a subtone tenor ballad line, a growled riff.
const notes = [];
let clock = 0.3;
function phrase(bpm, preset, list, gap = 0.6) {
  const beat = 60 / bpm;
  let b = 0;
  list.forEach(([midi, beats, velocity, art = 'tongue', extra = {}], i) => {
    if (midi != null) {
      const legatoNext = list[i + 1] && list[i + 1][3] === 'legato';
      const duration = art === 'stacc' ? Math.min(0.14, beats * beat * 0.5) : beats * beat * (legatoNext ? 1.0 : 0.88);
      notes.push({ t: clock + b * beat - (art === 'legato' ? 0.012 : 0), opts: { preset, midi, velocity, duration, articulation: art === 'legato' ? 'legato' : 'tongue', seed: 20 + notes.length, ...extra } });
    }
    b += beats;
  });
  clock += b * beat + gap;
}
const L = 'legato', S = 'stacc';

phrase(96, 'alto', [
  [62, 0.5, 0.6], [65, 0.5, 0.65, L], [69, 1, 0.7, L], [67, 0.5, 0.65], [65, 0.5, 0.6, L], [64, 1, 0.6, L],
  [62, 0.5, 0.65, S], [64, 0.5, 0.65, S], [65, 0.5, 0.7, S], [67, 0.5, 0.7, S], [69, 0.5, 0.75], [72, 0.5, 0.8, L],
  [74, 2, [0.6, 0.95], L], [72, 0.5, 0.8], [69, 0.5, 0.75, L], [70, 1, 0.7, L], [69, 2.5, [0.7, 0.4], L],
]);
phrase(64, 'soft', [
  [51, 1, 0.45], [55, 1, 0.5, L], [58, 1.5, 0.55, L], [56, 0.5, 0.5, L], [55, 1, 0.5, L], [53, 1, 0.45, L],
  [51, 0.5, 0.45], [53, 0.5, 0.5, L], [55, 0.5, 0.5, L], [60, 0.5, 0.55, L], [58, 3, [0.6, 0.25], L],
], 0.8);
phrase(112, 'growl', [
  [55, 0.5, 0.8, S], [58, 0.5, 0.85, S], [60, 1, 0.9], [null, 0.5], [58, 0.5, 0.85, S], [60, 0.5, 0.9],
  [63, 1.5, 0.95, L], [60, 0.5, 0.85], [58, 0.5, 0.8, L], [55, 2.5, [0.9, 0.6], L],
]);
phrase(80, 'tenor', [
  [55, 1, 0.55], [62, 1, 0.65, L], [60, 1, 0.6, L], [58, 1, 0.55, L], [55, 3, [0.55, 0.2], L],
], 0.2);

const total = clock + 2.5;
const [dry] = buffer(total);
const t0 = performance.now();
for (const { t, opts } of notes) mixInto(dry, render(opts), Math.round(t * SR));
const fade = Math.round(1.5 * SR);
for (let i = 0; i < fade; i++) dry[dry.length - 1 - i] *= i / fade;
const [Lc, Rc] = room(dry, { wet: 0.3, rt60: 1.7 });
const end = Math.round(0.4 * SR);
for (let i = 0; i < end; i++) { const g = 0.5 - 0.5 * Math.cos(Math.PI * i / end); Lc[Lc.length - 1 - i] *= g; Rc[Rc.length - 1 - i] *= g; }
Lc[0] = Rc[0] = 0;
normalizePeak([Lc, Rc], -3);
writeWav(outPath('saxophone.wav'), [Lc, Rc]);
console.log('out/saxophone.wav', (Lc.length / SR).toFixed(1) + ' s', notes.length + ' notes', stats([Lc, Rc]), Math.round(performance.now() - t0) + ' ms');
