// Forensic pass (Chad 11-04: "it must be efficient to forensically dissect searches and figure out what can be improved and
// where"). One reply's trace (searches with ranked hits, the passages the writer had, what it cited, the reply) → typed
// defects, each owned by the STAGE that must change: STRATEGY · RETRIEVAL · RANK · SELECTION · WRITER · LATENCY · HOLDINGS.
// Plus a verdict per SEARCH, so a bad rank shows even when the reply recovered. Class rules only (never a question's words).
// Free: no model, no DB. Pure. Deps: source-tier, lint, teachings-check, latency-budget, doctrinal-rank (foldKey).
import { markdownDefects } from '../assistant/md-valid.js';
import { sourceTier } from '../assistant/source-tier.js';
import { lintReply } from '../assistant/lint.js';
import { teachingsCheck } from '../assistant/teachings-check.js';
import { budgetFor, engineStages, plannedStages } from '../search/latency-budget.js';
import { foldKey } from '../search/doctrinal-rank.js';
import { NEEDS_WRITINGS } from '../search/writings-pass.js';
import { contentWords } from '../search/verbatim.js';
import { driftedQueries, MODEL_SEARCH } from '../assistant/query-anchor.js';

export const FORENSIC_V = 1;
export const STAGES = ['STRATEGY', 'RETRIEVAL', 'RANK', 'SELECTION', 'WRITER', 'LATENCY', 'HOLDINGS'];

/** Where each defect class is fixed: file · function/stage. The work queue prints it beside the count, the analyst reads it
 *  as the code map, and the improve loop keys its dedupe on the FIRST path (fixFile). Every first path is a real module
 *  (tests/api/anis-improve.test.js checks the disk). 11-06: the old map sent 331 suggestions to doctrinal-rank.js and 190 to
 *  latency-budget.js when the code to change was the route passes in planned-search.js and the slow stage's own module. */
export const FIX_WHERE = {
  'query-drift': 'api/lib/assistant/query-anchor.js (Jev subject check) · researcher.js / agent.js first-round search query',
  'no-originals-search': 'api/lib/assistant/researcher.js originals quota · planned-search.js route passes (an originals pass)',
  'no-writings-pass': 'api/lib/search/writings-pass.js owesWritings · planned-search.js (the Writings pass beside the broad pass)',
  'authority-inversion': 'api/lib/search/doctrinal-rank.js + assistant/source-tier.js (copy authority in the rank of copies of one passage)',
  'writings-buried': "api/lib/planned-search.js route passes (the Writings pass leads the Bahá'í part) · search/doctrinal-rank.js",
  'best-copy-missed': 'api/lib/search.js recall (index/filters) · planned-search.js relax ladder: the replay with a Writings/originals filter finds it, the route did not',
  'zero-hits': 'api/lib/planned-search.js relax ladder · search-scope.js DROP_ORDER (or the route query)',
  'cited-weaker-copy': 'api/lib/assistant/lookup.js quote route source choice · prompt.js source order',
  'no-writings-cited': 'api/lib/assistant/prompt.js (the Writings first) · researcher.js passage choice',
  'process-talk': 'api/lib/assistant/prompt.js HOUSE_STYLE · lint.js machinery',
  'clipped-quote': 'api/lib/assistant/quotes.js (a quote never ends in a clip)',
  'malformed-markdown': 'api/lib/assistant/respond.js the post-writer step that produced it (quotes.js linkQuotes/markQuotes, linkTitles) · md-valid.js names the defect',
  'bare-link': 'api/lib/assistant/prompt.js citation = link text',
  'search-offer': 'api/lib/assistant/prompt.js · lint.js search-offer',
  'wrong-author': 'api/lib/assistant/prompt.js citation author · library metadata',
  'reported-unlabelled': 'api/lib/assistant/prompt.js (a talk is named as spoken)',
  'stage-over-budget': "api/lib/search.js engine stages · the slow stage's own module (search/read-pool.js hydrate, query-embedding.js embed, search/qdrant-layers.js layers, assistant/tools.js originals_search, planned-search.js planned stages); budgets are targets in search/latency-budget.js",
  'no-authoritative-copy': 'library gap → Dewey intake (nothing authoritative held or found)',
};
/** The repo path a defect class is fixed in (FIX_WHERE's first path), or null (a library gap, or a class with no code home). */
export const fixFile = (cls) => (String(FIX_WHERE[cls] || '').match(/api\/[\w./-]+\.js/) || [])[0] || null;
const QDRANT_LAYERS = new Set(['qdrant', 'phrase', 'qhype', 'qconcept', 'canon', 'doctrinal', 'doctrinal_hype', 'qkeyword', 'qkeyword_retry']);
/** A latency stage → the module that owns its time (never the budget table). originals_search runs its own embed/phrase/qhype/canon. */
export function latencyModule(stage, { tool = null, kind = 'engine' } = {}) {
  if (/original/i.test(tool || '')) return 'api/lib/assistant/tools.js';
  if (kind === 'planned') return stage === 'spell' ? 'api/lib/search/spell.js' : 'api/lib/planned-search.js';
  if (stage === 'embed' || stage === 'main_embed') return 'api/lib/query-embedding.js';
  if (stage === 'hydrate') return 'api/lib/search/read-pool.js';
  if (QDRANT_LAYERS.has(stage)) return 'api/lib/search/qdrant-layers.js';
  return 'api/lib/search.js';
}
/** One defect → the real file that owns it: a slow stage's own module, else its class's file (null = no code home). */
export const defectFile = (d = {}) => (d.class === 'stage-over-budget' && d.evidence?.stage
  ? latencyModule(d.evidence.stage, { tool: d.evidence.tool, kind: d.evidence.kind }) : fixFile(d.class));

