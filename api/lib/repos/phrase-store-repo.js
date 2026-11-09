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

/** Gemini embedding spend by month, as the indexer recorded it. */
export function monthSpend() {
  const db = open(LEDGER);
  try { return db.prepare('SELECT * FROM month_spend').all(); } finally { db.close(); }
}
