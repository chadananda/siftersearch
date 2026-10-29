// Web audio streams from R2 while the tower copy lands (Chad 10-29: "when the page is displayed the files should be
// immediately uploaded and can be streamed from r2"): pieces, the first small, a read waits only for the piece it needs.
import { describe, it, expect, vi } from 'vitest';
import { pieceBounds, pieceOf, parseRange, chunkedResponse, mediaFile, FIRST_PIECE, PIECE } from '../../worker/media.js';

function bucket() {
  const m = new Map();
  const obj = (v, range) => {
    const bytes = typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v);
    const part = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
    return { size: bytes.length, json: async () => JSON.parse(new TextDecoder().decode(bytes)), arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength), body: part, httpMetadata: {} };
  };
  return {
    m,
    get: async (k, o) => (m.has(k) ? obj(m.get(k), o?.range?.offset != null ? o.range : null) : null),
    head: async (k) => (m.has(k) ? { size: 1 } : null),
    put: async (k, v) => { m.set(k, typeof v === 'string' ? v : new Uint8Array(v)); },
  };
}

describe('piece layout', () => {
  it('a small first piece, then large pieces, covering the file exactly', () => {
    const b = pieceBounds(FIRST_PIECE + 2 * PIECE + 10);
    expect(b).toEqual([0, FIRST_PIECE, FIRST_PIECE + PIECE, FIRST_PIECE + 2 * PIECE, FIRST_PIECE + 2 * PIECE + 10]);
    expect(pieceBounds(100)).toEqual([0, 100]);
    expect(pieceOf(b, 0)).toBe(0); expect(pieceOf(b, FIRST_PIECE)).toBe(1); expect(pieceOf(b, b[4] - 1)).toBe(3);
  });
  it('ranges', () => {
    expect(parseRange('bytes=0-0', 50)).toEqual({ start: 0, end: 0 });
    expect(parseRange('bytes=10-', 50)).toEqual({ start: 10, end: 49 });
    expect(parseRange('bytes=-5', 50)).toEqual({ start: 45, end: 49 });
    expect(parseRange(null, 50)).toBeNull();
    expect(parseRange('bytes=60-', 50)).toBe('bad');
  });
});

describe('reading while the copy lands', () => {
  const bytes = Uint8Array.from({ length: 30 }, (_, i) => i);
  it('serves a range across pieces, waiting for the piece that has not landed yet', async () => {
    const b = bucket(), env = { MEDIA_BUCKET: b };
    b.m.set('k~m', JSON.stringify({ size: 30, ct: 'audio/ogg', bounds: [0, 10, 20, 30] }));
    b.m.set('k~0', bytes.slice(0, 10)); b.m.set('k~1', bytes.slice(10, 20));
    const r = await chunkedResponse(env, 'k', 'bytes=5-', false, { waitMs: 2000 });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 5-29/30');
    setTimeout(() => b.m.set('k~2', bytes.slice(20, 30)), 300);   // the last piece arrives while the listener reads
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([...bytes.slice(5)]);
  });
  it('nothing begun in time → null (the caller answers 202)', async () => {
    expect(await chunkedResponse({ MEDIA_BUCKET: bucket() }, 'k', 'bytes=0-0', false, { waitMs: 50 })).toBeNull();
  });
  it('a GET miss starts the copy itself and streams it from R2', async () => {
    const size = FIRST_PIECE + 100, file = Uint8Array.from({ length: size }, (_, i) => i % 251);
    const fetchMock = vi.fn(async (url, { headers } = {}) => {
      const [, a, z] = /bytes=(\d+)-(\d+)/.exec(headers.range);
      const end = Math.min(Number(z), size - 1);
      return new Response(file.slice(Number(a), end + 1), { status: 206, headers: { 'content-range': `bytes ${a}-${end}/${size}`, 'content-type': 'audio/ogg' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const env = { MEDIA_BUCKET: bucket() }, waits = [];
      const req = new Request('https://siftersearch.com/api/media/t/file/web/t.ogg?v=3', { headers: { range: 'bytes=0-' } });
      const r = await mediaFile(req, env, { waitUntil: (p) => waits.push(p) }, 'https://origin');
      expect(r.status).toBe(206);
      expect(r.headers.get('x-sifter-audio')).toBe('streaming');
      expect(new Uint8Array(await r.arrayBuffer())).toEqual(file);
      await Promise.all(waits);
      expect(env.MEDIA_BUCKET.m.has('t/web/t.ogg@3~1')).toBe(true);
      expect(fetchMock.mock.calls.every(([u]) => u.startsWith('https://origin/api/media/t/file/web/t.ogg?v=3'))).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
  // 10-29: Chrome reads an Ogg's END for its duration before it plays; the end landing last held metadata for 18 s
  it('the last piece lands right after the first, and a seek copies its own piece instead of waiting', async () => {
    const size = FIRST_PIECE + 3 * PIECE + 100, file = Uint8Array.from({ length: size }, (_, i) => i % 251);
    let gate; const held = new Promise((r) => { gate = r; });
    const fetchMock = vi.fn(async (url, { headers } = {}) => {
      const [, a, z] = /bytes=(\d+)-(\d+)/.exec(headers.range), s = Number(a), end = Math.min(Number(z), size - 1);
      if (s > FIRST_PIECE && s < FIRST_PIECE + 3 * PIECE && fetchMock.mock.calls.length < 4) await held;   // the fill's middle pieces stall
      return new Response(file.slice(s, end + 1), { status: 206, headers: { 'content-range': `bytes ${a}-${end}/${size}`, 'content-type': 'audio/ogg' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const env = { MEDIA_BUCKET: bucket() }, waits = [];
      const ask = (range) => mediaFile(new Request('https://siftersearch.com/api/media/t/file/web/t.ogg?v=3', { headers: { range } }), env, { waitUntil: (p) => waits.push(p) }, 'https://origin');
      const r0 = await ask('bytes=0-0'); await r0.arrayBuffer();
      const tail = await ask(`bytes=${size - 50}-`);
      expect(new Uint8Array(await tail.arrayBuffer())).toEqual(file.slice(size - 50));
      expect(fetchMock.mock.calls[1][1].headers.range).toBe(`bytes=${FIRST_PIECE + 3 * PIECE}-${size - 1}`);   // the fill's second request
      const mid = FIRST_PIECE + 2 * PIECE + 7, seek = await ask(`bytes=${mid}-${mid + 9}`);
      expect(new Uint8Array(await seek.arrayBuffer())).toEqual(file.slice(mid, mid + 10));
      gate(); await Promise.all(waits);
    } finally { vi.unstubAllGlobals(); }
  });
});
