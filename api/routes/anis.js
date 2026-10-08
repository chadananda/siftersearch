// Anis public routes (prefix /api/v1/anis). The footer PAUSE link: GET shows a confirm page (a GET must not change
// anything — mail scanners prefetch links), POST pauses letters to that address. No sign-in: the signed token is the
// proof (anis/pause-link.js). POST /draft and /outreach (internal key) write letters for the Worker's mail system —
// research only; the Worker stores them as drafts for Chad's approval. Deps: db, anis/pause-link, anis/turn, anis/respond.
import { query, queryAll } from '../lib/db.js';
import { verifyPauseToken, emailHash } from '../lib/anis/pause-link.js';
import { logger } from '../lib/logger.js';

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anís — letters</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1d2521;background:#f6f7f5}
button{font:inherit;padding:.6rem 1.2rem;border-radius:6px;border:1px solid #1d6b58;background:#1d6b58;color:#fff;cursor:pointer}</style></head>
<body>${body}</body></html>`;

export default async function anisRoutes(fastify) {
  // The confirm page posts a plain HTML form; parse it here only (scoped to this plugin).
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' },
    (req, body, done) => { try { done(null, Object.fromEntries(new URLSearchParams(body))); } catch (e) { done(e); } });
  fastify.get('/pause', async (request, reply) => {
    const t = String(request.query.t || '');
    reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-store');
    if (!verifyPauseToken(t)) return reply.code(400).send(page('<p>This link is not valid.</p>'));
    return page(`<h1>Pause letters from Anís?</h1><p>Anís will stop writing to you. If you write to Anís, you will still get an answer.</p>
<form method="post" action="/api/v1/anis/pause"><input type="hidden" name="t" value="${t}"><button type="submit">Pause letters</button></form>`);
  });

  fastify.post('/pause', async (request, reply) => {
    const t = String(request.body?.t || request.query?.t || '');
    const h = verifyPauseToken(t);
    reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-store');
    if (!h) return reply.code(400).send(page('<p>This link is not valid.</p>'));
    // Match by hash of the address (the link carries no address). widget_connections is small; hashing in JS is fine.
    const rows = await queryAll(`SELECT id, email FROM widget_connections WHERE unsubscribed_at IS NULL`);
    const ids = rows.filter((r) => emailHash(r.email) === h).map((r) => r.id);
    for (const id of ids) await query(`UPDATE widget_connections SET unsubscribed_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    logger.info({ paused: ids.length }, 'anis: letters paused from footer link');
    return page('<h1>Letters paused</h1><p>Anís won’t write to you again. You can still write to Anís any time and you’ll get an answer.</p>');
  });

  // ── Letters for the Worker's mail system (worker/mail/drafting.js). Internal key only: the Worker owns mail and
  // people; tower only researches and writes. Nothing here sends anything — the Worker stores the result as a DRAFT.
  const internalOnly = (request, reply) => {
    const k = request.headers['x-internal-key'];
    if (!process.env.INTERNAL_API_KEY || k !== process.env.INTERNAL_API_KEY) { reply.code(401).send({ error: 'unauthorized' }); return false; }
    return true;
  };
  const who = (email) => `email:${emailHash(email)}`;

  // A reply to an inbound email: one ordinary Anís turn on the email channel (triage gate, research, output check).
  fastify.post('/draft', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const { messages = [], email = '' } = request.body || {};
    if (!messages.length) return reply.code(400).send({ error: 'messages required' });
    const { anisTurn } = await import('../lib/anis/turn.js');
    const r = await anisTurn({ messages, channel: 'email', trusted: true, profile: { persona_name: 'Anís' }, participant: { id: who(email) }, clientKey: who(email) });
    return { reply: r.reply, status: r.status, triage: r.path?.triage ?? null, retrieved: r.retrieved?.length ?? 0, format: r.format?.id ?? null };
  });

  // A letter Anís starts (onboarding / follow-up). step 0–1: a capability they have not used, shown on their own subject;
  // later steps: further research on their last question. Not a user turn, so it is not logged as one. Nothing found →
  // { silent: true }: silence beats a weak letter.
  fastify.post('/outreach', async (request, reply) => {
    if (!internalOnly(request, reply)) return;
    const { messages = [], step = 0 } = request.body || {};
    const lastQ = [...messages].reverse().find((m) => m.role === 'user')?.content?.slice(0, 600);
    if (!lastQ) return { silent: true, reason: 'no question to follow' };
    const { outreachPrompt } = await import('../lib/anis/outreach.js');
    const ask = outreachPrompt(step, lastQ);
    const { anisRespond } = await import('../lib/anis/respond.js');
    const { channelFor } = await import('../lib/anis/channels.js');
    const r = await anisRespond({ messages: [...messages.slice(-6), { role: 'user', content: ask.question }], profile: { persona_name: 'Anís' },
      direction: { channel: channelFor('email', { trusted: true }), kind: 'research' } });
    if (!r?.reply || !(r.retrieved?.length)) return { silent: true, reason: 'nothing found worth sending' };
    return { subject: ask.subject, opening: ask.opening, reply: r.reply, capability: ask.capability, retrieved: r.retrieved.length };
  });
}
