// Anís TOOL REGISTRY (Chad 11-09: a tool is pure JSON in → JSON out, fast, no LLM; the registry IS the API at /api/v1/tools).
// REGISTRY = the contract tools (strict input schema, output schema, cost, one error shape {error:{code,message,retryable}}).
// PROCESS = non-contract tools that may call a model or are Jev's own (web_search, strategy executors): never on the API. (The old planner search lives only in combined-search.js, the respond@3 rollback.)
// `_search` takes words → ranked, deduped passages; `_lookup` takes one known passage/work/word → facts. run(name, input, ctx); ctx.deps overrides (tests).
// The CATALOG is data (repos/anis-tools-repo.js, Chad 11-10): HTTP tools registered at runtime join REGISTRY's code tools in resolve()/run()/
// list()/llmTools() without a restart; a row's 'disabled' status refuses either kind. Store unreachable → the code tools alone.

import Ajv from 'ajv';
import { CANON } from './work-canon.js';
import { canonicalTradition, RELIGIONS } from './tradition-name.js';
import { DOCTRINAL_KEYS } from '../search/doctrinal-rank.js';
import { currentAIContext, withAIContext } from '../ai-context.js';
import { FILTERS, PASSAGE, WORK, ERROR, SCHEMAS, PASSAGES, str, LIMIT, PID, nul, engineFilters, translationLabel, letterVariants, toPassage, dedupePassages, plainSchema, dep, layerDep, MOD } from './tool-kit.js';
import { ToolError, toToolError } from './tool-error.js';
import { catalog as toolCatalog } from '../repos/anis-tools-repo.js';
import { runHttpTool } from './http-tool.js';
export { FILTERS, PASSAGE, WORK, ERROR, SCHEMAS, engineFilters, translationLabel, letterVariants, toPassage, dedupePassages };

// another tradition than the Bahá'í: original_lookup / translation_lookup go to its work family (editions.js)
const otherTradition = (t) => !!t && canonicalTradition(t) !== "Baha'i";
/** words → the library's passage holding them (phrase vectors, in the tradition when named) → its editions. Never a translation. */
async function viaEditions(words, tradition, want, ctx) {
  const hit = (await run('phrase_search', { query: String(words).slice(0, 600), limit: 3, ...(tradition ? { filters: { tradition: canonicalTradition(tradition) } } : {}) }, ctx))?.passages?.[0];
  if (!hit?.id || !Number.isFinite(Number(hit.id))) return { passages: [] };
  const r = await (ctx?.deps?.editionsOf || (await import('./editions.js')).editionsOf)(Number(hit.id), { want }, ctx?.deps?.editions || {});
  return { passages: dedupePassages([toPassage(hit), ...(r.passages || []).map((x) => ({ ...toPassage(x), role: x.role }))]) };
}
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`ʻʼ]/g, "'").toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
/** The canon entry a reader's title names (any alias, accents and "the" ignored), or null. */
export function canonWork(title, canon = CANON) {
  const q = fold(title).replace(/^the /, '');
  if (!q) return null;
  return canon.find((w) => [w.title, ...(w.aliases || [])].some((a) => fold(a).replace(/^the /, '') === q))
    || canon.find((w) => [w.title, ...(w.aliases || [])].some((a) => { const f = fold(a).replace(/^the /, ''); return f.length > 5 && (q.includes(f) || f.includes(q)); })) || null;
}
// folded token run: "Saint Augustine of Hippo" → ['saint','augustine','of','hippo'] (apostrophes dropped, so Bahá'u'lláh is one token)
const toks = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** The library authors whose name CONTAINS the person's name as a whole token run (augustine ⊂ Augustine of Hippo; ali ⊄ Baha'ali), exact first, then by documents. Pure. */
export function matchAuthors(name, rows, cap = 12) {
  const q = toks(name), k = q.join('');
  if (!q.length) return [];
  const hit = (a) => { const t = toks(a); for (let i = 0; i + q.length <= t.length; i++) if (q.every((w, j) => t[i + j] === w)) return true; return false; };
  return (rows || []).filter((r) => hit(r.author)).map((r) => ({ author: r.author, key: toks(r.author).join(''), docs: r.n ?? 0 }))
    .sort((a, b) => (b.key === k) - (a.key === k) || b.docs - a.docs).slice(0, cap);
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
  const authority = filters?.authority?.length ? new Set(filters.authority) : null;
  // kinds known from the WRITER are filtered in the engine, before ranking: a history shelf post-filtered from 18 generic hits
  // got only Writings, so The Dawn-Breakers never reached "how was the Báb martyred?" (11-10)
  const notAuthor = authority ? Object.entries(WRITERS_OF_KIND).filter(([k]) => !authority.has(k)).flatMap(([, keys]) => keys) : [];
  if (notAuthor.length && f.author == null && f.documentId == null) f.notAuthor = notAuthor;
  return { f, authority };
}
// the authority kinds a passage has by its writer alone (source-tier.js): their author_fold keys
const WRITERS_OF_KIND = { scripture: ['bahaullah', 'thebab', 'bab', 'abdulbaha'], interpretation: ['shoghieffendi'] };
// over-fetch when an authority post-filter will thin the list
const want = (limit, authority) => (authority ? limit * 3 : limit);
// one work holds at most a third of a shelf no single work was asked for (11-10: five Star of the West volumes took the history shelf for "how was the Báb
// martyred?" and pushed The Dawn-Breakers past the cut); the overflow refills the tail, so a search never returns fewer than before
const perWork = (list, limit) => {
  const cap = Math.max(2, Math.ceil(limit / 3)), n = new Map(), keep = [], over = [];
  for (const p of list) { const w = String(p.title || p.document_id || '').toLowerCase().trim(), c = n.get(w) ?? 0; n.set(w, c + 1); (c < cap ? keep : over).push(p); }
  return [...keep, ...over];
};
const finish = (list, limit, authority, f = {}) => {
  const kept = dedupePassages(list).filter((p) => !authority || authority.has(p.authority));
  return (f.documentId == null && f.work == null ? perWork(kept, limit) : kept).slice(0, limit);
};

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
  return { passages: finish(await layerRows(fnName, query, want(limit, authority), f, ctx), limit, authority, f) };
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
/** The originals index holds the Bahá'í Persian/Arabic Writings ONLY: a scope on another tradition keeps the layer OUT — it never swaps the tradition for Bahá'í. */
const originalsOut = (f = {}) => !!f.religion && canonicalTradition(f.religion) !== "Baha'i";
const NO_ORIGINALS = (f) => `no originals index for ${canonicalTradition(f.religion)}: the originals layer holds the Bahá'í Persian/Arabic Writings only`;
const FUSED_DESC = 'Search the library (primary texts in English, and in their original Arabic/Persian for the Bahá’í Writings only, authorised interpretation, history, scholarship), every layer fused on the query as written: no planner, no LLM. Phrase the query in the words the texts themselves would use; narrow with filters (author, work, authority, tradition, years, language) and pick layers to run only some.';
const RENDER = { type: 'array', items: { type: 'object', properties: { en: { type: 'string' }, count: { type: 'integer' } } } };
const LAYERS = { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: ['literal', 'phrase', 'hype', 'originals'] },
  description: 'Run only these layers and merge them (literal = exact words, no embedding; phrase = meaning of a phrase; hype = questions answered; originals = the Bahá’í Persian/Arabic Writings ONLY — skipped when the tradition is another). Omit = every layer fused.' };
