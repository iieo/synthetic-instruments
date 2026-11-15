import { config as violinCfg } from '../violin.mjs';
import { config as celloCfg } from '../cello.mjs';
import { makeBody } from '../strings-bowed/body.mjs';

// The viola body is about 15 % larger than the violin's; its signature modes sit roughly a fifth
// lower relative to the strings, so the violin modes are scaled down instead of measured anew.
const violaBody = {
  modes: violinCfg.body.modes.map((m) => ({ ...m, f: m.f * 0.8 })),
  dense: {
    from: 900, to: 8000, count: 26, q: 21,
    envelope: (f) => 0.1 + 0.8 * Math.exp(-0.5 * (Math.log2(f / 2300) / 0.5) ** 2),
  },
  lowpassHz: 6500, lowpassOrder: 2,
  seed: 17,
};

// Every player has an own instrument: three body variants per section with the modes shifted by a
// few percent and a different dense mode field, so no single body resonance dominates a note.
function bodies(body) {
  return [0.955, 1, 1.045].map((s, i) => makeBody({
    ...body,
    modes: body.modes.map((m, j) => ({ ...m, f: m.f * s * (1 + 0.02 * Math.sin(7.3 * j + 3.1 * i)) })),
    seed: body.seed + 101 * i,
  }));
}

// pan: seating from the conductor's view (violins left, violas centre right, cellos right).
export const SECTIONS = {
  violin: { cfg: violinCfg, bodies: bodies(violinCfg.body), hp: 180, t60: 1.6, pan: [-0.8, -0.15], pizzT60: 0.7, gain: 1 },
  viola: { cfg: violinCfg, bodies: bodies(violaBody), hp: 120, t60: 2.0, pan: [-0.05, 0.45], pizzT60: 0.9, gain: 1.15 },
  cello: { cfg: celloCfg, bodies: bodies(celloCfg.body), hp: 62, t60: 2.5, pan: [0.3, 0.85], pizzT60: 1.3, gain: 1.1 },
};

// Which players take a note: the section whose comfortable register holds it, two sections where
// registers overlap. Between 8 and 10 players per note.
export function seating(midi) {
  if (midi < 48) return [['cello', 8]];
  if (midi < 55) return [['cello', 5], ['viola', 4]];
  if (midi < 62) return [['viola', 5], ['violin', 5]];
  return [['violin', 10]];
}
