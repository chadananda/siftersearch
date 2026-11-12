// Shared kit for the Anís tools (tools.js): JSON schemas (Filters, Passage, Work, Error), the Passage shape, dedup across layers/copies/editions,
// dependency lookup. Pure except dep(). A tool takes typed JSON and returns typed JSON; none calls an LLM.
import { canonicalTradition } from './tradition-name.js';
import { sourceTier } from './source-tier.js';
import { traditionKind } from './tradition-authority.js';
import { placeOf } from '../refs/place.js';
import { titleTranslator } from '../authorship/translators.js';

export const AUTHORITY_KINDS = ['scripture', 'guardian', 'interpretation', 'guidance', 'law', 'prayer', 'history', 'scholarship', 'compilation', 'reported', 'other'];
const nul = (type) => ({ type: [type, 'null'] });
export { nul };
export const FILTERS = { $id: 'AnisToolFilters', type: 'object', additionalProperties: false, description: 'Hard filters, the same for every passage search.',
  properties: {
    tradition: { type: 'string', description: "Religion, e.g. Baha'i, Islam, Christianity" },
    collection: { type: 'string', description: 'Collection name, e.g. Core Publications' },
    author: { type: ['string', 'array'], items: { type: 'string' }, description: "Author (writer or quoted voice), e.g. Bahá'u'lláh; a list = any of them" },
    writerOnly: { type: 'boolean', default: false, description: 'The author must be the writer, not a quoted voice' },
    language: { type: 'string', description: 'ISO code, e.g. en, ar, fa' },
    documentId: { type: ['integer', 'array'], items: { type: 'integer' }, maxItems: 10, description: 'Only this document; a list = any of them' },
    work: { type: 'string', description: 'Only this work, by title in any spelling (resolved to its document)' },
    authority: { type: 'array', items: { type: 'string', enum: AUTHORITY_KINDS }, description: 'Only passages of these standings (Passage.authority), e.g. ["scripture","interpretation"]' },
    yearFrom: { type: 'integer', description: 'Documents dated from this year' },
    yearTo: { type: 'integer', description: 'Documents dated up to this year' },
  } };
const COPY = { type: 'object', additionalProperties: true, properties: { id: { type: ['integer', 'string', 'null'] }, document_id: nul('integer'), title: nul('string'), source_url: nul('string'),
  edition: nul('string'), translator: nul('string'), language: nul('string'), score: nul('number') } };
// ONE Passage everywhere — the executeSearch passage (so citations and links keep working); id = the paragraph id
export const PASSAGE = { $id: 'AnisPassage', type: 'object', additionalProperties: true, required: ['text'], properties: {
  id: { type: ['integer', 'string', 'null'], description: 'Paragraph id' }, document_id: nul('integer'), paragraph_index: nul('integer'),
  title: nul('string'), author: nul('string'), book_author: nul('string'), religion: nul('string'), collection: nul('string'), language: nul('string'),
  text: { type: 'string' }, source_url: nul('string'), link_site: nul('string'), score: nul('number'),
  authority: { ...nul('string'), enum: [...AUTHORITY_KINDS, null], description: 'The passage’s standing in ITS OWN tradition: scripture (its canon — a Bahá’í Central Figure’s text, the Qur’án, the Bible, the Gita…) · interpretation (authorised interpretation or recognised second tier — the Guardian, hadith, Talmud) · guidance (an institution’s, e.g. the House) · compilation · reported (talks, notes) · scholarship; null = unknown' },
  year: { ...nul('integer'), description: 'The document’s year' }, translator: { ...nul('string'), description: 'Who translated this text, where known' }, edition: { ...nul('string'), description: 'Which edition/copy, where known' },
  original: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: true, properties: { text: nul('string'), language: nul('string'), translit: nul('string') } }], description: 'The original-language text beside this one, where known' },
  copies: { type: 'array', items: COPY, description: 'The same text in other copies/editions/layers (deduped into this one)' },
  found_by: { type: 'array', items: { type: 'string' }, description: 'Which search layers found it' },
  tier: nul('string'), side: nul('string'),
  translation: { ...nul('string'), description: 'What kind of translation this is (authorized / published / provisional)' },
  role: { ...nul('string'), description: 'quotation_candidates: source | original | possible_original | cited_by | candidate (unjudged near match; judge.holds turns it into source, holder or near)' },
  place: { ...nul('string'), description: 'Where in the work the citation points, from locator/subdocument/para_no (refs/place.js): "#117.2", "Tablet of Ahmad, #4"' }, subdocument: nul('string'),
  locator: { ...nul('string'), description: 'Where in the work to cite it: traditional number (Gleanings #117.2, Hidden Words Arabic #5, Íqán #12) or the section heading' } } };
