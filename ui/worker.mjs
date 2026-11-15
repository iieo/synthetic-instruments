import { parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

const plain = (x) => {
  try { return JSON.parse(JSON.stringify(x ?? null)); } catch { return null; }
};

// The parameter list tells us whether render() cares about pitch and note length.
function paramText(fn) {
  const src = Function.prototype.toString.call(fn);
  const open = src.indexOf('(');
  if (open < 0) return src.slice(0, 400);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open, open + 400);
}

function toChannels(out) {
  const isNum = (a) => ArrayBuffer.isView(a) || (Array.isArray(a) && typeof a[0] === 'number');
  let chans;
  if (isNum(out)) chans = [out];
  else if (Array.isArray(out) && out.length && out.every(isNum)) chans = out.slice(0, 2);
  else if (out && isNum(out.left) && isNum(out.right)) chans = [out.left, out.right];
  else throw new Error('render() hat kein Audio zurückgegeben');
  const len = Math.min(...chans.map((c) => c.length));
  return chans.map((c) => {
    const f = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const v = c[i];
      if (!Number.isFinite(v)) throw new Error(`ungültiger Samplewert bei ${i}`);
      f[i] = v;
    }
    return f;
  });
}

parentPort.on('message', async (task) => {
  try {
    const mod = await import(pathToFileURL(task.file).href);
    if (typeof mod.render !== 'function') throw new Error('kein render() exportiert');
    if (task.type === 'meta') {
      const params = paramText(mod.render);
      parentPort.postMessage({
        meta: plain(mod.meta) || {},
        usesMidi: /\bmidi\b/.test(params),
        usesDuration: /\bduration\b/.test(params),
        usesBpm: /\bbpm\b/.test(params),
      });
      return;
    }
    const out = await mod.render(task.args);
    const channels = toChannels(out);
    parentPort.postMessage({ channels }, channels.map((c) => c.buffer));
  } catch (e) {
    parentPort.postMessage({ error: String(e && e.message ? e.message : e) });
  }
});
