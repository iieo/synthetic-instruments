import { store, el, select, instrumentOptions, noteName, debounce, progressText, defaultOpts, isTyping, noteRange, optionApplies } from './util.js';
import { audioCtx, masterNode, buildMaster, soundUrl, getBuffer, peekBuffer, prefetch, unlockAudio, encodeWav } from './audio.js';

const MAX_STEPS = 32;
const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const AUTO_KEY = 'synth-ui.pattern.v1';
const SLOT_KEY = 'synth-ui.pattern.saved';
const VELS = [{ value: '0.5', label: 'Leise' }, { value: '0.8', label: 'Normal' }, { value: '1', label: 'Akzent' }];
const LENS = [1, 2, 3, 4, 6, 8, 16];

let rowSeq = 0;
const newId = () => `r${Date.now().toString(36)}${(rowSeq++).toString(36)}`;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function emptySteps() { return Array.from({ length: MAX_STEPS }, () => null); }

function makeRow(instId, extra = {}) {
  const inst = store.byId.get(instId);
  const row = {
    id: newId(), inst: instId, pad: null, note: 48, opts: inst ? defaultOpts(inst) : {},
    len: 2, vol: 0.8, mute: false, solo: false, steps: emptySteps(), ...extra,
    opts: { ...(inst ? defaultOpts(inst) : {}), ...(extra.opts || {}) },
  };
  if (inst && inst.pads && !inst.pads.some((p) => p.id === row.pad)) row.pad = inst.pads[0].id;
  if (inst && inst.range) fitRow(row, inst);
  return row;
}

// Keeps the row's note and its per-step notes inside the range of the chosen preset.
function fitRow(row, inst) {
  const [lo, hi] = noteRange(inst, row.opts);
  row.note = clamp(row.note, lo, hi);
  for (const s of row.steps) if (s && s.n !== undefined && (s.n < lo || s.n > hi)) delete s.n;
}

function hits(list, v = 0.8, notes = {}) {
  const s = emptySteps();
  for (const i of list) s[i] = { v, ...(notes[i] !== undefined ? { n: notes[i] } : {}) };
  return s;
}

const ok = (id) => store.byId.get(id)?.available;
const hasPad = (id, pad) => ok(id) && store.byId.get(id).pads?.some((p) => p.id === pad);

// Two bars in A minor, chords Am F C G. The riser spans the whole loop and lands on the downbeat.
function ravePattern() {
  if (!ok('hardstyle-kick') || !hasPad('breakbeat', 'hat') || !ok('rolling-bass')) return null;
  const rows = [];
  const beats = [0, 4, 8, 12, 16, 20, 24, 28];
  const offs = beats.map((b) => b + 2);
  const chordOf = (step, roots) => roots[Math.floor(step / 8)];
  rows.push(makeRow('hardstyle-kick', {
    note: 33, len: 2, vol: 0.9, opts: { preset: 'euphoric' },
    steps: hits(beats, 0.9, Object.fromEntries(beats.map((b) => [b, chordOf(b, [33, 29, 36, 31])]))),
  }));
  rows.push(makeRow('rolling-bass', {
    note: 45, len: 1, vol: 0.7, opts: { preset: 'offbeat' },
    steps: hits(offs, 0.8, Object.fromEntries(offs.map((b) => [b, chordOf(b, [45, 41, 48, 43])]))),
  }));
  rows.push(makeRow('breakbeat', { pad: 'snare', vol: 0.6, steps: hits([4, 12, 20, 28]) }));
  const hat = hits(offs, 0.8);
  for (const i of [7, 15, 23, 31]) hat[i] = { v: 0.5 };
  rows.push(makeRow('breakbeat', { pad: 'hat', vol: 0.45, steps: hat }));
  if (hasPad('breakbeat', 'ghost')) rows.push(makeRow('breakbeat', { pad: 'ghost', vol: 0.4, steps: hits([11, 27, 30], 0.5) }));
  if (ok('supersaw')) {
    rows.push(makeRow('supersaw', {
      note: 69, len: 2, vol: 0.4, opts: { preset: 'anthem' },
      steps: hits([0, 3, 6, 10, 13, 16, 19, 22, 26, 29], 0.8, { 3: 72, 6: 76, 10: 77, 13: 76, 16: 72, 19: 76, 22: 79, 26: 74, 29: 71 }),
    }));
  }
  if (ok('vox')) rows.push(makeRow('vox', { note: 76, len: 4, vol: 0.4, opts: { preset: 'pitched', vowel: 'ah-oh' }, steps: hits([14, 30], 0.8, { 30: 74 }) }));
  if (hasPad('fx', 'riser')) {
    rows.push(makeRow('fx', { pad: 'riser', vol: 0.3, steps: hits([0], 0.7) }));
    rows.push(makeRow('fx', { pad: 'impact', vol: 0.35, steps: hits([0], 0.8) }));
  }
  return { bpm: 150, swing: 0, length: 32, rows };
}

