// Reviews of Anís's letters and his REFLECTIONS (Chad 10-23: "Liliane is helping test Anís (email), so make sure to carefully
// check each Anís answer to see if we could have done better. If so, fix, and then have Anís send a follow-up email as a
// reflection on what he could have done better"). D1 mail_reviews (migration 0013); runbook planning/anis-liliane-reviews.md.
//   queueReviews  hourly cron: every new letter Anís SENT to a watched reader (setting reflection_readers) → a 'pending' review
//   GET  /_mail/reviews       internal key: ?status=pending|reviewed — each letter with the reader's message it answered
//   POST /_mail/reviews       internal key: { letter_id, verdict, severity, summary } → reviewed
//   POST /_mail/reflect       internal key: { to, covers: [letter ids], text, subject? } → ONE follow-up in the reader's thread.
//                             Refused unless: `to` is a watched reader; every covered letter is a sent Anís letter to them,
//                             reviewed 'could be better' or 'wrong', and not yet answered by a reflection (one per letter).
// Chad's instruction is the approval for these (it overrides "replies need Chad approval" for this case only).
import { deliver, loadSettings } from './index.js';

const FROM_ADDR = 'anis@oceanlibrary.com';
const json = (body, status = 200) => Response.json(body, { status });
const lower = (s) => String(s || '').trim().toLowerCase();
const internal = (request, env) => env.S1_KEY && request.headers.get('x-internal-key') === env.S1_KEY;
export const watchedReaders = (settings) => String(settings?.reflection_readers || '').split(',').map(lower).filter(Boolean);
const isReflection = (meta) => { try { return JSON.parse(meta || '{}')?.type === 'reflection'; } catch { return false; } };

/** Pure: may this reflection be sent? → { ok } | { ok:false, reason }. letters = the covered rows (with their review). */
export function reflectionDecision({ to, readers, letters, covers }) {
  if (!readers.includes(lower(to))) return { ok: false, reason: `reflections go only to watched readers (${readers.join(', ') || 'none set'})` };
  if (!covers?.length) return { ok: false, reason: 'name the letter(s) this reflection answers (covers)' };
  for (const id of covers) {
    const l = letters.find((x) => x.id === id);
    if (!l) return { ok: false, reason: `letter ${id} is not a sent Anís letter to ${to}` };
    if (l.reflection_id) return { ok: false, reason: `letter ${id} already has its reflection (#${l.reflection_id}) — at most one per letter` };
    if (!['could be better', 'wrong'].includes(l.verdict)) return { ok: false, reason: `letter ${id} is not reviewed as needing one (verdict: ${l.verdict || 'none'})` };
  }
  return { ok: true };
}

/** Hourly: queue every new letter to a watched reader for review. → { queued } */
export async function queueReviews(env) {
  const db = env.ANIS_DB;
  const readers = watchedReaders(await loadSettings(db));
  if (!readers.length) return { queued: 0 };
  const { results } = await db.prepare(`SELECT m.id, m.to_addr, m.meta_json FROM mail_messages m LEFT JOIN mail_reviews r ON r.letter_id = m.id
    WHERE m.direction = 'out' AND m.status = 'sent' AND m.mailbox = 'anis' AND r.id IS NULL
      AND m.to_addr IN (${readers.map(() => '?').join(',')})`).bind(...readers).all();
  let queued = 0;
  for (const m of results) {
    if (isReflection(m.meta_json)) continue;                     // a reflection is itself reviewed by whoever sent it
    await db.prepare(`INSERT OR IGNORE INTO mail_reviews (letter_id, reader, status) VALUES (?, ?, 'pending')`).bind(m.id, lower(m.to_addr)).run();
    queued += 1;
  }
  return { queued };
}

async function listReviews(request, env) {
  if (!internal(request, env)) return json({ error: 'unauthorized' }, 401);
  await queueReviews(env);                                      // whatever arrived since the last hour is in the list too
  const status = new URL(request.url).searchParams.get('status') || 'pending';
  const db = env.ANIS_DB;
  const { results } = await db.prepare(`SELECT r.*, m.subject, m.text, m.sent_at, m.thread_key, m.error, m.meta_json, m.kind FROM mail_reviews r
    JOIN mail_messages m ON m.id = r.letter_id WHERE r.status = ? ORDER BY r.letter_id`).bind(status).all();
  for (const r of results) {   // the reader's message it answered: the last inbound in the thread before it
    r.question = await db.prepare(`SELECT id, subject, text, created_at FROM mail_messages WHERE direction = 'in' AND thread_key = ? AND id < ?
      ORDER BY id DESC LIMIT 1`).bind(r.thread_key, r.letter_id).first();
  }
  return json({ reviews: results });
}

