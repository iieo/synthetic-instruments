import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { readdir, readFile, stat, open } from 'node:fs/promises';
import { pipeline } from 'node:stream';
import { join, resolve, sep, extname, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from './pool.mjs';
import { CATALOG, PAD_LABELS, OPTIONS, CATEGORY_ORDER } from './catalog.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIRS = {
  instruments: join(ROOT, 'instruments'),
  lib: join(ROOT, 'lib'),
  docs: join(ROOT, 'docs'),
  demos: join(ROOT, 'demos'),
  out: join(ROOT, 'out'),
  public: join(ROOT, 'ui', 'public'),
};
const PORT = Number(process.env.PORT) || 5173;
const HOSTS = process.env.HOST ? [process.env.HOST] : ['127.0.0.1', '::1'];
const SR = 48000;
const TARGET_PEAK = 0.4;
const CACHE_BYTES = 256 * 1024 * 1024;

const pool = new Pool(Math.max(1, os.availableParallelism() - 1));

// ---------- discovery ----------

async function fileList(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await fileList(p, out);
    else if (e.isFile()) { try { const s = await stat(p); out.push(`${p}:${s.mtimeMs}:${s.size}`); } catch {} }
  }
  return out;
}

const exists = (p) => stat(p).then((s) => s.isFile(), () => false);

// A hash over every file rather than the newest mtime, so restoring an older file also counts as a change.
let treeSig = '';
let lastTreeCheck = 0;
async function checkTree() {
  if (Date.now() - lastTreeCheck < 1500) return;
  lastTreeCheck = Date.now();
  const files = [...await fileList(DIRS.instruments), ...await fileList(DIRS.lib)].sort();
  const sig = createHash('sha1').update(files.join('\n')).digest('hex');
  if (treeSig && sig !== treeSig) pool.recycle();
  treeSig = sig;
}

const metaCache = new Map();

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

// Follows relative static imports, so editing a shared helper (e.g. instruments/synth/dsp.mjs or
// lib/audio.mjs) changes the version of every instrument that uses it.
async function importGraph(entry) {
  const seen = new Map();
  const visit = async (file) => {
    if (seen.has(file)) return;
    seen.set(file, null);
    let s, src;
    try { s = await stat(file); src = await readFile(file, 'utf8'); } catch { seen.set(file, 'missing'); return; }
    seen.set(file, `${s.mtimeMs}-${s.size}`);
    for (const m of src.matchAll(IMPORT_RE)) await visit(resolve(dirname(file), m[1]));
  };
  await visit(entry);
  return [...seen].map(([f, v]) => `${f}:${v}`).sort().join('|');
}

const versionCache = new Map();

async function instrumentVersion(id) {
  const hit = versionCache.get(id);
  if (hit && treeSig && hit.sig === treeSig) return hit.version;
  const sig = treeSig;
  const file = join(DIRS.instruments, `${id}.mjs`);
  const s = await stat(file);
  const graph = createHash('sha1').update(await importGraph(file)).digest('hex').slice(0, 12);
  const dirFiles = (await fileList(join(DIRS.instruments, id))).sort().join('\n');
  const dirSig = createHash('sha1').update(dirFiles).digest('hex').slice(0, 12);
  const version = `${s.mtimeMs}-${s.size}-${dirSig}-${graph}`;
  versionCache.set(id, { sig, version });
  return version;
}

const label = (v) => PAD_LABELS[v] || v;

