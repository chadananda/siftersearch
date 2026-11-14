// The reader's indications bio at the edge (D1 anis_indications, migration 0020): who the reader is (readerOf), what they said (loadBio),
// the agent's note_indication tool (noteIndication), and the reader's own GET/DELETE /api/chat/bio. Pure pieces: api/lib/assistant/indications.js.
import { validIndication } from '../../api/lib/assistant/indications.js';

const ID = /^[A-Za-z0-9_-]{16,64}$/;   // a widget device id is a UUID; a short or guessable one falls back to the conversation
/** One bio per reader: a trusted caller's id as given (the mail Worker: mail:<emailHash>); the widget's device id (dev:); else the conversation. */
export function readerOf(body, { trusted = false, conversationId = null } = {}) {
  const id = String(body?.reader_id || '');
  if (trusted && /^mail:[a-f0-9]{16,64}$/.test(id)) return id;
  if (ID.test(id)) return `dev:${id}`;
  return conversationId ? `conv:${String(conversationId).slice(0, 64)}` : null;
}

export async function loadBio(env, reader, limit = 40) {
  if (!env.ANIS_DB || !reader) return [];
  const r = await env.ANIS_DB.prepare('SELECT kind, value, evidence, conversation_id, round, at FROM anis_indications WHERE reader = ? ORDER BY at DESC LIMIT ?').bind(reader, limit).all();
  return r?.results || [];
}

/** The tool: validates, stores the row (never on the critical path when ctx is given), answers the agent at once. */
export const noteIndication = (env, { reader, conversationId, round, ctx = null }) => async (args) => {
  const v = validIndication(args);
  if (v.error) return `not noted: ${v.error}`;
  if (!env.ANIS_DB || !reader) return 'noted';
  const p = env.ANIS_DB.prepare('INSERT INTO anis_indications (reader, kind, value, evidence, conversation_id, round, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(reader, v.kind, v.value, v.evidence, conversationId || null, round ?? null, Date.now()).run().catch((err) => console.warn(`[anis] indication not stored: ${err?.message}`));
  if (ctx?.waitUntil) ctx.waitUntil(p); else await p;
  return 'noted';
};

/** GET /api/chat/bio?reader=<device id> → the reader's own indications; DELETE → erased. Only device ids (a letter's hash is guessable from an email). */
export async function bioRoute(request, env, { headers = {} } = {}) {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
  const id = new URL(request.url).searchParams.get('reader') || '';
  if (!ID.test(id)) return json({ error: 'reader required' }, 400);
  const reader = `dev:${id}`;
  if (request.method === 'GET') return json({ indications: (await loadBio(env, reader, 200)).map(({ kind, value, evidence, at }) => ({ kind, value, evidence, at })) });
  if (request.method === 'DELETE') { const r = await env.ANIS_DB.prepare('DELETE FROM anis_indications WHERE reader = ?').bind(reader).run(); return json({ deleted: r?.meta?.changes ?? r?.changes ?? 0 }); }
  return json({ error: 'not found' }, 404);
}
