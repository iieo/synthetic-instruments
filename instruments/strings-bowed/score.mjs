import { SR, buffer, mixInto, normalizePeak, stats } from '../../lib/audio.mjs';

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// "A4", "F#3", "Bb2" -> MIDI; "r" -> rest
export function noteToMidi(s) {
  if (s === 'r') return null;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// Each phrase: { at: seconds, notes: [[name, dur, vel, velEnd?, slur?], ...] }
export function renderScore(inst, phrases, { seed = 1 } = {}) {
  const parts = phrases.map((ph, i) => ({
    at: ph.at,
    y: inst.renderPhrase({
      seed: seed + i,
      notes: ph.notes.map(([name, dur, vel, velEnd, slur]) => ({
        midi: noteToMidi(name), dur, vel, velEnd: velEnd ?? vel, slur: !!slur,
      })),
    }),
  }));
  const len = Math.max(...parts.map((p) => p.at + p.y.length / SR)) + 0.2;
  const [out] = buffer(len);
  for (const p of parts) mixInto(out, p.y, Math.round(p.at * SR));
  normalizePeak([out], -3);
  return { out, stats: stats([out]) };
}
