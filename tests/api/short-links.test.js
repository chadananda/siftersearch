// PDF short links: documents.js writes anis/s/<code>.json; worker/short-links.js redirects /d/<code> to the stored file.
import { describe, it, expect } from 'vitest';
import { makeDocuments, shortCode } from '../../api/lib/assistant/pdf/documents.js';
import { shortLink, SHORT_PATH } from '../../worker/short-links.js';

const B = 'https://pub.example';
const mk = () => { const up = new Map(), seen = []; const d = makeDocuments({ shortBase: 'https://s.example/d', publicUrl: (k) => `${B}/${k}`,
  upload: async (k, b, t) => { up.set(k, { b, t }); return `${B}/${k}`; }, exists: async (k) => (up.has(k) ? `${B}/${k}` : null),
  render: async (o) => { seen.push(o.pdfUrl); return Buffer.from('%PDF-x'); } }); return { d, up, seen }; };

describe('PDF short links', () => {
  it('a cached work: one stable short link, mapped before render, baked into the share QR, kept on a cache hit', async () => {
    const { d, up, seen } = mk();
    const a = await d.create({ title: 'T', markdown: 'x', cacheKey: 'work-1' });
    expect(a.url).toMatch(/^https:\/\/s\.example\/d\/[A-Za-z0-9]{8}$/);
    expect(seen[0]).toBe(a.url);
    const code = a.url.split('/').pop(), m = up.get(`anis/s/${code}.json`);
    expect(m.t).toBe('application/json');
    expect(JSON.parse(m.b).url).toBe(a.file_url);
    const b = await d.create({ title: 'T', markdown: 'x', cacheKey: 'work-1' });
    expect(b).toMatchObject({ cached: true, url: a.url });
    expect((await d.create({ title: 'T', markdown: 'x', cacheKey: 'work-2' })).url).not.toBe(a.url);
  });
  it('a one-off document gets its own random code', async () => {
    const { d } = mk();
    expect((await d.create({ title: 'T', markdown: 'x' })).url).not.toBe((await d.create({ title: 'T', markdown: 'x' })).url);
    expect(shortCode(Buffer.alloc(8))).toBe('00000000');
  });
  it('the Worker redirects a known code, refuses an unknown one or a target outside the bucket', async () => {
    expect(SHORT_PATH.exec('/d/Ab3x9Kq2')[1]).toBe('Ab3x9Kq2');
    expect(SHORT_PATH.test('/document/12')).toBe(false);
    const f = (body) => async () => ({ ok: !!body, json: async () => body });
    const r = await shortLink('Ab3x9Kq2', { base: B, fetchFn: f({ url: `${B}/anis/pdf/c/x/a.pdf` }) });
    expect(r.status).toBe(302); expect(r.headers.get('location')).toBe(`${B}/anis/pdf/c/x/a.pdf`);
    expect((await shortLink('Ab3x9Kq2', { base: B, fetchFn: f(null) })).status).toBe(404);
    expect((await shortLink('Ab3x9Kq2', { base: B, fetchFn: f({ url: 'https://evil.example/x' }) })).status).toBe(404);
  });
});
