import { SR, midiToHz } from '../lib/audio.mjs';
import { finish, lowpass } from './reese/osc.mjs';

const OS = 4, FS = SR * OS;

const PRESETS = {
  clean: { drop: 6, dropTau: 0.028, decay: 1.6, tri: 0, h2: 0.03, drive: 0, slide: 0.06, release: 0.09, gain: 0.8 },
  distorted: { drop: 9, dropTau: 0.032, decay: 1.4, tri: 0.25, h2: 0.08, drive: 4, post: 3800, slide: 0.06, release: 0.08, gain: 0.675 },
  slide: { drop: 4, dropTau: 0.025, decay: 2, tri: 0.1, h2: 0.05, drive: 1.5, post: 5000, slide: 0.11, slideFrom: -5, slideDelay: 0.03, release: 0.1, gain: 0.76 },
};

export const meta = { name: '808 Sub Bass', presets: Object.keys(PRESETS), range: [24, 60] };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rc = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));

// Triangle as a short sum of odd sine harmonics, so it stays band-limited by construction.
function tri(ph) {
  let y = 0;
  for (let k = 0; k < 5; k++) {
    const h = 2 * k + 1;
    y += (k % 2 ? -1 : 1) * Math.sin(2 * Math.PI * h * ph) / (h * h);
  }
  return y * 8 / (Math.PI * Math.PI);
}

// One continuous oscillator for a whole line of notes. A note with `slide` does not retrigger: the
// pitch glides from the previous note and the envelope keeps running. Otherwise the amplitude
// ramps from wherever it is to the new peak in a few milliseconds, so retriggers never click.
function core(p, notes, total) {
  const n = Math.round(total * FS);
  const out = new Float64Array(n);
  const ev = notes.map((e) => ({ ...e, s: Math.round(e.t * FS), off: Math.round((e.t + e.duration) * FS) })).sort((a, b) => a.s - b.s);
  const aSlide = 1 - Math.exp(-1 / (Math.max(0.005, p.slide / 3) * FS));
  const nAtk = Math.round(0.003 * FS), nRel = Math.round(p.release * FS);
  const kDecay = Math.exp(-1 / (p.decay * FS));
  const post = p.post ? [lowpass(p.post, 0.6, FS), lowpass(p.post, 0.6, FS)] : null;
  let k = 0, ph = 0, pitch = ev.length ? ev[0].midi : 36, target = pitch;
  let level = 0, from = 0, peak = 0, atk = -1, rel = -1, relFrom = 0, decay = 1, tDrop = 1e9, vel = 1, off = -1;
  let slideHold = 0;
  for (let i = 0; i < n; i++) {
    while (k < ev.length && ev[k].s <= i) {
      const e = ev[k++];
      vel = clamp(e.velocity ?? 0.8, 0.05, 1);
      off = e.off;
      if (e.slide && level > 0) {
        target = e.midi;
        // Legato into a note whose predecessor already started releasing: ramp back up, don't jump.
        if (rel >= 0) { from = level; atk = 0; }
        rel = -1;
      } else {
        rel = -1;
        pitch = e.slideFrom != null ? e.slideFrom : e.midi;
        target = e.midi;
        slideHold = e.slideFrom != null ? Math.round((e.slideDelay ?? 0) * FS) : 0;
        from = level; peak = 0.55 + 0.45 * vel; atk = 0; decay = 1; tDrop = 0;
      }
    }
    if (i === off) { rel = 0; relFrom = level; }
    if (slideHold > 0) slideHold--; else pitch += (target - pitch) * aSlide;

    if (atk >= 0) {
      decay *= kDecay;
      level = from + (peak * decay - from) * rc(atk / nAtk);
      if (++atk > nAtk) atk = -1;
    } else if (level > 0) {
      decay *= kDecay;
      level = peak * decay;
    }
    if (rel >= 0) {
      level = Math.min(level, relFrom * (rel >= nRel ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * rel / nRel)));
      rel++;
      if (rel > nRel) { level = 0; rel = -1; off = -1; atk = -1; }
    }

    const drop = p.drop * (0.5 + 0.5 * vel) * Math.exp(-tDrop / (p.dropTau * FS));
    tDrop++;
    ph += midiToHz(pitch + drop) / FS;
    ph -= Math.floor(ph);
    let y = (1 - p.tri) * Math.sin(2 * Math.PI * ph) + p.tri * tri(ph) + p.h2 * Math.sin(4 * Math.PI * ph);
    y *= level;
    if (p.drive) {
      const d = p.drive * (0.4 + 0.6 * vel);
      y = (Math.tanh(d * (y + 0.03)) - Math.tanh(d * 0.03)) / Math.tanh(d);
      y = post[1].tick(post[0].tick(y));
    } else if (post) y = post[1].tick(post[0].tick(y));
    out[i] = y;
  }
  return finish([out], OS, { dcHz: 6, gain: p.gain })[0];
}

// Legato line: notes [{ t, midi, duration, velocity, slide }] in seconds.
export function renderSequence({ preset = 'clean', notes, tail = 0.3 }) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset ${preset}`);
  if (!Array.isArray(notes)) throw new Error('notes must be an array of { t, midi, duration }');
  if (!notes.length) return new Float64Array(Math.max(2, Math.round(tail * SR)));
  const end = Math.max(...notes.map((e) => e.t + e.duration));
  return core(p, notes, end + p.release + tail);
}

export function render({ preset = 'clean', midi = 36, velocity = 0.8, duration = 1, slideFrom }) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset ${preset}`);
  const gate = Math.max(0.02, duration);
  const sf = slideFrom ?? (p.slideFrom != null ? midi + p.slideFrom : undefined);
  const note = { t: 0, midi, duration: gate, velocity, slideFrom: sf, slideDelay: p.slideDelay };
  return core(p, [note], gate + p.release + 0.02);
}
