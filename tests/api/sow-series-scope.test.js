// A periodical named as a whole is searched across every issue (11-12 live: "Can you try again to see if the maxwell birth is
// mentioned in Star of the West?" → the book finder picked "Star of the West, v1, i1" and only that issue was searched).
import { describe, it, expect, vi } from 'vitest';
import { sowWholeAsked } from '../../api/lib/sow-links.js';
import { findInWorkAnswer, asWorkResult, inWorkReply, passageCards } from '../../api/lib/assistant/find-in-work.js';
import { quoteSearch } from '../../api/lib/assistant/quote-search.js';

const V1I1 = { id: 15380, title: "Star of the West, v1, i1 Baha', March 21 1910", author: null };
const V1I17 = { id: 15396, title: 'Star of the West, v1, i17 Sultan, January 19 1911', author: null };
const ISSUES = [15380, 15396];

describe('sowWholeAsked: the magazine, not one issue', () => {
  it('an issue reached from the bare name → the whole magazine', () => {
    expect(sowWholeAsked(V1I1, 'Star of the West')).toBe(true);
    expect(sowWholeAsked(V1I1, 'Can you try again to see if the maxwell birth is mentioned in Star of the West?')).toBe(true);
  });
  it('an issue named with its volume / issue → that issue only', () => {
    expect(sowWholeAsked(V1I17, 'Star of the West, v1, i17')).toBe(false);
    expect(sowWholeAsked(V1I17, 'Star of the West volume 1 issue 17')).toBe(false);
  });
  it('the magazine-level document is the whole; other works never', () => {
    expect(sowWholeAsked({ title: 'Star of the West' }, '')).toBe(true);
    expect(sowWholeAsked({ title: 'God Passes By' }, 'Star of the West')).toBe(false);
  });
});

describe('in_work: "Star of the West" → every issue searched', () => {
  const book = async () => ({ kind: 'work', work: { doc: V1I1, others: [] }, via: 'named' });
  const run = (names, content) => {
    const search = vi.fn(async () => ({ total: 0, passages: [], mode_used: 'none', works: [] }));
    return findInWorkAnswer({ messages: [{ role: 'user', content }], names, topic: 'Maxwell birth', deps: { bookFastPath: book, sowIssueIds: async () => ISSUES, sectionsOf: async () => [] }, search })
      .then(() => search);
  };
  it('the live message (Jev named "Star of the West") → works = all issues', async () => {
    const s = await run(['Star of the West'], 'Can you try again to see if the maxwell birth is mentioned in Star of the West?');
    expect(s).toHaveBeenCalledWith({ query: 'Maxwell birth', works: ISSUES });
  });
  it('no name from Jev → the message decides', async () => {
    const s = await run([], 'Is the maxwell birth mentioned in Star of the West?');
    expect(s.mock.calls[0][0].works).toEqual(ISSUES);
  });
  it('an issue named by number → that issue alone', async () => {
    const s = await run(['Star of the West, v1, i1'], 'Is the maxwell birth mentioned in Star of the West v1 i1?');
    expect(s.mock.calls[0][0].works).toEqual([15380]);
  });
});

describe('quote_search works:[title]: titles resolve (work-request findTitled), the magazine → all issues', () => {
  const rows = { 15380: [{ id: 1, paragraph_index: 1, text: 'Greeting.', blocktype: 'paragraph' }],
    15396: [{ id: 16177807, paragraph_index: 44, text: 'Five diamonds are worth more than five million stones.', blocktype: 'paragraph' }] };
  const ctx = (picked) => ({ deps: {
    findTitled: async () => ({ doc: picked, others: [] }),
    sowIssueIds: async () => ISSUES,
    getDoc: async (id) => [V1I1, V1I17].find((d) => d.id === id) ?? null,
    paragraphTexts: async (id) => rows[id] ?? [],
    paragraphsByIds: async (ids) => ids.map((id) => ({ ...rows[15396][0], id, doc_id: 15396, document_id: 15396, title: V1I17.title })),
    withLinks: async (ps) => ps,
  } });
  it('"Star of the West" → the phrase found in v1 i17 though the finder picked v1 i1; the issue cover on the work', async () => {
    const r = await quoteSearch({ query: 'five diamonds', works: ['Star of the West'] }, ctx(V1I1));
    expect(r.total).toBe(1);
    expect(r.passages[0]).toMatchObject({ doc_id: 15396 });
    expect(r.works.find((w) => w.id === 15396).cover_url).toMatch(/\/sow\/v1i17\/page-001\.webp/);
  });
  it('a numbered issue title → that issue only', async () => {
    const r = await quoteSearch({ query: 'five diamonds', works: ['Star of the West, v1, i1'] }, ctx(V1I1));
    expect(r.total).toBe(0);
    expect(r.works.map((w) => w.id)).toEqual([15380]);
  });
});

describe('the series searched whole is named as the series; each hit cites its own issue and shows its own scan', () => {
  const res = { mode_used: 'literal', total: 1, works: [{ id: 15380, title: V1I1.title }],
    passages: [{ id: 16177807, document_id: 15396, doc_id: 15396, work: V1I17.title, title: V1I17.title, place: '#44', excerpt: '**Five diamonds** are worth more than five million stones.', url: 'https://bahai-education.org/sifter-star-of-the-west/v1.17' }] };
  it('never "Star of the West, v1, i1" for the whole search', () => {
    const r = asWorkResult(res, 'five diamonds', V1I1, 'Star of the West');
    expect(r.work).toMatchObject({ title: 'Star of the West', series: true });
    expect(inWorkReply(r)).toContain('*Star of the West, v1, i17 Sultan, January 19 1911*, #44');
    expect(inWorkReply({ ...r, mode: 'none', total: 0, passages: [] })).toContain('I searched all of *Star of the West* for');
  });
  it('the card: the hit\'s issue title and its page-1 scan', () => {
    const [c] = passageCards(asWorkResult(res, 'five diamonds', V1I1, 'Star of the West'));
    expect(c).toMatchObject({ work_id: 15396, title: V1I17.title, place: '#44' });
    expect(c.cover_url).toMatch(/\/sow\/v1i17\/page-001\.webp/);
  });
});
