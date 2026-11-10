// Question bank vs Perplexity (scripts/quality/question-bank/px-bank.mjs): presentation measured in code, the Perplexity answer cache
// (fetched once, refetched on request, failures not cached), the judge verdict mapping and the per-tradition roll-up. No network.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { oceanWork, presentation, verdictOf, pxCache, pxAnswer, asConversation, bankRollup } from '../../scripts/quality/question-bank/px-bank.mjs';

describe('presentation (code, free)', () => {
  it('counts cards, OceanLibrary links and works, bad and bare links, quote blocks, words and seconds', () => {
    const text = 'Jesus was born in Bethlehem, see [*The Gospel of Luke*](https://oceanlibrary.com/luke/2#1) and [Luke](https://oceanlibrary.com/luke/2#7).\n\n'
      + '> For unto you is born this day\n> a Saviour\n\nAlso [here]() and https://example.com/raw and [https://x.org](https://x.org).';
    const p = presentation({ text, events: { passage: 1 }, quote_cards: [{}], book: { id: 1 }, citations: [{}, {}], ms: 4321 });
    expect(p).toMatchObject({ passage_cards: 2, book_card: true, quote_blocks: 1, links: 4, ocean_links: 2, ocean_works: 1, bad_links: 2, bare_urls: 1,
      names_site: false, citations: 2, seconds: 4.3 });
    expect(p.words).toBeGreaterThan(10);
  });
  it('a named-work books event is a book card', () => {
    expect(presentation({ text: 'x', books: [{ id: 1 }] }).book_card).toBe(true);
  });
  it('flags the site named in prose, not in a link target', () => {
    expect(presentation({ text: 'Ask at siftersearch.com' }).names_site).toBe(true);
    expect(presentation({ text: '[a book](https://siftersearch.com/x)' }).names_site).toBe(false);
  });
  it('oceanWork reads the first path segment of OceanLibrary links only', () => {
    expect(oceanWork('https://www.oceanlibrary.com/kitab-i-iqan/1#2')).toBe('kitab-i-iqan');
    expect(oceanWork('https://example.com/kitab')).toBe(null);
    expect(oceanWork('not a url')).toBe(null);
  });
  it('verdictOf maps the judge winner', () => {
    expect(['anis', 'px', 'tie', 'neither', 'x'].map(verdictOf)).toEqual(['anis_better', 'px_better', 'equal', 'neither', null]);
  });
});

describe('Perplexity answer cache', () => {
  it('fetches once, reuses the cached answer, refetches only on refresh, never caches a failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pxbank-'));
    let calls = 0, fail = false;
    const fetchPx = async () => { calls++; return fail ? { text: '', error: 'down', cost: 0 } : { text: `answer ${calls}`, urls: ['https://a.org'], cost: 0.006, ms: 900 }; };
    const a = await pxAnswer('Who was Jesus?', pxCache('christianity', { dir }), { fetchPx });
    expect(a).toMatchObject({ fetched: true, cost: 0.006 });
    const b = await pxAnswer('Who was Jesus?', pxCache('christianity', { dir }), { fetchPx });   // a new process reads the file
    expect(b).toMatchObject({ fetched: false, cost: 0, px: { text: 'answer 1' } });
    await pxAnswer('Who was Jesus?', pxCache('christianity', { dir }), { fetchPx, refresh: true });
    expect(pxCache('christianity', { dir }).get('Who was Jesus?').text).toBe('answer 2');
    fail = true;
    await pxAnswer('What is grace?', pxCache('christianity', { dir }), { fetchPx });
    expect(pxCache('christianity', { dir }).get('What is grace?')).toBe(null);
  });
});

describe('roll-up', () => {
  const pres = (o) => ({ passage_cards: 0, book_card: false, ocean_links: 0, ocean_works: 0, bad_links: 0, bare_urls: 0, names_site: false, words: 100, seconds: 5, ...o });
  it('win/tie/loss, presentation stats, in-library misses and collection gaps per tradition, with spend', () => {
    const rows = [
      { bank_id: 'christianity-001', q: 'a', presentation: pres({ passage_cards: 2, ocean_links: 3, ocean_works: 2, book_card: true }), px: { text: 'one two' }, px_cost: 0.006,
        judge: { verdict: 'px_better', cost: 0.2, px_only_sources: [{ title: 'Luke', in_library: true, library_match: { title: 'Luke', document_id: 9 } }, { title: 'Blog', in_library: false }] } },
      { bank_id: 'christianity-002', q: 'b', presentation: pres({ bad_links: 1 }), px_cost: 0.005, judge: { verdict: 'anis_better', cost: 0.1, px_only_sources: [] } },
      { bank_id: 'islam-001', q: 'c', presentation: pres({}) },
    ];
    const r = bankRollup(rows);
    expect(Object.keys(r)).toEqual(['christianity', 'islam']);
    expect(r.christianity).toMatchObject({ n: 2, judged: 2, verdicts: { anis_better: 1, px_better: 1, equal: 0 }, px_usd: 0.011, judge_usd: 0.3,
      presentation: { passage_cards: 1, with_passage_card: 1, with_book_card: 1, no_ocean_link: 1, bad_links: 1, px_words: 2 } });
    expect(r.christianity.missed_in_library).toEqual([expect.objectContaining({ bank_id: 'christianity-001', title: 'Luke', match: { title: 'Luke', document_id: 9 } })]);
    expect(r.christianity.collection_gaps).toEqual([{ bank_id: 'christianity-001', title: 'Blog', author: undefined }]);
    expect(r.islam).toMatchObject({ n: 1, judged: 0 });
  });
  it('asConversation gives the judge one turn with Anís sources and the Perplexity answer', () => {
    const c = asConversation({ bank_id: 'islam-001', q: 'What is zakat?', strategy: 'topic' }, { text: 'Zakat is…', sources: [{ source_title: 'Qur’an', doc_id: 4 }], citations: [] }, { text: 'px' }, 'Islam');
    expect(c.turns[0]).toMatchObject({ user: 'What is zakat?', reply: 'Zakat is…', sources: [{ title: 'Qur’an', document_id: 4 }], perplexity: { text: 'px' } });
  });
});
