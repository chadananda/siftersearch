// Anís TOOL REGISTRY (Chad 11-09: a tool is pure JSON in → JSON out, fast, no LLM; the registry IS the API at /api/v1/tools).
// REGISTRY = the contract tools (strict input schema, output schema, cost, one error shape {error:{code,message,retryable}}).
// PROCESS = non-contract tools that may call a model or are Jev's own (web_search, strategy executors): never on the API. (The old planner search lives only in combined-search.js, the respond@3 rollback.)
// `_search` takes words → ranked, deduped passages; `_lookup` takes one known passage/work/word → facts. run(name, input, ctx); ctx.deps overrides (tests).

import Ajv from 'ajv';
import { CANON } from './work-canon.js';
import { canonicalTradition } from './tradition-name.js';
import { DOCTRINAL_KEYS } from '../search/doctrinal-rank.js';
import { currentAIContext, withAIContext } from '../ai-context.js';
import { FILTERS, PASSAGE, WORK, ERROR, SCHEMAS, PASSAGES, str, LIMIT, PID, nul, engineFilters, translationLabel, letterVariants, toPassage, dedupePassages, plainSchema, dep, layerDep, MOD } from './tool-kit.js';
import { ToolError, toToolError } from './tool-error.js';
export { FILTERS, PASSAGE, WORK, ERROR, SCHEMAS, engineFilters, translationLabel, letterVariants, toPassage, dedupePassages };

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

// ── search plumbing ─────────────────────────────────────────────────────────────────────────────────────────────────────
const LAYER_OF = { searchKeywordQdrant: 'literal', searchPhrases: 'phrase', searchHypeQdrant: 'hype' };
const C = (embed, p50_ms) => ({ llm: false, embed, p50_ms });   // declared cost; the ratchet proves llm:false, the p50 is the live target
/** filters → engine filters + the post-filters the engine has no key for: `work` (a title → its document id), `authority[]`.
 *  none = a named work the library does not hold (an empty, honest result). */
async function scope(filters = {}, ctx = {}) {
  const f = engineFilters(filters);
  if (filters?.work && f.documentId == null) {
    const w = await (await dep(ctx, 'findTitled', 'works'))([filters.work]);
    if (!w?.doc) return { f, none: true };
    f.documentId = w.doc.id;
  }
  return { f, authority: filters?.authority?.length ? new Set(filters.authority) : null };
}
// over-fetch when an authority post-filter will thin the list
const want = (limit, authority) => (authority ? limit * 3 : limit);
const finish = (list, limit, authority) => dedupePassages(list).filter((p) => !authority || authority.has(p.authority)).slice(0, limit);

// one Qdrant layer: engine filters (a year range → doc ids) → the layer → paragraphs in rank order → links → Passages (found_by = the layer)
async function layerRows(fnName, query, limit, engine, ctx = {}) {
  const fn = await layerDep(ctx, fnName);
  const f = await (await dep(ctx, 'resolveQdrantFilters', 'layers'))(engine);
  const hits = (await fn(String(query), { limit, filters: f, ...(ctx.timeoutMs ? { timeoutMs: ctx.timeoutMs } : {}) }))?.hits || [];
  if (!hits.length) return [];
  const rows = new Map((await (await dep(ctx, 'paragraphsByIds', 'paragraphs'))(hits.map((h) => h.paragraph_id))).map((p) => [Number(p.id), p]));
  const ranked = hits.map((h) => rows.get(Number(h.paragraph_id)) && { ...rows.get(Number(h.paragraph_id)), score: h.score })
    .filter((p) => p && String(p.text || '').length <= 8000);
  // links are decoration on the passages (a failure here leaves them unlinked, never wrong)
  const linked = await (await dep(ctx, 'withLinks', 'links'))(ranked).catch(() => ranked);
  return linked.map((p) => ({ ...toPassage(p), found_by: [LAYER_OF[fnName] || fnName] }));
}
async function layerSearch(fnName, { query, limit = 8, filters } = {}, ctx = {}) {
  const { f, authority, none } = await scope(filters, ctx);
  if (none) return { passages: [] };
  return { passages: finish(await layerRows(fnName, query, want(limit, authority), f, ctx), limit, authority) };
}
// the agent's fast engine (agent-search.js): every layer fused on the query as written; filters.tradition → its religion argument
async function fastRows(query, engine, limit, ctx = {}) {
  const fast = ctx.fastSearch || (await import('./agent-search.js')).agentSearch();
  const { religion, ...rest } = engine;
  return (await fast(query, religion, limit, ...(Object.keys(rest).length ? [rest] : []))).map(toPassage);
}
const SEARCH_INPUT = (extra = {}) => ({ type: 'object', additionalProperties: false, required: ['query'], properties: {
  query: str('Words to search for, as the texts would say them'), filters: FILTERS, limit: LIMIT(8), ...extra } });
