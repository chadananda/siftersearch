// Speaker exclusions (Chad 10-23: "remove talks by Firaydoun Javaheri and Gustavo Correa … No House members elected
// after '88"): the matcher, the media-exclude job (state, runs, remote jobs, documents soft-deleted in batches of ≤ 20),
// the rank job never registering an excluded target, and the soft delete's short paragraph chunks.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(async () => ({})), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { excludedBy } from '../../api/lib/media/exclusions.js';
import { mediaExcludeJob } from '../../api/lib/ops/media-jobs.js';

describe('exclusion matcher', () => {
  it('every spelling of the two speakers; nobody else', () => {
    for (const s of ['Firaydoun Javaheri', 'Dr. Fereydoun Javaheri', 'Javaheri', 'Gustavo Correa', 'Gustavo Corea', 'Correa']) expect(excludedBy({ speaker: s }), s).toMatchObject({ reason: 'too-modern: UHJ elected after 1988' });
    for (const s of ['Hooper Dunbar', 'Hartmut Grossmann', 'Ali Nakhjavání', 'Korea Bahá’í Community']) expect(excludedBy({ speaker: s }), s).toBeNull();
    expect(excludedBy({ title: 'Talk on Race Unity with Dr. Firaydoun Javaheri' })).not.toBeNull();
    expect(excludedBy({ title: 'Pioneering in Korea' })).toBeNull();
  });
});

describe('media-exclude job', () => {
  const rows = [
    { id: 1, slug: 'javaheri-a', speaker: 'Firaydoun Javaheri', state: 'done', doc_id: 501, dir: '/a' },
    { id: 2, slug: null, speaker: null, state: 'queued', youtube_id: 'vid2', doc_id: null, dir: null },
    { id: 3, slug: 'dunbar-x', speaker: 'Hooper Dunbar', state: 'done', doc_id: 503, dir: '/c' },
    { id: 4, slug: 'correa-b', speaker: 'Gustavo Correa', state: 'prepped', doc_id: null, dir: '/d' },
  ];
  const deps = () => ({
    repo: { exclusionCandidates: async () => rows, excludeItems: vi.fn(async (ids) => ids.length) },
    ops: { pendingRuns: async (n) => (n === 'media-asr' ? [{ id: 90, params: { id: 4 } }, { id: 91, params: { id: 3 } }] : []), cancel: vi.fn(async () => ({})) },
    targets: new Map([['vid2', { speaker: 'Gustavo Correa', title: 'The Nine Year Plan' }]]),
    readMeta: async (dir) => (dir === '/d' ? { speaker: 'Gustavo Correa', diar_job: { id: 'correa-b-dz-1', host: 'aorus' } } : {}),
    tools: { cancelRemote: vi.fn(async () => true) },
    docs: { softDeleteDocs: vi.fn(async (ids) => ({ deleted: ids.length, refused: [] })) },
  });
  it('dry run: lists the talks (published and queued), changes nothing', async () => {
    const d = deps();
    const r = await mediaExcludeJob({}, d);
    expect(r.talks.map((t) => t.id)).toEqual([1, 2, 4]);
    expect(r).toMatchObject({ matched: 3, published: 1, queued: 2 });
    expect(d.repo.excludeItems).not.toHaveBeenCalled(); expect(d.docs.softDeleteDocs).not.toHaveBeenCalled();
  });
  it('write: excluded with the reason, their runs cancelled (not others), the remote job stopped, the document soft-deleted', async () => {
    const d = deps();
    const r = await mediaExcludeJob({ write: true }, d);
    expect(d.repo.excludeItems).toHaveBeenCalledWith([1, 2, 4], 'too-modern: UHJ elected after 1988');
    expect(d.ops.cancel.mock.calls.map((c) => c[0])).toEqual([90]);
    expect(d.tools.cancelRemote).toHaveBeenCalledWith('aorus', 'correa-b-dz-1');
    expect(d.docs.softDeleteDocs).toHaveBeenCalledWith([501], expect.objectContaining({ allowLastCopy: true }));
    expect(r).toMatchObject({ runs_cancelled: 1, remote_cancelled: 1, docs_deleted: 1 });
  });
  it('documents go in batches of at most 20 (the delete circuit breaker is 25)', async () => {
    const d = deps();
    d.repo.exclusionCandidates = async () => Array.from({ length: 45 }, (_, i) => ({ id: i + 1, speaker: 'Javaheri', state: 'done', doc_id: 1000 + i }));
    await mediaExcludeJob({ write: true }, d);
    expect(d.docs.softDeleteDocs.mock.calls.map((c) => c[0].length)).toEqual([20, 20, 5]);
  });
});

describe('the soft delete writes a document\'s paragraphs in short chunks', () => {
  it('1,000 paragraphs → many small UPDATEs, none over 400 rows, the first at 25', async () => {
    const db = await import('../../api/lib/db.js');
    db.queryAll.mockImplementation(async (sql) => (/FROM docs WHERE id IN/.test(sql) ? [{ id: 7, source_site: 'x' }] : /SELECT id FROM content/.test(sql) ? Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 })) : []));
    const sizes = [];
    db.query.mockImplementation(async (sql, args) => { if (/UPDATE content SET deleted_at/.test(sql)) sizes.push(args.length - 1); return {}; });
    const { content } = await import('../../api/lib/content.js');
    const r = await content.safeSoftDeleteDocs([7], { reason: 'test' });
    expect(r.deleted).toBe(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(sizes[0]).toBe(25);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(400);
  });
});
