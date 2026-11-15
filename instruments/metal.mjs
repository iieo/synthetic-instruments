import { SR, rng } from '../lib/audio.mjs';
import { STEEL, C_L, C_T, hertzContact, modalBank, concatModes, finish, biquad } from './metal/modal.mjs';
import { beamBending, axialModes, shellModes, plateModes, clampedDisk, cavityModes } from './metal/objects.mjs';
import { chain } from './metal/chain.mjs';
import { scrape } from './metal/scrape.mjs';

export const meta = {
  name: 'Industrial Metal',
  voices: ['anvil', 'pipe', 'sheet', 'barrel', 'chain', 'scrape'],
};

const { E, rho, nu } = STEEL;

// Listening weight: modal velocity (w), times a radiation roll-off for very low modes.
function radiate(s, lowHz = 60, extra = () => 1) {
  s.gout = s.gout.map((g, k) => g * 2 * Math.PI * s.f[k] * (s.f[k] / (s.f[k] + lowHz)) ** 2 * extra(s.f[k]));
  return s;
}

function strikes(hits) {
  return hits.map(({ t, imp, phi }) => ({ start: Math.round(t * SR), imp, phi: Float64Array.from(phi) }));
}

// Hammer on anvil: the hand keeps pushing the hammer down after the rebound, so it falls back with an
// effective acceleration g_eff and lands again at roughly the rebound speed (the smith's "ting-ting").
function anvil({ velocity, size, damping, rand }) {
  const L = 0.42 * size * (0.97 + 0.06 * rand()), h = 0.15 * size, w = 0.11 * size * (0.95 + 0.1 * rand());
  const A = h * w, M = rho * A * L;
  const x0 = 0.25 + 0.2 * rand();
  const vert = beamBending({ L, rg: h / Math.sqrt(12), A, kappa: 0.85, x0, xm: 0.85, nModes: 7, eta0: 1.2e-4 * damping, eta1: 1e-4 * damping });
  const lat = beamBending({ L, rg: w / Math.sqrt(12), A, kappa: 0.85, x0, xm: 0.85, nModes: 5, eta0: 1.5e-4 * damping, eta1: 2e-4 * damping, gain: 0.7 });
  lat.phi = lat.phi.map((p) => p * 0.18);
  const tors = axialModes({ L, c: C_T * 0.82, M, x0, xm: 0.1, nModes: 3, eta0: 2e-4 * damping, eta1: 2e-4, gain: 0.5 });
  tors.phi = tors.phi.map((p) => p * 0.25);
  const lon = axialModes({ L, c: C_L, M, x0, xm: 0.9, nModes: 2, eta0: 1.5e-4 * damping, eta1: 1e-4, gain: 0.6 });
  lon.phi = lon.phi.map((p) => p * 0.08);
  const rH = 0.028 * size, Lh = 0.2 * size;
  const horn = beamBending({ L: Lh, rg: rH / 2, A: Math.PI * rH * rH, kappa: 0.9, x0: 0.15, xm: 1, nModes: 4, eta0: 1.5e-4 * damping, eta1: 2e-4 * damping, cantilever: true, gain: 1.2 });
  horn.phi = horn.phi.map((p) => p * 0.6);
  const modes = radiate(concatModes(vert, lat, tors, lon, horn), 60, (f) => (f < 8000 ? 1 : Math.exp(-(f - 8000) / 3000)));
  const Kc = (4 / 3) * (E / (2 * (1 - nu * nu))) * Math.sqrt(0.06);
  let v = 1 + 6 * velocity, t = 0;
  const hits = [];
  const gEff = 180 + 160 * rand();
  for (let b = 0; b < 5 && v > 0.35; b++) {
    const c = hertzContact({ mass: 1.0, K: Kc, v, e: 0.72 });
    const jitterPhi = modes.phi.map((p) => p * (1 + 0.08 * (rand() - 0.5)));
    hits.push({ t, imp: c.imp, phi: jitterPhi });
    t += c.T + (2 * c.vOut) / gEff;
    v = c.vOut * 0.85;
  }
  return modalBank(modes, strikes(hits), Math.round(Math.min(7, 5 / damping) * SR));
}