const P_EX = { id: 1201, document_id: 12, paragraph_index: 4, title: 'Gleanings from the Writings of Bahá’u’lláh', author: "Bahá'u'lláh", religion: "Baha'i",
  collection: 'Core Publications', language: 'en', text: 'The earth is but one country, and mankind its citizens.', source_url: 'https://oceanlibrary.com/gleanings#p4', translation: null,
  authority: 'scripture', year: 1905, translator: 'Shoghi Effendi', edition: null };
const layer = (name, label, fnName, purpose, cost) => ({ name, label, kind: 'tool', layer: fnName, purpose, description: purpose, cost,
  input: SEARCH_INPUT(), output: PASSAGES, outputName: 'Passage[]', llmOmit: ['limit'],
  example: { input: { query: 'earth one country mankind citizens', filters: { tradition: "Baha'i" } }, output: { passages: [{ ...P_EX, score: 0.82 }] } },
  run: (a, ctx) => layerSearch(fnName, a, ctx) });
/** The original-language Writings: the doctrinal writers as writers, language group ar-fa (qdrant-layers: fa and ar map to one group). */
export const ORIGINALS_FILTER = { author: DOCTRINAL_KEYS, writerOnly: true, language: 'fa' };
const FUSED_DESC = 'Search the library (primary texts in English and in their original Arabic/Persian, authorised interpretation, history, scholarship), every layer fused on the query as written: no planner, no LLM. Phrase the query in the words the texts themselves would use; narrow with filters (author, work, authority, tradition, years, language) and pick layers to run only some.';
const RENDER = { type: 'array', items: { type: 'object', properties: { en: { type: 'string' }, count: { type: 'integer' } } } };
const LAYERS = { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: ['literal', 'phrase', 'hype', 'originals'] },
  description: 'Run only these layers and merge them (literal = exact words, no embedding; phrase = meaning of a phrase; hype = questions answered; originals = Arabic/Persian Writings). Omit = every layer fused.' };
const DROPS = { work: ['work', 'documentId'], author: ['author', 'writerOnly'], collection: ['collection'], tradition: ['tradition'], authority: ['authority'], years: ['yearFrom', 'yearTo'], language: ['language'] };
const TIERS = { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: Object.keys(DROPS) },
  description: 'Escalation ladder: if fewer than min_results come back, drop these filters one at a time in this order and search again; each passage says its tier (strict | relaxed:<dropped filters>). Omit = filters are hard.' };
const LAYER_FN = { literal: 'searchKeywordQdrant', phrase: 'searchPhrases', hype: 'searchHypeQdrant' };
const PERSON = { $id: 'AnisPerson', type: 'object', additionalProperties: true, required: ['name'], properties: { id: { type: ['integer', 'string', 'null'] }, name: { type: 'string' },
  evidence: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { relation: nul('string'), statement: nul('string'), source: nul('string'), paraId: nul('integer') } } } } };

// one fused search at one filter set: layers merged by reciprocal-rank fusion, deduped, authority-filtered
async function searchOnce(query, a, filters, ctx) {
  const { f, authority, none } = await scope(filters, ctx);
  if (none) return [];
  const limit = a.limit ?? 8, n = want(limit, authority);
  // the model names the writer; code only resolves the name (alias table). Left in the query, "where does 'Abdu'l-Bahá say
  // justice is each one's due" ranked other traditions and writers above Some Answered Questions 77 (11-05); held to Him, it is #2
  if (typeof f.author === 'string') f.author = (await import('../search-plan.js')).keywordAuthor(f.author) || f.author.trim();
  if (!a.layers) return finish(await fastRows(query, f, n, ctx), limit, authority);
  const lists = await Promise.all(a.layers.map(async (l) => (l === 'originals'
    ? (await fastRows(query, { ...f, religion: "Baha'i", ...ORIGINALS_FILTER }, n, ctx)).map((p) => ({ ...p, found_by: ['originals'] }))
    : layerRows(LAYER_FN[l], query, n, f, ctx))));
  const rrf = new Map(), key = (p) => `${p.id ?? p.text}`;
  lists.forEach((l) => l.forEach((p, r) => rrf.set(key(p), (rrf.get(key(p)) || 0) + 1 / (60 + r))));
  const merged = lists.flat().sort((x, y) => rrf.get(key(y)) - rrf.get(key(x)));
  return finish(merged, limit, authority).map((p) => ({ ...p, score: Math.round(rrf.get(key(p)) * 10000) / 10000 }));
}

