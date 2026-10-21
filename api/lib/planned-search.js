// Planned search: ONE Jev plan (search-plan.js) → result cache → narrow-then-relax (search-scope.js) over the
// multi-index engine with the plan's layers (keyword for quotes, HyPE, diversity only when unscoped).
// SEARCH TARGET (search-target.js): a query that NAMES a person or place is searched under every name the texts use
// for it ("iderne" → Adrianople / Edirne / Adirnih); passages naming the target lead and carry `targetHighlight`.
// Deps: search-plan, search-scope; search.js + answer-cache.js + search-target.js loaded lazily so this stays unit-testable.
import { planSearch, layersFor } from './search-plan.js';
import { relaxScope } from './search-scope.js';
import { foldVerbatim, isVerbatimQuery } from './search/verbatim.js';
import { correctQuery, vocabulary } from './search/spell.js';

const TTL_MS = 10 * 60 * 1000;
const TARGET_MS = 1200;
const CLAIMS_GRACE_MS = Number(process.env.CLAIMS_GRACE_MS || 1500);
const KEYWORD_ONLY = { keywordLayer: true, phraseLayer: false, semantic: false, hype: false, diversify: false };
const MAX = 500;
const cache = new Map();
export const clearPlannedCache = () => cache.clear();

// Same folding as search.js authorMatches: diacritics, apostrophe style and punctuation never decide a match.
const foldName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
const byAuthor = (hit, aliases) => aliases.some((a) => foldName(hit.author).includes(foldName(a)));

const foldTok = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set('a an and or of the to in on at for by with from is are be as that this what whats does do did say says said about tell me my his her their its how why when where who which on upon into'.split(' '));

/** Words that name the preferred author (aliases + label), folded — they are the FILTER, not the subject. */
function nameWords(prefer) {
  return new Set([prefer.author, ...(prefer.aliases || [])].flatMap((a) => foldTok(a).split(' ')).filter(Boolean));
}
/** The query minus the author's name: under an author filter the name is redundant, and partial matching then
 *  dropped the SUBJECT ("justice") instead. */
export function withoutAuthor(query, prefer) {
  const names = nameWords(prefer);
  const kept = String(query).split(/\s+/).filter((t) => !foldTok(t).split(' ').every((w) => names.has(w)));
  return kept.join(' ').trim() || query;
}
/** The subject of a "where does X say Y?" question: the question frame — and the author it names, which the plan
 *  already carries as `prefer` — is not the subject. Searching the frame matched "Where is he who held dominion…" for
 *  "where does Bahá’u’lláh say the earth is but one country" (10-09) and the passage itself never came back. */
const FRAME = /^\s*(?:(?:and|so|but)\s+)?(?:where|when|what|how|why|did|does|do|has|have|had|is there|are there|in (?:what|which)\b[^?]{0,40}?|which (?:book|tablet|work|passage|text)s?)\b[^?]{0,80}?\b(?:say|says|said|saying|write|writes|wrote|written|state|states|stated|mention|mentions|mentioned|teach|teaches|taught|talk|talks|speak|speaks|spoke|explain|explains|explained|describe|describes|described|refer|refers|referred)\b\s*(?:that|about|of|on|regarding|concerning|to)?\s+/i;
export function questionSubject(query) {
  const q = String(query || '').trim();
  const m = q.match(FRAME);
  if (!m) return q;
  const rest = q.slice(m[0].length).replace(/[?？]+\s*$/, '').trim();
  return /[\p{L}\p{N}]{3,}/u.test(rest) ? rest : q;
}
/** Subject terms: content words of the query that are not the author's name. */
export function subjectTerms(query, prefer) {
  const names = nameWords(prefer);
  return foldTok(query).split(' ').filter((w) => w.length >= 3 && !STOP.has(w) && !names.has(w));
}
const onSubject = (hit, terms) => {
  if (!terms.length) return true;
  const t = foldTok(hit.text);
  return terms.some((w) => new RegExp(`(^| )${w.length > 4 ? w.replace(/(es|s)$/, '') : w}`).test(t));
};

