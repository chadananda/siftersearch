#!/usr/bin/env node
// OceanLibrary docs carried the opaque collection_id hash in docs.collection; the adapter now stores the folder name
// (api/lib/library/ol-works.js). This backfills existing rows: collection = olPlacement(file_path).shelf (null for a book
// directly under its tradition). Runs ON tower (SIFTER_WRITER_URL). Dry run by default.
//   node scripts/library/ol-shelves-backfill.mjs [--apply]
import { listDocs, setDocCollection } from '../../api/lib/docs-repo.js';
import { olPlacement } from '../../api/lib/library/ol-works.js';

const APPLY = process.argv.includes('--apply');
const { docs } = await listDocs({ sourceSite: 'oceanlibrary.com', fields: ['id', 'file_path', 'author', 'collection', 'title'], limit: 5000 });
const changes = docs.map((d) => ({ d, shelf: olPlacement(d.file_path, d.author).shelf, work: olPlacement(d.file_path, d.author).work }))
  .filter(({ d, shelf }) => (shelf || null) !== (d.collection || null));
const byShelf = {};
for (const c of changes) byShelf[c.shelf || '(none)'] = (byShelf[c.shelf || '(none)'] || 0) + 1;
console.log(JSON.stringify({ docs: docs.length, toChange: changes.length, apply: APPLY, byShelf }, null, 1));
if (APPLY) {
  let n = 0;
  for (const { d, shelf } of changes) n += (await setDocCollection(d.id, shelf || null)).changed;
  console.log(JSON.stringify({ changed: n }));
}
process.exit(0);
