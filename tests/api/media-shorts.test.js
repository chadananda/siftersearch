// Audiogram shorts (Chad 10-22): phrase captions from our alignment, five templates chosen by content or rotated, link-back
// baked in (watermark + end card + QR), sidecar captions and post text, cached files, served where clips may be served.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { captionLines, clipWords, pickTemplate, buildAss, renderSpec, srtOf, vttOf, shortKey, clampRange, scriptureIn, postText, shortCite, TEMPLATES } from '../../api/lib/media/shorts.js';
import { renderShortFor, planShort } from '../../api/lib/media/short-job.js';
import { canServeFile } from '../../api/lib/media/rights.js';

const W = (t, t0 = 0, gap = 0.3) => t.split(' ').map((w, i) => ({ w, s: t0 + i * gap, e: t0 + i * gap + 0.25 }));

describe('captions', () => {
  it('phrases of 2–6 words, broken at punctuation and pauses', () => {
    const ws = [...W('Reason is usually the maidservant of will.'), ...W('We like to think', 5)];
    for (const l of captionLines(ws)) expect(l.length).toBeLessThanOrEqual(6);
    expect(captionLines(ws).some((l) => l.at(-1).w === 'will.')).toBe(true);
  });
  it('clip words: hidden words dropped, times relative; SRT/VTT sidecars', () => {
    const ps = [{ n: 1, t0: 100, t1: 104, words: [['um', 100, 100.2, 1], ['Hello', 100.3, 100.6], ['friends.', 100.7, 101.1]] }];
    const ws = clipWords(ps, 100, 104);
    expect(ws).toEqual([{ w: 'Hello', s: expect.closeTo(0.3), e: expect.closeTo(0.6) }, { w: 'friends.', s: expect.closeTo(0.7), e: expect.closeTo(1.1) }]);
    expect(srtOf(ws)).toBe('1\n00:00:00,300 --> 00:00:01,100\nHello friends.\n');
    expect(vttOf(ws)).toMatch(/^WEBVTT\n\n00:00:00\.300 --> 00:00:01\.100\nHello friends\./);
  });
});

