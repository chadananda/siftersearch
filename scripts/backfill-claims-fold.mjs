// One-time backfill of entity_claims.hay_folded (migration 104) — the bio-search SQL-prefilter key.
// Reads claims in chunks (read-only), folds in JS (EXACT same fold as bio.js / the claims adapter),
// writes through the single writer (/write :7849) in batches. Idempotent: only NULL rows are touched.
// Run on tower-nas: node scripts/backfill-claims-fold.mjs
import Database from 'better-sqlite3';

const WRITER = process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';
const db = new Database('data/sifter.db', { readonly: true });
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();

const total = db.prepare(`SELECT COUNT(*) n FROM entity_claims WHERE hay_folded IS NULL`).get().n;
console.log(`backfilling hay_folded for ${total} claims`);
let done = 0, lastId = 0;
for (;;) {
  const rows = db.prepare(`SELECT id, statement, proof_verbatim FROM entity_claims
    WHERE hay_folded IS NULL AND id > ? ORDER BY id LIMIT 5000`).all(lastId);
  if (!rows.length) break;
  lastId = rows[rows.length - 1].id;
  const statements = rows.map((r) => ({
    sql: `UPDATE entity_claims SET hay_folded=? WHERE id=?`,
    args: [fold(`${r.statement || ''} ${r.proof_verbatim || ''}`), r.id],
  }));
  const res = await fetch(`${WRITER}/write`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ statements, name: 'backfill-claims-fold' }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`writer ${res.status}: ${await res.text()}`);
  done += rows.length;
  if (done % 50000 < 5000) console.log(`${done}/${total}`);
}
console.log(`BACKFILL DONE: ${done} rows folded`);