function describe(id, version, probe) {
  const cat = CATALOG[id] || {};
  const meta = probe.meta || {};
  const pitched = !!probe.usesMidi;
  const voices = Array.isArray(meta.voices) ? meta.voices.map(String) : null;
  const presets = Array.isArray(meta.presets) ? meta.presets.map(String) : null;
  let pads = null, padParam = null;
  if (voices && voices.length) { pads = voices; padParam = 'voice'; }
  else if (presets && presets.length && !pitched) { pads = presets; padParam = 'preset'; }
  if (!pads && !pitched) throw new Error('weder Tonhöhe noch Stimmen erkennbar');

  const options = [];
  if (pitched && presets && presets.length) {
    options.push({ key: 'preset', label: 'Preset', values: presets.map((p) => ({ id: p, label: label(p), value: p })) });
  }
  if (OPTIONS[id]) options.push(...OPTIONS[id](meta));
  else {
    for (const [k, v] of Object.entries(meta)) {
      if (['range', 'voices', 'presets'].includes(k) || !Array.isArray(v) || !v.length) continue;
      if (!v.every((x) => typeof x === 'string')) continue;
      options.push({ key: k, label: k, values: v.map((x) => ({ id: x, label: x, value: k.endsWith('s') ? [x] : x })) });
    }
  }

  let range = null;
  if (pitched) {
    const r = Array.isArray(meta.range) && meta.range.length === 2 ? meta.range : cat.range || [36, 84];
    range = [Math.round(Number(r[0])), Math.round(Number(r[1]))];
    if (!range.every(Number.isFinite) || range[0] > range[1]) range = [36, 84];
  }
  return {
    id, version, available: true,
    name: cat.title || meta.name || id,
    category: cat.category || (pads ? 'Schlagwerk' : 'Sonstiges'),
    kind: pads ? (padParam === 'voice' ? 'percussion' : 'preset') : (presets ? 'preset' : 'melodic'),
    pitched,
    usesDuration: !!probe.usesDuration,
    usesBpm: !!probe.usesBpm,
    range,
    pads: pads && pads.map((p) => ({ id: p, label: label(p) })),
    padParam,
    options,
  };
}

async function findDoc(id) {
  const cand = [`${id}.md`, ...((CATALOG[id] && CATALOG[id].docs) || [])];
  for (const c of cand) if (await exists(join(DIRS.docs, c))) return c;
  return null;
}

// Exact mapping only: demos/<id>.mjs, or the script named in the catalog for instruments whose
// demo is written by a shared script (accordion by harmonica.mjs, the mallets by mallets.mjs).
async function findDemoScript(id) {
  const script = (CATALOG[id] && CATALOG[id].demoScript) || `${id}.mjs`;
  return (await exists(join(DIRS.demos, script))) ? script : null;
}

function firstParagraph(md) {
  const lines = md.split('\n');
  let inCode = false, para = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) { inCode = !inCode; if (para.length) break; continue; }
    if (inCode) continue;
    if (!line) { if (para.length) break; continue; }
    if (/^(#|\||[-*+] |\d+\. |>)/.test(line)) { if (para.length) break; continue; }
    para.push(line);
  }
  return para.join(' ');
}

async function probeInstrument(id) {
  let version;
  try { version = await instrumentVersion(id); } catch { metaCache.delete(id); return null; }
  const hit = metaCache.get(id);
  if (hit && hit.version === version && (hit.info.available || Date.now() - hit.at < 5000)) return hit.info;
  if (hit && hit.version === version && hit.pending) return hit.pending;
  const pending = pool.run({ type: 'meta', file: join(DIRS.instruments, `${id}.mjs`) }, { timeoutMs: 20000 })
    .then((probe) => describe(id, version, probe))
    .catch((e) => ({
      id, version, available: false, error: e.message,
      name: (CATALOG[id] && CATALOG[id].title) || id, category: (CATALOG[id] && CATALOG[id].category) || 'Sonstiges',
    }))
    .then((info) => { metaCache.set(id, { version, info, at: Date.now() }); return info; });
  metaCache.set(id, { version, info: { available: false }, at: 0, pending });
  return pending;
}

