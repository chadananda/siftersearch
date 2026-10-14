// Library cleanup jobs (ops worker, server-side). retire-duplicates: markDuplicate (guarded: refuses an empty/deleted/
// duplicate target), then the dup's FILE moves to _retired-duplicates/<batch>/<its path> — moved, never deleted.
import { existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname, resolve, sep } from 'path';
import { config } from '../config.js';
import { getDoc, markDuplicate } from '../docs-repo.js';

const inLibrary = (base, p) => !!p && resolve(base, p).startsWith(resolve(base) + sep);

/** params: { pairs: [{ dup, keep, reason }], batch?, apply? } — dry run unless apply:true. */
export async function retireDuplicatesJob({ pairs = [], batch = `ops-${new Date().toISOString().slice(0, 10)}`, apply = false } = {}) {
  if (!pairs.length) throw new Error('retire-duplicates: pairs required');
  const base = config.library.basePath, retired = join('_retired-duplicates', batch);
  const out = [];
  const FIELDS = ['id', 'title', 'file_path', 'duplicate_of'];   // the default select omitted file_path → no file was ever moved (10-14)
  for (const { dup, keep, reason = 'duplicate' } of pairs) {
    const d = await getDoc(dup, { follow: false, scope: 'all', fields: FIELDS }), k = await getDoc(keep, { follow: false, fields: FIELDS });
    // already retired INTO this keep → only its file still needs to leave the library (re-run after the 10-14 fix)
    const filedOnly = d?.duplicate_of != null && Number(d.duplicate_of) === Number(keep);
    const refused = !d ? 'dup not found' : !k ? 'keep not live' : (d.duplicate_of && !filedOnly) ? `already duplicate_of ${d.duplicate_of}` : null;
    const row = { dup, keep, reason, dup_title: d?.title, keep_title: k?.title, dup_path: d?.file_path, refused, ...(filedOnly ? { alreadyMarked: true } : {}) };
    if (!apply || refused) { out.push(row); continue; }
    if (!filedOnly) {
      try { await markDuplicate(dup, keep, { reason }); } catch (e) { out.push({ ...row, refused: e.message }); continue; }
    }
    row.marked = true;
    if (inLibrary(base, d.file_path)) {
      const src = join(base, d.file_path), dst = join(base, retired, d.file_path);
      if (existsSync(src) && !existsSync(dst)) { mkdirSync(dirname(dst), { recursive: true }); renameSync(src, dst); row.file_to = join(retired, d.file_path); }
    }
    out.push(row);
  }
  return { apply, batch, retired: out.filter((r) => r.marked).length, results: out };
}
