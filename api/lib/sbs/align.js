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

// The letters a model must not change. Vowel marks, tatweel, joiners, punctuation and spacing are not words (11-13: Haiku
// re-voweled the Tablet of Aḥmad and dropped its * separators, so every split was refused); the rows are cut from OUR text.
const skel = (c) => /[\p{L}\p{N}]/u.test(c) && !/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/.test(c);
const letters = (s) => [...String(s || '').normalize('NFC')].filter(skel).join('');

/** text cut into pieces of the given letter counts. */
function cutAt(text, counts) {
  const ch = [...String(text).normalize('NFC')], out = [];
  let i = 0;
  for (const [n, want] of counts.entries()) {
    const from = i;
    for (let k = 0; k < want && i < ch.length; i++) if (skel(ch[i])) k++;
    if (n === counts.length - 1) i = ch.length;
    else {   // marks and separators (" *", ".") stay with this piece; an opening mark after the last space starts the next
      let j = i, ws = -1;
      for (; j < ch.length && !skel(ch[j]); j++) if (/\s/.test(ch[j])) ws = j;
      i = ws >= 0 ? ws + 1 : j;
    }
    out.push(ch.slice(from, i).join('').trim());
  }
  return out;
}

/** The LLM's {source, translation} (lines joined by \n) → rows cut from the original texts, only if the letters are unchanged on
 *  both sides and the counts equal; else null. */
export function verifyLines(original, english, out) {
  const lines = (v) => String(v ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const o = lines(out?.source), t = lines(out?.translation);
  if (!o.length || o.length !== t.length || letters(o.join('')) !== letters(original) || letters(t.join('')) !== letters(english)) return null;
  if (o.some((x) => !letters(x)) || t.some((x) => !letters(x))) return null;
  const oo = cutAt(original, o.map((x) => letters(x).length)), tt = cutAt(english, t.map((x) => letters(x).length));
  return oo.map((x, i) => ({ o: x, t: tt[i] }));
}

/** A model reply → { source, translation }: the tagged form asked for, else JSON (raw newlines inside strings repaired). */
export function parseAlignReply(text) {
  const s = String(text || ''), tag = (k) => s.match(new RegExp(`<${k}>\\s*([\\s\\S]*?)\\s*</${k}>`))?.[1];
  if (tag('source') != null && tag('translation') != null) return { source: tag('source'), translation: tag('translation') };
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { /* raw newlines in the strings */ }
  try { return JSON.parse(m[0].replace(/"(?:[^"\\]|\\.)*"/g, (q) => q.replace(/\r?\n/g, '\\n'))); } catch { return null; }
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

Return ONLY the two texts, one segment per line, in exactly this form:
<source>
segment 1
segment 2
</source>
<translation>
segment 1
segment 2
</translation>`;
  const r = await roleCreate('sbs-align', { messages: [{ role: 'user', content: prompt }], max_tokens: 4096, temperature: 0 });
  return parseAlignReply(r?.choices?.[0]?.message?.content);
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
