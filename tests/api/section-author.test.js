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
