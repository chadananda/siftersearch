// Anís hub data (Chad 10-10: "everything about Anís in one place" — activity, costs, assessment, System-1). One read per
// tab section, every query bounded by the date window (no full-table scans in the API). Sources: chat_messages (his
// replies + routing path), ai_usage (spend), the audit store (/tank/sifter/audit/audits.db) and the System-1 log
// (/tank/sifter/systemone/calls.db). Deps are injected so it is testable without the real stores.
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import { getModel } from '../model-registry.js';

// System-1 tasks Anís runs on every turn (search-plan and source-resolve are shared with planned search).
export const ANIS_S1_TASKS = ['anis-triage', 'anis-format', 'anis-persona-check', 'search-plan', 'source-resolve'];
const AUDIT_DB = () => process.env.AUDIT_DB || '/tank/sifter/audit/audits.db';
const S1_DB = () => join(process.env.SYSTEMONE_DIR || '/tank/sifter/systemone', 'calls.db');
const openRO = (path) => (existsSync(path) ? new Database(path, { readonly: true, fileMustExist: true }) : null);
const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');

/** His replies: per day per channel, and what each turn became (canned, tarpit, research…). */
export async function anisActivity({ queryAll }, days = 30) {
  const since = isoDaysAgo(days);
  const byDay = await queryAll(`SELECT substr(COALESCE(answered_at, created_at), 1, 10) AS day, COALESCE(channel, 'unknown') AS channel, COUNT(*) AS n
    FROM chat_messages WHERE role = 'assistant' AND COALESCE(answered_at, created_at) >= ? GROUP BY day, channel ORDER BY day`, [since], 'anis:activity-days');
  const byPath = await queryAll(`SELECT COALESCE(json_extract(path_json, '$.gate'), status, 'unknown') AS path, COUNT(*) AS n
    FROM chat_messages WHERE role = 'assistant' AND COALESCE(answered_at, created_at) >= ? GROUP BY path ORDER BY n DESC`, [since], 'anis:activity-paths');
  const people = await queryAll(`SELECT COUNT(DISTINCT s.participant_id) AS n FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
    WHERE m.role = 'assistant' AND COALESCE(m.answered_at, m.created_at) >= ?`, [since], 'anis:activity-people');
  // The strategy (recipe) and answer format each research turn used, and the latest questions with both.
  const byStrategy = await queryAll(`SELECT COALESCE(json_extract(path_json, '$.recipe'), '(none)') AS strategy, COUNT(*) AS n
    FROM chat_messages WHERE role = 'assistant' AND COALESCE(answered_at, created_at) >= ? GROUP BY strategy ORDER BY n DESC`, [since], 'anis:activity-strategy');
  const recent = await queryAll(`SELECT a.id, COALESCE(a.answered_at, a.created_at) AS at, a.channel,
      COALESCE(json_extract(a.path_json, '$.gate'), a.status) AS path, json_extract(a.path_json, '$.recipe') AS strategy,
      json_extract(a.path_json, '$.format.id') AS format,
      (SELECT u.content FROM chat_messages u WHERE u.session_id = a.session_id AND u.round_index = a.round_index AND u.role = 'user' ORDER BY u.id LIMIT 1) AS question
    FROM chat_messages a WHERE a.role = 'assistant' AND COALESCE(a.answered_at, a.created_at) >= ? ORDER BY a.id DESC LIMIT 25`, [since], 'anis:activity-recent');
  return { days, byDay, byPath, byStrategy, recent, people: people[0]?.n ?? 0, replies: byDay.reduce((s, r) => s + r.n, 0) };
}

/** What Anís costs: his own calls (reply model) + his System-1 tasks incl. Clef shadows, from ai_usage; unpriced models listed. */
export async function anisCosts({ queryAll }, days = 30) {
  const since = isoDaysAgo(days);
  // his System-1 tasks, served and Clef-shadowed (`system1:<task>:shadow`, see systemone.callClef)
  const s1 = ANIS_S1_TASKS.flatMap((t) => [`system1:${t}`, `system1:${t}:shadow`]);
  const rows = await queryAll(`SELECT caller, provider, model, COUNT(*) AS calls, SUM(prompt_tokens) AS input_tokens,
      SUM(completion_tokens) AS output_tokens, ROUND(SUM(estimated_cost_usd), 6) AS usd
    FROM ai_usage WHERE timestamp >= ? AND (caller LIKE 'anis%' OR caller IN (${s1.map(() => '?').join(',')}))
    GROUP BY caller, provider, model ORDER BY usd DESC, calls DESC`, [since, ...s1], 'anis:costs');
  const unpriced = [...new Set(rows.filter((r) => getModel(r.model)?.unpriced).map((r) => r.model))];
  return { days, rows, usd: rows.reduce((s, r) => s + (r.usd || 0), 0), unpriced };
}

