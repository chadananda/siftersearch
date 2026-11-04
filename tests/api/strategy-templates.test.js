// Phase 1 (strategy graph): the writer instructions moved from code to template rows render EXACTLY what the code produced
// (oracle: tests/api/fixtures/strategy-templates-legacy.js, the functions copied verbatim before the move).
import { describe, it, expect } from 'vitest';
import * as OLD from './fixtures/strategy-templates-legacy.js';
import { COMPARISON_HOW, UNDERSTANDING_HOW } from '../../api/lib/assistant/strategies.js';
import { REFERENCE_HOW } from '../../api/lib/assistant/scripture-ref.js';
import { PRAYER_HOW } from '../../api/lib/assistant/prayer-shelf.js';
import { GUIDANCE_HOW } from '../../api/lib/assistant/guidance.js';
import { referenceHow } from '../../api/lib/assistant/lookup.js';
import { fill } from '../../api/lib/assistant/activities/templates.js';
import { strategyOptions, STRATEGIES } from '../../api/lib/assistant/strategy-choice.js';

describe('strategy templates render exactly the old code text', () => {
  it('comparison', () => {
    const covs = [{}, { Islam: 'covered' }, { Islam: 'missing', Hindu: 'thin' }, { A: 'missing', B: 'missing', C: 'thin', D: 'thin', E: 'covered' }];
    for (const sides of [[], ['Islam', 'Hindu'], ['Bahá’í Faith']]) for (const c of covs) expect(COMPARISON_HOW(sides, c)).toBe(OLD.COMPARISON_HOW(sides, c));
  });
  it('understanding', () => {
    for (const r of [null, '', 'Buddhism']) for (const c of ['covered', 'thin', 'missing', undefined]) expect(UNDERSTANDING_HOW(r, c)).toBe(OLD.UNDERSTANDING_HOW(r, c));
  });
  it('scripture reference', () => {
    for (const whole of [true, false, undefined]) for (const exact of [true, false]) {
      expect(REFERENCE_HOW({ label: 'John 3:16', whole }, exact)).toBe(OLD.REFERENCE_HOW({ label: 'John 3:16', whole }, exact));
    }
  });
  it('prayer', () => { for (const o of [null, '', 'healing', 'the departed']) expect(PRAYER_HOW(o)).toBe(OLD.PRAYER_HOW(o)); });
  it('guidance', () => { for (const d of [[], ['2020-01-01'], ['2020-01-01', '2019']]) expect(GUIDANCE_HOW(d)).toBe(OLD.GUIDANCE_HOW(d)); });
  it('numbered-passage lookup', () => {
    const rs = [null, {}, { label: 'Hidden Words 3' }, { work: { doc: { title: 'X' } }, ref: { num: 4 } },
      { label: 'Gleanings 5', exact: false, approx: { unit: 'verse', chapter: 3 } }, { exact: false, approx: { unit: 'verse' } }, { exact: false }, { exact: true, approx: { unit: 'v', chapter: 1 } }];
    for (const r of rs) expect(referenceHow(r)).toBe(OLD.referenceHow(r));
  });
  it("Jev's strategy options = the rows, same keys, same order, same words", () => {
    expect(strategyOptions()).toEqual(OLD.STRATEGIES);
    expect(Object.keys(strategyOptions())).toEqual(Object.keys(OLD.STRATEGIES));
    expect(Object.keys(STRATEGIES)).toEqual(Object.keys(OLD.STRATEGIES));
    expect({ ...STRATEGIES }).toEqual(OLD.STRATEGIES);
  });
  it('fill: one pass, $ safe, slot values never re-expanded', () => {
    expect(fill('a {{x}} b {{y}}', { x: '$& {{y}}' })).toBe('a $& {{y}} b ');
    expect(fill('{{n}}', { n: undefined })).toBe('undefined');
  });
});
