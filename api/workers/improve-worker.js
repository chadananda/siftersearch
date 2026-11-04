#!/usr/bin/env node
// Improve worker — pm2 `siftersearch-improve` (in-slice, llm-class, async; never inline with a reply). Chad 11-04: every search
// trace and every Anís reply → deterministic forensic pass (free) → Opus 5.5 judge (pass|weak; rubric prompt-cached) → weak →
// deep analysis → improvement suggestions, deduped into IMPROVE_DB. Spend: ai_usage group 'improve' (IMPROVE_DAILY_USD, unset =
// unbudgeted); at a cap the work waits (priority order), never dropped. Deps: repos (anis-threads, search-trace, improve), ai.js.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true });
dotenv.config({ path: join(ROOT, '.env-public'), quiet: true });

import { chatCompletion } from '../lib/ai.js';
import { withAIContext } from '../lib/ai-context.js';
import { modelFor } from '../lib/model-roles.js';
import { isSpendCap } from '../lib/spend-caps.js';
import { drainOnSignals, isDraining, nap } from '../lib/drain.js';
import { startHeartbeat } from '../lib/service-heartbeat.js';
import { assessSearch, routeOf } from '../lib/audit/forensics.js';
import { JUDGE_SYSTEM, DEEP_SYSTEM, JUDGE_ROLE, DEEP_ROLE, judgeMessage, parseJudge, deepMessage, parseSuggestions,
  mergeSuggestions, costOf, priorityOf, turnFromPath, itemsForTurn } from '../lib/audit/improve.js';
import { anisRepliesAfter } from '../lib/repos/anis-threads-repo.js';
import { tracesAfter, tracesForTurn, docTitles } from '../lib/repos/search-trace-repo.js';
import { expandHits } from '../lib/search-trace.js';
import { openImproveDb, getCursor, setCursor, recordForensic, nextWork, saveJudge, saveDeepDone, noteFailure,
  openImprovements, applySuggestions } from '../lib/repos/improve-repo.js';

const BACKFILL_DAYS = Number(process.env.IMPROVE_BACKFILL_DAYS) || 30;
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

/** Step 1 (free): forensic rows for new replies and new traces since the cursors; first run backfills BACKFILL_DAYS. */
export async function ingest(db, { deps = {} } = {}) {
  const repliesAfter = deps.anisRepliesAfter || anisRepliesAfter, after = deps.tracesAfter || tracesAfter;
  const forTurn = deps.tracesForTurn || tracesForTurn, titlesOf = deps.docTitles || docTitles;
  let n = 0;
  const bootAt = getCursor(db, 'boot_at') || (setCursor(db, 'boot_at', new Date().toISOString().slice(0, 19).replace('T', ' ')), getCursor(db, 'boot_at'));
  const replies = await repliesAfter(Number(getCursor(db, 'reply_id') || 0), { sinceDays: BACKFILL_DAYS, limit: 100 });
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
    setCursor(db, 'reply_id', r.id); n++;
  }
  const traces = await after(Number(getCursor(db, 'trace_id') || 0), { sinceDays: BACKFILL_DAYS, limit: 200 });
  const tTitles = traces.length ? await titlesOf(hitDocs(traces)).catch(() => new Map()) : new Map();
  for (const t of traces) {
    // no stored ranked list (traced before migration 197, or pruned) but it did return hits → nothing to judge; a real zero is kept
    if (!t.hits_json && Number(t.result_count) > 0) { setCursor(db, 'trace_id', t.id); continue; }
    const asked = new Date(Number(t.created_at) * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const backfill = asked < bootAt, s = traceToSearch(t, tTitles);
    const a = assessSearch(s, { route: routeOf(t.route || safeJson(t.filters_json)?.route), question: t.query });
    recordForensic(db, { key: `search:${t.trace_id}`, kind: 'search', ref_id: t.trace_id, session_id: t.thread_id ?? null, turn_id: t.turn_id ?? null,
      route: t.route ?? null, question: t.query, ...s, defects: a.defects,
      asked_at: asked, backfill, priority: priorityOf({ kind: 'search', backfill }) });
    setCursor(db, 'trace_id', t.id); n++;
  }
  return n;
}

async function callOpus(role, system, user, maxTokens) {
  const { provider, model } = modelFor(role);
  const res = await withAIContext({ caller: role === JUDGE_ROLE ? 'improve-judge' : 'improve-analysis', stage: role === JUDGE_ROLE ? 'improve:judge' : 'improve:analysis' },
    () => chatCompletion([{ role: 'system', content: system }, { role: 'user', content: user }], { provider, model, maxTokens, usePromptCache: true }));
  return { text: res.content, usage: res.usage || {}, usd: costOf(res.usage || {}, model) };
}

/** Step 2: one unit of LLM work in priority order. → 'idle' | 'done' | { wait: ms } */
export async function work(db, { call = callOpus, replay = replayCurrent } = {}) {
  const w = nextWork(db);
  if (!w) return 'idle';
  try {
    if (w.step === 'judge') {
      const r = await call(JUDGE_ROLE, JUDGE_SYSTEM, judgeMessage(w.item), 600);
      const judge = parseJudge(r.text);
      if (!judge) throw new Error(`unparseable judge reply: ${String(r.text).slice(0, 120)}`);
      saveJudge(db, w.item_key, { judge, usd: r.usd, usage: r.usage });
    } else {
      const rep = await replay(w.item).catch(() => null);
      const passages = (w.item.writer_passages || w.item.hits || []).filter((h) => h.text);
      const r = await call(DEEP_ROLE, DEEP_SYSTEM, deepMessage(w.item, w.judge || {}, { replay: rep, passages }), 2000);
      applySuggestions(db, mergeSuggestions(openImprovements(db), parseSuggestions(r.text), w.item_key));
      saveDeepDone(db, w.item_key, { usd: r.usd });
    }
    return 'done';
  } catch (err) {
    if (isSpendCap(err)) return { wait: err.retryAfterMs || 60_000 };   // delayed, never dropped: the row stays pending
    noteFailure(db, w.item_key, err?.message || err);
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
  let doing = 'start', judged = 0;
  drainOnSignals(() => { doing = 'draining'; });
  startHeartbeat({ name: 'siftersearch-improve', state: () => ({ doing, judged }) });
  while (!isDraining()) {
    try {
      doing = 'ingest';
      const fresh = await ingest(db);
      if (!LLM_ON) { await nap(fresh ? 1000 : IDLE_MS); continue; }
      doing = 'judge';
      const r = await work(db);
      if (r === 'done') { judged++; continue; }
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
