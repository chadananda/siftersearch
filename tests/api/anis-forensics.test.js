// Forensic pass (api/lib/audit/forensics.js): the 11-03 quote case ("Religion is the greatest of all means…") is the
// definition of forensic — the exact defects, each owned by its stage — plus the class rules on their own and the queue.
import { describe, it, expect } from 'vitest';
import { forensicPass, assessSearch, copyClass, forensicQueue, forensicTable, defectLines, routeOf, owesWritingsPass, owedClasses, NEEDS_WRITINGS } from '../../api/lib/audit/forensics.js';
import { NEEDS_WRITINGS as PASS_ROUTES, WRITINGS_TOOL } from '../../api/lib/search/writings-pass.js';

import { CASE_1103, Q } from '../fixtures/anis-case-1103.js';

describe('forensics: the 11-03 quote case', () => {
  const f = forensicPass(CASE_1103);
  it('names exactly the defects a good assessment names, each with its stage', () => {
    expect(f.defects.map((d) => `${d.stage} ${d.class}`)).toEqual([
      'STRATEGY no-originals-search', 'RANK authority-inversion', 'SELECTION cited-weaker-copy', 'WRITER process-talk', 'LATENCY stage-over-budget',
    ]);
  });
  it('the selection defect: best copy = the SE translation (ESW, #9), cited = the periodical (#1)', () => {
    const d = f.defects.find((x) => x.class === 'cited-weaker-copy');
    expect(d.evidence.best).toMatchObject({ rank: 9, title: 'Epistle to the Son of the Wolf', class: 'se-translation' });
    expect(d.evidence.cited).toMatchObject({ rank: 1, title: 'The Bahá’í World, Volume II', class: 'secondary' });
  });
  it('the rank defect: the periodical (#1) outranks the Writing (#9)', () => {
    const d = f.defects.find((x) => x.class === 'authority-inversion');
    expect(d.detail).toMatch(/secondary The Bahá’í World, Volume II \(hit #1\) outranks the se-translation Epistle to the Son of the Wolf \(hit #9\)/);
  });
  it('the stage cost: hydrate 3.3 s against its budget', () => {
    expect(f.defects.find((x) => x.stage === 'LATENCY').detail).toBe('hydrate 3.3 s (budget 60 ms)');
  });
  it('every defect names where it is fixed; the search carries its own verdict', () => {
    expect(f.defects.every((d) => d.fix_where)).toBe(true);
    expect(f.searches).toHaveLength(1);
    expect(f.searches[0]).toMatchObject({ trace_id: 't-1103', verdict: 'defect' });
    expect(defectLines(f)[0]).toMatch(/^STRATEGY no-originals-search: quote route ran no original-language/);
  });
});

describe('forensics: class rules', () => {
  it('copy classes follow the source order', () => {
    expect(copyClass({ title: 'Epistle to the Son of the Wolf', author: 'Bahá’u’lláh' })).toBe('se-translation');
    expect(copyClass({ title: 'Tablets of Bahá’u’lláh', author: 'Bahá’u’lláh' })).toBe('compilation');
    expect(copyClass({ title: 'Star of the West, vol 4', author: '‘Abdu’l-Bahá' })).toBe('secondary');
    expect(copyClass({ title: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi' })).toBe('quoted-authoritative');
    expect(copyClass({ title: 'Paris Talks', author: '‘Abdu’l-Bahá' })).toBe('reported');
  });
  it('a search that recovered: the reply cited the Tablet, the search still ranked it below a periodical', () => {
    const f = forensicPass({ ...CASE_1103, cited: [{ doc_id: 109, title: 'Epistle to the Son of the Wolf' }], reply: 'From the [Epistle to the Son of the Wolf](https://x/esw).',
      searches: [{ ...CASE_1103.searches[0], timings: {} }, { trace_id: 't2', tool: 'originals_search', query: Q, filters: { language: 'fa' }, hits: [] }] });
    expect(f.defects.map((d) => d.class)).toEqual(['zero-hits', 'authority-inversion']);
    expect(f.searches.map((s) => s.verdict)).toEqual(['defect', 'defect']);
  });
  it('a teachings route with no Writings pass, a clipped quote, a bare link and an offered search', () => {
    const f = forensicPass({ route: 'teachings', question: 'What do the Writings say about gossip?',
      reply: 'He wrote: “Backbiting quencheth the light of the heart and extinguisheth…” See https://oceanlibrary.com/x. If you like, I can search the tablets for more.',
      searches: [{ trace_id: 'a', tool: 'fused_search', query: 'gossip', filters: {}, hits: [{ rank: 1, doc_id: 1, title: 'Gleanings', author: 'Bahá’u’lláh' }] }],
      cited: [{ doc_id: 1, title: 'Gleanings' }] });
    expect(f.defects.map((d) => `${d.stage} ${d.class}`)).toEqual(['STRATEGY no-originals-search', 'STRATEGY no-writings-pass', 'WRITER clipped-quote', 'WRITER bare-link', 'WRITER search-offer']);
  });
  it('nothing authoritative: a library gap unless the Writings replay finds one held', () => {
    const base = { route: 'quote', question: 'some saying', reply: 'x', cited: [],
      searches: [{ trace_id: 'b', tool: 'quote_search', filters: { language: 'fa' }, query: 'some saying', hits: [{ rank: 1, doc_id: 5, title: 'A Study', author: 'Some Scholar' }] }] };
    expect(forensicPass(base).defects.map((d) => d.class)).toEqual(['no-authoritative-copy']);
    expect(forensicPass({ ...base, replay: { hits: [{ rank: 1, doc_id: 9, title: 'Gleanings', author: 'Bahá’u’lláh' }] } }).defects.map((d) => `${d.stage} ${d.class}`))
      .toEqual(['RETRIEVAL best-copy-missed']);
  });
  it('a clean reply has no defects', () => {
    const f = forensicPass({ route: 'fact', question: 'When did X happen?', reply: 'In 1863, in the [Garden of Riḍván](https://x/r).',
      searches: [{ trace_id: 'c', tool: 'fused_search', hits: [{ rank: 1, doc_id: 1, title: 'God Passes By', author: 'Shoghi Effendi' }], timings: { total: 400 } }] });
    expect(f.defects).toEqual([]);
    expect(assessSearch({ tool: 'x', hits: [{ title: 'y' }], timings: { total: 400 } }).verdict).toBe('ok');
    expect(routeOf('answer(quote)')).toBe('quote');
  });
});

describe('forensics: the Writings pass is owed only on a Jev route that needs it (spec #1)', () => {
  const search = (tool) => ({ trace_id: 'w', tool, query: 'forgiveness', filters: {}, hits: [{ rank: 1, doc_id: 3, title: 'Some Essay', author: 'A Scholar' }] });
  it('one set, shared with the pass itself', () => {
    expect(NEEDS_WRITINGS).toBe(PASS_ROUTES);
  });
  it('a search with no route (the search page) is never flagged', () => {
    const f = forensicPass({ route: null, question: 'forgiveness', reply: '', searches: [search('multi-index')] });
    expect(f.defects.map((d) => d.class)).not.toContain('no-writings-pass');
    expect(owesWritingsPass(null)).toBe(false);
    expect(owesWritingsPass('planned:topic')).toBe(true);
    expect(owesWritingsPass('fact')).toBe(false);
  });
  it('a topic route without the pass is flagged; with the planned:writings pass it is not', () => {
    const owed = forensicPass({ route: 'topic', question: 'forgiveness', reply: '', searches: [search('planned:topic')] });
    expect(owed.defects.map((d) => d.class)).toContain('no-writings-pass');
    const ran = forensicPass({ route: 'topic', question: 'forgiveness', reply: '', searches: [search('planned:topic'), search(WRITINGS_TOOL)] });
    expect(ran.defects.map((d) => d.class)).not.toContain('no-writings-pass');
  });
  it("the judge's no-writings-pass is dropped where the item's route owes none", () => {
    expect(owedClasses(['no-writings-pass', 'writings-buried'], null)).toEqual(['writings-buried']);
    expect(owedClasses(['no-writings-pass'], 'lookup')).toEqual([]);
    expect(owedClasses(['no-writings-pass'], 'topic')).toEqual(['no-writings-pass']);
  });
});

describe('forensics: the work queue', () => {
  const f = forensicPass(CASE_1103);
  it('groups stage × class with counts, trend and examples', () => {
    const q = forensicQueue([{ message_id: 7, session_id: 's1', f }, { message_id: 8, session_id: 's2', f }], [{ message_id: 1, session_id: 's0', f: { defects: f.defects.slice(0, 1) } }]);
    const strat = q.queue.find((e) => e.class === 'no-originals-search');
    expect(strat).toMatchObject({ stage: 'STRATEGY', n: 2, prev: 1, trend: 1 });
    expect(strat.examples.map((x) => x.message_id)).toEqual([7, 8]);
    expect(q.searches_with_defects).toBe(2);
    expect(forensicQueue([{ message_id: 7, f }], [], { stage: 'latency' }).queue.map((e) => e.class)).toEqual(['stage-over-budget']);
    expect(forensicTable(q)).toMatch(/STRATEGY\s+no-originals-search\s+2\s+1\s+\+1/);
  });
});
