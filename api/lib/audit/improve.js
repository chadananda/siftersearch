// Improvement cycle, pure half (Chad 11-04): Opus 5.5 JUDGES every search trace and reply on compact input (forensic
// findings + ranked hits with tiers; rubric prompt-cached); WEAK items get DEEP analysis → improvement suggestions,
// deduped into a durable log (evidence count grows instead of duplicates). No I/O here; the worker is api/workers/improve-worker.js.
import { getModel } from '../model-registry.js';
import { modelFor } from '../model-roles.js';
import { STAGES, FIX_WHERE, COPY_CLASSES, copyClass, routeOf, forensicPass, forensicQueue } from './forensics.js';
import { TARGETS, inferTarget, targetOf, targetClass } from './improve-targets.js';
import { runStateOf } from './behavior-proposal.js';

export const IMPROVE_V = 1;
export const JUDGE_ROLE = 'search-judge', DEEP_ROLE = 'improve-analysis';

// ── the judge rubric: fixed text, sent as the cached system block (kept above the 1024-token cache minimum) ──
export const JUDGE_SYSTEM = `You are the quality judge for Anís, the Ocean AI Research Assistant: a research assistant over a library of
Bahá'í and interfaith literature. You judge ONE item: either a single search (its query, route and ranked hits) or one
reply (the question, the reply text, the searches behind it and the passages the writer had). You decide whether the
item is PASS or WEAK and name the weakness classes. You never rewrite the reply and you never answer the question.

SOURCE ORDER (authority, strongest first). Every judgement of ranking and citation follows it:
1. se-translation — a Writing of Bahá'u'lláh, the Báb or 'Abdu'l-Bahá in Shoghi Effendi's translation (Gleanings, the
   Kitáb-i-Íqán, the Hidden Words, Epistle to the Son of the Wolf, Prayers and Meditations, the Will and Testament).
2. writing — another authorised translation of a Writing, or a Writing in its Persian/Arabic original.
3. compilation — a published compilation of Writings (Tablets of Bahá'u'lláh, Selections, compiled extracts).
4. quoted-authoritative — the Writings quoted inside Shoghi Effendi's own works or letters (his words carry interpretive
   authority; letters written on his behalf count as his).
5. reported — talks, table talks and pilgrims' notes: reported speech, never a Writing; it must be named as spoken.
6. secondary — periodicals (Star of the West, The Bahá'í World), institutional statements, scholarship, commentary.
The Universal House of Justice has no doctrinal weight on what the Writings say; its letters are secondary for that purpose.
The same passage often appears in several sources. The best copy is the one highest in this order; a periodical that
prints a Tablet is a WEAKER copy of that Tablet, even when its wording matches exactly.

STAGES (every weakness belongs to exactly one; name the stage that must change, not the one where it became visible):
- STRATEGY: the route chose the wrong searches — a quote/source/teachings question with no original-language
  (Persian/Arabic) search, a teachings question with no Writings-filtered pass, the wrong route for the question.
- RETRIEVAL: the best copy was never retrieved (recall), zero hits, a filter that excluded what was needed.
- RANK: an authoritative copy ranked below a weaker copy of the same passage, or Writings below commentary on a
  doctrinal route (authority inversion, writings buried).
- SELECTION: the writer was given, or cited, a weaker copy when a stronger one was in the hits; no Writing cited on a
  doctrinal question when one was available.
- WRITER: the reply talks about its own process ("the search results show"), clips a quotation with an ellipsis,
  leaves a bare URL instead of linking the citation text, offers to search instead of answering, attributes a passage
  to the wrong author, presents reported speech as a Writing, pads a short question with a long answer.
- LATENCY: a stage over its budget (the findings name the stage and its budget).
- HOLDINGS: nothing authoritative is held for this passage — a library gap, not a code defect.

DETERMINISTIC FINDINGS: each item comes with findings from a rule-based forensic pass ("STAGE class: detail"). They are
usually right but can be wrong (a title heuristic may misclass a copy). Confirm, reject or add to them from the hits
themselves. A finding you reject is not a weakness. Weakness you see that no rule caught is the most valuable output.

WEAK means a reader would have been better served by a different search, ranking, selection or wording that the
library could have supported. A latency finding alone is WEAK only when the stage is more than three times its budget.
A pure library gap (HOLDINGS) is WEAK with stage HOLDINGS. Small style preferences are not weaknesses.

Known classes (prefer these names; coin a short kebab-case class only when none fits):
${Object.keys(FIX_WHERE).join(', ')}, wrong-route, padded-answer, missed-question.

OUTPUT: exactly one JSON object and nothing else:
{"verdict":"pass"|"weak","score":0-10,"classes":["kebab-class",...],"stage":"${STAGES.join('|')}"|null,"severity":1|2|3,"why":"one or two sentences naming the hit numbers and titles"}
When stage is STRATEGY because a Jev decision gate chose the wrong option, you may add "gate":"<anis-strategy|anis-triage|anis-quote-or-book|anis-format>" and "right":"<the option that should have been chosen>" (it becomes that gate's test label); omit both when unsure.
severity: 3 = the reader got a wrong or weaker source on a doctrinal question; 2 = a real but recoverable weakness;
1 = minor. For a pass, classes is [] and stage is null and severity is 0.
score: the overall quality of the item for this reader, an integer 0-10 (10 = the best answer the library allows, 7 = good with
small flaws, 4 = a real weakness, 0 = wrong or useless). Give it for every item, pass or weak; it is compared across strategies.`;

