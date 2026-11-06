#!/usr/bin/env node
// Improve worker — pm2 `siftersearch-improve` (in-slice, llm-class, async; never inline with a reply). Chad 11-04: every search
// trace and every Anís reply → deterministic forensic pass (free) → Opus 5.5 judge (pass|weak; rubric prompt-cached) → weak →
// deep analysis → improvement suggestions, deduped into IMPROVE_DB. Spend: ai_usage group 'improve' (IMPROVE_DAILY_USD, unset =
// unbudgeted); at a cap the work waits (priority order), never dropped. Deps: repos (anis-threads, search-trace, improve), ai.js.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, readFileSync } from 'fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true });
dotenv.config({ path: join(ROOT, '.env-public'), quiet: true });

import { chatCompletion } from '../lib/ai.js';
import { withAIContext } from '../lib/ai-context.js';
import { modelFor } from '../lib/model-roles.js';
import { isSpendCap } from '../lib/spend-caps.js';
import { drainOnSignals, isDraining, nap } from '../lib/drain.js';
import { startHeartbeat } from '../lib/service-heartbeat.js';
import { assessSearch, routeOf, owedClasses } from '../lib/audit/forensics.js';
import { JUDGE_SYSTEM, DEEP_SYSTEM, JUDGE_ROLE, DEEP_ROLE, judgeMessage, parseJudge, deepMessage, parseDeep,
  mergeSuggestions, costOf, priorityOf, turnFromPath, itemsForTurn, dedupeTheme, attachThemes, retarget, resolveFile } from '../lib/audit/improve.js';
import { targetClass } from '../lib/audit/improve-targets.js';
import { anisRepliesAfter } from '../lib/repos/anis-threads-repo.js';
import { tracesAfter, tracesForTurn, docTitles } from '../lib/repos/search-trace-repo.js';
import { expandHits } from '../lib/search-trace.js';
import { openImproveDb, getCursor, setCursor, recordForensic, nextWork, saveJudge, saveDeepDone, noteFailure,
  openImprovements, applySuggestions, deferCoveredSearches } from '../lib/repos/improve-repo.js';

/** Backfill is OFF by default (11-06 redesign: new traces only — the 30-day default paid Opus to judge a month of history).
 *  IMPROVE_BACKFILL_DAYS=N (> 0) turns it back on for N days. */
export const backfillDays = (v = process.env.IMPROVE_BACKFILL_DAYS) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const BACKFILL_DAYS = backfillDays();
const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
/** The first moment this store ran with backfill off (cursor 'live_from', set once). Items asked before it are never paid for. */
export const liveFrom = (db) => getCursor(db, 'live_from') || (setCursor(db, 'live_from', sqlNow()), getCursor(db, 'live_from'));
/** The read window in days: the backfill when on, else exactly the time since live_from (so a poll never misses a reply). */
export const windowDays = (db, days = BACKFILL_DAYS) => (days > 0 ? days : Math.max(0, (Date.now() - Date.parse(`${liveFrom(db).replace(' ', 'T')}Z`)) / 86_400_000));
const IDLE_MS = Number(process.env.IMPROVE_IDLE_MS) || 30_000;
const LLM_ON = process.env.IMPROVE_LLM !== '0';   // kill switch: forensics only
const safeJson = (s) => { if (s && typeof s === 'object') return s; try { return JSON.parse(s); } catch { return null; } };

/** A search_trace row → the forensic search shape. hits_json (11-04, migration 197) holds [para_id, doc_id, score, layer, tier]
 *  arrays; titles/authors hydrate from `titles` (Map doc_id → {title, author}); object hits (older shapes) pass through. */
export function traceToSearch(t, titles = new Map()) {
  const raw = safeJson(t.hits_json) || safeJson(t.hits) || [];
  const hits = raw.length && Array.isArray(raw[0]) ? expandHits(raw, titles) : raw;
  return { trace_id: t.trace_id, tool: t.tool || t.endpoint, endpoint: t.endpoint, query: t.query, filters: safeJson(t.filters_json) || {},
    timings: safeJson(t.timings_json) || {}, hits: hits.map((h, i) => ({ rank: h.rank ?? i + 1, doc_id: h.doc_id ?? h.docId ?? h.id, para_id: h.para_id ?? null,
      title: h.title, author: h.author, language: h.language || h.lang, text: h.text, tier: h.tier, layer: h.layer, score: h.score })) };
}
const hitDocs = (rows) => rows.flatMap((t) => (safeJson(t.hits_json) || []).map((h) => (Array.isArray(h) ? h[1] : h?.doc_id))).filter((v) => v != null);