/** The assessment: every Anís exchange audited after the fact (scripts/audit/audit-exchanges.mjs). */
export function anisAssessment({ auditDb = openRO(AUDIT_DB()) } = {}, days = 30, recent = 20) {
  if (!auditDb) return { available: false };
  try {
    const since = isoDaysAgo(days);
    const rows = auditDb.prepare(`SELECT message_id, channel, asked_at, audited_at, model, usd, status, verdict_json FROM audits
      WHERE audited_at >= ? ORDER BY message_id DESC`).all(since);
    const tally = (pick) => rows.reduce((m, r) => { const v = pick(r); if (v) m[v] = (m[v] || 0) + 1; return m; }, {});
    const parsed = rows.map((r) => ({ ...r, v: r.verdict_json ? safeJson(r.verdict_json) : null }));
    const problems = {};
    for (const r of parsed) for (const p of r.v?.problems || []) problems[p.kind] = (problems[p.kind] || 0) + 1;
    return {
      available: true, days, audited: rows.length, errors: rows.filter((r) => r.status !== 'done').length,
      usd: rows.reduce((s, r) => s + (r.usd || 0), 0),
      strategy: tally((r) => safeJson(r.verdict_json)?.strategy_verdict),
      answered: tally((r) => safeJson(r.verdict_json)?.evidence?.answered),
      format: tally((r) => safeJson(r.verdict_json)?.format_verdict?.fit),
      problems,
      recent: parsed.slice(0, recent).map((r) => ({ message_id: r.message_id, channel: r.channel, asked_at: r.asked_at, status: r.status,
        strategy: r.v?.strategy_used, verdict: r.v?.strategy_verdict, best: r.v?.best_strategy, answered: r.v?.evidence?.answered,
        problems: (r.v?.problems || []).map((p) => ({ kind: p.kind, detail: p.detail })) })),
    };
  } finally { auditDb?.close?.(); }
}

/** System-1 for Anís's tasks: calls, who served them, and how often Clef agreed with Jev (the switch-over evidence). */
export function anisSystem1({ s1Db = openRO(S1_DB()) } = {}, days = 30) {
  if (!s1Db) return { available: false };
  try {
    const since = Date.now() - days * 86400000;
    const ph = ANIS_S1_TASKS.map(() => '?').join(',');
    const calls = s1Db.prepare(`SELECT task, served_by, COUNT(*) AS n FROM calls WHERE at >= ? AND task IN (${ph}) GROUP BY task, served_by`).all(since, ...ANIS_S1_TASKS);
    const pairs = s1Db.prepare(`SELECT c.task, c.jev, s.backend, s.answers FROM calls c JOIN shadow s ON s.call_id = c.id
      WHERE c.at >= ? AND c.task IN (${ph}) AND c.jev IS NOT NULL AND s.answers IS NOT NULL`).all(since, ...ANIS_S1_TASKS);
    const agree = {};
    for (const p of pairs) {
      const a = choices(safeJson(p.jev)), b = choices(safeJson(p.answers));
      const keys = Object.keys(a);
      if (!keys.length) continue;
      const k = `${p.task}|${p.backend}`;
      agree[k] ??= { task: p.task, backend: p.backend, compared: 0, same: 0 };
      agree[k].compared++;
      if (keys.every((q) => a[q] === b[q])) agree[k].same++;
    }
    return { available: true, days, calls, agreement: Object.values(agree) };
  } finally { s1Db?.close?.(); }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function choices(answers) {
  const out = {};
  for (const [q, a] of Object.entries(answers || {})) out[q] = a?.choice ?? a?.value ?? null;
  return out;
}
