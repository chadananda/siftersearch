// Anís TOOL + STRATEGY REGISTRY (Chad 11-03: each kind of search is its own tool; one name = one function; the tools are an API).
// `_search` takes words → ranked passages; `_lookup` takes one known passage/work/word → facts. run(name, input, ctx) returns
// plain JSON (what POST /api/v1/tools/<name> returns). Old names are input-only aliases. Deps lazy; ctx.deps overrides (tests).

import { CANON } from './work-canon.js';

// ── shared schemas ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const FILTERS = { $id: 'AnisToolFilters', type: 'object', additionalProperties: false, description: 'Hard filters, the same for every passage search.',
  properties: {
    tradition: { type: 'string', description: "Religion, e.g. Baha'i, Islam, Christianity" },
    collection: { type: 'string', description: 'Collection name, e.g. Core Publications' },
    author: { type: 'string', description: "Author (writer or quoted voice), e.g. Bahá'u'lláh" },
    writerOnly: { type: 'boolean', default: false, description: 'The author must be the writer, not a quoted voice' },
    language: { type: 'string', description: 'ISO code, e.g. en, ar, fa' },
    documentId: { type: 'integer', description: 'Only this document' },
    yearFrom: { type: 'integer', description: 'Documents dated from this year' },
    yearTo: { type: 'integer', description: 'Documents dated up to this year' },
  } };
// ONE Passage everywhere — the executeSearch passage (so citations and links keep working); id = the paragraph id
const nul = (type) => ({ type: [type, 'null'] });
export const PASSAGE = { $id: 'AnisPassage', type: 'object', additionalProperties: true, required: ['text'], properties: {
  id: { type: ['integer', 'string', 'null'], description: 'Paragraph id' }, document_id: nul('integer'), paragraph_index: nul('integer'),
  title: nul('string'), author: nul('string'), book_author: nul('string'), religion: nul('string'), collection: nul('string'), language: nul('string'),
  text: { type: 'string' }, source_url: nul('string'), link_site: nul('string'), score: nul('number'),
  translation: { ...nul('string'), description: 'What kind of translation this is (authorized / published / provisional)' },
  role: { ...nul('string'), description: 'quotation_trace: source | original | possible_original | cited_by' } } };
export const WORK = { $id: 'AnisWork', type: 'object', additionalProperties: true, required: ['id', 'title'], properties: {
  id: { type: 'integer' }, title: { type: 'string' }, author: nul('string'), religion: nul('string'), collection: nul('string'),
  url: nul('string'), encumbered: { ...nul('integer'), description: '1 = copyrighted: opening pages only' } } };
export const ERROR = { $id: 'AnisToolError', type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'],
  properties: { code: { type: 'string' }, message: { type: 'string' } } } } };
export const SCHEMAS = { Filters: FILTERS, Passage: PASSAGE, Work: WORK, Error: ERROR };
const PASSAGES = { type: 'object', required: ['passages'], properties: { passages: { type: 'array', items: PASSAGE } } };
const str = (description, max = 4000) => ({ type: 'string', minLength: 1, maxLength: max, description });
const LIMIT = (d, max = 50) => ({ type: 'integer', minimum: 1, maximum: max, default: d, description: 'How many results' });
const PID = { type: ['integer', 'string'], description: 'Paragraph id (Passage.id)' };

