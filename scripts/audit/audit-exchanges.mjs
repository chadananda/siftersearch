#!/usr/bin/env node
// Strategy auditor process (PM2 siftersearch-audit; runs ON tower). Every minute: each Anís exchange completed since the
// last one audited → one careful model call (api/lib/audit/auditor.js) → verdict stored in its own SQLite
// (/tank/sifter/audit/audits.db, like the System-1 log — the main DB's single writer is never touched). Never inline: the
// reader already has the reply. Daily budget (AUDIT_DAILY_USD, default $25): once spent, it waits for the next day; nothing
// is skipped, only delayed. Reads chat_messages read-only, paged by id (no long read transaction).
//   node scripts/audit/audit-exchanges.mjs [--once] [--limit=N]
import { modelFor } from '../../api/lib/model-roles.js';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildAuditPrompt, competitorQuery, AUDIT_TOOL, costOf, verifyHoldings, titleCandidates, titleMatches } from '../../api/lib/audit/auditor.js';
import { MODEL_REGISTRY } from '../../api/lib/model-registry.js';

// PM2 does not pass the env files to every app: load them here (as the other tower scripts do)
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(join(dirname(fileURLToPath(import.meta.url)), '..', '..'), f), quiet: true });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ONCE = process.argv.includes('--once');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '--limit=0').split('=')[1]) || Infinity;
const MODEL = process.env.AUDIT_MODEL || modelFor('exchange-audit').model;   // the role table (was sonnet-4-6)
const PRICING = MODEL_REGISTRY[MODEL]?.pricing || { input: 0.003, output: 0.015 };
const DAILY_USD = Number(process.env.AUDIT_DAILY_USD || 25);
const STORE = process.env.AUDIT_DB || '/tank/sifter/audit/audits.db';

mkdirSync(dirname(STORE), { recursive: true });
const store = new Database(STORE);
store.pragma('journal_mode = WAL');
store.pragma('busy_timeout = 10000');
store.exec(`CREATE TABLE IF NOT EXISTS audits (
  message_id INTEGER PRIMARY KEY,        -- the assistant chat_messages row audited
  session_id TEXT, round INTEGER, channel TEXT, asked_at TEXT,
  audited_at TEXT DEFAULT (datetime('now')), model TEXT, usd REAL, input_tokens INTEGER, output_tokens INTEGER,
  status TEXT,                            -- done | error
  verdict_json TEXT, error TEXT)`);
store.exec('CREATE INDEX IF NOT EXISTS idx_audits_day ON audits(audited_at)');
const content = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
content.pragma('busy_timeout = 10000');
const anthropic = new Anthropic({ maxRetries: 2 });

// The catalogue check for works the auditor says the reply needed (auditor.verifyHoldings): the API's title search
// (docs-repo findDocuments) over each way the phrase can name a title; held when a found title matches (titleMatches).
// 2 (10-15): portions of a book count as the book, title matching over glosses/lists, excerpts not judged truncated
// 3 (10-15): numbering ('First Epistle of John' = '1 John'), partial names, a seen defect kept beside unheld works
const AUDIT_V = 3;
const API = process.env.AUDIT_API || 'http://127.0.0.1:7839';
async function findHeld(phrase) {
  for (const cand of titleCandidates(phrase)) {
    const r = await fetch(`${API}/api/documents?search=${encodeURIComponent(cand)}&limit=8`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`catalogue ${r.status}`);            // unknown ≠ unheld: the claim is then left unchecked
    const { documents = [], sections = [] } = await r.json();
    const hit = documents.find((d) => titleMatches(cand, d.title));
    if (hit) return hit;
    // a sub-document (Chad 10-15): the work published inside a book — held as that book's section
    const part = sections.find((x) => titleMatches(cand, x.title) || titleMatches(cand, `${x.title} ${x.book}`));
    if (part) return { id: part.doc_id, title: `${part.title}, in ${part.book} (¶${part.start_index}–${part.end_index})` };
  }
  return null;
}

const spentToday = () => store.prepare(`SELECT COALESCE(SUM(usd), 0) s FROM audits WHERE date(audited_at) = date('now')`).get().s;
const lastAudited = () => store.prepare('SELECT COALESCE(MAX(message_id), 0) m FROM audits').get().m;
const nextBatch = (after) => content.prepare(`SELECT id, session_id, round_index, content, channel, path_json, answered_at FROM chat_messages
  WHERE role = 'assistant' AND id > ? AND status IN ('answered', 'canned') ORDER BY id LIMIT 20`).all(after);
