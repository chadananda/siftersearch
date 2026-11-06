// Pure scorer of the frozen Anís eval set (tests/quality/anis-eval.mjs): forensic class check + expect fields; set shape.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { scoreItem, rollup } from '../quality/anis-eval.mjs';

const set = JSON.parse(readFileSync(new URL('../quality/anis-eval-set.json', import.meta.url), 'utf8'));
const item = (o) => ({ id: 'x-1', class: 'clipped-quote', split: 'tune', question: 'q', expect: {}, ...o });

describe('eval set', () => {
  it('has unique ids, every class half held, fresh shape', () => {
    expect(new Set(set.items.map((i) => i.id)).size).toBe(set.items.length);
    const by = {}; for (const i of set.items) (by[i.class] ||= []).push(i);
    expect(Object.keys(by).length).toBe(13);
    for (const v of Object.values(by)) { expect(v.length).toBe(6); expect(v.filter((i) => i.split === 'held').length).toBe(3); }
  });
});

describe('scoreItem', () => {
  it('fails an error or empty reply', () => {
    expect(scoreItem(item(), { error: 'job failed' }).pass).toBe(false);
    expect(scoreItem(item(), { reply: '  ' }).pass).toBe(false);
  });
  it('clipped-quote class fails on a quote ending in an ellipsis, passes on a whole one', () => {
    const clipped = { reply: 'He wrote: “My first counsel is this: possess a pure, kindly and radiant heart…”', route: 'quote' };
    const whole = { reply: 'He wrote: “Possess a pure, kindly and radiant heart.”', route: 'quote' };
    expect(scoreItem(item(), clipped).pass).toBe(false);
    expect(scoreItem(item(), whole).pass).toBe(true);
  });
  it('checks max_ms, max_words, route, title_like', () => {
    const run = { reply: 'one two three four five', route: 'answer(quote)', ms: 5000 };
    expect(scoreItem(item({ class: 'padded-answer', expect: { max_words: 5 } }), run).pass).toBe(true);
    expect(scoreItem(item({ class: 'padded-answer', expect: { max_words: 4 } }), run).pass).toBe(false);
    expect(scoreItem(item({ class: 'missed-question', expect: { max_ms: 4000 } }), run).pass).toBe(false);
    expect(scoreItem(item({ class: 'missed-question', expect: { route: 'quote' } }), run).pass).toBe(true);
    expect(scoreItem(item({ class: 'missed-question', expect: { title_like: 'hidden words' } }), { reply: 'See [The Hidden Words](https://x/y).' }).pass).toBe(true);
    expect(scoreItem(item({ class: 'missed-question', expect: { title_like: 'hidden words' } }), { reply: 'Something else.' }).pass).toBe(false);
  });
  it('tier_first is unchecked (not failed) when nothing is cited', () => {
    const s = scoreItem(item({ class: 'no-writings-pass', expect: { tier_first: 'writings' } }), { reply: 'A plain answer.', route: 'topic' });
    expect(s.checks.find((c) => c.name === 'tier_first').ok).toBeNull();
  });
});

describe('rollup', () => {
  it('splits tune and held per class', () => {
    const r = rollup([{ class: 'a', split: 'tune', pass: true }, { class: 'a', split: 'tune', pass: false }, { class: 'a', split: 'held', pass: true }]);
    expect(r.tune.a).toEqual({ n: 2, pass: 1, rate: 0.5 });
    expect(r.held.a.rate).toBe(1);
    expect(r.total.tune.n).toBe(2);
  });
});