// ── routes: which tools a route owes (class rules) ─────────────────────────────────────────────────────────────────────
const DOCTRINAL = new Set(['quote', 'source', 'teachings', 'topic', 'define', 'original', 'best-expression', 'survey-subject', 'examine-position']);
const NEEDS_ORIGINALS = new Set(['quote', 'source', 'teachings', 'original']);
// NEEDS_WRITINGS lives with the pass itself (search/writings-pass.js) so the rule and the recipe cannot drift
export { NEEDS_WRITINGS };
/** route label from a trace ('planned:quote', 'answer(quote)', 'quote') → 'quote'. */
export const routeOf = (r) => String(r || '').replace(/^planned:/, '').replace(/^answer\((.*)\)$/, '$1').trim().toLowerCase() || null;
/** A Writings pass is owed ONLY on a route Jev chose in NEEDS_WRITINGS. A search with no route (the search page, the public
 *  API — 507 of the first 581 no-writings-pass audits) owes none and is never flagged for it. */
export const owesWritingsPass = (route) => NEEDS_WRITINGS.has(routeOf(route));
/** The judge's classes for an item, minus the route-owed ones its route does not owe (the judge read "a teachings question
 *  with no Writings pass" into routeless search-page searches). Pure. */
export const owedClasses = (classes = [], route = null) => classes.filter((c) => c !== 'no-writings-pass' || owesWritingsPass(route));

const ORIGINAL_LANG = /^(ar|fa|per|pes|ara)/i;
const isOriginal = (h) => ORIGINAL_LANG.test(String(h?.language || h?.lang || ''));
const filt = (s) => s?.filters || {};
const searchedOriginals = (s) => /original/i.test(s.tool || '') || ORIGINAL_LANG.test(String(filt(s).language || filt(s).lang || ''))
  || (Array.isArray(filt(s).languages) && filt(s).languages.some((l) => ORIGINAL_LANG.test(l)));
const searchedWritings = (s) => /writings/i.test(s.tool || '') || /writings|authoritative|doctrinal/i.test(String(filt(s).tier || filt(s).authority || ''))
  || filt(s).writings === true || filt(s).authoritative === true;

// ── copy authority: among copies of one passage, which should be the source (Chad 11-04 order) ─────────────────────────
// SE translation > a Writing in another translation > an authorized compilation > the Guardian/House quoting it > a talk >
// secondary (periodicals, statements, commentary). The original-language text is tracked apart (it sits beside the English).
export const COPY_CLASSES = ['se-translation', 'writing', 'compilation', 'quoted-authoritative', 'reported', 'secondary'];
// Works Shoghi Effendi translated (by title — the metadata has no translator field on most rows)
const SE_TRANSLATED = /epistle to the son of the wolf|gleanings|kit[aá]b-?i-?[ií]q[aá]n|book of certitude|hidden words|prayers and meditations|will and testament of|kit[aá]b-?i-?aqdas/i;
const PERIODICAL = /\bbah[aá].?[ií] world\b|star of the west|world order magazine|bah[aá].?[ií] news|herald of the south|journal|magazine|newsletter|bulletin|\bstatement\b/i;
const COMPILATION = /\btablets of bah|compilation|compiled|selections from|extracts from|fountain of wisdom/i;
const INSTITUTION = /international community|\bbic\b|office of|spiritual assembly|research department/i;

