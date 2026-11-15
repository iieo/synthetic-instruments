import { SR, midiToHz, rng } from '../lib/audio.mjs';
import { makeReed, makeHole, simulate, tune } from './harmonica/reed.mjs';
import { Svf, DcBlock, decimator, wander, finite, vibratoParam } from './harmonica/dsp.mjs';

// Piano accordion: treble reeds in musette (three ranks, two of them detuned), Stradella bass
// buttons (bass note in octaves) and chord buttons (triads on two ranks).
export const meta = { name: 'Accordion', range: [40, 93] };

const OS = 4;
// Fixed output scale: the loudest musette note at velocity 1 peaks near -3 dBFS.
const OUT_GAIN = 0.47;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Steel reeds on thick plates: longer and set wider than harmonica reeds; each reed has its own
// cell, and the leather valve seals the reed for the other bellows direction.
const gapFor = (f) => clamp(0.8e-3 * (f / 262) ** -0.4, 0.2e-3, 1.4e-3);
const edgeFor = (f) => 0.06e-3 * (f / 440) ** 0.5;
function buildCell(f) {
  const size = clamp(1.5 * (f / 262) ** -0.1, 1.2, 2.2);
  const reed = makeReed({ f, side: 1, gap: gapFor(f), edge: edgeFor(f), plate: 1.6e-3, size, q: 150 });
  // Bass reeds carry a tip weight: the blade is thicker for the same pitch, so full bellows
  // pressure deflects it less than the gap instead of blowing it through the slot.
  const load = Math.max(1, (f / 196) ** -2);
  reed.m *= load; reed.k *= load; reed.c *= load;
  reed.v = -0.2 * reed.gap * 2 * Math.PI * f;
  return makeHole([reed], { width: 5e-3, height: 7e-3, depth: 22e-3 * size / 1.5, lipLen: 8e-3 });
}

const CHORDS = { maj: [0, 4, 7], min: [0, 3, 7], 7: [0, 4, 10], dim: [0, 3, 9] };
const MUSETTE_CENTS = [0, -15, 15];

function ranks(midi, voice, chord) {
  if (voice === 'bass') return [{ m: midi, c: 0, g: 1 }, { m: midi + 12, c: 0, g: 0.6 }];
  if (voice === 'chord') {
    return CHORDS[chord].flatMap((iv) => [{ m: midi + iv, c: 0, g: 0.8 }, { m: midi + iv + 12, c: 0, g: 0.5 }]);
  }
  return MUSETTE_CENTS.map((c, i) => ({ m: midi, c, g: i === 0 ? 1 : 0.85 }));
}

const W = 'accordion.render';

export function render({
  midi = 60, velocity = 0.8, duration = 1, seed = 1, bend = 0, vibrato,
  voice = 'musette', chord = 'maj', attack,
} = {}) {
  if (!['musette', 'bass', 'chord'].includes(voice)) throw new Error(`${W}: unknown voice ${voice}`);
  if (!Object.hasOwn(CHORDS, chord)) throw new Error(`${W}: unknown chord ${chord}`);
  midi = clamp(finite(W, 'midi', midi), meta.range[0], meta.range[1]);
  const r = rng(((finite(W, 'seed', seed) * 7919) ^ (midi * 104729)) >>> 0);
  const v = clamp(finite(W, 'velocity', velocity), 0.02, 1);
  duration = Math.max(0, finite(W, 'duration', duration));
  bend = finite(W, 'bend', bend);
  if (attack !== undefined) attack = Math.max(0, finite(W, 'attack', attack));
  const Pnom = 180 + 1100 * v ** 1.4;
  const tAtk = attack ?? (voice === 'musette' ? 0.05 - 0.03 * v : 0.025);
  const tRel = voice === 'musette' ? 0.06 : 0.035;
  const nHold = Math.max(1, Math.round(duration * SR));
  const n = nHold + Math.round(0.25 * SR);
  const vib = vibratoParam(W, vibrato, { rate: 5.5, depth: 0.5 });

  // Bellows pressure: the pallet opens quickly, the bellows hold a slowly drifting pressure;
  // bellows shake gives a pressure tremolo.
  const drift = wander(r, 1.5, n);
  const P = new Float64Array(n), pallet = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = t < tAtk ? 0.5 - 0.5 * Math.cos((Math.PI * t) / tAtk) : 1;
    const rr = i < nHold ? 1 : Math.max(0, 1 - (i - nHold) / (tRel * SR));
    const shake = vib ? 1 + 0.25 * vib.depth * Math.sin(2 * Math.PI * vib.rate * t) : 1;
    pallet[i] = 0.5 - 0.5 * Math.cos(Math.PI * rr);
    P[i] = Pnom * a * pallet[i] * (1 + 0.015 * drift[i]) * shake;
  }

  const kAt = bend ? (t) => 2 ** ((bend * Math.min(1, t / 0.15)) / 6) : null;
  const flow = new Float64Array(n * OS);
  for (const { m, c, g } of ranks(midi, voice, chord)) {
    const f = midiToHz(m) * 2 ** ((c + (2 * r() - 1) * 1.5) / 1200);
    const hole = buildCell(tune(buildCell, f, Pnom, SR, OS, 'acc'));
    const fl = simulate(hole, P, SR, OS, kAt);
    for (let i = 0; i < fl.length; i++) flow[i] += g * fl[i];
  }

  const dU = new Float64Array(flow.length);
  for (let i = 1; i < flow.length; i++) dU[i] = (flow[i] - flow[i - 1]) * SR * OS;
  const x = decimator(OS)(dU);

  // Reed block, pallet holes and grille: a low-mid cavity bump and a soft treble roll-off.
  const grille = new Svf(), grille2 = new Svf(), cavity = new Svf(), dc = new DcBlock(40);
  grille.set(voice === 'musette' ? 5000 : 3200, 0.6);
  grille2.set(8000, 0.6);
  cavity.set(voice === 'musette' ? 900 : 450, 1.4);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = grille2.tick(grille.tick(x[i]));
    cavity.tick(s);
    s += 0.35 * cavity.bp * cavity.k;
    // The closing pallet also covers the hole, so the release swell of the reeds is not radiated.
    y[i] = dc.tick(s) * pallet[i];
  }
  let rms = 0, pk = 0;
  for (let i = 0; i < n; i++) { if (i < nHold) rms += y[i] * y[i]; pk = Math.max(pk, Math.abs(y[i])); }
  // Floored against the peak so that a weak sustain cannot inflate the attack: no note peaks
  // above 5 * OUT_GAIN * level.
  rms = Math.max(Math.sqrt(rms / nHold), pk / 5) || 1;
  const level = { musette: 0.3, bass: 0.32, chord: 0.2 }[voice] ?? 0.3;
  const gain = (OUT_GAIN * level * (0.35 + 0.65 * v)) / rms;
  const fade = Math.round(0.004 * SR);
  for (let i = 0; i < n; i++) y[i] *= gain;
  for (let i = 0; i < fade; i++) { y[n - 1 - i] *= i / fade; y[i] *= i / fade; }
  return y;
}