const questionOf = content.prepare(`SELECT content FROM chat_messages WHERE session_id = ? AND round_index = ? AND role = 'user' ORDER BY id LIMIT 1`);
const earlierOf = content.prepare(`SELECT role, content FROM chat_messages WHERE session_id = ? AND round_index < ? AND round_index >= ? ORDER BY round_index, id`);
const put = store.prepare(`INSERT OR REPLACE INTO audits (message_id, session_id, round, channel, asked_at, model, usd, input_tokens, output_tokens, status, verdict_json, error)
  VALUES (@message_id, @session_id, @round, @channel, @asked_at, @model, @usd, @input_tokens, @output_tokens, @status, @verdict_json, @error)`);

/** The auditor found the answer short: not (fully) answered, or problems listed. */
// …or the competitor answered this reader better (Chad 10-19: "we should always be more helpful and informative than Perplexity")
export const flagged = (v) => ['no', 'partly'].includes(v?.evidence?.answered) || (Array.isArray(v?.problems) && v.problems.length > 0) || v?.vs_competitor?.verdict === 'worse';
// OUR OWN TEST ADDRESSES are audited (the data is useful) but never alert Chad — a 61-question battery would flood his inbox
const { emailHash } = await import('../../api/lib/assistant/pause-link.js');
const QUIET = new Set(['battery@siftersearch.com', 'test-rerun@siftersearch.com', ...String(process.env.AUDIT_QUIET_EMAILS || '').split(',')]
  .filter(Boolean).map((e) => `email:${emailHash(e)}`));
const participantOf = content.prepare('SELECT participant_id FROM chat_sessions WHERE id = ?');
export const quiet = (sessionId) => QUIET.has(participantOf.get(sessionId)?.participant_id);
async function alertPoorAnswer({ row, question, verdict: v }) {
  if (quiet(row.session_id)) return;
  const { actionRequired } = await import('../../api/lib/ops/alert.js');
  const probs = (Array.isArray(v.problems) ? v.problems : []).slice(0, 8).map((p) => `  • ${p.kind}: ${p.detail}`).join('\n');
  const text = `Anís's answer needs a look (${row.channel || 'chat'}, ${row.answered_at || ''} UTC)\n\nQUESTION:\n${String(question).slice(0, 1500)}\n\nANÍS REPLIED:\n${String(row.content || '').slice(0, 2500)}\n\n`
    + `AUDIT: answered ${v.evidence?.answered || '?'} · strategy ${v.strategy_used || '?'} → best ${v.best_strategy || '?'}${v.summary ? `\n${v.summary}` : ''}\n${probs}${v.vs_competitor?.verdict && v.vs_competitor.verdict !== 'no-comparison' ? `\n\nVS PERPLEXITY: ${v.vs_competitor.verdict.toUpperCase()} — they gave: ${v.vs_competitor.they_gave || '?'} · we gave: ${v.vs_competitor.we_gave || '?'}` : ''}\n\nThread: https://siftersearch.com/admin/anis#threads/${row.session_id}`;
  await actionRequired({ key: `anis-poor-answer-${row.id}`, subject: `Anís answer needs a look: ${String(question).replace(/\s+/g, ' ').slice(0, 70)}`, text });
}

