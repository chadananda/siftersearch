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

describe('window run protects trailer-prev', () => {
  it('never changes an author the reader took from the previous attribution line', () => {
    expect(nextAuthors(row([{ name: 'Bahá’u’lláh', role: 'author', basis: 'trailer-prev' }]), { speaker: 'John E. Esslemont' }, { author: 'John E. Esslemont' })).toBeNull();
  });
});

describe('window run skips no-op author changes', () => {
  it('leaves a book default (any spelling) or a missing entry alone when the speaker is the book author', () => {
    const b = { author: "'Abdu'l-Bahá" };
    expect(nextAuthors(row([{ name: '‘Abdu’l-Bahá', role: 'author', basis: 'book' }]), { speaker: '‘Abdu’l-Bahá' }, b)).toBeNull();
    expect(nextAuthors(row([]), { speaker: '‘Abdu’l-Bahá' }, b)).toBeNull();
    expect(nextAuthors(row([{ name: 'Bahá’u’lláh', role: 'author', basis: 'system1' }]), { speaker: '‘Abdu’l-Bahá' }, b).changed).toBe(true);
  });
});

describe('compilations and on-behalf letters (v18)', () => {
  it('never sets a compilation default over a paragraph', () => {
    const b = { author: "Compilation (Bahá'í Writings)" };
    expect(nextAuthors(row([{ name: '‘Abdu’l-Bahá', role: 'author', basis: 'system1' }]), { speaker: "Compilation (Bahá'í Writings)" }, b)).toBeNull();
  });
  it('credits a letter written on behalf of Shoghi Effendi to him', async () => {
    const { refineLabel } = await import('../../scripts/authorship/window-core.mjs');
    const r = { text: '“I am directed by Shoghi Effendi to inform you that Mr. Yadullah Mobasser came last February”', heading: '' };
    const l = refineLabel({ speaker: 'H. Rabbání', quotes: null, conf: 0.8 }, r, { text: 'x' }, null, { author: 'Shoghi Effendi' });
    expect(l).toMatchObject({ speaker: 'Shoghi Effendi', on_behalf: true });
  });
});

describe('Shoghi Effendi secretaries (v18b)', () => {
  it('in his own books, a secretary\'s letter or "the Guardian’s …" is his, on his behalf', async () => {
    const { refineLabel } = await import('../../scripts/authorship/window-core.mjs');
    const se = { author: 'Shoghi Effendi' };
    expect(refineLabel({ speaker: 'Rúḥí Afnán', conf: 0.8 }, { text: '“As I told you in my previous letter, by law such lands can only be transferred during one’s lifetime.”' }, null, null, se)).toMatchObject({ speaker: 'Shoghi Effendi', on_behalf: true });
    expect(refineLabel({ speaker: 'R. Rabbání', conf: 0.8 }, { text: '“The Guardian’s motive in giving the believers the promise of one year’s respite was to alleviate the burden.”' }, null, null, se)).toMatchObject({ speaker: 'Shoghi Effendi' });
    expect(refineLabel({ speaker: 'Public Relations Committee', conf: 0.8 }, { text: '“Though it has been grievous to us to forego our advertising schedule, the Committee recognizes…”' }, null, null, se).speaker).toBe('Public Relations Committee');
  });
});
