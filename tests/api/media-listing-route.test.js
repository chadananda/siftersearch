// GET /api/media/index — the Fireside Room's index: rows from the repo + each item's files, speakers once each, cached
// per item by updated_at and persisted to a file.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Fastify from 'fastify';

const dir = mkdtempSync(join(tmpdir(), 'mlr-'));
const cacheFile = join(dir, 'index-cache.json');
const itemDir = join(dir, 'item');
const rows = [{ id: 7, slug: 'dunbar-soul-1988', title: 'Soul', speaker: 'Hooper Dunbar', speaker_key: 'hooper-dunbar', year: 1988, duration_s: 1200, language: 'en',
  has_video: 0, source_kind: 'file', playback: 'full', grade: 'B', quotes_n: 1, crs_n: 0, dir: itemDir, updated_at: '2026-10-22T10:00:00.000Z' }];

vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
vi.mock('../../api/lib/repos/media-repo.js', async (orig) => ({
  ...(await orig()),
  mediaIndexRows: vi.fn(async () => rows),
  mediaParagraphs: vi.fn(async () => [{ id: 501, doc_id: 77, text: 'The soul is a sign of God, he said.', block_attrs: JSON.stringify({ t0: 61.5, t1: 70 }) },
    { id: 502, doc_id: 77, text: 'Summary line', block_attrs: '{}' }]),
  mediaByDocIds: vi.fn(async () => [{ doc_id: 77, slug: 'dunbar-soul-1988', title: 'Soul', speaker: 'Hooper Dunbar', speaker_key: 'hooper-dunbar', year: 1988, state: 'done' }]),
  listSpeakers: vi.fn(async () => [{ key: 'hooper-dunbar', name: 'Hooper Dunbar', file: 'media-speakers/hooper-dunbar.jpg', sha: 'abcdef0123456789abcd' }]),
}));

// the published-drawings manifest, controlled per test (never the real data/media-speaker-sketches.json)
const SKETCH = { url: 'https://cdn.test/media-speakers/hooper-dunbar/sketch-aa.jpg?v=aa', square: 'https://cdn.test/media-speakers/hooper-dunbar/sketch-sq-bb.jpg?v=bb',
  width: 768, height: 1376, ai_rendered: true };
const sketches = new Map([['hooper-dunbar', SKETCH]]);
vi.mock('../../api/lib/media/sketch.js', async (orig) => ({ ...(await orig()), sketchOf: (k) => (k ? sketches.get(k) || null : null) }));

vi.mock('../../api/lib/search.js', () => ({ multiIndexSearch: vi.fn(async (q, o) => ({ hits: o.filters?.collection === 'Media'
  ? [{ paragraph_id: 501, _formatted: { text: 'The <em>soul</em> is a sign' } }, { paragraph_id: 502 }] : [] })) }));

vi.mock('../../api/lib/search/qdrant-layers.js', () => ({ searchKeywordQdrant: vi.fn(async () => ({ hits: [{ paragraph_id: 501 }] })), searchPhrases: vi.fn(async () => ({ hits: [] })) }));

let app;
beforeAll(async () => {
  const { mkdirSync } = await import('fs');
  mkdirSync(itemDir);
  writeFileSync(join(itemDir, 'meta.json'), JSON.stringify({ version: 2, summary: 'On the soul.', topics: ['The soul'], headings: [{ p: 2, text: 'What is the soul?', form: 'question' }] }));
  writeFileSync(join(itemDir, 'transcript.json'), JSON.stringify({ paragraphs: [{ n: 1, t0: 0 }, { n: 2, t0: 61.5 }], quotes: [{ excerpt: 'Know thou that the soul of man is exalted above, and is independent of all infirmities of body or mind.', gate: 'printed', basis: 'verbatim', cite: 'Gleanings', t0: 300 }] }));
  writeFileSync(join(itemDir, 'waveform.json'), JSON.stringify({ channels: 1, data: Array.from({ length: 2000 }, (_, i) => (i % 2 ? i % 90 : -(i % 40))) }));
  vi.stubEnv('MEDIA_INDEX_CACHE', cacheFile);
  const { default: mediaRoutes } = await import('../../api/routes/media.js');
  app = Fastify();
  await app.register(mediaRoutes, { prefix: '/api/media' });
});

describe('GET /api/media/index', () => {
  it('returns compact rows with quote, question, waveform and the speaker once', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/media/index' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    const it = body.items[0];
    expect(it).toMatchObject({ s: 'dunbar-soul-1988', sp: 'Hooper Dunbar', k: 'hooper-dunbar', y: 1988, v: 2, tp: ['The soul'] });
    expect(it.h[0]).toEqual({ x: 'What is the soul?', f: 'q', t: 62 });
    expect(it.q.c).toBe('Gleanings');
    expect(it.hl).toEqual([299, 319]);
    expect(it.w).toHaveLength(48);
    // a published drawing leads (Chad 10-23, courtroom-sketch style): p = square drawing, px = 9:16 drawing, dr = 1; the
    // verified photo stays one tap away as ph (and in the gallery g)
    const photo = expect.stringContaining('/img/cdn/siftersearch.com/media-speakers/hooper-dunbar.jpg');
    expect(body.speakers).toEqual([expect.objectContaining({ k: 'hooper-dunbar', c: 1, role: 'uhj', dr: 1, cr: null,
      p: SKETCH.square, px: { url: SKETCH.url, width: 768, height: 1376, ai_rendered: true }, ph: photo, g: [{ u: photo }] })]);
    expect(res.headers['cache-control']).toMatch(/s-maxage=300/);
    // the cache file is written in the background: wait for it (bounded) instead of a fixed 50 ms, which a loaded machine missed
    for (let i = 0; i < 100 && !existsSync(cacheFile); i++) await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(cacheFile)).toBe(true);
  });
});

describe('GET /api/media/index without a published drawing', () => {
  it('falls back to the verified photo as the portrait (no dr, no ph)', async () => {
    sketches.delete('hooper-dunbar');
    try {
      const sp = (await app.inject({ method: 'GET', url: '/api/media/index' })).json().speakers[0];
      expect(sp.p).toContain('/img/cdn/siftersearch.com/media-speakers/hooper-dunbar.jpg');
      expect(sp.dr).toBeUndefined();
      expect(sp.ph).toBeUndefined();
    } finally { sketches.set('hooper-dunbar', SKETCH); }
  });
});

describe('GET /api/media/heard', () => {
  it('searches the Media collection with the engine and maps hits to talks and times', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/media/heard?q=soul' });
    expect(res.statusCode).toBe(200);
    expect(res.json().hits).toEqual([expect.objectContaining({ slug: 'dunbar-soul-1988', speaker: 'Hooper Dunbar', year: 1988, t0: 61.5, t1: 70, terms: ['soul'] })]);
    expect((await app.inject({ method: 'GET', url: '/api/media/heard?q=a' })).json().hits).toEqual([]);
  });
});
