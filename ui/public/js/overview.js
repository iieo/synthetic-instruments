import { store, el, rangeText, loadInstruments } from './util.js';
import { markdown, inline } from './markdown.js';

const audio = new Audio();
audio.preload = 'none';
let playingBtn = null;
const docCache = new Map();

function stopDemo() {
  audio.pause();
  if (playingBtn) { playingBtn.textContent = 'Demo anhören'; playingBtn.setAttribute('aria-pressed', 'false'); }
  playingBtn = null;
}
audio.addEventListener('ended', stopDemo);

function demoButton(inst) {
  const btn = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', text: 'Demo anhören' });
  btn.addEventListener('click', () => {
    if (playingBtn === btn) return stopDemo();
    stopDemo();
    audio.src = `/demos/${encodeURIComponent(inst.demo)}?t=${Date.now()}`;
    audio.play().then(() => {
      playingBtn = btn;
      btn.textContent = 'Stopp';
      btn.setAttribute('aria-pressed', 'true');
    }).catch((e) => { btn.textContent = 'Demo lässt sich nicht abspielen'; console.error(e); });
  });
  return btn;
}

function renderDemoButton(inst, onDone) {
  const btn = el('button', { class: 'btn', type: 'button', text: 'Demo rendern' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Demo wird gerendert …';
    try {
      const res = await fetch(`/api/demo/${encodeURIComponent(inst.id)}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await onDone();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Demo rendern';
      btn.title = e.message;
      btn.after(el('p', { class: 'error', text: `Hat nicht geklappt: ${e.message}` }));
    }
  });
  return btn;
}

function docToggle(inst, card) {
  const box = el('div', { class: 'doc', hidden: true });
  const btn = el('button', { class: 'btn ghost', type: 'button', 'aria-expanded': 'false', text: 'Dokumentation anzeigen' });
  btn.addEventListener('click', async () => {
    const open = box.hidden;
    box.hidden = !open;
    card.classList.toggle('wide', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Dokumentation ausblenden' : 'Dokumentation anzeigen';
    if (open && !box.dataset.loaded) {
      box.textContent = 'Lade …';
      try {
        if (!docCache.has(inst.doc)) {
          docCache.set(inst.doc, fetch(`/api/doc/${encodeURIComponent(inst.doc)}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          }));
        }
        box.innerHTML = markdown(await docCache.get(inst.doc));
        box.dataset.loaded = '1';
      } catch (e) {
        docCache.delete(inst.doc);
        box.textContent = `Dokumentation konnte nicht geladen werden: ${e.message}`;
      }
      if (open) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
  return [btn, box];
}

export function renderOverview(root, { onPlay }) {
  stopDemo();
  root.replaceChildren();
  const refresh = async () => { await loadInstruments(); renderOverview(root, { onPlay }); };
  const head = el('div', { class: 'view-head' },
    el('div', {},
      el('h1', { text: 'Instrumente' }),
      el('p', { class: 'muted', text: `${store.instruments.filter((i) => i.available).length} Instrumente, jeder Ton wird beim Spielen neu aus Physik berechnet. Keine Samples.` })),
    el('button', { class: 'btn ghost', type: 'button', text: 'Liste aktualisieren', onclick: () => refresh().catch(() => {}) }));
  root.append(head);

  const byCat = new Map();
  for (const inst of store.instruments) {
    if (!byCat.has(inst.category)) byCat.set(inst.category, []);
    byCat.get(inst.category).push(inst);
  }
  for (const [cat, list] of byCat) {
    const grid = el('div', { class: 'cards' });
    root.append(el('section', { class: 'cat' }, el('h2', { text: cat }), grid));
    for (const inst of list) {
      const card = el('article', { class: `card${inst.available ? '' : ' off'}` });
      const desc = el('p', { class: 'desc' });
      if (inst.description) desc.innerHTML = inline(inst.description);
      else desc.textContent = inst.available ? 'Noch keine Beschreibung vorhanden.' : '';
      const actions = el('div', { class: 'actions' });
      if (inst.available) {
        actions.append(el('button', { class: 'btn primary', type: 'button', text: 'Spielen', onclick: () => onPlay(inst.id) }));
      }
      if (inst.demo) actions.append(demoButton(inst));
      else if (inst.demoScript && inst.available) actions.append(renderDemoButton(inst, refresh));
      const docParts = inst.doc ? docToggle(inst, card) : [];
      if (docParts.length) actions.append(docParts[0]);
      card.append(
        el('header', {},
          el('h3', { text: inst.name }),
          el('span', { class: 'tag', text: inst.category })),
        el('p', { class: 'meta', text: inst.available ? rangeText(inst) : 'Nicht verfügbar' }),
        inst.available ? desc : el('p', { class: 'error', text: `Lässt sich gerade nicht laden: ${inst.error || 'unbekannter Fehler'}` }),
        actions,
        docParts[1] || null,
      );
      grid.append(card);
    }
  }
}

export function leaveOverview() { stopDemo(); }