/**
 * Preferred author first, everything else KEPT. The author's own words rank ahead; then passages that QUOTE them
 * (`quotedIds`: Shoghi Effendi citing Bahá’u’lláh — Chad 10-09: "where does Bahá’u’lláh say X?" should bring up the
 * passage as Shoghi Effendi quotes it), marked `_quotes`; then the rest — a compilation, biography or newsletter that
 * quotes them still appears, which is often where a half-remembered tablet actually is. Pure.
 */
export function preferAuthor(authorHits, broadHits, aliases, limit, terms = [], quotedIds = new Set()) {
  const seen = new Set();
  const mine = [], quoting = [], others = [];
  // Promoted = BY the author AND on the question's subject; "his words first" means his words on THIS.
  for (const h of [...authorHits.filter((x) => onSubject(x, terms)), ...broadHits]) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    const isMine = byAuthor(h, aliases) && onSubject(h, terms);
    if (isMine) mine.push({ ...h, _authorMatch: true });
    else if (quotedIds.has(h.id) && onSubject(h, terms)) quoting.push({ ...h, _authorMatch: false, _quotes: aliases[0] });
    else others.push({ ...h, _authorMatch: byAuthor(h, aliases) });
  }
  // the author's best few, then the quoting passages: a filter-matched list of the author's own paragraphs runs weak fast
  // ("This Youth hath departed out of this country" for "the earth is but one country") and pushed Shoghi Effendi's
  // quotation of the very passage off an 8-hit page (10-09)
  return [...mine.slice(0, OWN_FIRST), ...quoting, ...mine.slice(OWN_FIRST), ...others].slice(0, limit);
}
const OWN_FIRST = 3;

/** Which of these paragraphs quote the author (content.authors role 'quoted' — the attribution reader + window
 *  classifier). One small read of the hits' rows; folding as byAuthor. */
export async function quotingParagraphs(ids, aliases) {
  const want = [...new Set(ids.filter((x) => Number.isInteger(Number(x))).map(Number))];
  if (!want.length) return new Set();
  const { queryAll } = await import('./db.js');
  const rows = await queryAll(`SELECT id, authors FROM content WHERE id IN (${want.map(() => '?').join(',')})`, want, 'planned-search:voices');
  const out = new Set();
  for (const r of rows) {
    let list = [];
    try { list = JSON.parse(r.authors || '[]'); } catch { /* none */ }
    if (list.some((e) => e.role === 'quoted' && aliases.some((a) => foldName(e.name).includes(foldName(a))))) out.add(r.id);
  }
  return out;
}

/**
 * Interleave result lists (the typed query's first, then one per target name); passages that NAME the target lead,
 * each carrying its target-highlighted text; the rest follow in order. Pure — `mark` returns HTML or null.
 */
export function leadWithTarget(lists, mark, limit) {
  const seen = new Set(), named = [], rest = [];
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth; i++) for (const l of lists) {
    const h = l[i];
    if (!h || seen.has(h.id)) continue;
    seen.add(h.id);
    const html = mark(h);
    (html ? named : rest).push(html ? { ...h, targetHighlight: html } : h);
  }
  return [...named, ...rest].slice(0, limit);
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {string} query            what to search for
 * @param {object} o
 * @param {Array}  [o.messages]     the conversation — scope is inferred from it, not just the query
 * @param {object} [o.given]        caller filters (model tool args, explicit API filters) — always win
 * @returns {{hits, plan, layers, widened, relaxed, narrowCount, cached, timings}}
 */
// resolver: source resolution (source-resolve.js) — default ON for the real engine, off when a test injects one.
// people/paragraphs: the claims layer (people-search.js + docs-repo) — default ON for the real engine; injectable.
// Qdrant layers (P4, planning/phrase-index-plan.md): off until the batteries pass with them. SEARCH_QDRANT=phrase,keyword
// turns them on server-wide; a caller (the battery, via /api/search/multi) can pass {phrase, keyword} per request.
// 'only' = Qdrant ranks alone, Meili layers off (the swap candidate).
export const qdrantDefault = (v = process.env.SEARCH_QDRANT || '') => ({ phrase: /phrase|only/.test(v), keyword: /keyword|only/.test(v), hype: /hype|only/.test(v), only: /only/.test(v) });
export const qdrantOption = (v) => v === true ? { phrase: true, keyword: true, hype: false, only: false } : v === 'only' ? { phrase: true, keyword: true, hype: true, only: true }
  : v && typeof v === 'object' ? { phrase: !!v.phrase, keyword: !!v.keyword, hype: !!v.hype, only: !!v.only } : v === false ? { phrase: false, keyword: false, hype: false, only: false } : qdrantDefault();

