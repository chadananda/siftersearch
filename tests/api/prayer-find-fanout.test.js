// Battery 11-10 prayer-healing (20 s): every tradition fired one phrase search PER prayer work, and the tradition-wide searches waited
// for the works lookup. Now: one documentId-list search per tradition, started alongside the works lookup. Fake search, no network.
import { describe, it, expect } from 'vitest';
import { findPrayers } from '../../api/lib/assistant/prayer-find.js';

const WORKS = [{ id: 1, title: 'Prayers One', religion: 'Christian' }, { id: 2, title: 'Book of Prayer', religion: 'Christian' }, { id: 3, title: 'Prayer Psalter', religion: 'Christian' }];
function rig({ worksMs = 0 } = {}) {
  const calls = [];
  let worksDone = false;
  const search = async (layer, { query, limit, filters = {} }) => {
    calls.push({ layer, limit, documentId: filters.documentId, worksDone });
    return { passages: [] };
  };
  const findDocuments = async () => { await new Promise((r) => setTimeout(r, worksMs)); worksDone = true; return { docs: WORKS }; };
  return { calls, d: { search, findDocuments, paragraphsInRange: async () => [] } };
}

describe('findPrayers fan-out (battery 11-10 prayer-healing)', () => {
  it('a need → ONE phrase search over all the tradition’s prayer works (a documentId list), not one per work', async () => {
    const { calls, d } = rig();
    await findPrayers({ tradition: 'Christian', need: 'healing' }, d);
    const perWork = calls.filter((c) => c.documentId != null);
    expect(perWork.length).toBe(1);
    expect(perWork[0].documentId).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(perWork[0].limit).toBe(12);
  });
  it('the tradition-wide searches start before a slow works lookup finishes', async () => {
    const { calls, d } = rig({ worksMs: 30 });
    await findPrayers({ tradition: 'Christian', need: 'healing' }, d);
    const wide = calls.filter((c) => c.documentId == null);
    expect(wide.length).toBe(2);
    expect(wide.every((c) => c.worksDone === false)).toBe(true);
  });
});

// Live 11-12 "Give me the Remover of Difficulties prayer" (no tradition): every tradition's first meaning hit counted as 'named', so a
// Christian intercession outranked the Báb's "Is there any Remover of difficulties save God?". The name in the text is the evidence.
describe('findPrayers across traditions: the name in the text leads', () => {
  const P = {
    Christian: { document_id: 19757, paragraph_index: 300, religion: 'Christian', text: 'We bring before Thee, O Lord, the troubles and perils of people and nations.', heading: 'Prayers' },
    "Baha'i": { document_id: 20762, paragraph_index: 65, religion: "Baha'i", authority: 'writings', text: 'Is there any Remover of difficulties save God? Say: Praised be God! He is God!', heading: 'General Prayers' },
  };
  const d = {
    search: async (layer, { filters = {} }) => ({ passages: filters.documentId != null ? [] : Object.values(P).filter((p) => p.religion === filters.tradition) }),
    findDocuments: async () => ({ docs: [] }), paragraphsInRange: async () => [],
  };
  it('the Bahá’í prayer carrying the name comes first; the other first hit is only "first for the name"', async () => {
    const r = await findPrayers({ name: 'Remover of Difficulties', traditions: ['Christian', "Baha'i"] }, d);
    expect(r.candidates[0].document_id).toBe(20762);
    expect(r.candidates[0].signals).toContain('named');
    const c = r.candidates.find((x) => x.document_id === 19757);
    if (c) expect(c.signals).not.toContain('named');
  });
});

// Live 11-12: the name's words were searched inside the prayer works by phrase meaning only — ¶65 never surfaced among twelve other prayers
describe('findPrayers: a name is also searched literally inside the prayer works', () => {
  it('a named prayer → a literal search with the works\' documentId list beside the phrase one', async () => {
    const calls = [];
    const d = { search: async (layer, { query, filters = {} }) => { calls.push({ layer, query, documentId: filters.documentId }); return { passages: [] }; },
      findDocuments: async () => ({ docs: WORKS }), paragraphsInRange: async () => [] };
    await findPrayers({ tradition: 'Christian', name: 'Remover of Difficulties' }, d);
    const inWorks = calls.filter((c) => c.documentId != null);
    expect(inWorks.map((c) => c.layer).sort()).toEqual(['literal_search', 'phrase_search']);
    expect(inWorks.every((c) => c.query === 'Remover of Difficulties')).toBe(true);
  });
});

describe('findPrayers in one tradition: a text carrying the name outranks a first hit that does not', () => {
  it('¶65 (the name) before ¶71 (top of the phrase search, "Remover of every anguish")', async () => {
    const p71 = { document_id: 20762, paragraph_index: 71, religion: "Baha'i", text: 'O Lord! Thou art the Remover of every anguish and the Dispeller of every affliction.' };
    const p65 = { document_id: 20762, paragraph_index: 65, religion: "Baha'i", text: 'Is there any Remover of difficulties save God? Say: Praised be God! He is God!' };
    const d = { search: async (layer, { filters = {} }) => ({ passages: filters.documentId == null ? [] : layer === 'phrase_search' ? [p71, p65] : [p65, p71] }),
      findDocuments: async () => ({ docs: [{ id: 20762, title: 'Bahá’í Prayers', religion: "Baha'i" }] }), paragraphsInRange: async () => [] };
    const r = await findPrayers({ tradition: "Baha'i", name: 'Remover of Difficulties' }, d);
    expect(r.candidates[0].paragraph_index).toBe(65);
    expect(r.candidates.find((c) => c.paragraph_index === 71).signals).not.toContain('first for the name');
  });
});