// ── compact input: what the judge needs and nothing more (bounded text, tiers precomputed) ──
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
export const compactHit = (h, n = 160) => `#${h.rank ?? '?'} [${h.tier || (h.tier_gap ? `no tier (${h.tier_gap})` : copyClass(h))}${h.language ? ` ${h.language}` : ''}] ${clip(h.title, 80)}`
  + `${h.author ? ` — ${clip(h.author, 40)}` : ''}${h.text ? `: ${clip(h.text, n)}` : ''}`;

/** One judge input. item = { kind:'search'|'reply', route, question, query?, tool?, hits?, reply?, searches?, defects } */
export function judgeMessage(item, { maxHits = 12 } = {}) {
  const L = [`ITEM: ${item.kind}${item.route ? ` · route ${item.route}` : ''}`];
  if (item.question) L.push(`QUESTION: ${clip(item.question, 400)}`);
  const searches = item.kind === 'search' ? [item] : (item.searches || []);
  for (const s of searches) {
    L.push(`SEARCH ${s.tool || '?'}${s.query ? ` "${clip(s.query, 160)}"` : ''}${s.filters && Object.keys(s.filters).length ? ` filters ${JSON.stringify(s.filters)}` : ''}`
      + `${s.timings?.total != null ? ` ${s.timings.total} ms` : ''}`);
    for (const h of (s.hits || []).slice(0, maxHits)) L.push(`  ${compactHit(h)}`);
    if (!(s.hits || []).length) L.push('  (no hits recorded)');
  }
  if (item.kind === 'reply') {
    if (item.writer_passages?.length) { L.push('WRITER HAD:'); for (const h of item.writer_passages.slice(0, maxHits)) L.push(`  ${compactHit(h, 100)}`); }
    L.push(`REPLY: ${clip(item.reply, 1500)}`);
  }
  L.push(`FINDINGS: ${(item.defects || []).length ? item.defects.map((d) => `${d.stage} ${d.class}: ${d.detail}`).join(' | ') : 'none'}`);
  return L.join('\n');
}

