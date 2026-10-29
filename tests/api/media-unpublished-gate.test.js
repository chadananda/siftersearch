// A talk without a passed remaster has NO published state (Chad 10-29: "don't let them have a published state until
// properly remastered"): its page JSON and its files 404 to the public; internal tools (pods, ops) still read them.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Fastify from 'fastify';

const dir = mkdtempSync(join(tmpdir(), 'mug-'));
const items = { pend: { id: 1, slug: 'pend', state: 'done', dir: join(dir, 'pend'), restored: 0 }, pub: { id: 2, slug: 'pub', state: 'done', dir: join(dir, 'pub'), restored: 1 } };
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
vi.mock('../../api/lib/repos/media-repo.js', async (orig) => ({ ...(await orig()), getMediaBySlug: vi.fn(async (s) => items[s] || null), getSpeaker: vi.fn(async () => null) }));

let app;
beforeAll(async () => {
  for (const s of ['pend', 'pub']) { mkdirSync(join(dir, s, 'web'), { recursive: true }); writeFileSync(join(dir, s, 'meta.json'), JSON.stringify({ version: 1, title: s })); writeFileSync(join(dir, s, 'transcript.json'), '{"paragraphs":[]}'); }
  vi.stubEnv('DEPLOY_SECRET', 'k');
  const { default: mediaRoutes } = await import('../../api/routes/media.js');
  app = Fastify(); await app.register(mediaRoutes, { prefix: '/api/media' });
});

describe('unpublished talks', () => {
  it('the page JSON 404s to the public, answers the internal key, and a restored talk is unaffected', async () => {
    expect((await app.inject({ url: '/api/media/pend' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/media/pend', headers: { 'x-internal-key': 'wrong' } })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/media/pend', headers: { 'x-internal-key': 'k' } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/media/pub' })).statusCode).toBe(200);
  });
  it('its files 404 to the public', async () => {
    expect((await app.inject({ url: '/api/media/pend/file/web/pend.ogg?v=1' })).statusCode).toBe(404);
  });
});