// ── the registry ────────────────────────────────────────────────────────────────────────────────────────────────────────
const ENTRIES = [
  layer('literal_search', 'Literal Search (BM25)', 'searchKeywordQdrant', 'BM25 keyword search over whole paragraphs: the exact words, folded for accents and spelling.', C(false, 40)),
  layer('phrase_search', 'Phrase Search', 'searchPhrases', 'Phrase-vector search: paragraphs holding a phrase like the query, in any wording.', C(true, 120)),
  layer('hype_search', 'HyPE Search', 'searchHypeQdrant', 'Question search (HyPE): paragraphs that answer a question like the query.', C(true, 120)),
  // THE search: layers, filters (authority, work, years, language, tradition, author) and dedup in one call
  { name: 'fused_search', label: 'Fused Search', kind: 'tool', outputName: 'Passage[]', description: FUSED_DESC, cost: C(true, 250),
    purpose: 'The one typed search: every layer (or the ones you pick) fused on the query as written, filtered, deduped across layers/copies/editions.',
    input: SEARCH_INPUT({ layers: LAYERS, tiers: TIERS, min_results: { type: 'integer', minimum: 1, maximum: 20, default: 3, description: 'tiers: widen while fewer than this many passages' },
      spell: { type: 'boolean', default: false, description: 'Correct misspellings against the library vocabulary before searching (deterministic; query_used says what was searched)' } }),
    output: { type: 'object', required: ['passages'], properties: { passages: { type: 'array', items: PASSAGE }, query_used: { ...nul('string'), description: 'The query actually searched (differs when spell corrected it)' },
      relaxed: { type: 'array', items: { type: 'string' }, description: 'Filters dropped by tiers to reach the passages' } } }, llmOmit: ['limit', 'min_results'],
    example: { input: { query: 'the earth is but one country', filters: { tradition: "Baha'i", authority: ['scripture'] }, layers: ['literal', 'phrase'] }, output: { passages: [{ ...P_EX, found_by: ['literal', 'phrase'] }], query_used: 'the earth is but one country', relaxed: [] } },
    async run(a, ctx = {}) {
      let query = a.query;
      if (a.spell) { const sp = await import('../search/spell.js'); query = sp.correctQuery(query, sp.vocabulary()).query || query; }
      const limit = a.limit ?? 8, min = a.min_results ?? 3;
      let passages = await searchOnce(query, a, a.filters, ctx);
      const dropped = [];
      if (a.tiers) {
        passages = passages.map((p) => ({ ...p, tier: 'strict' }));
        for (const t of a.tiers) {
          if (passages.length >= min) break;
          dropped.push(t);
          const f = Object.fromEntries(Object.entries(a.filters || {}).filter(([k]) => !dropped.some((d) => DROPS[d].includes(k))));
          const more = (await searchOnce(query, a, f, ctx)).map((p) => ({ ...p, tier: `relaxed:${dropped.join('+')}` }));
          passages = dedupePassages([...passages, ...more]).slice(0, limit);
        }
      }
      return { passages, query_used: query, relaxed: passages.some((p) => p.tier && p.tier !== 'strict') ? dropped : [] };
    } },
  // the Writings in their ORIGINAL languages (11-04, measured: an English query's fused ranking puts no Persian/Arabic Writing in
  // its top 8 — English-English phrase matches fill it — while the same query held to the ar-fa group returns 22-29 originals of 30)
  { name: 'originals_search', label: 'Originals Search', kind: 'tool', outputName: 'Passage[]', cost: C(true, 250),
    description: "Search the Writings of the Báb, Bahá'u'lláh, 'Abdu'l-Bahá and Shoghi Effendi in their ORIGINAL Persian and Arabic. Words in English (the phrase layer matches across languages) or in Persian/Arabic. A hit with no linked translation is the original alone.",
    purpose: 'The fast engine held to the doctrinal writers and the Arabic/Persian language group: the originals an English search ranks out.',
    input: SEARCH_INPUT(), output: PASSAGES, llmOmit: ['limit', 'filters'],
    example: { input: { query: 'kings increase their expenditures and lay the burden on their subjects' }, output: { passages: [{ ...P_EX, id: 88, language: 'ar', text: 'يا معشر الملوك…' }] } },
    async run(a, ctx = {}) {
      const { f, authority, none } = await scope(a.filters, ctx);
      if (none) return { passages: [] };
      const limit = a.limit ?? 6;
      return { passages: finish(await fastRows(a.query, { ...f, religion: "Baha'i", ...ORIGINALS_FILTER }, want(limit, authority), ctx), limit, authority) };
    } },
  { name: 'biography_search', label: 'Biography Search', kind: 'tool', outputName: 'Person[]', cost: C(false, 150),
    purpose: 'People search: who did, met or wrote something, each person with the cited evidence (deterministic: the evidence index, no model).',
    input: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: str('A question about people, e.g. "who met Bahá’u’lláh in Baghdad"') } },
    output: { type: 'object', required: ['people'], properties: { people: { type: 'array', items: PERSON } } },
    example: { input: { query: 'who met Bahá’u’lláh in Baghdad' }, output: { people: [{ id: 42, name: 'Nabíl-i-Aʻẓam', evidence: [] }] } },
    run: async (a, ctx) => ({ people: (await (await dep(ctx, 'peopleSearch', 'people'))(a.query, { judge: false }))?.people || [] }) },
  { name: 'document_search', label: 'Document Search', kind: 'tool', outputName: 'Work[]', cost: C(false, 15),
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
  { name: 'original_lookup', label: 'Original Lookup', kind: 'tool', outputName: 'Passage[]', cost: C(true, 300),
    purpose: 'The Arabic/Persian original of an English passage, then the authorised translations linked to it.',
    description: 'The original-language (Arabic/Persian) text of an English passage, and the authorised translations linked to that original. Give the English words (a sentence or two).',
    input: { type: 'object', additionalProperties: false, required: ['english'], properties: { english: str('The English words (a sentence or two)') } }, output: PASSAGES,
    example: { input: { english: 'The earth is but one country' }, output: { passages: [{ ...P_EX, id: 88, language: 'ar', text: 'ليس الفخر لمن يحب الوطن' }, P_EX] } },
    async run(a, ctx) {
      const findOriginals = await dep(ctx, 'findOriginals', 'plinks'), resolveLinks = await dep(ctx, 'resolveLinks', 'plinks');
      const r = await findOriginals(a.english, { limit: 10, search: await dep(ctx, 'hybridSearch', 'search') });
      const o = r?.originals?.[0];
      if (!o) return { passages: dedupePassages((r?.matches || []).slice(0, 2).map((x) => toPassage(x.passage)).filter((x) => x.text)) };
      const tr = ((await resolveLinks([o.id], { quotedBy: false })).get(o.id)?.translations || []).slice(0, 2);
      return { passages: dedupePassages([toPassage(o), ...tr.map(toPassage)]) };
    } },
  { name: 'translation_lookup', label: 'Translation Lookup', kind: 'tool', outputName: 'Passage[]', cost: C(true, 400),
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
        const r = await findOriginals(v, { limit: 5, semantic, search: hybridSearch });
        const fit = (x) => (line ? Math.max(x.overlap, (overlap?.(original, x.passage?.text || '') ?? 0)) : x.overlap);
        for (const m of (r?.matches || []).filter((x) => fit(x) >= 0.5 && /[؀-ۿ]/.test(x.passage?.text || ''))) {
          push(toPassage(m.passage));
          for (const t of m.links?.translations || []) push({ ...toPassage(t), translation: translationLabel(t.translated_by, null) });
          if (m.passage.english?.text) push({ ...toPassage(m.passage), id: `${m.passage.id}-en`, text: m.passage.english.text, language: 'en',
            title: `${m.passage.document?.title || ''} (English beside the original)`, translation: translationLabel(null, m.passage.english.authority) });
        }
        if (out.some((x) => x.translation)) break;
      }
      return { passages: dedupePassages(out).slice(0, 6) };
    } },
  { name: 'links_lookup', label: 'Links Lookup', kind: 'tool', refInput: true, outputName: 'PassageLinks', cost: C(false, 30),
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
  { name: 'context_lookup', label: 'Context Lookup', kind: 'tool', refInput: true, outputName: 'Context', cost: C(false, 25),
    purpose: 'The paragraphs before and after one paragraph of a document (none for a copyrighted book).',
    description: 'Read the paragraphs before and after a passage you found (its ref, e.g. P3) — for context, or to see how a thought continues.',
    input: { type: 'object', additionalProperties: false, required: ['document_id', 'paragraph_index'], properties: { document_id: { type: 'integer' },
      paragraph_index: { type: 'integer', minimum: 0 }, before: { type: 'integer', minimum: 0, maximum: 5, default: 2 }, after: { type: 'integer', minimum: 0, maximum: 5, default: 2 } } },
    output: { type: 'object', required: ['passages', 'copyright'], properties: { passages: { type: 'array', items: PASSAGE },
      copyright: { type: 'boolean', description: 'true = a copyrighted book: its neighbouring paragraphs are not given' } } },
    example: { input: { document_id: 12, paragraph_index: 4, before: 1, after: 1 }, output: { passages: [{ ...P_EX, paragraph_index: 3 }, P_EX, { ...P_EX, paragraph_index: 5 }], copyright: false } },
    async run(a, ctx) {
      const docId = Number(a.document_id), idx = Number(a.paragraph_index) || 0, before = Math.min(5, a.before ?? 2), after = Math.min(5, a.after ?? 2);
      // a copyrighted (encumbered) book is never read around — consecutive paragraphs are not a short excerpt (Chad 10-23).
      // FAILS CLOSED: if the rights check cannot be made, nothing is given (rights_unavailable), never the text
      const enc = await (await dep(ctx, 'encumberedAmong', 'rights'))([docId]).catch((e) => { throw new ToolError('rights_unavailable', `rights check failed (${e?.message || e}) — not reading around a book whose rights are unknown`, true); });
      if (enc.has(docId)) return { passages: [], copyright: true };
      // by paragraph_index: an OFFSET skipped the footnotes the prose read filters and landed ~87 paragraphs late (11-03)
      const rows = await (await dep(ctx, 'getParagraphsAround', 'docs'))(docId, idx, { before, after });
      const meta = ctx?.meta || (await (await dep(ctx, 'getLinkMeta', 'docs'))([docId]).catch(() => new Map())).get(docId) || {};
      const linked = await (await dep(ctx, 'withLinks', 'links'))(rows.map((r) => ({ id: r.id, doc_id: docId, paragraph_index: r.paragraph_index, text: r.text, title: meta.title }))).catch(() => []);
      return { passages: rows.map((r, i) => toPassage({ ...r, title: meta.title, author: meta.author, religion: meta.religion, year: meta.year, document_id: docId, source_url: linked[i]?.url || null })), copyright: false };
    } },
  // CTAI is an HTTP concordance (no model); the term is Arabic script — Latin → Arabic is Jev's unit (a transform), not this tool's
  { name: 'rendering_lookup', label: 'Rendering Lookup (CTAI)', kind: 'tool', outputName: 'Renderings', cost: C(false, 400),
    purpose: 'How Shoghi Effendi (or another translator) rendered an Arabic/Persian word or root (the CTAI concordance), with counts and paired passages.',
    description: "How Shoghi Effendi rendered an Arabic/Persian word or root across the Writings (the CTAI concordance): his English renderings with counts, and passages pairing the original with his English. Give the word in ARABIC SCRIPT.",
    input: { type: 'object', additionalProperties: false, required: ['term_arabic'], properties: { term_arabic: str('The word or root in Arabic script', 200),
      translator: { type: 'string', description: 'Keep only passages rendered by this translator, e.g. Shoghi Effendi' } } },
    output: { type: 'object', required: ['found', 'passages'], properties: { found: { type: 'boolean', description: 'false = no entry in this spelling (says nothing about the word)' },
      term: nul('string'), transliteration: nul('string'), root: nul('string'), meaning: nul('string'),
      counted: { ...nul('integer'), description: 'The aligned passages the counts come from; null = counts across every word of the root' },
      renderings: RENDER, root_renderings: RENDER, research_url: nul('string'), passages: { type: 'array', items: PASSAGE } } },
    example: { input: { term_arabic: 'بيت' }, output: { found: true, term: 'بيت', transliteration: 'bayt', root: 'ب ي ت', meaning: 'house', counted: 40, renderings: [{ en: 'house', count: 31 }],
      root_renderings: [], research_url: null, passages: [{ ...P_EX, language: 'ar', text: 'بيت …\nhouse …' }] } },
    async run({ term_arabic, translator }, ctx) {
      if (!/[؀-ۿ]/.test(term_arabic)) throw new ToolError('invalid_input', 'term_arabic must be in Arabic script (Latin → Arabic is a decision step, not this tool)', false);
      const s = await ctaiCached(ctx, term_arabic);
      if (!s?.passages?.length) return { found: false, passages: [] };
      const keep = translator ? s.passages.filter((x) => new RegExp(translator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(`${x.author || ''} ${x.translator || ''}`)) : s.passages;
      return { found: true, term: s.term ?? null, transliteration: s.transliteration || null, root: s.root || null, meaning: s.meaning || null, counted: s.counted || null,
        renderings: s.renderings || [], root_renderings: s.root_renderings || [], research_url: s.researchUrl || null,
        passages: keep.slice(0, 4).map((x) => toPassage({ text: `${x.original}\n${x.english}`, title: x.ref || x.work, author: x.author, source_url: x.url, religion: "Baha'i", language: 'ar' })) };
    } },
  { name: 'work_notes_lookup', label: 'Work Notes Lookup', kind: 'tool', outputName: 'WorkNotes', cost: C(false, 2),
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
  // a signpost's recorded quote links, else a pure fused_search held to the authoritative standings (scripture, Guardian): no planner, no model
  { name: 'source_trace', label: 'Source Trace', kind: 'tool', refInput: true, outputName: 'Passage[]', cost: C(true, 300),
    purpose: 'The primary passages a signpost (a House letter, a scholar, a compilation) quotes or rests on.',
    description: "A House of Justice letter, a scholar or a compilation stating a teaching is a SIGNPOST (Chad 10-19: when they refer to the teachings there is a presumption they mean something specific — we hold it): give its ref (e.g. P4) and get the primary passages it quotes or rests on — from the library's quote links, else the closest passages of Bahá'u'lláh, the Báb, 'Abdu'l-Bahá and Shoghi Effendi. Cite THOSE.",
    input: { type: 'object', additionalProperties: false, required: ['text'], properties: { paragraph_id: PID, text: str('The signpost passage text', 20000) } }, output: PASSAGES,
    example: { input: { paragraph_id: 50, text: 'The unity of mankind is the pivot round which all the teachings revolve.' }, output: { passages: [P_EX] } },
    async run(a, ctx) {
      const out = [];
      if (a.paragraph_id) {
        const linked = (await (await dep(ctx, 'resolveLinks', 'plinks'))([a.paragraph_id], { quotedBy: false })).get(Number(a.paragraph_id))?.sources || [];
        out.push(...linked.slice(0, 4).map(toPassage));
      }
      if (out.length < 2) out.push(...(await run('fused_search', { query: String(a.text).slice(0, 500), limit: 4, filters: { tradition: "Baha'i", authority: ['scripture', 'interpretation'] } }, ctx)).passages);
      return { passages: dedupePassages(out).slice(0, 4) };
    } },
  // quotation_candidates: the sourcehunt engine with NO model — phrase + keyword layers, holds() on the wording, links; the decision is a tree node (judge.passages)
  { name: 'quotation_candidates', label: 'Quotation Candidates', kind: 'tool', outputName: 'Passage[]', cost: C(true, 900),
    purpose: 'Where a quotation may come from: the passage holding its words (source), the original tablet, works quoting it — each with a containment score; deterministic, no model.',
    description: 'Candidates for where a quotation comes from: its published source (core literature), the original-language tablet, other works quoting it; each with a score (the share of the quotation’s words the passage holds). Judging which candidate is right is the caller’s decision.',
    input: { type: 'object', additionalProperties: false, required: ['quotation'], properties: { quotation: str('The quotation as the reader gave it') } }, output: PASSAGES,
    example: { input: { quotation: 'The earth is but one country, and mankind its citizens' },
      output: { passages: [{ ...P_EX, role: 'source', score: 1 }, { ...P_EX, id: 88, language: 'ar', text: 'ليس الفخر …', role: 'original', score: 0.9 }] } },
    async run({ quotation }, ctx = {}) {
      const hunt = ctx.sourceHunt || (await import(MOD.hunt)).sourceHunt;
      const { contentContainment } = await import(MOD.hunt);
      const via = (name) => async (...args) => (await layerFn(name, ctx))(...args);
      // the source must be CORE literature (Chad 11-03); a line held only by commentary has no source here. decide:null = wording only, no Jev
      const r = await hunt(quotation, { phrases: via('phrase_search'), keyword: via('literal_search'), decide: null }, { coreOnly: true });
      if (r?.error) throw new ToolError('invalid_input', r.error, false);
      if (!r?.origin) return { passages: [] };
      const o = r.origin, t = r.tablet?.certain ? r.tablet : null, c0 = !t ? r.tablet?.candidates?.[0] : null, who = r.quoteAuthor || o.author;
      const sc = (x) => Math.round(contentContainment(quotation, x?.text || '') * 100) / 100;
      const orig = (x, role) => toPassage({ text: x.text, title: x.meta?.title || x.title, author: who, source_url: x.meta?.links?.oceanoflightsRange || x.rangeUrl || x.url,
        document_id: x.documentId, language: /[پچژگ]/.test(x.text || '') ? 'fa' : 'ar', role, score: sc(x) });
      return { passages: dedupePassages([toPassage({ text: o.text, title: o.title, author: who, source_url: o.rangeUrl || o.url, document_id: o.documentId, role: 'source', score: sc(o) }),
        ...(t ? [orig(t, 'original')] : c0?.text ? [orig(c0, 'possible_original')] : []),
        ...(r.citedBy || []).slice(0, 3).map((c) => toPassage({ text: c.text || c.excerpt || `${c.title} quotes it${c.paragraphs ? ` (${c.paragraphs} paragraphs)` : ''}.`,
          title: c.title, author: c.author, source_url: c.rangeUrl || c.url, document_id: c.documentId, role: 'cited_by', score: sc(c) }))]) };
    } },
];

// ── PROCESS tools: not the contract — Jev's own, or a model/provider call. Never on /api/v1/tools; respond@3 and the researcher still call them by name ──
const PROCESS_ENTRIES = [
  { name: 'web_search', label: 'Web Search', kind: 'tool', process: true, outputName: 'WebAnswer', cost: { llm: true, embed: false, p50_ms: 4000 },
    purpose: 'The open web, for what a library of texts cannot hold; never scripture. (Perplexity answers with a model, so this is a process step, not a contract tool.)',
    description: 'The open web — ONLY for what a library of texts cannot hold (recent events, modern scholarship, general background). Results are labelled WEB and never treated as scripture or authoritative.',
    input: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: str('The question') } },
    output: { type: 'object', required: ['text', 'citations'], properties: { text: nul('string'), citations: { type: 'array', items: { type: 'string' } } } },
    async run(a, ctx) {
      const r = await (await dep(ctx, 'perplexityFallback', 'web'))(a.query, { caller: 'anis-researcher', maxTokens: 700 });
      return { text: r?.text || null, citations: (r?.citations || []).map((c) => c?.url || c).filter((c) => typeof c === 'string') };
    } },
  // Jev's answer strategies: internal (they take the turn's ctx, not a JSON input), so not on the API or a model's list
  ...[['comparison', 'Comparison', async (c, x) => (await import('./strategies.js')).comparison(c, x)],
    ['understanding', 'Understanding', async (c, x) => (await import('./strategies.js')).understanding(c, x)],
    ['prayer', 'Prayer', async (c, x) => (await import('./prayer-shelf.js')).prayerShelf(x)],
    ['guidance', 'Current Guidance', async (c, x) => (await import('./guidance.js')).currentGuidance(x)],
    ['reference', 'Scripture Reference', async (c, x) => (await import('./scripture-ref.js')).scriptureReference(x)],
    ['compilation', 'Compilation', async (c, x) => (await import('./strategies.js')).compilation(c, x)]]
    .map(([name, label, fn]) => ({ name, label, kind: 'strategy', internal: true, process: true, purpose: `The ${label.toLowerCase()} answer strategy (Jev chooses it).`, run: fn })),
  // Jev's depth = deep_report: queue deep research as a job (the deep-research worker), return { researchId, status } at once
  { name: 'deep_report', label: 'Deep Report', kind: 'strategy', internal: true, process: true, purpose: 'Queue a deep-research report as a job (Jev chooses the depth).',
    run: async (input, ctx) => (await import('./deep-report.js')).startDeepReport(input, ctx) },
];

