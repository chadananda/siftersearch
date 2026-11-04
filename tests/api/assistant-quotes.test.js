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

// 11-04 prod regressions: a comparison lost its whole Bahá'í section for ONE unverified quote (the splitter only broke
// on ". " + ASCII capital, so "**Bahá'í.**" headings and “…” endings glued sections together), and a reply cut at the
// token cap ended on an empty heading.
import { splitSentences, trimCutReply, dropDanglingTail } from '../../api/lib/assistant/quotes.js';
describe('sentence pieces and section-safe dropping', () => {
  it('splits after a closing quote, after a bold heading, and before non-ASCII capitals', () => {
    expect(splitSentences('He wrote “the best beloved is Justice.” Then more.')).toEqual(['He wrote “the best beloved is Justice.”', 'Then more.']);
    expect(splitSentences('**Bahá\'í.** The fast lasts nineteen days.')).toEqual(['**Bahá\'í.**', 'The fast lasts nineteen days.']);
    expect(splitSentences('It ends. Ḥuqúqu\'lláh is a law. ‘Abdu\'l-Bahá said so.')).toHaveLength(3);
  });
  it('never splits inside an open quotation', () => {
    expect(splitSentences('He said “first. Second part.” Done.')).toEqual(['He said “first. Second part.”', 'Done.']);
  });
  it('drops only the sentence with the bad quote; the rest of its section and the line breaks stay', () => {
    const text = '**Islam.**\nRamadan is a month.\n\n**Bahá\'í.**\nThe fast is nineteen days. He states "the foundation of all human virtues is justice". It is written: "the best beloved of all things in My sight is Justice".';
    const out = dropUnverified(text, passages);
    expect(out.removed).toBe(1);
    expect(out.text).toContain('**Bahá\'í.**\nThe fast is nineteen days.');
    expect(out.text).toContain('best beloved');
    expect(out.text).toContain('**Islam.**\nRamadan is a month.');
    expect(out.text).not.toContain('foundation');
  });
  it('a heading whose whole section was dropped goes with it', () => {
    const text = 'Intro sentence.\n\n**Invented.**\nHe states "the foundation of all human virtues is justice".\n\n**Real.**\nIt is written: "the best beloved of all things in My sight is Justice".';
    const out = dropUnverified(text, passages);
    expect(out.text).not.toContain('**Invented.**');
    expect(out.text).toContain('**Real.**');
  });
  it('a reply cut at the cap never ends on an empty heading or a bare list marker', () => {
    expect(trimCutReply('Some text. More text here.\n\n**Where the House speaks about change.**\n\nThe House wro')).toBe('Some text. More text here.');
    expect(trimCutReply('Some text.\n\n## Next\n\nCut mid')).toBe('Some text.');
    expect(dropDanglingTail('Some text.\n\n1. First point.\n2.')).toBe('Some text.\n\n1. First point.');
    expect(dropDanglingTail('Plain ending.')).toBe('Plain ending.');
  });
});

