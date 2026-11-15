// Free reeds in slots around one small air chamber (one harmonica hole). SI units throughout.
export const RHO = 1.2;
export const C_AIR = 343;
const E_BRASS = 1.0e11, RHO_BRASS = 8500;

// Uniform clamped-free beam (Euler-Bernoulli): overtone ratios, and the tip-referred
// effective mass (0.243 of the beam) and pressure area (0.391 of the reed face) of mode 1.
export const MODE2_RATIO = 6.267;
const MASS_FACTOR = 0.243, AREA_FACTOR = 0.391;

export function reedGeometry(f0, size = 1) {
  const oct = Math.log2(f0 / 261.6);
  const L = 15.5e-3 * 2 ** (-0.3 * oct) * size;
  const w = 2.4e-3 * 2 ** (-0.12 * oct);
  const t = (2 * Math.PI * f0 * L * L) / (1.875 ** 2 * Math.sqrt(E_BRASS / (12 * RHO_BRASS)));
  return { L, w, t, m: MASS_FACTOR * RHO_BRASS * L * w * t, S: AREA_FACTOR * L * w };
}

// Aperture area versus tip displacement y (positive = away from the slot). Inside the slot only
// the clearance gap leaks; outside, tip and both flanks open. The flank opening is triangular
// (zero at the clamp), hence L/2 per flank. A smooth corner keeps the flow free of kinks.
function apertureFn(L, w, clearance, plate, edge) {
  const leak = (2 * L + w) * clearance;
  const perim = w + L;
  const k = 1 / edge;
  const sp = (z) => { const u = z * k; return u > 30 ? z : u < -30 ? 0 : Math.log1p(Math.exp(u)) / k; };
  return (y) => leak + perim * (sp(y) + sp(-y - plate));
}

// side = +1: reed sits inside the chamber and closes when the chamber is above ambient (blow reed).
// side = -1: reed sits outside and closes when the chamber is below ambient (draw reed).
export function makeReed({ f, side, gap, kappa = 0.05, amp = 1, q = 120, clearance = 25e-6, plate = 0.95e-3, edge = 0.05e-3, size = 1 }) {
  const g = reedGeometry(f, size);
  const w0 = 2 * Math.PI * f;
  return {
    ...g, f, side, gap, plate,
    k: g.m * w0 * w0, c: (g.m * w0) / q,
    // Quadratic aerodynamic drag on the swinging blade (flat plate, Cd about 2, outer third of blade).
    drag: 0.5 * RHO * 2 * g.w * g.L * 0.3,
    A: apertureFn(g.L, g.w, clearance, plate, edge), plugLen: plate + 0.6 * Math.sqrt(g.w * g.L),
    y: gap, v: 0, U: 0, y2: 0, v2: 0,
    w2: w0 * MODE2_RATIO, r2: 0.02, w1: w0, kappa, ampScale: 0.5 * amp * (gap + plate),
  };
}

// Advances one hole by `n` substeps of length dt. P: mouth pressure at each substep (Pa),
// kScale: stiffness scale of reed 0 at each substep (bending), out: chamber outflow (m^3/s).
export function runHole(hole, P, kScale, dt, out) {
  const { reeds, C, Lin, Sh } = hole;
  const nr = reeds.length;
  const g = new Float64Array(nr), u0 = new Float64Array(nr);
  let { pc, Uin } = hole;
  for (let i = 0; i < out.length; i++) {
    let vol = 0, sumG = 0, sumU0 = 0;
    // Without supply pressure there is no jet: the reed must not keep itself going on the
    // chamber pressure it pumps on its own.
    const gate = Math.min(1, Math.abs(P[i]) / 40);
    for (let j = 0; j < nr; j++) {
      const r = reeds[j];
      const dp = r.side * pc;
      const k = j === 0 ? r.k * kScale[i] : r.k;
      let F = -k * (r.y - r.gap) - r.c * r.v - r.S * dp - r.drag * r.v * Math.abs(r.v);
      // Only a reed that the supply blows closed has a jet through its slot. The partner reed of
      // a hole sees dp > 0 only on brief swings of the chamber pressure and stays passive.
      if (dp > 0 && r.side * P[i] > 0) {
        // Aerodynamic excitation of a blown-closed free reed: the throttled, inertial slot flow
        // lags the blade and acts as negative damping that grows with the jet speed (sqrt(dp)).
        // Flow separation and vortex losses grow with the excursion and limit the amplitude
        // (written in van der Pol form around the statically deflected rest position).
        const s = (r.y - r.gap + (r.S * dp) / k) / (r.ampScale * (0.75 + 0.5 * Math.sqrt(dp / 1000)));
        F += 2 * gate * r.kappa * Math.sqrt(Math.min(dp, 3000) / 500) * r.m * r.w1 * r.v * (1 - s * s);
      }
      r.v += (dt * F) / r.m;
      r.y += dt * r.v;
      // Second bending mode, driven by the same pressure; it only perturbs the aperture slightly.
      r.v2 += dt * (-r.w2 * r.w2 * r.y2 - (r.w2 / 60) * r.v2 - (r.side * r.S * pc) / r.m);
      r.y2 += dt * r.v2;
      vol += r.side * r.S * r.v;
      // Unsteady Bernoulli through the slot: inertance of the air plug, quadratic exit loss with
      // vena contracta 0.7, linearised around the current flow.
      const a = r.A(r.y + r.r2 * r.y2);
      const ae = 0.7 * a;
      const Ls = (RHO * r.plugLen) / a;
      const loss = 0.5 * RHO * (r.U / ae) * Math.abs(r.U / ae);
      const dl = (RHO * Math.abs(r.U)) / (ae * ae);
      g[j] = dt / (Ls + dt * dl);
      u0[j] = r.U - g[j] * loss;
      sumG += g[j]; sumU0 += u0[j];
    }
    // The chamber and slot plugs form a Helmholtz resonance far above the audio band, so the
    // chamber pressure is solved implicitly together with all flows (backward Euler).
    const h = dt / Lin;
    const lossIn = 0.5 * RHO * (Uin / Sh) * Math.abs(Uin / Sh);
    const q = dt / C;
    pc = (pc + q * (Uin + h * (P[i] - lossIn) - sumU0 + vol)) / (1 + q * (h + sumG));
    Uin += h * (P[i] - lossIn - pc);
    let Uout = 0;
    for (let j = 0; j < nr; j++) { reeds[j].U = u0[j] + g[j] * pc; Uout += reeds[j].U; }
    out[i] = Uout;
  }
  hole.pc = pc; hole.Uin = Uin;
}

