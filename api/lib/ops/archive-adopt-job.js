// archive-adopt ops report: register donor+drive, read an archive-sifter catalogue (read-only), group files into items, recommend, upsert. Idempotent; decisions survive.
// Whole catalogue is held in memory (slim rows) because grouping needs entire folders. Lane 'archive'.
import { homedir } from 'os';
import { join } from 'path';
import { readCatalog } from '../repos/archive-catalog-repo.js';
import { upsertDonor, upsertDrive, getDrive, upsertItems, pruneStale } from '../repos/archives-repo.js';
import { titleIndex, matchTitle, mainKey } from '../dewey/title-index.js';
import { groupFiles } from '../archives/group.js';
import { recommend } from '../archives/match.js';

// a file name as a title: no date prefix, no OCR / copy marks
export const fileTitle = (t) => String(t || '').replace(/^\s*\d{4}(?:[-. ]\d{1,2}){0,2}\s*[-,.]?\s*/, '').replace(/[_ ]ocr'?d\b|\s*-\s*copy(?:\s*\(\d+\))?$|\s*\(\d+\)$/gi, '').trim();

/** Books and scans with no catalogue verdict → metadata.lib {match held|unsure|new, title, id, score} from the librarian's title index. */
export function libraryMatch(index, it) {
  if (!['book', 'scan'].includes(it.kind) || it.metadata?.catalog_why) return null;
  const t = fileTitle(it.title);
  if (mainKey(t).split(' ').filter((w) => w.length > 2).length < 2) return null;   // "1925", "Prayers": too little to match on
  const [best] = matchTitle(index, t, { min: 0.8, limit: 1 });
  if (!best) return { match: 'new' };
  return { match: best.score >= 0.92 ? 'held' : 'unsure', title: best.doc.title, id: best.doc.id, score: best.score };
}

export async function archiveAdoptJob({ drive, donor, donorName, label, source, catalog, index = null } = {}) {
  const started = new Date().toISOString();
  if (!drive || !donor) throw new Error('archive-adopt needs drive and donor');
  await upsertDonor({ id: donor, name: donorName || donor });
  const prev = await getDrive(drive);
  const rows = [];
  for await (const r of readCatalog(catalog || join(homedir(), 'archive-sifter', `${drive}.db`))) rows.push(r);
  await upsertDrive({ id: drive, donor_id: donor, label, source, root: `/tank/archives/${drive}`, files: rows.length, bytes: rows.reduce((n, r) => n + (r.size || 0), 0),
    status: ['importing', 'imported', 'returned'].includes(prev?.status) ? prev.status : 'reviewing' });
  const lib = index || await titleIndex();
  const items = groupFiles(rows).map((it) => {
    const m = libraryMatch(lib, it);
    const x = m ? { ...it, metadata: { ...it.metadata, lib: m } } : it;
    return { ...x, ...recommend(x), match_ref: m?.id ? `doc:${m.id}` : it.metadata?.near || null };
  });
  await upsertItems(drive, items, { batch: 500 });
  const pruned = await pruneStale(drive, started);
  const counts = {};
  for (const it of items) { const k = (o, f) => (o[f] = (o[f] || 0) + 1); k((counts.section ||= {}), it.section); k((counts.kind ||= {}), it.kind); k((counts.match ||= {}), it.match); }
  return { drive, donor, files: rows.length, items: items.length, pruned, ...counts };
}
