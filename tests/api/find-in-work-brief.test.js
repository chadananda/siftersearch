// 11-11 "world order letters?": the title words alone name the work (→ its card), and meaning matches are brief (3, short excerpts).
import { describe, it, expect } from 'vitest';
import { wordsToFind, namesTheWork, sectionNamed, briefExcerpt, inWorkReply, findInWorkAnswer } from '../../api/lib/assistant/find-in-work.js';

const WOB = 'The World Order of Bahá’u’lláh';
describe('a topic that only names the work', () => {
  it('is no words to find', () => {
    expect(namesTheWork('world order letters?', [WOB])).toBe(true);
    expect(wordsToFind({ topic: 'world order letters?', titles: [WOB] })).toBeNull();
    expect(wordsToFind({ topic: 'collective security', titles: [WOB] })).toBe('collective security');
  });
  it('findInWorkAnswer hands back the found work (the card), never a search', async () => {
    const found = { kind: 'work', via: 'pick', work: { doc: { id: 20894, title: WOB } } };
    let searched = false;
    const got = await findInWorkAnswer({ messages: [{ role: 'user', content: 'world order letters?' }], topic: 'world order letters?',
      deps: { bookFastPath: async () => found, quotedSpans: () => [] }, search: async () => { searched = true; return null; } });
    expect(searched).toBe(false);
    expect(got.book).toBe(found);
    expect(got.reply).toBeUndefined();
  });
});

describe('a message that is one of the work\'s section titles', () => {
  const SECS = [{ section_id: 1, level: 1, title: 'The World Order of Bahá’u’lláh', start_index: 0 }, { section_id: 2, level: 1, title: 'The Dispensation of Bahá’u’lláh', start_index: 300, end_index: 420 }];
  it('names that section; a longer request does not', () => {
    expect(sectionNamed('"Dispensation of Baha\'u\'llah"', SECS).section_id).toBe(2);
    expect(sectionNamed('search it for "Dispensation of Baha\'u\'llah"', SECS)).toBeNull();
  });
  it('findInWorkAnswer gives the section card, no search (11-11)', async () => {
    const found = { kind: 'work', via: 'pick', work: { doc: { id: 20894, title: WOB, author: 'Shoghi Effendi' } } };
    let searched = false;
    const got = await findInWorkAnswer({ messages: [{ role: 'user', content: '"Dispensation of Baha\'u\'llah"' }], topic: null,
      deps: { bookFastPath: async () => found, quotedSpans: () => ["Dispensation of Baha'u'llah"], sectionsOf: async () => SECS }, search: async () => { searched = true; return null; } });
    expect(searched).toBe(false);
    expect(got.book.kind).toBe('section');
    expect(got.book.sec).toMatchObject({ title: 'The Dispensation of Bahá’u’lláh', doc_id: 20894, book: WOB });
  });
});

describe('brief meaning matches', () => {
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} says several more words here.`).join(' ');
  it('cuts a long passage at a sentence near 45 words, marked with …', () => {
    const e = briefExcerpt(long);
    expect(e.endsWith('…')).toBe(true);
    expect(e.split(' ').length).toBeLessThanOrEqual(50);
    expect(briefExcerpt('Short one.')).toBe('Short one.');
  });
  it('shows the closest 3, each linked', () => {
    const passages = Array.from({ length: 8 }, (_, i) => ({ excerpt: long, url: `https://x/${i}`, place: `#1.${i + 1}` }));
    const reply = inWorkReply({ mode: 'meaning', query: 'q', work: { title: WOB, author: 'Shoghi Effendi' }, passages, total: 8 });
    expect(reply).toContain('These 3 passages are');
    expect(reply.match(/\]\(https:\/\/x\//g)).toHaveLength(3);
  });
});

describe('sectionAbout: which part of the book in focus (11-11 golden age)', () => {
  const WOB = [
    { level: 1, title: 'The World Order of Bahá’u’lláh', start_index: 0 }, { level: 1, title: 'The Golden Age of the Cause of Bahá’u’lláh', start_index: 100 },
    { level: 1, title: 'America and the Most Great Peace', start_index: 200 }, { level: 1, title: 'The Goal of a New World Order', start_index: 300 },
    { level: 2, title: 'Golden thoughts', start_index: 110 },
  ];
  it('the one top-level title holding all the asked words', async () => {
    const { sectionAbout } = await import('../../api/lib/assistant/find-in-work.js');
    expect(sectionAbout('which one talks about the golden age?', WOB, 'The World Order of Bahá’u’lláh')?.title).toBe('The Golden Age of the Cause of Bahá’u’lláh');
    expect(sectionAbout('which letter is about America?', WOB, 'The World Order of Bahá’u’lláh')?.title).toBe('America and the Most Great Peace');
  });
  it('ties, title-only words and misses → null (the search runs)', async () => {
    const { sectionAbout } = await import('../../api/lib/assistant/find-in-work.js');
    expect(sectionAbout('which one talks about world order?', WOB, 'The World Order of Bahá’u’lláh')).toBeNull();
    expect(sectionAbout('which one talks about the covenant?', WOB, 'The World Order of Bahá’u’lláh')).toBeNull();
  });
  it('findInWorkAnswer with the book in focus → the section card, no search', async () => {
    const { findInWorkAnswer } = await import('../../api/lib/assistant/find-in-work.js');
    const search = vi.fn();
    const got = await findInWorkAnswer({ messages: [{ role: 'user', content: 'which one talks about the golden age?' }], focus: { id: 20894, title: 'The World Order of Bahá’u’lláh' }, search,
      deps: { quotedSpans: () => [], bookFastPath: async () => ({ kind: 'work', work: { doc: { id: 20894, title: 'The World Order of Bahá’u’lláh' } } }), sectionsOf: async () => WOB } });
    expect(got.book.kind).toBe('section'); expect(got.book.sec.title).toBe('The Golden Age of the Cause of Bahá’u’lláh'); expect(search).not.toHaveBeenCalled();
  });
});

// Live 11-12 'find "five diamonds" in star of the west': a stray quote mark from a cut quotation, and the work's first issue named on a
// hit in issue 17.
import { balanceQuotes, inWorkReply as replyOf } from '../../api/lib/assistant/find-in-work.js';
describe('cut quotations and the hit’s own issue (11-12)', () => {
  it('a closer whose opener was cut away goes; whole passages keep their marks', () => {
    expect(balanceQuotes('… **Five diamonds** are worth more than five million stones." …')).toBe('… **Five diamonds** are worth more than five million stones. …');
    expect(balanceQuotes('… he said. ” Then he left.')).toBe('… he said. Then he left.');
    expect(balanceQuotes('He said, “Come here and see …')).toBe('He said, Come here and see …');
    expect(balanceQuotes('He said, "come." And went.')).toBe('He said, "come." And went.');
    expect(balanceQuotes('… “a” and “b” …')).toBe('… “a” and “b” …');
  });
  it('a hit in another issue cites that issue, not the work’s first', () => {
    const r = { work: { id: 13234, title: 'Star of the West, v1, i1' }, query: 'five diamonds', mode: 'literal', total: 1,
      passages: [{ document_id: 15300, work: 'Star of the West, v1, i17', place: '#44', url: 'https://x/v1.17-p8', excerpt: '**Five diamonds** …' }] };
    expect(replyOf(r)).toContain('[*Star of the West, v1, i17*, #44](https://x/v1.17-p8)');
    expect(replyOf({ ...r, passages: [{ ...r.passages[0], document_id: 13234 }] })).toContain('[*Star of the West, v1, i1*, #44]');
  });
});
