// Speaker exclusions (Chad 10-23: "remove talks by Firaydoun Javaheri and Gustavo Correa … No House members elected
// after '88"): the matcher, the media-exclude job (state, runs, remote jobs, documents soft-deleted in batches of ≤ 20),
// the rank job never registering an excluded target, and the soft delete's short paragraph chunks.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(async () => ({})), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { excludedBy, unsureBy } from '../../api/lib/media/exclusions.js';
import { mediaExcludeJob } from '../../api/lib/ops/media-jobs.js';

describe('exclusion matcher', () => {
  it('the newer-generation list (Chad 10-23): a given name is required; the historical speakers stay', () => {
    for (const s of ['Firaydoun Javaheri', 'Dr. Fereydoun Javaheri', 'فریدون جواهری', 'Gustavo Correa', 'Gustavo Corea', 'Paul Lample', 'Farzam Arbab',
      'J. Douglas Martin', 'Douglas Martin', 'Payman Mohajer', 'Peyman Mohajer', 'Kiser Barnes', 'Stephen Birkland', 'Steve Birkland', 'Shahriar Razavi', 'Stephen Hall',
      'Chuungu Malitonga', 'Ayman Rouhani', 'Juan Francisco Mora', 'Praveen Mallik']) expect(excludedBy({ speaker: s }), s).toMatchObject({ rule: 'newer-generation', evidence: expect.stringMatching(/^speaker: /) });
    for (const s of ['Hooper Dunbar', 'Hartmut Grossmann', 'Grossmann', 'Hermann Grossmann', 'Ali Nakhjavání', 'Adib Taherzadeh', 'Peter Khan', 'Glenford Mitchell', 'Ian Semple',
      'Dr. Mohajer', 'Raḥmatu’lláh Muhájir', 'Dr. Rahmatullah Mohajer', 'Baharieh Rouhani Ma’ani', 'Martin Luther King', 'Korea Bahá’í Community', 'Dorothy Baker',
      // a surname alone never excludes (Chad 10-23: "spelling is not trustworthy"; Martin, Hall, Barnes are common)
      'Javaheri', 'Correa', 'Lample', 'Arbab', 'Martin', 'Hall', 'Barnes', 'Birkland', 'Mr. Mora']) expect(excludedBy({ speaker: s }), s).toBeNull();
    expect(excludedBy({ title: 'Talk on Race Unity with Dr. Firaydoun Javaheri' })).toMatchObject({ evidence: expect.stringMatching(/^title: /) });
    expect(excludedBy({ title: 'Pioneering in Korea' })).toBeNull();
    expect(excludedBy({ title: 'Town Hall meeting' })).toBeNull();
  });
  it('surname only → the unsure list (who it might be + evidence), not excluded; the Hand Muhájir is never on it', () => {
    expect(unsureBy({ speaker: 'Dr. Mohajer' })).toMatchObject({ person: 'Payman Mohajer', evidence: expect.stringMatching(/surname only/) });
    expect(unsureBy({ speaker: 'Hall' })).toMatchObject({ person: 'Stephen Hall' });
    expect(unsureBy({ title: 'Mr Birkland at SON' })).toMatchObject({ person: 'Stephen Birkland' });
    expect(unsureBy({ title: 'Town Hall meeting' })).toBeNull();
    expect(unsureBy({ speaker: 'Dr. Mohajer', title: 'Hand of the Cause Dr Rahmatullah Mohajer' })).toBeNull();
    expect(unsureBy({ speaker: 'Raḥmatu’lláh Muhájir' })).toBeNull();
    expect(unsureBy({ speaker: 'Farzam Arbab' })).toBeNull();   // excluded, not unsure
  });
});

describe('the /media index never lists an excluded speaker', () => {
  it('buildIndex(exclude) drops the row whatever its state', async () => {
    const { buildIndex } = await import('../../api/lib/media/listing-index.js');
    const rows = [{ id: 1, slug: 'a', speaker: 'Farzam Arbab', updated_at: 1 }, { id: 2, slug: 'b', speaker: 'Hooper Dunbar', updated_at: 1 }, { id: 3, slug: 'c', speaker: 'Dr. Mohajer', updated_at: 1 }];
    const { items } = await buildIndex(rows, { readItem: async () => ({}), exclude: (r) => excludedBy({ speaker: r.speaker || '', title: r.title || '' }) });
    expect(items.map((i) => i.s)).toEqual(['b', 'c']);
  });
});

describe('media-exclude job', () => {
  const rows = [
    { id: 1, slug: 'javaheri-a', speaker: 'Firaydoun Javaheri', state: 'done', doc_id: 501, dir: '/a' },
    { id: 2, slug: null, speaker: null, state: 'queued', youtube_id: 'vid2', doc_id: null, dir: null },
    { id: 3, slug: 'dunbar-x', speaker: 'Hooper Dunbar', state: 'done', doc_id: 503, dir: '/c' },
    { id: 4, slug: 'correa-b', speaker: 'Gustavo Correa', state: 'prepped', doc_id: null, dir: '/d' },
    { id: 5, slug: 'fire-tablet', speaker: 'Dr. Mohajer', state: 'done', doc_id: 505, dir: null },
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
    expect(r.talks.every((t) => t.evidence)).toBe(true);
    expect(r.unsure).toEqual([expect.objectContaining({ id: 5, might_be: 'Payman Mohajer', evidence: expect.stringMatching(/surname only/) })]);
    expect(d.repo.excludeItems).not.toHaveBeenCalled(); expect(d.docs.softDeleteDocs).not.toHaveBeenCalled();
  });
  it('write: excluded with the reason, their runs cancelled (not others), the remote job stopped, the document soft-deleted', async () => {
    const d = deps();
    const r = await mediaExcludeJob({ write: true }, d);
    expect(d.repo.excludeItems).toHaveBeenCalledWith([1, 2, 4], expect.stringMatching(/^newer-generation/));
    expect(d.ops.cancel.mock.calls.map((c) => c[0])).toEqual([90]);
    expect(d.tools.cancelRemote).toHaveBeenCalledWith('aorus', 'correa-b-dz-1');
    expect(d.docs.softDeleteDocs).toHaveBeenCalledWith([501], expect.objectContaining({ allowLastCopy: true }));
    expect(r).toMatchObject({ runs_cancelled: 1, remote_cancelled: 1, docs_deleted: 1 });
  });
  it('documents go in batches of at most 20 (the delete circuit breaker is 25)', async () => {
    const d = deps();
    d.repo.exclusionCandidates = async () => Array.from({ length: 45 }, (_, i) => ({ id: i + 1, speaker: 'Firaydoun Javaheri', state: 'done', doc_id: 1000 + i }));
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
