// phrase-vector-read-repo — READ-ONLY access to the phrase vector store (vectors.db: paid Gemini embeddings, half precision).
// Named reads for server-side jobs (the f16 Qdrant build); never writes. Short statements only: no open read transaction,
// so the indexer's WAL can checkpoint. Deps: better-sqlite3.
import Database from 'better-sqlite3';

export const PHRASE_STORE = () => process.env.PHRASE_STORE || '/tank/sifter/phrase-vectors/vectors.db';
let conn = null;
const db = () => {
  if (!conn) { conn = new Database(PHRASE_STORE(), { readonly: true, fileMustExist: true }); conn.pragma('busy_timeout = 60000'); conn.pragma('query_only = 1'); }
  return conn;
};
const stmts = new Map();
const stmtFor = (n) => { if (!stmts.has(n)) stmts.set(n, db().prepare(`SELECT u.point_id AS id, v.v AS v FROM units u JOIN vec v ON v.key = u.key WHERE u.point_id IN (${Array(n).fill('?').join(',')})`)); return stmts.get(n); };

/** point id → stored half-precision vector bytes (6144 B), for the ids that have one. Ids without a stored vector are absent. */
export function vectorsForPoints(ids) {
  const out = new Map();
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 1000) {
    const part = ids.slice(i, i + 1000);
    for (const r of stmtFor(part.length).all(...part)) out.set(Number(r.id), r.v);
  }
  return out;
}

/** Units by state (upserted 0 = not sent, 1 = main, 2 = hot): the build's denominator. */
export const unitCounts = () => Object.fromEntries(db().prepare('SELECT upserted AS s, COUNT(*) AS n FROM units GROUP BY upserted').all().map((r) => [r.s, r.n]));
export const closePhraseStore = () => { try { conn?.close(); } catch { /* already closed */ } conn = null; stmts.clear(); };
