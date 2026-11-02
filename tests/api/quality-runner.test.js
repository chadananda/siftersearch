// Pure scoring/sampling tests for tests/quality/run.mjs. No network.
import { describe, it, expect } from 'vitest';
import { scoreQuestion, stratifiedSample, expandWordings, normHits, religionMatches, fold, summarize } from '../quality/run.mjs';
const h = (docId, religion, text = '', hype = null) => ({ docId, religion, text, hype });
describe('scoreQuestion', () => {
  it('docs: rank and max_rank', () => {
    const q = { expect: { docs: [5] }, traditions: [], scope: 'universal' };
    expect(scoreQuestion(q, [h(1), h(5)])).toMatchObject({ pass: true, rank: 2 });
    expect(scoreQuestion({ ...q, expect: { docs: [5], max_rank: 1 } }, [h(1), h(5)])).toMatchObject({ pass: false, rank: 2 });
    expect(scoreQuestion(q, [h(1)])).toMatchObject({ pass: false, rank: null });
    expect(scoreQuestion(q, [...Array(10).fill(h(1)), h(5)]).pass).toBe(false);
  });
  it('text_contains is accent/case folded', () => {
    const q = { expect: { text_contains: ['Báb'] }, traditions: [], scope: 'universal' };
    expect(scoreQuestion(q, [h(1, 'x', 'the BAB said')]).pass).toBe(true);
    expect(scoreQuestion(q, [h(1, 'x', 'nothing')]).pass).toBe(false);
  });
  it('tradition check', () => {
    const q = { expect: {}, traditions: ['bahai'], scope: 'tradition' };
    expect(scoreQuestion(q, [h(1, 'Islam'), h(2, "Baha'i")])).toMatchObject({ pass: true, rank: 2 });
    expect(scoreQuestion(q, [h(1, 'Islam')]).pass).toBe(false);
  });
  it('cross needs every side', () => {
    const q = { expect: {}, traditions: ['islam', 'christianity'], scope: 'cross' };
    expect(scoreQuestion(q, [h(1, 'Islam'), h(2, 'Christian')])).toMatchObject({ pass: true, sides: { islam: 1, christianity: 2 } });
    expect(scoreQuestion(q, [h(1, 'Islam')])).toMatchObject({ pass: false, sides: { islam: 1, christianity: null } });
  });
  it('universal without terms: any result, labelled the weak kind', () => {
    expect(scoreQuestion({ expect: {}, traditions: [], scope: 'universal' }, [h(1)])).toMatchObject({ pass: true, kind: 'any' });
    expect(scoreQuestion({ expect: {}, traditions: [], scope: 'universal' }, []).pass).toBe(false);
  });
  it('topic terms: an on-topic hit in the top 5, a stem only at a word start', () => {
    const q = { expect: {}, traditions: [], scope: 'universal' }, topicTerms = ['death', 'afterl', 'soul'];
    expect(scoreQuestion(q, [h(1, 'x', 'on prayer'), h(2, 'x', 'The Afterlife of the soul')], { topicTerms })).toMatchObject({ pass: true, rank: 2, kind: 'topic' });
    expect(scoreQuestion(q, [h(1, 'x', 'consoul unrelated')], { topicTerms }).pass).toBe(false);
    expect(scoreQuestion(q, [...Array(5).fill(h(1, 'x', 'nothing')), h(2, 'x', 'death')], { topicTerms }).pass).toBe(false);
  });
  it('topic terms gate tradition and cross sides too', () => {
    const topicTerms = ['fast'];
    const t = { expect: {}, traditions: ['islam'], scope: 'tradition' };
    expect(scoreQuestion(t, [h(1, 'Islam', 'on charity'), h(2, 'Islam', 'Fasting in Ramadan')], { topicTerms })).toMatchObject({ pass: true, rank: 2 });
    const c = { expect: {}, traditions: ['islam', 'christianity'], scope: 'cross' };
    expect(scoreQuestion(c, [h(1, 'Islam', 'fasting'), h(2, 'Christian', 'grace')], { topicTerms })).toMatchObject({ pass: false, sides: { islam: 1, christianity: null } });
  });
});
describe('helpers', () => {
  it('religion mapping', () => { expect(religionMatches("Baha'i", 'bahai')).toBe(true); expect(religionMatches('Tao', 'taoism')).toBe(true); expect(religionMatches('Hindu', 'jainism')).toBe(false); expect(fold('Báb’s')).toBe('babs'); });
  it('hype layer keeps only hype-ranked hits in rank order', () => {
    const raw = [{ doc_id: 1, _layerRanks: { qhype: null } }, { doc_id: 2, _layerRanks: { qhype: 5 } }, { doc_id: 3, _layerRanks: { qhype: 2 } }];
    expect(normHits(raw, 'hype').map((x) => x.docId)).toEqual([3, 2]);
    expect(normHits(raw, 'search')).toHaveLength(3);
  });
  it('sample is deterministic, stratified, sized', () => {
    const qs = Array.from({ length: 100 }, (_, i) => ({ id: String(i), origin: i % 2 ? 'seo' : 'survey', family: `f${i % 5}` }));
    const a = stratifiedSample(qs, 10, 7), b = stratifiedSample(qs, 10, 7);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id)); expect(a).toHaveLength(10);
    expect(new Set(a.map((q) => `${q.origin}|${q.family}`)).size).toBe(10);
    expect(stratifiedSample(qs, 0)).toHaveLength(100);
  });
  it('wordings inherit expect', () => {
    const out = expandWordings([{ id: 'a', text: 't', expect: { docs: [1] }, wordings: [{ id: 'w1', text: 'v' }] }]);
    expect(out).toHaveLength(2); expect(out[1]).toMatchObject({ id: 'a#w1', text: 'v', parent: 'a', expect: { docs: [1] } });
  });
  it('summarize counts cross sides', () => {
    const s = summarize([{ pass: false, family: 'f', origin: 'seo', traditions: ['islam', 'judaism'], sides: { islam: 1, judaism: null }, ms: 10 }, { pass: true, family: 'f', origin: 'seo', traditions: [], ms: 30 }]);
    expect(s).toMatchObject({ total: 2, pass: 1, crossTotal: 1, crossAll: 0, crossSides: { islam: { n: 1, pass: 1 }, judaism: { n: 1, pass: 0 } } });
  });
});
