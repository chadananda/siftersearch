// Tower is the master copy (Chad 11-13): POST /_d1/dump lets scripts/ops/cloud-pull.mjs copy the edge's D1 databases home.
// Internal key only. {db} → tables + their CREATE sql; {db, table, after} → up to 1000 rows by rowid after `after`.
const DBS = { anis: 'ANIS_DB', ops: 'OPS_DB' };
const PAGE = 1000;

export async function d1Dump(request, env) {
  if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { db, table, after = 0 } = await request.json().catch(() => ({}));
  const d = env[DBS[db]];
  if (!d) return Response.json({ error: 'unknown db', dbs: Object.keys(DBS) }, { status: 400 });
  const { results: tables } = await d.prepare(`SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type DESC, name`).all();
  if (!table) return Response.json({ db, tables });
  if (!tables.some((t) => t.name === table && /^CREATE TABLE/i.test(t.sql))) return Response.json({ error: 'unknown table' }, { status: 400 });
  const { results: rows } = await d.prepare(`SELECT rowid AS _rowid_, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`).bind(Number(after) || 0).all();
  return Response.json({ db, table, rows, next: rows.length === PAGE ? rows.at(-1)._rowid_ : null });
}