export function copyClass(h = {}) {
  const title = String(h.title || ''), author = String(h.author || '');
  if (PERIODICAL.test(title) || INSTITUTION.test(author) || PERIODICAL.test(String(h.collection || ''))) return 'secondary';
  const tier = h.tier || sourceTier({ ...h, religion: h.religion || 'Bahá’í' });
  if (tier === 'writings') {
    if (/shoghi/i.test(String(h.translator || '')) || SE_TRANSLATED.test(title)) return 'se-translation';
    return COMPILATION.test(title) ? 'compilation' : 'writing';
  }
  if (tier === 'compilation') return 'compilation';   // a Writings compilation, the passage's writer unattributed
  if (tier === 'guardian' || tier === 'house') return 'quoted-authoritative';
  if (tier === 'reported') return 'reported';
  return 'secondary';
}
const copyRank = (h) => COPY_CLASSES.indexOf(copyClass(h));
const AUTHORITATIVE = (h) => copyRank(h) <= 1 || ['writings', 'guardian'].includes(h.tier);

// a hit carries the passage when its text shares the question's words (quote route); no text → assumed (the trace is the route's)
const words = contentWords;
export function isCopy(h, question) {
  const t = h.text ?? h.snippet;
  if (!t || !question) return true;
  const q = words(question), w = words(t);
  if (!q.size) return true;
  return [...q].filter((x) => w.has(x)).length / q.size >= 0.5;
}

