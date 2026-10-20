// Chad 10-20: "Authority with doctrine is absolutely critical" — authority weighs in from the outset (fusion), dedup favours
// the canonical copy, and the re-rank favours the authoritative passage that answers.
import { describe, it, expect } from 'vitest';
import { keyFactor, doctrinalFactor, numberFactor, foldKey } from '../../api/lib/search/doctrinal-rank.js';
import { authorKey } from '../../api/lib/search/qdrant-layers.js';

describe('doctrinal factors', () => {
  it('Revelation > interpretation > the House > others; pilgrim notes never authority', () => {
    const f = (a, extra = {}) => doctrinalFactor({ author: a, ...extra }, 7);
    expect(f("Bahá’u’lláh")).toBeGreaterThan(f("‘Abdu’l-Bahá"));
    expect(f('Shoghi Effendi')).toBeGreaterThan(f('Universal House of Justice'));
    expect(f('Universal House of Justice')).toBeGreaterThan(f('Moojan Momen'));
    expect(f("‘Abdu’l-Bahá", { collection: 'Pilgrim Notes' })).toBeLessThan(1);
    expect(keyFactor('abdulbaha', null, 'Pilgrim Notes')).toBeLessThan(1);
  });
  it('a scraped-site copy yields to the library text, at fusion and at re-rank', () => {
    expect(keyFactor('bahaullah', 'supplemental')).toBeLessThan(keyFactor('bahaullah', null));
    expect(doctrinalFactor({ author: "Bahá'u'lláh", source_site: 'bahai-library.com' }, 10)).toBeLessThan(doctrinalFactor({ author: "Bahá'u'lláh", source_site: 'oceanlibrary.com' }, 10));
  });
  it('folding matches the Qdrant payload key', () => {
    for (const n of ["Bahá’u’lláh", 'The Báb', "‘Abdu’l-Bahá", 'Shoghi Effendi']) expect(foldKey(n)).toBe(authorKey(n));
  });
  it('other traditions keep their scripture authority', () => {
    expect(numberFactor(10)).toBeGreaterThan(numberFactor(5));
  });
});

describe('a question is not a quotation (10-20: a PDF restating the question led the answer)', () => {
  it('verbatimLead leaves a question alone, still leads a quotation', async () => {
    const { verbatimLead, isQuestion } = await import('../../api/lib/search/verbatim.js');
    const entries = [{ t: "Prayer is conversation with God — 'Abdu'l-Bahá" }, { t: 'People often ask: what is the purpose of prayer in daily life' }];
    expect(isQuestion('what is the purpose of prayer')).toBe(true);
    expect(verbatimLead(entries, 'what is the purpose of prayer', (e) => e.t)[0]).toBe(entries[0]);
    const q = [{ t: 'other text here and there' }, { t: 'The earth is but one country, and mankind its citizens' }];
    expect(verbatimLead(q, 'The earth is but one country, and mankind its citizens', (e) => e.t)[0]).toBe(q[1]);
  });
});

describe('authenticated text first (10-20)', () => {
  it("'Abdu'l-Bahá quoted in a secondary book counts less than in his own works", () => {
    const own = doctrinalFactor({ author: "‘Abdu’l-Bahá", book_authority: 9 }, 9);
    const recalled = doctrinalFactor({ author: "‘Abdu’l-Bahá", book_authority: 5 }, 7);
    expect(own).toBeGreaterThan(2);
    expect(recalled).toBeLessThanOrEqual(1.3);
  });
});