// Two bars in D minor, chords Dm Bb F A. Over the bass the top strings rise A, Bb, C, C# (half, whole, half step).
function orchestraPattern() {
  if (!ok('timpani') || !ok('string-ensemble') || !ok('tuba')) return null;
  const rows = [];
  const notesAt = (steps, notes) => Object.fromEntries(steps.map((s, k) => [s, notes[k]]));
  const chords = [0, 8, 16, 24];
  rows.push(makeRow('string-ensemble', { note: 69, len: 8, vol: 0.5, opts: { preset: 'legato' }, steps: hits(chords, 0.7, notesAt(chords, [69, 70, 72, 73])) }));
  rows.push(makeRow('string-ensemble', { note: 62, len: 8, vol: 0.45, opts: { preset: 'legato' }, steps: hits(chords, 0.6, notesAt(chords, [62, 62, 60, 61])) }));
  const bass = [0, 4, 8, 12, 16, 20, 24, 28];
  rows.push(makeRow('tuba', { note: 38, len: 3, vol: 0.6, steps: hits(bass, 0.7, notesAt(bass, [38, 45, 34, 41, 41, 36, 33, 40])) }));
  const timp = hits([0, 8, 16, 24, 28, 30], 0.8, { 8: 46, 16: 41, 24: 45, 28: 45, 30: 45 });
  timp[0].v = 1; timp[28].v = 0.5; timp[30].v = 0.5;
  rows.push(makeRow('timpani', { note: 50, len: 4, vol: 0.75, steps: timp }));
  if (ok('harpsichord')) {
    const arp = Array.from({ length: 16 }, (_, k) => k * 2);
    const tones = [74, 77, 81, 77, 74, 77, 82, 77, 72, 77, 81, 77, 73, 76, 81, 76];
    rows.push(makeRow('harpsichord', { note: 74, len: 2, vol: 0.35, steps: hits(arp, 0.6, notesAt(arp, tones)) }));
  }
  if (ok('gong')) rows.push(makeRow('gong', { note: 40, vol: 0.3, opts: { preset: 'tamtam' }, steps: hits([0], 0.6) }));
  return { bpm: 90, swing: 0, length: 32, rows };
}

const EXAMPLES = [
  { id: 'techno', label: 'Techno 128', build: () => defaultPattern() },
  { id: 'rave', label: 'Rave 150', build: () => ravePattern() },
  { id: 'orchester', label: 'Orchester 90', build: () => orchestraPattern() },
];

