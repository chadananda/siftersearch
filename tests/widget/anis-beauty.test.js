// P4 beauty helpers: markdown line kinds (headings, ordered items), thinking-sky depth/size/link shading, welcome cards.
import { describe, it, expect } from 'vitest';
import { headingOf, olItem } from '../../src/widget/rich-line.js';
import { thinkDepth, skyNodes, linkAlpha } from '../../src/widget/think.js';
import { ANIS_WELCOME } from '../../src/lib/anis-samples.js';

describe('headingOf', () => {
  it('reads ## headings and bold-only lines', () => {
    expect(headingOf('## Justice in the Hidden Words')).toBe('Justice in the Hidden Words');
    expect(headingOf('### What it asks ###')).toBe('What it asks');
    expect(headingOf('**Sources:**')).toBe('Sources');
    expect(headingOf('#hashtag')).toBeNull();
    expect(headingOf('Some **bold** text')).toBeNull();
    expect(headingOf('')).toBeNull();
  });
});
describe('olItem', () => {
  it('reads numbered items, not years or numbers in prose', () => {
    expect(olItem('1. Independent investigation')).toEqual({ n: 1, text: 'Independent investigation' });
    expect(olItem('  12) Twelve')).toEqual({ n: 12, text: 'Twelve' });
    expect(olItem('1844. The year')).toBeNull();
    expect(olItem('In 1844 the Báb')).toBeNull();
    expect(olItem('3.')).toBeNull();
  });
});
describe('thinking sky', () => {
  it('depth starts at 0, grows with each step, never reaches 1', () => {
    expect(thinkDepth(0)).toBe(0);
    expect(thinkDepth(-2)).toBe(0);
    expect(thinkDepth(1)).toBeGreaterThan(0.2);
    expect(thinkDepth(4)).toBeGreaterThan(thinkDepth(2));
    expect(thinkDepth(40)).toBeLessThan(1);
  });
  it('more stars when deeper, scaled to the area within bounds', () => {
    expect(skyNodes(0)).toBe(14);
    expect(skyNodes(1)).toBe(38);
    expect(skyNodes(0.5, 0.1)).toBe(Math.round(26 * 0.5));
    expect(skyNodes(1, 10)).toBe(Math.round(38 * 1.6));
  });
  it('links fade with distance and deepen with depth', () => {
    expect(linkAlpha(200, 150, 1)).toBe(0);
    expect(linkAlpha(0, 150, 0)).toBeCloseTo(0.1);
    expect(linkAlpha(0, 150, 1)).toBeCloseTo(0.38);
    expect(linkAlpha(75, 150, 1)).toBeCloseTo(0.19);
    expect(linkAlpha(10, 0, 1)).toBe(0);
  });
});
describe('ANIS_WELCOME', () => {
  it('four example questions, one per kind, fixed text', () => {
    expect(ANIS_WELCOME.map((c) => c.kind)).toEqual(['Passage', 'Book', 'Talk', 'Comparison']);
    for (const c of ANIS_WELCOME) { expect(c.q.length).toBeGreaterThan(10); expect(c.q.length).toBeLessThan(80); expect(c.icon).toBeTruthy(); }
  });
});