async function listInstruments() {
  await checkTree();
  let files = [];
  try { files = (await readdir(DIRS.instruments)).filter((f) => f.endsWith('.mjs')).sort(); } catch {}
  const docCache = new Map();
  const result = (await Promise.all(files.map(async (f) => {
    const id = f.slice(0, -4);
    const info = await probeInstrument(id);
    if (!info) return null;
    const doc = await findDoc(id);
    let description = (CATALOG[id] && CATALOG[id].desc) || '';
    if (!description && doc) {
      if (!docCache.has(doc)) docCache.set(doc, readFile(join(DIRS.docs, doc), 'utf8').then(firstParagraph, () => ''));
      description = await docCache.get(doc);
    }
    const demo = (await exists(join(DIRS.out, `${id}.wav`))) ? `${id}.wav` : null;
    return { ...info, doc, description, demo, demoScript: await findDemoScript(id) };
  }))).filter(Boolean);
  result.sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category), cb = CATEGORY_ORDER.indexOf(b.category);
    return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || a.name.localeCompare(b.name, 'de');
  });
  return result;
}

async function getInstrument(id) {
  await checkTree();
  return probeInstrument(id);
}

// ---------- rendering ----------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const cache = new Map();
let cacheBytes = 0;
const inflight = new Map();
const gains = new Map();

function cacheGet(key) {
  const v = cache.get(key);
  if (v) { cache.delete(key); cache.set(key, v); }
  return v;
}
function cachePut(key, buf) {
  const old = cache.get(key);
  if (old) { cache.delete(key); cacheBytes -= old.length; }
  cache.set(key, buf);
  cacheBytes += buf.length;
  for (const [k, v] of cache) {
    if (cacheBytes <= CACHE_BYTES) break;
    cache.delete(k);
    cacheBytes -= v.length;
  }
}

function parseNum(q, name, def, lo, hi, int = false) {
  const raw = q.get(name);
  if (raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) {
    throw new HttpError(400, `${name} muss ${int ? 'eine ganze Zahl' : 'eine Zahl'} von ${lo} bis ${hi} sein`);
  }
  return n;
}

function parseRequest(inst, q) {
  const job = {
    velocity: Math.round(parseNum(q, 'velocity', 0.8, 0, 1) * 1000) / 1000,
    seed: parseNum(q, 'seed', 1, 0, 2 ** 31 - 1, true),
    opts: {},
  };
  if (inst.pads) {
    const pad = q.get('pad') || q.get(inst.padParam);
    if (!inst.pads.some((p) => p.id === pad)) throw new HttpError(400, `pad muss einer von ${inst.pads.map((p) => p.id).join(', ')} sein`);
    job.pad = pad;
  } else {
    job.midi = parseNum(q, 'midi', NaN, inst.range[0], inst.range[1], true);
    if (Number.isNaN(job.midi)) throw new HttpError(400, 'midi fehlt');
  }
  job.duration = inst.usesDuration ? Math.round(parseNum(q, 'duration', 1, 0.05, 10) * 100) / 100 : null;
  job.bpm = inst.usesBpm ? parseNum(q, 'bpm', null, 40, 220, true) : null;
  for (const o of inst.options) {
    const raw = q.get(`o_${o.key}`);
    const chosen = raw === null || raw === '' ? o.values[0] : o.values.find((v) => v.id === raw);
    if (!chosen) throw new HttpError(400, `${o.key} muss einer von ${o.values.map((v) => v.id).join(', ')} sein`);
    job.opts[o.key] = chosen.id;
  }
  for (const k of q.keys()) {
    if (!['inst', 'midi', 'pad', 'velocity', 'duration', 'seed', inst.padParam, inst.usesBpm && 'bpm'].includes(k) && !(k.startsWith('o_') && inst.options.some((o) => `o_${o.key}` === k))) {
      throw new HttpError(400, `unbekannter Parameter ${k}`);
    }
  }
  return job;
}

