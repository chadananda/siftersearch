// Anis public routes (prefix /api/v1/anis). The footer PAUSE link: GET shows a confirm page (a GET must not change
// anything — mail scanners prefetch links), POST pauses letters to that address. No sign-in: the signed token is the
// proof (anis/pause-link.js). Deps: db, anis/pause-link.
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
}
