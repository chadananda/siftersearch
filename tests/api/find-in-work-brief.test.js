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
