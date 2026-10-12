// audit-store-repo — the strategy auditor's verdicts (its own SQLite, /tank/sifter/audit/audits.db, written only by
// scripts/audit/audit-exchanges.mjs). Read-only here; opened per call, closed after. Deps: better-sqlite3.
import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const AUDIT_DB = () => process.env.AUDIT_DB || '/tank/sifter/audit/audits.db';
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

/** Audit rows for these reply ids → Map(id → { status, audited_at, usd, v }). */
export function auditsFor(ids, { auditDb } = {}) {
  const db = auditDb || (existsSync(AUDIT_DB()) ? new Database(AUDIT_DB(), { readonly: true, fileMustExist: true }) : null);
  const out = new Map();
  if (!db || !ids.length) return out;
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      for (const r of db.prepare(`SELECT message_id, status, audited_at, usd, verdict_json, error FROM audits WHERE message_id IN (${chunk.map(() => '?').join(',')})`).all(...chunk)) {
        out.set(Number(r.message_id), { status: r.status, audited_at: r.audited_at, usd: r.usd, error: r.error, v: safeJson(r.verdict_json) });
      }
    }
  } finally { if (!auditDb) db.close(); }
  return out;
}

