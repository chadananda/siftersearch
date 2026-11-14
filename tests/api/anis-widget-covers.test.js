// Book, quote and scene cards always carry their book's cover: the search row's, else the image service's by doc id (Chad 11-13).
import { describe, it, expect } from 'vitest';
import * as book from '../../api/lib/assistant/widgets/book.js';
import * as quote from '../../api/lib/assistant/widgets/quote.js';

describe('widget covers', () => {
  it('book card falls back to the cover by doc id', () => {
    const works = new Map([['B1', { id: 20810, title: 'Kitáb-i-Íqán', author: "Bahá'u'lláh", url: 'https://oceanoflights.org/x' }]]);
    expect(book.fromRefs(['B1'], { works, books: new Map() }).cover_url).toBe('https://siftersearch.com/img/covers/20810');
    const books = new Map([['B1', { cover_url: 'https://siftersearch.com/img/covers/20810?v=abc' }]]);
    expect(book.fromRefs(['B1'], { works, books }).cover_url).toBe('https://siftersearch.com/img/covers/20810?v=abc');
  });
  it('quote card falls back to the cover by document id', () => {
    const found = new Map([['P1', { text: 'words', source_url: 'https://x', title: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', document_id: 20894 }]]);
    expect(quote.fromRefs(['P1'], { found }).cover_url).toBe('https://siftersearch.com/img/covers/20894');
  });
});
