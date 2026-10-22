// YouTube sources when YouTube refuses our address (Chad 10-22): free yt-dlp first, then Titan, then Seemuapps (Apify);
// the file is taken at once and checksummed; metadata falls back to oEmbed. The token never appears in an error.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { audioUrlOf, apifyAudio, fetchAudio, youtubeInfoAny } from '../../api/lib/media/youtube.js';

describe('youtube fallbacks', () => {
  it('finds the audio file in each actor\'s result', () => {
    expect(audioUrlOf({ downloadFiles: [{ kind: 'video', downloadedFileUrl: 'v' }, { kind: 'audio', downloadedFileUrl: 'http://x/a.mp3' }] })).toBe('http://x/a.mp3');
    expect(audioUrlOf({ fileUrl: 'https://api.apify.com/v2/key-value-stores/k/records/f' })).toContain('key-value-stores');
    expect(audioUrlOf({ error: 'blocked', fileUrl: 'x' })).toBeNull();
  });
  it('the first route that works wins; every failure is recorded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yt-'));
    const r = await fetchAudio('https://youtu.be/dQw4w9WgXcQ', dir, {
      ytdlp: vi.fn(async () => { throw new Error('Sign in to confirm you’re not a bot'); }),
      apify: vi.fn(async (u, d, k) => { if (k === 'titan') throw new Error('titan: no audio'); return { path: join(d, 'x.mp3'), route: k, usd: 0.1 }; }),
    });
    expect(r).toMatchObject({ route: 'seemu', usd: 0.1 });
    expect(r.tried.map((t) => t.route)).toEqual(['yt-dlp', 'titan']);
    await expect(fetchAudio('https://youtu.be/dQw4w9WgXcQ', dir, { ytdlp: async () => { throw new Error('x'); }, apify: async () => { throw new Error('y'); } })).rejects.toMatchObject({ code: 'BOT_CHECK' });
  });
  it('an Apify run: started, polled, file taken at once and checksummed; the token never in an error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yt-'));
    const audio = Buffer.alloc(200_000, 3);
    const fetchImpl = vi.fn(async (u) => {
      const ok = (o) => ({ ok: true, headers: { get: () => 'audio/mpeg' }, text: async () => JSON.stringify(o), arrayBuffer: async () => audio });
      if (u.includes('/runs?')) return ok({ data: { id: 'r1', status: 'RUNNING', defaultDatasetId: 'd1' } });
      if (u.includes('/actor-runs/')) return ok({ data: { id: 'r1', status: 'SUCCEEDED', defaultDatasetId: 'd1', usageTotalUsd: 0.001, chargedEventCounts: { 'audio-download-success': 5 }, pricingInfo: { pricingPerEvent: { actorChargeEvents: { 'audio-download-success': { eventPriceUsd: 0.00005 } } } } } });
      if (u.includes('/datasets/')) return ok([{ downloadFiles: [{ kind: 'audio', downloadedFileUrl: 'http://store/x/dQw4w9WgXcQ.mp3' }] }]);
      return ok({});
    });
    const r = await apifyAudio('https://youtu.be/dQw4w9WgXcQ', dir, 'titan', { token: 'SECRET', fetchImpl, pollMs: 1 });
    expect(r).toMatchObject({ route: 'titan', bytes: 200_000, run_id: 'r1', usd: 0.001 });
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(r.path).length).toBe(200_000);
    const bad = vi.fn(async () => ({ ok: false, text: async () => 'invalid token SECRET' }));
    await expect(apifyAudio('https://youtu.be/dQw4w9WgXcQ', dir, 'titan', { token: 'SECRET', fetchImpl: bad })).rejects.toThrow(/<token>/);
  });
  it('metadata falls back to oEmbed when yt-dlp is refused', async () => {
    const r = await youtubeInfoAny('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { info: async () => { throw new Error('429'); },
      oembed: async (u) => ({ youtube_id: 'dQw4w9WgXcQ', url: u, title: 'T', channel: 'C', channel_id: '@c', via: 'oembed' }) });
    expect(r).toMatchObject({ title: 'T', channel: 'C', via: 'oembed', info_error: '429' });
  });
});
