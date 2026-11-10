// phrase-vector-read-repo — READ-ONLY access to the phrase vector store (vectors.db: paid Gemini embeddings, half precision).
// Named reads for server-side jobs (the f16 Qdrant build); never writes. Short statements only: no open read transaction,
// so the indexer's WAL can checkpoint. Deps: better-sqlite3.
import Database from 'better-sqlite3';

export const PHRASE_STORE = () => process.env.PHRASE_STORE || '/tank/sifter/phrase-vectors/vectors.db';
// one read-only connection per store file (phrases, hype — the hot fold reads either)
const conns = new Map();
const db = (path = PHRASE_STORE()) => {
  if (!conns.has(path)) { const c = new Database(path, { readonly: true, fileMustExist: true }); c.pragma('busy_timeout = 60000'); c.pragma('query_only = 1'); conns.set(path, { c, stmts: new Map() }); }
  return conns.get(path);
};
const stmtFor = (path, n) => {
  const { c, stmts } = db(path);
  if (!stmts.has(n)) stmts.set(n, c.prepare(`SELECT u.point_id AS id, v.v AS v FROM units u JOIN vec v ON v.key = u.key WHERE u.point_id IN (${Array(n).fill('?').join(',')})`));
  return stmts.get(n);
};

/** point id → stored half-precision vector bytes (6144 B), for the ids that have one. Ids without a stored vector are absent
 *  — a point with no unit is stale (re-segmented away or withheld). `store` = another vector store file (hype). */
export function vectorsForPoints(ids, store = PHRASE_STORE()) {
  const out = new Map();
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 1000) {
    const part = ids.slice(i, i + 1000);
    for (const r of stmtFor(store, part.length).all(...part)) out.set(Number(r.id), r.v);
  }
  return out;
}

/** Units by state (upserted 0 = not sent, 1 = main, 2 = hot): the build's denominator. */
export const unitCounts = (store = PHRASE_STORE()) => Object.fromEntries(db(store).c.prepare('SELECT upserted AS s, COUNT(*) AS n FROM units GROUP BY upserted').all().map((r) => [r.s, r.n]));
export const closePhraseStore = () => { for (const { c } of conns.values()) { try { c.close(); } catch { /* already closed */ } } conns.clear(); };