function renderArgs(inst, { midi, pad, velocity, duration, bpm, seed, opts }) {
  const args = { velocity, seed };
  if (pad !== undefined) args[inst.padParam] = pad;
  if (midi !== undefined) args.midi = midi;
  if (duration !== null && duration !== undefined) args.duration = duration;
  if (bpm !== null && bpm !== undefined) args.bpm = bpm;
  for (const o of inst.options) {
    const v = o.values.find((x) => x.id === opts[o.key]);
    if (v) args[o.key] = v.value;
  }
  return args;
}

const optsKey = (opts) => Object.keys(opts).sort().map((k) => `${k}=${opts[k]}`).join('&');

async function rawRender(inst, job, signal) {
  const res = await pool.run({ type: 'render', file: join(DIRS.instruments, `${inst.id}.mjs`), args: renderArgs(inst, job) }, { signal });
  return res.channels;
}

const peakOf = (chans) => {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return p;
};

// One fixed gain per instrument and option set, taken from reference notes at velocity 0.8,
// so velocity differences survive and all instruments land near the same level.
function referenceGain(inst, opts) {
  const key = `${inst.id}|${inst.version}|${optsKey(opts)}`;
  if (!gains.has(key)) {
    const jobs = inst.pads
      ? inst.pads.map((p) => ({ pad: p.id }))
      : [0.25, 0.5, 0.75].map((f) => ({ midi: Math.round(inst.range[0] + f * (inst.range[1] - inst.range[0])) }));
    const p = Promise.all(jobs.map((j) => rawRender(inst, { velocity: 0.8, seed: 1, duration: inst.usesDuration ? 1 : null, opts, ...j })))
      .then((outs) => {
        const peak = Math.max(...outs.map(peakOf));
        return peak > 1e-9 ? Math.min(1000, Math.max(0.001, TARGET_PEAK / peak)) : 1;
      });
    p.catch(() => gains.delete(key));
    gains.set(key, p);
  }
  return gains.get(key);
}

function encodeWav(chans) {
  const nCh = chans.length, n = chans[0].length;
  const buf = Buffer.alloc(44 + n * nCh * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * nCh * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nCh, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * nCh * 2, 28); buf.writeUInt16LE(nCh * 2, 32);
  buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * nCh * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  return buf;
}

async function renderWav(inst, job, signal) {
  const [chans, gain] = await Promise.all([rawRender(inst, job, signal), referenceGain(inst, job.opts)]);
  // Tempo-bound sounds (an 8-beat riser at a slow tempo) may run far longer than a drum hit.
  const maxLen = Math.round(SR * (inst.usesDuration ? job.duration + 5 : inst.usesBpm ? 34 : 6));
  let n = chans[0].length;
  // Trim trailing silence, cap very long tails with a short fade.
  let last = 0;
  for (const c of chans) for (let i = n - 1; i > last; i--) if (Math.abs(c[i] * gain) > 1e-4) { last = i; break; }
  n = Math.max(1, Math.min(last + Math.round(0.02 * SR), n));
  const cut = n > maxLen;
  if (cut) n = maxLen;
  const fade = Math.min(n, Math.round((cut ? 0.4 : 0.02) * SR));
  const out = chans.map((c) => {
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = c[i] * gain;
    for (let i = 0; i < fade; i++) y[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    return y;
  });
  return encodeWav(out);
}

async function handleRender(q, res) {
  const id = q.get('inst');
  if (!id || !/^[\w-]+$/.test(id)) throw new HttpError(400, 'inst fehlt oder ist ungültig');
  const inst = await getInstrument(id);
  if (!inst) throw new HttpError(404, `Instrument ${id} gibt es nicht`);
  if (!inst.available) throw new HttpError(503, `Instrument ${id} ist gerade nicht verfügbar: ${inst.error}`);
  const job = parseRequest(inst, q);
  const key = `${id}|${inst.version}|${job.pad ?? job.midi}|${job.velocity}|${job.duration}|${job.bpm}|${job.seed}|${optsKey(job.opts)}`;
  const t0 = performance.now();
  let wav = cacheGet(key), status = 'hit';
  if (!wav) {
    status = 'miss';
    if (!res.socket || res.socket.destroyed) return;
    let entry = inflight.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, waiters: 0, promise: null };
      entry.promise = renderWav(inst, job, controller.signal)
        .then((buf) => { cachePut(key, buf); return buf; })
        .finally(() => { if (inflight.get(key) === entry) inflight.delete(key); });
      entry.promise.catch(() => {});
      inflight.set(key, entry);
    }
    // When every client waiting for this render has gone, drop the job if it is still queued.
    entry.waiters++;
    let waiting = true;
    res.on('close', () => {
      if (!waiting) return;
      waiting = false;
      if (--entry.waiters === 0 && inflight.get(key) === entry) {
        inflight.delete(key);
        entry.controller.abort();
      }
    });
    try {
      wav = await entry.promise;
    } catch (e) {
      if (e.code === 'ABORTED') { res.destroy(); return; }
      if (e.code === 'QUEUE_FULL') throw new HttpError(503, e.message);
      throw new HttpError(500, `Rendern fehlgeschlagen: ${e.message}`);
    } finally {
      if (waiting) { waiting = false; entry.waiters--; }
    }
  }
  if (res.destroyed) return;
  res.writeHead(200, {
    'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store',
    'X-Cache': status, 'X-Render-Ms': (performance.now() - t0).toFixed(0),
  });
  res.end(wav);
}

