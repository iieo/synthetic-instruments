import { store, el, select, instrumentOptions, noteName, isBlack, debounce, keyLabel, progressText, defaultOpts, isTyping, noteRange,
  presetApplies, presetScoped, optionValues, optionValue } from './util.js';
import { soundUrl, getBuffer, peekBuffer, playBuffer, prefetch, unlockAudio } from './audio.js';

const PIANO_CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote'];
const PAD_CODES = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
const SPAN = 36;
const STORE_KEY = 'synth-ui.keyboard.v1';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x, def, lo, hi) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def);

// Each stored field is checked on its own, so one bad value doesn't reset the others.
function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY)); } catch {}
  if (!isObj(raw)) raw = {};
  const optsByInst = {};
  if (isObj(raw.optsByInst)) {
    for (const [id, o] of Object.entries(raw.optsByInst)) {
      if (!isObj(o)) continue;
      const clean = Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string'));
      if (Object.keys(clean).length) optsByInst[id] = clean;
    }
  }
  return {
    instId: typeof raw.instId === 'string' && raw.instId ? raw.instId : null,
    base: Number.isInteger(raw.base) && raw.base % 12 === 0 && raw.base >= 0 && raw.base <= 96 ? raw.base : 48,
    velocity: Math.round(num(raw.velocity, 0.8, 0.05, 1) * 20) / 20,
    duration: Math.round(num(raw.duration, 1.5, 0.1, 4) * 10) / 10,
    bpm: Math.round(num(raw.bpm, 150, 60, 200)),
    optsByInst,
  };
}
function saveSettings(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
}