export async function plannedSearch(query, { messages, given = {}, defaults = {}, limit = 10, scope_config, entityIds, planner = planSearch, engine, resolver, people, encounters, encounterProbe, paragraphs, voices, minResults = 3, budgetMs = 1000, targeter, qdrant = qdrantDefault(), weights, vocab, citer } = {}) {
  const t0 = Date.now();
  const deadline = t0 + budgetMs;   // the whole strategy (Chad: 1s); late stages get what is left, then degrade
  // A reader's misspellings are corrected against the library's own vocabulary BEFORE anything searches (search/spell.js):
  // one slip cut Meili's matches from 50,000+ to 19 (10-16). The result says what was corrected ("showing results for …").
  const original = query;
  // A typed CITATION ("Gleanings CXXV", "Íqán ¶12", "Arabic Hidden Words 5") resolves to its paragraph by the work's
  // verified numbering (refs/cite.js) — read from the query as typed, before spelling correction touches "PHW" or "Iqan".
  const cite = citer ?? (engine ? null : resolveCitation);
  const citedP = cite ? cite(original).catch(() => null) : Promise.resolve(null);
  const spelled = correctQuery(query, vocab ?? vocabulary());
  query = spelled.query;
  // The query embedding needs no plan: start it now so it is ready when the engine asks (shared, one call).
  if (!engine) import('./query-embedding.js').then((m) => m.queryEmbedding(query)).catch(() => {});
  // Resolved BESIDE the plan, inside the same budget; a slow or failed resolve means no target, never a slower search.
  const target = targeter ?? (engine ? null : async (q) => (await import('./search-target.js')).resolveTarget(q));
  const targetP = target ? target(query).catch(() => null) : Promise.resolve(null);
  const plan = await planner(messages?.length ? messages : query, { given });
  // Site default (an embedding site's home tradition): fills in only when the question named none and is not a
  // comparison. It is a scope like any other, so the relax ladder still widens it when the site's texts are thin.
  if (defaults?.religion && !plan.filters.religion && !plan.comparative) {
    plan.filters = { ...plan.filters, religion: defaults.religion };
    plan.source = { ...plan.source, religion: 'site-default' };
  }
  let layers = layersFor(plan);
  // Who-met-whom is answered by the encounter index with cited paragraphs; passages only support it, and BM25 on
  // the names finds them — so it pays for no query embedding.
  const probe = encounterProbe ?? (engine || people ? null : (await import('./encounters.js')).isEncounterQuestion);
  if (probe?.(query)) layers = { ...layers, semantic: false, hype: false, encounter: true };
  const planMs = Date.now() - t0;

  const { SEARCH_VERSION = '' } = engine ? {} : await import('./answer-cache.js').catch(() => ({}));
  const key = JSON.stringify([SEARCH_VERSION, fold(query), plan.filters, plan.prefer?.author || null, plan.shape, limit, scope_config || null, entityIds || null, qdrant, weights || null]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ...hit.value, cached: true, timings: { plan_ms: planMs, search_ms: 0, total_ms: Date.now() - t0 } };
  }

  const run = engine || (await import('./search.js')).multiIndexSearch;
  const t1 = Date.now();
  const stages = {};   // per-stage ms, so the 1s budget can be held stage by stage
  const subjectQ = questionSubject(query);
  const search = async (filters, q = subjectQ, only = null) => {
    const res = await run(q, {
      limit, filters, scope_config,
      ...(entityIds?.length ? { entityIds } : {}),
      keywordLayer: layers.keyword, conceptLayer: layers.concept, hype: layers.hype, semantic: layers.semantic, diversify: layers.diversify, includeMatchedHype: true,
      phraseLayer: qdrant.phrase, qdrantKeyword: qdrant.keyword, qdrantHype: qdrant.hype, ...(qdrant.only ? { meili: false } : {}), ...(weights ? { weights } : {}),
      ...(only || {}),
    });
    (stages.engine ||= []).push({ filters: Object.keys(filters || {}).filter((k) => filters[k]), ...(res?._timings || {}) });
    return res?.hits || [];
  };
  // CLAIMS LAYER (people pattern): the cited-claim graph answers who / did what / when; runs BESIDE passage search.
  // Who-met-whom answers from the in-memory encounter index (ms); every other people question from peopleSearch.
  // Who-met-whom is detected deterministically (ms) on EVERY query, so a slow or failed plan cannot drop it.
  const encounterFn = encounters ?? (engine || people ? null : async (q) => (await import('./encounters.js')).encounterPeople(q));
  const searchPeople = people ?? (engine ? null : async (q) => (await import('./people-search.js')).peopleSearch(q));
  const peopleFn = async (q) => (encounterFn ? await encounterFn(q) : null) ?? (layers.claims && searchPeople ? searchPeople(q) : { people: [] });
  const claimsP = (layers.claims && searchPeople) || encounterFn ? peopleFn(query).catch((err) => ({ people: [], error: err.message }))
    .finally(() => { stages.claims_ms = Date.now() - t1; }) : null;
  // A QUOTATION (6+ words, not a question) is also searched verbatim — keyword only, unscoped, the whole text — beside the
  // planned search: the plan's subject-stripping, scope and author preference were built for questions and lost exact
  // matches (known-item test 10-16: production found a passage's own words first 73% vs the engine's 86%).
  const quotation = isVerbatimQuery(query, 6) && !/\?\s*$/.test(query);
  // With a preferred author, the author-matched search runs BESIDE the broad one, never instead of it.
  const [r, authorHits, verbatimHits] = await Promise.all([
    relaxScope(plan.filters, search, { min: Math.min(minResults, limit) }),
    plan.prefer ? search({ ...plan.filters, author: plan.prefer.aliases[0] }, withoutAuthor(subjectQ, plan.prefer)).catch(() => []) : Promise.resolve([]),
    quotation ? search({}, query, KEYWORD_ONLY).catch(() => []) : Promise.resolve([]),
  ]);
  stages.passages_ms = Date.now() - t1;
  const quotedIds = plan.prefer
    ? await (voices ?? (engine ? null : quotingParagraphs))?.(r.results.map((h) => h.id), plan.prefer.aliases).catch(() => new Set()) ?? new Set()
    : new Set();
  let hits = plan.prefer ? preferAuthor(authorHits, r.results, plan.prefer.aliases, limit, subjectTerms(query, plan.prefer), quotedIds) : r.results;
  // The resolve had the whole passage search to finish in; it waits only until TARGET_MS from the start, so it never
  // adds latency beyond that — and never loses a race it did not need to (a 1s timer from t0 dropped "iderne" on a
  // busy box whose passage search alone took 1.5s, 2026-09-28).
  const tgt = await Promise.race([targetP, new Promise((ok) => setTimeout(() => ok(null), Math.max(0, t0 + Math.min(TARGET_MS, budgetMs * 1.2) - Date.now())))]);
  if (tgt) {
    const { markTarget } = await import('./search-target.js');
    const names = tgt.names.filter((n) => !/[\u0600-\u06FF]/.test(n) && fold(n) !== fold(query)).slice(0, 3);
    // A NAME needs only the keyword layer: the full engine embedded each name and ran HyPE (1.8–3.7s measured live).
    // ENTITY LAYER: the resolved entity's disambiguated mentions (entity_mentions_idx) — paragraphs that name it by
    // ANY form (title, epithet, kunya), which the name keywords cannot reach. Chad 10-12: use every index we build.
    const mentioned = tgt.id ? search(r.scope || plan.filters, subjectQ, { ...KEYWORD_ONLY, entityIds: [tgt.id] }).catch(() => []) : Promise.resolve([]);
    const per = await Promise.all([...names.map((n) => search(r.scope || plan.filters, n, KEYWORD_ONLY).catch(() => [])), mentioned]);
    hits = leadWithTarget([hits, ...per], (h) => markTarget(h.text, tgt), limit);
    stages.target_ms = Date.now() - t1;
  }

  // Correct sources BEFORE anything formats them: quoted words served from their original work, every checked
  // passage labelled (original / quotation / recollection / commentary) with whose words it carries.
  const resolve = resolver ?? (engine ? null : (await import('./source-resolve.js')).resolveSources);
  let resolution = null;
  if (resolve && plan.shape !== 'converse' && hits.length) {
    const t2 = Date.now();
    const res = await resolve(hits, { deadline }).catch((err) => ({ hits, resolved: 0, error: err.message }));
    hits = res.hits;
    resolution = { resolved: res.resolved, error: res.error || null, ms: Date.now() - t2, stages: res.ms || null };
  }

  // People + their cited claims (with dates) + the cited paragraphs themselves — evidence first, then passages.
  // AFTER source resolution: a claim-cited paragraph is already the exact source; resolving it again relabelled it.
  let entities = null;
  let peopleAnswer = null;   // who-met-whom: met · contested (evidence both ways) · notMet (proof denies) · noEvidence
  // CLAIMS GRACE (10-21: after a restart the claim worker loads its corpus ~10 s, and the first people-ish searches waited it out
  // — 10.6 s for "the role of the Hands of the Cause today", passages ready at 1.5 s): once the passages are in, the claims get
  // CLAIMS_GRACE_MS more; late, the answer goes out without them (stages.claims_late) and the worker keeps warming
  const pr = claimsP ? await Promise.race([claimsP, new Promise((ok) => { const t = setTimeout(() => { stages.claims_late = true; ok(null); }, CLAIMS_GRACE_MS); t.unref?.(); })]) : null;
  // A who-met-whom probe that found nothing on a non-people plan is not a people answer.
  if (pr && (layers.claims || pr.pattern)) {
    // A pattern answer (the encounter index answered the question) is COMPLETE — a group's whole roster — so it is
    // not capped at the dozen used for loose people matches. Every piece of evidence carries its verbatim proof.
    const ev = (e) => ({ statement: e.statement, relation: e.relation, source: e.source, url: e.url || null, paraId: e.paraId || null,
      doc_id: e.doc_id ?? null, when: e.when || null, proof: e.proof || null, verified: e.verified ?? null,
      ...(e.verifiedQuote ? { verifiedQuote: e.verifiedQuote } : {}), ...(e.authoritative ? { authoritative: true } : {}), ...(e.scene ? { scene: e.scene } : {}),
      ...(e.via ? { via: e.via } : {}), ...(e.negated ? { negated: true } : {}) });
    entities = (pr.people || []).slice(0, pr.pattern ? 60 : 12).map((p) => ({ id: p.id, name: p.name, evidence: (p.evidence || []).slice(0, pr.pattern === 'pair' ? 6 : 4).map(ev) }));
    if (pr.pattern) {
      peopleAnswer = { pattern: pr.pattern, target: pr.target || null, group: pr.group || null, with: pr.with || null, relations: pr.relations || null,
        met: entities.map((p) => p.name),
        contested: (pr.contested || []).map((p) => ({ id: p.id, name: p.name, evidence: p.evidence.slice(0, 3).map(ev), against: p.against.slice(0, 3).map(ev) })),
        notMet: (pr.notMet || []).map((p) => ({ id: p.id, name: p.name, evidence: p.evidence.slice(0, 3).map(ev),
          ...(p.disputedBy?.length ? { disputedBy: p.disputedBy.slice(0, 3).map(ev) } : {}) })),
        noEvidence: pr.noEvidence || [] };
    }
    if (pr.pattern) Object.assign(entities, { pattern: pr.pattern, ms: pr.ms ?? null, parties: { target: pr.target, with: pr.with, group: pr.group } });   // which people path answered
    const refs = entities.flatMap((p) => p.evidence.filter((e) => e.doc_id && e.paraId).slice(0, 2)
      .map((e) => ({ doc_id: e.doc_id, paraId: e.paraId, person: p.name, claim: e.statement })));
    const paraFn = paragraphs ?? (engine ? null : async (rs) => (await import('./docs-repo.js')).getParagraphsByRefs(rs));
    let evidenceError = null;
    const t3 = Date.now();
    const found = paraFn && refs.length ? await paraFn(refs).catch((err) => { evidenceError = err.message; return []; }) : [];
    stages.evidence_ms = Date.now() - t3;
    if (evidenceError || (refs.length && !found.length)) {
      // Never silently: a people answer without its cited paragraphs reads as "the record does not say".
      entities.evidence_error = evidenceError || `0 of ${refs.length} cited paragraphs found`;
    }
    const evidenceHits = found.map((row) => {
      const ref = refs.find((x) => x.doc_id === row.doc_id && (x.paraId === row.external_para_id || x.paraId === `p${row.id}`)) || {};
      return { ...row, _source: { kind: 'evidence', person: ref.person || null, claim: ref.claim || null } };
    });
    const seenIds = new Set(evidenceHits.map((h) => h.id));
    if (pr.pattern) {
      // The encounter index ANSWERED the question: its cited paragraphs are the answer, so they lead.
      hits = [...evidenceHits, ...hits.filter((h) => !seenIds.has(h.id))].slice(0, Math.max(limit, evidenceHits.length));
    } else {
      // Loose people matches support; they never displace the passages ("When was the Báb martyred?" lost every
      // passage naming 1850 to twelve people's unrelated evidence — battery 2026-09-26).
      const passages = hits.filter((h) => !seenIds.has(h.id)).slice(0, limit);
      const shown = new Set(passages.map((h) => h.id));
      hits = [...passages, ...evidenceHits.filter((h) => !shown.has(h.id)).slice(0, 6)];
    }
  }

  // Passages containing the quotation verbatim lead (not over a people answer, whose cited paragraphs ARE the answer).
  if (quotation && !pr?.pattern) {
    const q = foldVerbatim(query);
    const exact = [], seen = new Set();
    for (const h of [...hits, ...verbatimHits]) if (!seen.has(h.id) && foldVerbatim(h.text).includes(q)) { seen.add(h.id); exact.push(h); }
    if (exact.length) hits = [...exact, ...hits.filter((h) => !seen.has(h.id))].slice(0, Math.max(limit, exact.length));
  }

  // the cited paragraph leads, labelled with its reference
  const cited = await citedP;
  if (cited) hits = [cited, ...hits.filter((h) => String(h.id) !== String(cited.id))].slice(0, Math.max(limit, 1));

  const value = {
    hits, plan, layers, resolution, entities, peopleAnswer,
    citation: cited ? cited.citation : null,
    corrected: spelled.corrections.length ? { from: original, to: query, corrections: spelled.corrections } : null,
    target: tgt ? { id: tgt.id, name: tgt.name, type: tgt.type, names: tgt.names } : null,
    widened: r.widened, relaxed: r.relaxed, narrowCount: r.narrowResults.length, scopeUsed: r.scope,
  };
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return { ...value, cached: false, timings: { plan_ms: planMs, search_ms: Date.now() - t1, total_ms: Date.now() - t0, ...stages, resolve_ms: resolution?.ms ?? null } };
}

/** A citation → its paragraph in the search-hit shape (SQLite, paragraphs-repo), with { work, pn } attached; else null. */
export async function resolveCitation(query) {
  const { parseCitation } = await import('./refs/cite.js');
  const c = parseCitation(query);
  if (!c) return null;
  const { paragraphIdByPn } = await import('./repos/refs-repo.js');
  const id = await paragraphIdByPn(c.doc, c.pn);
  if (!id) return null;
  const [p] = await (await import('./paragraphs-repo.js')).paragraphsByIds([id]);
  return p ? { ...p, citation: { work: c.work, pn: c.pn } } : null;
}
