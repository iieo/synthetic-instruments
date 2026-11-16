import { SR, rng } from '../lib/audio.mjs';
import { noteSeed } from './synth/dsp.mjs';
import { StepSum, HALF, RC, LP2, num, cached } from './delta-drums/bl.mjs';
import { CLK, PRESETS, sample } from './sampler8/samples.mjs';

export const meta = {
  name: 'Sampler 8',
  range: [24, 96],
  presets: Object.keys(PRESETS),
  filter: ['off', 'led'],
  bits: [8, 6],
};

// Fixed gain per preset: loudest note over range, filters, bit depths and seeds at velocity 1
// peaks near -1.5 dBFS.
const GAIN_DB = {
  bass: -2.65, strings: -2.2, choir: -1.65, piano: -1.15, lead: -2.45, chip: -3.1, 'orchestra-hit': -1.2, 'drum-kick': -1.7, 'drum-snare': -1.8,
};

// Shortest period the chip's sample fetch allows, longest the 16-bit register holds.
export const PMIN = 124, PMAX = 65535;
// The player's tick: volume slides and vibrato change once per video frame.
const TICK = CLK / 50;
const bank = new Map();

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// Octave copy and integer period for a note: the longest copy whose period stays legal.
export function voicing(preset, midi) {
  const P = PRESETS[preset], f = hz(midi);
  let o = 0, s = sample(preset, 0);
  for (;;) {
    s = cached(bank, 96, `${preset}|${o}`, () => sample(preset, o));
    const per = Math.round(CLK / (f * s.spc));
    if (per >= PMIN || o === P.octaves - 1) return { o, s, period: Math.min(PMAX, Math.max(PMIN, per)), exact: CLK / (f * s.spc) };
    o++;
  }
}

/**
 * One note on one channel of the four-voice sample chip. The preset's 8-bit sample is fetched at
 * CLK / period per second and held between fetches. `filter: 'led'` adds the switchable 3.3 kHz
 * low-pass, `bits: 6` drops the two lowest bits of every sample byte.
 */
export function render({
  midi = 60, velocity = 0.8, duration = 0.5, seed = 1, preset = 'bass', filter = 'off', bits = 8,
} = {}) {
  if (preset == null) preset = 'bass';
  const P = PRESETS[preset];
  if (!P) throw new Error(`sampler8: unknown preset ${preset}, use one of ${meta.presets.join(', ')}`);
  if (filter == null) filter = 'off';
  if (!meta.filter.includes(filter)) throw new Error(`sampler8: filter must be 'off' or 'led', got ${filter}`);
  if (bits == null) bits = 8;
  if (bits !== 8 && bits !== 6) throw new Error(`sampler8: bits must be 8 or 6, got ${bits}`);
  midi = Math.round(num('sampler8', 'midi', midi, 60, meta.range[0], meta.range[1]));
  const vel = num('sampler8', 'velocity', velocity, 0.8, 0, 1);
  const dur = num('sampler8', 'duration', duration, 0.5, 0.01, 30);
  num('sampler8', 'seed', seed, 1, -Infinity, Infinity);
  const r = rng(noteSeed(seed, [midi], `sampler8-${preset}`));

  const { s, period } = voicing(preset, midi);
  const data = bits === 8 ? s.data : Int8Array.from(s.data, (v) => Math.max(-128, Math.min(124, 4 * Math.round(v / 4))));
  const end = s.loopLen ? s.loopStart + s.loopLen : data.length;

  // Event list in chip clocks: [time, level change].
  const T = [], D = [];
  let vol = Math.round(64 * vel), held = 0, level = 0, per = period, pos = 0, t = 0;
  let k = 0, nextTick = r() * TICK, release = false, vpos = 0;
  const gate = dur * CLK, vib = P.vibrato;
  const emit = (time, l) => { if (l !== level) { T.push(time); D.push(l - level); level = l; } };
  while (vol > 0) {
    while (nextTick <= t && vol > 0) {
      if (!release && nextTick >= gate) release = true;
      if (release) { vol = Math.max(0, vol - P.release); emit(nextTick, held * vol); }
      if (vib && k >= vib.delay) {
        per = Math.max(PMIN, period + Math.round(vib.depth * period * Math.sin(2 * Math.PI * vpos / 64)));
        vpos = (vpos + vib.speed) & 63;
      }
      k++; nextTick += TICK;
    }
    if (vol === 0) break;
    if (pos >= end) { held = 0; emit(t, 0); break; }
    held = data[pos] / 128 / 64;
    emit(t, held * vol);
    t += per;
    if (++pos >= end && s.loopLen) pos = s.loopStart;
  }

  const pad = HALF + 2, scale = SR / CLK;
  const n = pad + Math.ceil(t * scale) + HALF + Math.round(0.06 * SR);
  const out = new StepSum(n);
  for (let i = 0; i < T.length; i++) out.add(pad + T[i] * scale, D[i]);
  const y = out.done();

  // Output stage: fixed RC low-pass at 4.4 kHz, optional two-pole filter at 3.3 kHz, coupling
  // capacitor as a 10 Hz high-pass.
  const lp = new RC(4420), led = filter === 'led' ? new LP2(3275, 0.707) : null, hp = new RC(10), g = 10 ** (GAIN_DB[preset] / 20);
  for (let i = 0; i < n; i++) {
    let v = lp.lp(y[i]);
    if (led) v = led.tick(v);
    y[i] = hp.hp(v) * g;
  }
  const f = Math.round(0.003 * SR);
  for (let i = 0; i < f; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / f);
  y[0] = 0;
  return y;
}
