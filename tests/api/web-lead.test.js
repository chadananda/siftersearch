// A web answer is a LEAD for our retrieval, not the answer. Chad: "Let's not repeat perplexity results but
// use those results for our answering logic" — and a canonical work we hold should become an OceanLibrary
// link, never a bare "here" pointing off-site.
import { describe, it, expect } from 'vitest';
import { extractQuotedPhrases, extractWorkTitles, extractWebLeads } from '../../api/lib/web-lead.js';

// The real reply Perplexity gives when asked the user's actual question.
const PPLX = `\`Abdu’l-Bahá\` says, **“Know that justice consists in rendering to each his due”** in *Some Answered Questions*, in the chapter **“The Justice and the Mercy of God.”**`;

describe('extractQuotedPhrases', () => {
  it('recovers the VERBATIM wording — the needle our corpus can match, unlike the paraphrase', () => {
    expect(extractQuotedPhrases(PPLX)).toContain('Know that justice consists in rendering to each his due');
  });

  it('prefers longer phrases first — the most distinctive needle leads', () => {
    const p = extractQuotedPhrases('He said "one two three four" and also "one two three four five six seven"');
    expect(p[0].split(' ').length).toBeGreaterThan(p[1].split(' ').length);
  });

  it('ignores fragments too short to be a needle', () => {
    expect(extractQuotedPhrases('the term "justice" appears often')).toEqual([]);
  });
});

describe('extractWorkTitles', () => {
  it('names the work we can then search and deep-link', () => {
    expect(extractWorkTitles(PPLX)).toContain('Some Answered Questions');
  });

  it('does not mistake a chapter pointer for a work', () => {
    expect(extractWorkTitles('see *Chapter 78* of the book')).not.toContain('Chapter 78');
  });

  it('rejects an over-long run that is prose, not a title', () => {
    expect(extractWorkTitles('*this is a very long italic sentence that is clearly not a book title at all here*')).toEqual([]);
  });
});

describe('extractWebLeads', () => {
  it('reports usable when either a phrase or a work is found', () => {
    const l = extractWebLeads(PPLX);
    expect(l.usable).toBe(true);
    expect(l.phrases.length).toBeGreaterThan(0);
    expect(l.works).toContain('Some Answered Questions');
  });

  it('unusable on an answer that names nothing searchable', () => {
    expect(extractWebLeads('I could not find a source for that.').usable).toBe(false);
    expect(extractWebLeads('').usable).toBe(false);
    expect(extractWebLeads(null).usable).toBe(false);
  });
});