async function audit(row) {
  const question = questionOf.get(row.session_id, row.round_index)?.content || '';
  const earlier = earlierOf.all(row.session_id, row.round_index, row.round_index - 3);
  let path = {}; try { path = JSON.parse(row.path_json || '{}'); } catch { /* old rows */ }
  // THE BAR (Chad 10-19): the same question put to Perplexity, so the audit judges Anís against what a reader could get
  // elsewhere. Only the scrubbed question leaves (competitorQuery); no key or a failed call → no comparison, never no audit.
  const { perplexityFallback } = await import('../../api/lib/perplexity.js');
  const competitor = process.argv.includes('--no-competitor') ? null
    : await perplexityFallback(competitorQuery(question, earlier), { caller: 'anis-audit', maxTokens: 800 }).catch(() => null);
  const { system, user } = buildAuditPrompt({ earlier, question, reply: row.content, path, competitor });
  const base = { message_id: row.id, session_id: row.session_id, round: row.round_index, channel: row.channel, asked_at: row.answered_at, model: MODEL };
  try {
    const res = await anthropic.messages.create({ model: MODEL, max_tokens: 4000, system, tools: [AUDIT_TOOL],
      tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: user }] });
    const call = res.content.find((b) => b.type === 'tool_use');
    if (call) call.input = { ...(await verifyHoldings(call.input, findHeld)), audit_v: AUDIT_V, ...(competitor?.text ? { competitor: { text: competitor.text.slice(0, 4000), citations: (competitor.citations || []).slice(0, 10) } } : {}) };
    put.run({ ...base, usd: costOf(res.usage, PRICING), input_tokens: res.usage?.input_tokens ?? 0, output_tokens: res.usage?.output_tokens ?? 0,
      status: call ? 'done' : 'error', verdict_json: call ? JSON.stringify(call.input) : null, error: call ? null : `no tool call (${res.stop_reason})` });
    // a POOR ANSWER reaches Chad AT ONCE (Chad 10-19: "every single interaction with Anis should be audited immediately after
    // for quality" — Lal's 'chamber' reply was audited "not answered, 7 problems" and nothing happened until the next digest)
    if (call && flagged(call.input)) await alertPoorAnswer({ row, question, verdict: call.input }).catch((e) => console.error(JSON.stringify({ alert_failed: String(e.message).slice(0, 160) })));
  } catch (e) {
    // the CALL failed (auth, network, rate limit): nothing is recorded, so this exchange is retried — never skipped
    console.error(JSON.stringify({ at: new Date().toISOString(), message_id: row.id, error: String(e.message).slice(0, 200) }));
    return false;
  }
  return true;
}

let done = 0;
// --recheck-holdings: re-run ONLY the catalogue check over stored verdicts that list needed_works (no model call).
if (process.argv.includes('--recheck-holdings')) {
  const rows = store.prepare(`SELECT message_id, verdict_json FROM audits WHERE status = 'done' AND json_extract(verdict_json, '$.needed_works') IS NOT NULL
    AND COALESCE(json_extract(verdict_json, '$.audit_v'), 1) < ?`).all(AUDIT_V);
  const save = store.prepare('UPDATE audits SET verdict_json = ? WHERE message_id = ?');
  let gaps = 0;
  for (const r of rows) {
    const v = { ...(await verifyHoldings(JSON.parse(r.verdict_json), findHeld)), audit_v: AUDIT_V };
    if (v.data_gap?.found) gaps++;
    save.run(JSON.stringify(v), r.message_id);
  }
  console.log(JSON.stringify({ rechecked: rows.length, with_gap: gaps }));
  process.exit(0);
}
// --reaudit-gaps: stored audits from before AUDIT_V whose findings this version changes — a library gap, or a passage
// judged truncated from its clipped excerpt — are audited again, then the process exits.
if (process.argv.includes('--reaudit-gaps')) {
  const ids = store.prepare(`SELECT message_id FROM audits WHERE status = 'done' AND COALESCE(json_extract(verdict_json, '$.audit_v'), 1) < ?
    AND (json_extract(verdict_json, '$.data_gap.found') = 1 OR verdict_json LIKE '%truncat%') ORDER BY message_id`).all(AUDIT_V).map((r) => r.message_id);
  const byId = content.prepare(`SELECT id, session_id, round_index, content, channel, path_json, answered_at FROM chat_messages WHERE id = ?`);
  console.log(JSON.stringify({ reaudit: ids.length }));
  for (const id of ids) { const row = byId.get(id); if (row && (await audit(row))) done++; }
  console.log(JSON.stringify({ reaudited: done, spentToday: +spentToday().toFixed(4) }));
  process.exit(0);
}
for (;;) {
  if (spentToday() >= DAILY_USD) {                       // budget spent: wait for tomorrow (nothing is skipped)
    if (ONCE) break;
    await new Promise((r) => setTimeout(r, 15 * 60 * 1000)); continue;
  }
  const batch = nextBatch(lastAudited());
  let failed = false;
  for (const row of batch) {
    if (spentToday() >= DAILY_USD || done >= LIMIT) break;
    if (!(await audit(row))) { failed = true; break; }
    done++;
  }
  if (failed) { if (ONCE) break; await new Promise((r) => setTimeout(r, 5 * 60 * 1000)); continue; }
  if (ONCE || done >= LIMIT) break;
  if (!batch.length) await new Promise((r) => setTimeout(r, 60 * 1000));
}
console.log(JSON.stringify({ audited: done, spentToday: +spentToday().toFixed(4) }));
process.exit(0);
