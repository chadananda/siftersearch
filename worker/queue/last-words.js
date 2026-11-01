// An agent's last words (Chad 10-31: "log the health polls so we can reconstruct what went wrong"): as a queue agent exits it sends why, its
// last /health snapshots and log lines (scripts/media/worker/health.mjs lastWords, ≤ 32 KB). Kept in the queue's own SQLite (edge DO + tower's
// LAN queue, same code), the last KEEP rows; tower's health poller reads them into its health history. Machine key may send; admin reads.
export const KEEP = 500, MAX_BYTES = 40_000;

export function migrate(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS last_words (id INTEGER PRIMARY KEY AUTOINCREMENT, host TEXT NOT NULL, at INTEGER NOT NULL, body TEXT NOT NULL)`);
}
/** Store one machine's last words; oversized bodies are refused, the table keeps only the newest KEEP. */
export function put(sql, a = {}, now = Date.now()) {
  const host = String(a.host || '').replace(/[^\w.-]/g, '').slice(0, 80);
  if (!host) throw new Error('host required');
  const body = JSON.stringify({ ...a, host });
  if (body.length > MAX_BYTES) throw new Error(`last words too long (${body.length} > ${MAX_BYTES})`);
  sql.exec(`INSERT INTO last_words (host, at, body) VALUES (?, ?, ?)`, host, now, body);
  sql.exec(`DELETE FROM last_words WHERE id <= (SELECT id FROM last_words ORDER BY id DESC LIMIT 1 OFFSET ?)`, KEEP);
  return { ok: true };
}
/** Last words received after `since` (ms), oldest first: [{ id, host, at, words }]. */
export function list(sql, { since = 0, host, limit = 100 } = {}) {
  const rows = sql.exec(`SELECT id, host, at, body FROM last_words WHERE at > ? ${host ? 'AND host = ?' : ''} ORDER BY id ASC LIMIT ?`, ...[Number(since) || 0, ...(host ? [String(host)] : []), Math.min(500, Number(limit) || 100)]).toArray();
  return rows.map((r) => ({ id: r.id, host: r.host, at: r.at, words: JSON.parse(r.body) }));
}
