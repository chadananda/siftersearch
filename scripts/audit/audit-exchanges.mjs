#!/usr/bin/env node
// Strategy auditor process (PM2 siftersearch-audit; runs ON tower). Every minute: each Anís exchange completed since the
// last one audited → one careful model call (api/lib/audit/auditor.js) → verdict stored in its own SQLite
// (/tank/sifter/audit/audits.db, like the System-1 log — the main DB's single writer is never touched). Never inline: the
// reader already has the reply. Daily budget (AUDIT_DAILY_USD, default $25): once spent, it waits for the next day; nothing
// is skipped, only delayed. Reads chat_messages read-only, paged by id (no long read transaction).
//   node scripts/audit/audit-exchanges.mjs [--once] [--limit=N]
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildAuditPrompt, AUDIT_TOOL, costOf } from '../../api/lib/audit/auditor.js';
import { MODEL_REGISTRY } from '../../api/lib/model-registry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ONCE = process.argv.includes('--once');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '--limit=0').split('=')[1]) || Infinity;
const MODEL = process.env.AUDIT_MODEL || 'claude-sonnet-4-6';
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

const spentToday = () => store.prepare(`SELECT COALESCE(SUM(usd), 0) s FROM audits WHERE date(audited_at) = date('now')`).get().s;
const lastAudited = () => store.prepare('SELECT COALESCE(MAX(message_id), 0) m FROM audits').get().m;
const nextBatch = (after) => content.prepare(`SELECT id, session_id, round_index, content, channel, path_json, answered_at FROM chat_messages
  WHERE role = 'assistant' AND id > ? AND status IN ('answered', 'canned') ORDER BY id LIMIT 20`).all(after);
const questionOf = content.prepare(`SELECT content FROM chat_messages WHERE session_id = ? AND round_index = ? AND role = 'user' ORDER BY id LIMIT 1`);
const earlierOf = content.prepare(`SELECT role, content FROM chat_messages WHERE session_id = ? AND round_index < ? AND round_index >= ? ORDER BY round_index, id`);
const put = store.prepare(`INSERT OR REPLACE INTO audits (message_id, session_id, round, channel, asked_at, model, usd, input_tokens, output_tokens, status, verdict_json, error)
  VALUES (@message_id, @session_id, @round, @channel, @asked_at, @model, @usd, @input_tokens, @output_tokens, @status, @verdict_json, @error)`);

async function audit(row) {
  const question = questionOf.get(row.session_id, row.round_index)?.content || '';
  const earlier = earlierOf.all(row.session_id, row.round_index, row.round_index - 3);
  let path = {}; try { path = JSON.parse(row.path_json || '{}'); } catch { /* old rows */ }
  const { system, user } = buildAuditPrompt({ earlier, question, reply: row.content, path });
  const base = { message_id: row.id, session_id: row.session_id, round: row.round_index, channel: row.channel, asked_at: row.answered_at, model: MODEL };
  try {
    const res = await anthropic.messages.create({ model: MODEL, max_tokens: 1500, system, tools: [AUDIT_TOOL],
      tool_choice: { type: 'tool', name: AUDIT_TOOL.name }, messages: [{ role: 'user', content: user }] });
    const call = res.content.find((b) => b.type === 'tool_use');
    put.run({ ...base, usd: costOf(res.usage, PRICING), input_tokens: res.usage?.input_tokens ?? 0, output_tokens: res.usage?.output_tokens ?? 0,
      status: call ? 'done' : 'error', verdict_json: call ? JSON.stringify(call.input) : null, error: call ? null : `no tool call (${res.stop_reason})` });
  } catch (e) {
    put.run({ ...base, usd: 0, input_tokens: 0, output_tokens: 0, status: 'error', verdict_json: null, error: String(e.message).slice(0, 300) });
  }
}

let done = 0;
for (;;) {
  if (spentToday() >= DAILY_USD) {                       // budget spent: wait for tomorrow (nothing is skipped)
    if (ONCE) break;
    await new Promise((r) => setTimeout(r, 15 * 60 * 1000)); continue;
  }
  const batch = nextBatch(lastAudited());
  for (const row of batch) {
    if (spentToday() >= DAILY_USD || done >= LIMIT) break;
    await audit(row); done++;
  }
  if (ONCE || done >= LIMIT) break;
  if (!batch.length) await new Promise((r) => setTimeout(r, 60 * 1000));
}
console.log(JSON.stringify({ audited: done, spentToday: +spentToday().toFixed(4) }));
process.exit(0);
