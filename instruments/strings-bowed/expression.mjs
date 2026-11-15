import { SR, midiToHz, rng } from '../../lib/audio.mjs';
import { bowString } from './engine.mjs';
import { makeBody } from './body.mjs';

// Lower relative bow force on short (high) strings keeps the Helmholtz motion and the pitch stable.
const highRelief = (f) => 1 - 0.45 * smoothstep(Math.log2(f / 350) / 2);

const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// cfg: beta, vMin, vMax, pressure, t60, t60Release, hfLoss, vibrato {rate, cents, delay, ramp},
//      body (makeBody options), gain, tail
export function makeInstrument(cfg) {
  const body = makeBody(cfg.body);

  // notes: [{ midi|null, dur, vel, velEnd?, slur? }]. A note with slur continues the previous bow
  // stroke (legato, only the finger changes); otherwise the bow changes direction. midi null = rest.
  function renderPhrase({ notes, seed = 1, vibrato = true, tail = cfg.tail, debug }) {
    const r = rng(seed * 7919 + 13);
    const total = notes.reduce((s, nt) => s + nt.dur, 0);
    const n = Math.round((total + tail) * SR);
    const f0 = new Float64Array(n);
    const vb = new Float64Array(n);
    const k = new Float64Array(n);
    const v0s = new Float64Array(n).fill(cfg.v0 * cfg.vMax);
    const damp = new Float64Array(n);
    const vibDepth = new Float64Array(n);
    const dynArr = new Float64Array(n);

    // segment boundaries in integer samples
    const starts = [];
    let acc = 0;
    for (const nt of notes) { starts.push(Math.round(acc * SR)); acc += nt.dur; }
    const endPlay = Math.round(total * SR);

    // pitch track (cents relative to A440 grid) and dynamic target
    let lastMidi = notes.find((nt) => nt.midi != null)?.midi ?? 60;
    const midiArr = new Float64Array(n);
    let dirSign = 1;
    let strokeIdx = -1;
    const strokeOf = new Int32Array(notes.length);
    for (let j = 0; j < notes.length; j++) {
      const nt = notes[j];
      const prev = notes[j - 1];
      if (nt.midi != null && !(nt.slur && prev && prev.midi != null)) strokeIdx++;
      strokeOf[j] = strokeIdx;
    }

    for (let j = 0; j < notes.length; j++) {
      const nt = notes[j];
      const s0 = starts[j], s1 = j + 1 < notes.length ? starts[j + 1] : endPlay;
      const len = s1 - s0;
      const from = lastMidi;
      const to = nt.midi ?? lastMidi;
      // finger change: legato slides a little, separate strokes switch fast
      const glide = Math.round((nt.slur ? 0.045 : 0.012) * SR);
      const v0 = nt.vel ?? 0.7, v1 = nt.velEnd ?? v0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        midiArr[s0 + i] = from + (to - from) * smoothstep(i / glide);
        dynArr[s0 + i] = nt.midi == null ? 0 : v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
      }
      if (vibrato && nt.midi != null && nt.dur > 0.4) {
        const vd = cfg.vibrato.delay * (0.8 + 0.4 * r());
        const ramp = cfg.vibrato.ramp;
        const depth = cfg.vibrato.cents * (0.8 + 0.4 * r());
        for (let i = 0; i < len; i++) {
          const t = i / SR;
          const fadeOut = smoothstep((len - i) / (0.08 * SR));
          vibDepth[s0 + i] = depth * smoothstep((t - vd) / ramp) * fadeOut;
        }
      }
      lastMidi = to;
    }
    for (let i = endPlay; i < n; i++) midiArr[i] = lastMidi;

    // smooth dynamics across boundaries (~25 ms)
    const aDyn = Math.exp(-1 / (0.025 * SR));
    let ds = 0;
    for (let i = 0; i < n; i++) { ds = (1 - aDyn) * dynArr[i] + aDyn * ds; dynArr[i] = ds; }

    // vibrato oscillator with slowly wandering rate and depth
    const { rate } = cfg.vibrato;
    const wp = [r() * 6.28, r() * 6.28, r() * 6.28];
    let ph = r() * 2 * Math.PI;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const rt = rate * (1 + 0.05 * Math.sin(0.7 * t + wp[0]) + 0.03 * Math.sin(1.9 * t + wp[1]));
      ph += (2 * Math.PI * rt) / SR;
      const dep = vibDepth[i] * (1 + 0.15 * Math.sin(1.1 * t + wp[2]));
      // slow intonation drift of a few tenths of a cent keeps sustained notes from sounding frozen
      const drift = 0.6 * Math.sin(0.31 * t + wp[1]);
      // the player's ear: compensates the slight sharpening the friction causes on short strings
      const ear = -4 * smoothstep(Math.log2(midiToHz(midiArr[i]) / 350) / 2.5);
      f0[i] = midiToHz(midiArr[i] + (dep * Math.sin(ph) + drift + ear) / 100);
    }

    // bow: per stroke speed envelope, direction alternates
    const strokes = [];
    for (let j = 0; j < notes.length; j++) {
      if (notes[j].midi == null) continue;
      const si = strokeOf[j];
      if (!strokes[si]) strokes[si] = { s0: starts[j], s1: 0, detache: false, j0: j };
      strokes[si].s1 = j + 1 < notes.length ? starts[j + 1] : endPlay;
      if (notes[j].dur < 0.4 && j === strokes[si].j0) strokes[si].detache = true;
    }
    for (let si = 0; si < strokes.length; si++) {
      const st = strokes[si];
      const prev = strokes[si - 1];
      const next = strokes[si + 1];
      const joinedBefore = prev && prev.s1 === st.s0;
      const joinedAfter = next && next.s1 !== undefined && next.s0 === st.s1;
      // Low strings need a slower bow acceleration for a clean Helmholtz start (Guettler's attack limits).
      const fStart = midiToHz(notes[st.j0].midi);
      const base = st.detache ? 0.03 : joinedBefore ? 0.045 : cfg.attack;
      const attack = Math.round(Math.max(base, (st.detache ? 5 : 12) / fStart) * SR);
      const release = Math.round((joinedAfter ? 0.03 : 0.05) * SR);
      const lift = joinedAfter ? 0 : Math.round(0.03 * SR);
      for (let i = st.s0; i < st.s1 + lift && i < n; i++) {
        const tin = i - st.s0;
        const tout = st.s1 - i;
        const envIn = smoothstep(tin / attack);
        const envOut = joinedAfter ? smoothstep(tout / release) * 0.85 + 0.15 * smoothstep(tout / (release * 0.4)) : 1;
        const d = dynArr[Math.min(i, n - 1)];
        const speed = cfg.vMin + (cfg.vMax - cfg.vMin) * d ** 1.4;
        vb[i] = dirSign * speed * envIn * envOut;
        // friction-curve width tied to the bow speed keeps the regime the same at every dynamic
        v0s[i] = cfg.v0 * speed;
        // force follows the target speed (constant Schelleng position); slight accent on détaché
        const press = cfg.pressure * highRelief(fStart) * (1 + (st.detache ? 0.5 : 0.35) * (1 - smoothstep(tin / (attack * 2))));
        const fIn = smoothstep(tin / Math.max(1, Math.round(attack * (joinedBefore ? 0.2 : 0.3))));
        const fOut = joinedAfter ? 1 : smoothstep((st.s1 + lift - i) / lift);
        k[i] = (press * speed / cfg.beta) * fIn * fOut;
      }
      dirSign = -dirSign;
    }

    // damping after the bow leaves at the end (player stops the string)
    for (let i = endPlay; i < n; i++) damp[i] = smoothstep((i - endPlay) / (0.15 * SR));

    const t60 = cfg.t60, gRel = cfg.t60Release;
    const loss = (f, i) => {
      const g = 10 ** (-3 / (t60 * f));
      const gd = damp[i] > 0 ? 10 ** ((-3 / (gRel * f)) * damp[i]) : 1;
      return { g, a: cfg.hfLoss, gN: 0.9995 * gd, aN: 0.02 };
    };

    const force = bowString({ f0, vb, k, v0s }, {
      beta: cfg.beta, noise: cfg.bowNoise, rnd: r, loss,
      muS: cfg.muS, muD: cfg.muD, debug,
      torsion: cfg.torsion, torsionSpeed: cfg.torsionSpeed, torsionLoss: cfg.torsionLoss,
    });

    const y = body(force);
    // Below the air mode the body radiates little (monopole cancellation); second-order highpass.
    const w = (2 * Math.PI * cfg.highpassHz) / SR, al = Math.sin(w) / (2 * 0.707), cw = Math.cos(w);
    const a0 = 1 + al;
    const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
    for (let st = 0; st < (cfg.highpassStages ?? 1); st++) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) {
        const x = y[i];
        const v = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = v;
        y[i] = v;
      }
    }
    for (let i = 0; i < n; i++) y[i] *= cfg.gain;
    const fade = Math.round(0.03 * SR);
    for (let i = 0; i < fade; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    y[n - 1] = 0;
    return y;
  }

  function render({ midi, velocity = 0.8, duration = 1, seed = 1, vibrato = true }) {
    return renderPhrase({ notes: [{ midi, dur: duration, vel: velocity }], seed, vibrato });
  }

  return { render, renderPhrase };
}
