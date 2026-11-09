// jev-misses-repo — the Jev MISS ledger (strategies.db, beside strategy_gaps): each recheck miss (Haiku found the strategy Jev missed)
// from gold label to fix attempt, and every fix attempt with its numbers. Server processes only; questions never leave this DB.
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const safeJson = (s, d = null) => { try { return JSON.parse(s); } catch { return d; } };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jev_misses (
  turn_id TEXT PRIMARY KEY, gate TEXT NOT NULL, gold TEXT NOT NULL, jev_choice TEXT, jev_confidence REAL,
  call_id INTEGER, labelled_at TEXT, fix_id INTEGER, created_at TEXT);
CREATE INDEX IF NOT EXISTS jev_misses_open ON jev_misses (gate, fix_id, labelled_at);
CREATE TABLE IF NOT EXISTS jev_miss_fixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, gate TEXT NOT NULL, gold TEXT NOT NULL, status TEXT NOT NULL, misses INTEGER, targets INTEGER,
  strategies TEXT, usd REAL, result_json TEXT, created_at TEXT);`;
export const ensureMissSchema = (db) => { db.exec(SCHEMA); return db; };

/** Copy the recheck gaps (strategy_gaps source 'recheck' = the strategy gate) not yet tracked into the ledger. → rows added */
export const syncMisses = (db, gate) => ensureMissSchema(db).prepare(`INSERT OR IGNORE INTO jev_misses (turn_id, gate, gold, jev_choice, jev_confidence, created_at)
  SELECT turn_id, ?, label, jev_choice, jev_confidence, created_at FROM strategy_gaps WHERE source = 'recheck'`).run(gate).changes;
/** Misses whose gate call has no gold label yet (the recheck's answer), oldest first. */
export const unlabelledMisses = (db, gate) => ensureMissSchema(db).prepare('SELECT * FROM jev_misses WHERE gate = ? AND labelled_at IS NULL ORDER BY created_at').all(gate);
export const markLabelled = (db, turn_id, call_id) => db.prepare('UPDATE jev_misses SET call_id = ?, labelled_at = ? WHERE turn_id = ?').run(call_id, nowIso(), turn_id).changes;
/** Labelled misses no fix attempt has seen, grouped by gold strategy, biggest first: [{ gold, misses: [row + question] }]. */
export function pendingGroups(db, gate) {
  const rows = ensureMissSchema(db).prepare(`SELECT m.*, g.question FROM jev_misses m LEFT JOIN strategy_gaps g ON g.turn_id = m.turn_id
    WHERE m.gate = ? AND m.labelled_at IS NOT NULL AND m.fix_id IS NULL ORDER BY m.created_at`).all(gate);
  const by = new Map();
  for (const r of rows) { if (!by.has(r.gold)) by.set(r.gold, []); by.get(r.gold).push(r); }
  return [...by].map(([gold, misses]) => ({ gold, misses })).sort((a, b) => b.misses.length - a.misses.length);
}
/** Log one fix attempt; `turnIds` (omit to leave the misses open for a retry) are closed to it. → fix id */
export function logFix(db, { gate, gold, status, misses = 0, targets = 0, strategies = [], usd = 0, result = null }, turnIds = []) {
  ensureMissSchema(db);
  return db.transaction(() => {
    const id = Number(db.prepare('INSERT INTO jev_miss_fixes (gate, gold, status, misses, targets, strategies, usd, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(gate, gold, status, misses, targets, JSON.stringify(strategies), usd, result ? JSON.stringify(result) : null, nowIso()).lastInsertRowid);
    const mark = db.prepare('UPDATE jev_misses SET fix_id = ? WHERE turn_id = ?');
    for (const t of turnIds) mark.run(id, t);
    return id;
  })();
}
export const listFixes = (db, { since = '', limit = 100 } = {}) => ensureMissSchema(db).prepare('SELECT * FROM jev_miss_fixes WHERE created_at >= ? ORDER BY id DESC LIMIT ?')
  .all(since, limit).map(({ result_json, strategies, ...r }) => ({ ...r, strategies: safeJson(strategies, []), result: safeJson(result_json) }));
/** Misses created in [from, to) ('YYYY-MM-DD HH:MM:SS'), per gold strategy. */
export const missCounts = (db, gate, { from, to }) => ensureMissSchema(db).prepare('SELECT gold, COUNT(*) AS n FROM jev_misses WHERE gate = ? AND created_at >= ? AND created_at < ? GROUP BY gold ORDER BY n DESC')
  .all(gate, from, to);