/** Step 1 (free): forensic rows for new replies and new traces since the cursors; backfills BACKFILL_DAYS only when set. */
export async function ingest(db, { deps = {} } = {}) {
  const repliesAfter = deps.anisRepliesAfter || anisRepliesAfter, after = deps.tracesAfter || tracesAfter;
  const forTurn = deps.tracesForTurn || tracesForTurn, titlesOf = deps.docTitles || docTitles;
  let n = 0;
  const bootAt = getCursor(db, 'boot_at') || (setCursor(db, 'boot_at', sqlNow()), getCursor(db, 'boot_at'));
  const sinceDays = windowDays(db, deps.backfillDays ?? BACKFILL_DAYS);
  const replies = await repliesAfter(Number(getCursor(db, 'reply_id') || 0), { sinceDays, limit: 100 });
  for (const r of replies) {
    const backfill = String(r.created_at) < bootAt;
    const turnId = r.round_index != null ? `${r.session_id}:${r.round_index}` : null;
    // the turn's own traced searches (ranked lists with tiers) when it has them; else path_json's evidence stands in
    const rows = turnId ? await forTurn(turnId).catch(() => []) : [];
    const engine = rows.filter((t) => t.endpoint !== 'planned');
    const titles = engine.length ? await titlesOf(hitDocs(engine)).catch(() => new Map()) : new Map();
    const turn = turnFromPath({ question: r.question, reply: r.reply, path: safeJson(r.path_json) || {}, traces: engine.map((t) => traceToSearch(t, titles)) });
    const { reply } = itemsForTurn(turn, { messageId: r.id, sessionId: r.session_id, turnId });
    recordForensic(db, { ...reply, asked_at: String(r.created_at), backfill, priority: priorityOf({ kind: 'reply', backfill }) });
    await strategyGap({ turnId, threadId: r.session_id, question: r.question, path: safeJson(r.path_json) || {} }, deps);   // free: Jev unsure → a gap row
    setCursor(db, 'reply_id', r.id); n++;
  }
  const traces = await after(Number(getCursor(db, 'trace_id') || 0), { sinceDays, limit: 200 });
  const tTitles = traces.length ? await titlesOf(hitDocs(traces)).catch(() => new Map()) : new Map();
  for (const t of traces) {
    // no stored ranked list (traced before migration 197, or pruned) but it did return hits → nothing to judge; a real zero is kept
    if (!t.hits_json && Number(t.result_count) > 0) { setCursor(db, 'trace_id', t.id); continue; }
    const asked = new Date(Number(t.created_at) * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const backfill = asked < bootAt, s = traceToSearch(t, tTitles);
    const a = assessSearch(s, { route: routeOf(t.route || safeJson(t.filters_json)?.route), question: t.query });
    recordForensic(db, { key: `search:${t.trace_id}`, kind: 'search', ref_id: t.trace_id, session_id: t.thread_id ?? null, turn_id: t.turn_id ?? null,
      route: t.route ?? null, question: t.query, ...s, defects: a.defects,
      asked_at: asked, backfill, priority: priorityOf({ kind: 'search', backfill }), judge_state: searchJudgeState(t, a.defects) });
    setCursor(db, 'trace_id', t.id); n++;
  }
  return n;
}

/** Chad 11-04, "make the improvement cycle cheap and effective": a search inside an Anís turn is judged THROUGH its reply (the
 *  reply judge sees the outcome; a weak reply's deep analysis reads its searches) — 9/9 separately judged searches came back
 *  'weak' at $0.010 each, duplicating the reply verdict. A search with no turn (public search API) is judged only when the free
 *  forensic pass found a defect. */
export const searchJudgeState = (t, defects = []) => t.turn_id ? 'covered' : defects.length ? 'pending' : 'clean';

/** Output budgets (11-06): Opus 5.5 always thinks and the thinking spends max_tokens. At 600 (judge) / 2000 (deep) the replies
 *  averaged 574 / 1,852 output tokens: cut off mid-JSON → unparseable → retried 5× (judge), or an empty conclusion saved as done
 *  (deep: 43 of the last 50 had no diagnosis). Room for thinking + the JSON, and low effort for a rubric verdict. */
export const JUDGE_CALL = { maxTokens: 4000, effort: 'low' };
export const DEEP_CALL = { maxTokens: 8000, effort: 'medium' };
class Truncated extends Error {}

async function callOpus(role, system, user, { maxTokens, effort } = {}) {
  const { provider, model } = modelFor(role);
  const res = await withAIContext({ caller: role === JUDGE_ROLE ? 'improve-judge' : 'improve-analysis', stage: role === JUDGE_ROLE ? 'improve:judge' : 'improve:analysis' },
    () => chatCompletion([{ role: 'system', content: system }, { role: 'user', content: user }], { provider, model, maxTokens, effort, usePromptCache: true }));
  return { text: res.content, usage: res.usage || {}, usd: costOf(res.usage || {}, model), finishReason: res.finishReason };
}
const cutOff = (r) => r?.finishReason === 'max_tokens';

/** Strategy graph Phase 3 (assistant/strategy-improve.js): a turn no strategy served → a gap row in strategies.db (free, never
 *  breaks the loop). deps.captureGap is the test seam. */
async function strategyGap(turn, deps = {}) {
  try {
    if (deps.captureGap) return deps.captureGap(turn);
    const [{ captureGap }, { candidatesDb }] = await Promise.all([import('../lib/assistant/strategy-improve.js'), import('../lib/repos/strategy-candidates-repo.js')]);
    return captureGap(candidatesDb(), turn);
  } catch (err) { console.error('[improve] strategy gap:', err?.message || err); return 0; }
}

/** Phase 4 at once: a diagnosis that proposed a DATA change → its strategy edit is built and replayed in the same cycle.
 *  Errors never fail the deep step (a spend cap leaves the suggestions open; the idle strategy unit picks them up). */
async function editNow(improveDb, deps = {}) {
  try {
    const m = deps.m || await import('../lib/assistant/strategy-improve.js');
    const db = deps.db || (await import('../lib/repos/strategy-candidates-repo.js')).candidatesDb();
    const e = await m.editStage(db, { improveDb, ...(deps.opts || {}) });
    if (e !== 'idle') console.log(`[improve] strategy edit: ${JSON.stringify({ status: e.status, id: e.id, version: e.version, settled: e.settled, failed: e.failed?.[0], usd: e.usd })}`);
    return e;
  } catch (err) { if (!isSpendCap(err)) console.error('[improve] strategy edit:', err?.message || err); return 'idle'; }
}

/** Decision theories (brief v3 A): the newest weak Jev-gate verdict → Opus theories → experiments on historic + frozen synthetic gold →
 *  a winner ships as params.enrich on its decision step (replay-promoted); needs-code → CODE suggestion. Spend caps propagate. */
async function theoryWork(db, { improveDb, deps }) {
  if (deps && !deps.theoryStage) return 'idle';
  if (!deps && !improveDb) return 'idle';
  const th = deps?.theoryStage ? { theoryStage: deps.theoryStage, liveTheoryDeps: deps.liveTheoryDeps } : await import('../lib/jev-tuning/theories.js');
  const { catalog } = await import('../lib/repos/strategies-repo.js');
  const r = await th.theoryStage(db, { deps: await th.liveTheoryDeps({ improveDb, db }), cat: catalog() });
  if (r === 'idle' || r === 'capped') return 'idle';
  console.log(`[improve] decision theory: ${JSON.stringify({ gate: r.gate, item: r.item_key, theories: r.theories.map((x) => `${x.kind}:${x.verdict}`), usd: r.usd })}`);
  return 'done';
}

/** The LOWEST priority unit, run only when judge/deep work is idle: design a candidate for the first ready gap cluster, else
 *  edit a strategy from open DATA suggestions (Phase 4), else test a decision theory, else replay-promote the oldest untried candidate. → 'idle' | 'done' | { wait } */
export async function strategyWork({ deps = null, improveDb = null } = {}) {
  try {
    const m = deps || await import('../lib/assistant/strategy-improve.js');
    const db = deps?.db || (await import('../lib/repos/strategy-candidates-repo.js')).candidatesDb();
    const d = await m.designStage(db);
    if (d !== 'idle') { console.log(`[improve] strategy design: ${JSON.stringify({ status: d.status, id: d.id, version: d.version, usd: d.usd })}`); return 'done'; }
    if (m.editStage && improveDb) {
      const e = await m.editStage(db, { improveDb });
      if (e !== 'idle' && e.status && e.status !== 'capped') { console.log(`[improve] strategy edit: ${JSON.stringify({ status: e.status, id: e.id, version: e.version, settled: e.settled, usd: e.usd })}`); return 'done'; }
    }
    const t = await theoryWork(db, { improveDb, deps });
    if (t === 'done') return 'done';
    const p = await m.promotionStage(db);
    if (p !== 'idle') {
      console.log(`[improve] strategy promotion: ${JSON.stringify({ id: p.id, version: p.version, promoted: p.promoted, usd: p.usd, failed: p.decision?.failed })}`);
      if (m.settleTested && improveDb) m.settleTested(db, improveDb);   // an edit candidate finished here settles its suggestions
      return 'done';
    }
    return 'idle';
  } catch (err) {
    if (isSpendCap(err)) return { wait: err.retryAfterMs || 60_000 };
    console.error('[improve] strategy work:', err?.message || err);
    return 'idle';
  }
}

/** Step 2: one unit of LLM work in priority order. → 'idle' | 'done' | { wait: ms } */
/** The strategies a DATA suggestion may edit: the live catalog minus NOT_EDITABLE (respond, other). Empty on error → every
 *  suggestion is a CODE target, which is never wrong, only slower. */
async function editableStrategies() {
  try {
    const [{ catalog }, { NOT_EDITABLE }] = await Promise.all([import('../lib/repos/strategies-repo.js'), import('../lib/assistant/strategy-edit.js')]);
    return new Set((catalog()?.strategies || []).map((s) => s.id).filter((id) => id && !NOT_EDITABLE.has(id)));
  } catch (err) { console.error('[improve] strategy list:', err?.message || err); return new Set(); }
}
const repoFs = {
  has: (p) => { try { return !!p && !p.includes('..') && existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile(); } catch { return false; } },
  source: (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return null; } },
};