// Steel scaffold tube, 48.3 mm x 3.2 mm. Free-free bending (Timoshenko, kappa ~ 0.53 for thin tubes)
// carries the tuned part, the shell (ovalling) modes give the clang.
function pipe({ velocity, size, damping, rand }) {
  const L = 1.0 * size * (0.95 + 0.1 * rand()), ro = 0.02415 * size, wall = 0.0032 * size, ri = ro - wall;
  const A = Math.PI * (ro * ro - ri * ri), M = rho * A * L;
  const x0 = 0.03 + 0.2 * rand();
  const bend = beamBending({ L, rg: Math.sqrt(ro * ro + ri * ri) / 2, A, kappa: 0.53, x0, xm: 0.4, nModes: 12, eta0: 3e-4 * damping, eta1: 4e-4 * damping });
  const shell = shellModes({ R: (ro + ri) / 2, L, h: wall, z0: x0 * L, zm: 0.37 * L, thm: 0.5, mMax: 12, nMax: 6, eta0: 1.2e-3 * damping, eta1: 1.5e-3 * damping, gain: 1.4 });
  shell.phi = shell.phi.map((p) => p * 1.3);
  const lon = axialModes({ L, c: C_L, M, x0, xm: 0.95, nModes: 4, eta0: 2e-4 * damping, eta1: 2e-4, gain: 0.7 });
  lon.phi = lon.phi.map((p) => p * 0.12);
  const modes = radiate(concatModes(bend, shell, lon), 150, (f) => (f < 10000 ? 1 : Math.exp(-(f - 10000) / 3000)));
  const Kc = (4 / 3) * (E / (2 * (1 - nu * nu))) * Math.sqrt(0.012);
  const c = hertzContact({ mass: 0.35, K: Kc * 0.3, v: 1 + 6 * velocity, e: 0.6 });
  const hits = [{ t: 0, imp: c.imp, phi: modes.phi }];
  if (rand() < 0.5) hits.push({ t: c.T + 0.006 + 0.01 * rand(), imp: c.imp.map((x) => x * 0.08), phi: modes.phi });
  return modalBank(modes, strikes(hits), Math.round(Math.min(8, 6 / damping) * SR));
}

// Large thin sheet (thunder sheet). Bending modes of a plate, made nonlinear with Berger's
// approximation: the mean square slope stretches the mid-plane, the tension raises every mode
// (w^2 = w0^2 + T k^2 / rho h). Pitch glides down as the sheet calms; the slow lowest modes
// modulate the tension at twice their frequency, which is the wobble.
function sheet({ velocity, size, damping, rand }) {
  const a = 0.9 * size, b = 1.8 * size, h = 0.6e-3 * size;
  const modes = plateModes({
    a, b, h, x0: (0.22 + 0.15 * rand()) * a, y0: (0.55 + 0.2 * rand()) * b, xm: 0.71 * a, ym: 0.33 * b,
    fAll: 400 / size, fMax: 12000, keep: 1100, eta0: 2.2e-3 * damping, eta1: 8e-4 * damping, cap: 4.5, gain: 1, rand,
  });
  radiate(modes, 70, (f) => Math.sqrt(Math.min(1, f / 400)) * (f < 9000 ? 1 : Math.exp(-(f - 9000) / 2500)));
  const c = hertzContact({ mass: 0.5, K: 6e7, v: 1 + 6 * velocity, e: 0.5, maxMs: 40 });
  const k1 = modes.kk[0];
  modes.imp0 = modes.kk.map((k2) => 3e-3 * size * (rand() * 2 - 1) * Math.sqrt(k1 / k2));
  const kappa = 5e-4;
  const berger = { coef: (kappa * E) / (2 * rho * (1 - nu * nu)), lpHz: 45 };
  return modalBank(modes, strikes([{ t: 0, imp: c.imp, phi: modes.phi }]), Math.round(Math.min(7, 6 / damping) * SR), { berger, floorDb: -90 });
}

