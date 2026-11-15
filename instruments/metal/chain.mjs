import { SR, mixInto } from '../../lib/audio.mjs';
import { STEEL, hertzContact, modalBank } from './modal.mjs';
import { ringModes, plateModes } from './objects.mjs';

const G = 9.81;

// A hanging chain released at its top end: all links fall freely, so link i (counted from the bottom)
// lands at t_i = sqrt(2 (h0 + i l) / g) with speed sqrt(2 g (h0 + i l)). The impact rate and the impact
// speed both rise until the last link lands. Each landing excites the link's own ring modes, a
// neighbour on the pile and a thick steel floor plate; a few link-on-link knocks follow every landing.
export function chain({ velocity, size, damping, rand }) {
  const nLinks = 34;
  const pitch = 0.04 * size;
  const Req = 0.032 * size, rw = 0.005 * size;
  const mLink = STEEL.rho * Math.PI * rw * rw * 2 * Math.PI * Req;
  const links = Array.from({ length: nLinks }, () => ringModes({
    R: Req * (0.94 + 0.12 * rand()), rg: rw / 2, M: mLink, nMax: 3, split: 0.09,
    eta0: 4e-3 * damping, eta1: 4e-3 * damping, gain: 1, rand,
  }));
  for (const l of links) for (let k = 0; k < l.f.length; k++) {
    // Links touching the pile lose energy fast; gain tapers above 12 kHz.
    l.t60[k] = Math.min(l.t60[k], 0.06 + 0.25 * rand());
    l.gout[k] *= 2 * Math.PI * l.f[k] * (l.f[k] < 9000 ? 1 : Math.exp(-(l.f[k] - 9000) / 2500));
  }
  const h0 = 0.15 + 0.7 * velocity;
  const events = [];
  const t0 = Math.sqrt((2 * h0) / G);
  for (let i = 0; i < nLinks; i++) {
    const hh = h0 + i * pitch;
    const t = Math.sqrt((2 * hh) / G) - t0 + 0.004 * (rand() - 0.5);
    const v = Math.sqrt(2 * G * hh) * (0.75 + 0.3 * rand());
    events.push({ t, v, link: i, floor: true });
    const knocks = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < knocks; k++) {
      events.push({ t: t + 0.003 + 0.05 * rand() * (k + 1), v: v * (0.08 + 0.3 * rand()), link: i, other: Math.max(0, i - 1 - Math.floor(rand() * 4)) });
    }
  }
  const tEnd = Math.sqrt((2 * (h0 + nLinks * pitch)) / G) - t0;
  for (let k = 0; k < 5 + Math.floor(rand() * 6); k++) {
    const a = Math.floor(rand() * nLinks);
    events.push({ t: tEnd + 0.02 + 0.45 * rand() ** 1.5, v: 0.15 + 0.4 * rand(), link: a, other: (a + 1) % nLinks });
  }
  events.sort((p, q) => p.t - q.t);
  const total = Math.ceil((tEnd + 1.2) * SR);
  const out = new Float64Array(total);
  const floor = plateModes({
    a: 1.2, b: 0.8, h: 8e-3, x0: 0.5, y0: 0.4, xm: 0.37, ym: 0.29, fAll: 2500, fMax: 9000, keep: 120,
    eta0: 0.02 * damping, eta1: 0.01, cap: 0.4, gain: 1, rand,
  });
  floor.gout = floor.gout.map((gg, k) => gg * 2 * Math.PI * floor.f[k] * 0.05);
  const floorDrives = [];
  const Kc = (4 / 3) * (STEEL.E / (2 * (1 - STEEL.nu ** 2))) * Math.sqrt(rw);
  for (const ev of events) {
    const mass = ev.floor ? mLink : mLink / 2;
    const { imp } = hertzContact({ mass, K: Kc, v: ev.v, e: 0.35 });
    const start = Math.round(ev.t * SR);
    for (const li of ev.floor ? [ev.link] : [ev.link, ev.other]) {
      const L = links[li];
      const phi = Float64Array.from(L.phi, () => rand() * 2 - 1);
      const y = modalBank(L, [{ start: 0, imp, phi }], Math.round(0.45 * SR), { floorDb: -70 });
      mixInto(out, y, start, 1);
    }
    if (ev.floor) {
      const x0 = 0.3 + 0.4 * rand(), y0 = 0.3 + 0.4 * rand();
      floorDrives.push({ start, imp, phi: Float64Array.from(floor.f, (_, k) => Math.sin(floor.km[k] * x0 * 1.2) * Math.sin(floor.kn[k] * y0 * 0.8)) });
    }
  }
  const fl = modalBank(floor, floorDrives, total, { floorDb: -80 });
  for (let i = 0; i < fl.length; i++) out[i] += fl[i];
  return out;
}