/** Step 2: one unit of LLM work in priority order. → 'idle' | 'done' | { wait: ms }
 *  Deep step (spec #2, 11-06): a weak item whose every (class, stage, real file) theme is already an open suggestion adds
 *  evidence to it and makes NO call; otherwise the analyst sees the editable strategies, and each suggestion is retargeted
 *  (DATA only for an editable strategy) and its file/fn checked against the repo before it is saved. */
export async function work(db, { call = callOpus, replay = replayCurrent, edit = editNow, strategies = editableStrategies, fs = repoFs, since = null } = {}) {
  const w = nextWork(db, { since });
  if (!w) return 'idle';
  try {
    if (w.step === 'judge') {
      const r = await call(JUDGE_ROLE, JUDGE_SYSTEM, judgeMessage(w.item), JUDGE_CALL);
      const judge = parseJudge(r.text);
      // a route-owed class only where the route owes it: a routeless search-page search never owes a Writings pass
      if (judge) judge.classes = owedClasses(judge.classes, w.item.route);
      if (!judge) throw new (cutOff(r) ? Truncated : Error)(`unparseable judge reply${cutOff(r) ? ' (max_tokens)' : ''}: ${String(r.text).slice(0, 120)}`);
      saveJudge(db, w.item_key, { judge, usd: r.usd, usage: r.usage });
      // the judge named the right option of a Jev gate → that gate's gold label (labelByRef only labels an option the gate offered)
      if (judge.gate && judge.right && w.item.turn_id) { try { (await import('../lib/repos/jev-calls-repo.js')).labelByRef(judge.gate, w.item.turn_id, judge.right, 'opus-judge'); } catch { /* a label is a bonus, never a failure */ } }
      if (judge.stage === 'STRATEGY' && w.item.kind === 'reply') await strategyGap({ turnId: w.item.turn_id, threadId: w.item.session_id, question: w.item.question, judge });
    } else {
      const judge = w.judge || {}, open = openImprovements(db);
      const seen = dedupeTheme(w.item, judge, open);
      if (seen.covered) {   // known weakness: +1 evidence on each open row, $0
        const rows = seen.ids.map((id) => open.find((o) => o.id === id));
        const ids = applySuggestions(db, { inserts: [], bumps: rows.map((o) => ({ id: o.id, evidence_key: w.item_key, severity: Math.max(1, Math.min(3, Number(judge.severity) || 1)) })) });
        saveDeepDone(db, w.item_key, { usd: 0, deep: { diagnosis: null, root_cause: null, improvement_ids: ids, deduped: seen.keys } });
        return 'done';
      }
      const editable = await strategies();
      const rep = await replay(w.item).catch(() => null);
      const passages = (w.item.writer_passages || w.item.hits || []).filter((h) => h.text);
      const r = await call(DEEP_ROLE, DEEP_SYSTEM, deepMessage(w.item, judge, { replay: rep, passages, editable }), DEEP_CALL);
      const deep = parseDeep(r.text);   // the conclusion (diagnosis, root cause) is kept with the ids of the fixes it led to
      // an empty conclusion is a failure, never "deep done" (11-06: 43/50 saved empty, $0.03–0.06 each)
      if (!deep.diagnosis && !deep.suggestions.length) throw new (cutOff(r) ? Truncated : Error)(`empty deep analysis${cutOff(r) ? ' (max_tokens)' : ''}: ${String(r.text).slice(0, 120)}`);
      const fallback = (s) => seen.keys.find((k) => (s.classes || []).includes(k.class))?.file || seen.keys.find((k) => k.file)?.file || null;
      const fixed = attachThemes(deep.suggestions.map((s) => retarget(resolveFile(s, fs, fallback(s)), editable)), seen.keys);
      deep.suggestions = fixed;
      const ids = applySuggestions(db, mergeSuggestions(open, fixed, w.item_key));
      saveDeepDone(db, w.item_key, { usd: r.usd, deep: { diagnosis: deep.diagnosis, root_cause: deep.root_cause, improvement_ids: ids } });
      if (deep.suggestions.some((s) => targetClass(s.target) === 'data')) await edit(db);   // tested in this same cycle
    }
    return 'done';
  } catch (err) {
    if (isSpendCap(err)) return { wait: err.retryAfterMs || 60_000 };   // delayed, never dropped: the row stays pending
    noteFailure(db, w.item_key, err?.message || err, { final: err instanceof Truncated });
    return 'done';
  }
}

