// Teeth of the comb are cantilevers. Bass teeth carry a lead weight under the tip, which lowers
// their pitch without making them longer. For a uniform clamped-free beam of mass m with a point
// mass M at the free end, the eigenvalues beta solve
//   1 + cos(b) cosh(b) + mu b (cos(b) sinh(b) - sin(b) cosh(b)) = 0,   mu = M / m,
// and the mode frequencies scale with beta^2. For mu = 0 this gives the familiar ratios
// 1 : 6.27 : 17.55 : 34.39; a tip mass pulls the fundamental down much more than the overtones.
function charEq(b, mu) {
  return 1 + Math.cos(b) * Math.cosh(b) + mu * b * (Math.cos(b) * Math.sinh(b) - Math.sin(b) * Math.cosh(b));
}

const cache = new Map();
export function cantileverBetas(mu, count = 4) {
  const key = Math.round(mu * 1000);
  if (cache.has(key)) return cache.get(key);
  mu = key / 1000;
  const roots = [];
  let f0 = charEq(0.05, mu);
  for (let b = 0.06; roots.length < count && b < 30; b += 0.01) {
    const f1 = charEq(b, mu);
    if (Math.sign(f1) !== Math.sign(f0)) {
      let lo = b - 0.01, hi = b;
      for (let k = 0; k < 60; k++) {
        const m = (lo + hi) / 2;
        if (Math.sign(charEq(m, mu)) === Math.sign(charEq(lo, mu))) lo = m; else hi = m;
      }
      roots.push((lo + hi) / 2);
    }
    f0 = f1;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, roots);
  return roots;
}

// Lead weight relative to the tooth mass, growing towards the bass; the top teeth have none.
export const tipMass = (midi) => Math.max(0, (74 - midi) / 21) * 0.9;

// Fixed tuning scatter of this one comb, in cents (the teeth are tuned by filing, to about +-3
// cents).
export function toothCents(midi) {
  let h = Math.imul(Math.round(midi) * 2654435761, 1597334677) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return ((h >>> 8) / 16777216 - 0.5) * 6;
}
