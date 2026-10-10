// WorkPlan store (D1 OPS_DB, worker/d1/ops). Server-to-server only — the internal key (Worker secret S1_KEY); the admin
// page reaches it through tower's /api/admin/workplan (admin JWT), Claude through scripts/workplan.mjs.
//   GET  /_work/items                 all items, grouped order (in_progress, queued by position, blocked, done recent)
//   POST /_work/items                 {title, detail?, area?, status?, note?, requested_by?, position?} → created item
//   POST /_work/items/:id             patch any of {title, detail, area, status, note, blocked_on, position, links}
//   POST /_work/reorder               {ids: [...]} → queue positions 1..n in that order
const STATUSES = new Set(['queued', 'in_progress', 'blocked', 'done', 'dropped']);
const FIELDS = ['title', 'detail', 'area', 'status', 'note', 'blocked_on', 'position', 'requested_by', 'links'];
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function workRoute(request, env) {
  if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return json({ error: 'unauthorized' }, 401);
  if (!env.OPS_DB) return json({ error: 'OPS_DB not bound' }, 500);
  const url = new URL(request.url);
  const db = env.OPS_DB;
  if (request.method === 'GET' && url.pathname === '/_work/items') {
    const { results } = await db.prepare(`SELECT * FROM work_items WHERE status <> 'dropped' AND (status <> 'done' OR done_at >= datetime('now','-30 days'))
      ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END, position, id`).all();
    return json({ items: results });
  }
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (url.pathname === '/_work/items') {
    if (!body?.title) return json({ error: 'title required' }, 400);
    const status = STATUSES.has(body.status) ? body.status : 'queued';
    const pos = Number.isFinite(body.position) ? body.position
      : ((await db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM work_items WHERE status = 'queued'`).first())?.p ?? 1);
    const row = await db.prepare(`INSERT INTO work_items (title, detail, area, status, note, requested_by, position, links, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'in_progress' THEN datetime('now') END) RETURNING *`)
      .bind(body.title, body.detail ?? null, body.area ?? null, status, body.note ?? null, body.requested_by ?? null, pos,
        body.links ? JSON.stringify(body.links) : null, status).first();
    return json({ item: row });
  }
  const m = /^\/_work\/items\/(\d+)$/.exec(url.pathname);
  if (m) {
    const sets = [], args = [];
    for (const f of FIELDS) if (f in body) {
      if (f === 'status' && !STATUSES.has(body.status)) return json({ error: 'bad status' }, 400);
      sets.push(`${f} = ?`); args.push(f === 'links' && body.links ? JSON.stringify(body.links) : body[f]);
    }
    if (!sets.length) return json({ error: 'nothing to change' }, 400);
    if (body.status === 'in_progress') sets.push(`started_at = COALESCE(started_at, datetime('now'))`);
    if (body.status === 'done') sets.push(`done_at = datetime('now')`);
    sets.push(`updated_at = datetime('now')`);
    const row = await db.prepare(`UPDATE work_items SET ${sets.join(', ')} WHERE id = ? RETURNING *`).bind(...args, Number(m[1])).first();
    return row ? json({ item: row }) : json({ error: 'not found' }, 404);
  }
  if (url.pathname === '/_work/reorder') {
    const ids = (body?.ids || []).map(Number).filter(Number.isFinite);
    await db.batch(ids.map((id, i) => db.prepare(`UPDATE work_items SET position = ?, updated_at = datetime('now') WHERE id = ?`).bind(i + 1, id)));
    return json({ ok: true, n: ids.length });
  }
  return json({ error: 'not found' }, 404);
}
