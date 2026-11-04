// OceanLibrary paragraph ids for chat passages and document-subagent excerpts (11-03): the old
// `content WHERE doc_id = ? AND paragraph_index IN (...)` walked the whole document (no (doc_id, paragraph_index) index;
// worst 2,466 ms on the API thread). Now: hydrated hits carry the id, the rest are read by primary key; the subagent
// reuses what its tools returned and reads only leftovers.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const seen = [];
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })), queryOne: vi.fn(async () => null), transaction: vi.fn(),
  queryAll: vi.fn(async (sql, params, name) => { seen.push({ sql, params, name }); return []; }),
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { externalParaIdsByIds, paragraphMetaAt } = await import('../../api/lib/paragraphs-repo.js');
const { olParaIds } = await import('../../api/routes/chat.js');
const { backfillMissing } = await import('../../api/lib/document-subagent.js');

beforeEach(() => { seen.length = 0; });

describe('externalParaIdsByIds', () => {
  it('reads by content id (primary key), named, never by doc_id', async () => {
    await externalParaIdsByIds([5, 6, '7', 'x', null, 5]);
    expect(seen).toHaveLength(1);
    expect(seen[0].name).toBe('paragraphs-repo:ext-ids');
    expect(seen[0].sql).toMatch(/WHERE id IN \(\?,\?,\?\)/);
    expect(seen[0].sql).not.toMatch(/doc_id\s*=/);
    expect(seen[0].params).toEqual([5, 6, 7]);
  });
  it('no ids → no read', async () => {
    expect(await externalParaIdsByIds([])).toEqual([]);
    expect(seen).toHaveLength(0);
  });
  it('paragraphMetaAt is named (its cost shows in the query-time report) and skips an empty list', async () => {
    expect(await paragraphMetaAt(3, [])).toEqual([]);
    await paragraphMetaAt(3, [4, 4, 9]);
    expect(seen.map((s) => s.name)).toEqual(['paragraphs-repo:meta-at']);
    expect(seen[0].params).toEqual([3, 4, 9]);
  });
});

describe('olParaIds (chat passages)', () => {
  it('hydrated hits: no read at all', async () => {
    const byIds = vi.fn(), at = vi.fn();
    const m = await olParaIds([{ id: 1, doc_id: 9, paragraph_index: 3, external_para_id: 'OL-3' },
      { id: 2, doc_id: 9, paragraph_index: 4, external_para_id: null }], { byIds, at });
    expect(byIds).not.toHaveBeenCalled(); expect(at).not.toHaveBeenCalled();
    expect([...m]).toEqual([['9:3', 'OL-3']]);
  });
  it('unhydrated hits with a content id → one primary-key read; a row of another paragraph lends no link', async () => {
    const byIds = vi.fn(async () => [{ id: 11, doc_id: 9, paragraph_index: 5, external_para_id: 'OL-5' },
      { id: 12, doc_id: 8, paragraph_index: 0, external_para_id: 'OTHER' }]);
    const at = vi.fn(async () => []);
    const m = await olParaIds([{ id: 11, doc_id: 9, paragraph_index: 5 }, { id: 12, doc_id: 9, paragraph_index: 6 }], { byIds, at });
    expect(byIds).toHaveBeenCalledWith([11, 12]);
    expect(at).not.toHaveBeenCalled();
    expect(m.get('9:5')).toBe('OL-5');
    expect(m.has('9:6')).toBe(false);
  });
  it('a hit without a content id falls back to the (doc, index) read for just that doc', async () => {
    const byIds = vi.fn(async () => []);
    const at = vi.fn(async () => [{ paragraph_index: 7, external_para_id: 'OL-7' }]);
    const m = await olParaIds([{ document_id: 4, paragraph_index: 7 }], { byIds, at });
    expect(byIds).not.toHaveBeenCalled();
    expect(at).toHaveBeenCalledWith(4, [7]);
    expect(m.get('4:7')).toBe('OL-7');
  });
});

describe('backfillMissing (document subagent)', () => {
  const seenMap = new Map([[1, { heading: 'H', external_para_id: 'a' }], [2, { heading: null }], [3, { external_para_id: null }]]);
  it('paragraphs a tool returned in full need no read', () => {
    expect(backfillMissing([1, 1], seenMap, true)).toEqual([]);
  });
  it('non-OL doc: only a missing heading counts', () => {
    expect(backfillMissing([1, 2, 3, 4], seenMap, false)).toEqual([3, 4]);
  });
  it('OL doc: a missing paragraph id counts too', () => {
    expect(backfillMissing([1, 2, 3, 4], seenMap, true)).toEqual([2, 3, 4]);
  });
});

describe('no doc-walking IN query left in the request paths', () => {
  it('chat.js and document-subagent.js no longer hand-write the paragraph_index IN read', async () => {
    const { readFileSync } = await import('fs');
    for (const f of ['api/routes/chat.js', 'api/lib/document-subagent.js']) {
      expect(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')).not.toMatch(/paragraph_index IN \(\$\{/);
    }
  });
});
