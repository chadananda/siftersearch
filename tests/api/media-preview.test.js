// Dewey stage 0: duplicate / new from a ~2 min preview, before any heavy stage (Chad 10-24).
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { previewVerdict, openingSimilarity, previewFirst, previewHost } from '../../api/lib/media/preview.js';

const TALK = 'Today I want to speak about the meaning of service in the Cause of Bahá’u’lláh and how the friends arise to teach in every village and town across the land with radiant hearts and certain faith in the promise';
const OTHER = 'The history of the Covenant begins in Baghdad where the Blessed Beauty declared his station to a few companions in the garden of Ridván before the exile to Constantinople and onward to Adrianople';
const repo = (items) => ({ itemsNearDuration: vi.fn(async () => items) });
const reader = (map) => async (it) => map[it.slug];

describe('stage 0', () => {
  it('the same talk heard differently by ASR (a few words changed, different start) is a duplicate of its slug', async () => {
    const heard = TALK.replace('radiant', 'radiance').replace('certain', 'curtain');
    const r = await previewVerdict({ text: `um ${heard}`, duration_s: 3600 }, { repo: repo([{ slug: 'held-talk' }]), readOpening: reader({ 'held-talk': TALK }) });
    expect(r).toMatchObject({ verdict: 'duplicate', of: 'held-talk' });
  });
  it('a different talk of the same length is new', async () => {
    const r = await previewVerdict({ text: OTHER, duration_s: 3600 }, { repo: repo([{ slug: 'held-talk' }]), readOpening: reader({ 'held-talk': TALK }) });
    expect(r.verdict).toBe('new');
  });
  it('an identical audio fingerprint is a duplicate with no transcript at all; no candidates of that length → new', async () => {
    expect(await previewVerdict({ fingerprint: 'AQAA', duration_s: 100 }, { repo: repo([{ slug: 'x', fingerprint: 'AQAA' }]), readOpening: reader({}) })).toMatchObject({ verdict: 'duplicate', of: 'x', by: 'fingerprint' });
    expect((await previewVerdict({ text: TALK, duration_s: 100 }, { repo: repo([]), readOpening: reader({}) })).verdict).toBe('new');
  });
  it('previews go ahead of bulk; they run on a free boss / aorus before any pod', () => {
    expect(previewFirst([{ id: 1, kind: 'bulk' }, { id: 2, kind: 'preview' }, { id: 3, kind: 'bulk' }, { id: 4, kind: 'preview' }]).map((j) => j.id)).toEqual([2, 4, 1, 3]);
    expect(previewHost({ boss: { ok: true, temp_c: 70 } })).toBe('boss');
    expect(previewHost({ boss: { ok: true, temp_c: 88 }, aorus: { ok: true, asr_waiting: 0, vram_free_gb: 3 } })).toBe('aorus');
    expect(previewHost({ boss: { ok: false }, aorus: { ok: true, asr_waiting: 4, vram_free_gb: 3 }, pod: 'p1' })).toBe('pod');
    expect(previewHost({})).toBeNull();
    expect(openingSimilarity('', TALK)).toBe(0);
  });
});