describe('templates', () => {
  it('Portrait Cinema by default (Chad 10-22: "#2 is best"); Scripture Insert when the Writings are quoted; asked wins', () => {
    expect(pickTemplate({ scripture: true }).template).toBe('scripture-insert');
    expect(pickTemplate({ year: 1957 }).template).toBe('portrait-cinema');
    expect(pickTemplate({ grade: 'E' }).template).toBe('portrait-cinema');
    expect(pickTemplate({ key: 'abc' })).toEqual({ template: 'portrait-cinema', why: 'default' });
    expect(pickTemplate({ asked: 'minimal', scripture: true }).template).toBe('minimal');
  });
  it('the renderer never stretches: every image is scaled uniformly (aspect kept) and cropped', () => {
    const py = readFileSync(new URL('../../scripts/media/render_short.py', import.meta.url), 'utf8');
    for (const m of py.matchAll(/\[1:v\]scale=([^,'"]+)/g)) expect(m[1]).toMatch(/force_original_aspect_ratio=increase|^\{lab\}|^\{kw\}/);
    expect(py).toMatch(/scale=\{kw\}:\{kh\}:force_original_aspect_ratio=increase,crop=\{kw\}:\{kh\}/);
    expect(py).not.toMatch(/scale=\{W\*2\}:-2,zoompan/);
  });
  it('every template carries the link back: a watermark through the clip and the end card', () => {
    for (const template of TEMPLATES) for (const format of ['vertical', 'square']) {
      const ass = buildAss({ template, format, words: W('Not that it is God. It is like the speech of a person.'), speaker: 'Hooper Dunbar', title: 'Soul', year: 1988,
        url: 'siftersearch.com/m/Ab12cd34', clip: 6, scripture: { excerpt: 'The soul is a sign of God', cite: '‘Abdu’l-Bahá, Some Answered Questions' } });
      expect(ass).toMatch(/PlayResY: (1920|1080)/);
      expect(ass.match(/siftersearch\.com\/m\/Ab12cd34/g).length).toBeGreaterThanOrEqual(2);
      expect(ass).toContain('Hear the full talk');
      expect(ass).toContain('Hooper Dunbar');
      expect(ass).toMatch(/\{\\c&H3AB2F2&\}|\{\\c&H1E6FC9&\}|Kinetic|Type/);   // a current-word mark (or kinetic / typewriter)
      const spec = renderSpec({ template, format, clip: 6, portrait: true });
      expect(spec.total).toBe(9);
      expect(spec.qr.size).toBeGreaterThan(200);
    }
  });
  it('scripture card uses a one-line citation', () => {
    expect(shortCite("'Abdu'l-Bahá, O handmaiden of God! Thy letter dated 18 September 1902 hath been received... (provisional translation)")).toBe("'Abdu'l-Bahá, O handmaiden of God");
    expect(scriptureIn([{ t0: 605, excerpt: 'x', cite: 'c' }], [], 597, 612)).toEqual({ excerpt: 'x', cite: 'c' });
    expect(scriptureIn([{ t0: 700, excerpt: 'x' }], [], 597, 612)).toBeNull();
  });
  it('post text: title, the quote, speaker and talk, the full link, hashtags', () => {
    const p = postText({ words: W('Reason is usually the maidservant of will.'), speaker: 'Hooper Dunbar', title: 'Consciousness, Creation, Soul', year: 1988,
      url: 'siftersearch.com/m/x', fullUrl: 'https://siftersearch.com/media/d?t=482', topics: ['the soul'] });
    expect(p.title).toBe('“Reason is usually the maidservant of will.” — Hooper Dunbar');
    expect(p.text).toContain('Hear the full talk: https://siftersearch.com/media/d?t=482');
    expect(p.text).toMatch(/#Bahai #HooperDunbar #TheSoul/);
  });
  it('ranges and keys', () => {
    expect(() => clampRange({ start: 10, end: 90 })).toThrow(/at most 60/);
    expect(clampRange({ start: 10, end: 150, max: 180 }).end).toBe(150);
    expect(() => clampRange({ start: 0, end: 5, format: 'wide' })).toThrow(/format/);
    expect(shortKey({ slug: 's', start: 1, end: 2, format: 'vertical', template: 'minimal' })).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('the short job', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'short-'));
    mkdirSync(join(dir, 'web'));
    writeFileSync(join(dir, 'web', 'talk.m4a'), 'x');
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ title: 'Soul', speaker: 'Hooper Dunbar', year: 1988, duration_s: 900, version: 2, topics: [],
      moments: [{ key: 'Ab12cd34', t0_ms: 482900, t1_ms: 502300 }] }));
    const words = W('Reason is usually the maidservant of will. We like to think that we are rational', 483).map((w) => [w.w, w.s, w.e]);
    writeFileSync(join(dir, 'transcript.json'), JSON.stringify({ paragraphs: [{ n: 1, t0: 483, t1: 490, words }], quotes: [], cross_references: [] }));
    return { slug: 'talk', state: 'done', dir, playback: 'full' };
  };
  it('renders once, writes MP4 + SRT + VTT + post, and reuses the file', async () => {
    const item = setup();
    const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000)]);
    const tools = { ffmpeg: vi.fn(async (args) => writeFileSync(args.at(-1), 'a')), renderShort: vi.fn(async (d) => { expect(existsSync(join(d, 'captions.ass'))).toBe(true); return ftyp; }) };
    const deps = { tools, portraitUrl: async () => null, qr: async () => Buffer.from('png'), warm: false };
    const r = await renderShortFor(item, { slug: 'talk', start: 482.9, end: 502.3 }, deps);
    expect(r).toMatchObject({ cached: false, moment: 'Ab12cd34', url: expect.stringMatching(/^\/api\/media\/talk\/file\/shorts\/[0-9a-f]{12}\.mp4$/) });
    expect(r.post.text).toContain('https://siftersearch.com/media/talk?t=482');
    const key = r.key;
    for (const ext of ['mp4', 'srt', 'vtt', 'json']) expect(existsSync(join(item.dir, 'shorts', `${key}.${ext}`))).toBe(true);
    const again = await renderShortFor(item, { slug: 'talk', start: 482.9, end: 502.3 }, deps);
    expect(again).toMatchObject({ cached: true, key });
    expect(tools.renderShort).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(join(item.dir, 'shorts', `${key}.json`), 'utf8')).post.title).toMatch(/Hooper Dunbar/);
  });
  it('refuses unpublished or search-only talks', async () => {
    await expect(planShort({ state: 'queued' }, {})).rejects.toThrow(/no published talk/);
    await expect(planShort({ state: 'done', dir: '/x', playback: 'search' }, {})).rejects.toThrow(/not available/);
  });
  it('shorts are served wherever clips are', () => {
    expect(canServeFile('clips', 'shorts/0123456789ab.mp4')).toBe(true);
    expect(canServeFile('search', 'shorts/0123456789ab.mp4')).toBe(false);
    expect(canServeFile('full', 'shorts/../x.mp4')).toBe(false);
  });
});

