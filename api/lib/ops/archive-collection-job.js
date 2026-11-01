// archive-collection-backfill + archive-search ops reports. Backfill mirrors a drive's catalogue items (and any worker probes already on them) into its collection.db
// (<ARCHIVES_DIR>/<drive>.data/, repos/collection-repo.js) — golden-age today, every later drive during adopt. Search reads ACROSS all collection.db files. Lane 'archive'.
import { getDrive, listItems } from '../repos/archives-repo.js';
import { syncItems, searchCollections, sifterRows, mergeSifter } from '../repos/collection-repo.js';

export async function archiveCollectionBackfillJob({ drive: driveId } = {}, deps = {}) {
  const { get = getDrive, list = listItems, sync = syncItems, sifter = sifterRows, merge = mergeSifter, draining = (await import('../drain.js')).isDraining } = deps;
  const drive = await get(driveId);
  if (!drive) throw new Error(`no drive ${driveId}`);
  let offset = 0, rows = 0;
  for (;;) {
    const page = await list(drive.id, { limit: 500, offset });
    if (!page.length) break;
    rows += sync(drive.id, drive, page); offset += page.length;
    if (page.length < 500) break;
    if (draining()) return { drive: drive.id, yielded: true, rows, note: 'drained; run again (idempotent)' };
  }
  // the archive-sifter's own catalogue of this drive (fingerprint, suggestions, its decisions) joins the rows; absent → nothing to add
  const extra = await merge(drive.id, await sifter(drive.id));
  return { drive: drive.id, rows, sifter: extra };
}

export async function archiveSearchJob(params = {}, deps = {}) {
  const { search = searchCollections } = deps;
  if (!['q', 'title', 'sha', 'cluster'].some((k) => params[k])) throw new Error('archive-search needs q (text), title, sha or cluster');
  const hits = search(params);
  return { hits: hits.length, results: hits };
}