// ── pure helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The shared filters → search.js filter keys (religion, collection, author, writerOnly, language, documentId, yearFrom, yearTo). Pure. */
export function engineFilters(f = {}) {
  const out = {};
  if (f?.tradition) out.religion = f.tradition;
  for (const k of ['collection', 'author', 'writerOnly', 'language', 'documentId', 'yearFrom', 'yearTo']) if (f?.[k] != null && f[k] !== '' && f[k] !== false) out[k] = f[k];
  return out;
}
/** What kind of translation a text is, for the brief and the reply's row markers. Pure. */
export function translationLabel(by, authority) {
  const s = `${by || ''} ${authority || ''}`;
  if (/shoghi/i.test(s)) return 'authorized — Shoghi Effendi';
  if (/universal house|world cent(re|er)|research department/i.test(s)) return 'authorized — Bahá’í World Centre';
  if (/phelps/i.test(s)) return 'provisional — Stephen Phelps (public domain)';
  if (/published|committee/i.test(s)) return by ? `published — ${by}` : 'published translation';
  return by ? `translation by ${by}` : 'translation';
}
/** Persian and Arabic spell ی/ي and ک/ك differently; a reader's typing may not match the library's. Pure. */
export const letterVariants = (s) => [...new Set([String(s), String(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک'), String(s).replace(/ی/g, 'ي').replace(/ک/g, 'ك')])];
/** Any hit / paragraph / link row → the Passage shape (score, link_site and role kept when present). Pure. */
export const toPassage = (p) => ({ id: p.id, text: p.text || '', title: p.title || p.document?.title || '', author: p.author || p.document?.author || '',
  source_url: p.source_url || p.readerUrl || p.url || null, document_id: p.document_id ?? p.documentId ?? p.doc_id, paragraph_index: p.paragraph_index ?? p.paragraphIndex,
  religion: p.religion || p.document?.religion || null, collection: p.collection || p.document?.collection || null, language: p.language || p.source_lang || 'en',
  translation: p.translation || (/\(provisional translation\)/i.test(p.title || p.document?.title || '') ? translationLabel('Stephen Phelps', 'provisional-phelps') : null),
  ...(p.score != null ? { score: p.score } : {}), ...(p.link?.site || p.link_site ? { link_site: p.link_site || p.link.site } : {}), ...(p.role ? { role: p.role } : {}) });

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`ʻʼ]/g, "'").toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
/** The canon entry a reader's title names (any alias, accents and "the" ignored), or null. */
export function canonWork(title, canon = CANON) {
  const q = fold(title).replace(/^the /, '');
  if (!q) return null;
  return canon.find((w) => [w.title, ...(w.aliases || [])].some((a) => fold(a).replace(/^the /, '') === q))
    || canon.find((w) => [w.title, ...(w.aliases || [])].some((a) => { const f = fold(a).replace(/^the /, ''); return f.length > 5 && (q.includes(f) || f.includes(q)); })) || null;
}
let NOTES = null;
export const loadNotes = async () => (NOTES ??= (await import('./work-notes.json', { with: { type: 'json' } })).default);

// a dependency: the caller's override (ctx.deps — tests), else the live module's export
const MOD = { layers: '../search/qdrant-layers.js', paragraphs: '../paragraphs-repo.js', links: '../hit-links.js', chat: '../../routes/chat.js',
  plinks: '../passage-links.js', people: '../people-search.js', works: './work-request.js', web: '../perplexity.js', ctai: './ctai-term.js',
  docs: '../docs-repo.js', search: '../search.js', hunt: '../source-hunt.js', position: './position.js', rights: '../repos/rights-repo.js', srcl: '../source-links.js' };
const dep = async (ctx, name, mod) => ctx?.deps?.[name] || (await import(MOD[mod]))[name];

// one Qdrant layer: filters (a year range → doc ids) → the layer → paragraphs in rank order → links → Passages
async function layerSearch(fnName, { query, limit = 8, filters } = {}, ctx = {}) {
  const fn = await dep(ctx, fnName, 'layers');
  const f = await (await dep(ctx, 'resolveQdrantFilters', 'layers'))(engineFilters(filters));
  const hits = (await fn(String(query), { limit, filters: f, ...(ctx.timeoutMs ? { timeoutMs: ctx.timeoutMs } : {}) }))?.hits || [];
  if (!hits.length) return { passages: [] };
  const rows = new Map((await (await dep(ctx, 'paragraphsByIds', 'paragraphs'))(hits.map((h) => h.paragraph_id))).map((p) => [Number(p.id), p]));
  const ranked = hits.map((h) => rows.get(Number(h.paragraph_id)) && { ...rows.get(Number(h.paragraph_id)), score: h.score })
    .filter((p) => p && String(p.text || '').length <= 8000);
  const linked = await (await dep(ctx, 'withLinks', 'links'))(ranked).catch(() => ranked);
  return { passages: linked.map(toPassage) };
}
const SEARCH_INPUT = (extra = {}) => ({ type: 'object', additionalProperties: false, required: ['query'], properties: {
  query: str('Words to search for, as the texts would say them'), filters: FILTERS, limit: LIMIT(8), ...extra } });
const P_EX = { id: 1201, document_id: 12, paragraph_index: 4, title: 'Gleanings from the Writings of Bahá’u’lláh', author: "Bahá'u'lláh", religion: "Baha'i",
  collection: 'Core Publications', language: 'en', text: 'The earth is but one country, and mankind its citizens.', source_url: 'https://oceanlibrary.com/gleanings#p4', translation: null };
const layer = (name, label, fnName, purpose) => ({ name, label, kind: 'tool', layer: fnName, purpose, description: purpose,
  input: SEARCH_INPUT(), output: PASSAGES, outputName: 'Passage[]', llmOmit: ['limit'],
  example: { input: { query: 'earth one country mankind citizens', filters: { tradition: "Baha'i" } }, output: { passages: [{ ...P_EX, score: 0.82 }] } },
  run: (a, ctx) => layerSearch(fnName, a, ctx) });
const SEARCH_DESC = 'Search the library (primary texts in English and in their original Arabic/Persian, authorised interpretation, history, scholarship). Phrase the query in the words the texts themselves would use; name an author or work in the query to narrow it.';
const TRADITION = { type: 'string', description: "e.g. Baha'i, Islam, Christianity — omit for all" };
const RENDER = { type: 'array', items: { type: 'object', properties: { en: { type: 'string' }, count: { type: 'integer' } } } };

// ── the registry ────────────────────────────────────────────────────────────────────────────────────────────────────────
const ENTRIES = [
  layer('literal_search', 'Literal Search (BM25)', 'searchKeywordQdrant', 'BM25 keyword search over whole paragraphs: the exact words, folded for accents and spelling.'),
  layer('phrase_search', 'Phrase Search', 'searchPhrases', 'Phrase-vector search: paragraphs holding a phrase like the query, in any wording.'),
  layer('hype_search', 'HyPE Search', 'searchHypeQdrant', 'Question search (HyPE): paragraphs that answer a question like the query.'),
  { name: 'combined_search', label: 'Combined Search', kind: 'tool', outputName: 'Passage[]', description: SEARCH_DESC,
    purpose: 'The planned library search: a planner reads the query (and the conversation), sets the scope, and fuses every layer.',
    input: SEARCH_INPUT({ tradition: { ...TRADITION, description: "A preferred tradition (the planner's default, not a hard filter), e.g. Baha'i, Islam, Christianity — omit for all" },
      messages: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'The conversation, for the planner (default: the query alone)' },
      defaults: { type: 'object', additionalProperties: true, description: 'Planner defaults, e.g. {"religion":"Baha\'i"}' },
      scope_config: { type: 'object', additionalProperties: true, description: 'Host scope (which shelves count)' } }),
    output: PASSAGES, llmOmit: ['limit', 'filters', 'messages', 'defaults', 'scope_config'],
    example: { input: { query: 'the earth is but one country' }, output: { passages: [P_EX] } },
    async run(a, ctx = {}) {
      const search = ctx.search || (await import(MOD.chat)).executeSearch;
      const { documentId, ...f } = engineFilters(a.filters);
      // the LLM's tradition is the planner's default, as before; filters.tradition is a hard filter
      const defaults = 'defaults' in a ? a.defaults : 'messages' in a ? undefined : a.tradition ? { religion: a.tradition } : {};
      const r = await search({ query: a.query, mode: 'passages', limit: a.limit ?? 8, ...(a.scope_config !== undefined ? { scope_config: a.scope_config } : {}), ...f,
        ...(documentId != null ? { document_id: documentId } : {}),
        plan: { messages: 'messages' in a ? a.messages : [{ role: 'user', content: a.query }], ...(defaults !== undefined ? { defaults } : {}) } });
      return { passages: r?.passages || [] };
    } },
  // DECISION FOR CHAD: the agent's no-planner engine (agent-search.js) — named as its own tool so it is not "search_library" under another engine
  { name: 'fused_search', label: 'Fused Search', kind: 'tool', outputName: 'Passage[]', description: SEARCH_DESC,
    purpose: 'Every layer fused on the query as written: no planner, no LLM, no relaxing (the fast path for a model that writes precise queries).',
    input: SEARCH_INPUT({ tradition: TRADITION }), output: PASSAGES, llmOmit: ['limit', 'filters'],
    example: { input: { query: 'the earth is but one country', tradition: "Baha'i" }, output: { passages: [P_EX] } },
    async run(a, ctx = {}) {
      const fast = ctx.fastSearch || (await import('./agent-search.js')).agentSearch();
      const f = engineFilters(a.filters);
      return { passages: (await fast(a.query, a.tradition, a.limit ?? 8, ...(Object.keys(f).length ? [f] : []))).map(toPassage) };
    } },
  { name: 'biography_search', label: 'Biography Search', kind: 'tool', outputName: 'Person[]',
    purpose: 'People search: who did, met or wrote something, each person with the cited evidence.',
    input: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: str('A question about people, e.g. "who met Bahá’u’lláh in Baghdad"') } },
    output: { type: 'object', required: ['people'], properties: { people: { type: 'array', items: { type: 'object', additionalProperties: true } } } },
    example: { input: { query: 'who met Bahá’u’lláh in Baghdad' }, output: { people: [{ id: 42, name: 'Nabíl-i-Aʻẓam' }] } },
    run: async (a, ctx) => ({ people: (await (await dep(ctx, 'peopleSearch', 'people'))(a.query))?.people || [] }) },
  { name: 'document_search', label: 'Document Search', kind: 'tool', outputName: 'Work[]',
    purpose: 'A work in the library by its title, any spelling: the best match first, then close others.',
    description: "A WORK in the library by its title (any spelling: \"Dawnbreakers\", \"Book of Certitude\", \"Iqan\"): the library's copy with its link. When the reader asks for a book — to read it, find it, get a copy, a link — give THIS link; never send them to another site or catalog.",
    input: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: str('The title as given', 300),
      min: { type: 'number', minimum: 0, maximum: 1, default: 0.86, description: 'Minimum title similarity' } } },
    output: { type: 'object', required: ['works'], properties: { works: { type: 'array', items: WORK } } }, llmOmit: ['min'],
    example: { input: { title: 'Iqan' }, output: { works: [{ id: 1, title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", url: 'https://siftersearch.com/library/kitab-i-iqan' }] } },
    async run(a, ctx) {
      const w = await (await dep(ctx, 'findTitled', 'works'))([a.title], ...(a.min != null ? [{ min: a.min }] : []));
      if (!w?.doc) return { works: [] };
      const readerUrl = await dep(ctx, 'readerUrl', 'srcl');
      return { works: [w.doc, ...(w.others || [])].map((x) => ({ ...x, url: readerUrl(x) })) };
    } },
  { name: 'web_search', label: 'Web Search', kind: 'tool', outputName: 'WebAnswer',
    purpose: 'The open web, for what a library of texts cannot hold; never scripture.',
    description: 'The open web — ONLY for what a library of texts cannot hold (recent events, modern scholarship, general background). Results are labelled WEB and never treated as scripture or authoritative.',
    input: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: str('The question') } },
    output: { type: 'object', required: ['text', 'citations'], properties: { text: nul('string'), citations: { type: 'array', items: { type: 'string' } } } },
    example: { input: { query: 'Bahá’í World Centre news 2024' }, output: { text: 'In 2024 …', citations: ['https://news.bahai.org/'] } },
    async run(a, ctx) {
      const r = await (await dep(ctx, 'perplexityFallback', 'web'))(a.query, { caller: 'anis-researcher', maxTokens: 700 });
      return { text: r?.text || null, citations: (r?.citations || []).map((c) => c?.url || c).filter((c) => typeof c === 'string') };
    } },
  { name: 'original_lookup', label: 'Original Lookup', kind: 'tool', outputName: 'Passage[]',
    purpose: 'The Arabic/Persian original of an English passage, then the authorised translations linked to it.',
    description: 'The original-language (Arabic/Persian) text of an English passage, and the authorised translations linked to that original. Give the English words (a sentence or two).',
    input: { type: 'object', additionalProperties: false, required: ['english'], properties: { english: str('The English words (a sentence or two)') } }, output: PASSAGES,
    example: { input: { english: 'The earth is but one country' }, output: { passages: [{ ...P_EX, id: 88, language: 'ar', text: 'ليس الفخر لمن يحب الوطن' }, P_EX] } },
    async run(a, ctx) {
      const findOriginals = await dep(ctx, 'findOriginals', 'plinks'), resolveLinks = await dep(ctx, 'resolveLinks', 'plinks');
      const r = await findOriginals(a.english, { limit: 10, search: await dep(ctx, 'hybridSearch', 'search') });
      const o = r?.originals?.[0];
      if (!o) return { passages: (r?.matches || []).slice(0, 2).map((x) => toPassage(x.passage)).filter((x) => x.text) };
      const tr = ((await resolveLinks([o.id], { quotedBy: false })).get(o.id)?.translations || []).slice(0, 2);
      return { passages: [toPassage(o), ...tr.map(toPassage)] };
    } },
  { name: 'translation_lookup', label: 'Translation Lookup', kind: 'tool', outputName: 'Passage[]',
    purpose: 'Existing English translations of an Arabic/Persian text: the library’s copy of the original and the translations linked to it.',
    description: "An EXISTING English translation of an Arabic/Persian text (a prayer, tablet or passage the reader gives in the original): the library's original paragraph and the translations linked to it — authorized (Shoghi Effendi, the Bahá'í World Centre), published, or Stephen Phelps' provisional renderings. Give the original text (a line or more, in Arabic script). Call it BEFORE translating anything yourself.",
    input: { type: 'object', additionalProperties: false, required: ['original'], properties: { original: str('The original text (a line or more, Arabic script)', 20000) } }, output: PASSAGES,
    example: { input: { original: 'الهی الهی' }, output: { passages: [{ ...P_EX, language: 'fa', text: 'الهی الهی …' }, { ...P_EX, translation: 'provisional — Stephen Phelps (public domain)' }] } },
    // an original → the library's copy of it (verbatim, either spelling of ی/ک) → the English linked to it: aligned
    // translation paragraphs and the English stored beside the original (CTAI side-by-side, Phelps)
    async run({ original }, ctx) {
      const findOriginals = await dep(ctx, 'findOriginals', 'plinks'), overlap = ctx?.deps?.overlap || (await import(MOD.plinks)).overlap;
      const hybridSearch = await dep(ctx, 'hybridSearch', 'search');
      const out = [], seen = new Set();
      const push = (p) => { if (p?.text && !seen.has(p.id ?? p.text)) { seen.add(p.id ?? p.text); out.push(p); } };
      // 10-23 Liliane: a whole prayer typed from a scan (lines shuffled) or transcribed from a photo (page lines, a […] gap)
      // matched nothing as one block, though Phelps' AB05355 was in the library — so: the whole text verbatim, then each
      // line on its own, then by meaning; a candidate must still share half its word-grams with what the reader gave
      const lines = [...new Set(String(original).split(/\n+|[.!؟?:]\s+/).map((l) => l.replace(/\[…\]|\[\.\.\.\]/g, ' ').trim())
        .filter((l) => (l.match(/[؀-ۿ]{2,}/g) || []).length >= 5))].slice(0, 6);
      const tries = [...letterVariants(original).map((v) => ({ v, semantic: false })), ...lines.flatMap((l) => letterVariants(l).slice(0, 2).map((v) => ({ v, semantic: false, line: true }))),
        { v: original, semantic: true }];
      for (const { v, semantic, line } of tries) {
        const r = await findOriginals(v, { limit: 5, semantic, search: hybridSearch }).catch(() => null);
        const fit = (x) => (line ? Math.max(x.overlap, (overlap?.(original, x.passage?.text || '') ?? 0)) : x.overlap);
        for (const m of (r?.matches || []).filter((x) => fit(x) >= 0.5 && /[؀-ۿ]/.test(x.passage?.text || ''))) {
          push(toPassage(m.passage));
          for (const t of m.links?.translations || []) push({ ...toPassage(t), translation: translationLabel(t.translated_by, null) });
          if (m.passage.english?.text) push({ ...toPassage(m.passage), id: `${m.passage.id}-en`, text: m.passage.english.text, language: 'en',
            title: `${m.passage.document?.title || ''} (English beside the original)`, translation: translationLabel(null, m.passage.english.authority) });
        }
        if (out.some((x) => x.translation)) break;
      }
      return { passages: out.slice(0, 6) };
    } },
  { name: 'links_lookup', label: 'Links Lookup', kind: 'tool', refInput: true, outputName: 'PassageLinks',
    purpose: 'A paragraph’s recorded links: its original, its translations, the sources it quotes and the works quoting it.',
    description: "A passage's recorded links (give its ref, e.g. P3): its original, its translations, the sources it quotes and the works quoting it.",
    input: { type: 'object', additionalProperties: false, required: ['paragraph_id'], properties: { paragraph_id: PID,
      quoted_by: { type: 'boolean', default: true, description: 'Include the works quoting it' } } },
    output: { type: 'object', required: ['paragraph_id', 'found', 'original', 'translations', 'sources', 'quoted_by'], properties: {
      paragraph_id: PID, found: { type: 'boolean' }, original: { anyOf: [PASSAGE, { type: 'null' }] }, translations: { type: 'array', items: PASSAGE },
      sources: { type: 'array', items: PASSAGE }, quoted_by: { type: 'object', properties: { count: { type: 'integer' }, passages: { type: 'array', items: PASSAGE } } } } },
    example: { input: { paragraph_id: 1201 }, output: { paragraph_id: 1201, found: true, original: { ...P_EX, id: 88, language: 'ar', text: 'ليس الفخر …' }, translations: [], sources: [], quoted_by: { count: 1, passages: [P_EX] } } },
    async run(a, ctx) {
      const id = Number(a.paragraph_id);
      const l = (await (await dep(ctx, 'resolveLinks', 'plinks'))([id], { quotedBy: a.quoted_by !== false })).get(id);
      return { paragraph_id: id, found: !!l, original: l?.original ? toPassage(l.original) : null, translations: (l?.translations || []).map(toPassage),
        sources: (l?.sources || []).map(toPassage), quoted_by: { count: l?.quotedBy?.count || 0, passages: (l?.quotedBy?.passages || []).map(toPassage) } };
    } },
  { name: 'context_lookup', label: 'Context Lookup', kind: 'tool', refInput: true, outputName: 'Context',
    purpose: 'The paragraphs before and after one paragraph of a document (none for a copyrighted book).',
    description: 'Read the paragraphs before and after a passage you found (its ref, e.g. P3) — for context, or to see how a thought continues.',
    input: { type: 'object', additionalProperties: false, required: ['document_id', 'paragraph_index'], properties: { document_id: { type: 'integer' },
      paragraph_index: { type: 'integer', minimum: 0 }, before: { type: 'integer', minimum: 0, maximum: 5, default: 2 }, after: { type: 'integer', minimum: 0, maximum: 5, default: 2 } } },
    output: { type: 'object', required: ['passages', 'copyright'], properties: { passages: { type: 'array', items: PASSAGE },
      copyright: { type: 'boolean', description: 'true = a copyrighted book: its neighbouring paragraphs are not given' } } },
    example: { input: { document_id: 12, paragraph_index: 4, before: 1, after: 1 }, output: { passages: [{ ...P_EX, paragraph_index: 3 }, P_EX, { ...P_EX, paragraph_index: 5 }], copyright: false } },
    async run(a, ctx) {
      const docId = Number(a.document_id), idx = Number(a.paragraph_index) || 0, before = Math.min(5, a.before ?? 2), after = Math.min(5, a.after ?? 2);
      // a copyrighted (encumbered) book is never read around — consecutive paragraphs are not a short excerpt (Chad 10-23)
      const enc = await (await dep(ctx, 'encumberedAmong', 'rights'))([docId]).catch(() => new Set());
      if (enc.has(docId)) return { passages: [], copyright: true };
      const rows = await (await dep(ctx, 'getParagraphs', 'docs'))(docId, { offset: Math.max(0, idx - before), limit: before + after + 1 });
      const meta = ctx?.meta || (await (await dep(ctx, 'getLinkMeta', 'docs'))([docId]).catch(() => new Map())).get(docId) || {};
      const linked = await (await dep(ctx, 'withLinks', 'links'))(rows.map((r) => ({ id: r.id, doc_id: docId, paragraph_index: r.paragraph_index, text: r.text, title: meta.title }))).catch(() => []);
      return { passages: rows.map((r, i) => toPassage({ ...r, title: meta.title, author: meta.author, religion: meta.religion, document_id: docId, source_url: linked[i]?.url || null })), copyright: false };
    } },
  { name: 'rendering_lookup', label: 'Rendering Lookup (CTAI)', kind: 'tool', outputName: 'Renderings',
    purpose: 'How Shoghi Effendi rendered an Arabic/Persian word or root (the CTAI concordance), with counts and paired passages.',
    description: "How Shoghi Effendi rendered an Arabic/Persian word or root across the Writings (the CTAI concordance): his English renderings with counts, and passages pairing the original with his English. Give the word in Arabic script or transliteration, or the English word.",
    input: { type: 'object', additionalProperties: false, required: ['word'], properties: { word: str('The word in Arabic script or transliteration, or the English word', 200) } },
    output: { type: 'object', required: ['found', 'passages'], properties: { found: { type: 'boolean', description: 'false = no entry in this spelling (says nothing about the word)' },
      term: nul('string'), transliteration: nul('string'), root: nul('string'), meaning: nul('string'),
      counted: { ...nul('integer'), description: 'The aligned passages the counts come from; null = counts across every word of the root' },
      renderings: RENDER, root_renderings: RENDER, research_url: nul('string'), passages: { type: 'array', items: PASSAGE } } },
    example: { input: { word: 'بيت' }, output: { found: true, term: 'بيت', transliteration: 'bayt', root: 'ب ي ت', meaning: 'house', counted: 40, renderings: [{ en: 'house', count: 31 }],
      root_renderings: [], research_url: null, passages: [{ ...P_EX, language: 'ar', text: 'بيت …\nhouse …' }] } },
    async run({ word }, ctx) {
      const w = /[؀-ۿ]/.test(word) ? word : await (await dep(ctx, 'resolveTerm', 'ctai'))(word).catch(() => null);
      const s = w ? await (await dep(ctx, 'ctaiTerm', 'ctai'))(w).catch(() => null) : null;
      if (!s?.passages?.length) return { found: false, passages: [] };
      return { found: true, term: s.term ?? null, transliteration: s.transliteration || null, root: s.root || null, meaning: s.meaning || null, counted: s.counted || null,
        renderings: s.renderings || [], root_renderings: s.root_renderings || [], research_url: s.researchUrl || null,
        passages: s.passages.slice(0, 4).map((x) => toPassage({ text: `${x.original}\n${x.english}`, title: x.ref || x.work, author: x.author, source_url: x.url, religion: "Baha'i", language: 'ar' })) };
    } },
  { name: 'work_notes_lookup', label: 'Work Notes Lookup', kind: 'tool', outputName: 'WorkNotes',
    purpose: 'Verified quotations on a core work’s significance, best authority first.',
    description: "What the sources say about a CORE work's significance, purpose, station or impression (the Aqdas, the Íqán, the Hidden Words, God Passes By, The Dawn-Breakers…): verified quotations, best authority first. Call it beside document_search when a reader asks for or about a book.",
    input: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: str('The work, any spelling or alias', 300) } },
    output: { type: 'object', required: ['work', 'notes'], properties: { work: { ...nul('string'), description: 'The canonical title; null = not a core work' },
      notes: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { quote: { type: 'string' }, source_title: nul('string'), speaker: nul('string'), source_author: nul('string'), url: nul('string') } } } } },
    example: { input: { title: 'Book of Certitude' }, output: { work: 'The Kitáb-i-Íqán', notes: [{ quote: 'Foremost among the priceless treasures …', source_title: 'God Passes By', speaker: 'Shoghi Effendi', url: 'https://oceanlibrary.com/gpb#p1' }] } },
    async run({ title }, ctx = {}) {
      const w = canonWork(title);
      if (!w) return { work: null, notes: [] };
      return { work: w.title, notes: ((await (ctx.notes || loadNotes)())?.works || []).find((x) => x.title === w.title)?.notes || [] };
    } },
  // CANDIDATE STRATEGY (coordinator 11-03): it chains links_lookup's data and combined_search; a tool until strategies take it over
  { name: 'source_trace', label: 'Source Trace', kind: 'tool', refInput: true, outputName: 'Passage[]',
    purpose: 'The primary passages a signpost (a House letter, a scholar, a compilation) quotes or rests on.',
    description: "A House of Justice letter, a scholar or a compilation stating a teaching is a SIGNPOST (Chad 10-19: when they refer to the teachings there is a presumption they mean something specific — we hold it): give its ref (e.g. P4) and get the primary passages it quotes or rests on — from the library's quote links, else the closest passages of Bahá'u'lláh, the Báb, 'Abdu'l-Bahá and Shoghi Effendi. Cite THOSE.",
    input: { type: 'object', additionalProperties: false, required: ['text'], properties: { paragraph_id: PID, text: str('The signpost passage text', 20000) } }, output: PASSAGES,
    example: { input: { paragraph_id: 50, text: 'The unity of mankind is the pivot round which all the teachings revolve.' }, output: { passages: [P_EX] } },
    // its recorded quote links first, else the closest passages of the authoritative authors (position.js isDoctrine) to what it says
    async run(a, ctx) {
      const out = [];
      if (a.paragraph_id) {
        const linked = (await (await dep(ctx, 'resolveLinks', 'plinks'))([a.paragraph_id], { quotedBy: false })).get(Number(a.paragraph_id))?.sources || [];
        out.push(...linked.slice(0, 4).map(toPassage));
      }
      if (out.length < 2) {
        const isDoctrine = await dep(ctx, 'isDoctrine', 'position');
        const q = String(a.text).slice(0, 500);
        const { passages } = await run('combined_search', { query: q, limit: 16, messages: [{ role: 'user', content: q }], defaults: { religion: "Baha'i" } }, ctx);
        out.push(...passages.filter((h) => String(h.text || '').length <= 8000 && isDoctrine(h)).slice(0, 4).map(toPassage));
      }
      return { passages: out };
    } },
  // ── strategies (Jev chooses one; each chains tools) ──
  { name: 'quotation_trace', label: 'Quotation Trace', kind: 'strategy', outputName: 'Passage[]',
    purpose: 'Where a quotation comes from: its published source, the original tablet, and works quoting it.',
    description: 'Where a quotation comes from: its published source, the original tablet, other works quoting it.',
    input: { type: 'object', additionalProperties: false, required: ['quotation'], properties: { quotation: str('The quotation as the reader gave it') } }, output: PASSAGES,
    example: { input: { quotation: 'The earth is but one country, and mankind its citizens' },
      output: { passages: [{ ...P_EX, role: 'source' }, { ...P_EX, id: 88, language: 'ar', text: 'ليس الفخر …', role: 'original' }] } },
    // the sourcehunt engine (Chad 11-02), its phrase and keyword layers taken from phrase_search and literal_search
    async run({ quotation }, ctx = {}) {
      const hunt = ctx.sourceHunt || (await import(MOD.hunt)).sourceHunt;
      const via = (name) => async (...args) => (await layerFn(name, ctx))(...args);
      const r = await hunt(quotation, { phrases: via('phrase_search'), keyword: via('literal_search') }).catch(() => null);
      if (!r?.origin) return { passages: [] };
      const o = r.origin, t = r.tablet?.certain ? r.tablet : null, c0 = !t ? r.tablet?.candidates?.[0] : null, who = r.quoteAuthor || o.author;
      const orig = (x, role) => toPassage({ text: x.text, title: x.meta?.title || x.title, author: who, source_url: x.meta?.links?.oceanoflightsRange || x.rangeUrl || x.url,
        document_id: x.documentId, language: /[پچژگ]/.test(x.text || '') ? 'fa' : 'ar', role });
      return { passages: [toPassage({ text: o.text, title: o.title, author: who, source_url: o.rangeUrl || o.url, document_id: o.documentId, role: 'source' }),
        ...(t ? [orig(t, 'original')] : c0?.text ? [orig(c0, 'possible_original')] : []),
        ...(r.citedBy || []).slice(0, 3).map((c) => toPassage({ text: c.text || c.excerpt || `${c.title} quotes it${c.paragraphs ? ` (${c.paragraphs} paragraphs)` : ''}.`,
          title: c.title, author: c.author, source_url: c.rangeUrl || c.url, document_id: c.documentId, role: 'cited_by' }))] };
    } },
  // Jev's answer strategies: internal (they take the turn's ctx, not a JSON input), so not on the API or a model's list
  ...[['comparison', 'Comparison', async (c, x) => (await import('./strategies.js')).comparison(c, x)],
    ['understanding', 'Understanding', async (c, x) => (await import('./strategies.js')).understanding(c, x)],
    ['prayer', 'Prayer', async (c, x) => (await import('./prayer-shelf.js')).prayerShelf(x)],
    ['guidance', 'Current Guidance', async (c, x) => (await import('./guidance.js')).currentGuidance(x)],
    ['reference', 'Scripture Reference', async (c, x) => (await import('./scripture-ref.js')).scriptureReference(x)]]
    .map(([name, label, fn]) => ({ name, label, kind: 'strategy', internal: true, purpose: `The ${label.toLowerCase()} answer strategy (Jev chooses it).`, run: fn })),
  // Jev's depth = deep_report: queue deep research as a job (the deep-research worker), return { researchId, status } at once
  { name: 'deep_report', label: 'Deep Report', kind: 'strategy', internal: true, purpose: 'Queue a deep-research report as a job (Jev chooses the depth).',
    run: async (input, ctx) => (await import('./deep-report.js')).startDeepReport(input, ctx) },
];

export const REGISTRY = Object.freeze(Object.fromEntries(ENTRIES.map((e) => [e.name, Object.freeze(e)])));
/** Old names → canonical. Input only: lists, routes' docs and models always see the canonical name. */
export const ALIASES = Object.freeze({ search_library: 'combined_search', planned_search: 'combined_search', people_search: 'biography_search', find_work: 'document_search',
  find_original: 'original_lookup', find_translation: 'translation_lookup', passage_links: 'links_lookup', read_around: 'context_lookup', word_study: 'rendering_lookup',
  about_work: 'work_notes_lookup', trace_source: 'source_trace', source_of: 'quotation_trace' });

export const canonical = (name) => (Object.hasOwn(REGISTRY, name) ? name : Object.hasOwn(ALIASES, name) ? ALIASES[name] : null);
export const resolve = (name) => REGISTRY[canonical(name)] || null;
export const label = (name) => resolve(name)?.label || null;
/** The callable tools (API + models), canonical names: everything but the internal Jev strategies. */
export const publicNames = () => ENTRIES.filter((e) => !e.internal).map((e) => e.name);
export const list = () => ENTRIES.filter((e) => !e.internal).map(({ name, label: l, kind, purpose }) => ({ name, label: l, kind, purpose }));

/** run(name, input, ctx) → the tool's plain JSON. An unknown name throws { code: 'unknown_tool' }. */
export async function run(name, input = {}, ctx = {}) {
  const e = resolve(name);
  if (!e) throw Object.assign(new Error(`unknown tool: ${name}`), { code: 'unknown_tool' });
  return e.run(input, ctx);
}
/** A Qdrant search tool's raw layer function (what sourceHunt takes as deps.phrases / deps.keyword). */
export async function layerFn(name, ctx = {}) {
  const e = resolve(name);
  if (!e?.layer) throw new Error(`${name} is not a layer search`);
  return dep(ctx, e.layer, 'layers');
}

/** OpenAI-style tool definitions for `names` (canonical), generated from the input schemas minus llmOmit. A tool on a known
 *  passage (refInput) takes the passage's ref (P#) from a model instead of its ids; the runner resolves the ref. */
export function llmTools(names) {
  return names.map((n) => {
    const e = resolve(n);
    if (!e?.input) throw new Error(`no LLM tool: ${n}`);
    const props = Object.fromEntries(Object.entries(e.input.properties).filter(([k]) => !(e.llmOmit || []).includes(k))
      .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk]) => !['$id', 'minLength', 'maxLength', 'default', 'minimum', 'maximum', 'additionalProperties'].includes(kk)))]));
    const parameters = e.refInput
      ? { type: 'object', properties: { ref: { type: 'string', description: 'The passage ref, e.g. P3' }, ...(e.name === 'context_lookup' ? { before: { type: 'integer' }, after: { type: 'integer' } } : {}) }, required: ['ref'] }
      : { type: 'object', properties: props, required: (e.input.required || []).filter((k) => k in props) };
    return { type: 'function', function: { name: e.name, description: e.description || e.purpose, parameters } };
  });
}
