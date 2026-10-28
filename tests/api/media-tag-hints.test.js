// Audio tag hints: cleaning (mojibake, placeholders), precedence (hints never override), ffprobe failure path, backfill.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(async () => ({})), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { fixMojibake, cleanTag, parseOrdinal, tagHints, isPlaceholderTitle, compareHints, weakDuplicateSignal, applyTagHints } from '../../api/lib/media/tag-hints.js';
import { mediaTagsBackfillJob } from '../../api/lib/ops/media-hints.js';

const people = [{ key: 'dunbar', name: 'Hooper Dunbar', aliases: ['H. Dunbar'] }, { key: 'grossmann', name: 'Hartmut Grossmann', aliases: [] }];

describe('tag cleaning', () => {
  it('repairs latin-1 mojibake, leaves good text alone', () => {
    expect(fixMojibake('BahÃ¡â€™Ã­ Faith')).toBe('Bahá’í Faith');
    expect(fixMojibake('Bahá’í Faith')).toBe('Bahá’í Faith');
    expect(fixMojibake('Ã')).toBe('Ã');
  });
  it('drops empty, placeholder, rip and filename-repeat values', () => {
    for (const v of ['', '  ', 'Track 01', 'Track 12', 'Unknown', 'Unknown Artist', '12', 'Audio Track 3', 'www.site.com', 'Various Artists']) expect(cleanTag(v), v).toBeNull();
    expect(cleanTag('Hooper_Dunbar-Kitab-i-Iqan 3', { filename: '/x/Hooper Dunbar Kitab i Iqan 3.mp3' })).toBeNull();
    expect(cleanTag('The Kitáb-i-Íqán, part 3')).toBe('The Kitáb-i-Íqán, part 3');
  });
  it('ordinals', () => { expect(parseOrdinal('3/8')).toEqual({ n: 3, of: 8 }); expect(parseOrdinal('03')).toEqual({ n: 3, of: null }); expect(parseOrdinal('x')).toEqual({ n: null, of: null }); expect(parseOrdinal('5/3').of).toBeNull(); });
  it('tagHints builds the record, null when nothing usable', () => {
    const h = tagHints({ TITLE: 'Track 01', ARTIST: 'Hooper Dunbar', album: 'Íqán course', track: '3/8', date: '1998-05-01', encoder: 'Lame' }, { filename: 'a.mp3', duration_s: 3000, bit_rate: 64000 });
    expect(h).toMatchObject({ title: null, artist: 'Hooper Dunbar', album: 'Íqán course', track: 3, track_of: 8, year: 1998, source: 'id3', duration_s: 3000 });
    expect(h.raw.encoder).toBeUndefined();
    expect(tagHints({ title: 'Track 02', artist: 'Unknown' })).toBeNull();
    expect(tagHints({})).toBeNull();
  });
  it('placeholder titles', () => { for (const t of ['Track 12', '07', 'Disc 2 Track 03', null]) expect(isPlaceholderTitle(t), String(t)).toBe(true); expect(isPlaceholderTitle('Nine Candles')).toBe(false); });
});

