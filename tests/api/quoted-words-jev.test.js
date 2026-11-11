// A reader's quotation given without quotation marks (11-11 suffering: "…quote 'Abdu'l-Bahá saying that the mind and spirit of man advance
// when he is tried by suffering. Is that a real quote?"): Jev picks the attributed wording among structural spans; the tree searches it.
import { describe, it, expect } from 'vitest';
import { tailSpans, judgeQuotedWords } from '../../api/lib/assistant/judges.js';
import { quotedByJev, graphFor, entryUnits } from '../../api/lib/assistant/activities/graph.js';

const Q = "That helps. My grandmother used to quote 'Abdu'l-Bahá saying that the mind and spirit of man advance when he is tried by suffering. Is that a real quote? And does it mean suffering is good for us?";
const WORDS = 'the mind and spirit of man advance when he is tried by suffering';

describe('tailSpans', () => {
  it('offers every tail of every sentence of 5+ words, the quoted clause among them, no trailing stop', () => {
    const s = tailSpans(Q);
    expect(s).toContain(WORDS);
    expect(s.every((x) => x.split(/\s+/).length >= 5 && !/[.?!]$/.test(x))).toBe(true);
    expect(s.length).toBeLessThanOrEqual(24);
  });
});

describe('judgeQuotedWords', () => {
  const pick = (span, confidence = 0.9) => async (task, state, qs) => {
    const key = Object.entries(qs.quoted.criteria).find(([, v]) => v === `"${span}"`)?.[0] ?? 'none';
    return { answers: { quoted: { choice: key, confidence } } };
  };
  it('returns the span Jev picks', async () => {
    expect(await judgeQuotedWords({ question: Q, decide: pick(WORDS) })).toEqual({ words: WORDS, confidence: 0.9 });
  });
  it('none, low confidence or a failed call → null (the unit stays the question)', async () => {
    expect(await judgeQuotedWords({ question: Q, decide: async () => ({ answers: { quoted: { choice: 'none', confidence: 0.9 } } }) })).toBeNull();
    expect(await judgeQuotedWords({ question: Q, decide: pick(WORDS, 0.3) })).toBeNull();
    expect(await judgeQuotedWords({ question: Q, decide: async () => { throw new Error('down'); } })).toBeNull();
  });
});

describe('quotedByJev at a quotation tree entry', () => {
  const g = graphFor('quote_trace', 2);
  it("no quotation marks → Jev's words become quoted_words and quoted_clean, and the trace records them", async () => {
    const u = entryUnits(g, {}, { query: Q, question: Q, channel: { id: 'site-chat' }, messages: [] }), trace = [];
    expect(String(u.quoted_words ?? '')).not.toBe(WORDS);
    await quotedByJev(g, u, trace, { judgeQuotedWords: async () => ({ words: WORDS, confidence: 0.9 }) });
    expect(u.quoted_words).toBe(WORDS); expect(u.quoted_clean).toBe(WORDS);
    expect(trace[0]).toMatchObject({ node: 'quoted', edge: 'found', saw: WORDS });
  });
  it("the reader's own quotation marks win: Jev is not asked", async () => {
    const q = 'Did Bahá’u’lláh write "the earth is but one country"?', u = entryUnits(g, {}, { query: q, question: q, channel: { id: 'site-chat' }, messages: [] });
    let asked = false;
    await quotedByJev(g, u, [], { judgeQuotedWords: async () => { asked = true; return null; } });
    expect(asked).toBe(false); expect(u.quoted_words).toBe('the earth is but one country');
  });
});

describe('source_trace fallback standings', () => {
  it("a signpost may rest on a Central Figure's recorded talks (Paris Talks), not only scripture and the Guardian", async () => {
    const { SIGNPOST_SOURCES } = await import('../../api/lib/assistant/tools.js');
    const { authorityKind } = await import('../../api/lib/assistant/tool-kit.js');
    const paris = authorityKind({ title: 'Paris Talks', author: "'Abdu'l-Bahá", tradition: "Baha'i" });
    expect(paris).toBe('reported'); expect(SIGNPOST_SOURCES).toContain(paris);
    expect(SIGNPOST_SOURCES).not.toContain('scholarship');
  });
});