// ---------- demos ----------

const demoRuns = new Map();

function runDemo(script) {
  if (!demoRuns.has(script)) {
    const p = new Promise((resolveRun, reject) => {
      const child = spawn(process.execPath, [join(DIRS.demos, script)], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
      const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60 * 1000);
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timer);
        code === 0 ? resolveRun() : reject(new Error(err.trim().split('\n').pop() || `Exit-Code ${code}`));
      });
    }).finally(() => demoRuns.delete(script));
    demoRuns.set(script, p);
  }
  return demoRuns.get(script);
}

async function handleDemo(id, res) {
  if (!/^[\w-]+$/.test(id)) throw new HttpError(400, 'ungültiger Name');
  if (!(await exists(join(DIRS.instruments, `${id}.mjs`)))) throw new HttpError(404, `Instrument ${id} gibt es nicht`);
  const script = await findDemoScript(id);
  if (!script) throw new HttpError(404, `kein Demo-Skript für ${id}`);
  try { await runDemo(script); } catch (e) { throw new HttpError(500, `Demo-Skript ${script} fehlgeschlagen: ${e.message}`); }
  const demo = (await exists(join(DIRS.out, `${id}.wav`))) ? `${id}.wav` : null;
  if (!demo) throw new HttpError(500, `${script} lief durch, hat aber keine out/${id}.wav geschrieben`);
  sendJson(res, 200, { demo });
}

// ---------- static files ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json',
};

function safeJoin(base, rel) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const p = resolve(base, '.' + sep + decoded);
  return p === base || p.startsWith(base + sep) ? p : null;
}