/** A weak item's searches re-run on today's code (introspection's replay endpoints: no LLM, untraced) → { filter, hits }, or
 *  null. A search → POST /search-trace/:id/replay; a reply → its turn's replay. (The endpoint has no Writings filter yet.) */
async function replayCurrent(item) {
  const key = process.env.INTERNAL_API_KEY || process.env.DEPLOY_SECRET;
  const path = item.kind === 'search' ? `/api/admin/search-trace/${encodeURIComponent(item.ref_id)}/replay`
    : item.turn_id ? `/api/admin/anis/turns/${encodeURIComponent(item.turn_id)}/replay` : null;
  if (!path || !key) return null;
  const base = process.env.INTERNAL_API_BASE || 'http://127.0.0.1:7839';
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': key }, body: '{}', signal: AbortSignal.timeout(30_000) });
  return r.ok ? replayHits(await r.json()) : null;
}
/** Replay response → { filter, hits }: every replayed search's new ranked rows, Writings tier first (stable), at most 20. */
export function replayHits(j = {}) {
  const rows = (j.replays || []).flatMap((x) => (x.diff?.rows || []).map((h) => ({ ...h, tool: x.tool, query: x.query })));
  if (!rows.length) return null;
  const w = (h) => (h.tier === 'writings' ? 0 : 1);
  return { filter: 'current code, Writings tier first', hits: rows.map((h, i) => [h, i]).sort((a, b) => w(a[0]) - w(b[0]) || a[1] - b[1]).map(([h]) => h).slice(0, 20) };
}

export async function main() {
  const db = openImproveDb();
  console.log(`[improve] searches judged through their reply: ${deferCoveredSearches(db)} queued turn searches covered`);
  let doing = 'start', judged = 0;
  drainOnSignals(() => { doing = 'draining'; });
  startHeartbeat({ name: 'siftersearch-improve', state: () => ({ doing, judged }) });
  while (!isDraining()) {
    try {
      doing = 'ingest';
      const fresh = await ingest(db);
      if (!LLM_ON) { await nap(fresh ? 1000 : IDLE_MS); continue; }
      doing = 'judge';
      let r = await work(db, { since: BACKFILL_DAYS > 0 ? null : liveFrom(db) });   // backfill off: rows asked before live_from are never paid for
      if (r === 'done') { judged++; continue; }
      if (r === 'idle') { doing = 'strategy'; r = await strategyWork({ improveDb: db }); if (r === 'done') continue; }
      doing = r === 'idle' ? 'idle' : 'spend-cap wait';
      await nap(r === 'idle' ? (fresh ? 1000 : IDLE_MS) : Math.min(r.wait, 15 * 60_000));
    } catch (err) {
      console.error('[improve] loop error:', err?.message || err);
      await nap(IDLE_MS);
    }
  }
  db.close();
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