export function defaultPattern() {
  const rows = [];
  if (ok('techno-kick') && hasPad('drum-machine', 'clap') && ok('acid')) {
    rows.push(makeRow('techno-kick', { pad: 'hard', vol: 0.9, steps: hits([0, 4, 8, 12], 0.9) }));
    rows.push(makeRow('drum-machine', { pad: 'clap', vol: 0.6, steps: hits([4, 12]) }));
    if (hasPad('drum-machine', 'hatOpen')) rows.push(makeRow('drum-machine', { pad: 'hatOpen', vol: 0.45, steps: hits([2, 6, 10, 14]) }));
    if (hasPad('drum-machine', 'hatClosed')) {
      const s = hits([1, 3, 5, 7, 9, 11, 13, 15], 0.5);
      s[7] = { v: 0.8 }; s[15] = { v: 0.8 };
      rows.push(makeRow('drum-machine', { pad: 'hatClosed', vol: 0.4, steps: s }));
    }
    rows.push(makeRow('acid', {
      note: 33, len: 1, vol: 0.7,
      steps: hits([2, 3, 6, 7, 10, 11, 13, 14], 0.8, { 3: 45, 7: 36, 11: 45, 13: 31, 14: 43 }),
    }));
    rows[rows.length - 1].steps[7].v = 1;
    if (ok('rave')) rows.push(makeRow('rave', { note: 57, len: 2, vol: 0.4, opts: { preset: 'stab' }, steps: hits([0, 10], 0.8) }));
    return { bpm: 128, swing: 0, length: 16, rows };
  }
  if (hasPad('drums', 'kick')) {
    rows.push(makeRow('drums', { pad: 'kick', vol: 0.9, steps: hits([0, 7, 8, 10]) }));
    rows.push(makeRow('drums', { pad: 'snare', vol: 0.75, steps: hits([4, 12]) }));
    rows.push(makeRow('drums', { pad: 'hihatClosed', vol: 0.45, steps: hits([0, 2, 4, 6, 8, 10, 12, 14], 0.6) }));
  }
  if (ok('bass')) rows.push(makeRow('bass', { note: 40, len: 2, vol: 0.8, steps: hits([0, 3, 7, 8, 10, 14], 0.8, { 7: 43, 14: 38 }) }));
  if (ok('epiano')) for (const n of [60, 64, 67]) rows.push(makeRow('epiano', { note: n, len: 6, vol: 0.5, steps: hits([0, 6, 11]) }));
  if (!rows.length) {
    const first = store.instruments.find((i) => i.available);
    if (first) rows.push(makeRow(first.id, { steps: hits([0, 4, 8, 12]) }));
  }
  return { bpm: 96, swing: 20, length: 16, rows };
}

const num = (x, def, lo, hi) => {
  const n = Number(x);
  return x !== null && x !== '' && typeof x !== 'boolean' && Number.isFinite(n) ? clamp(n, lo, hi) : def;
};
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Stored patterns may come from older versions or be edited by hand, so every field is checked
// against the current instrument list and falls back to its default on its own.
function sanitize(p) {
  if (!isObj(p) || !Array.isArray(p.rows)) return null;
  return {
    bpm: Math.round(num(p.bpm, 120, 40, 220)),
    swing: Math.round(num(p.swing, 0, 0, 100)),
    length: p.length === 32 ? 32 : 16,
    rows: p.rows.filter((r) => isObj(r) && typeof r.inst === 'string' && r.inst).map((r) => {
      const inst = store.byId.get(r.inst);
      let pad = typeof r.pad === 'string' ? r.pad : null;
      if (inst && inst.pads && !inst.pads.some((x) => x.id === pad)) pad = inst.pads[0].id;
      const opts = inst ? defaultOpts(inst) : {};
      if (isObj(r.opts)) {
        for (const [k, v] of Object.entries(r.opts)) {
          if (!inst) { if (typeof v === 'string') opts[k] = v; continue; }
          const o = (inst.options || []).find((x) => x.key === k);
          if (o && o.values.some((x) => x.id === v)) opts[k] = v;
        }
      }
      const range = inst && noteRange(inst, opts);
      const inRange = (n) => Number.isInteger(n) && (!range || (n >= range[0] && n <= range[1]));
      let note = Number.isInteger(r.note) ? r.note : 48;
      if (range) note = clamp(note, range[0], range[1]);
      return {
        id: newId(), inst: r.inst, pad, note, opts,
        len: LENS.includes(r.len) ? r.len : 2, vol: num(r.vol, 0.8, 0, 1), mute: r.mute === true, solo: r.solo === true,
        steps: Array.from({ length: MAX_STEPS }, (_, i) => {
          const s = Array.isArray(r.steps) ? r.steps[i] : null;
          if (!isObj(s)) return null;
          const out = { v: num(s.v, 0.8, 0.05, 1) };
          if (inRange(s.n)) out.n = s.n;
          return out;
        }),
      };
    }),
  };
}

function readStore(key) {
  try { return sanitize(JSON.parse(localStorage.getItem(key))); } catch { return null; }
}
function writeStore(key, p) {
  try { localStorage.setItem(key, JSON.stringify(p)); return true; } catch { return false; }
}

