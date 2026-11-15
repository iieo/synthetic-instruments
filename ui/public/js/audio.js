import { optionApplies } from './util.js';

let ctx = null;
let master = null;

export function audioCtx() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = buildMaster(ctx);
  }
  return ctx;
}

// Gentle limiter so stacked notes don't clip.
export function buildMaster(c) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 6;
  comp.ratio.value = 8;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  comp.connect(c.destination);
  return comp;
}

export function masterNode() {
  audioCtx();
  return master;
}

export function unlockAudio() {
  const c = audioCtx();
  if (c.state !== 'running') c.resume().catch(() => {});
}

export function soundUrl(inst, { midi, pad, velocity = 0.8, duration = 1, bpm, seed = 1, opts = {} }) {
  const q = new URLSearchParams({ inst: inst.id });
  const padId = inst.pads ? pad ?? inst.pads[0].id : undefined;
  if (inst.pads) q.set('pad', padId);
  else q.set('midi', String(midi));
  q.set('velocity', String(Math.round(velocity * 100) / 100));
  if (inst.usesDuration) q.set('duration', String(Math.max(0.05, Math.min(10, Math.round(duration * 100) / 100))));
  if (inst.usesBpm && bpm) q.set('bpm', String(Math.round(Math.max(40, Math.min(220, bpm)))));
  q.set('seed', String(seed));
  for (const o of inst.options || []) {
    if (!optionApplies(o, padId)) continue;
    const v = opts[o.key];
    q.set(`o_${o.key}`, o.values.some((x) => x.id === v) ? v : o.values[0].id);
  }
  return `/api/render?${q}`;
}

const buffers = new Map();
const MAX_BYTES = 300 * 1024 * 1024;
let bytes = 0;
const waiting = [];
let active = 0;
const MAX_PARALLEL = 6;

function pump() {
  while (active < MAX_PARALLEL && waiting.length) {
    const job = waiting.shift();
    active++;
    job.run().finally(() => { active--; pump(); });
  }
}

async function fetchDecode(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.arrayBuffer();
  return audioCtx().decodeAudioData(data);
}

function remember(url, buf) {
  buffers.delete(url);
  buffers.set(url, buf);
  bytes += buf.length * buf.numberOfChannels * 4;
  for (const [k, v] of buffers) {
    if (bytes <= MAX_BYTES) break;
    if (!(v instanceof AudioBuffer)) continue;
    buffers.delete(k);
    bytes -= v.length * v.numberOfChannels * 4;
  }
}

export function peekBuffer(url) {
  const b = buffers.get(url);
  return b instanceof AudioBuffer ? b : null;
}

export function getBuffer(url, urgent = false) {
  const have = buffers.get(url);
  if (have instanceof AudioBuffer) return Promise.resolve(have);
  if (have) {
    if (urgent && have.job) {
      const i = waiting.indexOf(have.job);
      if (i > 0) { waiting.splice(i, 1); waiting.unshift(have.job); }
    }
    return have;
  }
  let job;
  const p = new Promise((resolve, reject) => {
    job = { run: () => fetchDecode(url).then(resolve, reject) };
  });
  p.job = job;
  p.then((buf) => remember(url, buf), () => buffers.delete(url));
  buffers.set(url, p);
  if (urgent) waiting.unshift(job); else waiting.push(job);
  pump();
  return p;
}

// Tracks one batch of background renders; a newer batch replaces the older one in the UI.
export function prefetch(urls, onProgress) {
  const unique = [...new Set(urls)];
  let done = 0, failed = 0;
  const token = {};
  prefetch.current = token;
  const report = () => { if (prefetch.current === token) onProgress({ done, failed, total: unique.length }); };
  report();
  return Promise.all(unique.map((u) => getBuffer(u).then(
    () => { done++; report(); },
    () => { done++; failed++; report(); },
  )));
}

export function playBuffer(buf, { when = 0, gain = 1, dest } = {}) {
  const c = audioCtx();
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(dest || masterNode());
  src.start(when);
  return { src, gain: g };
}

export function encodeWav(audioBuffer) {
  const nCh = audioBuffer.numberOfChannels, n = audioBuffer.length, sr = audioBuffer.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * nCh * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * nCh * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, nCh, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * nCh * 2, true); out.setUint16(32, nCh * 2, true);
  out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * nCh * 2, true);
  const chans = Array.from({ length: nCh }, (_, c) => audioBuffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      out.setInt16(o, Math.round(v * 32767), true);
      o += 2;
    }
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