export const WORK = { $id: 'AnisWork', type: 'object', additionalProperties: true, required: ['id', 'title'], properties: {
  id: { type: 'integer' }, title: { type: 'string' }, author: nul('string'), religion: nul('string'), collection: nul('string'),
  match: { enum: ['title', 'close'], description: 'document_search: title = a confident title match; close = a spelling candidate to judge by author and context' },
  url: nul('string'), encumbered: { ...nul('integer'), description: '1 = copyrighted: opening pages only' } } };
export const ERROR = { $id: 'AnisToolError', type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message', 'retryable'],
  properties: { code: { type: 'string', description: 'invalid_input | empty_input | unknown_tool | timeout | unavailable | rights_unavailable | tool_failed' }, message: { type: 'string' },
    retryable: { type: 'boolean', description: 'true = the same call may succeed if repeated (timeout, overload)' } } } } };
export const SCHEMAS = { Filters: FILTERS, Passage: PASSAGE, Work: WORK, Error: ERROR };
export const PASSAGES = { type: 'object', required: ['passages'], properties: { passages: { type: 'array', items: PASSAGE } } };
export const str = (description, max = 4000) => ({ type: 'string', minLength: 1, maxLength: max, description });
export const LIMIT = (d, max = 50) => ({ type: 'integer', minimum: 1, maximum: max, default: d, description: 'How many results' });
export const PID = { type: ['integer', 'string'], description: 'Paragraph id (Passage.id)' };

// ── pure helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The shared filters → search.js filter keys (religion, collection, author, writerOnly, language, documentId, yearFrom, yearTo).
 *  `authority` (a post-filter on Passage.authority) and `work` (resolved to a documentId by the tool) are not engine keys. Pure. */
