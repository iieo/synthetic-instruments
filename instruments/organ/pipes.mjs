import { SR } from '../../lib/audio.mjs';

// Stable per-pipe random number: the same pipe always gets the same detuning and voicing.
export function pipeHash(...ints) {
  let h = 2166136261;
  for (const x of ints) { h ^= x & 0xffff; h = Math.imul(h, 16777619); h ^= (x >>> 16) & 0xffff; h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Slow random fluctuation (wind-trunk turbulence, bellows regulator hunting): a few slow,
// randomly phased partials between 1 and 7 Hz, normalized to unit peak.
function slowNoise(rand) {
  const parts = Array.from({ length: 5 }, () => ({ w: (2 * Math.PI * (1 + 6 * rand())) / SR, ph: 2 * Math.PI * rand(), a: 0.5 + rand() }));
  const sum = parts.reduce((s, q) => s + q.a, 0);
  let i = 0;
  return () => { let v = 0; for (const q of parts) v += q.a * Math.sin(q.w * i + q.ph); i++; return v / sum; };
}

// Phase delay (in samples) of the one-pole lowpass y = (1-a) x + a y[-1] at angular frequency w.
const lpPhaseDelay = (a, w) => Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w;

// Pipe resonator as a digital waveguide: one delay loop holding the round trip of the pressure
// wave. Open pipe: reflection -1 at both ends, loop sign +1, resonances at all n*f. Stopped pipe:
// +1 at the stopper, -1 at the mouth, loop sign -1 and half the delay, resonances at odd n*f.
// The loop lowpass stands for radiation and wall losses, which grow with frequency.
function makeResonator(f, stopped, Q, lpCut) {
  const w = (2 * Math.PI * f) / SR;
  const a = Math.exp((-2 * Math.PI * Math.min(lpCut, 0.45 * SR)) / SR);
  const round = stopped ? SR / (2 * f) : SR / f;
  const D = Math.max(2, round - lpPhaseDelay(a, w) - 1);
  const g = Math.exp(-Math.PI / (Q * (stopped ? 2 : 1)));
  const sign = stopped ? -1 : 1;
  const size = Math.ceil(D) + 4;
  const buf = new Float64Array(size);
  let wp = 0, z = 0;
  const di = Math.floor(D), fr = D - di;
  return {
    peakGain: 1 / (1 - g * (1 - a) / Math.hypot(1 - a * Math.cos(w), a * Math.sin(w))),
    t60: (6.91 * Q) / (Math.PI * f),
    tick(x) {
      let r1 = wp - di; if (r1 < 0) r1 += size;
      let r2 = r1 - 1; if (r2 < 0) r2 += size;
      const yd = buf[r1] * (1 - fr) + buf[r2] * fr;
      z = (1 - a) * yd + a * z;
      const y = x + sign * g * z;
      buf[wp] = y; wp = wp + 1 === size ? 0 : wp + 1;
      return y;
    },
  };
}

function onePoleHP(fc) {
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  let x1 = 0, y1 = 0;
  return (x) => { const y = a * (y1 + x - x1); x1 = x; y1 = y; return y; };
}

function onePoleLP(fc) {
  const a = Math.exp((-2 * Math.PI * Math.min(fc, 0.45 * SR)) / SR);
  let y = 0;
  return (x) => (y = (1 - a) * x + a * y);
}

const smooth01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * u));

// Pallet and wind: the pressure in the pipe foot rises over tRise once the pallet opens and
// collapses over tFall after it closes. The small overshoot after the rise comes from the foot
// volume charging through the toe hole, a lightly damped second-order system.
function footPressure(i, nRel, tRise, tFall) {
  const rise = (t) => { const u = t / tRise, v = Math.max(0, u - 1) / 0.6; return smooth01(u) + 0.05 * v * Math.exp(1 - v); };
  if (i < nRel) return rise(i / SR);
  return rise(nRel / SR) * Math.exp(-(i - nRel) / (tFall * SR));
}

/**
 * Flue pipe. The jet leaving the windway is deflected by the acoustic flow in the mouth and is
 * split by the upper lip; the flow injected into the pipe is a saturating function of the jet
 * deflection (jet profile of half-width b, offset y0 from the lip). The jet deflection grows with
 * the pipe's oscillation amplitude, so the source is nearly sinusoidal while the pipe speaks and
 * becomes richer once it is fully established.
 */
