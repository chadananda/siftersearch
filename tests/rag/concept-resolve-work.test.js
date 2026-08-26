// Resolving which of OUR documents holds an aligned work — by TEXT, never by title.
//
// Title matching is how a plan ends up pointing at nothing. It put the grounding plan on empty duplicates
// (6555→12511, 15342→14870); it proposed "On divine origination" as the original of "The Secret of Divine
// Civilization"; and on 2026-08-25 it showed a soft-deleted tombstone beside a live canonical and read as a
// dedupe failure. A title is a label two records can share while holding different text, or none.
//
// The text is the identity test, and it self-checks: a husk has nothing to match, so it cannot win.
import { describe, it, expect, vi } from 'vitest';
import { probePhrase, resolveWorkDoc } from '../../api/lib/rag/concepts/resolve-work.js';

vi.mock('../../api/lib/rag/concepts/ctai.js', () => ({
  fetchPair: vi.fn(async (work, pi) => ({
    pair_index: pi,
    translation: `Opening words ${pi} distinctive body text of the work under examination here now`,
  })),
}));

/** Search stub: every probe returns the same ranked list. */
const searchReturning = (hits) => vi.fn(async () => hits);

const hit = (docId, o = {}) => ({ docId, title: `doc ${docId}`, sourceSite: 'oceanlibrary.com', ...o });

describe('probePhrase', () => {
  it('skips the opening words, which formulaic texts share', () => {
    // "O Son of Spirit!" and "He is the Glory of Glories" open many different tablets; probing them would
    // vote for whichever document happens to contain the most such openings.
    expect(probePhrase('O Son of Spirit! My first counsel is this: possess a pure kindly radiant heart', 6))
      .toBe('of Spirit! My first counsel is');
  });

  it('returns the whole string when it is shorter than the window', () => {
    expect(probePhrase('short text', 12)).toBe('short text');
  });
});

describe('resolveWorkDoc', () => {
  it('picks the document that repeatedly answers with the work\'s own words', async () => {
    // 8312 answers every probe; 999 answers one. A document that merely appears is not the work.
    const search = vi.fn()
      .mockResolvedValueOnce([hit(8312), hit(999)])
      .mockResolvedValue([hit(8312)]);
    const r = await resolveWorkDoc('gleanings', { search });
    expect(r.probes).toBe(5);
    expect(r.resolved).toBe(8312);
    expect(r.candidates[0]).toMatchObject({ docId: 8312, votes: 5, share: 1 });
  });

  it('HOLDS on a TIE — two documents answering equally is not an identification', async () => {
    // Both a canonical and a near-identical compilation can contain the same passages. Picking either on a
    // coin-flip would anchor a whole work's originals to the wrong document, undetectably.
    const r = await resolveWorkDoc('ambiguous', { search: searchReturning([hit(8312), hit(999)]) });
    expect(r.candidates.slice(0, 2).map((c) => c.votes)).toEqual([5, 5]);
    expect(r.resolved).toBeNull();
  });

  it('HOLDS when the vote is split rather than naming a confident wrong answer', async () => {
    // A work spread across several documents, or a probe set that matches many, must not resolve. This is
    // the same doctrine as an ambiguous person name: recall widely, bind on evidence, refuse when split.
    const search = vi.fn()
      .mockResolvedValueOnce([hit(1)]).mockResolvedValueOnce([hit(2)])
      .mockResolvedValueOnce([hit(3)]).mockResolvedValueOnce([hit(4)])
      .mockResolvedValueOnce([hit(5)]);
    const r = await resolveWorkDoc('scattered', { search });
    expect(r.resolved).toBeNull();
    expect(r.candidates[0].share).toBeLessThan(0.6);
  });

  it('refuses to resolve on a bare plurality — the winner must clear the share bar too', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce([hit(1)]).mockResolvedValueOnce([hit(1)])
      .mockResolvedValueOnce([hit(2)]).mockResolvedValueOnce([hit(3)])
      .mockResolvedValueOnce([hit(4)]);
    const r = await resolveWorkDoc('thin', { search });
    expect(r.candidates[0]).toMatchObject({ docId: 1, votes: 2 });
    expect(r.resolved).toBeNull();          // 2/5 = 0.4, under the bar
  });

  it('ignores scraped copies, which outnumber canonicals ~128:1', async () => {
    // Without this the vote is decided by how many copies a scraping site happens to host, not by which
    // document is the work.
    const r = await resolveWorkDoc('gleanings', {
      search: searchReturning([
        hit(500, { sourceSite: 'bahai-library.com' }),
        hit(501, { sourceSite: 'oceanoflights.org' }),
        hit(8312),
      ]),
    });
    expect(r.resolved).toBe(8312);
    expect(r.candidates.map((c) => c.docId)).not.toContain(500);
  });

  it('counts a document once per probe, however many paragraphs of it match', async () => {
    // A long document matching five paragraphs of one probe is not five pieces of evidence; it is one.
    const r = await resolveWorkDoc('gleanings', {
      search: searchReturning([hit(8312), hit(8312), hit(8312)]),
    });
    expect(r.candidates[0].votes).toBe(5);   // 5 probes, not 15 hits
  });

  it('keeps scraped copies when canonicalOnly is off, for diagnosing a missing canonical', async () => {
    const r = await resolveWorkDoc('gleanings', {
      search: searchReturning([hit(500, { sourceSite: 'bahai-library.com' })]),
      canonicalOnly: false,
    });
    expect(r.candidates[0].docId).toBe(500);
  });

  it('resolves to nothing, without throwing, when the corpus answers nothing', async () => {
    const r = await resolveWorkDoc('absent', { search: searchReturning([]) });
    expect(r.resolved).toBeNull();
    expect(r.candidates).toEqual([]);
  });
});
