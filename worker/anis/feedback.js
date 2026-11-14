// POST /api/chat/feedback — a reader's thumbs up/down on one reply → D1 anis_feedback (0017). Pure validation + one upsert; no model call.
const VOTES = { up: 1, down: -1, none: 0, 1: 1, '-1': -1, 0: 0 };

/** Request body → a row to store, or { error }. conversation_id ≤ 64 chars, round 1…500, vote up | down | none (or 1 / -1 / 0). */
export function feedbackRow(body, { site = null, now = Date.now() } = {}) {
  const id = typeof body?.conversation_id === 'string' ? body.conversation_id.trim() : '';
  if (!id || id.length > 64 || !/^[\w-]+$/.test(id)) return { error: 'conversation_id required' };
  const round = Number(body?.round);
  if (!Number.isInteger(round) || round < 1 || round > 500) return { error: 'round must be a positive integer' };
  const vote = VOTES[String(body?.vote)];
  if (vote === undefined) return { error: 'vote must be up, down or none' };
  const question = typeof body?.question === 'string' ? body.question.replace(/\s+/g, ' ').trim().slice(0, 300) || null : null;
  return { conversation_id: id, round, vote, question, site, at: now };
}

export async function feedback(request, env, { headers = {} } = {}) {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });
  let site = null;
  try { site = new URL(request.headers.get('origin') || request.headers.get('referer') || '').host || null; } catch { /* none */ }
  const row = feedbackRow(await request.json().catch(() => null), { site });
  if (row.error) return json({ error: row.error }, 400);
  await env.ANIS_DB.prepare(`INSERT INTO anis_feedback (conversation_id, round, vote, question, site, at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (conversation_id, round) DO UPDATE SET vote = excluded.vote, question = COALESCE(excluded.question, anis_feedback.question), at = excluded.at`)
    .bind(row.conversation_id, row.round, row.vote, row.question, row.site, row.at).run();
  return json({ ok: true, vote: row.vote });
}