export const REGISTRY = Object.freeze(Object.fromEntries(ENTRIES.map((e) => [e.name, Object.freeze(e)])));
export const PROCESS = Object.freeze(Object.fromEntries(PROCESS_ENTRIES.map((e) => [e.name, Object.freeze(e)])));
export const canonical = (name) => (Object.hasOwn(REGISTRY, name) || Object.hasOwn(PROCESS, name) ? name : null);
export const resolve = (name) => REGISTRY[name] || PROCESS[name] || null;
export const label = (name) => resolve(name)?.label || null;
/** The contract tools (the API + the tools page), canonical names. */
export const publicNames = () => ENTRIES.map((e) => e.name);
export const list = () => ENTRIES.map(({ name, label: l, kind, purpose, cost }) => ({ name, label: l, kind, purpose, cost }));

// CTAI answers cached locally (a concordance changes rarely): term → study, 1 h
const CTAI_TTL = 3600e3, ctaiMem = new Map();
async function ctaiCached(ctx, term) {
  const hit = ctaiMem.get(term);
  if (hit && Date.now() - hit.at < CTAI_TTL && !ctx?.deps?.ctaiTerm) return hit.s;
  const s = await (await dep(ctx, 'ctaiTerm', 'ctai'))(term);
  if (s?.passages?.length && !ctx?.deps?.ctaiTerm) ctaiMem.set(term, { at: Date.now(), s });
  return s;
}