const firstJson = (t) => { const m = String(t || '').match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
/** The judge's text → { verdict, score, classes, stage, severity, why } (score 0-10, null on verdicts from before 11-04) (unparseable → null: the item is retried, never guessed). */
export function parseJudge(text) {
  const j = firstJson(text);
  if (!j || !['pass', 'weak'].includes(j.verdict)) return null;
  const classes = (Array.isArray(j.classes) ? j.classes : []).map((c) => String(c).toLowerCase().replace(/[^a-z0-9-]+/g, '-')).filter(Boolean).slice(0, 8);
  const stage = STAGES.includes(String(j.stage || '').toUpperCase()) ? String(j.stage).toUpperCase() : null;
  const severity = j.verdict === 'pass' ? 0 : Math.min(3, Math.max(1, Number(j.severity) || 2));
  const n = Number(j.score);
  const score = j.score != null && Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : null;
  return { verdict: j.verdict, score, classes: j.verdict === 'pass' ? [] : classes, stage: j.verdict === 'pass' ? null : stage, severity, why: clip(j.why, 400),
    ...(j.verdict === 'weak' && typeof j.gate === 'string' && typeof j.right === 'string' && j.gate && j.right ? { gate: clip(j.gate, 60), right: clip(j.right, 80) } : {}) };
}

// ── deep analysis: weak items only; replay + full passages + the code stage map → suggestions ──
export const DEEP_SYSTEM = `You are the improvement analyst for Anís (a research assistant over a Bahá'í and interfaith library).
A judge found the item below WEAK. You get the judge's verdict, the deterministic findings, the full passages, a replay
of the search on today's code (Writings-tier rows first; old_rank shows how it moved), and the code map (which file and
function owns each stage). Find the ROOT cause in code and propose the smallest change that fixes the CLASS of failure,
never this one question: no rule that names this question's words, titles or doc ids. A library gap is not a code change:
for HOLDINGS say what to acquire. Source order: se-translation > writing > compilation > quoted-authoritative > reported > secondary.
TARGET — who can apply the change. DATA (the live loop may apply it): "strategy" (a route recipe / strategy definition),
"step" (one step's parameters inside a strategy), "template" (an answer template or format). CODE (an engineer applies it):
"activity" (api/lib/assistant/activities), "tool" (a search/lookup tool), "index" (search, ranking, Qdrant/phrase index,
embeddings), "writer-code" (the writer's prompt, quoting, linting), "other-code". Prefer a DATA target when a strategy
change alone fixes the class; name a CODE target when it cannot. For a DATA target, "strategy" names the strategy id it edits.
SCENARIOS — a proposal and its acceptance tests come together. Every CODE suggestion carries 1-3 executable acceptance
scenarios (a runner replays the examples and checks the trace). given.reader names the reader and the CLASS of context,
never this question ("a reader asking where a known quotation comes from"); given.history (optional) prior turns as short
class descriptions; when.asks the class of request; when.examples 2-3 concrete SYNTHETIC questions of that class (not this
question, not its words); then: checks, deterministic first — "strategy" (expect: the strategy id chosen), "tool_called" /
"tool_not_called" (expect: tool name), "source_tier" (expect: the tier the top cited source must have), "cites_original"
(expect: what original is cited first), "links_book" (expect: which book is linked); "judge" (expect: a criterion the judge
grades) only when no trace field can show it.
OUTPUT: exactly one JSON object: {"diagnosis":"what went wrong for the reader, in one or two sentences",
"root_cause":"the code-level cause (stage, file, function) behind it","suggestions":[{"stage":"STAGE","file":"path/to/file.js","fn":"functionName or null",
"target":"strategy|step|template|activity|tool|index|writer-code|other-code","strategy":"strategy id or null","change":"what to change, concretely","expected_effect":"what gets better, for which class of question",
"scenarios":[{"title":"…","given":{"reader":"…","history":["…"]},"when":{"asks":"…","examples":["…","…"]},"then":[{"check":"tool_called","expect":"…"}]}],
"classes":["kebab-class"],"severity":1|2|3}]} — at most 3 suggestions, most important first.`;

export const SCENARIO_CHECKS = ['strategy', 'tool_called', 'tool_not_called', 'source_tier', 'cites_original', 'links_book', 'judge'];
const strs = (xs, n, len) => (Array.isArray(xs) ? xs : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, n).map((x) => clip(x.trim(), len));
/** One acceptance scenario → the validated shape, or null when malformed (the suggestion is kept; only the scenario drops).
 *  Needs given.reader, when.asks, 2-3 examples and at least one known check with an expect. */
export function parseScenario(s) {
  if (!s || typeof s !== 'object') return null;
  const reader = clip(s.given?.reader, 300), asks = clip(s.when?.asks, 300);
  const examples = strs(s.when?.examples, 3, 300);
  const then = (Array.isArray(s.then) ? s.then : []).filter((c) => c && SCENARIO_CHECKS.includes(c.check) && typeof c.expect === 'string' && c.expect.trim())
    .slice(0, 6).map((c) => ({ check: c.check, expect: clip(c.expect.trim(), 300) }));
  if (!reader || !asks || examples.length < 2 || !then.length) return null;
  return { title: clip(s.title, 160) || clip(asks, 160), given: { reader, history: strs(s.given?.history, 4, 200) }, when: { asks, examples }, then };
}
export const parseScenarios = (xs) => (Array.isArray(xs) ? xs : []).slice(0, 3).map(parseScenario).filter(Boolean);
/** A stored row's scenarios (scenarios_json text, or the parsed array) → validated scenarios ([] for rows from before). */
export const scenariosOf = (r) => {
  const v = r?.scenarios ?? r?.scenarios_json;
  if (!v) return [];
  try { return parseScenarios(typeof v === 'string' ? JSON.parse(v) : v); } catch { return []; }
};

export function deepMessage(item, judge, { replay = null, passages = [], codeMap = FIX_WHERE } = {}) {
  const L = [judgeMessage(item, { maxHits: 20 }), `JUDGE: ${judge.verdict} ${judge.stage || ''} [${(judge.classes || []).join(', ')}] — ${judge.why || ''}`];
  if (replay?.hits?.length) { L.push(`REPLAY (${replay.filter || 'current code'}):`); for (const h of replay.hits.slice(0, 12)) L.push(`  ${compactHit(h, 240)}`); }
  else L.push('REPLAY: none available');
  if (passages.length) { L.push('PASSAGES:'); for (const p of passages.slice(0, 8)) L.push(`  ${p.title || '?'}${p.author ? ` — ${p.author}` : ''}: ${clip(p.text, 1200)}`); }
  const relevant = new Set([...(judge.classes || []), ...(item.defects || []).map((d) => d.class)]);
  const map = Object.entries(codeMap).filter(([k]) => !relevant.size || relevant.has(k));
  L.push('CODE MAP:', ...(map.length ? map : Object.entries(codeMap)).map(([k, v]) => `  ${k}: ${v}`));
  return L.join('\n');
}

export function parseSuggestions(text) {
  const j = firstJson(text);
  return (Array.isArray(j?.suggestions) ? j.suggestions : []).slice(0, 3).map((s) => {
    const stage = STAGES.includes(String(s.stage || '').toUpperCase()) ? String(s.stage).toUpperCase() : 'STRATEGY';
    const file = clip(s.file, 200) || null, t = String(s.target || '').toLowerCase().trim();
    return { stage, file, fn: s.fn ? clip(s.fn, 120) : null,
      target: TARGETS.includes(t) ? t : inferTarget({ stage, file }),   // the analyst names it; inferred when unnamed or invalid
      change: clip(s.change, 1200), expected_effect: clip(s.expected_effect, 600),
      strategy: typeof s.strategy === 'string' && s.strategy.trim() && s.strategy !== 'null' ? clip(s.strategy.trim(), 80) : null,
      scenarios: parseScenarios(s.scenarios),
      classes: (Array.isArray(s.classes) ? s.classes : []).map(String).slice(0, 6),
      severity: Math.min(3, Math.max(1, Number(s.severity) || 2)) };
  }).filter((s) => s.change);
}

/** The analyst's text → { diagnosis, root_cause, suggestions } (the conclusion the report page shows beside its fixes). */
export function parseDeep(text) {
  const j = firstJson(text);
  return { diagnosis: j?.diagnosis ? clip(j.diagnosis, 1200) : null, root_cause: j?.root_cause ? clip(j.root_cause, 1200) : null, suggestions: parseSuggestions(text) };
}

// ── dedup: the same fix seen again adds evidence, it does not add a row ──
const toks = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 3));
export const jaccard = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / (A.size + B.size - n); };
const fileKey = (f) => String(f || '').split(/[\s·,]+/)[0].replace(/^\.?\//, '');
export function sameSuggestion(a, b) {
  if (a.stage !== b.stage || fileKey(a.file) !== fileKey(b.file)) return false;
  if (a.fn && b.fn && a.fn === b.fn) return true;
  return jaccard(a.change, b.change) >= 0.45;
}
/** open = existing open/accepted suggestions; incoming = parsed suggestions for one item. → { inserts, bumps:[{id, evidence_key, severity}] } */
export function mergeSuggestions(open = [], incoming = [], evidenceKey) {
  const inserts = [], bumps = [];
  for (const s of incoming) {
    const hit = open.find((o) => sameSuggestion(o, s)) || inserts.find((o) => sameSuggestion(o, s));
    if (hit?.id != null) { if (!bumps.some((b) => b.id === hit.id)) bumps.push({ id: hit.id, evidence_key: evidenceKey, severity: s.severity, scenarios: s.scenarios?.length ? s.scenarios : null, strategy: s.strategy ?? null }); }
    else if (!hit) inserts.push({ ...s, evidence: [evidenceKey] });
  }
  return { inserts, bumps };
}
export const rankImprovements = (rows) => [...rows].map((r) => ({ ...r, score: (r.evidence_n || 1) * (r.severity || 1) }))
  .sort((a, b) => b.score - a.score || String(b.last_seen).localeCompare(String(a.last_seen)));

// ── work order under a cap: delay, never drop ──
// 0 deep on a weak reply · 1 judge a new reply · 2 deep on a weak search · 3 judge a new search · 4 backfill (judge, older)
export function priorityOf({ kind, step, backfill = false }) {
  if (backfill) return 4;
  if (step === 'deep') return kind === 'reply' ? 0 : 2;
  return kind === 'reply' ? 1 : 3;
}

// ── cost from the model registry (per-1K prices; cache read = cacheRead × input, 5-min cache write = 1.25 × input) ──
export function costOf(u = {}, model = modelFor(JUDGE_ROLE).model) {
  const m = getModel(model) || {}, inK = (m.pricing?.input ?? 0) / 1000, outK = (m.pricing?.output ?? 0) / 1000;
  const cached = u.cachedTokens || 0, wrote = u.cacheWriteTokens || 0, fresh = Math.max(0, (u.promptTokens || 0) - cached - wrote);
  return fresh * inK + cached * inK * (m.cacheRead ?? 0.1) + wrote * inK * 1.25 + (u.completionTokens || 0) * outK;
}
/** $/day from per-item costs and daily volumes. */
export const projectDaily = ({ judgeUsd, deepUsd, repliesPerDay, searchesPerDay, weakRate }) => {
  const judged = repliesPerDay + searchesPerDay;
  return { judged, deep: judged * weakRate, usd: judged * judgeUsd + judged * weakRate * deepUsd };
};

// ── adapters: stored rows → the forensic turn shape ──
const evHit = (e, i) => ({ rank: i + 1, doc_id: e.doc_id ?? e.docId ?? null, title: e.title, author: e.author, language: e.language || e.lang, text: e.text, url: e.url, tier: e.tier });
/** A chat_messages reply (question, reply text, path_json) + its trace rows (with hits, when introspection stored them) → turn. */
export function turnFromPath({ question, reply, path = {}, traces = [] }) {
  const p = path || {};
  const evidence = (p.evidence || []).map(evHit);
  const steps = p.plan?.research?.steps || [];
  const searches = traces.length
    ? traces.map((t) => ({ trace_id: t.trace_id, tool: t.tool || t.endpoint, query: t.query, filters: t.filters || {}, timings: t.timings || {}, hits: t.hits || [] }))
    : steps.filter((s) => /search|lookup/.test(s.tool || '')).map((s, i) => ({ trace_id: null, tool: s.tool, query: s.args?.query || s.args?.q || '', filters: s.args || {},
      hits: i === 0 ? evidence : [] }));
  if (!searches.length && evidence.length) searches.push({ trace_id: null, tool: p.recipe || 'retrieval', query: p.plan?.search_query || question, filters: {}, hits: evidence });
  const urls = new Set((String(reply || '').match(/\]\((https?:[^)\s]+)\)/g) || []).map((m) => m.slice(2, -1)));
  const cited = evidence.filter((e) => e.url && urls.has(e.url)).map((e) => ({ doc_id: e.doc_id, title: e.title }));
  return { route: routeOf(p.recipe || p.plan?.shape), strategy: p.strategy?.choice ?? null, question, reply, searches, writer_passages: evidence, cited };
}

