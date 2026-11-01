// A companion that presents invented words as scripture has failed at the one thing it must never do.
// Live 2026-09-24: gpt-4o-mini quoted three lines "Bahá'u'lláh states" that appear in no retrieved passage.
import { describe, it, expect } from 'vitest';
import { unverifiedQuotes, dropUnverified, linkQuotes } from '../../api/lib/assistant/quotes.js';

const passages = [
  { text: 'O Son of Spirit! The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me.' },
  { text: 'The earth is but one country, and mankind its citizens.' },
];

describe('unverifiedQuotes', () => {
  it('accepts a verbatim quote, ignoring case, diacritics and curly quotes', () => {
    expect(unverifiedQuotes('He wrote, “the best beloved of all things in My sight is Justice”.', passages)).toEqual([]);
  });

  it('accepts two verbatim pieces joined by an ellipsis', () => {
    expect(unverifiedQuotes('"The best beloved of all things … turn not away therefrom if thou desirest"', passages)).toEqual([]);
  });

  it('flags a quote that appears in no passage', () => {
    expect(unverifiedQuotes('he states that "the foundation of all human virtues is justice"', passages))
      .toEqual(['the foundation of all human virtues is justice']);
  });

  it('ignores short quoted words (not a quotation of a text)', () => {
    expect(unverifiedQuotes('the word "justice" matters', passages)).toEqual([]);
  });
});

describe('dropUnverified', () => {
  it('removes the whole sentence carrying an invented quote, keeping the grounded ones', () => {
    const text = 'Justice is central. He states that "the foundation of all human virtues is justice" (*Lights*). In the Hidden Words: ["the best beloved of all things in My sight is Justice"](https://x) — *Hidden Words*.';
    const out = dropUnverified(text, passages);
    expect(out.text).not.toContain('foundation of all human virtues');
    expect(out.text).toContain('best beloved');
    expect(out.text).toContain('Justice is central.');
    expect(out.removed).toBe(1);
  });

  it('says so honestly when nothing grounded survives', () => {
    const out = dropUnverified('He said "the essence of justice is the love of all mankind".', passages);
    expect(out.text).toMatch(/didn.t find a passage .* in this search/i);
    expect(out.removed).toBe(1);
  });

  it('leaves a reply with no quotes untouched', () => {
    expect(dropUnverified('Hello! I am Anis.', passages)).toEqual({ text: 'Hello! I am Anis.', removed: 0 });
  });
});

// Streaming must never SHOW an invented quote, even for the moment before the final text replaces it.
import { createSentenceGate } from '../../api/lib/assistant/quotes.js';
describe('createSentenceGate', () => {
  const run = (chunks) => { const out = []; const g = createSentenceGate(passages, (t) => out.push(t)); chunks.forEach((c) => g.push(c)); g.flush(); return out.join(''); };

  it('streams grounded sentences, withholding one that quotes words in no passage', () => {
    const out = run(['Justice matters. He said "the found', 'ation of all human virtues is justice". It ', 'is written: "The best beloved of all things in My sight is Justice". Done']);
    expect(out).not.toContain('foundation');
    expect(out).toContain('Justice matters.');
    expect(out).toContain('best beloved');
    expect(out).toContain('Done');
  });

  it('does not release a sentence while a quote is still open (a "." inside a quote is not an ending)', () => {
    const seen = [];
    const g = createSentenceGate(passages, (t) => seen.push(t));
    g.push('It says "The earth is but one country. And more');
    expect(seen.join('')).toBe('');
    g.push(' words here". Next.'); g.flush();
    expect(seen.join('')).toContain('Next.');
  });
});

