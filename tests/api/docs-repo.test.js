// docs-repo — the ONE document interface. These tests pin the rules that were previously re-remembered at
// 530 call sites, and each one corresponds to a real incident.
//
// Chad, 2026-08-25: "Why do we keep having this trouble of not being able to exclude duplicates until
// eventually we accidentally delete the canonical? We're relying on you remembering all the rules every
// time. Instead we should be developing and extending a robust API with all such rules baked in."
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows = { docs: [], content: [] };
const has = (d) => rows.content.some((c) => c.doc_id === d.id && !c.deleted_at);

// A tiny stand-in for the SQL layer: the repo's job is POLICY, and policy is what these tests pin.
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, params) => {
    if (/UPDATE docs SET duplicate_of/.test(sql)) {
      const d = rows.docs.find((x) => x.id === params[2]); if (d) d.duplicate_of = params[0];
    }
    return { changes: 1 };
  }),
  queryAll: vi.fn(async () => []),
  queryOne: vi.fn(async (sql, params) => {
    if (/COUNT\(\*\) n FROM docs d WHERE d\.id <> \?/.test(sql)) {
      const self = rows.docs.find((x) => x.id === params[0]);
      const n = rows.docs.filter((x) => x.id !== params[0] && !x.deleted_at && !x.duplicate_of
        && x.title?.trim().toLowerCase() === self?.title?.trim().toLowerCase() && has(x)).length;
      return { n };
    }
    if (/FROM docs d WHERE d\.id = \?/.test(sql)) {
      const d = rows.docs.find((x) => x.id === params[0]);
      if (!d) return null;
      if (/d\.deleted_at IS NULL/.test(sql) && d.deleted_at) return null;
      return { ...d, has_prose: has(d) ? 1 : 0,
        dependants: rows.docs.filter((o) => o.duplicate_of === d.id && !o.deleted_at).length };
    }
    return { n: 0 };
  }),
}));

vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const softDeleteSpy = vi.fn(async (ids) => ({ deleted: ids.length, deletedIds: ids }));
vi.mock('../../api/lib/content.js', () => ({ content: { safeSoftDeleteDocs: softDeleteSpy } }));

const { scopeSql, resolveCanonical, markDuplicate, softDeleteDocs, SCOPES } =
  await import('../../api/lib/docs-repo.js');

const doc = (id, o = {}) => ({ id, title: `t${id}`, source_site: 'oceanlibrary.com',
  duplicate_of: null, deleted_at: null, ...o });
const prose = (doc_id, n = 3) => Array.from({ length: n }, (_, i) => ({ doc_id, id: doc_id * 100 + i, deleted_at: null }));

beforeEach(() => { rows.docs = []; rows.content = []; softDeleteSpy.mockClear(); });

describe('scopeSql — visibility is a named POLICY, not a pile of booleans', () => {
  it('excludes deleted AND duplicates by default', () => {
    const s = scopeSql('live').join(' AND ');
    expect(s).toContain('deleted_at IS NULL');
    expect(s).toContain('duplicate_of IS NULL');
  });

  it("'all' is the only scope that shows tombstones, and must be named explicitly", () => {
    expect(scopeSql('all')).toEqual([]);
    expect(scopeSql()).not.toEqual([]);          // the default is never 'all'
  });

  it('canonical excludes scrapes, which outnumber canonicals ~128:1', () => {
    expect(scopeSql('canonical').join(' AND ')).toContain("source_site = 'oceanlibrary.com'");
  });

  it('withProse excludes husks — a doc satisfying every other rule but holding no text', () => {
    expect(scopeSql('withProse').join(' AND ')).toContain('EXISTS');
  });

  it('THROWS on an unknown scope, pointing the caller at extending the interface', () => {
    // Silently falling back to a default is how a caller ends up with a policy it did not ask for.
    expect(() => scopeSql('whatever')).toThrow(/unknown scope/i);
    expect(() => scopeSql('whatever')).toThrow(/add it here/i);
    expect(SCOPES).toContain('canonicalWithProse');
  });
});