const label = (h) => `${h.title || h.doc_id || '?'}${h.rank ? ` (hit #${h.rank})` : ''}`;
const sameDoc = (a, b) => (a.doc_id != null && b.doc_id != null ? String(a.doc_id) === String(b.doc_id) : foldKey(a.title) === foldKey(b.title));

const AGGREGATE = new Set(['total', 'merge', 'search', 'passages']);

// ── per-search verdict ────────────────────────────────────────────────────────────────────────────────────────────────
/** One search → { trace_id, tool, query, verdict: ok|defect, defects }. ctx: { route, question }. Pure. */
export function assessSearch(s = {}, { route = null, question = '' } = {}) {
  const r = routeOf(route || s.route), hits = (s.hits || []).map((h, i) => ({ ...h, rank: h.rank ?? i + 1 }));
  const defects = [];
  const add = (stage, cls, detail, evidence = {}) => {
    const d = { stage, class: cls, detail, fix_where: FIX_WHERE[cls], evidence: { trace_id: s.trace_id, tool: s.tool, ...evidence } };
    if (cls === 'stage-over-budget') d.fix_where = `${defectFile(d)} (the ${evidence.stage} stage; its budget is in search/latency-budget.js)`;
    defects.push(d);
  };
  // a research step stores its count, not its hits: found > 0 is not a zero-hit search
  if (!hits.length && !(s.found > 0)) add('RETRIEVAL', 'zero-hits', `${s.tool || 'search'} "${String(s.query || '').slice(0, 80)}" returned nothing`);
  // copies of one passage (quote/source routes): the most authoritative copy should lead its lower ones
  if (['quote', 'source'].includes(r)) {
    const copies = hits.filter((h) => !isOriginal(h) && isCopy(h, question || s.query));
    const best = copies.reduce((b, h) => (!b || copyRank(h) < copyRank(b) ? h : b), null);
    const above = best && copies.filter((h) => h.rank < best.rank && copyRank(h) > copyRank(best));
    if (above?.length) {
      const top = above[0];
      add('RANK', 'authority-inversion', `${copyClass(top)} ${label(top)} outranks the ${copyClass(best)} ${label(best)}`,
        { best: { rank: best.rank, title: best.title, doc_id: best.doc_id, class: copyClass(best) }, above: above.map((h) => ({ rank: h.rank, title: h.title, class: copyClass(h) })) });
    }
  } else if (NEEDS_WRITINGS.has(r)) {
    const w = hits.find((h) => AUTHORITATIVE(h));
    if (w && w.rank > 10 && hits.slice(0, 3).every((h) => copyRank(h) >= 4)) add('RANK', 'writings-buried', `first Writing ${label(w)} below ${hits.slice(0, 3).length} secondary hits`, { best: { rank: w.rank, title: w.title } });
  }
  // stage latency: one search over a stage budget (×2, so a p95 budget does not flag ordinary noise)
  const kind = s.kind || (/planned/.test(s.endpoint || '') ? 'planned' : 'engine');
  const stages = s.stages || (kind === 'planned' ? plannedStages(s.timings || {}) : engineStages(s.timings || {}));
  const over = Object.entries(stages).filter(([stage, ms]) => { const b = budgetFor(kind, stage); return b != null && ms > 2 * b; });
  // an aggregate (total/merge/search) over budget only because a stage inside it is: the stage is the defect
  const parts = over.filter(([k]) => !AGGREGATE.has(k));
  for (const [stage, ms] of parts.length ? parts : over) {
    const b = budgetFor(kind, stage);
    if (b != null) add('LATENCY', 'stage-over-budget', `${stage} ${ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`} (budget ${b} ms)`, { stage, ms, budget: b, kind });
  }
  return { trace_id: s.trace_id ?? null, tool: s.tool ?? null, query: s.query ?? null, verdict: defects.length ? 'defect' : 'ok', defects };
}

// ── the reply's writing ───────────────────────────────────────────────────────────────────────────────────────────────
const PROCESS_TALK = /\b(?:search results?|the results (?:show|above)|as (?:my|the) search(?:es)? (?:show|found)|in (?:the|my) hits|the evidence (?:shows|given))\b/i;
const CLIPPED = /(?:[“"][^”"\n]{20,}?(?:…|\.\.\.)\s*[”"])|(?:^\s*>[^\n]*(?:…|\.\.\.)\s*$)/m;
const BARE_LINK = /(^|[^(<\w])https?:\/\/[^\s)>\]]+/m;
function writerDefects(reply, cited = [], hits = []) {
  const out = [], text = String(reply || '');
  const lint = lintReply(text).map((x) => x.id);
  if (PROCESS_TALK.test(text) || lint.some((id) => ['machinery', 'authority-layers', 'method-narration'].includes(id))) out.push(['process-talk', (text.match(PROCESS_TALK) || [lint[0]])[0]]);
  if (CLIPPED.test(text)) out.push(['clipped-quote', text.match(CLIPPED)[0].slice(-60)]);
  for (const m of markdownDefects(text).slice(0, 1)) out.push(['malformed-markdown', `${m.id}: ${m.at}`]);
  if (BARE_LINK.test(text.replace(/\]\([^)]*\)/g, ''))) out.push(['bare-link', text.replace(/\]\([^)]*\)/g, '').match(BARE_LINK)[0].trim()]);
  if (lint.includes('search-offer')) out.push(['search-offer', 'offers a search it could run']);
  for (const c of cited) {
    if (!c.named_author) continue;
    const h = hits.find((x) => sameDoc(x, c)) || c;
    if (h.author && foldKey(c.named_author) !== foldKey(h.author)) out.push(['wrong-author', `"${c.title}" credited to ${c.named_author}, the work is ${h.author}'s`]);
  }
  return out;
}

/**
 * One reply → { v, route, defects: [{ stage, class, detail, fix_where, evidence }], searches: [per-search verdicts],
 * best_copy, cited_copy }. turn: { route, question, reply, searches: [{ trace_id, tool, query, filters, timings|stages, kind,
 * hits: [{ rank, doc_id, title, author, tier, language, text? }] }], writer_passages, cited: [{ doc_id, title, named_author? }],
 * research?: { steps }, replay?: { hits } (a Writings/originals-filtered search of the same words — "held but missed") }. Pure.
 */
export function forensicPass(turn = {}) {
  const route = routeOf(turn.route);
  const searches = turn.searches || [];
  const perSearch = searches.map((s) => assessSearch(s, { route, question: turn.question }));
  const defects = [];
  const add = (stage, cls, detail, evidence = {}) => defects.push({ stage, class: cls, detail, fix_where: FIX_WHERE[cls], evidence });

  // STRATEGY: tools the route owes
  if (NEEDS_ORIGINALS.has(route) && searches.length && !searches.some(searchedOriginals) && !(turn.research?.steps || []).some((x) => x.originals > 0 || x.tool === 'originals_search'))
    add('STRATEGY', 'no-originals-search', `${route} route ran no original-language (Persian/Arabic) search`, { tools: searches.map((s) => s.tool) });
  if (owesWritingsPass(route) && searches.length && !searches.some(searchedWritings))
    add('STRATEGY', 'no-writings-pass', `${route} route ran no Writings-filtered pass`, { tools: searches.map((s) => s.tool) });

  // STRATEGY: the model's first searches left Jev's subject (spec #5) — no query shares a term with the resolved turn
  const modelQs = turn.model_queries ?? (turn.research?.steps || []).filter((x) => MODEL_SEARCH.has(x.tool)).map((x) => x.rebuilt_from ?? x.args?.query);
  const drifted = driftedQueries(modelQs, { text: turn.subject || turn.question, names: turn.subject_names || [] });
  if (drifted.length) add('STRATEGY', 'query-drift', `the model's searches carry no term of the subject (${drifted.length} of ${modelQs.length})`, { subject: turn.subject || turn.question, queries: drifted.slice(0, 3) });

  // RANK / LATENCY / RETRIEVAL from each search (one defect per class+stage: the worst instance carries the evidence)
  for (const v of perSearch) for (const d of v.defects) {
    const key = `${d.class}:${d.evidence.stage || ''}`;
    if (!defects.some((x) => `${x.class}:${x.evidence.stage || ''}` === key)) defects.push(d);
  }

  // all hits, best rank per doc, for SELECTION
  const hits = [];
  for (const s of searches) for (const [i, h] of (s.hits || []).entries()) { const x = { ...h, rank: h.rank ?? i + 1 }; if (!hits.some((y) => sameDoc(y, x))) hits.push(x); }
  const given = (turn.writer_passages?.length ? turn.writer_passages : hits).map((p) => ({ ...p, ...(hits.find((h) => sameDoc(h, p)) || {}), ...p, rank: (hits.find((h) => sameDoc(h, p)) || p).rank }));
  const copyPool = ['quote', 'source'].includes(route) ? given.filter((h) => !isOriginal(h) && isCopy(h, turn.question)) : given.filter((h) => !isOriginal(h));
  const best = copyPool.reduce((b, h) => (!b || copyRank(h) < copyRank(b) ? h : b), null);
  const citedFull = (turn.cited || []).map((c) => ({ ...(hits.find((h) => sameDoc(h, c)) || {}), ...c, rank: (hits.find((h) => sameDoc(h, c)) || {}).rank ?? c.rank }));
  const citedEnglish = citedFull.filter((c) => !isOriginal(c));
  const citedBest = citedEnglish.reduce((b, h) => (!b || copyRank(h) < copyRank(b) ? h : b), null);
  if (['quote', 'source'].includes(route) && best && citedBest && copyRank(citedBest) > copyRank(best))
    add('SELECTION', 'cited-weaker-copy', `best copy available = ${copyClass(best)} ${label(best)}, cited = ${copyClass(citedBest)} ${label(citedBest)}`,
      { best: { rank: best.rank, title: best.title, doc_id: best.doc_id, class: copyClass(best) }, cited: { rank: citedBest.rank, title: citedBest.title, doc_id: citedBest.doc_id, class: copyClass(citedBest) } });

  // teachings class check (teachings-check.js): Writings cited, talks named as spoken
  if (route === 'teachings' && citedFull.length) {
    const tc = teachingsCheck({ text: turn.reply, cited: citedFull.map((c) => ({ tier: c.tier || sourceTier({ ...c, religion: c.religion || 'Bahá’í' }), language: c.language })), research: turn.research });
    if (!tc.writings && given.some((p) => copyRank(p) <= 2)) add('SELECTION', 'no-writings-cited', 'the writer had a Writing and cited none');
    if (!tc.reported_labelled) defects.push({ stage: 'WRITER', class: 'reported-unlabelled', detail: 'a talk or pilgrim note cited without saying it is spoken', fix_where: FIX_WHERE['reported-unlabelled'], evidence: {} });
  }

  for (const [cls, detail] of writerDefects(turn.reply, turn.cited || [], hits)) add('WRITER', cls, detail);

  // RETRIEVAL / HOLDINGS: nothing authoritative in the hits — the replay says whether the library holds one
  if (DOCTRINAL.has(route) && hits.length && !hits.some(AUTHORITATIVE)) {
    const held = (turn.replay?.hits || []).find(AUTHORITATIVE);
    if (held) add('RETRIEVAL', 'best-copy-missed', `held but missed: ${copyClass(held)} ${label(held)} (replay with a Writings filter)`, { held: { title: held.title, doc_id: held.doc_id, rank: held.rank } });
    else add('HOLDINGS', 'no-authoritative-copy', `no Writing or Guardian text in the hits${turn.replay ? ' or the Writings replay' : ' (replay not run)'}`, { replay: !!turn.replay });
  } else if (DOCTRINAL.has(route) && best && copyRank(best) > 1 && turn.replay) {
    const held = (turn.replay.hits || []).find((h) => copyRank(h) < copyRank(best) && !isOriginal(h));
    if (held) add('RETRIEVAL', 'best-copy-missed', `held but missed: ${copyClass(held)} ${label(held)}; the best in the hits was ${copyClass(best)} ${label(best)}`, { held: { title: held.title, doc_id: held.doc_id } });
  }

  defects.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
  return { v: FORENSIC_V, route, defects, searches: perSearch,
    best_copy: best ? { rank: best.rank, title: best.title, doc_id: best.doc_id, class: copyClass(best) } : null,
    cited_copy: citedBest ? { rank: citedBest.rank, title: citedBest.title, doc_id: citedBest.doc_id, class: copyClass(citedBest) } : null };
}

/** One line per defect — what the LLM auditor and the CLI read. */
export const defectLines = (f) => (f?.defects || []).map((d) => `${d.stage} ${d.class}: ${d.detail}`);

// ── the work queue: defects over a period, grouped stage × class ─────────────────────────────────────────────────────
/** rows: [{ message_id, session_id, asked_at, f: forensicPass output }] for this period; prev: the same for the period
 *  before → [{ stage, class, n, prev, trend, fix_where, examples: [{ message_id, thread, detail }] }], worst first. Pure. */
export function forensicQueue(rows = [], prev = [], { stage = null, examples = 3 } = {}) {
  const tally = (rs) => {
    const m = new Map();
    for (const r of rs) for (const d of r.f?.defects || []) {
      if (stage && d.stage !== stage.toUpperCase()) continue;
      const k = `${d.stage}|${d.class}`;
      const e = m.get(k) || { stage: d.stage, class: d.class, n: 0, fix_where: d.fix_where || FIX_WHERE[d.class] || null, examples: [] };
      e.n++;
      if (e.examples.length < examples) e.examples.push({ message_id: r.message_id, thread: r.session_id, turn_id: r.turn_id ?? null, detail: d.detail,
        ...(r.turn_id ? { trace: `/api/admin/anis/turns/${r.turn_id}/trace` } : {}) });
      m.set(k, e);
    }
    return m;
  };
  const now = tally(rows), before = tally(prev);
  const out = [...now.values()].map((e) => { const p = before.get(`${e.stage}|${e.class}`)?.n || 0; return { ...e, prev: p, trend: e.n - p }; });
  for (const [k, e] of before) if (!now.has(k)) out.push({ ...e, n: 0, prev: e.n, trend: -e.n, examples: [] });
  const searches = rows.reduce((n, r) => n + (r.f?.searches?.length || 0), 0);
  const badSearches = rows.reduce((n, r) => n + (r.f?.searches || []).filter((s) => s.verdict === 'defect').length, 0);
  return { replies: rows.length, clean: rows.filter((r) => !(r.f?.defects || []).length).length, searches, searches_with_defects: badSearches,
    queue: out.sort((a, b) => b.n - a.n || STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)) };
}

/** The queue as a text table (ops.mjs anis-forensics). */
export function forensicTable(q) {
  const lines = [`replies ${q.replies} (clean ${q.clean}) · searches ${q.searches} (${q.searches_with_defects} with defects)`, '',
    `${'STAGE'.padEnd(10)} ${'CLASS'.padEnd(22)} ${'N'.padStart(4)} ${'PREV'.padStart(5)} ${'TREND'.padStart(6)}  FIX WHERE`];
  for (const e of q.queue) {
    lines.push(`${e.stage.padEnd(10)} ${e.class.padEnd(22)} ${String(e.n).padStart(4)} ${String(e.prev).padStart(5)} ${(e.trend > 0 ? `+${e.trend}` : String(e.trend)).padStart(6)}  ${e.fix_where || ''}`);
    for (const x of e.examples) lines.push(`${''.padEnd(12)}· #${x.message_id} ${x.detail}`);
  }
  return lines.join('\n');
}
