// /api/media/<slug>: each quote and cross-reference carries the doc_id it was matched in, so a page links it to the
// collaborator site or /doc by id, never home (Anís link policy, 11-14).
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Fastify from 'fastify';

const dir = mkdtempSync(join(tmpdir(), 'mqd-'));
const items = { t: { id: 1, slug: 't', state: 'done', dir: join(dir, 't'), restored: 1 } };
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
vi.mock('../../api/lib/repos/media-repo.js', async (orig) => ({ ...(await orig()), getMediaBySlug: vi.fn(async (s) => items[s] || null), getSpeaker: vi.fn(async () => null) }));

let app;
beforeAll(async () => {
  mkdirSync(join(dir, 't', 'web'), { recursive: true });
  writeFileSync(join(dir, 't', 'meta.json'), JSON.stringify({ version: 1, title: 't' }));
  writeFileSync(join(dir, 't', 'transcript.json'), JSON.stringify({ paragraphs: [],
    quotes: [{ para: 1, i0: 0, i1: 3, url: 'https://oceanlibrary.com/x', cite: 'X', source: { id: 9, doc_id: 21308 } }, { para: 2, i0: 0, i1: 2, url: 'u' }],
    cross_references: [{ para: 3, url: 'v', claim: 'c', source: { doc_id: 7 } }] }));
  const { default: mediaRoutes } = await import('../../api/routes/media.js');
  app = Fastify(); await app.register(mediaRoutes, { prefix: '/api/media' });
});

describe('quote doc ids', () => {
  it('quotes and cross-references carry doc_id (null when unknown), and nothing else from source', async () => {
    const r = await app.inject({ url: '/api/media/t' });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.quotes.map((q) => q.doc_id)).toEqual([21308, null]);
    expect(j.quotes[0].source).toBeUndefined();
    expect(j.cross_references[0].doc_id).toBe(7);
  });
});
