#!/usr/bin/env node
// One-time: set each Meili paragraph's `author` (+ authority) to the PARAGRAPH's own writer where it differs from the
// book's (Chad, 2026-10-03: "filtering searches by author should correctly return an author cited in another book").
// Partial updates of two fields — no vectors re-sent, no synced=0 resync, no index-settings change (`author` is already
// filterable). Future syncs do the same through unified-worker. Primary 'paragraphs' index only (library + OceanLibrary).
// Dry run by default.   node scripts/authorship/push-meili-authors.mjs [--apply] [--chunk 5000]
import { queryAll } from '../../api/lib/db.js';
import { listDocs } from '../../api/lib/docs-repo.js';
import { getMeili } from '../../api/lib/search.js';
import { effectiveAuthor } from '../../api/lib/authorship/effective.js';
import { authorAuthority, getAuthority } from '../../api/lib/authority.js';

const APPLY = process.argv.includes('--apply');
const CHUNK = Number(process.argv[process.argv.indexOf('--chunk') + 1]) || 5000;
// documents through the docs repository (live scope), fetched as the paragraphs need them
const docs = new Map();
const loadDocs = async (ids) => {
  const need = [...new Set(ids)].filter((id) => !docs.has(id));
  for (let i = 0; i < need.length; i += 1000) {
    const { docs: got } = await listDocs({ ids: need.slice(i, i + 1000), limit: 1000, fields: ['id', 'title', 'author', 'religion', 'collection', 'source_site'] });
    for (const d of got) docs.set(d.id, d);
    for (const id of need.slice(i, i + 1000)) if (!docs.has(id)) docs.set(id, null);
  }
};
const updates = [];
let scanned = 0;
for (let last = 0; ;) {
  const rows = await queryAll(`SELECT id, doc_id, authors FROM content WHERE id > ? AND authors_model LIKE 'reader-%'
    AND deleted_at IS NULL AND COALESCE(is_duplicate, 0) = 0 ORDER BY id LIMIT 50000`, [last]);
  if (!rows.length) break;
  last = rows[rows.length - 1].id; scanned += rows.length;
  await loadDocs(rows.map((r) => r.doc_id));
  for (const r of rows) {
    const d = docs.get(r.doc_id); if (!d || (d.source_site && d.source_site !== 'oceanlibrary.com')) continue;
    const who = effectiveAuthor({ authors: r.authors, author: d.author }).author;
    if (!who || who === d.author) continue;
    let bookAuthority = 0; try { bookAuthority = getAuthority(d); } catch { /* 0 */ }
    updates.push({ id: r.id, author: who, authority: authorAuthority(who) ?? bookAuthority });
  }
}
const byAuthor = {}; for (const u of updates) byAuthor[u.author] = (byAuthor[u.author] || 0) + 1;
console.log(JSON.stringify({ scanned, updates: updates.length, top: Object.entries(byAuthor).sort((a, b) => b[1] - a[1]).slice(0, 10), apply: APPLY }));
if (!APPLY) process.exit(0);
const index = getMeili().index('paragraphs');
for (let i = 0; i < updates.length; i += CHUNK) {
  const task = await index.updateDocuments(updates.slice(i, i + CHUNK));
  console.log(JSON.stringify({ sent: Math.min(i + CHUNK, updates.length), of: updates.length, task: task.taskUid }));
}
process.exit(0);
