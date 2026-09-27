// SSE routes flush the raw response, so @fastify/cookie's onSend never ran and the session cookie minted for a chat
// stream was never sent (2026-09-27: every widget visitor had no identity — each message opened a new thread). The
// minted id must be visible to participantId() on the same request AND written to the raw response before the flush.
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../../api/lib/db.js', () => ({ userQuery: async () => ({ rows: [] }), userQueryOne: async () => null }));
const { ensureSessionId, participantId, writeSessionCookieRaw, SESSION_COOKIE } = await import('../../api/lib/anonymous.js');

describe('session cookie on a raw SSE response', () => {
  it('a first-visit stream sends Set-Cookie and resolves the participant on the same request', async () => {
    const app = Fastify(); await app.register(cookie);
    let seen = null;
    app.addHook('onRequest', async (req, reply) => { ensureSessionId(req, reply); });
    app.post('/stream', async (request, reply) => {
      seen = participantId(request);
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      writeSessionCookieRaw(request, reply);
      reply.raw.flushHeaders();
      reply.raw.write('data: {}\n\n'); reply.raw.end();
      return reply;
    });
    const r = await app.inject({ method: 'POST', url: '/stream' });
    const set = [].concat(r.headers['set-cookie'] || []).join(';');
    expect(set).toMatch(new RegExp(`${SESSION_COOKIE}=sess_`));
    expect(seen).toMatch(/^sess_/);
    expect(set).toContain(seen);
  });

  it('a returning visitor keeps their cookie; nothing is re-minted', async () => {
    const app = Fastify(); await app.register(cookie);
    app.addHook('onRequest', async (req, reply) => { ensureSessionId(req, reply); });
    app.post('/stream', async (request, reply) => { writeSessionCookieRaw(request, reply); reply.raw.flushHeaders(); reply.raw.end(); return reply; });
    const r = await app.inject({ method: 'POST', url: '/stream', cookies: { [SESSION_COOKIE]: 'sess_0123456789abcdef' } });
    expect(r.headers['set-cookie']).toBeUndefined();
  });
});