async function recordReview(request, env) {
  if (!internal(request, env)) return json({ error: 'unauthorized' }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!b.letter_id || !['good', 'could be better', 'wrong'].includes(b.verdict)) return json({ error: 'letter_id and verdict (good | could be better | wrong) required' }, 400);
  const db = env.ANIS_DB;
  const l = await db.prepare(`SELECT id, to_addr FROM mail_messages WHERE id = ? AND direction = 'out'`).bind(b.letter_id).first();
  if (!l) return json({ error: 'no such letter' }, 404);
  await db.prepare(`INSERT INTO mail_reviews (letter_id, reader, status, verdict, severity, summary, reviewed_at) VALUES (?, ?, 'reviewed', ?, ?, ?, datetime('now'))
    ON CONFLICT(letter_id) DO UPDATE SET status = 'reviewed', verdict = excluded.verdict, severity = excluded.severity, summary = excluded.summary, reviewed_at = excluded.reviewed_at`)
    .bind(b.letter_id, lower(l.to_addr), b.verdict, b.severity ?? null, b.summary ?? null).run();
  return json({ reviewed: b.letter_id, verdict: b.verdict });
}

async function reflect(request, env) {
  if (!internal(request, env)) return json({ error: 'unauthorized' }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const db = env.ANIS_DB;
  const to = lower(b.to), covers = (b.covers || []).map(Number);
  if (!to || !b.text) return json({ error: 'to, covers, text required' }, 400);
  const readers = watchedReaders(await loadSettings(db));
  const { results: letters } = covers.length ? await db.prepare(`SELECT m.id, m.thread_key, r.verdict, r.reflection_id FROM mail_messages m
    LEFT JOIN mail_reviews r ON r.letter_id = m.id WHERE m.id IN (${covers.map(() => '?').join(',')}) AND m.direction = 'out' AND m.status = 'sent' AND m.to_addr = ?`)
    .bind(...covers, to).all() : { results: [] };
  const verdict = reflectionDecision({ to, readers, letters, covers });
  if (!verdict.ok) return json({ status: 'refused', reason: verdict.reason }, 409);
  // in the reader's own thread: answering their latest letter there (Gmail keeps the thread on the subject + References)
  const thread = letters.at(-1).thread_key;
  const last = await db.prepare(`SELECT message_id, subject FROM mail_messages WHERE direction = 'in' AND thread_key = ? AND from_addr = ? ORDER BY id DESC LIMIT 1`).bind(thread, to).first();
  const subject = b.subject || (/^re:/i.test(last?.subject || '') ? last.subject : `Re: ${last?.subject || 'our letters'}`);
  const row = await db.prepare(`INSERT INTO mail_messages (mailbox, kind, direction, status, from_addr, to_addr, subject, text, in_reply_to, thread_key, error, meta_json)
    VALUES ('anis', 'reply', 'out', 'draft', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(FROM_ADDR, to, subject, b.text, last?.message_id ?? null, thread,
    `reflection on ${covers.join(', ')}`, JSON.stringify({ type: 'reflection', covers, ...(b.meta || {}) })).first();
  const r = await deliver(env, row);
  if (r.status === 'sent') {
    for (const id of covers) await db.prepare('UPDATE mail_reviews SET reflection_id = ? WHERE letter_id = ?').bind(row.id, id).run();
  }
  return json({ ...r, subject, covers }, r.status === 'sent' ? 200 : 502);
}

/** The digest's "Anís reflections" lines: reflections sent in the window + reviews still pending. Pure over rows. */
export function reflectionLines(sent = [], pending = 0) {
  if (!sent.length && !pending) return [];
  return ['', `Anís reflections (follow-ups after a review, Chad 10-23): ${sent.length} sent · ${pending} letter${pending === 1 ? '' : 's'} awaiting review`,
    ...sent.map((x) => `  • to ${x.to_addr} — ${x.subject} (on letter${String(x.covers).includes(',') ? 's' : ''} ${x.covers})`)];
}
export async function reflectionDigest(db, since = "datetime('now', '-1 day')") {
  const { results } = await db.prepare(`SELECT id, to_addr, subject, meta_json FROM mail_messages WHERE direction = 'out' AND status = 'sent' AND sent_at > ${since}
    AND meta_json LIKE '%"type":"reflection"%' ORDER BY id`).all();
  const pending = (await db.prepare(`SELECT count(*) n FROM mail_reviews WHERE status = 'pending'`).first().catch(() => null))?.n ?? 0;
  return reflectionLines(results.map((x) => ({ ...x, covers: (JSON.parse(x.meta_json || '{}').covers || []).join(', ') })), pending);
}

export function reviewsRoute(request, env) {
  const p = new URL(request.url).pathname;
  if (request.method === 'GET' && p === '/_mail/reviews') return listReviews(request, env);
  if (request.method === 'POST' && p === '/_mail/reviews') return recordReview(request, env);
  if (request.method === 'POST' && p === '/_mail/reflect') return reflect(request, env);
  return null;
}
