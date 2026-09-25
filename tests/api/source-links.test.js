// Link policy for raw search (Chad, 2026-09-25): core books → OceanLibrary.com, then BahaiLibrary.com, then
// OceanofLights.org, and only then SifterSearch.com. Audit: 0 BahaiLibrary / 0 OceanofLights links out of 435, because
// the document's sourceUrl lives in docs.metadata JSON and the link code only read docs.source_url.
import { describe, it, expect } from 'vitest';
import { linkFor, tierOf } from '../../api/lib/source-links.js';

const base = { id: 7, religion: "Baha'i", collection: 'Biographies', slug: 'fiftieth-anniversary' };

describe('tierOf', () => {
  it('ranks the sites in Chad’s order', () => {
    expect(tierOf('https://oceanlibrary.com/x').tier).toBe(1);
    expect(tierOf('https://bahai-library.com/x').tier).toBe(2);
    expect(tierOf('https://www.oceanoflights.org/x').tier).toBe(3);
    expect(tierOf('https://adibmasumian.com/x').tier).toBe(4);   // another publisher: after the three, before SifterSearch
    expect(tierOf('https://siftersearch.com/library/x').tier).toBe(5);
  });
});

describe('linkFor', () => {
  it('uses the OceanLibrary paragraph link when the document has one', () => {
    const l = linkFor({ ...base, source_url: 'https://oceanlibrary.com/gleanings/?paraId=para_117', metadata: '{"sourceUrl":"https://bahai-library.com/g"}' }, 117);
    expect(l).toMatchObject({ site: 'oceanlibrary.com', tier: 1, paragraph_level: true, url: 'https://oceanlibrary.com/gleanings/?paraId=para_117' });
  });

  // Regression (Chad: "we had this working before"): every OceanLibrary paragraph has a para_id, and search knows it
  // (external_para_id), but results reaching the link builder via the multi-index/HyPE path never got ?paraId= —
  // Paris Talks, Gleanings and Epistle links opened the book's first page.
  it('attaches the known OceanLibrary paragraph id to a book-level OceanLibrary link', () => {
    const l = linkFor({ ...base, source_url: 'https://oceanlibrary.com/paris-talks_abdul-baha', external_para_id: 'para_412' }, 400);
    expect(l).toMatchObject({ url: 'https://oceanlibrary.com/paris-talks_abdul-baha?paraId=para_412', paragraph_level: true, tier: 1 });
  });

  it('never doubles a paraId that is already there', () => {
    const l = linkFor({ ...base, source_url: 'https://oceanlibrary.com/x?paraId=para_1', external_para_id: 'para_1' }, 1);
    expect(l.url).toBe('https://oceanlibrary.com/x?paraId=para_1');
  });

  it('uses the BahaiLibrary sourceUrl from metadata instead of a SifterSearch page', () => {
    const l = linkFor({ ...base, source_url: null, metadata: '{"sourceUrl":"https://bahai-library.com/50th-anniversary_greatest_holy_leaf"}' }, 12);
    expect(l).toMatchObject({ site: 'bahai-library.com', tier: 2, url: 'https://bahai-library.com/50th-anniversary_greatest_holy_leaf' });
  });

  it('ignores a SifterSearch address stored as the source (it is our own page, not a source)', () => {
    const l = linkFor({ ...base, source_url: 'https://siftersearch.com/document/7', metadata: '{"sourceUrl":"https://oceanoflights.org/t/1"}' }, 3);
    expect(l.site).toBe('oceanoflights.org');
  });

  it('always carries a paragraph-exact SifterSearch reader link alongside', () => {
    const l = linkFor({ ...base, source_url: null, metadata: '{"sourceUrl":"https://bahai-library.com/a"}' }, 12);
    expect(l.reader_url).toMatch(/siftersearch\.com\/library\/.+#p12$/);
  });

  it('falls back to the SifterSearch paragraph when nothing else exists', () => {
    const l = linkFor({ ...base, source_url: null, metadata: '{}' }, 5);
    expect(l).toMatchObject({ site: 'siftersearch.com', tier: 5, paragraph_level: true });
  });

  it('survives malformed metadata', () => {
    expect(linkFor({ ...base, source_url: null, metadata: '{not json' }, 1).site).toBe('siftersearch.com');
  });
});