// 11-04 prod10 (after 8891a295's per-sentence drop): w3:ref-gita and w8:goth-08 opened "What they do hold…" / "What they do
// show…" — the opening sentence went, and "they" pointed at nothing; w3:cmp-afterlife-hindu-christian kept the Luke
// blockquote's "> — [*The Gospel of Luke*](…)" line with no quotation above it, and ref-gita a bare "— [The Bhagavad-Gita…]".
import { leansBack, unquote } from '../../api/lib/assistant/quotes.js';
import { containsQuote } from '../../api/lib/quote-text.js';
describe('a dropped quotation leaves nothing behind that points at it', () => {
  const gita = [
    { text: 'Yea! whoso, shaking off the yoke of fleshLives lord, not servant, of his lusts; set freeFrom pride, from passion, from the sin of “Self,”Toucheth tranquillity!', source_title: 'The Bhagavad-Gita', citation_url: 'https://oceanlibrary.com/bhagavad-gita/?paraId=para_43' },
    { text: 'HERE ENDETH CHAPTER II. OF THE BHAGAVAD-GITA,Entitled “Sankhya-Yog,”Or “The Book of Doctrines.”', source_title: 'The Bhagavad-Gita', citation_url: 'https://oceanlibrary.com/bhagavad-gita/?paraId=para_44' },
  ];
  const saiedi = [
    { text: "Many of the Báb's writings speak of this station or perspective of the heart, which indeed constitutes the cornerstone of His entire approach to reality.", source_title: 'Gate of the Heart: Understanding the Writings of the Báb', citation_url: 'https://x/p546' },
    { text: 'One can most directly approach noumenal reality through the sanctuary of the heart.', source_title: 'Gate of the Heart: Understanding the Writings of the Báb', citation_url: 'https://x/p871' },
  ];
  const gitaQ = 'Bhagavad Gita 2:47 — the verse about the right to work but not the fruits.';
  const gitaReply = 'The passages in this search don\'t hold the verse about "the right to work but not the fruits" itself. What they do hold is the very end of Chapter II, in the Edwin Arnold translation, which does not number its verses.\n\nThe chapter closes under the title ["Sankhya-Yog," or "The Book of Doctrines"](https://oceanlibrary.com/bhagavad-gita/?paraId=para_44).';

  it('the reader\'s own words given back in quotation marks are not an unverified quotation', () => {
    const out = dropUnverified(gitaReply, gita, { asked: [gitaQ] });
    expect(out.removed).toBe(0);
    expect(out.text).toBe(gitaReply);
  });
  it('…but the reader\'s words LINKED as a source\'s words must still be in a passage', () => {
    expect(unverifiedQuotes('Krishna says ["the right to work but not the fruits"](https://x).', gita, { asked: [gitaQ] })).toHaveLength(1);
  });
  it('a quotation of a passage\'s book title is not an unverified quotation', () => {
    expect(unverifiedQuotes('Saiedi called it "Gate of the Heart: Understanding the Writings of the Báb".', saiedi)).toEqual([]);
  });
  it('the reply\'s opening sentence, leaned on by the next, stays as paraphrase — never "What they do hold…" first', () => {
    const out = dropUnverified(gitaReply, gita);   // no reader words: the opening quotation is unverified
    expect(out.text).toMatch(/^The passages in this search don't hold the verse about the right to work but not the fruits itself\. What they do hold/);
    expect(out.text).not.toMatch(/["“]the right to work/);
    expect(out).toMatchObject({ removed: 0, unquoted: 1 });
    const goth = 'I didn\'t find a passage where Saiedi writes that ["the heart is the gate through which every soul must pass"](https://x/p1) as the reason for his title. What they do show is the idea the title points to.\n\nSaiedi writes that ["One can most directly approach noumenal reality through the sanctuary of the heart"](https://x/p871).';
    const g = dropUnverified(goth, saiedi);
    expect(g.text).toMatch(/^I didn't find a passage where Saiedi writes that the heart is the gate through which every soul must pass as the reason/);
    expect(g.text).not.toContain('](https://x/p1)');
    expect(g.text).toContain('What they do show');
  });
  it('elsewhere, a sentence leaning on a dropped one goes with it; an independent one stays', () => {
    const text = 'Saiedi reads the heart as central to the Báb. He writes that "the heart is the only gate to the divine Word for every soul". That is the closest the passages come to a reason. There is also the word báb itself, which means gate.';
    const out = dropUnverified(text, saiedi);
    expect(out.text).toBe('Saiedi reads the heart as central to the Báb. There is also the word báb itself, which means gate.');
    expect(out.removed).toBe(2);
  });
  it('a follower that quotes a passage is never lost to the cascade: the dropped sentence stays as paraphrase instead', () => {
    const text = 'Saiedi reads the heart as central to the Báb. He calls it "the only gate to the divine Word for every soul". In this sense, he says, "One can most directly approach noumenal reality through the sanctuary of the heart".';
    const out = dropUnverified(text, saiedi);
    expect(out.text).toContain('He calls it the only gate to the divine Word for every soul.');
    expect(out.text).toContain('sanctuary of the heart');
    expect(out).toMatchObject({ removed: 0, unquoted: 1 });
  });
  it('a dummy "It is written:" is not a lean-back, and its verified quotation stays', () => {
    const text = 'The fast is nineteen days. He states "the foundation of all human virtues is justice". It is written: "the best beloved of all things in My sight is Justice".';
    expect(dropUnverified(text, passages).text).toBe('The fast is nineteen days. It is written: "the best beloved of all things in My sight is Justice".');
  });
  it('leansBack: a pronoun or demonstrative in the first two words, or an opening connective — not a later "that"', () => {
    for (const t of ['What they do hold is the end.', 'That is the closest.', 'In this sense the heart…', 'But the passages show…', '**They** say…']) expect(leansBack(t)).toBe(true);
    for (const t of ['Saiedi writes that the heart…', 'There is also the word.', 'The Gita gives the same teaching.', 'Here each person dies once.']) expect(leansBack(t)).toBe(false);
  });
  it('a blockquote whose quotation went loses its source line and every bare ">" (cmp-afterlife Luke)', () => {
    const text = 'The passage I found is Luke\'s account of the rich man and Lazarus:\n\n> "And it came to pass, that the beggar died, and was carried by the angels into Abraham\'s bosom"\n>\n> — [*The Gospel of Luke*](https://siftersearch.com/library/view?doc=20990) (KJV), [link](https://oceanlibrary.com/kjv-gospel-of-luke/?paraId=para_589)\n\nHere each person dies once, and awareness continues after death. The Gita gives the soul a body after body.';
    const out = dropUnverified(text, gita);
    expect(out.text).not.toContain('Gospel of Luke*]');
    expect(out.text).not.toMatch(/^>/m);
    expect(out.text).toContain('Here each person dies once');
  });
  it('a source line standing alone after a dropped blockquote goes too (ref-gita "— [The Bhagavad-Gita, Chapter II](…)")', () => {
    const text = 'Those closing lines describe the person the chapter has been building toward.\n\n> "He who has gone beyond desire and lives free of every longing for the world"\n\n— [The Bhagavad-Gita, Chapter II](https://oceanlibrary.com/bhagavad-gita/?paraId=para_43)\n\nSince this translation gives only the chapter, treat these lines as the neighbourhood of your reference.';
    const out = dropUnverified(text, gita);
    expect(out.text).not.toContain('— [The Bhagavad-Gita');
    expect(out.text).toContain('Since this translation gives only the chapter');
  });
  it('a kept quotation keeps its source line', () => {
    const text = 'Arnold closes the chapter:\n\n> "shaking off the yoke of flesh Lives lord, not servant, of his lusts"\n> — [The Bhagavad-Gita](https://oceanlibrary.com/bhagavad-gita/?paraId=para_43)\n\nHe adds "the foundation of all human virtues is justice" here. More text follows to keep the reply long enough.';
    const out = dropUnverified(text, gita);
    expect(out.text).toContain('> — [The Bhagavad-Gita]');
    expect(out.text).toContain('yoke of flesh Lives lord');
  });
  it('verse stored without its line breaks still verifies ("fleshLives")', () => {
    expect(containsQuote(gita[0].text, 'shaking off the yoke of flesh Lives lord, not servant, of his lusts')).toBe(true);
    expect(containsQuote(gita[0].text, 'shaking off the yoke of the body entirely')).toBe(false);
  });
  it('unquote keeps the words and drops the marks and the link', () => {
    expect(unquote('He wrote ["five words of invented text"](https://x) here, and "five more invented words here".', ['five words of invented text', 'five more invented words here']))
      .toBe('He wrote five words of invented text here, and five more invented words here.');
  });
});
