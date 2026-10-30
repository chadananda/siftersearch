// archive-adopt ops report: register donor+drive, read an archive-sifter catalogue (read-only), group files into items, recommend, upsert. Idempotent; decisions survive.
// Whole catalogue is held in memory (slim rows) because grouping needs entire folders. Lane 'archive'.
import { homedir } from 'os';
import { join } from 'path';
import { readCatalog } from '../repos/archive-catalog-repo.js';
import { upsertDonor, upsertDrive, getDrive, upsertItems } from '../repos/archives-repo.js';
import { groupFiles } from '../archives/group.js';
import { recommend } from '../archives/match.js';

export async function archiveAdoptJob({ drive, donor, donorName, label, source, catalog } = {}) {
  if (!drive || !donor) throw new Error('archive-adopt needs drive and donor');
  await upsertDonor({ id: donor, name: donorName || donor });
  const prev = await getDrive(drive);
  const rows = [];
  for await (const r of readCatalog(catalog || join(homedir(), 'archive-sifter', `${drive}.db`))) rows.push(r);
  await upsertDrive({ id: drive, donor_id: donor, label, source, root: `/tank/archives/${drive}`, files: rows.length, bytes: rows.reduce((n, r) => n + (r.size || 0), 0),
    status: ['importing', 'imported', 'returned'].includes(prev?.status) ? prev.status : 'reviewing' });
  const items = groupFiles(rows).map((it) => ({ ...it, ...recommend(it), match_ref: it.metadata?.near || null }));
  await upsertItems(drive, items, { batch: 500 });
  const counts = {};
  for (const it of items) { const k = (o, f) => (o[f] = (o[f] || 0) + 1); k((counts.section ||= {}), it.section); k((counts.kind ||= {}), it.kind); k((counts.match ||= {}), it.match); }
  return { drive, donor, files: rows.length, items: items.length, ...counts };
}
