// media-ledger-reconcile (report): make media_stages equal every talk's meta.json stages — the backfill, and the drift check for
// any meta.json writer not yet hooked (target: 0 changed rows). Resumable by id cursor. Deps: repos/media-ledger-repo.js.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withRecords } from '../media/stages.js';

export async function mediaLedgerReconcileJob({ afterId = 0, limit = 20000, page = 200 } = {}, deps = {}) {
  const ledger = deps.ledger || await import('../repos/media-ledger-repo.js');
  const readMeta = deps.readMeta || (async (dir) => JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')));
  const out = { talks: 0, changed_talks: 0, upserted: 0, removed: 0, unreadable: 0, last_id: Number(afterId) || 0, changed_ids: [] };
  while (out.talks < limit) {
    const rows = await ledger.ledgerWalk({ afterId: out.last_id, limit: Math.min(page, limit - out.talks) });
    if (!rows.length) break;
    for (const r of rows) {
      out.last_id = r.id; out.talks++;
      const m = await readMeta(r.dir).catch(() => null);
      if (!m) { out.unreadable++; continue; }
      const d = await ledger.syncItemStages(r.id, withRecords(m));   // + the tool record a stage ticked before records existed implies (stages.js infer; ledger only — meta.json is rewritten by its next run)
      if (d.upserted || d.removed) { out.changed_talks++; out.upserted += d.upserted; out.removed += d.removed; if (out.changed_ids.length < 50) out.changed_ids.push(r.id); }
    }
  }
  out.counts = await ledger.stageCounts();
  return out;
}
