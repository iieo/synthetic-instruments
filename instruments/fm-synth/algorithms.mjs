// Four sine operators. `mods` lists [modulator, target] pairs; a modulator always has a higher
// number than its target, so the operators can be computed from 4 down to 1 in one pass.
// Operator 4 can feed back on itself.
export const ALGORITHMS = {
  stack: { mods: [[4, 3], [3, 2], [2, 1]], out: [1] },
  'two-stacks': { mods: [[2, 1], [4, 3]], out: [1, 3] },
  branch: { mods: [[2, 1], [3, 1], [4, 3]], out: [1] },
  'stack-plus': { mods: [[3, 2], [2, 1]], out: [1, 4] },
  'shared-mod': { mods: [[4, 1], [4, 2], [4, 3]], out: [1, 2, 3] },
  additive: { mods: [], out: [1, 2, 3, 4] },
};

// Spectral extent of every operator's output, after Carson's rule: a phase modulation of index I
// by a signal reaching up to B Hz spreads a carrier by about (I + 1) B. Feedback turns operator 4
// into a saw-like wave whose useful harmonics grow with the feedback amount.
export function bandwidths(alg, freqs, index, feedback) {
  const B = [0, 0, 0, 0, 0];
  for (let k = 4; k >= 1; k--) {
    let b = freqs[k] * (k === 4 ? 1 + 5 * feedback : 1);
    for (const [m, t] of alg.mods) if (t === k && index[m] > 0) b += (index[m] + 1) * B[m];
    B[k] = b;
  }
  return B;
}
