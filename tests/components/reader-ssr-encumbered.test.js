// A copyrighted (encumbered) book's reader (Chad 10-23): the SSR first view carries its first 40 paragraphs, then the polite
// "Preview ends here" panel with the purchase link — and no load-more trigger.
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import DocumentPresentation from '../../src/components/library/DocumentPresentation.svelte';

const paras = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, paragraph_index: i, text: `Paragraph number ${i} of the modern book.`, blocktype: 'paragraph' }));
const initialData = {
  document: { id: 9, title: 'A Modern Book', author: 'An Author', religion: "Baha'i", collection: 'Books', language: 'en',
    encumbered: true, purchase_url: 'https://example.org/buy', slug: 'an-author_a-modern-book' },
  paragraphs: paras, total: 900, offset: 0, hasMore: false, requiresAuth: false, previewEnded: true, canEdit: false, previewLimit: 40, about: null,
};
const props = { pathReligion: 'bahai', pathCollection: 'books', pathSlug: 'an-author_a-modern-book', initialTitle: 'A Modern Book', initialAuthor: 'An Author' };

describe('encumbered reader SSR', () => {
  it('renders 40 paragraphs, then the preview-end panel with the purchase link, and no load-more', () => {
    const { body } = render(DocumentPresentation, { props: { ...props, initialData } });
    expect(body).toContain('Paragraph number 0 of');
    expect(body).toContain('Paragraph number 39 of');
    expect((body.match(/class="[^"]*\bparagraph-text\b/g) || []).length).toBe(40);
    expect(body).toContain('Preview ends here — this book is under copyright');
    expect(body).toContain('href="https://example.org/buy"');
    expect(body).toContain('Showing the first 40 of 900 paragraphs');
    expect(body).not.toContain('load-more-section');
  });
  it('an unencumbered book shows no panel', () => {
    const open = { ...initialData, document: { ...initialData.document, encumbered: false }, previewEnded: false, hasMore: true, previewLimit: null };
    const { body } = render(DocumentPresentation, { props: { ...props, initialData: open } });
    expect(body).not.toContain('Preview ends here');
    expect(body).toContain('load-more-section');
  });
});

describe('book facts on the reader (book hunt, Chad 10-23)', () => {
  it('renders the author photo, imprint, ISBN and a Buy link', () => {
    const withBook = { ...initialData, document: { ...initialData.document, book: { author_image: 'https://img/a.jpg', author_born: 1921, author_died: 2000,
      publisher: 'George Ronald', year: 1992, isbn: '9780853983439' } } };
    const { body } = render(DocumentPresentation, { props: { ...props, initialData: withBook } });
    expect(body).toContain('src="https://img/a.jpg"');
    expect(body).toContain('An Author (1921–2000)');
    expect(body).toContain('George Ronald · 1992');
    expect(body).toContain('ISBN 9780853983439');
    expect(body).toMatch(/href="https:\/\/example.org\/buy"[^>]*>\s*Buy this book/);
  });
});
