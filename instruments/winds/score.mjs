import { SR } from '../../lib/audio.mjs';
import { room } from './room.mjs';
import { fadeEdges } from './dsp.mjs';

// notes: [midi | null (rest), beats, velocity, articulation?] where articulation is
// 'legato' (slurred, no tongue), 'tongue' (default) or 'stacc' (short tongued note).
export function renderScore(render, notes, { bpm = 72, tail = 2.2, seed = 1, room: roomOpts, ...extra } = {}) {
  const beat = 60 / bpm;
  let total = 0;
  for (const [, b] of notes) total += b * beat;
  const out = new Float64Array(Math.round((total + tail + 0.3) * SR));
  let t = 0.15, k = 0;
  for (const [midi, beats, velocity = 0.7, art = 'tongue'] of notes) {
    const len = beats * beat;
    if (midi != null) {
      const next = notes[k + 1];
      const slurNext = next && next[3] === 'legato' && next[0] != null;
      const duration = art === 'stacc' ? Math.min(len * 0.55, 0.16) : slurNext ? len + 0.03 : len * 0.9;
      const y = render({ midi, velocity, duration, seed: seed + k, articulation: art === 'legato' ? 'legato' : 'tongue', ...extra });
      const start = Math.round(t * SR) - (art === 'legato' ? Math.round(0.03 * SR) : 0);
      for (let i = 0; i < y.length && start + i < out.length; i++) if (start + i >= 0) out[start + i] += y[i];
    }
    t += len;
    k++;
  }
  return fadeEdges(room(out, roomOpts), 2, 200);
}
