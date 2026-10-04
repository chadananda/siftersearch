#!/usr/bin/env node
// One-time: re-stamp `author` on already-indexed Qdrant points (phrases + paragraphs_kw) with the PARAGRAPH's own writer
// where it differs from the book's (migration 140; the Meili side was done by scripts/authorship/push-meili-authors.mjs).
// Without it a Qdrant author filter means "book by X" while Meili's means "written by X" (search A/B 2026-10-04).
// set_payload only — no re-embedding. Also updates the vector store's units table so a later re-upsert keeps the value.
// Library + OceanLibrary only (scraped sites untouched). Runs ON tower; dry run by default.
//   node scripts/phrase-index/push-qdrant-authors.mjs [--apply]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { paragraphAuthor } from '../../api/lib/authorship/effective.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
const QD = process.env.QDRANT_URL || 'http://127.0.0.1:6333', QK = process.env.QDRANT_KEY || '';
const APPLY = process.argv.includes('--apply');

const src = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
src.pragma('busy_timeout = 120000');
// paged by id, each page its own short read (feedback: one long read txn blocks the WAL checkpoint)
const page = src.prepare(`SELECT c.id, c.doc_id, c.authors, d.author FROM content c JOIN docs d ON d.id = c.doc_id
  WHERE c.id > ? AND c.authors_model LIKE 'reader-%' AND c.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0
    AND d.deleted_at IS NULL AND (d.source_site IS NULL OR d.source_site = 'oceanlibrary.com') ORDER BY c.id LIMIT 20000`);
const updates = [];
for (let last = 0; ;) {
  const rows = page.all(last); if (!rows.length) break; last = rows[rows.length - 1].id;
  for (const r of rows) { const who = paragraphAuthor(r); if (who && who !== r.author) updates.push({ id: r.id, doc: String(r.doc_id), author: who }); }
}
const byAuthor = {}; for (const u of updates) byAuthor[u.author] = (byAuthor[u.author] || 0) + 1;
console.log(JSON.stringify({ updates: updates.length, top: Object.entries(byAuthor).sort((a, b) => b[1] - a[1]).slice(0, 10), apply: APPLY }));
if (!APPLY) process.exit(0);

async function qd(path, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(QD + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': QK }, body: JSON.stringify(body) });
      if (!r.ok) throw Object.assign(new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 200)}`), { http: true });
      return r.json();
    } catch (e) { if (e.http || attempt >= 4) throw e; await new Promise((res) => setTimeout(res, 1000 * (attempt + 1))); }
  }
}
const store = new Database('/tank/sifter/phrase-vectors/vectors.db');
store.pragma('busy_timeout = 60000');   // the build writes this store concurrently
// by doc_id first: units has an index on doc_id, none on paragraph_id (16M rows; building one would lock the live build)
const setUnits = store.prepare('UPDATE units SET author = ? WHERE doc_id = ? AND paragraph_id = ?');
// one batch request per 200 paragraphs, one set_payload per author in it. Filters, not point ids: a paragraph with no
// keyword tokens has no paragraphs_kw point, and set_payload on a missing id fails the whole request; a filter just matches none.
for (let i = 0; i < updates.length; i += 200) {
  const chunk = updates.slice(i, i + 200), groups = new Map();
  for (const u of chunk) (groups.get(u.author) || groups.set(u.author, []).get(u.author)).push(u.id);
  const ops = (f) => [...groups].map(([author, ids]) => ({ set_payload: { payload: { author }, filter: f(ids) } }));
  await qd('/collections/phrases/points/batch?wait=false', { operations: ops((ids) => ({ must: [{ key: 'paragraph_id', match: { any: ids } }] })) });
  await qd('/collections/paragraphs_kw/points/batch?wait=false', { operations: ops((ids) => ({ must: [{ has_id: ids }] })) });
  store.transaction(() => { for (const u of chunk) setUnits.run(u.author, u.doc, String(u.id)); })();
  if ((i / 200) % 25 === 0) console.log(JSON.stringify({ sent: Math.min(i + 200, updates.length), of: updates.length }));
}
console.log(JSON.stringify({ done: updates.length }));
process.exit(0);
