// A book section credited to its real writer (Chad 10-12: the Dawn-Breakers introduction is George Townshend's).
import { describe, it, expect } from 'vitest';
import { sectionAuthorChange } from '../../api/lib/ops/section-author.js';

const GT = 'George Townshend';
describe('sectionAuthorChange', () => {
  it('a paragraph defaulted to the book author becomes the section writer', () => {
    expect(sectionAuthorChange(JSON.stringify([{ name: 'Nabíl', role: 'author', basis: 'book' }]), GT))
      .toEqual([{ name: GT, role: 'author', basis: 'section' }]);
  });
  it('a paragraph with no record gets one', () => {
    expect(sectionAuthorChange(null, GT)).toEqual([{ name: GT, role: 'author', basis: 'section' }]);
  });
  it('someone else’s words inside the section (a named quoted writer) are left alone', () => {
    expect(sectionAuthorChange(JSON.stringify([{ name: 'Lord Curzon', role: 'author', basis: 'window' }]), GT)).toBeNull();
  });
  it('quoted names are kept beside the new writer', () => {
    expect(sectionAuthorChange(JSON.stringify([{ name: 'Nabíl', role: 'author', basis: 'book' }, { name: 'Bahá’u’lláh', role: 'quoted' }]), GT))
      .toEqual([{ name: GT, role: 'author', basis: 'section' }, { name: 'Bahá’u’lláh', role: 'quoted' }]);
  });
  it('already right → no change', () => {
    expect(sectionAuthorChange(JSON.stringify([{ name: GT, role: 'author', basis: 'section' }]), GT)).toBeNull();
  });
  it('a reader placeholder ("the editor or reporter") is replaced', () => {
    expect(sectionAuthorChange(JSON.stringify([{ name: 'the editor or reporter', role: 'author', basis: 'window' }]), GT))
      .toEqual([{ name: GT, role: 'author', basis: 'section' }]);
  });
  it('force corrects a named misattribution', () => {
    expect(sectionAuthorChange(JSON.stringify([{ name: 'The Báb', role: 'author', basis: 'window' }]), 'Lord Curzon', { force: true }))
      .toEqual([{ name: 'Lord Curzon', role: 'author', basis: 'section' }]);
  });
});

describe('sectionAuthorChange — quoted voices and structural lines', () => {
  const UHJ = 'Universal House of Justice', B = 'Bahá’u’lláh';
  it('a compiler paragraph credited by the book default to Bahá’u’lláh → the House, Bahá’u’lláh kept only as a quoted voice', () => {
    expect(sectionAuthorChange(JSON.stringify([{ name: B, role: 'author', basis: 'book', unresolved: true }]), UHJ, { quoted: [B] }))
      .toEqual([{ name: UHJ, role: 'author', basis: 'section' }, { name: B, role: 'quoted', basis: 'section' }]);
  });
  it('a quoted voice already present is not added twice; already right → no change', () => {
    const cur = [{ name: UHJ, role: 'author', basis: 'section' }, { name: B, role: 'quoted', basis: 'window' }];
    expect(sectionAuthorChange(JSON.stringify(cur), UHJ, { quoted: [B] })).toBeNull();
  });
  it('role heading marks a stray heading as structural (no writer)', () => {
    expect(sectionAuthorChange(JSON.stringify([]), null, { role: 'heading' })).toEqual([{ name: null, role: 'heading', basis: 'section' }]);
    expect(sectionAuthorChange(JSON.stringify([{ name: null, role: 'heading', basis: 'section' }]), null, { role: 'heading' })).toBeNull();
  });
});
