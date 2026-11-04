// Claims layer latency (11-03 contract, CLAIMS_BUDGETS): peopleSearch runs bioSearch ∥ entitySearch, reads the group
// dossier once, fetches missing dossiers in parallel, caches results and reports per-stage timings; judge:false reaches
// bioSearch. Before: everything serial and bioSearch's Haiku judge 5-12 s, so planned search dropped every judged answer.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const log = [];
const GROUP = { best: { id: 900, ov: 2, name: 'Letters of the Living', summary: '' }, memberIds: [1, 2, 3], bareGroup: false };
let groupResult = GROUP, bioIds = [1, 2, 3, 4, 5];

vi.mock('../../api/lib/bio.js', () => ({
  bioGroup: vi.fn(async () => { log.push('group'); return groupResult; }),
  bioSearch: vi.fn(async (q, opts) => { log.push(`bio:start:${opts?.judge}`); await sleep(60); log.push('bio:end');
    return { ids: bioIds, q, ...(groupResult.best ? { group: groupResult.best.id } : {}), reasoning: { summary: '', evidence: {} } }; }),
}));
vi.mock('../../api/lib/entity-api.js', () => ({
  foldText: (t) => String(t || '').toLowerCase(),
  searchTerms: (q) => String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !['who', 'the', 'were'].includes(t)),
  entitySearch: vi.fn(async (q) => { log.push(`entity:start:${q}`); await sleep(60); log.push('entity:end');
    return { results: [{ id: 1, name: 'One', score: 2, evidence: [{ relation: 'participated-in', statement: 'One participated in Badasht' }] }] }; }),
  entityDossier: vi.fn(async (id) => { log.push(`dossier:${id}`); await sleep(50);
    return id === 900 ? { id: 900, name: 'Letters of the Living', participants: [1, 2, 3, 4, 5].map((x) => ({ id: x })) }
      : { id, name: `P${id}`, importance: 1, claims: [{ statement: `P${id} claim` }] }; }),
}));

const { peopleSearch, _resetPeopleCache } = await import('../../api/lib/people-search.js');
const bio = await import('../../api/lib/bio.js');
const ent = await import('../../api/lib/entity-api.js');

beforeEach(() => { log.length = 0; _resetPeopleCache(); vi.clearAllMocks(); groupResult = GROUP; bioIds = [1, 2, 3, 4, 5]; });

describe('peopleSearch latency', () => {
  it('runs bioSearch and entitySearch side by side, and passes judge through', async () => {
    const t = performance.now();
    const r = await peopleSearch('Letters of the Living who went to Badasht', { judge: false });
    const ms = performance.now() - t;
    expect(log.indexOf('entity:start:went badasht')).toBeLessThan(log.indexOf('bio:end'));
    expect(log).toContain('bio:start:false');
    // serial was bio 60 + entity 60 + dossiers 4×50 + group dossier 2×50 ≈ 420 ms
    expect(ms).toBeLessThan(250);
    expect(r.people.map((p) => p.id).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const k of ['group', 'bio', 'entity', 'dossiers', 'total']) expect(typeof r.timings[k]).toBe('number');
  });

  it('reads the group dossier once and fetches missing dossiers in parallel', async () => {
    await peopleSearch('Letters of the Living who went to Badasht', { judge: false });
    expect(ent.entityDossier.mock.calls.filter(([id]) => id === 900)).toHaveLength(1);
    const r2 = await peopleSearch('Letters of the Living who rode to Badasht', { judge: false });
    expect(r2.timings.dossiers).toBeLessThan(120);   // 4 dossiers × 50 ms, in parallel
  });

  it('caches per (query, judge): a repeat is answered without searching again', async () => {
    await peopleSearch('Who were the Letters of the Living', { judge: false });
    const r = await peopleSearch('who were the letters of the living ', { judge: false });
    expect(bio.bioSearch).toHaveBeenCalledTimes(1);
    expect(r.timings.cached).toBe(true);
    await peopleSearch('Who were the Letters of the Living', { judge: true });
    expect(bio.bioSearch).toHaveBeenCalledTimes(2);
  });

  it('re-searches the whole query when bioSearch answered without the group (bare-name path)', async () => {
    bio.bioSearch.mockImplementationOnce(async (q) => ({ ids: [1], q, reasoning: { summary: '', evidence: {} } }));
    await peopleSearch('Letters of the Living who went to Badasht', { judge: false });
    expect(ent.entitySearch.mock.calls.map((c) => c[0])).toEqual(['went badasht', 'Letters of the Living who went to Badasht']);
  });
});
