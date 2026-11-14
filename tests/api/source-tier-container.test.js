// A passage's tier follows the book that holds it (Chad 11-14: writings → guardian → talks and pilgrim notes → every administrative
// body → scholarship). A Central Figure's or Shoghi Effendi's paragraph in a pilgrim's notes is reported speech; in a House or
// Research Department document it is the House's quotation. Old research sets (no book_author, no collection) included.
import { describe, it, expect } from 'vitest';
import { sourceTier, REPORTED_DOCS, HOUSE_DOCS } from '../../api/lib/assistant/source-tier.js';
import { leadSource } from '../../api/lib/assistant/reply-form.js';

const B = 'Bahá’í';
const ISSUES = 'Issues Related to the Study of the Bahá’í Faith';

describe('pilgrim notes: reported, whoever is quoted', () => {
  it('doc 9495-like: May Maxwell’s notes, paragraphs authored Shoghi Effendi', () => {
    const full = { author: 'Shoghi Effendi', book_author: 'May Maxwell', title: 'Pilgrimage (Extracts)', collection: 'Pilgrim Notes', religion: B, document_id: 9495 };
    expect(sourceTier(full)).toBe('reported');
    expect(sourceTier({ author: 'Shoghi Effendi', title: 'Pilgrimage (Extracts)', religion: B })).toBe('reported');          // old research set
    expect(sourceTier({ author: 'Shoghi Effendi', title: 'Extracts', religion: B, document_id: 9495 })).toBe('reported');     // by id
    expect(sourceTier({ author: '‘Abdu’l-Bahá', title: 'An Early Pilgrimage', religion: B })).toBe('reported');
    expect(REPORTED_DOCS).toContain(9495);
  });
  it('a Writing named for pilgrimage stays a Writing', () => {
    expect(sourceTier({ author: 'Bahá’u’lláh', title: 'Súriy-i-Ḥajj (Tablet of Pilgrimage)', religion: B })).toBe('writings');
  });
});

describe('administrative bodies: the House tier, not the quoted figure’s', () => {
  it('doc 20822-like: a Research Department compilation paragraph authored Bahá’u’lláh', () => {
    expect(sourceTier({ author: 'Bahá’u’lláh', book_author: 'Research Department of the Universal House of Justice', title: ISSUES, religion: B })).toBe('house');
    expect(sourceTier({ author: 'Bahá’u’lláh', title: ISSUES, religion: B, collection: 'Research Department Compilations' })).toBe('house');
    expect(sourceTier({ author: 'Bahá’u’lláh', title: ISSUES, religion: B, document_id: 20822 })).toBe('house');             // old set: id only
    expect(HOUSE_DOCS).toContain(20822);
  });
  it('NSA, LSA, ITC, ABM documents and House letters by title', () => {
    expect(sourceTier({ author: 'Shoghi Effendi', book_author: 'National Spiritual Assembly of the United States', title: 'Guidelines', religion: B })).toBe('house');
    expect(sourceTier({ author: '‘Abdu’l-Bahá', book_author: 'International Teaching Centre', title: 'Notes', religion: B })).toBe('house');
    expect(sourceTier({ author: 'Bahá’u’lláh', book_author: 'Auxiliary Board member', title: 'Notes', religion: B })).toBe('house');
    expect(sourceTier({ author: 'Bahá’u’lláh', title: 'Letter from the Universal House of Justice dated 1 May 2000', religion: B })).toBe('house');
  });
  it('an edited volume is not the House’s own words; a letter TO an assembly stays its writer’s', () => {
    expect(sourceTier({ author: 'Bahá’u’lláh', book_author: 'The Universal House of Justice (prepared under its supervision)', title: 'The Bahá’í World', religion: B })).toBe('secondary');
    expect(sourceTier({ author: 'Shoghi Effendi', title: 'Letters of Shoghi Effendi to the National Spiritual Assembly of the British Isles', religion: B })).toBe('guardian');
  });
});

describe('own works keep their tier', () => {
  it('Gleanings, the Hidden Words, a Shoghi Effendi book — with and without book_author', () => {
    for (const p of [{ author: 'Bahá’u’lláh', book_author: 'Bahá’u’lláh', title: 'Gleanings from the Writings of Bahá’u’lláh', collection: 'Core Tablets' },
      { author: 'Bahá’u’lláh', title: 'Gleanings from the Writings of Bahá’u’lláh' }, { author: 'Bahá’u’lláh', title: 'The Hidden Words' },
      { author: 'The Báb', title: 'Selections from the Writings of the Báb' }]) expect(sourceTier({ ...p, religion: B }), p.title).toBe('writings');
    expect(sourceTier({ author: 'Shoghi Effendi', book_author: 'Shoghi Effendi', title: 'God Passes By', religion: B })).toBe('guardian');
    expect(sourceTier({ author: 'Shoghi Effendi', title: 'The World Order of Bahá’u’lláh', religion: B })).toBe('guardian');
  });
  it('an old-set compilation title that does not name the writer: compilation, never promoted to writings', () => {
    expect(sourceTier({ author: 'Bahá’u’lláh', title: 'A Compilation on Trustworthiness', religion: B })).toBe('compilation');
    expect(sourceTier({ author: 'Bahá’u’lláh', book_author: 'Compilation (Bahá’í Writings)', title: 'A Compilation on Trustworthiness', religion: B })).toBe('writings');
  });
});

describe('leadSource on the 1xebxqv shape (old research set, no book_author)', () => {
  it('a House passage authored Bahá’u’lláh quoted before Gleanings → the lead rewrite fires', () => {
    const found = new Map([['P1', { author: 'Bahá’u’lláh', title: ISSUES, religion: B, document_id: 20822 }],
      ['P2', { author: 'Bahá’u’lláh', title: 'Gleanings from the Writings of Bahá’u’lláh', religion: B, document_id: 1 }]]);
    expect(leadSource('{{quote P1}}\n\nBahá’u’lláh wrote:\n\n{{quote P2}}', found)).toMatchObject({ first: 'P1', core: 'P2', firstTier: 'house' });
  });
});