/** Forensic + judge item for a reply; one per search (each trace gets its own verdict). */
export function itemsForTurn(turn, { messageId, sessionId, turnId = null } = {}) {
  const f = forensicPass(turn);
  const reply = { key: `reply:${messageId}`, kind: 'reply', ref_id: String(messageId), session_id: sessionId ?? null, turn_id: turnId, route: f.route, strategy: turn.strategy ?? null,
    question: turn.question, reply: turn.reply, searches: turn.searches, writer_passages: turn.writer_passages, defects: f.defects };
  const searches = f.searches.filter((s) => s.trace_id).map((s) => {
    const src = turn.searches.find((x) => x.trace_id === s.trace_id) || {};
    return { key: `search:${s.trace_id}`, kind: 'search', ref_id: s.trace_id, session_id: sessionId ?? null, turn_id: turnId, route: f.route, question: turn.question,
      tool: src.tool, query: src.query, filters: src.filters, timings: src.timings, hits: src.hits, defects: s.defects };
  });
  return { forensic: f, reply, searches };
}

/** GET /api/admin/anis/forensics: stored rows (improve-repo forensicsSince) for the period + the period before →
 *  the stage × class queue for replies and for searches, and the judge's tally (pass/weak, weak classes, $). Pure. */
export function forensicsReport(rows = [], prevRows = [], { stage = null, examples = 3 } = {}) {
  const asQ = (rs, kind) => rs.filter((r) => r.kind === kind).map((r) => ({ message_id: r.ref_id, session_id: r.session_id, turn_id: r.turn_id ?? null, asked_at: r.asked_at,
    f: { defects: r.defects || [], searches: kind === 'search' ? [{ verdict: (r.defects || []).length ? 'defect' : 'ok' }] : [] } }));
  const judged = rows.filter((r) => r.judge);
  const weak = judged.filter((r) => r.judge.verdict === 'weak');
  const byClass = {};
  for (const r of weak) for (const c of r.judge.classes || []) byClass[c] = (byClass[c] || 0) + 1;
  const usd = rows.reduce((a, r) => a + (r.judge_usd || 0) + (r.deep_usd || 0), 0);
  return {
    replies: forensicQueue(asQ(rows, 'reply'), asQ(prevRows, 'reply'), { stage, examples }),
    searches: forensicQueue(asQ(rows, 'search'), asQ(prevRows, 'search'), { stage, examples }),
    judge: { judged: judged.length, pending: rows.length - judged.length, weak: weak.length, weak_rate: judged.length ? +(weak.length / judged.length).toFixed(3) : null,
      weak_classes: Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([cls, n]) => ({ class: cls, n })),
      usd: +usd.toFixed(4), usd_per_item: judged.length ? +(usd / judged.length).toFixed(5) : null },
  };
}

