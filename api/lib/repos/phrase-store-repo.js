// phrase-store-repo — read side of the phrase-index stores on /tank: the vector store's units table (which paragraphs
// have phrase units) and the Gemini spend ledger. Read-only. Callers: scripts/phrase-index/coverage.mjs. Deps: better-sqlite3.
import Database from 'better-sqlite3';

const STORE = process.env.PHRASE_STORE || '/tank/sifter/phrase-vectors/vectors.db';
const LEDGER = process.env.GEMINI_SPEND_DB || '/tank/sifter/gemini-spend.db';
const open = (f) => new Database(f, { readonly: true, fileMustExist: true });

/** Paragraphs that have phrase units, per scope × religion (main text field). Scans the units table (~minutes on HDD). */
export function coverageByScope() {
  const db = open(STORE);
  try {
    return db.prepare(`SELECT COALESCE(scope, 'primary') AS scope, religion, COUNT(DISTINCT paragraph_id) AS paragraphs
      FROM units WHERE field = 'text' GROUP BY 1, 2`).all();
  } finally { db.close(); }
}

/** Paragraphs that have ≥1 phrase point, per doc × stamped author (paragraphAuthor at index time) — the tier report's numerator.
 *  The scope stamp is NOT read: it is wrong for website copies; the report uses the doc's current scope. */
export function coveredByDocAuthor() {
  const db = open(STORE);
  try {
    return db.prepare(`SELECT CAST(doc_id AS INTEGER) AS doc_id, author, COUNT(DISTINCT paragraph_id) AS paragraphs
      FROM units WHERE field = 'text' GROUP BY 1, 2`).all();
  } finally { db.close(); }
}

/** Paragraphs the indexer left out ON PURPOSE (scraped-site markup / page chrome), per doc × author stamp. Older stores have no table → []. */
export function skippedByDocAuthor() {
  const db = open(STORE);
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'skipped'").get()) return [];
    return db.prepare('SELECT doc_id, author, COUNT(*) AS paragraphs FROM skipped GROUP BY 1, 2').all();
  } finally { db.close(); }
}

/** Per paragraph id: its stored units in the point-id block (id×1000 … +999, the primary key) — count, the doc ids and fields
 *  they were stamped with, how many reached Qdrant. Reads by key only, so a 70K-paragraph doc is cheap. */
export function unitsForParagraphs(ids) {
  const db = open(STORE);
  try {
    const q = db.prepare(`SELECT COUNT(*) AS n, group_concat(DISTINCT doc_id) AS docs, group_concat(DISTINCT field) AS fields, SUM(upserted) AS upserted
      FROM units WHERE point_id BETWEEN ? AND ?`);
    return ids.map((id) => ({ id, ...q.get(id * 1000, id * 1000 + 999) }));
  } finally { db.close(); }
}

/** Gemini embedding spend by month, as the indexer recorded it. */
export function monthSpend() {
  const db = open(LEDGER);
  try { return db.prepare('SELECT * FROM month_spend').all(); } finally { db.close(); }
}
