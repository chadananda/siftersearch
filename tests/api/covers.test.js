// Covers on tower: only the original + provenance are stored (renderings are the image Worker's job); non-images are
// refused; the route serves the original. Real temp dir.
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';

let dir;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'covers-')); process.env.COVERS_DIR = dir; });
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');   // a PNG header is enough to sniff

describe('storeCover', () => {
  it('keeps the original and its provenance; the URL carries a content hash', async () => {
    const { storeCover } = await import('../../api/lib/covers.js');
    const r = await storeCover(42, PNG, { source: 'oceanlibrary-generated', rights: 'own' });
    expect(r.url).toMatch(/^\/img\/covers\/42\?v=[0-9a-f]{12}$/);
    expect(r.format).toBe('png');
    expect(await readFile(join(dir, '42', 'original.png'))).toEqual(PNG);
    expect(JSON.parse(await readFile(join(dir, '42', 'meta.json'), 'utf8'))).toMatchObject({ docId: 42, source: 'oceanlibrary-generated', rights: 'own', format: 'png' });
  });
  it('refuses bytes that are not an image, and bad ids', async () => {
    const { storeCover } = await import('../../api/lib/covers.js');
    await expect(storeCover(43, Buffer.from('<html>not found</html>'))).rejects.toThrow('not a png/jpeg/webp/gif');
    await expect(storeCover('x', PNG)).rejects.toThrow('bad docId');
  });
  it('coverImg adds an ImageKit rendering to a stored URL', async () => {
    const { coverImg } = await import('../../api/lib/covers.js');
    expect(coverImg('/img/covers/42?v=abc', 'w-160,h-240,e-sharpen')).toBe('/img/covers/42?v=abc&tr=w-160,h-240,e-sharpen');
    expect(coverImg(null, 'w-160')).toBeNull();
  });
});

describe('GET /api/covers/:docId/original', () => {
  it('serves the stored original with its type; a missing cover is a short-cached 404', async () => {
    const { default: coverRoutes } = await import('../../api/routes/covers.js');
    const app = Fastify(); await app.register(coverRoutes, { prefix: '/api/covers' });
    const ok = await app.inject({ method: 'GET', url: '/api/covers/42/original' });
    expect([ok.statusCode, ok.headers['content-type']]).toEqual([200, 'image/png']);
    const miss = await app.inject({ method: 'GET', url: '/api/covers/999/original' });
    expect(miss.statusCode).toBe(404);
    expect(miss.headers['cache-control']).toContain('max-age=300');
    expect((await app.inject({ method: 'GET', url: '/api/covers/abc/original' })).statusCode).toBe(404);
  });
});
