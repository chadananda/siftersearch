// Write rules of the window classifier's production run (scripts/authorship/window-core.mjs nextAuthors).
import { describe, it, expect } from 'vitest';
import { nextAuthors, sameAsAuthor } from '../../scripts/authorship/window-core.mjs';

const book = { author: 'Nabil Zarandi' };
const row = (authors, model = null) => ({ authors: JSON.stringify(authors), authors_model: model });

describe('window run write rules', () => {
  it('treats the brief\'s spelling of the book author as the book author', () => {
    expect(sameAsAuthor('Nabíl', 'Nabil Zarandi')).toBe(true);
    expect(sameAsAuthor('Mírzá Jání', 'Mírzá Ḥusayn')).toBe(false);
  });
  it('sets a speaker where the reader only had the book default, and adds the quoted person', () => {
    const n = nextAuthors(row([{ name: 'Nabil Zarandi', role: 'author', basis: 'book' }]), { speaker: 'The Báb', quotes: 'Qur’án', conf: 0.9 }, book);
    expect(n.changed).toBe(true);
    expect(n.authors[0]).toMatchObject({ name: 'The Báb', basis: 'window' });
    expect(n.authors.find((e) => e.role === 'quoted').name).toBe('Qur’án');
  });
  it('keeps the book default (one spelling) when the speaker is the book author, adding only the quote', () => {
    const n = nextAuthors(row([{ name: 'Nabil Zarandi', role: 'author', basis: 'book' }]), { speaker: 'Nabíl', quotes: 'The Báb' }, book);
    expect(n.changed).toBe(false);
    expect(n.authors[0]).toMatchObject({ name: 'Nabil Zarandi', basis: 'book' });
    expect(n.authors[1]).toMatchObject({ name: 'The Báb', role: 'quoted', basis: 'window' });
  });
  it('never changes an evidence-backed author, an official-edition row or a structural line', () => {
    expect(nextAuthors(row([{ name: 'Shoghi Effendi', role: 'author', basis: 'trailer' }]), { speaker: 'Bahá’u’lláh' }, book)).toBeNull();
    expect(nextAuthors(row([{ name: 'X', role: 'author', basis: 'book' }], 'official-sections-2026-10-08'), { speaker: 'Bahá’u’lláh' }, book)).toBeNull();
    expect(nextAuthors(row([{ name: null, role: 'heading', basis: 'heading' }]), { speaker: 'Bahá’u’lláh', quotes: 'The Báb' }, book)).toBeNull();
  });
  it('replaces its own earlier quoted entry and keeps the reader\'s', () => {
    const cur = [{ name: 'Nabil Zarandi', role: 'author', basis: 'book' }, { name: 'Bahá’u’lláh', role: 'quoted', basis: 'reference' }, { name: 'Old', role: 'quoted', basis: 'window' }];
    const n = nextAuthors(row(cur), { speaker: 'Nabíl', quotes: 'The Báb' }, book);
    expect(n.authors.filter((e) => e.role === 'quoted').map((e) => e.name)).toEqual(['Bahá’u’lláh', 'The Báb']);
  });
  it('is idempotent', () => {
    const first = nextAuthors(row([{ name: 'Nabil Zarandi', role: 'author', basis: 'book' }]), { speaker: 'The Báb', quotes: null, conf: 0.9 }, book);
    expect(nextAuthors(row(first.authors), { speaker: 'The Báb', quotes: null, conf: 0.9 }, book)).toBeNull();
  });
});