/** GET /api/admin/anis/improve-report: improve-repo improveReportData() + the improve group's cap status → audits (weak
 *  verdicts) → conclusions (deep analyses) → solutions (ranked improvements with their evidence audits), every item linked
 *  by item_key, with the admin links to its trace, replay and thread. Pure. */
export function improveReport(data, { days = 7, cap = null, filters = {} } = {}) {
  const j = (s) => { if (s && typeof s === 'object') return s; try { return JSON.parse(s); } catch { return null; } };
  const links = (r) => {
    const turn = r.turn_id || null;
    return {
      trace: turn ? `/api/admin/anis/turns/${encodeURIComponent(turn)}/trace` : r.kind === 'search' ? `/api/admin/search-trace/${encodeURIComponent(r.ref_id)}` : null,
      replay: turn ? `/api/admin/anis/turns/${encodeURIComponent(turn)}/replay` : r.kind === 'search' ? `/api/admin/search-trace/${encodeURIComponent(r.ref_id)}/replay` : null,
      thread: r.session_id ? `/admin/anis#threads:${encodeURIComponent(r.session_id)}` : null,
    };
  };
  const base = (r) => ({ item_key: r.item_key, kind: r.kind, ref_id: r.ref_id, session_id: r.session_id ?? null, turn_id: r.turn_id ?? null,
    question: r.question ?? null, route: r.route ?? null, asked_at: r.asked_at ?? null, links: links(r) });
  const d = data || { pipeline: [], spend: {}, audits: [], conclusions: [], improvements: [], evidence: new Map() };
  const solutions = rankImprovements(d.improvements.map((r) => ({ ...r, classes: j(r.classes_json) || [], evidence: j(r.evidence_json) || [] })))
    .map(({ classes_json, evidence_json, ...r }) => ({ ...r, target: targetOf(r), target_class: targetClass(targetOf(r)), target_inferred: !TARGETS.includes(r.target),
      evidence_audits: r.evidence.map((k) => { const e = d.evidence.get(k); const v = j(e?.judge_json); return e ? { ...base(e), why: v?.why ?? null, stage: v?.stage ?? null } : { item_key: k, missing: true }; }) }));
  // a conclusion links to its fixes: the ids it recorded, else (deep runs before deep_json) the improvements whose evidence names it
  const conclusions = d.conclusions.map((r) => {
    const deep = j(r.deep_json), v = j(r.judge_json);
    const ids = deep?.improvement_ids || solutions.filter((s) => s.evidence.includes(r.item_key)).map((s) => s.id);
    return { ...base(r), diagnosis: deep?.diagnosis ?? null, root_cause: deep?.root_cause ?? null, recorded: !!deep, judge_why: v?.why ?? null,
      judge_stage: v?.stage ?? null, improvement_ids: ids, deep_usd: r.deep_usd ?? 0, deep_at: r.deep_at ?? null };
  });
  const audits = d.audits.map((r) => {
    const v = j(r.judge_json) || {};
    return { ...base(r), verdict: v.verdict ?? null, severity: v.severity ?? null, stage: v.stage ?? null, classes: v.classes || [], why: v.why ?? null,
      gate: v.gate ?? null, right: v.right ?? null, defects: j(r.defects_json) || [], deep_state: r.deep_state, judged_at: r.judged_at ?? null,
      usd: +((r.judge_usd || 0) + (r.deep_usd || 0)).toFixed(4), improvement_ids: solutions.filter((s) => s.evidence.includes(r.item_key)).map((s) => s.id) };
  });
  const sum = (k) => d.pipeline.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const total = Object.fromEntries(['items', 'judged', 'weak', 'deep_done', 'judge_pending', 'deep_pending', 'judged_last_hour', 'deep_last_hour', 'stuck'].map((k) => [k, sum(k)]));
  return {
    generated_at: new Date().toISOString(), days, filters, available: !!data,
    pipeline: { total: { ...total, weak_rate: total.judged ? +(total.weak / total.judged).toFixed(3) : null },
      by_kind: Object.fromEntries(d.pipeline.map(({ kind, ...r }) => [kind, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v) || 0]))])) },
    spend: { today_usd: cap?.spent_usd ?? d.spend?.today_usd ?? 0, today_store_usd: d.spend?.today_usd ?? 0, window_usd: d.spend?.window_usd ?? 0,
      cap_usd: cap?.cap_usd ?? null, remaining_usd: cap?.remaining_usd ?? null, blocking: !!cap?.blocking },
    audits, conclusions, solutions,
  };
}

