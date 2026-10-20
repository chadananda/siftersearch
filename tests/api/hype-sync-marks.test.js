// 10-19: the HyPE sidecar sync ran on the single writer's thread and one batch took 24 s — rows that will never be indexed
// (paragraphs of deleted documents, questions that parse to nothing) were skipped but never marked synced, so they stayed
// in the partial index and every batch re-read them first. The watchdog then restarted the writer. Also: v14+ question
// objects were indexed as "[object Object]".
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/ai.js', () => ({ createEmbeddings: async (texts) => ({ embeddings: texts.map(() => [0.1, 0.2]) }) }));

describe('syncHypeBatch marks never-indexed rows synced', () => {
  it('marks a deleted document\'s row and an empty row, indexes the real one', async () => {
    const { syncHypeBatch } = await import('../../api/lib/search/hype.js');
    const rows = [
      { paragraph_id: 1, doc_id: 9, hyp_questions: '["What is the soul?"]', doc_deleted: 1 },
      { paragraph_id: 2, doc_id: 8, hyp_questions: '[]', doc_deleted: 0 },
      { paragraph_id: 3, doc_id: 8, hyp_questions: JSON.stringify([{ q: 'What is detachment?', a: 'x' }]), doc_deleted: 0 },
    ];
    const updates = [];
    const added = [];
    const meili = { index: () => ({ deleteDocuments: async () => {}, addDocuments: async (docs) => { added.push(...docs); } }) };
    const r = await syncHypeBatch({ getMeili: () => meili, INDEXES: { HYPE_QUESTIONS: 'hype' } },
      { queryAll: async () => rows, query: async (sql, ids) => { updates.push(...ids); }, getAuthority: () => 5 });
    expect(updates.sort()).toEqual([1, 2, 3]);
    expect(added.map((d) => d.question_text)).toEqual(['What is detachment?']);
    expect(r.indexed).toBe(1);
  });
  it('the query no longer drops deleted documents in SQL (they must come back to be marked)', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../api/lib/search/hype.js', import.meta.url), 'utf8');
    expect(src).toMatch(/doc_deleted/);
  });
});
