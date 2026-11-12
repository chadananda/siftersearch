// A selection MADE FROM one work (Chad 11-12: "extract out just the prayers and give me a table of links to each" after the
// Tablets of the Divine Plan card got a phrase search for his sentence). The whole work is read in chunks; one cheap call per
// chunk (Haiku, parallel) names the pieces that fit the request (from/to paragraph, a label); code renders the table or the texts.
// Deps: paragraphs-repo (paragraphTexts), sections-repo, hit-links (withLinks), ai.js. No writer.
import { modelFor } from '../model-roles.js';

const CHUNK = 160, CLIP = 320, MAX_PARAS = 3200;
const clean = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const words = (t, n) => { const w = clean(t).split(' '); return w.length > n ? `${w.slice(0, n).join(' ')}…` : w.join(' '); };

export const EXTRACT_PROMPT = (request, title, lines) => `A reader asked, about the work "${title}": ${request}

Below is one part of that work, one paragraph per line as [index] text (long paragraphs clipped). Pick every piece of THIS part that the request asks for. A piece may span several paragraphs (a prayer, a letter, a tablet): give its first and last index. Only pieces that truly fit; none is a fine answer.
Reply with JSON only: {"kind": "<plural noun for what was asked, e.g. prayers>", "show": "table" | "texts", "items": [{"from": <index>, "to": <index>, "label": "<short name: its heading or a few opening words>"}]}
"show" is texts only when the reader wants the passages themselves written out; a list, table or links is table.

${lines}`;

/** One chunk → { kind, show, items } (bad JSON → no items). */
export async function pickChunk(request, title, rows, { complete = null } = {}) {
  const lines = rows.map((r) => `[${r.paragraph_index}] ${r.heading && r.heading !== title ? `(${clean(r.heading)}) ` : ''}${clean(r.text).slice(0, CLIP)}`).join('\n');
  const call = complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...modelFor('anis-work-extract'), temperature: 0, maxTokens: 1500, thinking: false, caller: 'anis-work-extract' }));
  const out = await call([{ role: 'user', content: EXTRACT_PROMPT(request, title, lines) }]);
  const text = String(out?.content ?? out?.text ?? out ?? '');
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const have = new Set(rows.map((r) => r.paragraph_index));
    const items = (Array.isArray(j.items) ? j.items : []).map((x) => ({ from: Number(x.from), to: Number(x.to ?? x.from), label: clean(x.label) }))
      .filter((x) => have.has(x.from)).map((x) => ({ ...x, to: x.to >= x.from ? x.to : x.from }));
    return { kind: clean(j.kind) || null, show: j.show === 'texts' ? 'texts' : 'table', items };
  } catch { return { kind: null, show: 'table', items: [] }; }
}

/** The section a paragraph sits in (the deepest whose range holds it). Pure. */
export const sectionAt = (secs, i) => secs.filter((s) => s.start_index <= i && (s.end_index ?? Infinity) >= i).sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0]?.title ?? null;

/** The code-built reply. Pure. pieces: [{ label, section, url, rows }] */
export function extractReply({ title, kind, show, pieces }) {
  const what = kind || 'passages', one = what.replace(/s$/, ''), head = `**${pieces.length} ${pieces.length === 1 ? one : what}** in *${title}*:`;
  if (show === 'texts') return [head, ...pieces.map((p, n) => {
    const body = p.rows.map((r) => `> ${clean(r.text)}`).join('\n>\n'), cite = p.section ? `*${title}*, ${p.section}` : `*${title}*`;
    return `**${n + 1}. ${p.label}**\n\n${body}\n>\n> — ${p.url ? `[${cite}](${p.url})` : cite}`;
  })].join('\n\n');
  const hasSec = pieces.some((p) => p.section), cell = (s) => String(s || '').replace(/\|/g, '/');
  const rows = pieces.map((p, n) => `| ${n + 1} | ${hasSec ? `${cell(p.section)} | ` : ''}${p.url ? `[${cell(p.label)}](${p.url})` : cell(p.label)} | ${cell(words(p.rows[0]?.text, 12))} |`);
  return [head, '', `| # | ${hasSec ? 'Where | ' : ''}${one[0].toUpperCase() + one.slice(1)} | Opens |`, `|---|${hasSec ? '---|' : ''}---|---|`, ...rows].join('\n');
}

/**
 * The turn path (Jev's lookup = from_work): doc (the work in focus or the one resolved) → its paragraphs (a section's range when
 * one was given) → the picks → { result, reply, work }, the shape inWorkAnswer reads. null when the work is too large or nothing fits.
 */
export async function extractFromWork({ messages, doc, section = null, decisions = null, deps = {} }) {
  const request = [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
  if (!doc?.id || !request) return null;
  const texts = deps.paragraphTexts || (await import('../paragraphs-repo.js')).paragraphTexts;
  const range = section ? { from: section.start_index, to: section.end_index ?? section.start_index } : {};
  const rows = (await texts(Number(doc.id), { ...range, limit: MAX_PARAS + 1 })).filter((r) => clean(r.text));
  if (!rows.length || rows.length > MAX_PARAS) { decisions?.record?.('from-work:size', { by: 'code', saw: { work: doc.id, paragraphs: rows.length }, chosen: 'research', reason: rows.length ? 'too large to read whole' : 'no text' }); return null; }
  const chunks = []; for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
  const picks = await Promise.all(chunks.map((c) => pickChunk(request, doc.title, c, { complete: deps.complete }).catch(() => ({ items: [] }))));
  const byIdx = new Map(rows.map((r) => [r.paragraph_index, r]));
  const items = picks.flatMap((p) => p.items).sort((a, b) => a.from - b.from).filter((x, i, a) => !i || x.from > a[i - 1].to);
  const kind = picks.find((p) => p.kind)?.kind ?? null, show = picks.find((p) => p.items?.length)?.show ?? 'table';
  decisions?.record?.('from-work:pick', { by: 'haiku', saw: { work: doc.id, paragraphs: rows.length, chunks: chunks.length }, chosen: { kind, show, items: items.length } });
  if (!items.length) return null;
  const secs = await (deps.sectionsOf || (async (id) => (await import('../repos/sections-repo.js')).sectionsOfDoc(id)))(Number(doc.id)).catch(() => []);
  const firsts = items.map((x) => ({ ...byIdx.get(x.from), doc_id: Number(doc.id), title: doc.title, author: doc.author ?? null }));
  const link = deps.withLinks || (async (h) => (await import('../hit-links.js')).withLinks(h));
  const linked = await link(firsts).catch(() => firsts);
  const pieces = items.map((x, n) => ({ label: x.label || words(byIdx.get(x.from)?.text, 6), section: sectionAt(secs, x.from) ?? (clean(byIdx.get(x.from)?.heading) || null),
    url: linked[n]?.url ?? null, rows: rows.filter((r) => r.paragraph_index >= x.from && r.paragraph_index <= x.to) }));
  const passages = pieces.map((p, n) => ({ id: firsts[n].id, title: doc.title, author: doc.author ?? null, document_id: Number(doc.id), paragraph_index: items[n].from, place: p.section, url: p.url, text: p.rows.map((r) => clean(r.text)).join(' ') }));
  return { result: { query: kind || 'selection', mode: 'extract', total: pieces.length, passages }, reply: extractReply({ title: doc.title, kind, show, pieces }), work: doc, section };
}