const DROPS = { work: ['work', 'documentId'], author: ['author', 'writerOnly'], collection: ['collection'], tradition: ['tradition'], authority: ['authority'], years: ['yearFrom', 'yearTo'], language: ['language'] };
const TIERS = { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: Object.keys(DROPS) },
  description: 'Escalation ladder: if fewer than min_results come back, drop these filters one at a time in this order and search again; each passage says its tier (strict | relaxed:<dropped filters>). Omit = filters are hard.' };
const LAYER_FN = { literal: 'searchKeywordQdrant', phrase: 'searchPhrases', hype: 'searchHypeQdrant' };
const PERSON = { $id: 'AnisPerson', type: 'object', additionalProperties: true, required: ['name'], properties: { id: { type: ['integer', 'string', 'null'] }, name: { type: 'string' },
  evidence: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { relation: nul('string'), statement: nul('string'), source: nul('string'), paraId: { type: ['integer', 'string', 'null'] } } } } } };   // the evidence index keys paragraphs both ways (11-11: a string paraId 500'd every public biography_search)

// one fused search at one filter set: layers merged by reciprocal-rank fusion, deduped, authority-filtered
async function searchOnce(query, a, filters, ctx) {
  const { f, authority, none } = await scope(filters, ctx);
  if (none) return [];
  const limit = a.limit ?? 8, n = want(limit, authority);
  // the model names the writer; code only resolves the name (alias table). Left in the query, "where does 'Abdu'l-Bahá say
  // justice is each one's due" ranked other traditions and writers above Some Answered Questions 77 (11-05); held to Him, it is #2
  if (typeof f.author === 'string') f.author = (await import('../search-plan.js')).keywordAuthor(f.author) || f.author.trim();
  if (!a.layers) return finish(await fastRows(query, f, n, ctx), limit, authority, f);
  const lists = await Promise.all(a.layers.map(async (l) => (l === 'originals'
    ? originalsOut(f) ? [] : (await fastRows(query, { ...f, religion: "Baha'i", ...ORIGINALS_FILTER }, n, ctx)).map((p) => ({ ...p, found_by: ['originals'] }))
    : layerRows(LAYER_FN[l], query, n, f, ctx))));
  const rrf = new Map(), key = (p) => `${p.id ?? p.text}`;
  lists.forEach((l) => l.forEach((p, r) => rrf.set(key(p), (rrf.get(key(p)) || 0) + 1 / (60 + r))));
  const merged = lists.flat().sort((x, y) => rrf.get(key(y)) - rrf.get(key(x)));
  return finish(merged, limit, authority, f).map((p) => ({ ...p, score: Math.round(rrf.get(key(p)) * 10000) / 10000 }));
}

