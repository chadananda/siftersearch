// Side-by-side sentence rows per paragraph: 'markers' (our own segments regrouped by the original's ⁅sN⁆ spans, free) →
// 'llm' (Haiku inserts line breaks only; code verifies text unchanged + equal counts; cached by text hash) → 'paragraph' → 'none'.
// Pure except the injected deps { cacheGet, cachePut, llm }. Deps: markers.js
import { createHash } from 'node:crypto';
import { parseMarkers, stripMarkers, hasMarkers } from '../markers.js';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export const alignKey = (o, e) => createHash('sha1').update(`${o}\u0000${e}`).digest('hex');
export const MAX_UNCACHED = 40, PARALLEL = 4, MIN_LLM_CHARS = 60;

/** content.translation (JSON {reading, study, segments} or plain) + legacy translation_segments → { reading, segments[] }. */
export function ownTranslation(p) {
  let reading = null, segments = null;
  if (p.translation) {
    try { const j = JSON.parse(p.translation); if (j && typeof j === 'object') { reading = j.reading || null; segments = j.segments || null; } else reading = String(p.translation); }
    catch { reading = p.translation; }
  }
  if (!segments && p.translation_segments) { try { const j = typeof p.translation_segments === 'string' ? JSON.parse(p.translation_segments) : p.translation_segments; if (Array.isArray(j)) segments = j; } catch { /* none */ } }
  return { reading, segments: Array.isArray(segments) ? segments.filter((s) => s && s.original && s.translation) : [] };
}

/** Group phrase segments into the original's sentences (⁅sN⁆ spans, in order). → rows or null on any mismatch/leftover. */
export function alignByMarkers(marked, segments) {
  if (!hasMarkers(marked) || !segments?.length) return null;
  const sents = parseMarkers(marked).filter((s) => s.type === 's').sort((a, b) => a.start - b.start);
  if (!sents.length || norm(sents.map((s) => s.text).join(' ')) !== norm(stripMarkers(marked))) return null;
  const rows = []; let i = 0;
  for (const s of sents) {
    const want = norm(s.text); let have = '', t = [];
    while (have.length < want.length && i < segments.length) {
      const seg = norm(stripMarkers(segments[i].original)); const next = norm(`${have} ${seg}`);
      if (!want.startsWith(next)) return null;
      have = next; t.push(norm(segments[i].translation)); i++;
    }
    if (have !== want) return null;
    rows.push({ o: want, t: t.join(' ') });
  }
  return i === segments.length ? rows : null;
}

