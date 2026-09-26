// One OpenAI embedding per query, shared by the main and HyPE layers (and prefetched while Jev plans).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createEmbedding = vi.fn(async (t) => ({ embedding: [t.length] }));
vi.mock('../../api/lib/ai.js', () => ({ createEmbedding: (...a) => createEmbedding(...a) }));
const { queryEmbedding, clearQueryEmbeddings } = await import('../../api/lib/query-embedding.js');

describe('queryEmbedding', () => {
  beforeEach(() => { clearQueryEmbeddings(); createEmbedding.mockClear(); });

  it('concurrent callers share one call', async () => {
    const [a, b] = await Promise.all([queryEmbedding('who met the Báb'), queryEmbedding('who met the Báb')]);
    expect(a).toBe(b);
    expect(createEmbedding).toHaveBeenCalledTimes(1);
  });

  it('a failure is not cached', async () => {
    createEmbedding.mockRejectedValueOnce(new Error('503'));
    await expect(queryEmbedding('x y z')).rejects.toThrow('503');
    await expect(queryEmbedding('x y z')).resolves.toEqual({ embedding: [5] });
    expect(createEmbedding).toHaveBeenCalledTimes(2);
  });
});
