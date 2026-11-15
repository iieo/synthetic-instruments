import { SR, buffer, mixInto, normalizePeak, stats, writeWav } from '../lib/audio.mjs';
import { render } from '../instruments/organ.mjs';
import { churchReverb } from '../instruments/organ/reverb.mjs';
import { outPath } from './lib/out.mjs';

const BEAT = 1.1;
const notes = [];

// Plays a chorale phrase. Chords are [midi...] by voice; a voice that keeps its pitch into the
// next chord is held (tied) instead of being struck again, as an organist would play it.
function phrase(startBeat, chords, stops, vel = 1, gap = 0.05) {
  let b = startBeat;
  const open = [];
  chords.forEach(({ notes: ns, len }) => {
    ns.forEach((m, v) => {
      if (open[v] && open[v].midi === m) { open[v].dur += len * BEAT; return; }
      if (open[v]) notes.push(open[v]);
      open[v] = { t: b * BEAT, midi: m, dur: len * BEAT, stops, voice: v, vel };
    });
    b += len;
  });
  for (const o of open) if (o) notes.push(o);
  for (const o of notes) if (o.stops === stops) o.dur -= gap;
  return b;
}

const ch = (notes, len = 1) => ({ notes, len });

// 1. Soft stopped flute.
const gedackt = ['gedackt8'];
let b = phrase(0, [
  ch([43, 59, 62, 67]), ch([42, 57, 62, 69]), ch([40, 55, 59, 71]), ch([36, 55, 64, 72]),
  ch([38, 54, 62, 69]), ch([43, 55, 62, 67], 2),
], gedackt, 1.7);

// 2. Principal chorus 8' 4' 2'.
const chorus = ['principal8', 'octave4', 'superoctave2'];
b = phrase(b + 0.6, [
  ch([40, 55, 64, 71]), ch([45, 57, 64, 72]), ch([43, 59, 62, 71]), ch([36, 55, 64, 72]),
  ch([47, 54, 62, 74]), ch([40, 55, 64, 71]), ch([45, 57, 61, 69]), ch([38, 57, 62, 66], 2),
], chorus);

// 3. Full organ with reed on the manual and a moving pedal line under it.
const full = ['principal8', 'octave4', 'superoctave2', 'mixture', 'trumpet8'];
const pedal = ['subbass16', 'principal8', 'trombone16'];
const s3 = b + 0.6;
const end = phrase(s3, [
  ch([59, 62, 71]), ch([60, 64, 72]), ch([62, 66, 74]), ch([62, 67, 74]),
  ch([64, 67, 72]), ch([62, 66, 69]), ch([60, 66, 69]), ch([59, 62, 67], 3),
], full);
const ped = [[43, 0.5], [47, 0.5], [45, 0.5], [48, 0.5], [50, 0.5], [48, 0.5], [47, 0.5], [43, 0.5],
  [48, 0.5], [45, 0.5], [50, 1], [38, 1], [43, 3]];
let pb = s3;
for (const [m, len] of ped) { notes.push({ t: pb * BEAT, midi: m, dur: len * BEAT - 0.06, stops: pedal, voice: 9, vel: 1 }); pb += len; }

const t0 = performance.now();
const total = end * BEAT + 4.5;
const [L, R] = buffer(total, 2);
notes.forEach((n, i) => {
  const x = render({ midi: n.midi, duration: n.dur, seed: i + 1, stops: n.stops, velocity: n.vel });
  // Pipes stand on two chests, C side and C-sharp side, left and right of the case.
  const pan = n.voice === 9 ? 0.5 + (n.midi % 2 ? 0.08 : -0.08) : 0.5 + (n.midi % 2 ? 0.2 : -0.2);
  const start = Math.round(n.t * SR);
  mixInto(L, x, start, Math.cos((pan * Math.PI) / 2));
  mixInto(R, x, start, Math.sin((pan * Math.PI) / 2));
});

const [outL, outR] = churchReverb(L, R);
const fadeN = Math.round(0.3 * SR);
for (let i = 0; i < fadeN; i++) {
  const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeN);
  outL[outL.length - 1 - i] *= g; outR[outR.length - 1 - i] *= g;
}
normalizePeak([outL, outR], -3);
writeWav(outPath('organ.wav'), [outL, outR]);
console.log(`${notes.length} notes, ${total.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('organ.wav', stats([outL, outR]));
