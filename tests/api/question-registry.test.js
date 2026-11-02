// Question registry: every imported question validates, ids unique, families exist, each source present, cross questions list >=2 traditions.
import { describe, it, expect } from 'vitest';
import { loadQuestions, loadFamilies, validate } from '../quality/questions/registry.mjs';
const qs = loadQuestions(), fams = new Set(loadFamilies().map((f) => f.id));
describe('question registry', () => {
  it('every question validates', () => {
    const bad = qs.map((q) => [q.id, validate(q)]).filter(([, e]) => e.length);
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('ids are unique', () => {
    const seen = new Set(), dup = qs.filter((q) => (seen.has(q.id) ? true : (seen.add(q.id), false))).map((q) => q.id);
    expect(dup.slice(0, 5)).toEqual([]);
  });
  it('every referenced survey family exists, and every family has questions', () => {
    expect([...new Set(qs.filter((q) => q.family && !fams.has(q.family)).map((q) => q.family))]).toEqual([]);
    const used = new Set(qs.map((q) => q.family));
    expect([...fams].filter((f) => !used.has(f))).toEqual([]);
  });
  it('each imported source contributes questions', () => {
    for (const o of ['survey', 'seo', 'seed', 'log', 'regression']) expect(loadQuestions({ origin: o }).length, o).toBeGreaterThan(0);
    for (const f of ['ocean-fixtures.json', 'search-fixtures.json', 'search-type-fixtures.json', 'crosslingual-fixtures.json', 'anis-wording-fixtures.json', 'routing-fixtures.json',
      'bio-search-fixtures.json', 'library-fixtures.json', 'concept-senses.fixtures.json', 'answer-decisions.json', 'seeker-battery.json', 'question-survey-interfaith-20261102.json'])
      expect(qs.filter((q) => q.legacy?.file.endsWith(f)).length, f).toBeGreaterThan(0);
  });
  it('cross-scope questions list at least 2 traditions; frozen reformulations attached', () => {
    expect(loadQuestions({ scope: 'cross' }).every((q) => q.traditions.length >= 2)).toBe(true);
    expect(qs.reduce((n, q) => n + q.wordings.length, 0)).toBeGreaterThan(3000);
  });
});