describe('resolveCanonical', () => {
  it('follows duplicate_of to the copy that holds the text', async () => {
    rows.docs = [doc(1, { duplicate_of: 2 }), doc(2)];
    rows.content = prose(2);
    expect((await resolveCanonical(1)).resolved).toBe(2);
  });

  it('REFUSES to land on an empty shell — the four-invisible-canonicals bug', async () => {
    // 8317→20896 and three others pointed at documents with zero live content, so the only real copy of
    // each work was suppressed in favour of nothing. Following that pointer loses the work.
    rows.docs = [doc(8317, { duplicate_of: 20896 }), doc(20896)];   // target has NO prose
    rows.content = prose(8317);
    const r = await resolveCanonical(8317);
    expect(r.resolved).toBe(8317);                                   // stays on the copy that has the text
    expect(r.brokenPointer).toMatchObject({ duplicateOf: 20896 });
  });

  it('does not loop forever on a cycle', async () => {
    rows.docs = [doc(1, { duplicate_of: 2 }), doc(2, { duplicate_of: 1 })];
    rows.content = [...prose(1), ...prose(2)];
    const r = await resolveCanonical(1);
    expect(r.cycle).toBe(true);
  });
});

describe('markDuplicate — guarded', () => {
  it('REFUSES to point a document at a target holding no prose', async () => {
    rows.docs = [doc(1), doc(2)];                                    // 2 is an empty shell
    rows.content = prose(1);
    await expect(markDuplicate(1, 2)).rejects.toThrow(/NO live prose/i);
  });

  it('allows it when the target genuinely holds the work', async () => {
    rows.docs = [doc(1), doc(2)];
    rows.content = prose(2);
    await expect(markDuplicate(1, 2)).resolves.toMatchObject({ dup: 1, canon: 2 });
  });

  it('refuses a chain — pointing at something that is itself a duplicate', async () => {
    rows.docs = [doc(1), doc(2, { duplicate_of: 3 }), doc(3)];
    rows.content = [...prose(2), ...prose(3)];
    await expect(markDuplicate(1, 2)).rejects.toThrow(/itself a duplicate/i);
  });

  it('refuses self-reference and deleted targets', async () => {
    rows.docs = [doc(1), doc(2, { deleted_at: 'x' })];
    rows.content = prose(1);
    await expect(markDuplicate(1, 1)).rejects.toThrow(/cannot be a duplicate of itself/i);
    await expect(markDuplicate(1, 2)).rejects.toThrow(/deleted/i);
  });
});

describe('softDeleteDocs — the guard that was missing', () => {
  it('REFUSES to delete the last live copy holding prose', async () => {
    // The 2026-06-09 incident: a dedupe pass soft-deleted 155 canonical documents. A document nothing else
    // duplicates, holding text, is the ONLY copy — deleting it removes the work from the corpus.
    rows.docs = [doc(1, { title: 'Epistle to the Son of the Wolf' })];
    rows.content = prose(1);
    const r = await softDeleteDocs([1], { reason: 'test' });
    expect(r.deleted).toBe(0);
    expect(r.refused[0].why).toMatch(/last live copy/i);
    expect(softDeleteSpy).not.toHaveBeenCalled();
  });

  it('allows deletion when another live copy of the work survives', async () => {
    rows.docs = [doc(1, { title: 'Same Work' }), doc(2, { title: 'Same Work' })];
    rows.content = [...prose(1), ...prose(2)];
    const r = await softDeleteDocs([1], { reason: 'dedupe' });
    expect(r.deleted).toBe(1);
    expect(softDeleteSpy).toHaveBeenCalledWith([1], expect.objectContaining({ reason: 'dedupe' }));
  });

  it('REFUSES to delete a document other live documents point at as their canonical', async () => {
    // Deleting it orphans every dependant — they resolve to a tombstone and the work vanishes for all of them.
    rows.docs = [doc(1, { title: 'Canonical' }), doc(2, { title: 'Other', duplicate_of: 1 })];
    rows.content = prose(1);
    const r = await softDeleteDocs([1], { reason: 'test', allowLastCopy: true });
    expect(r.deleted).toBe(0);
    expect(r.refused[0].why).toMatch(/point at this as their canonical/i);
  });

  it('deletes an empty husk without complaint — it holds no work to lose', async () => {
    rows.docs = [doc(1, { title: 'Husk' })];
    rows.content = [];
    expect((await softDeleteDocs([1], { reason: 'cleanup' })).deleted).toBe(1);
  });

  it('is idempotent — deleting an already-deleted doc is not an error', async () => {
    rows.docs = [doc(1, { deleted_at: '2026-01-01' })];
    const r = await softDeleteDocs([1], { reason: 'again' });
    expect(r.deleted).toBe(0);
    expect(r.refused).toEqual([]);
  });

  it('escalation still requires explicit opt-in, and is not the default', async () => {
    rows.docs = [doc(1, { title: 'Only Copy' })];
    rows.content = prose(1);
    expect((await softDeleteDocs([1], {})).deleted).toBe(0);
    expect((await softDeleteDocs([1], { allowLastCopy: true })).deleted).toBe(1);
  });
});
