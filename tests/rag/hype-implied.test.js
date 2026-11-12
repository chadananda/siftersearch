// IMPLIED questions folded into HyPE (Chad 11-12): prompt rules, parser, free proof check, stored format, index units, search hit mapping.
import { describe, it, expect, vi } from 'vitest';
import { buildSystem, parseHype, parseHypeSlice, spanPresent, MAX_IMPLIED } from '../../api/lib/rag/enrich/retrieval.js';
import { parseStoredHypItems, parseStoredHypQuestions, hypeUnitSpecs, impliedItemAt, IMPLIED_K0 } from '../../api/lib/search/hype.js';
import { statedHypQuestions } from '../../api/lib/pipeline/hype-ledger.js';
import { makeRag } from './kit.js';

const TEXT = 'Whoso hath a child as yet unborn, let him be given a double portion of the inheritance. The soul of man is a sign of God, a heavenly gem.';
const para = (id) => ({ id, pid: `p${id}`, pidx: id, text: TEXT, heading: 'Ch1', context: '', hypModel: null });
const seed = { docs: { 1: { id: 1, title: 'The Test Book', author: 'A' } }, paras: { 1: [para(1)] }, samples: { 1: TEXT } };
const imp = (o = {}) => ({ q: 'Do the unborn have rights?', premise: 'The child as yet unborn already holds a share of the inheritance.', implies: 'moral status of the unborn', proof: 'a child as yet unborn', ...o });
const reply = (implied) => JSON.stringify({ seeker: [], questions: [{ q: 'What is the soul?', a: 'a sign of God' }], deep: [], implied, thesis: 'The soul is a sign of God.' });

