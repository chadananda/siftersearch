// Quoted words look different from Anís's own (Chad 11-04): markQuotes marks only words a passage holds (inline italic,
// a long one a blockquote with its citation under it, RTL upright); styleQuotes renders it for the site and for email.
import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import { markQuotes, LONG_QUOTE_WORDS } from '../../api/lib/assistant/quotes.js';
import { styleQuotes, QUOTE_INK } from '../../api/lib/quote-style.js';
import { markdownHtml } from '../../api/lib/mail-render.js';

const LONG = 'The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me, and neglect it not that I may confide in thee. By its aid thou shalt see with thine own eyes and not through the eyes of others, and shalt know of thine own knowledge';
const passages = [
  { text: `O Son of Spirit! ${LONG} and not through the knowledge of thy neighbor.` },
  { text: 'The earth is but one country, and mankind its citizens.' },
];
const URL = 'https://oceanlibrary.com/hidden-words#2';

describe('markQuotes — span marking', () => {
  it('italicises a held quotation', () => {
    const { text, marked: n } = markQuotes('He wrote that “The earth is but one country” and meant it.', passages);
    expect(text).toBe('He wrote that *“The earth is but one country”* and meant it.');
    expect(n).toBe(1);
  });

  it('italicises a held linked quotation inside the link', () => {
    const { text } = markQuotes(`He wrote [“The earth is but one country”](${URL}) — *Gleanings*.`, passages);
    expect(text).toBe(`He wrote [*“The earth is but one country”*](${URL}) — *Gleanings*.`);
  });

  it('never italicises words no passage holds — and strips italics the writer put on them', () => {
    expect(markQuotes('He taught “unity is the foundation of all human virtues” to all.', passages).text)
      .toBe('He taught “unity is the foundation of all human virtues” to all.');
    expect(markQuotes('He taught *“unity is the foundation of all human virtues”* to all.', passages).text)
      .toBe('He taught “unity is the foundation of all human virtues” to all.');
    expect(markQuotes(`See [*“unity is the foundation of all human virtues”*](${URL}).`, passages).text)
      .toBe(`See [“unity is the foundation of all human virtues”](${URL}).`);
  });

  it('leaves a one-word quoted term alone', () => {
    expect(markQuotes('The word “justice” recurs.', passages).text).toBe('The word “justice” recurs.');
  });

  it('is idempotent', () => {
    const once = markQuotes(`He wrote [“The earth is but one country”](${URL}).`, passages).text;
    expect(markQuotes(once, passages).text).toBe(once);
  });

  it(`turns a held quotation over ${LONG_QUOTE_WORDS} words that ends its sentence into a blockquote with its citation under it`, () => {
    const { text, blocks } = markQuotes(`Bahá'u'lláh writes, [“${LONG}”](${URL}) — *The Hidden Words*. Then more.`, passages);
    expect(blocks).toBe(1);
    expect(text).toBe(`Bahá'u'lláh writes:\n\n> [“${LONG}”](${URL})  \n> — *The Hidden Words*\n\nThen more.`);
    expect(marked.parse(text, { async: false })).toContain('</a><br>— <em>The Hidden Words</em>');
  });

  it('keeps a long quotation inline when the sentence goes on after it', () => {
    const { text, blocks } = markQuotes(`He says [“${LONG}”](${URL}) because justice is the light of men.`, passages);
    expect(blocks).toBe(0);
    expect(text).toContain(`[*“${LONG}”*](${URL})`);
  });

  it('blocks a long bare quotation whose own words end the sentence', () => {
    const { text, blocks } = markQuotes(`He wrote “${LONG}.” Justice is the light.`, [{ text: `${LONG}. More words.` }]);
    expect(blocks).toBe(1);
    expect(text).toBe(`He wrote:\n\n> “${LONG}.”\n\nJustice is the light.`);
  });

  it('keeps a short quotation inline (threshold)', () => {
    expect(markQuotes(`He wrote [“The earth is but one country”](${URL}).`, passages, { longWords: 30 }).blocks).toBe(0);
  });

  it('wraps a whole Arabic/Persian line in a Latin reply so it renders as a quotation', () => {
    const { text } = markQuotes('The original reads:\n\nیا ابن الروح احبّ الاشیاء عندی الانصاف\n\nIt means justice.', passages);
    expect(text).toBe('The original reads:\n\n*یا ابن الروح احبّ الاشیاء عندی الانصاف*\n\nIt means justice.');
  });

  it('leaves code fences and existing blockquote lines alone', () => {
    const src = '```\n“The earth is but one country”\n```\n\n> “The earth is but one country”';
    expect(markQuotes(src, passages).text).toBe(src);
  });
});

describe('styleQuotes — rendered HTML', () => {
  it('inline: an em that opens with a quotation mark gets the quote class; other italics do not', () => {
    const html = marked.parse(`He wrote [*“The earth is but one country”*](${URL}) — *Gleanings*.`, { async: false });
    const out = styleQuotes(html);
    expect(out).toContain(`<a href="${URL}"><em class="quote">“The earth is but one country”</em></a>`);
    expect(out).toContain('<em>Gleanings</em>');
  });

  it('block: a blockquote is a quotation block', () => {
    const out = styleQuotes(marked.parse(`> [“${LONG}”](${URL})\n> — *The Hidden Words*`, { async: false }));
    expect(out).toContain('<blockquote class="quote">');
    expect(out).toContain('<em>The Hidden Words</em>');
  });

  it('rtl: Arabic/Persian italics become an upright rtl quotation', () => {
    const out = styleQuotes(marked.parse('*یا ابن الروح احبّ الاشیاء*', { async: false }));
    expect(out).toContain('<em class="quote" dir="rtl">یا ابن الروح احبّ الاشیاء</em>');
  });

  it('inline-style mode (email) carries the colour and keeps rtl upright', () => {
    const out = styleQuotes('<p><em>“One country”</em> <em>یا ابن الروح</em></p><blockquote><p>x</p></blockquote>', { inline: true, color: '#123456' });
    expect(out).toContain('<em style="color:#123456;font-style:italic">“One country”</em>');
    expect(out).toContain('<em dir="rtl" style="color:#123456;font-style:normal">یا ابن الروح</em>');
    expect(out).toContain('<blockquote style="color:#123456">');
  });

  it('a second pass changes nothing', () => {
    const once = styleQuotes('<p><em>“One country”</em></p><blockquote>x</blockquote>');
    expect(styleQuotes(once)).toBe(once);
  });
});

describe('email — markdownHtml', () => {
  it('colours inline quotations and blockquotes in the quotation ink', () => {
    const html = markdownHtml(`He wrote [*“The earth is but one country”*](${URL}).\n\n> [“${LONG}”](${URL})\n> — *The Hidden Words*`);
    expect(html).toMatch(new RegExp(`<em[^>]*style="color:${QUOTE_INK.light};font-style:italic"[^>]*>“The earth`));
    expect(html).toMatch(new RegExp(`<blockquote[^>]*color:\\s*${QUOTE_INK.light}`));
  });

  it('keeps an Arabic quotation upright', () => {
    const html = markdownHtml('*یا ابن الروح احبّ الاشیاء*');
    expect(html).toMatch(/<em[^>]*font-style:normal[^>]*>یا ابن الروح/);
  });
});