// r5 (11-01 conversation harness, Táhirih T1/T2): "Here is what Shoghi Effendi writes in *God Passes By* about that moment:"
// was followed by nothing — the quote the model wrote was unverified and dropped, the lead-in stayed. A reply never ends
// an introduction without its quotation: the verified passage is placed, or the lead-in is rewritten.
describe('completeIntroducedQuotes', async () => {
  const { completeIntroducedQuotes } = await import('../../api/lib/assistant/quotes.js');
  const GPB = { source_title: 'God Passes By', source_author: 'Shoghi Effendi', citation_url: 'https://oceanlibrary.com/x?paraId=para_88',
    text: 'Quddús, who was sitting nearby, was so surprised that he raised his hand to cover his face. Táhirih rose from her seat and, unveiled, addressed the assembled companions. Some fled in terror.' };
  const OTHER = { source_title: 'The Dawn-Breakers', source_author: 'Nabíl-i-Aʻẓam', citation_url: 'https://x/db', text: 'At Badásht a great company gathered.' };
  it('places the named passage, verbatim and linked, under a lead-in left empty', () => {
    const r = completeIntroducedQuotes('Here is what Shoghi Effendi writes in *God Passes By* about that moment:\n\nDoes this passage help?', [OTHER, GPB]);
    expect(r.completed).toBe(1);
    expect(r.text).toMatch(/about that moment:\n\n> .*Táhirih rose from her seat/);
    expect(r.text).toContain('(https://oceanlibrary.com/x?paraId=para_88)');
    expect(r.text.endsWith('Does this passage help?')).toBe(true);
  });
  it('a reply ending on ":" gets the quotation of the passage by the author it names', () => {
    const r = completeIntroducedQuotes('Shoghi Effendi describes how she appeared before the gathering:', [GPB]);
    expect(r.text).toMatch(/gathering:\n\n> Quddús/);
  });
  it('no passage matches → a bare "here is" frame is dropped, any other lead-in ends with a full stop', () => {
    expect(completeIntroducedQuotes('She removed her veil.\n\nHere is what Shoghi Effendi writes about it:', [OTHER]).text).toBe('She removed her veil.');
    expect(completeIntroducedQuotes('She removed her veil. Shoghi Effendi recounts that a new era had begun:', []).text)
      .toBe('She removed her veil. Shoghi Effendi recounts that a new era had begun.');
  });
  it('leaves a lead-in that is followed by its quotation, list or table alone', () => {
    for (const t of ['He writes:\n\n> “Quddús, who was sitting nearby”', 'Three points:\n\n- one\n- two', 'In his words:\n\n“So powerful is the light of unity.”'])
      expect(completeIntroducedQuotes(t, [GPB]).text).toBe(t);
  });
});

// r6-base class A (16 of 108 defects): a verbatim quotation of a retrieved passage with no link of its own.
describe('linkQuotes', () => {
  const P = [
    { text: 'Disencumber yourselves of all attachment to this world and the vanities thereof. Beware that ye approach them not.', source_title: 'Gleanings', citation_url: 'https://oceanlibrary.com/g#p1' },
    { text: 'The soul is not a material thing; it is a heavenly gem which progresses through the worlds of God.', source_title: 'Some Answered Questions', citation_url: 'https://oceanlibrary.com/saq#p9' },
  ];
  it('links an unlinked inline quotation to the passage that holds it', () => {
    const r = linkQuotes('Bahá’u’lláh urges us: “Disencumber yourselves of all attachment to this world,” and so on.', P);
    expect(r.text).toBe('Bahá’u’lláh urges us: “Disencumber yourselves of all attachment to this world,” ([Gleanings](https://oceanlibrary.com/g#p1)) and so on.');
    expect(r.linked).toBe(1);
  });
  it('leaves a quotation whose sentence already links its passage', () => {
    const t = 'In [Gleanings](https://oceanlibrary.com/g#p1) He writes: “Disencumber yourselves of all attachment to this world.”';
    expect(linkQuotes(t, P).text).toBe(t);
  });
  it('links an unlinked blockquote on its own attribution line', () => {
    const r = linkQuotes('He explains:\n\n> The soul is not a material thing; it is a heavenly gem.\n\nSo it is not physical.', P);
    expect(r.text).toContain('> The soul is not a material thing; it is a heavenly gem.\n> — [Some Answered Questions](https://oceanlibrary.com/saq#p9)');
  });
  it('never links words found in no passage, or short phrases', () => {
    const t = 'He called it “a heavenly gem” and “the light of the world of being itself.”';
    expect(linkQuotes(t, P).text).toBe(t);
  });
});

describe('linkQuotes, one link per passage per paragraph', () => {
  it('two quotations of one passage in a paragraph get one link', () => {
    const P = [{ text: 'Disencumber yourselves of all attachment to this world and the vanities thereof. Beware that ye approach them not.', source_title: 'Gleanings', citation_url: 'u1' }];
    const r = linkQuotes('“Disencumber yourselves of all attachment to this world.” Then: “and the vanities thereof. Beware that ye approach them not.”', P);
    expect(r.linked).toBe(1);
  });
});