/** The first REQUIRED string input (query, title, english…) that is missing or blank, else null: such a call is refused,
 *  never run — an empty search returns nothing and reads as a library gap. Pure. */
export function emptyRequired(e, input = {}) {
  if (e?.kind !== 'tool') return null;   // strategies take Jev's choice, which may legitimately carry no words
  const props = e?.input?.properties || {};
  for (const k of e?.input?.required || []) {
    const t = props[k]?.type;
    if ((t === 'string' || (Array.isArray(t) && t.includes('string') && !t.includes('integer'))) && !String(input?.[k] ?? '').trim()) return k;
  }
  return null;
}

const ajv = new Ajv({ strict: false });
const validators = new Map();
const validator = (e) => validators.get(e.name) || (validators.set(e.name, ajv.compile(plainSchema(e.input))), validators.get(e.name));

/** run(name, input, ctx) → the tool's plain JSON, or a thrown ToolError { code, message, retryable }: unknown_tool, empty_input,
 *  invalid_input (the input does not match the schema), timeout, unavailable, rights_unavailable, tool_failed. Never a silent empty. */
export async function run(name, input = {}, ctx = {}) {
  const e = resolve(name);
  if (!e) throw new ToolError('unknown_tool', `unknown tool: ${name}`, false);
  const blank = emptyRequired(e, input);
  if (blank) throw new ToolError('empty_input', `${e.name}: "${blank}" is empty — give the words to search for`, false);
  if (REGISTRY[e.name] && e.input) { const v = validator(e); if (!v(input)) throw new ToolError('invalid_input', `${e.name}: ${ajv.errorsText(v.errors, { dataVar: 'input' })}`, false); }
  // every search the tool makes is traced with its name (search_trace.tool) — ambient, AsyncLocalStorage (ai-context.js)
  const trace = currentAIContext().trace || {}, t0 = performance.now();
  // each call's wall time → tool_runs (strategy-stats-repo; buffered, off the reply path) — the tools page's live numbers
  const done = (ok) => { const ms = performance.now() - t0; stats().then((m) => m.logToolRun({ tool: e.name, ms, ok, turnId: trace.turn ?? null })).catch(() => {}); };
  try {
    const out = await withAIContext({ trace: { ...trace, tool: e.name } }, () => e.run(input, ctx));
    done(true);
    return out;
  } catch (err) { done(false); throw toToolError(err); }
}
let statsMod = null;
const stats = () => (statsMod ||= import('../repos/strategy-stats-repo.js'));
/** A Qdrant search tool's raw layer function (what sourceHunt takes as deps.phrases / deps.keyword). */
export async function layerFn(name, ctx = {}) {
  const e = resolve(name);
  if (!e?.layer) throw new Error(`${name} is not a layer search`);
  return layerDep(ctx, e.layer);
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