describe('hint precedence: hints only', () => {
  it('speaker disagreement is flagged, never applied', async () => {
    const meta = { speaker: 'Hartmut Grossmann', title: 'Order of God' };
    const c = await compareHints({ artist: 'Hooper Dunbar' }, meta, { people });
    expect(c.conflicts[0]).toMatchObject({ field: 'speaker', tag: 'Hooper Dunbar' });
    expect(c.proposals.speaker).toBeUndefined();
  });
  it('a tag artist fills a MISSING speaker as a proposal only', async () => {
    const meta = { speaker: null, title: 'Order of God' };
    const c = await compareHints({ artist: 'Hooper Dunbar' }, meta, { people });
    expect(c.proposals.speaker).toMatchObject({ key: 'dunbar' });
    expect(meta.speaker).toBeNull();
  });
  it('title proposed only for a placeholder, never over Chad\'s retitle', async () => {
    expect((await compareHints({ title: 'Nine Candles' }, { title: 'Track 04' }, { people })).proposals.title.value).toBe('Nine Candles');
    const kept = await compareHints({ title: 'Nine Candles' }, { title: 'Track 04', title_was: 'x' }, { people });
    expect(kept.proposals.title).toBeUndefined();
    const dec = await compareHints({ title: 'Other Title' }, { title: 'The Real Title', identity_decision: {} }, { people });
    expect(dec.proposals.title).toBeUndefined(); expect(dec.conflicts[0].field).toBe('title');
  });
  it('sequence is validated against the content', async () => {
    const good = await compareHints({ track: 3, track_of: 8, album: 'Íqán', duration_s: 3000 }, { part: '3', series: 'Íqán' }, { people, opening: 'Welcome to part 3 of this course' });
    const bad = await compareHints({ track: 9, track_of: 12, album: 'Disc', duration_s: 3000 }, { part: '2' }, { people, opening: 'This is part 2' });
    expect(good.sequence.confidence).toBeGreaterThan(0.6);
    expect(bad.sequence.confidence).toBeLessThan(0.2);
    expect(bad.conflicts.some((x) => x.field === 'sequence')).toBe(true);
  });
  it('dedupe: weak signal, never a verdict', () => {
    const a = { title: 'X', artist: 'Y', duration_s: 100 };
    expect(weakDuplicateSignal(a, { ...a, duration_s: 101 })).toMatchObject({ weak: true, verdict: false });
    expect(weakDuplicateSignal(a, { ...a, duration_s: 200 }).weak).toBe(false);
  });
  it('applyTagHints leaves title and speaker untouched and survives bad input', async () => {
    const meta = { title: 'Track 04', speaker: 'Hartmut Grossmann' };
    await applyTagHints(meta, { tags: { title: 'Nine Candles', artist: 'Hooper Dunbar' }, duration_s: 10 }, { filename: 'a.mp3', ctx: { people } });
    expect(meta.title).toBe('Track 04'); expect(meta.speaker).toBe('Hartmut Grossmann');
    expect(meta.tag_hints.title).toBe('Nine Candles'); expect(meta.hint_conflicts.length).toBe(1);
    await expect(applyTagHints({}, null, {})).resolves.toBeTruthy();
  });
});

describe('backfill', () => {
  it('fills hints only, survives ffprobe failure, skips busy and already-hinted', async () => {
    const metas = { 1: { title: 'T1', original: 'o/a.mp3' }, 2: { title: 'T2', original: 'o/b.mp3' }, 3: { title: 'T3', tag_hints: null }, 4: { title: 'T4', original: 'o/d.mp3' } };
    const written = {};
    const r = await mediaTagsBackfillJob({ limit: 10, pauseMs: 0 }, {
      repo: { hintItems: async () => [1, 2, 3, 4].map((id) => ({ id, dir: `/d/${id}`, source_ref: `/s/${id}` })) },
      ops: { pendingRuns: async (n) => (n === 'media-item' ? [{ params: { id: 4 } }] : []) },
      probeTags: async (f) => (f.endsWith('b.mp3') ? { ok: false, error: 'invalid data' } : { ok: true, tags: { title: 'Real', artist: 'Hooper Dunbar' }, duration_s: 60 }),
      readMeta: async (dir) => structuredClone(metas[dir.split('/').pop()]), writeMeta: async (dir, m) => { written[dir.split('/').pop()] = m; },
      queue: async () => {}, sleep: async () => {}, ctx: { people } });
    expect(r).toMatchObject({ hinted: 1, probe_failed: 1, skipped_have: 1, skipped_busy: 1 });
    expect(written[1].title).toBe('T1'); expect(written[1].tag_hints.title).toBe('Real');
    expect(written[2].tag_hints).toBeNull(); expect(written[2].tag_hints_error).toMatch(/invalid/);
    expect(written[3]).toBeUndefined(); expect(written[4]).toBeUndefined();
  });
});