// ── the registry ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A found paragraph that ENDS by introducing what follows ("…their names are as follows:") is half an answer (11-10: "Who were the
// Letters of the Living?" found Nabíl's lead-in, the judge saw no names and the list came from the web). Its next paragraphs in the same
// section (≤ LEAD_ROWS, ≤ LEAD_CHARS) join its text. Rights unknown or encumbered: the paragraph alone (as whole_lookup). Never throws.
const LEADS_ON = /:\s*["”’']?\s*$/, LEAD_ROWS = 4, LEAD_CHARS = 1600;
export async function continueLeads(passages, ctx = {}) {
  try {
    const at = (p) => ({ doc: Number(p.document_id ?? p.doc_id), idx: Number(p.paragraph_index) });
    const leads = (passages || []).filter((p) => LEADS_ON.test(String(p.text || '')) && Number.isFinite(at(p).doc) && Number.isFinite(at(p).idx));
    if (!leads.length) return passages;
    const enc = await (await dep(ctx, 'encumberedAmong', 'rights'))([...new Set(leads.map((p) => at(p).doc))]).catch(() => null);
    if (!enc) return passages;
    const inRange = await dep(ctx, 'paragraphsInRange', 'paragraphs');
    const grown = new Map(await Promise.all(leads.filter((p) => !enc.has(at(p).doc)).map(async (p) => {
      const { doc, idx } = at(p), rows = (await inRange(doc, idx, idx + LEAD_ROWS).catch(() => [])) || [];
      const head = rows.find((r) => r.paragraph_index === idx)?.heading ?? null, add = [];
      let n = 0;
      for (const r of rows.filter((x) => x.paragraph_index > idx)) {
        const t = String(r.text || '').trim();
        if ((r.heading ?? null) !== head || n + t.length > LEAD_CHARS) break;
        add.push(t); n += t.length;
      }
      return [p, add.filter(Boolean)];
    })));
    return passages.map((p) => (grown.get(p)?.length ? { ...p, text: `${p.text}\n${grown.get(p).join('\n')}`, continued: grown.get(p).length } : p));
  } catch { return passages; }
}

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
      passages = await continueLeads(passages, ctx);
      return { passages, query_used: query, relaxed: passages.some((p) => p.tier && p.tier !== 'strict') ? dropped : [] };
    } },
  // THE find-quote tool (Chad 11-10: "'Find quote' is the tool, with filters for religion, author(s) and book(s)"): the words, literal first,
  // meaning fallback; a book in context is just works:[id] (the whole book, reading order). Pure search; the strategy shapes the answer.
  { name: 'quote_search', label: 'Quote Search', kind: 'tool', outputName: 'Passage[]', cost: C(true, 200),   // embed: only the meaning fallback
    description: 'Find the passage(s) that hold given words. Literal first (accents/case folded), then closest in meaning. Narrow with religions, authors and works (any of each list; all kinds must hold). With works given, EVERY paragraph of those works holding the words, in reading order.',
    purpose: 'Answers "find the passage that says X", "where does <author/tradition> say X", "search for X in <work>": one search type, filters from the strategy and context.',
    input: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: str('The words to find, as written (a phrase or a word)'),
      mode: { type: 'string', enum: ['literal', 'meaning', 'auto'], default: 'auto', description: 'literal = exact words only; meaning = closest in meaning only; auto = literal, then meaning when none' },
      religions: { type: 'array', items: { type: 'string' }, description: "Traditions, any of: Baha'i, Islam, Christianity…" },
      authors: { type: 'array', items: { type: 'string' }, description: 'Authors, any of (a name as written)' },
      works: { type: 'array', items: { type: ['integer', 'string'] }, description: 'Works, any of: document ids or titles' },
      language: str('The reader\'s language (ISO code): a closest-in-meaning passage in another language is shown in its linked translation'),
      from: { type: 'integer', minimum: 0, description: 'A section of the work: first paragraph_index' }, to: { type: 'integer', minimum: 0, description: 'A section: last paragraph_index' },
      limit: LIMIT(20, 1000) } },
    output: { type: 'object', required: ['total', 'passages', 'mode_used'], properties: { total: { type: 'integer', description: 'Every literal occurrence (passages may list fewer: limit)' },
      passages: { type: 'array', items: PASSAGE }, mode_used: { type: 'string', enum: ['literal', 'meaning', 'none'] },
      works: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, title: nul('string'), author: nul('string') } }, description: 'The works searched (when works were given)' } } },
    llmOmit: ['limit', 'from', 'to'],
    example: { input: { query: 'private property', works: [21310] }, output: { total: 1, mode_used: 'literal', works: [{ id: 21310, title: 'God Passes By', author: 'Shoghi Effendi' }],
      passages: [{ ...P_EX, id: 868, document_id: 21310, doc_id: 21310, para_id: 868, work: 'God Passes By', paragraph_index: 867, title: 'God Passes By', author: 'Shoghi Effendi', place: '#868', found_by: ['in_work'],
        text: '… on the institution of private property …', excerpt: '… on the institution of **private property** …' }] } },
    async run(a, ctx = {}) {
      const { quoteSearch } = await import('./quote-search.js');
      return quoteSearch(a, ctx, (x) => run('fused_search', x, ctx));
    } },
  // ONE call for a comparison: the same query held to each side's filters, per-side results deduped; the understanding judge runs once at tree level
  { name: 'compare_search', label: 'Compare Search', kind: 'tool', outputName: 'Side[]', cost: C(true, 400),
    description: 'Search the same question inside each side of a comparison (a tradition, an author, a work…) in one call; results come back per side, each deduped.',
    purpose: 'Replaces a per-side search loop: one merged query per side, returned side by side (a side with no hits is an empty side, not an error).',
    input: { type: 'object', additionalProperties: false, required: ['query', 'sides'], properties: { query: str('The question, as written'),
      sides: { type: 'array', minItems: 2, maxItems: RELIGIONS.length, items: { type: 'object', additionalProperties: false, required: ['label', 'filters'], properties: { label: str('The side’s name, e.g. Islam'), filters: FILTERS } } },
      k: { type: 'integer', minimum: 1, maximum: 10, default: 3, description: 'Passages kept per side' }, layers: LAYERS, tiers: TIERS } },
    output: { type: 'object', required: ['sides'], properties: { sides: { type: 'array', items: { type: 'object', required: ['label', 'passages'], properties: { label: { type: 'string' }, passages: { type: 'array', items: PASSAGE }, relaxed: { type: 'array', items: { type: 'string' } } } } } } },
    example: { input: { query: 'forgiveness', sides: [{ label: 'Islam', filters: { tradition: 'Islam' } }, { label: 'Christianity', filters: { tradition: 'Christianity' } }], k: 3 }, output: { sides: [{ label: 'Islam', passages: [{ ...P_EX, found_by: ['literal'] }], relaxed: [] }, { label: 'Christianity', passages: [], relaxed: [] }] } },
    async run(a, ctx = {}) {
      const k = a.k ?? 3, sides = await Promise.all(a.sides.map(async (s) => {
        const r = await run('fused_search', { query: a.query, limit: k, filters: s.filters, ...(a.layers ? { layers: a.layers } : {}), ...(a.tiers ? { tiers: a.tiers } : {}) }, ctx);
        return { label: s.label, passages: r.passages.map((p) => ({ ...p, side: s.label })), relaxed: r.relaxed };
      }));
      return { sides };
    } },
  // a numbered scripture reference → the verse(s): code only (scripture-ref.js parse + the library's chapter/verse layout)
  { name: 'reference_lookup', label: 'Reference Lookup', kind: 'tool', outputName: 'Reference', cost: C(false, 150),
    description: 'Read a numbered scripture reference (Bible "John 3:16", Qur’án "2:255", Bhagavad Gita "2:47") and return exactly those verses.',
    purpose: 'Chapter-and-verse to the passage, deterministically; no passage and ref null when the text is not a reference or the book is not in the library.',
    input: { type: 'object', additionalProperties: false, required: ['ref'], properties: { ref: str('The reference, e.g. "John 3:16" or "Qur’án 2:255"') } },
    output: { type: 'object', required: ['passages', 'ref'], properties: { passages: { type: 'array', items: PASSAGE }, ref: { oneOf: [{ type: 'null' }, { type: 'object', required: ['kind', 'label'], properties: { kind: { type: 'string' }, label: { type: 'string' } } }] }, exact: { type: 'boolean' } } },
    example: { input: { ref: 'John 3:16' }, output: { passages: [{ ...P_EX }], ref: { kind: 'bible', label: 'John 3:16' }, exact: true } },
    async run(a, ctx = {}) {
      const { parseScriptureRef, scriptureReference } = await import('./scripture-ref.js');
      const ref = parseScriptureRef(a.ref);
      if (!ref) return { passages: [], ref: null, exact: false };
      const r = await scriptureReference({ question: a.ref, deps: ctx.deps || {} });
      return { passages: (r?.passages || []).map(toPassage), ref: { kind: ref.kind, label: ref.label }, exact: !!r?.plan?.exact };
    } },
  // the Badí‘ (Bahá’í) calendar date of a civil date: pure arithmetic (Naw-Rúz = March 21 before 172 B.E.; from 172 B.E. the Tehran equinox rule)
  { name: 'badi_calendar', label: 'Badí‘ Calendar', kind: 'tool', outputName: 'BadiDate', cost: C(false, 1),
    description: 'Convert a civil date (YYYY-MM-DD) to its Badí‘ date: year (B.E.), month, day, Ayyám-i-Há. The Badí‘ day begins at the previous sunset; the date given is the civil daytime.',
    purpose: 'Calendar arithmetic only. Holy-day names are not returned (the table is not verified here); Naw-Rúz is flagged.',
    input: { type: 'object', additionalProperties: false, required: ['date'], properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Civil date, YYYY-MM-DD (1844 or later)' } } },
    output: { type: 'object', required: ['year', 'month', 'month_name', 'day', 'naw_ruz'], properties: { year: { type: 'integer' }, month: { type: 'integer', description: '1-19; 0 = Ayyám-i-Há' }, month_name: { type: 'string' }, day: { type: 'integer' }, naw_ruz: { type: 'boolean' }, naw_ruz_date: { type: 'string' } } },
    example: { input: { date: '2025-03-20' }, output: { year: 182, month: 1, month_name: 'Bahá', day: 1, naw_ruz: true, naw_ruz_date: '2025-03-20' } },
    async run(a) { return (await import('./badi-calendar.js')).badiDate(a.date); } },
  // a PRAYER of any tradition (Chad 11-09): prayer-ness is a property of the passage (it addresses God / is used in devotion), never of one book's
  // headings. Which tradition is a unit (scope / named work / site default), never read here from words. prayer-find.js does the work.
  { name: 'prayer_lookup', label: 'Prayer Lookup', kind: 'tool', outputName: 'Prayers', cost: C(true, 600),
    description: 'Candidate prayers of a tradition (any tradition in the library), scripture included (Psalms, the Qur’án’s du‘ás, the Japji, the Gayatri, the Ashem Vohu, the Lord’s Prayer): by NAME or opening words (incipit), or by the NEED a prayer answers. Each candidate carries its work, tradition and opening text, best first; read one whole with whole_lookup. No tradition = each tradition searched, kept only where it really has hits.',
    purpose: 'A name or incipit → literal and phrase search (and meaning, for a name) across the tradition’s whole scope; a need → meaning search (hype + phrase) in the tradition plus inside its prayer works. Headings, titles and prayer works only rank (with the tradition’s own authority, core first); they never decide. Deterministic.',
    input: { type: 'object', additionalProperties: false, required: [], properties: { tradition: str('The tradition whose prayers (Christian, Islam, Judaism, Hindu, Buddhist, Baha\'i, Sikh, Zoroastrian…); omit for several traditions', 60),
      need: str('What the prayer is for (healing, forgiveness, the departed, a journey…)', 200), name: str('The prayer’s name (the Lord’s Prayer, the Gayatri, Ashem Vohu…)', 200), incipit: str('The prayer’s opening words', 300),
      work: str('A named work to search inside as well (its tradition is used when none is given)', 200), lang: str('Language (ISO code; default any)', 8),
      list: { type: 'boolean', description: 'true = the tradition’s prayer works only (no passages)' } } },
    output: { type: 'object', required: ['passages', 'searched'], properties: { passages: { type: 'array', items: PASSAGE, description: 'Candidates, best first: each with work, tradition, opening, signals' },
      tradition: nul('string'), traditions: { type: 'array', items: { type: 'object', properties: { tradition: { type: 'string' }, count: { type: 'integer' } } }, description: 'Traditions with real hits' },
      works: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' }, tradition: { type: 'string' } } }, description: 'The prayer works searched inside' },
      searched: { type: 'array', items: { type: 'object', properties: { tradition: { type: 'string' }, how: { type: 'array', items: { type: 'string' } }, works: { type: 'array', items: { type: 'string' } }, found: { type: 'integer' } } }, description: 'What was searched, per tradition (the honest absence)' } } },
    example: { input: { tradition: 'Christian', name: "the Lord's Prayer" }, output: { passages: [{ ...P_EX, text: 'After this manner therefore pray ye: Our Father which art in heaven, Hallowed be thy name.', title: 'King James Bible', religion: 'Christian', work: 'King James Bible', tradition: 'Christian', opening: 'After this manner therefore pray ye: Our Father which art in heaven, Hallowed be thy name.', signals: ['addresses God'] }], tradition: 'Christian', traditions: [{ tradition: 'Christian', count: 1 }], works: [], searched: [{ tradition: 'Christian', how: ['the name "the Lord\'s Prayer" (literal, phrase, meaning) across Christian'], works: [], found: 1 }] } },
    async run(a, ctx = {}) {
      if (!a.need && !a.name && !a.incipit && !a.list) throw new ToolError('invalid_input', 'give need, name, incipit or list', false);
      const { findPrayers } = await import('./prayer-find.js');
      const { prayerWorksOf, prayerWorksAcross } = await import('./prayer-works.js');
      const findDocuments = await dep(ctx, 'findDocuments', 'docs');
      const workDoc = a.work ? (await REGISTRY.document_search.run({ title: a.work, min: 0.9 }, ctx).catch(() => null))?.works?.[0] ?? null : null;
      const tradition = a.tradition ? canonicalTradition(a.tradition) : workDoc?.religion ? canonicalTradition(workDoc.religion) : null;
      if (a.list) {
        const works = tradition ? await prayerWorksOf(tradition, { findDocuments, language: a.lang || null }) : await prayerWorksAcross({ findDocuments }, { language: a.lang || null });
        return { passages: [], tradition, works: works.map((w) => ({ id: w.id, title: w.title, tradition: w.tradition || tradition })), searched: [] };
      }
      const search = (layer, input) => REGISTRY[layer].run(input, ctx);
      const r = await findPrayers({ ...a, tradition, workDoc }, { search, findDocuments, paragraphsInRange: await dep(ctx, 'paragraphsInRange', 'paragraphs') });
      const linked = await (await dep(ctx, 'withLinks', 'links'))(r.candidates.map((c) => ({ id: c.id, doc_id: c.document_id, paragraph_index: c.paragraph_index, text: c.text, title: c.title }))).catch(() => []);
      const passages = r.candidates.map((c, i) => ({ ...toPassage({ ...c, source_url: c.source_url || linked[i]?.url || null }), work: c.work, tradition: c.tradition, opening: c.opening, signals: c.signals, ...(c.heading ? { heading: c.heading } : {}) }));
      return { passages, tradition: r.tradition, traditions: r.traditions, works: r.works.map((w) => ({ id: w.id, title: w.title, tradition: w.tradition || tradition })), searched: r.searched };
    } },
  // the WHOLE prayer around one found paragraph (attribution run, a short section, else contiguous address); a copyrighted book: the paragraph alone
  { name: 'whole_lookup', label: 'Whole Prayer Lookup', kind: 'tool', refInput: true, outputName: 'Whole prayer', cost: C(false, 40),
    purpose: 'Extends one paragraph to the whole prayer or devotional unit holding it: an attribution-closed run, a short section, else the contiguous paragraphs that address God. Never for a copyrighted book.',
    description: 'Read the whole prayer that a found passage (its ref) belongs to — every paragraph, nothing shortened.',
    input: { type: 'object', additionalProperties: false, required: ['document_id', 'paragraph_index'], properties: { document_id: { type: 'integer' }, paragraph_index: { type: 'integer', minimum: 0 } } },
    output: { type: 'object', required: ['passages', 'copyright', 'bound'], properties: { passages: { type: 'array', items: PASSAGE },
      copyright: { type: 'boolean', description: 'true = a copyrighted book: only the paragraph itself is given' }, bound: { type: 'string', description: 'attribution | section | contiguous | paragraph | copyright | unread' } } },
    example: { input: { document_id: 12, paragraph_index: 4 }, output: { passages: [P_EX, { ...P_EX, paragraph_index: 5 }], copyright: false, bound: 'attribution' } },
    async run(a, ctx) {
      const docId = Number(a.document_id), idx = Number(a.paragraph_index) || 0;
      // a rights check that cannot be made fails CLOSED: the paragraph alone (it was already found and quotable as a hit), never its neighbours
      const enc = await (await dep(ctx, 'encumberedAmong', 'rights'))([docId]).catch(() => null);
      const { wholePrayer } = await import('./prayer-find.js');
      const inRange = await dep(ctx, 'paragraphsInRange', 'paragraphs');
      const got = !enc || enc.has(docId) ? { rows: ((await inRange(docId, idx, idx).catch(() => [])) || []).filter((r) => r.paragraph_index === idx), bound: 'copyright' }
        : await wholePrayer({ document_id: docId, paragraph_index: idx }, { paragraphsInRange: inRange, sectionsOfDoc: await dep(ctx, 'sectionsOfDoc', 'sections') });
      const meta = ctx?.meta || (await (await dep(ctx, 'getLinkMeta', 'docs'))([docId]).catch(() => new Map())).get(docId) || {};
      const linked = await (await dep(ctx, 'withLinks', 'links'))(got.rows.map((r) => ({ id: r.id, doc_id: docId, paragraph_index: r.paragraph_index, text: r.text, title: meta.title }))).catch(() => []);
      return { passages: got.rows.map((r, i) => toPassage({ ...r, title: meta.title, author: meta.author, religion: meta.religion, collection: meta.collection, year: meta.year, document_id: docId, source_url: linked[i]?.url || null })),
        copyright: got.bound === 'copyright', bound: got.bound };
    } },
  // the Writings in their ORIGINAL languages (11-04, measured: an English query's fused ranking puts no Persian/Arabic Writing in
  // its top 8 — English-English phrase matches fill it — while the same query held to the ar-fa group returns 22-29 originals of 30)
  { name: 'originals_search', label: 'Originals Search', kind: 'tool', outputName: 'Passage[]', cost: C(true, 250),
    description: "Bahá'í Persian/Arabic originals ONLY (no other tradition has an originals index here; another tradition's filter returns an empty list with `unavailable`). Search the Writings of the Báb, Bahá'u'lláh, 'Abdu'l-Bahá and Shoghi Effendi in their ORIGINAL Persian and Arabic. Words in English (the phrase layer matches across languages) or in Persian/Arabic. A hit with no linked translation is the original alone.",
    purpose: 'The fast engine held to the doctrinal writers and the Arabic/Persian language group: the originals an English search ranks out.',
    input: SEARCH_INPUT(), output: PASSAGES, llmOmit: ['limit', 'filters'],
    example: { input: { query: 'kings increase their expenditures and lay the burden on their subjects' }, output: { passages: [{ ...P_EX, id: 88, language: 'ar', text: 'يا معشر الملوك…' }] } },
    async run(a, ctx = {}) {
      const { f, authority, none } = await scope(a.filters, ctx);
      if (none) return { passages: [] };
      if (originalsOut(f)) return { passages: [], unavailable: NO_ORIGINALS(f) };
      const limit = a.limit ?? 6;
      return { passages: finish(await fastRows(a.query, { ...f, religion: "Baha'i", ...ORIGINALS_FILTER }, want(limit, authority), ctx), limit, authority) };
    } },
  { name: 'biography_search', label: 'Biography Search', kind: 'tool', outputName: 'Person[]', cost: C(false, 150),
    purpose: 'People search: who did, met or wrote something, each person with the cited evidence (deterministic: the evidence index, no model).',
    input: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: str('A question about people, e.g. "who met Bahá’u’lláh in Baghdad"') } },
    output: { type: 'object', required: ['people'], properties: { people: { type: 'array', items: PERSON } } },
    example: { input: { query: 'who met Bahá’u’lláh in Baghdad' }, output: { people: [{ id: 42, name: 'Nabíl-i-Aʻẓam', evidence: [] }] } },
    run: async (a, ctx) => ({ people: (await (await dep(ctx, 'peopleSearch', 'people'))(a.query, { judge: false }))?.people || [] }) },
  { name: 'biography_lookup', label: 'Biography Lookup', kind: 'tool', outputName: 'PersonReport', cost: C(false, 60),
    purpose: 'One named person’s pre-researched biography: portrait, life dates, family, the life timeline and cited facts (deterministic: the person index, no model).',
    description: 'A PERSON by name (or id) → their biography report: aliases, summary, portrait (when there is one), dates, kinship, the built life timeline (events, relationships, journeys) and cited facts, each with its book, paragraph and link. Other bearers of the name come back as others. For "who did X" questions use biography_search.',
    input: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: str('The person’s name, any spelling (e.g. "Quddús"), or their id from biography_search', 200) } },
    output: { type: 'object', required: ['found', 'person', 'others'], properties: { found: { type: 'boolean' },
      person: { type: ['object', 'null'], additionalProperties: true, properties: { id: { type: ['integer', 'string'] }, name: { type: 'string' }, portrait: nul('string') } },
      others: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { id: { type: ['integer', 'string'] }, name: { type: 'string' } } } } } },
    example: { input: { name: 'Quddús' }, output: { found: true, person: { id: 1247552, name: 'Quddús', portrait: 'https://…/1247552.jpg' }, others: [] } },
    run: async (a, ctx) => (await dep(ctx, 'personReport', 'preport'))(/^\d+$/.test(String(a.name).trim()) ? { id: a.name } : { name: a.name }) },
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
      const workUrl = await dep(ctx, 'workUrl', 'srcl'), all = [w.doc, ...(w.others || [])];
      // the online publisher wins here as for a passage (the doc row lacks `metadata`, where the publisher's address lives)
      const links = ctx?.deps?.workUrl ? null : await (await import('../hit-links.js')).workLinks(all).catch(() => null);
      return { works: all.map((x) => ({ ...x, url: links?.get(x.id) ?? workUrl(x) })) };
    } },
  { name: 'original_lookup', label: 'Original Lookup', kind: 'tool', outputName: 'Passage[]', cost: C(true, 300),
    purpose: 'The Arabic/Persian original of an English passage, then the authorised translations linked to it.',
    description: 'The original-language (Arabic/Persian) text of an English passage, and the authorised translations linked to that original. Give the English words (a sentence or two).',
    input: { type: 'object', additionalProperties: false, required: ['english'], properties: { english: str('The English words (a sentence or two)'), tradition: { ...nul('string'), description: 'Another tradition than the Bahá’í: its own work family is used (editions aligned by verse/section, else meaning)' } } }, output: PASSAGES,
    example: { input: { english: 'The earth is but one country' }, output: { passages: [{ ...P_EX, id: 88, language: 'ar', text: 'ليس الفخر لمن يحب الوطن' }, P_EX] } },
    async run(a, ctx) {
      if (otherTradition(a.tradition)) return viaEditions(a.english, a.tradition, 'original', ctx);   // the Bahá'í pairing below is one provider
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
    input: { type: 'object', additionalProperties: false, required: ['original'], properties: { original: str('The original text (a line or more, Arabic script)', 20000), tradition: { ...nul('string'), description: 'Another tradition than the Bahá’í: its own work family is used (editions aligned by verse/section, else meaning)' } } }, output: PASSAGES,
    example: { input: { original: 'الهی الهی' }, output: { passages: [{ ...P_EX, language: 'fa', text: 'الهی الهی …' }, { ...P_EX, translation: 'provisional — Stephen Phelps (public domain)' }] } },
    // an original → the library's copy of it (verbatim, either spelling of ی/ک) → the English linked to it: aligned
    // translation paragraphs and the English stored beside the original (CTAI side-by-side, Phelps)
    async run({ original, tradition = null }, ctx) {
      if (otherTradition(tradition) || !/[؀-ۿ]/.test(original)) return viaEditions(original, tradition, 'translations', ctx);   // Hebrew, Chinese, Sanskrit… or another tradition: its work family
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
  { name: 'author_lookup', label: 'Author Lookup', kind: 'tool', outputName: 'Authors', cost: C(false, 5),
    purpose: 'The library’s author strings for a person’s name (Augustine → Augustine of Hippo, Saint Augustine).',
    description: "The library's own author names for a person a reader names (any spelling variant): use them as the author filter of a search so the person's works are found under whatever name the library holds them.",
    input: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: str('The person, as named', 200) } },
    output: { type: 'object', required: ['authors'], properties: { authors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['author', 'key', 'docs'], properties: { author: { type: 'string' }, key: { type: 'string' }, docs: { type: 'integer' } } } } } },
    example: { input: { name: 'Augustine' }, output: { authors: [{ author: 'Augustine of Hippo', key: 'augustineofhippo', docs: 4 }] } },
    async run({ name }, ctx = {}) { return { authors: matchAuthors(name, await (await dep(ctx, 'distinctAuthors', 'docs'))()) }; } },
  // a signpost's recorded quote links, else a pure fused_search held to the standings a signpost quotes (SIGNPOST_SOURCES): no planner, no model
  { name: 'source_trace', label: 'Source Trace', kind: 'tool', refInput: true, outputName: 'Passage[]', cost: C(true, 300),
    purpose: 'The primary passages a signpost (a House letter, a scholar, a compilation) quotes or rests on.',
    description: "A House of Justice letter, a scholar or a compilation stating a teaching is a SIGNPOST (Chad 10-19: when they refer to the teachings there is a presumption they mean something specific — we hold it): give its ref (e.g. P4) and get the primary passages it quotes or rests on — from the library's quote links, else the closest scripture and authorised interpretation of the signpost's tradition (default Bahá'í: Bahá'u'lláh, the Báb, 'Abdu'l-Bahá, Shoghi Effendi; pass `tradition` for another). Cite THOSE.",
    input: { type: 'object', additionalProperties: false, required: ['text'], properties: { paragraph_id: PID, text: str('The signpost passage text', 20000), tradition: { ...nul('string'), description: 'The signpost’s own tradition for the fallback search (default Bahá’í — name another, e.g. Christian, when the signpost is not Bahá’í)' } } }, output: PASSAGES,
    example: { input: { paragraph_id: 50, text: 'The unity of mankind is the pivot round which all the teachings revolve.' }, output: { passages: [P_EX] } },
    async run(a, ctx) {
      const out = [];
      if (a.paragraph_id) {
        const linked = (await (await dep(ctx, 'resolveLinks', 'plinks'))([a.paragraph_id], { quotedBy: false })).get(Number(a.paragraph_id))?.sources || [];
        out.push(...linked.slice(0, 4).map(toPassage));
      }
      if (out.length < 2) out.push(...(await run('fused_search', { query: String(a.text).slice(0, 500), limit: 4, filters: { tradition: a.tradition ? canonicalTradition(a.tradition) : "Baha'i", authority: SIGNPOST_SOURCES } }, ctx)).passages);
      return { passages: dedupePassages(out).slice(0, 4) };
    } },
  // edition_lookup (11-09): a passage's other-language editions for ANY tradition — recorded links, else the work family aligned by reference, else by meaning. Never translates.
  { name: 'edition_lookup', label: 'Edition Lookup', kind: 'tool', refInput: true, outputName: 'Editions', cost: C(true, 300),
    purpose: 'A passage’s original-language edition, or its existing translations, in any tradition: recorded links, else the same work in another language aligned by verse/section, else by meaning.',
    description: "The SAME passage in the work's other editions (give its ref, e.g. P3): want 'original' = the edition in the language it was written in (the Arabic Qur'án, the Hebrew Bible, the Chinese Tao Te Ching, a Persian tablet), 'translations' = the library's other translations of it, aligned by verse or section number where both editions carry it, else by meaning. Never a new translation. missing_language names the original language the library does not hold.",
    input: { type: 'object', additionalProperties: false, required: ['paragraph_id'], properties: { paragraph_id: PID,
      paragraph_ids: { type: 'array', items: PID, description: 'More passages of the same reference (the rest of a chapter), each aligned the same way' },
      want: { type: 'string', enum: ['original', 'translations'], default: 'original', description: 'original = its original-language edition; translations = its other translations' } } },
    output: { type: 'object', required: ['passages'], properties: { passages: { type: 'array', items: PASSAGE }, self: { type: ['object', 'null'], additionalProperties: true },
      family: { type: 'array', items: { type: 'object', additionalProperties: true } }, missing_language: nul('string') } },
    example: { input: { paragraph_id: 1201, want: 'original' }, output: { passages: [{ ...P_EX, id: 88, language: 'ar', text: 'بسم الله الرحمن الرحيم', role: 'original' }], self: { id: 12, title: 'The Qur’an (Pickthall)', language: 'en', religion: 'Islam' }, family: [{ id: 40, title: 'القرآن', language: 'ar', basis: 'author' }], missing_language: null } },
    async run(a, ctx = {}) {
      const ed = ctx?.deps?.editionsOf || (await import('./editions.js')).editionsOf;
      const ids = [...new Set([a.paragraph_id, ...(a.paragraph_ids || [])].map(Number).filter(Number.isFinite))];
      const all = await Promise.all(ids.map((id) => ed(id, { want: a.want || 'original' }, ctx?.deps?.editions || {})));   // one reference's verses, in order
      const r = { ...all[0], passages: all.flatMap((x) => x.passages || []) };
      if (r.passages.length) r.missing_language = null;
      return { passages: dedupePassages((r.passages || []).map((x) => ({ ...toPassage(x), role: x.role, aligned_by: x.aligned_by, exact: x.exact, ...(x.ref ? { ref: x.ref } : {}) }))), self: r.self ?? null, family: r.family || [], missing_language: r.missing_language ?? null };
    } },
  // quotation_candidates: the sourcehunt engine with NO model — phrase + keyword layers, holds() on the wording, links; the decision is a tree node (judge.passages)
  { name: 'quotation_candidates', label: 'Quotation Candidates', kind: 'tool', outputName: 'Passage[]', cost: C(true, 900),
    purpose: 'Where a quotation may come from: the passage holding its words (source), the original tablet, works quoting it — each with a containment score; deterministic, no model.',
    description: 'Candidates for where a quotation comes from: its published source (core literature), the original-language tablet, other works quoting it; each with a score (the share of the quotation’s words the passage holds). Judging which candidate is right is the caller’s decision.',
    input: { type: 'object', additionalProperties: false, required: ['quotation'], properties: { quotation: str('The quotation as the reader gave it'),
      tradition: { ...nul('string'), description: 'The tradition the reader named (any): its own core is the source, its own-language edition the original. Absent = the whole library' } } }, output: PASSAGES,
    example: { input: { quotation: 'The earth is but one country, and mankind its citizens' },
      output: { passages: [{ ...P_EX, role: 'source', score: 1 }, { ...P_EX, id: 88, language: 'ar', text: 'ليس الفخر …', role: 'original', score: 0.9 }] } },
    async run({ quotation, tradition = null }, ctx = {}) {
      const hunt = ctx.sourceHunt || (await import(MOD.hunt)).sourceHunt;
      const { contentContainment } = await import(MOD.hunt);
      const via = (name) => async (...args) => (await layerFn(name, ctx))(...args);
      // the source must be CORE literature (Chad 11-03); a line held only by commentary has no source here. decide:null = wording only, no Jev
      const r = await hunt(quotation, { phrases: via('phrase_search'), keyword: via('literal_search'), decide: null }, { coreOnly: true, ...(tradition ? { tradition: canonicalTradition(tradition) } : {}) });
      if (r?.error) throw new ToolError('invalid_input', r.error, false);
      const sc0 = (x) => Math.round(contentContainment(quotation, x?.text || '') * 100) / 100;
      // rows the wording did not hold (cross-translation holders among them): handed on as role 'candidate' for the tree-level judge.holds
      const maybe = (r?.unsure || []).map((x) => toPassage({ text: x.text, title: x.title, author: x.author, source_url: x.url, document_id: x.documentId, role: 'candidate', score: sc0(x) }));
      if (!r?.origin) return { passages: dedupePassages(maybe) };
      const o = r.origin, t = r.tablet?.certain ? r.tablet : null, c0 = !t ? r.tablet?.candidates?.[0] : null, who = r.quoteAuthor || o.author;
      const sc = (x) => Math.round(contentContainment(quotation, x?.text || '') * 100) / 100;
      // the original's language is its document's metadata (any language the library holds); the script guess only where the doc records none
      const { langCode } = await import('./editions.js');
      const docLang = await (await dep(ctx, 'getLinkMeta', 'docs'))([t?.documentId, c0?.documentId].filter(Boolean)).catch(() => new Map());
      const orig = (x, role) => toPassage({ text: x.text, title: x.meta?.title || x.title, author: who, source_url: x.meta?.links?.oceanoflightsRange || x.rangeUrl || x.url,
        document_id: x.documentId, language: langCode(docLang.get(x.documentId)?.language || x.meta?.language) || (/[پچژگ]/.test(x.text || '') ? 'fa' : 'ar'), role, score: sc(x) });
      // another tradition's source: its original is the work family's own-language edition (editions.js), never the Bahá'í tablet guess
      const foreign = !t && !c0 && o.religion && !/^bah/i.test(o.religion) && o.id
        ? ((await (ctx?.deps?.editionsOf || (await import('./editions.js')).editionsOf)(o.id, { want: 'original', limit: 1 }, ctx?.deps?.editions || {}).catch(() => null))?.passages || []).slice(0, 2) : [];
      // another tradition's source carries its book + chapter:verse (KJV 'The Gospel of John 3:16'); read from the row's heading and verse marker
      const where = o.religion && !/^bah/i.test(o.religion) && o.id
        ? await (ctx?.deps?.referenceOf || (await import('./editions.js')).referenceOf)(o.id, ctx?.deps?.editions || {}).catch(() => null) : null;
      const ref = where?.chapter != null ? `${o.title} ${where.chapter}${where.verse ? `:${where.verse}` : ''}${where.exact ? '' : ' (approx.)'}` : null;
      return { passages: dedupePassages([{ ...toPassage({ id: o.id, text: o.text, title: o.title, author: who, religion: o.religion, source_url: o.rangeUrl || o.url, document_id: o.documentId, role: 'source', score: sc(o), ...(o.tier ? { tier: o.tier } : {}) }), ...(ref ? { ref } : {}) },
        ...(t ? [orig(t, 'original')] : c0?.text ? [orig(c0, 'possible_original')] : []), ...foreign.map((x) => toPassage({ ...x, role: 'original' })),
        ...(r.citedBy || []).slice(0, 3).map((c) => toPassage({ text: c.text || c.excerpt || `${c.title} quotes it${c.paragraphs ? ` (${c.paragraphs} paragraphs)` : ''}.`,
          title: c.title, author: c.author, source_url: c.rangeUrl || c.url, document_id: c.documentId, role: 'cited_by', score: sc(c) })), ...maybe]) };
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
// HTTP tools from the catalog, as registry-shaped entries (rebuilt when their row changes)
const httpEntries = new Map();
function httpEntry(row) {
  const hit = httpEntries.get(row.name);
  if (hit && hit.updatedAt === row.updatedAt) return hit.e;
  const e = Object.freeze({ name: row.name, label: row.label, kind: 'tool', http: true, purpose: row.purpose, description: row.description || null,
    input: row.input, output: row.output, outputName: row.outputName, example: row.example, cost: row.cost, version: row.updatedAt,
    run: (input, ctx) => runHttpTool(row, input, ctx) });
  httpEntries.set(row.name, { updatedAt: row.updatedAt, e });
  return e;
}
const catalogRows = () => { try { return toolCatalog().tools; } catch { return new Map(); } };
/** The catalog's status for a runnable tool (built | disabled), or null when the store has no code/http row (plan rows never gate a run). */
export const toolStatus = (name) => { const r = catalogRows().get(name); return r && r.executor !== 'none' ? r.status : null; };
const httpTool = (name) => { const r = catalogRows().get(name); return r?.executor === 'http' ? httpEntry(r) : null; };
const enabledHttp = () => [...catalogRows().values()].filter((r) => r.executor === 'http' && r.status === 'built').map(httpEntry);
export const canonical = (name) => (Object.hasOwn(REGISTRY, name) || Object.hasOwn(PROCESS, name) || httpTool(name) ? name : null);
export const resolve = (name) => REGISTRY[name] || PROCESS[name] || httpTool(name) || null;
export const label = (name) => resolve(name)?.label || null;
/** The contract tools (the API + the tools page), canonical names: code tools not disabled in the catalog, then enabled HTTP tools. */
export const contractEntries = () => [...ENTRIES.filter((e) => toolStatus(e.name) !== 'disabled'), ...enabledHttp()];
export const publicNames = () => contractEntries().map((e) => e.name);
export const list = () => contractEntries().map(({ name, label: l, kind, purpose, cost }) => ({ name, label: l, kind, purpose, cost }));
/** The code tools' metadata for the catalog upsert (anis-tools-repo syncCodeTools; Anís instance 0, once per deploy). */
export const codeToolMeta = () => ENTRIES.map(({ name, label: l, kind, purpose, description, input, output, outputName, example, cost }) =>
  ({ name, label: l, kind, purpose, description, input, output, outputName, example, cost }));

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
const validator = (e) => { const k = `${e.name}@${e.version ?? 0}`; return validators.get(k) || (validators.set(k, ajv.compile(plainSchema(e.input))), validators.get(k)); };

/** run(name, input, ctx) → the tool's plain JSON, or a thrown ToolError { code, message, retryable }: unknown_tool, empty_input,
 *  invalid_input (the input does not match the schema), timeout, unavailable, rights_unavailable, tool_failed. Never a silent empty. */
// what a signpost rests on: scripture, the Guardian, and a Central Figure's recorded talks (11-11: the House quotes Paris Talks; held to
// scripture+Guardian, "the mind and spirit of man advance when he is tried by suffering" traced to a diary instead)
export const SIGNPOST_SOURCES = Object.freeze(['scripture', 'interpretation', 'reported']);

export async function run(name, input = {}, ctx = {}) {
  const e = resolve(name);
  if (!e) throw new ToolError('unknown_tool', `unknown tool: ${name}`, false);
  if (toolStatus(e.name) === 'disabled') throw new ToolError('unavailable', `${e.name} is disabled`, false);
  const blank = emptyRequired(e, input);
  if (blank) throw new ToolError('empty_input', `${e.name}: "${blank}" is empty — give the words to search for`, false);
  if ((REGISTRY[e.name] || e.http) && e.input) { const v = validator(e); if (!v(input)) throw new ToolError('invalid_input', `${e.name}: ${ajv.errorsText(v.errors, { dataVar: 'input' })}`, false); }
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
