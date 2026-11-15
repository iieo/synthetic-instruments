import { loadInstruments, el } from './util.js';
import { renderOverview, leaveOverview } from './overview.js';
import { createKeyboard } from './keyboard.js';
import { createSequencer } from './sequencer.js';
import { unlockAudio } from './audio.js';

const views = {
  instrumente: document.getElementById('view-instrumente'),
  keyboard: document.getElementById('view-keyboard'),
  sequencer: document.getElementById('view-sequencer'),
};
const tabs = [...document.querySelectorAll('[data-tab]')];
const keyboard = createKeyboard(views.keyboard);
const sequencer = createSequencer(views.sequencer);
let current = null;

function parseHash() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: views[name] ? name : 'instrumente', arg: arg ? decodeURIComponent(arg) : null };
}

function show() {
  const { name, arg } = parseHash();
  if (current === 'keyboard' && name !== 'keyboard') keyboard.hide();
  if (current === 'instrumente' && name !== 'instrumente') leaveOverview();
  if (current === 'sequencer' && name !== 'sequencer') sequencer.hide();
  for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-current', on ? 'page' : 'false');
  }
  current = name;
  if (name === 'instrumente') renderOverview(views.instrumente, { onPlay: (id) => { location.hash = `#keyboard/${encodeURIComponent(id)}`; } });
  if (name === 'keyboard') keyboard.show(arg);
  if (name === 'sequencer') sequencer.show();
}

document.addEventListener('keydown', (e) => {
  if (current === 'keyboard') keyboard.onKeyDown(e);
  else if (current === 'sequencer') sequencer.onKeyDown(e);
});
document.addEventListener('keyup', (e) => { if (current === 'keyboard') keyboard.onKeyUp(e); });
window.addEventListener('blur', () => keyboard.releaseAll());
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });

async function start() {
  const status = document.getElementById('status');
  try {
    await loadInstruments();
    status.remove();
  } catch (e) {
    status.replaceChildren(el('p', { class: 'error', text: `Die Instrumentenliste lässt sich nicht laden (${e.message}). Läuft node ui/server.mjs?` }),
      el('button', { class: 'btn', type: 'button', text: 'Erneut versuchen', onclick: () => location.reload() }));
    return;
  }
  window.addEventListener('hashchange', show);
  show();
}

start();
