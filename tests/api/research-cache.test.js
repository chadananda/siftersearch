// research-cache: threshold, curated-wins, capture never overwrites curated, hydrate drops missing paragraphs. In-memory repo, no DB/LLM.
import { describe, it, expect } from 'vitest';
import { lookupResearch, captureResearch, hydrate, RESEARCH_THRESHOLD } from '../../api/lib/assistant/research-cache.js';
import { questionHash } from '../../api/lib/answer-cache.js';

const memRepo = (rows = []) => {
  const sets = [...rows];
  return {
    sets,
    researchSetsForScan: async () => sets,
    researchSetByHash: async (h) => sets.find((s) => s.question_hash === h) || null,
    bumpResearchHit: async (id) => { sets.find((s) => s.id === id).hits++; },
    upsertResearchCandidate: async ({ question, hash, embedding, kind, passages, gaps }) => {
      const e = sets.find((s) => s.question_hash === hash);
      if (e) { e.hits++; if (e.status === 'candidate') { e.passages = passages; e.gaps = gaps; } return e; }
      const s = { id: sets.length + 1, question, question_hash: hash, embedding, kind, passages, gaps, status: 'candidate', hits: 1 };
      sets.push(s); return s;
    },
  };
};
const set = (id, q, embedding, status = 'candidate') => ({ id, question: q, question_hash: questionHash(q), embedding, passages: [{ id }], gaps: [], status, hits: 0 });

describe('lookupResearch', () => {
  it('returns a set above the threshold, null below', async () => {
    const repo = memRepo([set(1, 'what is justice', [1, 0])]);
    expect((await lookupResearch('define fairness', { embed: async () => [1, 0.01], repo }))?.set.id).toBe(1);
    expect(await lookupResearch('define fairness', { embed: async () => [0, 1], repo })).toBeNull();
    expect(RESEARCH_THRESHOLD).toBeGreaterThanOrEqual(0.9);
  });
  it('prefers curated at equal similarity', async () => {
    const repo = memRepo([set(1, 'a', [1, 0]), set(2, 'b', [1, 0], 'curated')]);
    expect((await lookupResearch('c', { embed: async () => [1, 0], repo })).set.id).toBe(2);
  });
  it('exact question hits without embedding', async () => {
    const repo = memRepo([set(1, 'What is  Justice', [1, 0])]);
    const r = await lookupResearch('what is justice', { embed: async () => { throw new Error('no embed'); }, repo });
    expect(r.similarity).toBe(1);
  });
});

describe('captureResearch', () => {
  it('stores a candidate, dedups passages, skips empty', async () => {
    const repo = memRepo();
    const s = await captureResearch('q one', [{ id: 5, doc_id: 2, paragraph_index: 3 }, { id: 5 }], { embed: async () => [1, 0], repo });
    expect(s.passages).toEqual([{ id: 5, document_id: 2, paragraph_index: 3 }]);
    expect(await captureResearch('q two', [], { embed: async () => [1, 0], repo })).toBeNull();
  });
  it('never overwrites a curated set, only adds hits', async () => {
    const repo = memRepo([set(1, 'q one', [1, 0], 'curated')]);
    await captureResearch('q one', [{ id: 99 }], { embed: async () => [1, 0], repo });
    expect(repo.sets[0].passages).toEqual([{ id: 1 }]);
    expect(repo.sets[0].hits).toBe(1);
  });
});

describe('hydrate', () => {
  it('re-reads text and drops missing paragraphs, keeping order and roles', async () => {
    const s = { passages: [{ id: 1, role: 'core' }, { id: 2 }, { id: 3, note: 'n' }] };
    const out = await hydrate(s, { paragraphsByIds: async () => [{ id: 3, doc_id: 9, text: 'c' }, { id: 1, doc_id: 8, text: 'a' }] });
    expect(out.map((p) => p.id)).toEqual([1, 3]);
    expect(out[0]).toMatchObject({ role: 'core', document_id: 8, text: 'a' });
    expect(out[1].note).toBe('n');
  });
});