async function sendFile(req, res, file) {
  let fh, s;
  try {
    fh = await open(file, 'r');
    s = await fh.stat();
  } catch (e) {
    if (fh) await fh.close().catch(() => {});
    if (e.code === 'ENOENT' || e.code === 'EISDIR' || e.code === 'ENOTDIR') throw new HttpError(404, 'nicht gefunden');
    throw new HttpError(e.code === 'EACCES' || e.code === 'EPERM' ? 403 : 500, 'Datei lässt sich nicht lesen');
  }
  if (!s.isFile()) { await fh.close().catch(() => {}); throw new HttpError(404, 'nicht gefunden'); }
  const stream = (opts) => pipeline(fh.createReadStream(opts), res, (err) => { if (err) res.destroy(); });
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, s.size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), s.size - 1) : s.size - 1;
    if (start > end || start >= s.size) {
      await fh.close().catch(() => {});
      res.writeHead(416, { 'Content-Range': `bytes */${s.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${s.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') { await fh.close().catch(() => {}); return res.end(); }
    return stream({ start, end });
  }
  res.writeHead(200, { ...headers, 'Content-Length': s.size });
  if (req.method === 'HEAD') { await fh.close().catch(() => {}); return res.end(); }
  stream({});
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' });
  res.end(data);
}

// ---------- routing ----------

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const isGet = req.method === 'GET' || req.method === 'HEAD';

  if (path === '/api/instruments' && isGet) return sendJson(res, 200, { instruments: await listInstruments(), workers: pool.size });
  if (path === '/api/render' && isGet) return handleRender(url.searchParams, res);
  if (path.startsWith('/api/doc/') && isGet) {
    const name = path.slice('/api/doc/'.length);
    if (!/^[\w.-]+\.md$/.test(name)) throw new HttpError(400, 'ungültiger Dateiname');
    const file = safeJoin(DIRS.docs, name);
    if (!file) throw new HttpError(400, 'ungültiger Pfad');
    return sendFile(req, res, file);
  }
  if (path.startsWith('/api/demo/')) {
    if (req.method !== 'POST') throw new HttpError(405, 'nur POST');
    return handleDemo(path.slice('/api/demo/'.length), res);
  }
  if (path.startsWith('/api/')) throw new HttpError(404, 'unbekannter Endpunkt');
  if (path.startsWith('/demos/') && isGet) {
    const name = path.slice('/demos/'.length);
    if (!/^[\w.-]+\.wav$/.test(name)) throw new HttpError(400, 'ungültiger Dateiname');
    const file = safeJoin(DIRS.out, name);
    if (!file) throw new HttpError(400, 'ungültiger Pfad');
    return sendFile(req, res, file);
  }
  if (!isGet) throw new HttpError(405, 'Methode nicht erlaubt');
  const file = safeJoin(DIRS.public, path === '/' ? 'index.html' : path.slice(1));
  if (!file) throw new HttpError(400, 'ungültiger Pfad');
  return sendFile(req, res, file);
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

// Blocks DNS rebinding (foreign Host) and requests that other websites fire at this server.
function checkOrigin(req) {
  const host = req.headers.host || '';
  if (!LOOPBACK_HOST.test(host)) throw new HttpError(403, 'Host nicht erlaubt');
  const origin = req.headers.origin;
  if (origin !== undefined && origin.toLowerCase() !== `http://${host.toLowerCase()}`) {
    throw new HttpError(403, 'Anfragen von fremden Seiten sind nicht erlaubt');
  }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none' && /^\/(api|demos)\//.test(req.url || '')) {
    throw new HttpError(403, 'Anfragen von fremden Seiten sind nicht erlaubt');
  }
}

const handler = (req, res) => {
  Promise.resolve().then(() => { checkOrigin(req); return route(req, res); }).catch((e) => {
    const status = e.status || 500;
    if (status === 500) console.error(e.message);
    if (res.headersSent) return res.destroy();
    sendJson(res, status, { error: e.message });
  });
};

// Loopback only, but on IPv4 and IPv6, so localhost and 127.0.0.1 both work.
const servers = HOSTS.map((host, idx) => {
  const server = http.createServer(handler);
  server.on('error', (e) => {
    if (idx > 0 && !process.env.HOST && (e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT')) return;
    if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} ist belegt. Starte mit PORT=5174 node ui/server.mjs`);
    else console.error(e);
    process.exit(1);
  });
  server.listen(PORT, host, () => {
    if (idx > 0) return;
    console.log(`Synthetische Instrumente: http://localhost:${PORT}  (${pool.size} Render-Worker)`);
    listInstruments().catch(() => {});
  });
  return server;
});

const shutdown = () => {
  for (const server of servers) server.close();
  pool.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