describe('the HyPE prompt carries the implied-question rules', () => {
  const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'The Test Book' });
  it('names the field, the empty-by-default rule, the proof check and the JSON spec', () => {
    expect(sys).toMatch(/"implied": 0-2 IMPLIED questions/);
    expect(sys).toMatch(/The normal answer is an EMPTY list/);
    expect(sys).toMatch(/proof" must be words copied EXACTLY from the PARAGRAPH/);
    expect(sys).toMatch(/"implied":\[\{"q":"…\?","premise":"…","implies":"…","proof":"verbatim words","concept":"[^"]*"\}\]/);
  });
  it('carries the premise-pilot rules: a-fortiori implications, station, nature as potential, own terms, modern-assumption questions', () => {
    expect(sys).toMatch(/if a lesser right is granted, the greater is implied/);
    expect(sys).toMatch(/Manifestation of God founding a new religion/);
    expect(sys).toMatch(/never reduce Him to "a religious authority"/);
    expect(sys).toMatch(/inherent in every person as a POTENTIAL/);
    expect(sys).toMatch(/passage's OWN TERMS/);
    expect(sys).toMatch(/CHALLENGE A MODERN ASSUMPTION AT ITS ROOT/);
    expect(sys).toMatch(/What is the purpose of charity\?/);
    expect(sys).toMatch(/What is the source of social order\?/);
  });
});

describe('parseHype reads the implied field', () => {
  it('returns trimmed implied items, capped, dropping those without question or proof; a reply without the field has an empty list', () => {
    const p = parseHype(reply([imp(), imp({ q: 'Do rights come from the state?' }), imp({ q: 'third?' }), { q: 'no proof?', proof: '' }]));
    expect(p.implied.map((x) => x.q)).toEqual(['Do the unborn have rights?', 'Do rights come from the state?']);
    expect(p.implied).toHaveLength(MAX_IMPLIED);
    expect(parseHype('{"questions":[{"q":"a?","a":"b"}],"thesis":"x"}').implied).toEqual([]);
    expect(parseHypeSlice(reply([imp()])).implied).toHaveLength(1);
  });
});

describe('the free proof check', () => {
  it('spanPresent tolerates quote marks and joined phrases; missing words are false', () => {
    expect(spanPresent('a child as yet unborn', [TEXT])).toBe(true);
    expect(spanPresent('a child as yet unborn ... a double portion of the inheritance', [TEXT])).toBe(true);
    expect(spanPresent('a child not yet conceived by anyone', [TEXT])).toBe(false);
  });
  it('settle stores proven implied items beside the stated ones and drops unproven or faulty ones', async () => {
    const { rag, store } = makeRag({ seed });
    const r = await rag.retrieval.settle(1, [{ id: 1, replies: [reply([imp(), imp({ q: 'Is God just?', proof: 'words that are nowhere in the paragraph' })])] }]);
    expect(r.written).toBe(1);
    expect(store.hyped[0].questions).toEqual(['What is the soul?', { q: 'Do the unborn have rights?', implied: true, premise: imp().premise, implies: imp().implies, proof: imp().proof }]);
    expect(r.stats).toMatchObject({ implied: 1, impliedUnproven: 1 });
    const again = makeRag({ seed });
    const r2 = await again.rag.retrieval.settle(1, [{ id: 1, replies: [reply([imp({ q: 'What does this passage imply?' }), imp({ q: 'Is it a sign?' })])] }]);
    expect(r2.stats).toMatchObject({ implied: 1, impliedFault: 1 });
  });
  it('a stated-only reply is stored exactly as before (plain strings)', async () => {
    const { rag, store } = makeRag({ seed });
    await rag.retrieval.settle(1, [{ id: 1, replies: [reply([])] }]);
    expect(store.hyped[0].questions).toEqual(['What is the soul?']);
  });
  it('a sliced paragraph pools the implied items of every slice', async () => {
    const { rag, store } = makeRag({ seed });
    await rag.retrieval.settle(1, [{ id: 1, replies: [reply([imp()]), reply([imp({ q: 'Do rights come from the state?', proof: 'double portion of the inheritance' })])] }]);
    expect(store.hyped[0].questions.filter((q) => q.implied).map((q) => q.q)).toEqual(['Do the unborn have rights?', 'Do rights come from the state?']);
  });
});

describe('stored format, index units, search hit mapping', () => {
  const stored = JSON.stringify(['What is the soul?', { q: 'What is the purpose of charity?', a: 'x', seeker: true }, imp({ implied: true }), imp({ q: 'Do rights come from the state?', implied: true })]);
  it('parseStoredHypItems keeps full items; parseStoredHypQuestions still returns every question string; a pre-implied row is unchanged', () => {
    expect(parseStoredHypItems(stored).filter((i) => i.implied)).toHaveLength(2);
    expect(parseStoredHypQuestions(stored)).toEqual(['What is the soul?', 'What is the purpose of charity?', 'Do the unborn have rights?', 'Do rights come from the state?']);
    expect(parseStoredHypItems('["a?","b?"]')).toEqual([{ q: 'a?' }, { q: 'b?' }]);
    expect(parseStoredHypQuestions('a?\nb?')).toEqual(['a?', 'b?']);
    expect(hypeUnitSpecs('["a?","b?"]', 'T')).toEqual([{ k: 0, text: 'a?' }, { k: 1, text: 'b?' }, { k: 999, text: 'T' }]);
  });
  it('index units: stated k 0.., implied k 900.., thesis 999', () => {
    expect(hypeUnitSpecs(stored, 'Thesis.')).toEqual([{ k: 0, text: 'What is the soul?' }, { k: 1, text: 'What is the purpose of charity?' },
      { k: IMPLIED_K0, text: 'Do the unborn have rights?' }, { k: IMPLIED_K0 + 1, text: 'Do rights come from the state?' }, { k: 999, text: 'Thesis.' }]);
  });
  it('a hit k maps back to the implied item (premise/implies/proof); a stated or thesis k maps to nothing', () => {
    expect(impliedItemAt(stored, IMPLIED_K0 + 1)).toMatchObject({ question: 'Do rights come from the state?', premise: imp().premise, implies: imp().implies, proof: imp().proof });
    expect(impliedItemAt(stored, 0)).toBeNull();
    expect(impliedItemAt(stored, 999)).toBeNull();
    expect(impliedItemAt(stored, IMPLIED_K0 + 5)).toBeNull();
  });
  it('graders and the ledger see only the stated questions', () => {
    expect(statedHypQuestions(JSON.parse(stored))).toEqual(['What is the soul?', 'What is the purpose of charity?']);
  });
});

describe('search attaches implied_by from the paragraph itself', () => {
  it('paragraphs-repo impliedHypeFor reads hyp_questions by id and maps k', async () => {
    vi.resetModules();
    const rows = [{ id: 21, hyp_questions: JSON.stringify(['q?', imp({ implied: true })]) }, { id: 22, hyp_questions: '["only stated?"]' }];
    vi.doMock('../../api/lib/db.js', () => ({ queryAll: vi.fn(async () => rows), transaction: vi.fn() }));
    const { impliedHypeFor } = await import('../../api/lib/paragraphs-repo.js');
    const m = await impliedHypeFor([{ paragraph_id: 21, k: IMPLIED_K0 }, { paragraph_id: 22, k: 0 }]);
    expect([...m.keys()]).toEqual([21]);
    expect(m.get(21)).toEqual({ question: 'Do the unborn have rights?', premise: imp().premise, implies: imp().implies, proof: imp().proof });
    vi.doUnmock('../../api/lib/db.js');
  });
});
