// Tower is the master copy (Chad 11-13): POST /_d1/dump lets tower copy the edge's D1 databases home (nightly gz in
// scripts/ops/cloud-pull.mjs, the live mirror every 10 min in api/lib/ops/edge-mirror-job.js). Internal key only.
// {db} → tables + CREATE sql + primary-key columns; {db, table, after} → up to 1000 rows by rowid after `after`.
// POST /_d1/edit: the admin's few edits to the edge copy (research-set status), applied here first, mirrored after.
const DBS = { anis: 'ANIS_DB', ops: 'OPS_DB' };
const PAGE = 1000;
const STATUSES = ['candidate', 'curated', 'stale'];
const denied = (request, env) => !env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY;

export async function d1Dump(request, env) {
  if (denied(request, env)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { db, table, after = 0 } = await request.json().catch(() => ({}));
  const d = env[DBS[db]];
  if (!d) return Response.json({ error: 'unknown db', dbs: Object.keys(DBS) }, { status: 400 });
  const { results: tables } = await d.prepare(`SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type DESC, name`).all();
  if (!table) {
    for (const t of tables) if (/^CREATE TABLE/i.test(t.sql)) {
      const { results: cols } = await d.prepare(`PRAGMA table_info("${t.name}")`).all();
      t.pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
    }
    return Response.json({ db, tables });
  }
  if (!tables.some((t) => t.name === table && /^CREATE TABLE/i.test(t.sql))) return Response.json({ error: 'unknown table' }, { status: 400 });
  const { results: rows } = await d.prepare(`SELECT rowid AS _rowid_, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`).bind(Number(after) || 0).all();
  return Response.json({ db, table, rows, next: rows.length === PAGE ? rows.at(-1)._rowid_ : null });
}

export async function d1Edit(request, env) {
  if (denied(request, env)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { op, id, status } = await request.json().catch(() => ({}));
  if (op !== 'set-status' || !Number.isInteger(id) || !STATUSES.includes(status)) return Response.json({ error: 'expected {op:"set-status", id, status}', statuses: STATUSES }, { status: 400 });
  const row = await env.ANIS_DB.prepare('UPDATE anis_research_sets SET status = ?, updated_at = ? WHERE id = ? RETURNING rowid AS _rowid_, *').bind(status, Date.now(), id).first();
  return row ? Response.json({ row }) : Response.json({ error: 'no such set' }, { status: 404 });
}
