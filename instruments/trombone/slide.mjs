// Slide and partial logic of a tenor trombone in B-flat.
// The closed instrument has the harmonic series n * 58.27 Hz (pedal B-flat 1). Pulling the slide
// lengthens the tube and lowers the whole series; positions 1 to 7 are 0 to 6 semitones down.
// Slide values are in semitones below the nominal first position.

export const PEDAL = 34;
export const PARTIALS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
// The tuning slide is set so that the slide on its stops plays 0.35 semitones sharp; players hold
// first position slightly out and can push in to lip flat partials up. The outer end is the
// mechanical end of the slide tubes.
export const S_MIN = -0.35, S_MAX = 6.4;
// Fastest slide motion: about 0.6 m (first to seventh position) in 0.12 s.
export const SLIDE_SPEED = 0.02;
export const L1 = 2.94;

export const openPitch = (n) => PEDAL + 12 * Math.log2(n);
export const slideFor = (n, midi) => openPitch(n) - midi;
// On the highest partial the lips no longer hold the note in the long positions.
export const sMax = (n) => (n >= 12 ? 2.2 : S_MAX);
export const fits = (n, midi) => { const s = slideFor(n, midi); return s >= S_MIN - 1e-9 && s <= sMax(n) + 1e-9; };

// Distance in metres the hand moves the slide out from its stops (the tubing doubles back, so the
// air column grows by twice this).
export const slideMetres = (s) => L1 * (2 ** (s / 12) - 2 ** (S_MIN / 12)) / 2;

// Standard choice: the partial that needs the shortest slide.
export function position(midi) {
  let best = null;
  for (const n of PARTIALS) {
    if (!fits(n, midi)) continue;
    const s = slideFor(n, midi);
    if (!best || s < best.s) best = { n, s };
  }
  if (best) return best;
  const n = midi < openPitch(2) ? 2 : 12;
  return { n, s: Math.max(S_MIN, Math.min(sMax(n), slideFor(n, midi))) };
}

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));

// Plans slide motion and lip partials for a legato line: notes = [{ t, midi }] with t ascending,
// the first at t = 0. Each new note starts a slide move of `glide` seconds (at least as long as the
// slide physically needs). The lips stay on their partial whenever the slide can reach the next
// note on it; otherwise the slide still moves continuously and the lips step through the partials
// in between during the move, like a rip.
export function slidePlan(notes, glide) {
  const parts = [];
  for (let i = 0; i < notes.length; i++) {
    const m = notes[i].midi, next = notes[i + 1]?.midi;
    const prev = parts[i - 1];
    let n;
    if (prev && fits(prev.n, m)) n = prev.n;
    else {
      const shared = next === undefined ? [] : PARTIALS.filter((k) => fits(k, m) && fits(k, next));
      n = shared.length ? shared.reduce((a, b) => (slideFor(a, m) <= slideFor(b, m) ? a : b)) : position(m).n;
      if (!fits(n, m)) n = position(m).n;
    }
    parts.push({ n, s: Math.max(S_MIN, Math.min(sMax(n), slideFor(n, m))) });
  }
  const moves = [], steps = [{ t: 0, n: parts[0].n }];
  let sNow = parts[0].s;
  const sAt = (t) => {
    let s = parts[0].s;
    for (const mv of moves) if (t >= mv.t0) s = mv.from + (mv.to - mv.from) * ease((t - mv.t0) / (mv.t1 - mv.t0));
    return s;
  };
  for (let i = 1; i < notes.length; i++) {
    const t0 = notes[i].t;
    sNow = sAt(t0);
    const to = parts[i].s;
    const t1 = t0 + Math.max(glide, Math.abs(to - sNow) * SLIDE_SPEED, 1e-3);
    moves.push({ t0, t1, from: sNow, to });
    const a = parts[i - 1].n, b = parts[i].n;
    if (a !== b) {
      const between = PARTIALS.filter((k) => (k - a) * (k - b) < 0 || k === b).sort((x, y) => (b > a ? x - y : y - x));
      const tEnd = Math.min(t1, notes[i + 1]?.t ?? Infinity);
      between.forEach((k, j) => steps.push({ t: t0 + (j + 0.5) / between.length * (tEnd - t0), n: k }));
    }
  }
  return {
    parts,
    s: (t) => Math.max(S_MIN, Math.min(S_MAX, sAt(t))),
    n: (t) => { let n = steps[0].n; for (const st of steps) if (t >= st.t) n = st.n; return n; },
  };
}
