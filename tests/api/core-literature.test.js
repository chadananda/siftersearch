// Core literature (Chad 11-03): only the Writings (Báb, Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi) in an authenticated book and
// other traditions' scripture are where a quotation comes FROM; commentary, scholarship, talks and pilgrim notes are not.
import { describe, it, expect } from 'vitest';
import { isCoreLiterature } from '../../api/lib/rights/canonical.js';

const B = "Baha'i";
describe('isCoreLiterature', () => {
  it('the Writings in their own authenticated book are core (library shelf or OceanLibrary copy)', () => {
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', religion: B, collection: 'Core Publications', book_authority: 8 })).toBe(true);
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', religion: B, collection: 'Bahá’u’lláh', source_site: 'oceanlibrary.com', book_authority: 8 })).toBe(true);
    // OceanLibrary's Shoghi Effendi and 'Abdu'l-Bahá works carry authority 7 (no shelf meta): still core
    expect(isCoreLiterature({ author: 'Shoghi Effendi', religion: B, collection: 'Shoghi Effendi', source_site: 'oceanlibrary.com', book_authority: 7 })).toBe(true);
    expect(isCoreLiterature({ author: '‘Abdu’l-Bahá', religion: B, collection: 'Core Talks', book_authority: 9 })).toBe(true);
  });
  it('a commentary writer is not core, whatever the shelf', () => {
    expect(isCoreLiterature({ author: 'John Huddleston', religion: B, collection: "Baha'i Books", book_authority: 5 })).toBe(false);
    expect(isCoreLiterature({ author: 'Universal House of Justice', religion: B, collection: 'Administrative', book_authority: 4 })).toBe(false);
  });
  it('the Writings QUOTED in a secondary book, a talk or a pilgrim note are not core', () => {
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', religion: B, collection: "Baha'i Books", book_authority: 5 })).toBe(false);
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', religion: B, collection: 'Papers', book_authority: 3 })).toBe(false);
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', religion: B, collection: 'Media', book_authority: 2 })).toBe(false);
    expect(isCoreLiterature({ author: '‘Abdu’l-Bahá', religion: B, collection: 'Pilgrim Notes', book_authority: 7 })).toBe(false);
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', religion: B, collection: 'Administrative', book_authority: 4 })).toBe(false);
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', religion: B, collection: 'Core Publications', source_site: 'bahai-library.com', book_authority: 5 })).toBe(false);
  });
  it("other traditions: scripture is core; their modern scholarship is not", () => {
    expect(isCoreLiterature({ author: 'Paul', religion: 'Christian', collection: 'The Bible (KJV)', source_site: 'oceanlibrary.com' })).toBe(true);
    expect(isCoreLiterature({ author: 'Muhammad', religion: 'Islam', collection: "Qur'an", book_authority: 10 })).toBe(true);
    expect(isCoreLiterature({ author: 'Karen Armstrong', religion: 'Islam', collection: 'History and Scholarship', book_authority: 4 })).toBe(false);
    expect(isCoreLiterature({ author: 'X', religion: 'Hindu', collection: 'Gita commentary', book_authority: 5 })).toBe(false);
  });
  it('missing facts fail closed', () => {
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', collection: 'Core Publications', book_authority: 8 })).toBe(false);
    expect(isCoreLiterature({ author: 'Bahá’u’lláh', religion: B, collection: 'Core Publications' })).toBe(false);
    expect(isCoreLiterature({})).toBe(false);
  });
});
