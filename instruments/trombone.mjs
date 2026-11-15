import { seedInt } from './synth/dsp.mjs';
import { play, RS } from './trombone/voice.mjs';
import { slidePlan } from './trombone/slide.mjs';
import { muteFilters } from './trombone/mute.mjs';

// Tenor trombone in B-flat, sounding E2 (seventh position, second partial) up to F5.
export const meta = { name: 'Trombone', range: [40, 77], presets: ['open', 'mute', 'bucket'] };

// Output scale outside the feedback loop (does not change tuning). Per preset, so the loudest note
// of each preset over the whole option range peaks near -3 dBFS.
const OUT_GAIN = { open: 3.74e-5, mute: 3.01e-5, bucket: 5.93e-5 };
const FROM_AT = 0.05;
const MAX_PATH = 64;

function num(x, def, name, lo, hi) {
  if (x === undefined || x === null) return def;
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`trombone: ${name} must be a finite number, got ${x}`);
  return Math.max(lo, Math.min(hi, x));
}

/**
 * velocity: 0..1, or [start, end] for a crescendo/diminuendo across the note.
 * from: start pitch (midi) of a slide glissando into `midi`; glide: seconds the slide takes per move.
 * path: [[t, midi], ...] further slide moves inside the same breath (t in seconds from note start).
 * vibrato: undefined = automatic on long notes, 0 = none, 0..2 = depth. tongue: true, false or 0..1.
 * Fractional midi values are played by the slide like any other pitch.
 */
export function render({ midi = 58, velocity = 0.8, duration = 1, preset = 'open', seed = 1, vibrato, from, glide = 0.2, path, tongue = true } = {}) {
  const [lo, hi] = meta.range;
  midi = num(midi, 58, 'midi', lo, hi);
  duration = num(duration, 1, 'duration', 0.02, 30);
  glide = num(glide, 0.2, 'glide', 0.02, 3);
  let v0 = 0.8, v1 = 0.8;
  if (Array.isArray(velocity)) {
    v0 = num(velocity[0], 0.8, 'velocity start', 0, 1);
    v1 = num(velocity.length > 1 ? velocity[1] : velocity[0], v0, 'velocity end', 0, 1);
  } else v0 = v1 = num(velocity, 0.8, 'velocity', 0, 1);
  const vib = vibrato === undefined || vibrato === null ? undefined : num(vibrato, 0, 'vibrato', 0, 2);
  let tg;
  if (tongue === undefined || tongue === null || tongue === true) tg = 1;
  else if (tongue === false) tg = 0;
  else tg = num(tongue, 1, 'tongue', 0, 1);
  if (preset === undefined || preset === null) preset = 'open';
  if (!meta.presets.includes(preset)) throw new Error(`trombone: unknown preset ${preset}`);

  const notes = [];
  if (from !== undefined && from !== null) {
    notes.push({ t: 0, midi: num(from, midi, 'from', lo, hi) }, { t: Math.min(FROM_AT, duration), midi });
  } else notes.push({ t: 0, midi });
  if (path !== undefined && path !== null) {
    if (!Array.isArray(path)) throw new Error('trombone: path must be a list of [time, midi] pairs');
    if (path.length > MAX_PATH) throw new Error(`trombone: path has more than ${MAX_PATH} entries`);
    const pts = path.map((p, i) => {
      if (!Array.isArray(p) || p.length < 2) throw new Error(`trombone: path[${i}] must be [time, midi]`);
      return { t: num(p[0], 0, `path[${i}] time`, 0, duration), midi: num(p[1], midi, `path[${i}] midi`, lo, hi) };
    }).sort((a, b) => a.t - b.t);
    const t0 = notes[notes.length - 1].t;
    for (const p of pts) notes.push({ t: Math.max(t0, p.t), midi: p.midi });
  }

  const plan = slidePlan(notes, glide);
  const s = seedInt(num(seed, 1, 'seed', -Infinity, Infinity));
  const rngSeed = (Math.imul(s, 104729) + Math.round(midi * 100) * 13 + 7) | 0;
  const y = play({ plan, v0, v1, duration, seed: rngSeed, vibrato: vib, tongue: tg, muteFilters: muteFilters(preset, RS) });
  const g = OUT_GAIN[preset];
  for (let i = 0; i < y.length; i++) y[i] *= g;
  const inN = 48, outN = 240;
  for (let i = 0; i < inN; i++) y[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / inN);
  for (let i = 0; i < outN; i++) y[y.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / outN);
  return y;
}