export function engineFilters(f = {}) {
  const out = {};
  if (f?.tradition) out.religion = canonicalTradition(f.tradition);
  for (const k of ['collection', 'author', 'writerOnly', 'language', 'documentId', 'yearFrom', 'yearTo']) if (f?.[k] != null && f[k] !== '' && f[k] !== false && !(Array.isArray(f[k]) && !f[k].length)) out[k] = f[k];
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

// standing (source-tier.js, from metadata only) → the kinds trees rank and filter by
const KIND = { writings: 'scripture', guardian: 'interpretation', house: 'guidance', compilation: 'compilation', reported: 'reported', secondary: 'scholarship' };
/** A passage's standing as a Passage.authority kind: Bahá’í by source-tier, every other tradition by its own canon (tradition-authority); null only when truly unknown (no religion, web). Pure. */
export const authorityKind = (p) => { try { return p.authority_kind ?? (typeof p.authority === 'string' ? p.authority : null) ?? KIND[sourceTier(p)] ?? traditionKind(p); } catch { return null; } };

/** Any hit / paragraph / link row → the Passage shape (score, link_site, role, authority, year, translator, edition, original kept when known). Pure. */
// author = the PARAGRAPH's writer; book_author = the WORK's author (a quotation keeps its writer in another's book: own-source.js)
export const toPassage = (p) => {
  const title = p.title || p.document?.title || '', rel = p.religion || p.document?.religion || null;
  const base = { id: p.id, text: p.text || '', title, author: p.author || p.document?.author || '', book_author: p.book_author || p.document?.author || null,
    source_url: p.source_url || p.readerUrl || p.url || null, document_id: p.document_id ?? p.documentId ?? p.doc_id, paragraph_index: p.paragraph_index ?? p.paragraphIndex,
    religion: rel, collection: p.collection || p.document?.collection || null, language: p.language || p.source_lang || 'en',
    translation: p.translation || (/\(provisional translation\)/i.test(title) ? translationLabel('Stephen Phelps', 'provisional-phelps') : null) };
  const kind = authorityKind({ ...p, ...base }), place = placeOf({ locator: p.locator, subdocument: p.subdocument, para_no: p.para_no ?? null });
  const year = Number(p.year ?? p.document?.year) || null, translator = p.translator ?? p.translated_by ?? titleTranslator(title) ?? null;
  const o = p.original && typeof p.original === 'object' ? p.original : null;
  return { ...base, authority: kind, year, translator, edition: p.edition ?? null,
    ...(o ? { original: { text: o.text ?? null, language: o.language ?? null, translit: o.translit ?? o.transliteration ?? null } } : {}),
    ...(p.score != null ? { score: p.score } : {}), ...(p.link?.site || p.link_site ? { link_site: p.link_site || p.link.site } : {}), ...(p.role ? { role: p.role } : {}),
    ...(p.locator ? { locator: p.locator } : {}), ...(p.subdocument ? { subdocument: p.subdocument } : {}),
    ...(place ? { place } : {}), ...(p.found_by ? { found_by: p.found_by } : {}), ...(p.tier ? { tier: p.tier } : {}), ...(p.side ? { side: p.side } : {}) };   // where in the work to cite it: 'CXVII', 'Arabic 5', a section heading (#156)
};

const RANK = ['scripture', 'guardian', 'interpretation', 'guidance', 'compilation', 'law', 'prayer', 'history', 'reported', 'scholarship', 'other'];
const stdText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`ʻʼ]/g, "'").toLowerCase().replace(/[^\p{L}\p{N}]+/g, ' ').trim();
const copyOf = (p) => ({ id: p.id ?? null, document_id: p.document_id ?? null, title: p.title ?? null, source_url: p.source_url ?? null, edition: p.edition ?? null, translator: p.translator ?? null, language: p.language ?? null, ...(p.score != null ? { score: p.score } : {}) });
/** One item per paragraph id AND per text: the same paragraph found by several layers, or the same text in another copy/edition/book,
 *  becomes ONE passage (the best-standing copy, then the first found) with `copies[]` of the others and `found_by` the layers. Order = first appearance. Pure. */
export function dedupePassages(list = []) {
  const groups = [], byId = new Map(), byText = new Map();
  for (const p of list) {
    if (!p) continue;
    const t = stdText(p.text), k = t.length >= 20 ? `${p.language || ''}|${t}` : null;
    const g = (p.id != null && byId.get(`${p.id}`)) || (k && byText.get(k));
    if (g) { g.items.push(p); if (p.id != null) byId.set(`${p.id}`, g); continue; }
    const ng = { items: [p] };
    groups.push(ng); if (p.id != null) byId.set(`${p.id}`, ng); if (k) byText.set(k, ng);
  }
  return groups.map(({ items }) => {
    if (items.length === 1) return items[0];
    const rank = (p) => { const i = RANK.indexOf(p.authority ?? 'other'); return i < 0 ? RANK.length : i; };
    const best = items.map((p, i) => [p, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])[0][0];
    const others = items.filter((p) => p !== best && !(p.id != null && p.id === best.id));
    const found = [...new Set(items.flatMap((p) => p.found_by || []))];
    return { ...best, ...(found.length ? { found_by: found } : {}), ...(others.length ? { copies: [...(best.copies || []), ...others.map(copyOf)] } : {}) };
  });
}

// a dependency: the caller's override (ctx.deps — tests), else the live module's export
export const MOD = { layers: '../search/qdrant-layers.js', paragraphs: '../paragraphs-repo.js', links: '../hit-links.js', chat: '../../routes/chat.js',
  plinks: '../passage-links.js', people: '../people-search.js', preport: '../person-report.js', works: './work-request.js', web: '../perplexity.js', ctai: './ctai-term.js',
  docs: '../docs-repo.js', search: '../search.js', hunt: '../source-hunt.js', position: './position.js', rights: '../repos/rights-repo.js', sections: '../repos/sections-repo.js', srcl: '../source-links.js' };
export const dep = async (ctx, name, mod) => ctx?.deps?.[name] || (await import(MOD[mod]))[name];
// a raw Qdrant layer, its calls traced as layer:<name> while a tool runs it (search-trace.js traceLayer); a test's injected one is not wrapped
export const layerDep = async (ctx, fnName) => (ctx?.deps?.[fnName] ? ctx.deps[fnName]
  : (await import('../search-trace.js')).tracedLayer(fnName, await dep(ctx, fnName, 'layers')));

/** A schema made safe to compile many times in one spec: shared schemas' $id → title (inlined). Pure. */
export function plainSchema(s) {
  if (Array.isArray(s)) return s.map(plainSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) if (k === '$id') out.title ??= v; else out[k] = plainSchema(v);
  return out;
}
