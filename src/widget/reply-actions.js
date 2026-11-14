// Anís reply actions (copy / cite / share / feedback / retry / edit): pure helpers, no DOM. Reply markdown → clean clipboard
// HTML + plain markdown, the reply's linked sources as a reference list, the question a reply answers, its round number.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MARKER = /^\s*<!--\s*widget:[\w-]+\s*-->\s*$/;

/** The reply as plain markdown for the clipboard: widget markers and unexpanded {{templates}} dropped (their fallback text
 *  stays), citation links kept as [text](url), blank runs collapsed. */
export function plainReply(md) {
  return String(md || '').split('\n').filter((l) => !MARKER.test(l)).join('\n')
    .replace(/\{\{[^}]*\}\}/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

// inline markdown → html: escape everything, then rebuild https links, **bold**, *italics* / _italics_
function inline(s) {
  const links = [];
  let t = String(s).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, txt, url) => { links.push([txt, url]); return `\u0000${links.length - 1}\u0000`; });
  t = esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => { const [txt, url] = links[+i]; return `<a href="${esc(url)}">${inline(txt)}</a>`; });
}
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isRule = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

/** The reply as clean, self-contained HTML (no classes, no styles) that pastes well into mail and documents:
 *  paragraphs, headings, blockquotes, bullet + numbered lists, pipe tables, bold/italics/links. */
export function replyHtml(md) {
  const lines = plainReply(md).split('\n'), out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { flush(); continue; }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); const n = Math.min(4, h[1].length + 1); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    if (/^\s*>/.test(l)) {
      flush(); const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      i--; out.push(`<blockquote>${replyHtml(q.join('\n'))}</blockquote>`); continue;
    }
    const li = (re) => { flush(); const items = []; while (i < lines.length && re.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(re, ''))}</li>`); i--; return items.join(''); };
    if (/^\s*[-*•]\s+/.test(l)) { out.push(`<ul>${li(/^\s*[-*•]\s+/)}</ul>`); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { out.push(`<ol>${li(/^\s*\d+[.)]\s+/)}</ol>`); continue; }
    if (l.includes('|') && isRule(lines[i + 1] || '')) {
      flush(); const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      i--;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    para.push(l);
  }
  flush();
  return out.join('\n');
}

const base = (u) => String(u || '').split('#')[0].split('?')[0].replace(/\/$/, '');
const clean = (s) => String(s || '').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();

/** The sources a reply links: its inline [text](https://…) links first (in reading order), then citations, passage cards,
 *  talks and books the turn carried. One entry per page (fragment/query ignored): [{ title, url, author? }]. */
export function replySources(m) {
  const seen = new Set(), out = [];
  const add = (title, url, author) => {
    if (!/^https?:\/\//.test(url || '')) return;
    const k = base(url);
    if (seen.has(k)) return;
    seen.add(k); out.push({ title: clean(title) || url, url, ...(clean(author) ? { author: clean(author) } : {}) });
  };
  for (const [, t, u] of String(m?.content || '').matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) add(t, u);
  for (const c of m?.citations || []) add(c?.title, c?.url, c?.author);
  for (const p of m?.passages || []) add(p?.title, p?.url, p?.author);
  for (const t of m?.talks || []) add(t?.title, t?.url, t?.speaker);
  for (const b of [m?.book, ...(m?.books || [])]) if (b) add(b.title, b.url, b.author);
  return out;
}

/** A plain numbered reference list: "1. Author, Title — url". Empty string when the reply links nothing. */
export const referenceList = (sources) => (sources || []).map((s, i) => `${i + 1}. ${s.author && !s.title.includes(s.author) ? `${s.author}, ` : ''}${s.title} — ${s.url}`).join('\n');

/** Index of the question an assistant reply at `i` answers (the nearest user message before it), or -1. */
export function questionIndex(messages, i) {
  for (let j = Math.min(i, (messages || []).length) - 1; j >= 0; j--) if (messages[j]?.role === 'user') return j;
  return -1;
}

/** The round of the reply at `i`: how many questions were asked up to it (1-based; 0 = the greeting). */
export const roundOf = (messages, i) => (messages || []).slice(0, i + 1).filter((m) => m?.role === 'user').length;

/** The single question + answer at reply `i`, for sharing one answer: [{role, content}, {role, content}] or null. */
export function answerTurns(messages, i) {
  const q = questionIndex(messages, i), a = messages?.[i];
  if (q < 0 || a?.role !== 'assistant' || !a.content) return null;
  return [{ role: 'user', content: messages[q].content }, { role: 'assistant', content: plainReply(a.content) }];
}

/** Re-ask from user message `i` (Edit) or the question behind reply `i` (Retry): the messages kept before it + the text to send.
 *  null when there is nothing to re-ask. */
export function rewind(messages, i, text) {
  const q = messages?.[i]?.role === 'user' ? i : questionIndex(messages, i);
  if (q < 0) return null;
  const ask = String(text ?? messages[q].content).trim();
  return ask ? { keep: messages.slice(0, q), ask } : null;
}

/** The whole conversation to share: every question and finished answer from the first question on (answers as clean markdown). */
export function shareTurns(messages) {
  const ms = (messages || []).filter((m) => (m?.role === 'user' || m?.role === 'assistant') && m.content && !m.pending && !m.error);
  const first = ms.findIndex((m) => m.role === 'user');
  if (first < 0) return null;
  const turns = ms.slice(first).map((m) => ({ role: m.role, content: m.role === 'assistant' ? plainReply(m.content) : m.content })).filter((t) => t.content);
  return turns.some((t) => t.role === 'assistant') ? turns : null;
}

/** A published discussion (GET /api/chat/share/<slug>) → the messages of a new thread that continues it. */
export const fromShared = (d) => (Array.isArray(d?.turns) ? d.turns : [])
  .filter((t) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string' && t.content)
  .map((t) => ({ role: t.role, content: t.content, done: true, ...(t.role === 'assistant' ? { shared: d.slug } : {}) }));
