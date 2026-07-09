// ENFORCEMENT GATE — entity/claim extraction MUST NOT run on a book before its disambiguation pass is complete.
// (Pipeline invariant: DISAMBIGUATE → EXTRACT → INTEGRATE → SEARCH; see docs/disambiguation-methodology.md.)
// Every extractor calls assertDisambiguated(DOC) at entry; it aborts unless content.context coverage for the
// book's main-text paragraphs is complete (context_model='deepseek-disambig-v1'). Override for testing only:
// SKIP_DISAMBIG_GATE=1.
import { queryAll } from '../../api/lib/db.js';
const TAG = 'deepseek-disambig-v1';

export async function assertDisambiguated(doc, { threshold = 0.99 } = {}) {
  const allow = process.env.SKIP_DISAMBIG_GATE === '1';
  const r = (await queryAll(
    `SELECT COUNT(*) total, COUNT(CASE WHEN context IS NOT NULL AND context_model=? THEN 1 END) have
       FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype='paragraph'`, [TAG, doc]))[0] || { total: 0, have: 0 };
  const cov = r.total ? r.have / r.total : 0;
  const msg = `disambiguation coverage doc ${doc}: ${r.have}/${r.total} (${(cov * 100).toFixed(1)}%) model=${TAG}`;
  if (r.total > 0 && cov >= threshold) { console.error(`✓ ${msg} — extraction allowed`); return; }
  if (allow) { console.error(`⚠ ${msg} — below ${(threshold * 100)}% but SKIP_DISAMBIG_GATE=1, proceeding`); return; }
  console.error(`✗ ${msg}\n  EXTRACTION BLOCKED — disambiguate this book first:\n    SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 DOC=${doc} node scripts/entity-read/disambiguate-book.mjs\n  (testing override: SKIP_DISAMBIG_GATE=1)`);
  process.exit(2);
}
