const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) =>
    /^https?:\/\//.test(href) ? `<a href="${href}" target="_blank" rel="noopener">${t}</a>` : t);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

const ITEM_RE = /^(\s*)([-*+]|(\d+)\.)\s+(.*)$/;
const indentOf = (l) => /^\s*/.exec(l)[0].length;

function listHtml(ordered, start, items) {
  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
  return `<${tag}${startAttr}>${items.map((it) => `<li>${it.map((part) => (typeof part === 'string' ? inline(part) : part.html)).join('')}</li>`).join('')}</${tag}>`;
}

// One level of nesting. An indented line is a nested item if it starts with a bullet, or with
// "1." (or any number once a nested numbered list runs); anything else continues the text, so a
// wrapped line that happens to begin with "5." stays part of its item.
function parseList(lines, i) {
  const first = ITEM_RE.exec(lines[i]);
  const base = first[1].length;
  const ordered = !!first[3];
  const start = ordered ? Number(first[3]) : 1;
  const items = [];
  let item = null, nested = null;
  const closeNested = () => {
    if (nested) { item.push({ html: listHtml(nested.ordered, nested.start, nested.items) }, ''); nested = null; }
  };
  const addText = (arr, text) => { arr[arr.length - 1] = arr[arr.length - 1] ? `${arr[arr.length - 1]} ${text}` : text; };
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) break;
    const m = ITEM_RE.exec(l);
    const ind = indentOf(l);
    if (m && ind <= base + 1) {
      if (!!m[3] !== ordered) break;
      if (item) closeNested();
      item = [m[4]];
      items.push(item);
    } else if (!item || ind <= base) {
      break;
    } else if (m && (!m[3] || m[3] === '1' || (nested && nested.ordered)) && (!nested || nested.ordered === !!m[3])) {
      if (!nested) nested = { ordered: !!m[3], start: m[3] ? Number(m[3]) : 1, items: [], indent: ind + m[0].length - m[1].length - m[4].length };
      nested.items.push([m[4]]);
    } else if (nested && ind >= nested.indent) {
      addText(nested.items[nested.items.length - 1], l.trim());
    } else {
      closeNested();
      addText(item, l.trim());
    }
    i++;
  }
  if (item) closeNested();
  return { next: i, html: listHtml(ordered, start, items) };
}

export function markdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }
    if (t.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const level = Math.min(6, h[1].length + 1);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(t)) { out.push('<hr>'); i++; continue; }
    if (t.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      const hasHead = rows.length > 1 && /^\|?[\s:|-]+\|?$/.test(rows[1].trim());
      const head = hasHead ? `<thead><tr>${cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
      const body = (hasHead ? rows.slice(2) : rows).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`);
      continue;
    }
    if (ITEM_RE.test(line)) {
      const r = parseList(lines, i);
      i = r.next;
      out.push(r.html);
      continue;
    }
    if (t.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    const buf = [t];
    i++;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l || l.startsWith('```') || l.startsWith('#') || l.startsWith('|') || l.startsWith('>') || /^([-*+]|\d+\.)\s/.test(l)) break;
      buf.push(l);
      i++;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}