describe('end card address', () => {
  it('a long address breaks after the section; a moment address stays on one line', () => {
    const long = buildAss({ template: 'minimal', words: W('one two three.'), speaker: 'S', title: 'T', url: 'siftersearch.com/media/sears-covenant-breaking-part-3?t=234', clip: 3 });
    expect(long).toContain('siftersearch.com/media/\\Nsears-covenant-breaking-part-3?t=234');
    const short = buildAss({ template: 'minimal', words: W('one two three.'), speaker: 'S', title: 'T', url: 'siftersearch.com/m/Ab12cd34', clip: 3 });
    expect(short).toMatch(/\\fs52\\c&H3AB2F2&\}siftersearch\.com\/m\/Ab12cd34/);
  });
});

describe('shorts for the top moments of Hands / UHJ talks', () => {
  it('queues the top N moments of those speakers only', async () => {
    const { mediaShortsMomentsJob } = await import('../../api/lib/ops/media-jobs.js');
    const dirs = {};
    for (const [slug, sp] of [['sears-x', 'William Sears'], ['other-y', 'Jane Doe']]) {
      const d = mkdtempSync(join(tmpdir(), 'sm-')); dirs[slug] = d;
      writeFileSync(join(d, 'meta.json'), JSON.stringify({ moments: [{ t0_ms: 1000, t1_ms: 9000 }, { t0_ms: 20000, t1_ms: 95000 }, { t0_ms: 1, t1_ms: 2 }] }));
    }
    const items = { 1: { id: 1, slug: 'sears-x', speaker: 'William Sears', dir: dirs['sears-x'] }, 2: { id: 2, slug: 'other-y', speaker: 'Jane Doe', dir: dirs['other-y'] } };
    const queue = vi.fn();
    const r = await mediaShortsMomentsJob({ per: 2 }, { repo: { doneItemIds: async () => [1, 2], getMediaItem: async (id) => items[id] }, queue });
    expect(r).toEqual({ talks: 1, queued: 2, no_moments: 0 });
    expect(queue.mock.calls.map((c) => c[1])).toEqual([{ slug: 'sears-x', start: 1, end: 9, format: 'vertical' }, { slug: 'sears-x', start: 20, end: 80, format: 'vertical' }]);
  });
});

describe('size and edge (10-22: Archive Tape was 203 MB for 30 s; first byte ~4 s through the tunnel)', () => {
  it('every render is bitrate-capped and the archive grain is drawn once', () => {
    const py = readFileSync(new URL('../../scripts/media/render_short.py', import.meta.url), 'utf8');
    expect(py).toMatch(/'-maxrate', '1200k', '-bufsize', '2400k'/);
    expect(py).not.toMatch(/allf=t/);
  });
  it('the edge keeps the content-keyed files of a short without ?v', async () => {
    const { mediaKey } = await import('../../worker/media.js');
    expect(mediaKey('https://siftersearch.com/api/media/sears-x/file/shorts/5a9282612eb5.mp4')).toBe('sears-x/shorts/5a9282612eb5.mp4@s');
    expect(mediaKey('https://siftersearch.com/api/media/sears-x/file/shorts/../x.mp4')).toBeNull();
    expect(mediaKey('https://siftersearch.com/api/media/a-b/file/web/a-b.ogg')).toBeNull();
  });
});
