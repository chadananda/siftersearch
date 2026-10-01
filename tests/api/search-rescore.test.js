// Exact re-rank of binary-quantized semantic candidates (api/lib/search/rescore.js).
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';

const rawDb = new Database(':memory:');
rawDb.exec('CREATE TABLE content (id INTEGER PRIMARY KEY, embedding BLOB)');
const blob = (arr) => Buffer.from(new Float32Array(arr).buffer);
const ins = rawDb.prepare('INSERT INTO content VALUES (?, ?)');
ins.run(1, blob([1, 0, 0, 0]));      // the true match for query [1,0,0,0]
ins.run(2, blob([0.6, 0.8, 0, 0]));  // related
ins.run(3, blob([0, 0, 1, 0]));      // unrelated

vi.mock('../../api/lib/db.js', () => ({
  queryAll: async (sql, params = []) => rawDb.prepare(sql).all(...params),
}));

const { rescoreHits, exactScores, cosine } = await import('../../api/lib/search/rescore.js');

describe('exact semantic re-rank', () => {
  it('cosine is 1 for identical direction and 0 for orthogonal', () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
  });
  it('reads the stored float vectors', async () => {
    const m = await exactScores([1, 2, 3], [1, 0, 0, 0]);
    expect(m.get(1)).toBeCloseTo(1);
    expect(m.get(2)).toBeCloseTo(0.6);
    expect(m.get(3)).toBeCloseTo(0);
  });
  it('a pure vector search is ordered by exact similarity, whatever the quantized order was', async () => {
    // quantized Meili order put the right paragraph LAST — the measured failure
    const hits = [{ id: 3, _rankingScore: 0.74 }, { id: 2, _rankingScore: 0.73 }, { id: 1, _rankingScore: 0.70 }];
    const out = await rescoreHits(hits, [1, 0, 0, 0], 1);
    expect(out.map((h) => h.id)).toEqual([1, 2, 3]);
    expect(out[0]._meiliScore).toBe(0.70);
  });
  it('a hybrid search blends exact and Meili scores by the semantic ratio', async () => {
    const hits = [{ id: 3, _rankingScore: 1.0 }, { id: 1, _rankingScore: 0.0 }];
    const out = await rescoreHits(hits, [1, 0, 0, 0], 0.5);   // 3: .5*0+.5*1 = .5 ; 1: .5*1+.5*0 = .5 → tie keeps both
    expect(out.find((h) => h.id === 3)._rankingScore).toBeCloseTo(0.5);
    expect(out.find((h) => h.id === 1)._rankingScore).toBeCloseTo(0.5);
  });
  it('a hit without a stored vector keeps its Meili score', async () => {
    const out = await rescoreHits([{ id: 999, _rankingScore: 0.9 }, { id: 3, _rankingScore: 0.8 }], [1, 0, 0, 0], 1);
    expect(out[0].id).toBe(999);
    expect(out[0]._rankingScore).toBe(0.9);
    expect(out[1]._rankingScore).toBeCloseTo(0);
  });
  it('keyword-only search (ratio 0) is untouched', async () => {
    const hits = [{ id: 3, _rankingScore: 0.9 }, { id: 1, _rankingScore: 0.1 }];
    expect((await rescoreHits(hits, [1, 0, 0, 0], 0)).map((h) => h.id)).toEqual([3, 1]);
  });
});