export function createSequencer(root) {
  let pattern = null;
  let playing = false;
  let timer = null;
  let nextStep = 0, nextTime = 0;
  const visualQueue = [];
  let raf = 0;
  let shownStep = -1;
  const rowNodes = new Map();
  const voices = new Map();
  const live = new Set();
  const failedUrls = new Set();
  let progressEl = null, statusEl = null, playBtn = null;
  let popover = null;

  const stepDur = () => 60 / pattern.bpm / 4;
  const swingOffset = (step) => (step % 2 === 1 ? (pattern.swing / 100) * stepDur() * 0.5 : 0);
  const anySolo = () => pattern.rows.some((r) => r.solo);
  const audible = (row) => !row.mute && (!anySolo() || row.solo);

  function stepUrl(row, s) {
    const inst = store.byId.get(row.inst);
    if (!inst || !inst.available) return null;
    const dur = Math.max(0.05, Math.round((row.len * stepDur()) / 0.05) * 0.05);
    const r = inst.range && noteRange(inst, row.opts);
    const midi = r ? clamp(s.n ?? row.note, r[0], r[1]) : undefined;
    return soundUrl(inst, { midi, pad: row.pad, velocity: s.v, duration: dur, bpm: pattern.bpm, opts: row.opts });
  }

  function neededUrls(onlyAudible = true) {
    const urls = [];
    for (const row of pattern.rows) {
      if (onlyAudible && !audible(row)) continue;
      for (let i = 0; i < pattern.length; i++) {
        const s = row.steps[i];
        if (!s) continue;
        const u = stepUrl(row, s);
        if (u) urls.push(u);
      }
    }
    return urls;
  }

  const prerender = debounce(() => {
    prefetch(neededUrls(), (p) => { if (progressEl) progressEl.textContent = progressText(p); });
  }, 250);

  const autosave = debounce(() => writeStore(AUTO_KEY, pattern), 300);

  function changed({ rebuild = false } = {}) {
    failedUrls.clear();
    autosave();
    prerender();
    syncRowNodes();
    if (rebuild) render();
  }

  function syncRowNodes() {
    if (!pattern) return;
    const c = audioCtx();
    const ids = new Set(pattern.rows.map((r) => r.id));
    for (const [id, node] of rowNodes) if (!ids.has(id)) { node.disconnect(); rowNodes.delete(id); }
    for (const row of pattern.rows) {
      let g = rowNodes.get(row.id);
      if (!g) { g = c.createGain(); g.connect(masterNode()); rowNodes.set(row.id, g); }
      g.gain.setTargetAtTime(audible(row) ? row.vol : 0, c.currentTime, 0.01);
    }
  }

  // Shared by live playback and the offline export.
  function scheduleStep(c, nodes, step, time, voiceMap, track) {
    for (const row of pattern.rows) {
      const s = row.steps[step];
      if (!s || !audible(row)) continue;
      const url = stepUrl(row, s);
      if (!url) continue;
      const buf = peekBuffer(url);
      if (!buf) {
        if (!failedUrls.has(url)) getBuffer(url).catch(() => failedUrls.add(url));
        continue;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      src.connect(g).connect(nodes.get(row.id));
      src.start(time);
      const inst = store.byId.get(row.inst);
      if (!inst.pads) {
        const prev = voiceMap.get(row.id);
        if (prev) {
          prev.g.gain.setTargetAtTime(0, time, 0.015);
          try { prev.src.stop(time + 0.15); } catch {}
        }
        voiceMap.set(row.id, { src, g });
      }
      if (track) {
        const v = { src, time };
        live.add(v);
        src.onended = () => live.delete(v);
      }
    }
  }

  function tick() {
    const c = audioCtx();
    // After a stall of the main thread, skip the missed steps instead of firing them all at once.
    while (nextTime < c.currentTime) {
      nextStep = (nextStep + 1) % pattern.length;
      nextTime += stepDur();
    }
    while (nextTime < c.currentTime + LOOKAHEAD) {
      const t = nextTime + swingOffset(nextStep);
      scheduleStep(c, rowNodes, nextStep, t, voices, true);
      visualQueue.push({ step: nextStep, time: t });
      nextStep = (nextStep + 1) % pattern.length;
      nextTime += stepDur();
    }
  }

  function draw() {
    const c = audioCtx();
    let cur = null;
    while (visualQueue.length && visualQueue[0].time <= c.currentTime) cur = visualQueue.shift();
    if (cur && cur.step !== shownStep) showStep(cur.step);
    if (playing) raf = requestAnimationFrame(draw);
  }

  function showStep(step) {
    for (const e of root.querySelectorAll('.now')) e.classList.remove('now');
    shownStep = step;
    if (step >= 0) for (const e of root.querySelectorAll(`[data-step="${step}"]`)) e.classList.add('now');
  }

  function play() {
    if (playing) return;
    unlockAudio();
    syncRowNodes();
    const c = audioCtx();
    playing = true;
    nextStep = 0;
    nextTime = c.currentTime + 0.08;
    visualQueue.length = 0;
    tick();
    timer = setInterval(tick, TICK_MS);
    raf = requestAnimationFrame(draw);
    updatePlayBtn();
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    const now = audioCtx().currentTime;
    for (const v of live) if (v.time > now) { try { v.src.stop(); } catch {} live.delete(v); }
    voices.clear();
    visualQueue.length = 0;
    showStep(-1);
    updatePlayBtn();
  }

  function updatePlayBtn() {
    if (!playBtn) return;
    playBtn.textContent = playing ? 'Stopp' : 'Abspielen';
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.classList.toggle('active', playing);
  }

  function setStatus(text, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  // Raised cosine that reaches exactly zero on the last sample.
  function fadeOut(buf, len) {
    const n = buf.length;
    len = Math.min(len, n);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[n - len + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / len);
    }
  }

  async function exportWav(btn) {
    const loops = 4;
    btn.disabled = true;
    try {
      const urls = neededUrls();
      if (!urls.length) { setStatus('Das Pattern ist leer.', true); return; }
      setStatus('Klänge werden gerendert …');
      await Promise.all([...new Set(urls)].map((u) => getBuffer(u, true)));
      setStatus('Mische den Loop …');
      const sr = audioCtx().sampleRate;
      const loopDur = pattern.length * stepDur();
      let tail = 0;
      for (const u of urls) tail = Math.max(tail, peekBuffer(u)?.duration || 0);
      const off = new OfflineAudioContext(2, Math.ceil((loops * loopDur + Math.min(tail, 6)) * sr), sr);
      const master = buildMaster(off);
      const nodes = new Map();
      for (const row of pattern.rows) {
        const g = off.createGain();
        g.gain.value = row.vol;
        g.connect(master);
        nodes.set(row.id, g);
      }
      const vm = new Map();
      for (let l = 0; l < loops; l++) {
        for (let s = 0; s < pattern.length; s++) scheduleStep(off, nodes, s, (l * pattern.length + s) * stepDur() + swingOffset(s), vm, false);
      }
      const rendered = await off.startRendering();
      fadeOut(rendered, Math.round(sr * (tail > 6 ? 0.3 : 0.05)));
      const blob = encodeWav(rendered);
      const a = el('a', { href: URL.createObjectURL(blob), download: `pattern-${pattern.bpm}bpm.wav` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setStatus(`WAV mit ${loops} Durchläufen exportiert.`);
    } catch (e) {
      setStatus(`Export fehlgeschlagen: ${e.message}`, true);
    } finally {
      btn.disabled = false;
    }
  }

  function closePopover() {
    if (popover) { popover.remove(); popover = null; }
  }

  function openStepEditor(row, i, anchor) {
    closePopover();
    const inst = store.byId.get(row.inst);
    if (!row.steps[i]) { row.steps[i] = { v: 0.8 }; updateStep(row, i); changed(); }
    const s = row.steps[i];
    const fields = [];
    if (inst && inst.range) {
      const [lo, hi] = noteRange(inst, row.opts);
      const notes = [];
      for (let m = hi; m >= lo; m--) notes.push({ value: String(m), label: noteName(m) + (m === row.note ? ' (Spur)' : '') });
      fields.push(el('label', { class: 'field' }, el('span', { text: 'Ton' }),
        select(notes, String(s.n ?? row.note), (v) => {
          const n = Number(v);
          if (n === row.note) delete s.n; else s.n = n;
          updateStep(row, i); changed();
        })));
    }
    fields.push(el('label', { class: 'field' }, el('span', { text: 'Dynamik' }),
      select(VELS, String(VELS.reduce((a, b) => (Math.abs(b.value - s.v) < Math.abs(a.value - s.v) ? b : a)).value), (v) => {
        s.v = Number(v); updateStep(row, i); changed();
      })));
    popover = el('div', { class: 'popover', role: 'dialog', 'aria-label': `Schritt ${i + 1} bearbeiten` },
      el('strong', { text: `Schritt ${i + 1}` }),
      ...fields,
      el('div', { class: 'row' },
        el('button', { class: 'btn small', type: 'button', text: 'Schritt löschen', onclick: () => { row.steps[i] = null; updateStep(row, i); changed(); closePopover(); anchor.focus(); } }),
        el('button', { class: 'btn small primary', type: 'button', text: 'Fertig', onclick: () => { closePopover(); anchor.focus(); } })));
    document.body.append(popover);
    const r = anchor.getBoundingClientRect();
    const pw = popover.offsetWidth, ph = popover.offsetHeight;
    popover.style.left = `${clamp(r.left + window.scrollX, 8, window.scrollX + document.documentElement.clientWidth - pw - 8)}px`;
    const below = r.bottom + 6;
    popover.style.top = `${(below + ph < window.innerHeight ? below : r.top - ph - 6) + window.scrollY}px`;
    popover.querySelector('select, button').focus();
  }

  document.addEventListener('pointerdown', (e) => { if (popover && !popover.contains(e.target)) closePopover(); }, true);
  document.addEventListener('keydown', (e) => { if (popover && e.key === 'Escape') closePopover(); });

  function stepLabel(row, s) {
    if (!s || s.n === undefined || s.n === row.note) return '';
    return noteName(s.n);
  }

  function updateStep(row, i, scope = root.querySelector(`[data-row="${row.id}"]`)) {
    const btn = scope && scope.querySelector(`[data-step="${i}"]`);
    if (!btn) return;
    const s = row.steps[i];
    btn.classList.toggle('on', !!s);
    btn.classList.toggle('accent', !!s && s.v >= 0.95);
    btn.classList.toggle('soft', !!s && s.v < 0.65);
    btn.textContent = stepLabel(row, s);
    btn.setAttribute('aria-pressed', String(!!s));
  }

  function rowView(row) {
    const inst = store.byId.get(row.inst);
    const head = el('div', { class: 'rack-head' });
    head.append(select(instrumentOptions(), row.inst, (v) => {
      const next = makeRow(v, { note: row.note });
      Object.assign(row, { inst: v, pad: next.pad, note: next.note, opts: next.opts });
      const nextInst = store.byId.get(v);
      if (nextInst && nextInst.range) fitRow(row, nextInst);
      changed({ rebuild: true });
    }, { 'aria-label': 'Instrument der Spur', class: 'grow' }));
    if (!inst || !inst.available) {
      head.append(el('span', { class: 'error small', text: 'nicht verfügbar' }));
    } else {
      if (inst.pads) {
        const scoped = (inst.options || []).some((o) => o.pads);
        head.append(select(inst.pads.map((p) => ({ value: p.id, label: p.label })), row.pad, (v) => { row.pad = v; changed({ rebuild: scoped }); }, { 'aria-label': 'Stimme' }));
      } else {
        const [lo, hi] = noteRange(inst, row.opts);
        const notes = [];
        for (let m = hi; m >= lo; m--) notes.push({ value: String(m), label: noteName(m) });
        head.append(select(notes, String(row.note), (v) => { row.note = Number(v); changed({ rebuild: true }); }, { 'aria-label': 'Grundton der Spur' }));
      }
      if (inst.usesDuration) {
        head.append(select(LENS.map((n) => ({ value: String(n), label: `${n}/16` })), String(row.len), (v) => { row.len = Number(v); changed(); },
          { 'aria-label': 'Tonlänge in Sechzehnteln', title: 'Tonlänge in Sechzehnteln' }));
      }
      for (const o of inst.options || []) {
        if (inst.pads && !optionApplies(o, row.pad)) continue;
        head.append(select(o.values.map((v) => ({ value: v.id, label: v.label })), row.opts[o.key] ?? o.values[0].id, (v) => {
          row.opts[o.key] = v;
          if (inst.ranges && o.key === 'preset') { fitRow(row, inst); changed({ rebuild: true }); } else changed();
        }, { 'aria-label': o.label, title: o.label }));
      }
    }

    const steps = el('div', { class: 'steps' });
    for (let i = 0; i < pattern.length; i++) {
      const b = el('button', {
        type: 'button', class: `step${i % 4 === 0 ? ' beat' : ''}`, dataset: { step: i },
        'aria-label': `Schritt ${i + 1}`, title: 'Klick: an oder aus. Umschalt-Klick oder Rechtsklick: Ton und Dynamik',
      });
      b.addEventListener('click', (e) => {
        if (e.shiftKey) { openStepEditor(row, i, b); return; }
        row.steps[i] = row.steps[i] ? null : { v: 0.8 };
        updateStep(row, i);
        changed();
      });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); openStepEditor(row, i, b); });
      steps.append(b);
    }

    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: row.vol, 'aria-label': 'Lautstärke der Spur', class: 'vol' });
    vol.addEventListener('input', () => { row.vol = Number(vol.value); syncRowNodes(); autosave(); });
    const toggle = (key, text, label) => {
      const b = el('button', { type: 'button', class: `btn small toggle${row[key] ? ' active' : ''}`, 'aria-pressed': String(row[key]), 'aria-label': label, title: label, text });
      b.addEventListener('click', () => { row[key] = !row[key]; changed({ rebuild: true }); });
      return b;
    };
    const mix = el('div', { class: 'rack-mix' }, vol, toggle('mute', 'M', 'Stumm'), toggle('solo', 'S', 'Solo'),
      el('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Spur löschen', title: 'Spur löschen', text: '×', onclick: () => {
        pattern.rows = pattern.rows.filter((r) => r !== row);
        changed({ rebuild: true });
      } }));

    const view = el('div', { class: `rack-row${audible(row) ? '' : ' silent'}`, dataset: { row: row.id } }, head, steps, mix);
    return view;
  }

  function exampleSelect() {
    const opts = [{ value: '', label: 'Beispiel laden …' }, ...EXAMPLES.map((x) => ({ value: x.id, label: x.label }))];
    const sel = select(opts, '', (v) => {
      const ex = EXAMPLES.find((x) => x.id === v);
      const p = ex && ex.build();
      sel.value = '';
      if (!p) return setStatus('Für dieses Beispiel fehlen Instrumente.', true);
      load(p);
      setStatus(`Beispiel ${ex.label} geladen.`);
    }, { 'aria-label': 'Beispiel laden' });
    return sel;
  }

  function render() {
    closePopover();
    root.replaceChildren();
    if (!pattern) return;
    playBtn = el('button', { class: 'btn primary', type: 'button', 'aria-pressed': 'false', onclick: () => (playing ? stop() : play()) });
    updatePlayBtn();
    const bpm = el('input', { type: 'number', min: 40, max: 220, step: 1, value: pattern.bpm, 'aria-label': 'Tempo in BPM', class: 'num' });
    bpm.addEventListener('change', () => {
      const v = clamp(Math.round(Number(bpm.value)) || 120, 40, 220);
      bpm.value = v;
      pattern.bpm = v;
      changed();
    });
    const swing = el('input', { type: 'range', min: 0, max: 100, step: 1, value: pattern.swing, 'aria-label': 'Swing' });
    const swingOut = el('output', { text: `${pattern.swing} %` });
    swing.addEventListener('input', () => { pattern.swing = Number(swing.value); swingOut.textContent = `${pattern.swing} %`; autosave(); });
    const len = select([{ value: '16', label: '16 Schritte' }, { value: '32', label: '32 Schritte' }], String(pattern.length), (v) => {
      const n = Number(v);
      if (n === 32 && pattern.length === 16) {
        for (const r of pattern.rows) if (r.steps.slice(16).every((s) => !s)) for (let i = 0; i < 16; i++) r.steps[16 + i] = r.steps[i] && { ...r.steps[i] };
      }
      pattern.length = n;
      if (nextStep >= n) nextStep = 0;
      changed({ rebuild: true });
    }, { 'aria-label': 'Musterlänge' });
    const exportBtn = el('button', { class: 'btn', type: 'button', text: 'Als WAV exportieren' });
    exportBtn.addEventListener('click', () => exportWav(exportBtn));
    progressEl = el('span', { class: 'progress', 'aria-live': 'polite' });
    statusEl = el('span', { class: 'status', 'aria-live': 'polite' });

    root.append(
      el('div', { class: 'view-head' }, el('div', {},
        el('h1', { text: 'Sequencer' }),
        el('p', { class: 'muted', text: 'Klick auf einen Schritt schaltet ihn an oder aus. Mit Umschalt-Klick oder Rechtsklick setzt du Ton und Dynamik pro Schritt. Leertaste startet und stoppt.' }))),
      el('div', { class: 'toolbar' },
        playBtn,
        el('label', { class: 'field' }, el('span', { text: 'Tempo (BPM)' }), bpm),
        el('label', { class: 'field' }, el('span', { text: 'Swing' }), swing, swingOut),
        el('label', { class: 'field' }, el('span', { text: 'Länge' }), len),
        el('div', { class: 'field' }, el('span', { text: 'Pattern' }), el('div', { class: 'row' },
          el('button', { class: 'btn small', type: 'button', text: 'Speichern', onclick: () => {
            const saved = writeStore(SLOT_KEY, pattern);
            setStatus(saved ? 'Pattern gespeichert.' : 'Speichern ging nicht, der Browser blockiert den Speicher.', !saved);
          } }),
          el('button', { class: 'btn small', type: 'button', text: 'Laden', onclick: () => {
            const p = readStore(SLOT_KEY);
            if (!p) return setStatus('Es gibt noch kein gespeichertes Pattern.', true);
            load(p); setStatus('Gespeichertes Pattern geladen.');
          } }),
          exampleSelect())),
        exportBtn,
        progressEl,
        statusEl),
    );

    const rack = el('div', { class: 'rack' });
    const ruler = el('div', { class: 'steps ruler', 'aria-hidden': 'true' });
    for (let i = 0; i < pattern.length; i++) ruler.append(el('span', { class: `tick${i % 4 === 0 ? ' beat' : ''}`, dataset: { step: i }, text: i % 4 === 0 ? String(i / 4 + 1) : '' }));
    rack.append(el('div', { class: 'rack-row ruler-row' }, el('div', { class: 'rack-head' }), ruler, el('div', { class: 'rack-mix' })));
    for (const row of pattern.rows) {
      const v = rowView(row);
      rack.append(v);
      for (let i = 0; i < pattern.length; i++) updateStep(row, i, v);
    }
    const firstOk = store.instruments.find((i) => i.available);
    rack.append(el('div', { class: 'rack-add' }, el('button', {
      class: 'btn', type: 'button', text: '+ Spur', disabled: !firstOk, onclick: () => {
        const last = pattern.rows[pattern.rows.length - 1];
        const id = last && ok(last.inst) ? last.inst : firstOk.id;
        pattern.rows.push(makeRow(id, last && last.inst === id ? { pad: last.pad, note: last.note, opts: { ...last.opts } } : {}));
        changed({ rebuild: true });
      },
    })));
    root.append(el('div', { class: 'rack-scroll' }, rack));
    if (playing && shownStep >= 0) showStep(shownStep);
  }

  function load(p) {
    pattern = p;
    for (const [, node] of rowNodes) node.disconnect();
    rowNodes.clear();
    voices.clear();
    if (nextStep >= pattern.length) nextStep = 0;
    changed({ rebuild: true });
  }

  return {
    show() {
      if (!pattern) {
        pattern = readStore(AUTO_KEY);
        if (!pattern || !pattern.rows.length) pattern = defaultPattern();
        syncRowNodes();
        prerender();
      }
      render();
    },
    hide() { closePopover(); },
    onKeyDown(e) {
      if (e.code !== 'Space' || isTyping(e.target) || e.repeat) return;
      if (e.target && ['BUTTON', 'SELECT', 'A'].includes(e.target.tagName)) return;
      e.preventDefault();
      playing ? stop() : play();
    },
    stop,
  };
}
