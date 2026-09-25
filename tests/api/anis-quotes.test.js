// A companion that presents invented words as scripture has failed at the one thing it must never do.
// Live 2026-09-24: gpt-4o-mini quoted three lines "Bahá'u'lláh states" that appear in no retrieved passage.
import { describe, it, expect } from 'vitest';
import { unverifiedQuotes, dropUnverified } from '../../api/lib/anis/quotes.js';

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
    expect(out.text).toMatch(/couldn.t find|could not find/i);
    expect(out.removed).toBe(1);
  });

  it('leaves a reply with no quotes untouched', () => {
    expect(dropUnverified('Hello! I am Anis.', passages)).toEqual({ text: 'Hello! I am Anis.', removed: 0 });
  });
});

// Streaming must never SHOW an invented quote, even for the moment before the final text replaces it.
import { createSentenceGate } from '../../api/lib/anis/quotes.js';
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