// 200 l steel drum: shell (Donnell) hit on the side between the rolling hoops, clamped steel heads
// driven through the rim, plus the enclosed air column. Berger stretching on the heads gives the
// "boing" pitch drop of a hard hit.
function barrel({ velocity, size, damping, rand }) {
  const R = 0.286 * size, L = 0.85 * size, hs = 1.0e-3 * size, hh = 1.2e-3 * size;
  const shell = shellModes({ R, L, h: hs, z0: (0.28 + 0.1 * rand()) * L, zm: 0.5 * L, thm: 0.4 + rand(), mMax: 10, nMax: 45, eta0: 2.5e-3 * damping, eta1: 2e-3 * damping, gain: 1, fMax: 9000 });
  const head = clampedDisk({ a: R, h: hh, r0: 0.55, rm: 0.3, fMax: 2500, eta0: 3e-3 * damping, eta1: 2e-3, cap: 1.6, gain: 1.6 });
  head.phi = head.phi.map((p) => p * (0.4 + 0.1 * rand()));
  const air = cavityModes({ R, L, gain: 0.6, t60: 0.5 });
  air.phi = air.phi.map(() => 3e-3);
  air.m = air.m.map(() => 0.02);
  shell.kk = shell.kk.map(() => 0);
  const modes = radiate(concatModes(shell, head, air), 40, (f) => (f < 7000 ? 1 : Math.exp(-(f - 7000) / 2500)));
  const c = hertzContact({ mass: 0.4, K: 4e8, v: 1 + 6 * velocity, e: 0.45 });
  const berger = { coef: (3.5e-3 * E) / (2 * rho * (1 - nu * nu)), lpHz: 60 };
  return modalBank(modes, strikes([{ t: 0, imp: c.imp, phi: modes.phi }]), Math.round(Math.min(4, 3 / damping) * SR), { berger });
}

const CAL = { anvil: 0.35, pipe: 0.13, sheet: 0.033, barrel: 0.032, chain: 0.022, scrape: 12 };
export const RANGE = { size: [0.5, 2], damping: [0.5, 4], duration: [0.1, 4] };

// Level trim in dB over size, set so that the loudest of 200 seeds (velocities 0.2, 0.6, 1) lands
// at -3 dBFS, at these sizes and between them. Interpolated linearly in log(size).
const SIZES = [0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2];
const TRIM = {
  anvil: [-8.9, -7.1, -5.9, -3.3, -1.2, 2.3, 3.6, 6.5, 8.5],
  pipe: [-15.2, -10.5, -6.9, -3.2, -1.0, 1.4, 3.6, 7.1, 10.3],
  sheet: [-16.0, -14.9, -8.0, -6.7, -5.7, -0.9, 2.6, 8.1, 12.0],
  barrel: [-15.0, -10.8, -8.0, -4.3, -1.0, 3.2, 6.6, 11.4, 15.6],
  chain: [2.6, 0.9, 1.0, -0.9, -0.6, -1.6, -2.6, -5.1, -5.3],
  scrape: [-14.2, -9.9, -8.4, -6.6, -2.6, 3.0, 6.4, 10.7, 13.8],
};
// Less damping rings longer and builds up a little more; exponent on damping below 1.
const DAMP_EXP = { anvil: 0.25, pipe: 0.15, sheet: 0.15, barrel: 0, chain: 0.2, scrape: 0.4 };

export function trimDb(voice, size) {
  const t = TRIM[voice], x = Math.log(size);
  let i = 0;
  while (i < SIZES.length - 2 && size > SIZES[i + 1]) i++;
  const u = (x - Math.log(SIZES[i])) / (Math.log(SIZES[i + 1]) - Math.log(SIZES[i]));
  return t[i] + (t[i + 1] - t[i]) * Math.min(1, Math.max(0, u));
}

const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));

export function render({ voice, velocity = 0.8, seed = 1, size = 1, damping, duration } = {}) {
  const vi = meta.voices.indexOf(voice);
  if (vi < 0) throw new Error(`unknown voice ${voice}`);
  const rand = rng((seed * 7919 + vi * 104729) >>> 0);
  const vel = Math.min(1, Math.max(0.01, Number.isFinite(velocity) ? velocity : 0.8));
  size = clamp(Number.isFinite(size) ? size : 1, RANGE.size);
  const d = clamp(Number.isFinite(damping) ? damping : 1, RANGE.damping);
  const args = { velocity: vel, size, damping: d, rand };
  let y;
  if (voice === 'anvil') y = anvil(args);
  else if (voice === 'pipe') y = pipe(args);
  else if (voice === 'sheet') y = sheet(args);
  else if (voice === 'barrel') y = barrel(args);
  else if (voice === 'chain') y = chain(args);
  else y = scrape({ ...args, dur: clamp(Number.isFinite(duration) ? duration : 1.4, RANGE.duration) });
  y = biquad(biquad(y, 'hp', 25), 'lp', 15500, 0.6);
  const g = CAL[voice] * 10 ** (trimDb(voice, size) / 20) * Math.min(1, d) ** DAMP_EXP[voice];
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return finish(y, { release: voice === 'chain' ? 0.08 : 0.25 });
}
