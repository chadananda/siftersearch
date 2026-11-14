// edge-mirror: copy the edge's D1 databases into tower's edge_mirror (edge-mirror-repo.js) through the site Worker's
// /_d1/dump. Small tables (< FULL_BELOW rows) and every table once a day: a full pass (updates + deletes caught).
// Big tables between: only rows past the cursor (they are append-mostly; INSERT OR REPLACE gives a new rowid, so caught).
// Run every 10 min by siftersearch-reports (edgeMirrorLoop). Deps: edge-mirror-repo, fetch.
import { mirrorTables, saveTable, upsertRows, finishTable, pkOf } from '../repos/edge-mirror-repo.js';

const DBS = ['anis', 'ops'];
const FULL_BELOW = 5000;
const DAY = 86400000;
export const SITE = () => process.env.EDGE_MIRROR_SITE || 'https://siftersearch.com';

export async function edgeCall(path, body, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${SITE()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Pure: does this table get a full pass now? */
export const wantFull = (known, { forceFull = false, now = Date.now() } = {}) =>
  forceFull || !known || (known.rows ?? 0) < FULL_BELOW || !known.full_at || now - Date.parse(`${known.full_at.replace(' ', 'T')}Z`) > DAY;

export async function edgeMirrorJob({ forceFull = false, dbs = DBS, call = edgeCall, repo = { mirrorTables, saveTable, upsertRows, finishTable } } = {}) {
  const out = {};
  for (const db of dbs) {
    const { tables } = await call('/_d1/dump', { db });
    const known = Object.fromEntries((await repo.mirrorTables(db)).map((t) => [t.name, t]));
    for (const t of tables) await repo.saveTable(db, t);
    for (const t of tables.filter((x) => /^CREATE TABLE/i.test(x.sql))) {
      const full = wantFull(known[t.name], { forceFull });
      const seen = full ? new Set() : null;
      let after = full ? 0 : known[t.name]?.max_rid || 0, maxRid = after, n = 0;
      while (after != null) {
        const p = await call('/_d1/dump', { db, table: t.name, after });
        await repo.upsertRows(db, t.name, t.pk, p.rows);
        for (const r of p.rows) { seen?.add(pkOf(r, t.pk)); maxRid = Math.max(maxRid, r._rowid_); }
        n += p.rows.length; after = p.next;
      }
      const removed = await repo.finishTable(db, t.name, { seen, maxRid, full });
      out[`${db}.${t.name}`] = { full, read: n, removed };
    }
  }
  return out;
}
