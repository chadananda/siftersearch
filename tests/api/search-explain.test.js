// The trace exists so a search can be dissected after the fact. Its own failure modes matter: if tracing can
// throw, it will throw on the pathological query you most need to understand; if it only records outcomes,
// it cannot tell you WHY a branch was taken, which is what made the justice miss opaque.
import { describe, it, expect } from 'vitest';
import { createSearchExplain, nullExplain } from '../../api/lib/search-explain.js';

describe('createSearchExplain', () => {
  it('records a decision WITH its reason and inputs — a bare verdict is what we had before', () => {
    const e = createSearchExplain('where is justice defined?');
    e.decide('quoteMiss', false, 'semantic hit at rank 1, confidence high', { confidence: 'high', contained: false });
    const j = e.toJSON();
    expect(j.decisions[0]).toMatchObject({
      name: 'quoteMiss', verdict: false, why: 'semantic hit at rank 1, confidence high',
    });
    expect(j.decisions[0].inputs).toEqual({ confidence: 'high', contained: false });
  });

  it('trims candidates to rank/score/work/head so a trace is readable and small', () => {
    const e = createSearchExplain('q');
    e.candidates([{ _score: 0.87654, title: 'Some Answered Questions', author: '‘Abdu’l-Bahá', text: 'KNOW THAT JUSTICE consists in rendering to each his due. '.repeat(5) }]);
    const top = e.toJSON().steps[0].data.top[0];
    expect(top).toMatchObject({ rank: 1, score: 0.877, title: 'Some Answered Questions' });
    expect(top.head.length).toBeLessThanOrEqual(90);
  });

  it('NEVER throws, whatever it is handed — tracing must not break the request', () => {
    const e = createSearchExplain('q');
    const circular = {}; circular.self = circular;
    expect(() => e.step('weird', { circular })).not.toThrow();
    expect(() => e.candidates(null)).not.toThrow();
    expect(() => e.candidates([null])).not.toThrow();
    expect(() => e.decide('x', true, 'because', null)).not.toThrow();
    expect(() => e.log(null)).not.toThrow();
    expect(() => e.log({ info: () => { throw new Error('logger down'); } })).not.toThrow();
  });

  it('records ordering and timing, so a SLOW stage and a WRONG stage look different', () => {
    const e = createSearchExplain('q');
    e.step('span-extract', { span: 'justice as every man receiving his due' });
    e.step('ladder-rung', { rung: 'phrase', hits: 0 });
    const j = e.toJSON();
    expect(j.steps.map((s) => s.stage)).toEqual(['span-extract', 'ladder-rung']);
    expect(typeof j.total_ms).toBe('number');
  });

  it('nullExplain has the same shape so callers need no null checks', () => {
    const n = nullExplain();
    expect(() => n.step('a').decide('b', true, 'c').candidates([]).log(null)).not.toThrow();
    expect(n.toJSON()).toBeNull();
  });
});
