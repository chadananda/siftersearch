// The moment quote card (og:image): fitting, markup escaping, and a real 1200×630 JPEG; the route serves it as image/jpeg.
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { quoteFit, escapeMarkup, renderMomentCard } from '../../api/lib/media/moment-card.js';

vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
vi.mock('../../api/lib/repos/media-repo.js', async (orig) => ({
  ...(await orig()),
  momentByKey: vi.fn(async (k) => (k === 'abc1' ? { key: 'abc1', text: 'The soul is a sign of God.', speaker: 'Hooper Dunbar', speaker_key: null, title: 'Soul', year: 1988, slug: 'dunbar-soul-1988', t0_ms: 1000, t1_ms: 9000 } : null)),
}));

describe('moment quote card', () => {
  it('sizes short quotes large and cuts long ones at a word', () => {
    expect(quoteFit('Short and sweet.').size).toBe(62);
    const long = quoteFit('word '.repeat(120));
    expect(long.size).toBe(38);
    expect(long.text.endsWith('…')).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(261);
  });
  it('escapes Pango markup', () => expect(escapeMarkup('a < b & "c"')).toBe('a &lt; b &amp; "c"'));
  it('renders a 1200×630 JPEG', async () => {
    const sharp = (await import('sharp')).default;
    const buf = await renderMomentCard({ text: 'The soul is not in the body.', speaker: '‘Alí Nakhjavání', title: 'Talk to the Youth', year: 1997 }, null);
    const meta = await sharp(buf).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630]);
  }, 20000);
  it('GET /api/media/moments/:key/card.jpg serves the card, 404 for an unknown key', async () => {
    const { default: mediaRoutes } = await import('../../api/routes/media.js');
    const app = Fastify();
    await app.register(mediaRoutes, { prefix: '/api/media' });
    const res = await app.inject({ method: 'GET', url: '/api/media/moments/abc1/card.jpg' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toMatch(/s-maxage=604800/);
    expect((await app.inject({ method: 'GET', url: '/api/media/moments/nope/card.jpg' })).statusCode).toBe(404);
  }, 20000);
});