export function createKeyboard(root) {
  const saved = loadSettings();
  const state = saved;
  let keyEls = new Map();
  const heldCodes = new Map();
  const pointerKeys = new Map();
  let progressEl = null;

  const inst = () => store.byId.get(state.instId);
  const opts = () => {
    const i = inst();
    const out = defaultOpts(i);
    for (const [k, v] of Object.entries(state.optsByInst[state.instId] || {})) {
      const o = (i.options || []).find((x) => x.key === k);
      if (o && o.values.some((x) => x.id === v)) out[k] = v;
    }
    return out;
  };
  const range = () => noteRange(inst(), opts());
  const persist = () => saveSettings(state);

  // The computer keys cover the lowest octave and a half, so most of them must be in range.
  const baseFits = (base, [lo, hi]) => base > lo - 12 && base <= hi - 12 && base >= 0 && base <= 96;

  // On switching instruments or presets, pick the C that puts the most computer keys in range,
  // preferring the current octave on a tie.
  let fittedFor = null;
  function fitBase(i) {
    const r = range();
    if (!r || fittedFor === `${i.id}|${r}`) return;
    fittedFor = `${i.id}|${r}`;
    const [lo, hi] = r;
    const inRange = (b) => PIANO_CODES.filter((_, k) => b + k >= lo && b + k <= hi).length;
    let best = baseFits(state.base, r) ? state.base : null;
    for (let b = 0; b <= 96; b += 12) {
      if (!baseFits(b, r)) continue;
      if (best === null || inRange(b) > inRange(best)
        || (inRange(b) === inRange(best) && Math.abs(b - state.base) < Math.abs(best - state.base))) best = b;
    }
    if (best !== null) state.base = best;
  }

  function soundFor(target) {
    const i = inst();
    return soundUrl(i, {
      midi: typeof target === 'number' ? target : undefined,
      pad: typeof target === 'string' ? target : undefined,
      velocity: state.velocity, duration: state.duration, bpm: state.bpm, opts: opts(),
    });
  }

  function trigger(target) {
    const i = inst();
    if (!i || !i.available) return;
    if (typeof target === 'number' && (target < range()[0] || target > range()[1])) return;
    unlockAudio();
    const url = soundFor(target);
    const buf = peekBuffer(url);
    if (buf) { playBuffer(buf); return; }
    const k = keyEls.get(target);
    if (k) k.classList.add('loading');
    getBuffer(url, true).then((b) => playBuffer(b)).catch((e) => setProgress(`Fehler: ${e.message}`))
      .finally(() => k && k.classList.remove('loading'));
  }

  function press(target) {
    const k = keyEls.get(target);
    if (k) k.classList.add('down');
    trigger(target);
  }
  function release(target) {
    const k = keyEls.get(target);
    if (k) k.classList.remove('down');
  }

  function setProgress(text) { if (progressEl) progressEl.textContent = text; }

  const prerender = debounce(() => {
    const i = inst();
    if (!i || !i.available) return;
    const [lo, hi] = i.pads ? [] : range();
    const targets = i.pads ? i.pads.map((p) => p.id) : visibleNotes().filter((m) => m >= lo && m <= hi);
    prefetch(targets.map(soundFor), (p) => setProgress(progressText(p)));
  }, 200);

  function visibleNotes() {
    return Array.from({ length: SPAN + 1 }, (_, k) => state.base + k);
  }

  function keyCodeFor(target) {
    const i = inst();
    if (i.pads) {
      const idx = i.pads.findIndex((p) => p.id === target);
      return PAD_CODES[idx];
    }
    return PIANO_CODES[target - state.base];
  }

  function buildPiano(i) {
    const notes = visibleNotes();
    const [lo, hi] = range();
    const whites = notes.filter((m) => !isBlack(m));
    const w = 100 / whites.length;
    const piano = el('div', { class: 'piano-keys' });
    for (const m of notes) {
      const inRange = m >= lo && m <= hi;
      const code = keyCodeFor(m);
      const key = el('button', {
        type: 'button', tabindex: '-1',
        class: `key ${isBlack(m) ? 'black' : 'white'}${inRange ? '' : ' out'}`,
        'aria-label': noteName(m), disabled: !inRange,
        dataset: { midi: m },
      },
      m % 12 === 0 ? el('span', { class: 'note', text: noteName(m) }) : null,
      code ? el('span', { class: 'hint', text: keyLabel(code) }) : null);
      if (isBlack(m)) {
        const before = whites.filter((x) => x < m).length;
        key.style.left = `${before * w - w * 0.3}%`;
        key.style.width = `${w * 0.6}%`;
      } else key.style.width = `${w}%`;
      keyEls.set(m, key);
      piano.append(key);
    }
    attachPointer(piano, (k) => Number(k.dataset.midi));
    return el('div', { class: 'piano', role: 'group', 'aria-label': 'Klaviatur' }, piano);
  }

  function buildPads(i) {
    const grid = el('div', { class: 'pads', role: 'group', 'aria-label': 'Pads' });
    i.pads.forEach((p, idx) => {
      const code = PAD_CODES[idx];
      const pad = el('button', { type: 'button', class: 'pad', dataset: { pad: p.id } },
        el('span', { class: 'pad-name', text: p.label }),
        code ? el('span', { class: 'hint', text: keyLabel(code) }) : null);
      keyEls.set(p.id, pad);
      grid.append(pad);
    });
    attachPointer(grid, (k) => k.dataset.pad);
    return grid;
  }

  function attachPointer(container, targetOf) {
    const keyAt = (e) => e.target.closest && e.target.closest('button:not([disabled])');
    container.addEventListener('pointerdown', (e) => {
      const k = keyAt(e);
      if (!k || e.button > 0) return;
      e.preventDefault();
      if (k.hasPointerCapture && k.hasPointerCapture(e.pointerId)) k.releasePointerCapture(e.pointerId);
      const t = targetOf(k);
      pointerKeys.set(e.pointerId, t);
      press(t);
    });
    container.addEventListener('pointerover', (e) => {
      if (!pointerKeys.has(e.pointerId)) return;
      const k = keyAt(e);
      if (!k) return;
      const t = targetOf(k);
      if (t === pointerKeys.get(e.pointerId)) return;
      release(pointerKeys.get(e.pointerId));
      pointerKeys.set(e.pointerId, t);
      press(t);
    });
    container.addEventListener('click', (e) => {
      const k = keyAt(e);
      if (k && e.detail === 0) trigger(targetOf(k));
    });
    container.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function slider(label, min, max, step, value, fmt, onInput) {
    const out = el('output', { text: fmt(value) });
    const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
    input.addEventListener('input', () => { out.textContent = fmt(Number(input.value)); onInput(Number(input.value)); });
    return el('label', { class: 'field' }, el('span', { text: label }), input, out);
  }

  function render() {
    root.replaceChildren();
    keyEls = new Map();
    const available = store.instruments.filter((i) => i.available);
    if (!available.length) {
      root.append(el('p', { class: 'error', text: 'Kein Instrument verfügbar. Läuft der Server?' }));
      return;
    }
    if (!inst() || !inst().available) state.instId = (store.byId.get('piano')?.available ? 'piano' : available[0].id);
    const i = inst();
    fitBase(i);

    const controls = el('div', { class: 'toolbar' });
    controls.append(el('label', { class: 'field' }, el('span', { text: 'Instrument' }),
      select(instrumentOptions(), i.id, (v) => { state.instId = v; persist(); render(); }, { 'aria-label': 'Instrument' })));

    if (!i.pads) {
      const octLabel = el('span', { class: 'oct', text: `${noteName(state.base)} bis ${noteName(state.base + SPAN)}` });
      controls.append(el('div', { class: 'field' }, el('span', { text: 'Oktave' }),
        el('div', { class: 'row' },
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Oktave tiefer', text: '−', onclick: () => shiftOctave(-1) }),
          octLabel,
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Oktave höher', text: '+', onclick: () => shiftOctave(1) }))));
    }
    controls.append(slider('Dynamik', 0.05, 1, 0.05, state.velocity, (v) => `${Math.round(v * 100)} %`, (v) => { state.velocity = v; persist(); prerender(); }));
    if (i.usesDuration) {
      controls.append(slider('Tonlänge', 0.1, 4, 0.1, state.duration, (v) => `${v.toFixed(1)} s`, (v) => { state.duration = v; persist(); prerender(); }));
    }
    // With a note length, that length wins over the tempo (hardstyle-kick), so only show it without.
    if (i.usesBpm && !i.usesDuration) {
      controls.append(slider('Tempo', 60, 200, 1, state.bpm, (v) => `${v} BPM`, (v) => { state.bpm = v; persist(); prerender(); }));
    }
    const current = opts();
    for (const o of i.options || []) {
      if (!presetApplies(o, current)) continue;
      controls.append(el('label', { class: 'field' }, el('span', { text: o.label }),
        select(optionValues(o, current).map((v) => ({ value: v.id, label: v.label })), optionValue(o, current), (v) => {
          const before = String(range());
          state.optsByInst[i.id] = { ...(state.optsByInst[i.id] || {}), [o.key]: v };
          persist();
          if (String(range()) !== before || (o.key === 'preset' && presetScoped(i))) render(); else prerender();
        })));
    }
    progressEl = el('span', { class: 'progress', 'aria-live': 'polite' });
    controls.append(progressEl);

    const help = i.pads
      ? 'Klick oder tippe auf die Pads, oder nutze die Tasten auf deiner Tastatur.'
      : `Spiel mit Maus, Touch oder Tastatur (${keyLabel('KeyA')} ${keyLabel('KeyW')} ${keyLabel('KeyS')} ${keyLabel('KeyE')} ${keyLabel('KeyD')} …). ${keyLabel('KeyZ')} und ${keyLabel('KeyX')} oder die Pfeiltasten wechseln die Oktave. ${i.usesDuration ? 'Ein Ton klingt so lange, wie die Tonlänge sagt.' : 'Wie lange ein Ton klingt, bestimmt das Instrument selbst.'}`;

    root.append(
      el('div', { class: 'view-head' }, el('div', {}, el('h1', { text: i.name }), el('p', { class: 'muted', text: help }))),
      controls,
      i.pads ? buildPads(i) : buildPiano(i),
    );
    prerender();
  }

  function shiftOctave(d) {
    const i = inst();
    if (!i || i.pads) return;
    const next = state.base + 12 * d;
    if (!baseFits(next, range())) return;
    state.base = next;
    persist();
    render();
  }

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    // A focused select uses letters for type-ahead and arrows for its own value.
    if (e.target && e.target.tagName === 'SELECT') return;
    const i = inst();
    if (!i || !i.available) return;
    const onRange = e.target && e.target.type === 'range';
    if (!i.pads && (e.code === 'KeyZ' || (e.code === 'ArrowLeft' && !onRange))) { e.preventDefault(); if (!e.repeat) shiftOctave(-1); return; }
    if (!i.pads && (e.code === 'KeyX' || (e.code === 'ArrowRight' && !onRange))) { e.preventDefault(); if (!e.repeat) shiftOctave(1); return; }
    let target;
    if (i.pads) {
      const idx = PAD_CODES.indexOf(e.code);
      if (idx < 0 || idx >= i.pads.length) return;
      target = i.pads[idx].id;
    } else {
      const idx = PIANO_CODES.indexOf(e.code);
      if (idx < 0) return;
      target = state.base + idx;
    }
    e.preventDefault();
    if (e.repeat || heldCodes.has(e.code)) return;
    heldCodes.set(e.code, target);
    press(target);
  }

  function onKeyUp(e) {
    if (!heldCodes.has(e.code)) return;
    release(heldCodes.get(e.code));
    heldCodes.delete(e.code);
  }

  function releaseAll() {
    for (const t of heldCodes.values()) release(t);
    heldCodes.clear();
  }

  const endPointer = (e) => {
    if (!pointerKeys.has(e.pointerId)) return;
    release(pointerKeys.get(e.pointerId));
    pointerKeys.delete(e.pointerId);
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  document.addEventListener('layoutmap', () => { if (root.isConnected && !root.hidden) render(); });

  return {
    show(instId) {
      if (instId && store.byId.get(instId)?.available) { state.instId = instId; persist(); }
      render();
    },
    hide: releaseAll,
    onKeyDown, onKeyUp, releaseAll,
  };
}
