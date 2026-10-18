// dewey-archive ops job — one pass that puts every DECIDED source on the NAS archive (Chad 10-18: sources archived on
// Tower-NAS for later reference, none of them large files in the synced Dropbox). For each item past the offer stage whose
// original still lives elsewhere: stream it into <originals>/<sha256>.<ext> with its sidecar, point the item at it, and
// remove the copy if it sat in the ingest folder. A duplicate that was declined (the library has the work) just loses its
// ingest-folder copy. Your own source folders are never touched. params { dropboxIngest? } — the old Dropbox ingest folder.
import { unlink, readdir, rmdir } from 'fs/promises';
import { join } from 'path';
import { listItems, updateItem } from '../repos/dewey-repo.js';
import { archiveFile, inArchive } from '../dewey/intake.js';
import { ingestDir } from './dewey-ingest-folder-job.js';

const KEEP = new Set(['source', 'processing', 'ingested', 'needs-ocr', 'needs-human', 'failed']);

async function removeEmptyDirs(dir) {
  let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) if (e.isDirectory()) await removeEmptyDirs(join(dir, e.name));
  for (const e of await readdir(dir).catch(() => [])) if (/^(\.DS_Store|Icon\r?)$/.test(e)) await unlink(join(dir, e)).catch(() => {});
  await rmdir(dir).catch(() => {});   // only succeeds when empty
}

export async function deweyArchiveJob({ dropboxIngest = '/tank/dropbox/Ocean2.0 Supplemental/Dewey Ingest' } = {}, deps = {}) {
  const { items = async () => listItems({ limit: 5000 }), archive = archiveFile } = deps;
  const ingestRoots = [ingestDir(), dropboxIngest].filter(Boolean);
  const inIngest = (p) => ingestRoots.some((r) => String(p || '').startsWith(`${r}/`));
  const out = { archived: 0, removed: 0, mb: 0, errors: [] };
  for (const i of await items()) {
    if (!i.original_path || inArchive(i.original_path)) continue;
    try {
      if (KEEP.has(i.state)) {
        const arc = await archive(i.original_path, { itemId: i.id, title: i.title, kind: i.identified?.appraisal?.kind || i.kind || null, docId: i.doc_id || null });
        await updateItem(i.id, { original_path: arc.path, sha256: arc.sha256 }, `source archived on the NAS (${Math.round(arc.bytes / 1048576 * 10) / 10} MB)`);
        out.archived++; out.mb += arc.bytes / 1048576;
        if (inIngest(i.original_path)) { await unlink(i.original_path).catch(() => {}); out.removed++; }
      } else if (i.state === 'declined' && inIngest(i.original_path)) {
        await unlink(i.original_path).catch(() => {}); out.removed++;   // a second copy of a work the library holds
      }
    } catch (err) { out.errors.push({ id: i.id, err: String(err.message).slice(0, 120) }); }
  }
  if (dropboxIngest) await removeEmptyDirs(dropboxIngest);
  return { ...out, mb: Math.round(out.mb) };
}
