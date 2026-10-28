// Shared test rig for the Dewey job registry: db.js replaced by an in-memory better-sqlite3 holding the real migration-185 schema.
import Database from 'better-sqlite3';
import { DEWEY_JOBS_SQL } from '../../api/lib/dewey/jobs/schema.js';

export function memDb() {
  const db = new Database(':memory:');
  for (const sql of DEWEY_JOBS_SQL) db.exec(sql);
  const run = (sql, args = []) => { const st = db.prepare(sql); if (/^\s*(select|with)/i.test(sql)) return { rows: st.all(...args) }; const r = st.run(...args); return { lastInsertRowid: r.lastInsertRowid, changes: r.changes }; };
  return { db, mod: {
    query: async (sql, args) => run(sql, args), queryOne: async (sql, args) => db.prepare(sql).get(...(args || [])) || null,
    queryAll: async (sql, args) => db.prepare(sql).all(...(args || [])), transaction: async (sts) => sts.map((s) => run(s.sql, s.args)),
  } };
}
