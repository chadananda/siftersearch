/**
 * SEARCH SCOPE: narrow hard, relax honestly.
 *
 * WHY NARROWING (measured 2026-09-24): the same query unfiltered returns Sutra Collection and Tao Te Ching
 * in 7.35s; with religion="Baha'i" it returns The Dawn-Breakers in 0.95s. 7.7x faster and correct. Nothing
 * in the pipeline infers a tradition — `religion` only ever arrives in the model's tool args, and at least
 * two internal search calls pass none, so a Buddhism thread searches all 12 traditions.
 *
 * WHY RELAXING: a constraint that cannot widen reports absence as fact. If someone asks for a quote in Some
 * Answered Questions and it is not there, the answer is "you are probably thinking of this passage in Paris
 * Talks" — NOT silence, and NOT a silent swap that cites the wrong book as though it were the one asked for.
 * Every widening is recorded so the answer can say what was relaxed.
 */
import { describe, it, expect } from 'vitest';
import { relaxScope, scopeLadder, shouldWiden, describeRelaxation } from '../../api/lib/search-scope.js';

describe('scopeLadder', () => {
  it('drops the narrowest constraint first — document before author before religion', () => {
    const scope = { documentId: 20911, author: "’Abdu’l-Bahá", religion: "Baha'i" };
    expect(scopeLadder(scope).map((s) => Object.keys(s).sort().join('+'))).toEqual([
      'author+documentId+religion',
      'author+religion',
      'religion',
      '',
    ]);
  });

  it('ends unconstrained, so a real answer is never withheld for lack of a filter', () => {
    const last = scopeLadder({ religion: 'Buddhist' }).at(-1);
    expect(Object.keys(last)).toEqual([]);
  });

  it('a comparative question starts unconstrained and has nothing to relax', () => {
    expect(scopeLadder({})).toEqual([{}]);
  });
});

describe('shouldWiden', () => {
  it('widens on no results', () => {
    expect(shouldWiden([], { min: 3 })).toBe(true);
  });
  it('widens on too few results', () => {
    expect(shouldWiden([{}, {}], { min: 3 })).toBe(true);
  });
  it('does NOT widen when the narrow scope answered', () => {
    expect(shouldWiden([{}, {}, {}], { min: 3 })).toBe(false);
  });
});

describe('relaxScope', () => {
  const inBook = [{ id: 1, title: 'Some Answered Questions' }];
  const elsewhere = [{ id: 2, title: 'Paris Talks' }, { id: 3, title: 'Paris Talks' }, { id: 4, title: 'Paris Talks' }];

  it('keeps the narrow result when it suffices, and reports no widening', async () => {
    const r = await relaxScope({ documentId: 20911, religion: "Baha'i" }, async () => [{}, {}, {}], { min: 3 });
    expect(r.widened).toBe(false);
    expect(r.relaxed).toEqual([]);
  });

  it('WIDENS and names what it dropped — the "you probably mean Paris Talks" case', async () => {
    const seen = [];
    const run = async (scope) => { seen.push({ ...scope }); return scope.documentId ? inBook : elsewhere; };
    const r = await relaxScope({ documentId: 20911, religion: "Baha'i" }, run, { min: 3 });
    expect(r.widened).toBe(true);
    expect(r.relaxed).toContain('documentId');
    expect(r.results.map((x) => x.title)).toEqual(['Paris Talks', 'Paris Talks', 'Paris Talks']);
    expect(seen[0].documentId).toBe(20911);          // tried the named book FIRST
    expect(seen[1].documentId).toBeUndefined();      // then without it
  });

  it('remembers what the narrow scope DID find, so the answer can say "not there, but here"', async () => {
    const run = async (scope) => (scope.documentId ? inBook : elsewhere);
    const r = await relaxScope({ documentId: 20911 }, run, { min: 3 });
    expect(r.narrowResults).toHaveLength(1);
  });

  it('never returns fewer results than the narrow scope found', async () => {
    const run = async (scope) => (scope.documentId ? inBook : []);
    const r = await relaxScope({ documentId: 20911 }, run, { min: 3 });
    expect(r.results).toHaveLength(1);
  });
});

describe('describeRelaxation', () => {
  it('states the constraint that was dropped, for the answer to disclose', () => {
    const d = describeRelaxation({ documentId: 20911 }, ['documentId'], { 20911: 'Some Answered Questions' });
    expect(d).toMatch(/Some Answered Questions/);
  });
  it('is empty when nothing was relaxed — no disclosure to make', () => {
    expect(describeRelaxation({ religion: "Baha'i" }, [], {})).toBe('');
  });
});
