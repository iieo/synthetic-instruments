export const store = { instruments: [], byId: new Map() };

export async function loadInstruments() {
  const res = await fetch('/api/instruments');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  store.instruments = data.instruments;
  store.byId = new Map(data.instruments.map((i) => [i.id, i]));
  return store.instruments;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
export const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function select(options, value, onChange, attrs = {}) {
  const s = el('select', attrs);
  for (const o of options) {
    if (o.group) {
      const g = el('optgroup', { label: o.group });
      for (const x of o.items) g.append(el('option', { value: x.value, disabled: x.disabled, text: x.label }));
      s.append(g);
    } else s.append(el('option', { value: o.value, disabled: o.disabled, text: o.label }));
  }
  s.value = value;
  if (onChange) s.addEventListener('change', () => onChange(s.value));
  return s;
}

export function instrumentOptions(filter = () => true) {
  const groups = new Map();
  for (const i of store.instruments) {
    if (!filter(i)) continue;
    if (!groups.has(i.category)) groups.set(i.category, []);
    groups.get(i.category).push({ value: i.id, label: i.available ? i.name : `${i.name} (nicht verfügbar)`, disabled: !i.available });
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

export function rangeText(inst) {
  if (inst.pads) return `${inst.pads.length} ${inst.padParam === 'preset' ? 'Presets' : 'Stimmen'}`;
  if (inst.range) return `${noteName(inst.range[0])} bis ${noteName(inst.range[1])}`;
  return '';
}

// The selected preset may play a narrower range than the instrument as a whole.
export const noteRange = (inst, opts) => (inst.ranges && opts && inst.ranges[opts.preset]) || inst.range;
export const optionApplies = (o, pad) => !o.pads || o.pads.includes(pad);

export const defaultOpts = (inst) => Object.fromEntries((inst.options || []).map((o) => [o.key, o.values[0].id]));

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let layoutMap = null;
if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then((m) => { layoutMap = m; document.dispatchEvent(new Event('layoutmap')); }).catch(() => {});
}
export function keyLabel(code) {
  const v = layoutMap && layoutMap.get(code);
  if (v) return v.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  return { Semicolon: ';', Quote: '\'' }[code] || code;
}

export function progressText({ done, total, failed }) {
  if (!total) return '';
  if (done >= total) return failed ? `${failed} von ${total} Klängen fehlgeschlagen` : `${total} Klänge bereit`;
  return `Rendere Klänge ${done} von ${total}`;
}

export function isTyping(target) {
  if (!target || !target.tagName) return false;
  if (target.tagName === 'TEXTAREA' || target.isContentEditable) return true;
  return target.tagName === 'INPUT' && !['range', 'checkbox', 'button', 'radio'].includes(target.type);
}