/** GET /api/admin/anis/improve-digest (Chad 11-04: "Claude Code should check these daily") — terse, for an agent: the
 *  assessment since `since` (judged, weak %, mean severity of weak verdicts — the judge gives no numeric score —, top defect
 *  classes, spend), CODE recommendations that are new or gained evidence since then (with 2 example turns + trace links),
 *  and DATA changes proposed or applied since then. data = improve-repo improveDigestData(). Pure. */
export function improveDigest(data, { since, cap = null } = {}) {
  const d = data || { judged: [], spend_usd: 0, improvements: [], evidence: new Map() };
  const S = new Date(Date.parse(since)).toISOString().slice(0, 19).replace('T', ' ');   // the store's timestamp format
  const j = (s) => { if (s && typeof s === 'object') return s; try { return JSON.parse(s); } catch { return null; } };
  const verdicts = d.judged.map((r) => j(r.judge_json) || {});
  const weak = verdicts.filter((v) => v.verdict === 'weak');
  const count = (xs) => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  const sev = weak.map((v) => Number(v.severity)).filter(Number.isFinite);
  const example = (k) => { const e = d.evidence.get(k); if (!e) return null;
    const turn = e.turn_id || null;
    return { item_key: k, turn_id: turn, judged_at: e.judged_at ?? null,
      trace: turn ? `/api/admin/anis/turns/${encodeURIComponent(turn)}/trace` : e.kind === 'search' ? `/api/admin/search-trace/${encodeURIComponent(e.ref_id)}` : null,
      thread: e.session_id ? `/admin/anis#threads:${encodeURIComponent(e.session_id)}` : null }; };
  const rows = rankImprovements(d.improvements.map((r) => ({ ...r, evidence: j(r.evidence_json) || [], target: targetOf(r) })));
  const fresh = (k) => (d.evidence.get(k)?.judged_at || '') >= S;
  const code = rows.filter((r) => targetClass(r.target) === 'code' && ['open', 'accepted'].includes(r.status))
    .map((r) => ({ r, evidence_new: r.evidence.filter(fresh).length, is_new: (r.first_seen || '') >= S }))
    .filter((x) => x.is_new || x.evidence_new > 0)
    .map(({ r, evidence_new, is_new }) => ({ id: r.id, new: is_new, status: r.status, target: r.target, stage: r.stage, file: r.file, fn: r.fn,
      scenarios: scenariosOf(r), change: r.change, expected_effect: r.expected_effect, severity: r.severity, evidence_n: r.evidence_n, evidence_new, score: r.score,
      examples: [...r.evidence].reverse().map(example).filter(Boolean).slice(0, 2) }));
  const dataChanges = rows.filter((r) => targetClass(r.target) === 'data' && ((r.first_seen || '') >= S || (r.status_at || '') >= S))
    .map((r) => ({ id: r.id, state: r.status === 'done' ? 'applied' : r.status === 'rejected' ? 'rejected' : 'proposed', status: r.status,
      target: r.target, stage: r.stage, change: r.change, evidence_n: r.evidence_n, severity: r.severity, status_note: r.status_note ?? null }));
  return {
    since, generated_at: new Date().toISOString(), available: !!data,
    assessment: { judged: verdicts.length, weak: weak.length, weak_pct: verdicts.length ? +(100 * weak.length / verdicts.length).toFixed(1) : null,
      mean_severity: sev.length ? +(sev.reduce((a, b) => a + b, 0) / sev.length).toFixed(2) : null, score_note: 'judge has no numeric score; mean_severity is over weak verdicts (1-3)',
      by_stage: Object.fromEntries(count(weak.map((v) => v.stage || '?'))),
      top_classes: count(weak.flatMap((v) => v.classes || [])).slice(0, 8).map(([cls, n]) => ({ class: cls, n })),
      spend_usd: +(d.spend_usd || 0).toFixed(4), cap_usd: cap?.cap_usd ?? null, spent_today_usd: cap?.spent_usd ?? null },
    code, data: dataChanges,
    // proposed tool improvements: every waiting CODE proposal with scenarios + its behaviour run state; one already passing may be stale
    proposals: (d.proposals || []).map((r) => ({ ...r, target: targetOf(r) })).filter((r) => targetClass(r.target) === 'code').map((r) => {
      const scenarios = scenariosOf(r), run = runStateOf(r.id, scenarios, d.runs || new Map());
      return { id: r.id, status: r.status, target: r.target, file: r.file, fn: r.fn, change: r.change, scenarios, run: run.state, run_at: run.at, stale: run.state === 'passing' };
    }).filter((p) => p.scenarios.length),
  };
}

export { COPY_CLASSES };
