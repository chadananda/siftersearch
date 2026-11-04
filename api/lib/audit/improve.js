// Improvement cycle, pure half (Chad 11-04): Opus 5.5 JUDGES every search trace and reply on compact input (forensic
// findings + ranked hits with tiers; rubric prompt-cached); WEAK items get DEEP analysis → improvement suggestions,
// deduped into a durable log (evidence count grows instead of duplicates). No I/O here; the worker is api/workers/improve-worker.js.
import { getModel } from '../model-registry.js';
import { modelFor } from '../model-roles.js';
import { STAGES, FIX_WHERE, COPY_CLASSES, copyClass, routeOf, forensicPass, forensicQueue } from './forensics.js';

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
{"verdict":"pass"|"weak","classes":["kebab-class",...],"stage":"${STAGES.join('|')}"|null,"severity":1|2|3,"why":"one or two sentences naming the hit numbers and titles"}
When stage is STRATEGY because a Jev decision gate chose the wrong option, you may add "gate":"<anis-strategy|anis-triage|anis-quote-or-book|anis-format>" and "right":"<the option that should have been chosen>" (it becomes that gate's test label); omit both when unsure.
severity: 3 = the reader got a wrong or weaker source on a doctrinal question; 2 = a real but recoverable weakness;
1 = minor. For a pass, classes is [] and stage is null and severity is 0.`;

// ── compact input: what the judge needs and nothing more (bounded text, tiers precomputed) ──
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
export const compactHit = (h, n = 160) => `#${h.rank ?? '?'} [${h.tier || copyClass(h)}${h.language ? ` ${h.language}` : ''}] ${clip(h.title, 80)}`
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
/** The judge's text → { verdict, classes, stage, severity, why } (unparseable → null: the item is retried, never guessed). */
export function parseJudge(text) {
  const j = firstJson(text);
  if (!j || !['pass', 'weak'].includes(j.verdict)) return null;
  const classes = (Array.isArray(j.classes) ? j.classes : []).map((c) => String(c).toLowerCase().replace(/[^a-z0-9-]+/g, '-')).filter(Boolean).slice(0, 8);
  const stage = STAGES.includes(String(j.stage || '').toUpperCase()) ? String(j.stage).toUpperCase() : null;
  const severity = j.verdict === 'pass' ? 0 : Math.min(3, Math.max(1, Number(j.severity) || 2));
  return { verdict: j.verdict, classes: j.verdict === 'pass' ? [] : classes, stage: j.verdict === 'pass' ? null : stage, severity, why: clip(j.why, 400),
    ...(j.verdict === 'weak' && typeof j.gate === 'string' && typeof j.right === 'string' && j.gate && j.right ? { gate: clip(j.gate, 60), right: clip(j.right, 80) } : {}) };
}

// ── deep analysis: weak items only; replay + full passages + the code stage map → suggestions ──
export const DEEP_SYSTEM = `You are the improvement analyst for Anís (a research assistant over a Bahá'í and interfaith library).
A judge found the item below WEAK. You get the judge's verdict, the deterministic findings, the full passages, a replay
of the search on today's code (Writings-tier rows first; old_rank shows how it moved), and the code map (which file and
function owns each stage). Find the ROOT cause in code and propose the smallest change that fixes the CLASS of failure,
never this one question: no rule that names this question's words, titles or doc ids. A library gap is not a code change:
for HOLDINGS say what to acquire. Source order: se-translation > writing > compilation > quoted-authoritative > reported > secondary.
OUTPUT: exactly one JSON object: {"suggestions":[{"stage":"STAGE","file":"path/to/file.js","fn":"functionName or null",
"change":"what to change, concretely","expected_effect":"what gets better, for which class of question","classes":["kebab-class"],
"severity":1|2|3}]} — at most 3 suggestions, most important first.`;

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
  return (Array.isArray(j?.suggestions) ? j.suggestions : []).slice(0, 3).map((s) => ({
    stage: STAGES.includes(String(s.stage || '').toUpperCase()) ? String(s.stage).toUpperCase() : 'STRATEGY',
    file: clip(s.file, 200) || null, fn: s.fn ? clip(s.fn, 120) : null,
    change: clip(s.change, 1200), expected_effect: clip(s.expected_effect, 600),
    classes: (Array.isArray(s.classes) ? s.classes : []).map(String).slice(0, 6),
    severity: Math.min(3, Math.max(1, Number(s.severity) || 2)),
  })).filter((s) => s.change);
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
    if (hit?.id != null) { if (!bumps.some((b) => b.id === hit.id)) bumps.push({ id: hit.id, evidence_key: evidenceKey, severity: s.severity }); }
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
  return { route: routeOf(p.recipe || p.plan?.shape), question, reply, searches, writer_passages: evidence, cited };
}

/** Forensic + judge item for a reply; one per search (each trace gets its own verdict). */
export function itemsForTurn(turn, { messageId, sessionId, turnId = null } = {}) {
  const f = forensicPass(turn);
  const reply = { key: `reply:${messageId}`, kind: 'reply', ref_id: String(messageId), session_id: sessionId ?? null, turn_id: turnId, route: f.route,
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

export { COPY_CLASSES };