export function flue({ f, dur, rand, stopped = false, Q = 30, lpCut = 6000, y0 = 0.25, b = 0.6, drive = 1.6,
  octave = 0.4, chiff = 0.25, noise = 0.012, tilt = 0.6, direct = 0.02, outLp = 9000, gain = 1 }) {
  const res = makeResonator(f, stopped, Q, lpCut);
  // Bigger pipes speak more slowly; the jet needs a number of periods to lock onto the resonator.
  const tSpeak = 0.012 + 5 / f;
  const tRise = 0.008 + 0.9 / f + 0.01;
  const tFall = 0.006;
  const nRel = Math.max(1, Math.round(dur * SR));
  const tail = Math.min(2.5, Math.max(0.06, res.t60 * 1.1));
  const n = nRel + Math.round(tail * SR);
  const out = new Float64Array(n);
  const wobble = slowNoise(rand);
  const hpSrc = onePoleHP(f * 0.3);
  const hpOut = onePoleHP(12);
  const lpOut = onePoleLP(outLp);
  const lpNoise = onePoleLP(Math.min(12000, 6 * f + 3000));
  let phase = rand() * 2 * Math.PI, a = 0, prev = 0;
  const kA = 1 - Math.exp(-1 / (tSpeak * SR));
  const tOct = 0.35 * tSpeak + 0.004;
  const norm = gain / res.peakGain;
  const off = Math.tanh(-y0 / b);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const w = 1 + 0.004 * wobble();
    const p = footPressure(i, nRel, tRise, tFall) * w;
    // Jet velocity goes as sqrt(p); pipe pitch rises slightly with blowing pressure.
    const fi = f * (1 + 0.02 * (w - 1));
    phase += (2 * Math.PI * fi) / SR;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
    a += kA * (drive * Math.sqrt(Math.max(0, p)) - a);
    const jet = Math.tanh((a * Math.sin(phase) - y0) / b) - off;
    // Attack precursor: before the jet locks onto the fundamental it oscillates in the pipe's
    // second mode (the octave), which then dies away as the fundamental takes over.
    const u = t / tOct;
    const oct = octave * u * Math.exp(1 - u) * Math.sin(2 * phase + 0.7);
    const turb = (2 * rand() - 1) * p * (noise + chiff * Math.exp(-t / (0.5 * tSpeak + 0.01)));
    const s = hpSrc(jet * Math.sqrt(Math.max(0, p)) + oct + turb);
    // The mouth also radiates the jet flow directly, without the resonator's filtering; this is
    // what keeps a little of the even harmonics in a stopped pipe.
    const y = res.tick(s) + direct * res.peakGain * s;
    // Radiated pressure goes as the time derivative of the volume flow at low frequency.
    const r = y - tilt * prev; prev = y;
    out[i] = hpOut(lpOut(r + 0.3 * lpNoise(turb))) * norm;
  }
  return finish(out);
}

/**
 * Reed pipe (trumpet type). A brass tongue beats against the open face of the shallot. The gap
 * h = 1 + A sin(phase) closes for part of each cycle once the reed amplitude A exceeds 1; the
 * flow through the gap follows Bernoulli, u = h * sqrt(p). The closure is rounded (the tongue
 * rolls onto the shallot) which also keeps the source band-limited. The flow pulses then drive
 * a conical resonator whose flared end radiates the upper harmonics preferentially.
 */
export function reed({ f, dur, rand, Q = 14, lpCut = 9000, beat = 1.7, roll = 0.08, formant = 1800, bell = 1,
  noise = 0.004, gain = 1, outLp = 7000 }) {
  const res = makeResonator(f, false, Q, lpCut);
  const tSpeak = 0.006 + 2.5 / f;
  const tRise = 0.006 + 0.5 / f + 0.008;
  const nRel = Math.max(1, Math.round(dur * SR));
  const tail = Math.min(1.5, Math.max(0.05, res.t60 * 1.2));
  const n = nRel + Math.round(tail * SR);
  const out = new Float64Array(n);
  const wobble = slowNoise(rand);
  const hpSrc = onePoleHP(f * 0.5);
  const hpOut = onePoleHP(12);
  const bellHp = onePoleHP(formant);
  const lp1 = onePoleLP(outLp), lp2 = onePoleLP(outLp * 1.3);
  let phase = rand() * 2 * Math.PI, A = 0, prev = 0;
  const kA = 1 - Math.exp(-1 / (tSpeak * SR));
  const norm = gain / res.peakGain;
  const dNorm = SR / (2 * Math.PI * f);
  // Treble reeds are voiced with a rounder closure; this also keeps the flow pulses band-limited.
  const rl = roll * Math.max(1, f / 500);
  const soft = (x) => rl * Math.log1p(Math.exp(x / rl));
  for (let i = 0; i < n; i++) {
    const w = 1 + 0.004 * wobble();
    const p = footPressure(i, nRel, tRise, 0.004) * w;
    const fi = f * (1 + 0.004 * (w - 1));
    phase += (2 * Math.PI * fi) / SR;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
    A += kA * (beat * Math.sqrt(Math.max(0, p)) - A);
    const h = soft(1 + A * Math.sin(phase)) - soft(1);
    const u = h * Math.sqrt(Math.max(0, p)) + noise * p * (2 * rand() - 1);
    const y = res.tick(hpSrc(u));
    // Radiation from the open end goes as the time derivative of the flow; the flared bell adds
    // a broad lift above its cutoff, where partials radiate instead of being reflected.
    const dy = (y - prev) * dNorm; prev = y;
    const r = dy + bell * bellHp(dy);
    out[i] = hpOut(lp2(lp1(r))) * norm;
  }
  return finish(out);
}

// Short raised-cosine fade at the very end so every pipe ends exactly at zero.
function finish(out) {
  const m = Math.min(out.length, Math.round(0.01 * SR));
  for (let i = 0; i < m; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / m);
  return out;
}