export function makeHole(reeds, { width = 3.6e-3, height = 4.4e-3, depth = 17e-3, lipLen = 6e-3 } = {}) {
  const V = width * height * depth;
  const Sh = width * height;
  return { reeds, C: V / (RHO * C_AIR * C_AIR), Lin: (RHO * lipLen) / Sh, Sh, pc: 0, Uin: 0 };
}

// Runs a hole over a mouth/bellows pressure signal P (sampled at sr) with `os`-times
// oversampling and returns the chamber outflow at the oversampled rate.
// kAt(t) optionally scales the stiffness of reed 0 over time.
export function simulate(hole, P, sr, os, kAt) {
  const n = P.length, dt = 1 / (sr * os), blk = 64;
  const flow = new Float64Array(n * os);
  const Pb = new Float64Array(blk), K = new Float64Array(blk).fill(1), out = new Float64Array(blk);
  for (let b = 0; b * blk < n * os; b++) {
    for (let i = 0; i < blk; i++) {
      const j = b * blk + i, s = Math.floor(j / os), fr = (j % os) / os;
      const p0 = P[Math.min(s, n - 1)], p1 = P[Math.min(s + 1, n - 1)];
      Pb[i] = p0 + (p1 - p0) * fr;
      if (kAt) K[i] = kAt(j * dt);
    }
    runHole(hole, Pb, K, dt, out);
    const lim = Math.min(blk, n * os - b * blk);
    for (let i = 0; i < lim; i++) flow[b * blk + i] = out[i];
  }
  return flow;
}

// Sounding frequency of reed 0 under a steady pressure, from zero crossings of its tip motion.
// The tip is read every `blk` substeps; that rate must stay well above twice the highest reed
// frequency, or treble reeds alias and the tuning step runs away.
function measure(hole, P, sr, os) {
  // Bass reeds take longer to settle to their final amplitude and pitch.
  const settle = Math.max(0.12, 24 / hole.reeds[0].f);
  const dt = 1 / (sr * os), blk = 4, n = Math.round(((settle + 0.12) * sr * os) / blk);
  const Pb = new Float64Array(blk), K = new Float64Array(blk).fill(1), out = new Float64Array(blk);
  const ys = [];
  for (let b = 0; b < n; b++) {
    const t = b * blk * dt;
    Pb.fill(P * Math.min(1, t / 0.02));
    runHole(hole, Pb, K, dt, out);
    if (t > settle) ys.push(hole.reeds[0].y);
  }
  let mean = 0;
  for (const y of ys) mean += y / ys.length;
  const cr = [];
  for (let i = 1; i < ys.length; i++) if (ys[i - 1] < mean && ys[i] >= mean) cr.push(i - 1 + (mean - ys[i - 1]) / (ys[i] - ys[i - 1]));
  if (cr.length < 4) return NaN;
  return (((sr * os) / blk) * (cr.length - 1)) / (cr[cr.length - 1] - cr[0]);
}

// A free reed sounds flat of its natural frequency, more so at higher pressure. Instruments are
// tuned at a medium dynamic: a secant step on the natural frequency puts that dynamic on pitch.
function tuneAt(build, f, P, sr, os) {
  const ok = (x) => Number.isFinite(x) && Math.abs(Math.log2(x / f)) < 0.15;
  const m1 = measure(build(f), P, sr, os);
  if (!Number.isFinite(m1)) return f;
  const f1 = (f * f) / m1;
  if (!ok(f1)) return f;
  const m2 = measure(build(f1), P, sr, os);
  const fr = Number.isFinite(m2) ? f1 + ((f - m2) * (f1 - f)) / (m2 - m1 || 1) : f1;
  return ok(fr) ? fr : f1;
}

// The correction is measured on a 2-cent grid and applied as a ratio, so random detune adds no
// cache entries and a result never depends on what was rendered before. Oldest entries are
// evicted to keep long-running processes bounded.
const tuneCache = new Map();
const TUNE_CACHE_MAX = 4096;
export function tune(build, f, P, sr, os, cacheKey) {
  P = Math.round(P);
  const step = Math.round(600 * Math.log2(f));
  const key = `${cacheKey}|${step}|${P}`;
  let ratio = tuneCache.get(key);
  if (ratio === undefined) {
    const fq = 2 ** (step / 600);
    ratio = tuneAt(build, fq, P, sr, os) / fq;
    if (tuneCache.size >= TUNE_CACHE_MAX) tuneCache.delete(tuneCache.keys().next().value);
  } else tuneCache.delete(key);
  tuneCache.set(key, ratio);
  return f * ratio;
}