/** The LLM's {source, translation} (lines joined by \n) → rows, only if text unchanged on both sides and counts equal; else null. */
export function verifyLines(original, english, out) {
  const lines = (v) => String(v ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const o = lines(out?.source), t = lines(out?.translation);
  if (!o.length || o.length !== t.length || norm(o.join(' ')) !== norm(original) || norm(t.join(' ')) !== norm(english)) return null;
  return o.map((x, i) => ({ o: x, t: t[i] }));
}

/** Default LLM: Haiku via the role client (spend policy + metering). → { source, translation } | null */
export async function haikuAlign(original, english, lang) {
  const { roleCreate } = await import('../role-client.js');
  const name = { ar: 'Arabic', fa: 'Persian', he: 'Hebrew' }[lang] || 'original-language';
  const prompt = `You are aligning a ${name} source text with its English translation for a side-by-side study document.

Split BOTH texts into the same number of segments by inserting \\n at corresponding meaning boundaries. Each segment on the source side should correspond to the segment at the same position on the translation side.

Rules:
- The number of segments (lines) MUST be equal on both sides
- Do NOT change any words — only insert \\n to break lines
- Prefer breaking at sentence boundaries (periods, colons) or natural clause breaks
- The address/invocation line (﴿...﴾ / "O SON OF...!") should be its own segment on both sides
- If a paragraph is very short (one sentence), keep it as one segment on both sides

Source (${name}):
${original}

Translation (English):
${english}

Return ONLY valid JSON with exactly two keys:
{"source": "line1\\nline2\\nline3", "translation": "line1\\nline2\\nline3"}`;
  const r = await roleCreate('sbs-align', { messages: [{ role: 'user', content: prompt }], max_tokens: 4096, temperature: 0 });
  const m = String(r?.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

/** Original/English per paragraph row: o = original-language text, e = English ('' if none), marked = o with ⁅sN⁆ markers. */
export function sides(p, docLang) {
  const own = ownTranslation(p);
  if (p.original_text && docLang === 'en') return { marked: p.original_text, e: p.text || '', lang: p.original_lang || '', segments: [] };   // English beside a stored original
  if (docLang === 'en') return { marked: p.text || '', e: '', lang: 'en', segments: [] };                                                  // English book, no original
  return { marked: p.text || '', e: own.reading || p.translation_text || own.segments.map((s) => s.translation).join(' ') || '', lang: docLang, segments: own.segments };
}

/**
 * paragraphs (content rows, in order) → [{ n, kind, rows, aligned }], n = firstN + index.
 * deps: { cacheGet(keys)→Map, cachePut(key, rows, model), llm(o, e, lang)→{source,translation}|null, model? }
 */
export async function alignParagraphs(paras, { docLang, firstN = 1, cacheGet, cachePut, llm = haikuAlign, model = 'sbs-align', maxUncached = MAX_UNCACHED }) {
  const items = paras.map((p, i) => {
    const n = firstN + i;
    if (p.blocktype === 'heading') return { n, kind: 'heading', rows: [{ o: stripMarkers(p.text || p.heading || ''), t: '' }], aligned: 'none', done: true };
    const s = sides(p, docLang), o = stripMarkers(s.marked);
    const base = { n, kind: 'text', s, o };
    if (!s.e) return { ...base, rows: [{ o, t: '' }], aligned: 'none', done: true };
    const own = alignByMarkers(s.marked, s.segments);
    if (own?.length) return { ...base, rows: own, aligned: 'markers', done: true };
    return { ...base, rows: [{ o, t: s.e }], aligned: 'paragraph', key: alignKey(o, s.e), done: false };
  });
  const todo = items.filter((x) => !x.done);
  const cached = todo.length ? await cacheGet(todo.map((x) => x.key)) : new Map();
  const misses = [];
  for (const x of todo) {
    const hit = cached.get(x.key);
    if (hit?.length) { x.rows = hit; x.aligned = hit.length > 1 ? 'llm' : 'paragraph'; }
    else if (norm(x.o).length >= MIN_LLM_CHARS || norm(x.s.e).length >= MIN_LLM_CHARS) misses.push(x);
  }
  // at most maxUncached per request, PARALLEL at a time; the rest stay one-row 'paragraph' and align on a later request
  const batch = misses.slice(0, maxUncached);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batch.length) }, async () => {
    while (next < batch.length) {
      const x = batch[next++];
      let out;
      try { out = await llm(x.o, x.s.e, x.s.lang); } catch { continue; }   // transient failure: not cached, retried later
      const rows = verifyLines(x.o, x.s.e, out) || [{ o: x.o, t: x.s.e }];  // rejected → cached as one row: never paid for twice
      try { await cachePut(x.key, rows, model); } catch { /* cache write failed: still serve */ }
      x.rows = rows; x.aligned = rows.length > 1 ? 'llm' : 'paragraph';
    }
  }));
  return items.map(({ n, kind, rows, aligned }) => ({ n, kind, rows, aligned }));
}

const RTL = new Set(['ar', 'fa', 'he', 'ur']);
/** The /documents/:id/sbs payload (contract: .claude/context/brief-sbs-contract.md). → null if no such doc; { copyright: true } if encumbered.
 *  deps: { doc(id), total(id), paragraphs(id, off, lim), sections(id), cacheGet, cachePut, llm } */
export async function buildSbs(id, { offset = 0, limit = 400 }, deps) {
  const doc = await deps.doc(id);
  if (!doc) return null;
  if (doc.encumbered === 1) return { copyright: true };
  const [total, rows, sections] = await Promise.all([deps.total(id), deps.paragraphs(id, offset, limit), deps.sections(id)]);
  const paragraphs = await alignParagraphs(rows, { docLang: doc.language, firstN: offset + 1, cacheGet: deps.cacheGet, cachePut: deps.cachePut, llm: deps.llm });
  let translators = []; try { translators = JSON.parse(doc.translators || '[]'); } catch { /* none */ }
  const language = doc.language === 'en' ? (rows.find((r) => r.original_lang)?.original_lang || 'en') : doc.language;
  const end = offset + rows.length;
  return {
    doc: { id: doc.id, title: doc.title, original_title: null, author: doc.author || null,
      translator: translators.map((t) => t?.name || t).filter(Boolean).join(', ') || null, language, direction: RTL.has(language) ? 'rtl' : 'ltr',
      cover_url: doc.cover_url || null, source_url: doc.source_url || null, paragraphs: total },
    sections: sections.map((s) => ({ title: s.title, start: s.start })),
    paragraphs,
    next_offset: rows.length && end < total ? end : null,
  };
}
