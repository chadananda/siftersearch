// W4 (11-03): "not in the library" is said only when a search really came up empty, and never of words this conversation
// already quoted; web results are labelled as web; citation links reach the paragraph; a narrator's passage names whose
// words it reports. r6-after: 4 false absences, ~10 misattributions, ~10 book-level links.
import { describe, it, expect } from 'vitest';
import { saidEarlier, earlierLinkFor, exactLink, paragraphLevelUrl, reportedVoices } from '../../api/lib/assistant/quotes.js';
import { passageHeader, anisUserPayload, HOUSE_STYLE } from '../../api/lib/assistant/prompt.js';
import { FORMATS } from '../../api/lib/assistant/formats.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';

const IQAN = 'https://oceanlibrary.com/kitab-i-iqan/?paraId=abc12';
const thread = [
  { role: 'user', content: 'What does the Íqán say about the seeker?' },
  { role: 'assistant', content: `He writes that the seeker must ["cleanse and purify his heart"](${IQAN}) — *The Kitáb-i-Íqán*.` },
  { role: 'user', content: 'Can you find the quote "cleanse and purify his heart"?' },
];

describe('words the conversation already sourced are never absent', () => {
  it('saidEarlier reads earlier assistant turns only (never the question itself)', () => {
    expect(saidEarlier(thread, 'cleanse and purify his heart')).toBe(true);
    expect(saidEarlier(thread, 'the earth is but one country')).toBe(false);
    expect(saidEarlier(thread.slice(2), 'cleanse and purify his heart')).toBe(false);
  });
  it('earlierLinkFor returns the link that carried those words', () => {
    expect(earlierLinkFor(thread, 'cleanse and purify his heart')).toBe(IQAN);
    expect(earlierLinkFor(thread.slice(2), 'cleanse')).toBeNull();
  });
  it('anisRespond: a hunt for words quoted earlier is not an honest_absence — the passages stay and the direction points back', async () => {
    const calls = { craft: [] };
    const deps = {
      search: async () => ({ passages: [{ text: 'Unrelated words about the Letters of the Living.', title: 'Dawn-Breakers', author: 'Nabíl', document_id: 1, paragraph_index: 3, source_url: 'https://x/d#3' }],
        _plan: { shape: 'quote', quote: { phrase: 'cleanse and purify his heart' }, provenance: 'jev' } }),
      craft: async (a) => { calls.craft.push(a); a.onChunk?.('x'); return 'Those words came from the Íqán.'; },
      companion: async () => ({ append: '', plan: null, offer: false }),
    };
    const r = await anisRespond({ messages: thread, deps });
    expect(r.format.id).not.toBe('honest_absence');
    expect(r.select?.by).toBe('said-earlier');
    expect(calls.craft[0].retrieved_quotes.length).toBeGreaterThan(0);
    expect(calls.craft[0].direction.format.how).toMatch(/quoted earlier in this conversation from https:\/\/oceanlibrary\.com/);
    expect(calls.craft[0].direction.format.how).toMatch(/never that they are not in the library/);
  });
  it('the honest_absence format and the house style speak of THIS SEARCH, never of the library lacking it', () => {
    const f = FORMATS.find((x) => x.id === 'honest_absence');
    expect(f.how).toMatch(/this search found no passage/);
    expect(f.how).not.toMatch(/library does not/);
    expect(HOUSE_STYLE).toMatch(/Anything you quoted or linked earlier in CONVERSATION SO FAR IS in the library/);
  });
});

describe('web results are labelled as web', () => {
  it('a web passage is headed WEB RESULT and the house style says how to use it', () => {
    const h = passageHeader({ source_title: 'Web: Encyclopaedia Iranica — Bābism', source_author: 'web search', web: true, text: '…' }, 2);
    expect(h).toMatch(/^\[3\] WEB RESULT — Encyclopaedia Iranica — Bābism \(from the open web, not the library/);
    expect(anisUserPayload({ question: 'q', passages: [{ source_title: 'Web: x', web: true, citation_url: 'https://w', text: 't' }] })).toContain('WEB RESULT');
    expect(HOUSE_STYLE).toMatch(/WEB RESULTS: a passage headed WEB RESULT comes from the open web/);
  });
  it('a library passage is never labelled web', () => {
    expect(passageHeader({ source_title: 'Gleanings', source_author: 'Bahá’u’lláh', text: 'x' }, 0)).not.toMatch(/WEB/);
  });
});

describe('links reach the paragraph', () => {
  it('a book-level external link gives way to the paragraph page when the paragraph is known', () => {
    expect(exactLink({ source_url: 'https://bahai-library.com/wesley_sermons', reader_url: 'https://siftersearch.com/library/christianity/sermons/wesley#p41', paragraph_index: 41 }))
      .toBe('https://siftersearch.com/library/christianity/sermons/wesley#p41');
  });
  it('a paragraph-level external link stays (OceanLibrary paraId, marker, Ocean of Lights, selectionString)', () => {
    for (const u of ['https://oceanlibrary.com/saq/?paraId=p12', 'https://oceanlibrary.com/saq/#~q=abc', 'https://oceanoflights.org/x/#~d=1~q=abc', 'https://www.bahai.org/r/1234#selectionString=x'])
      expect(exactLink({ source_url: u, reader_url: 'https://siftersearch.com/l/x#p1', paragraph_index: 1 })).toBe(u);
  });
  it('without a paragraph index or a reader page the link is unchanged', () => {
    expect(exactLink({ source_url: 'https://bahai-library.com/x', reader_url: 'https://s/#p4' })).toBe('https://bahai-library.com/x');
    expect(exactLink({ source_url: 'https://bahai-library.com/x', paragraph_index: 4 })).toBe('https://bahai-library.com/x');
    expect(exactLink({ reader_url: 'https://s/#p4', paragraph_index: 4 })).toBe('https://s/#p4');
    expect(exactLink({})).toBeNull();
    expect(paragraphLevelUrl('https://bahai-library.com/x')).toBe(false);
  });
});

describe('whose words a narrator reports', () => {
  const NABIL = { source_title: 'The Dawn-Breakers', source_author: 'Nabíl-i-A‘ẓam', book_author: 'Nabíl-i-A‘ẓam', religion: "Baha'i",
    text: 'Mullá Ḥusayn was overwhelmed. The Báb, turning to him, said: “O thou who art the first to believe in Me! Verily I say, I am the Báb.”' };
  it('reportedVoices finds the figure the passage quotes, not the writer', () => {
    expect(reportedVoices(NABIL.text, NABIL.source_author)).toEqual(['The Báb']);
    expect(reportedVoices('Bahá’u’lláh wrote: “The earth is but one country.”', 'Bahá’u’lláh')).toEqual([]);
    expect(reportedVoices('The Báb was born in Shíráz in 1819.', 'Nabíl')).toEqual([]);   // no quoted speech → no voice
  });
  it('the header names the reported voice and the narrator who records it', () => {
    const h = passageHeader(NABIL, 0);
    expect(h).toMatch(/reports the words of The Báb \(credit those words to them, as Nabíl-i-A‘ẓam records\)/);
    expect(HOUSE_STYLE).toMatch(/WHOSE VOICE: a translator, editor, compiler, narrator or footnote-writer is never credited/);
  });
  it('an explicit quoted list on the passage wins over text detection', () => {
    expect(passageHeader({ ...NABIL, quoted: ['Quddús'] }, 0)).toMatch(/reports the words of Quddús/);
  });
});
