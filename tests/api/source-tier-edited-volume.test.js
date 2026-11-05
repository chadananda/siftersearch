// An author field naming who supervised or edited a volume is not the passage's writer (11-04: an essay reprinted in The Bahá'í
// World was replied as "the House quotes it"). Made-up volumes; the House's own letters keep their tier.
import { describe, it, expect } from 'vitest';
import { sourceTier, tierLabel } from '../../api/lib/assistant/source-tier.js';

const B = { religion: 'Bahá’í', collection: '' };
describe('edited volumes', () => {
  it('a volume prepared under the House\'s supervision is an anthology: secondary, labelled not-the-House', () => {
    const p = { ...B, author: 'The Universal House of Justice (prepared under its supervision)', title: 'An Annual Record, Volume IX' };
    expect(sourceTier(p)).toBe('secondary');
    expect(tierLabel(p)).toMatch(/not its words/);
    expect(tierLabel(p)).toMatch(/never "the House says"/);
  });
  it('other editorial markers too, and the Research Department as editor', () => {
    expect(sourceTier({ ...B, author: 'Universal House of Justice (editor)', title: 'Essays on Service' })).toBe('secondary');
    expect(sourceTier({ ...B, author: 'Research Department, edited by', title: 'Collected Studies' })).toBe('secondary');
  });
  it('the House\'s own messages keep the house tier, with no anthology note', () => {
    const p = { ...B, author: 'The Universal House of Justice', title: 'Messages 1963 to 1986' };
    expect(sourceTier(p)).toBe('house');
    expect(tierLabel(p)).not.toMatch(/not its words/);
  });
  it('a Central Figure quoted inside a supervised anthology is a pointer, not the text', () => {
    const p = { ...B, author: '‘Abdu’l-Bahá', book_author: 'The Universal House of Justice (prepared under its supervision)', title: 'An Annual Record, Volume IX' };
    expect(sourceTier(p)).toBe('secondary');
    expect(sourceTier({ ...p, book_author: 'The Universal House of Justice' })).toBe('writings');   // the House's own compilation: unchanged
  });
  it('a plain scholar\'s book is untouched', () => {
    expect(sourceTier({ ...B, author: 'A. Scholar', title: 'A Study' })).toBe('secondary');
    expect(tierLabel({ ...B, author: 'A. Scholar', title: 'A Study' })).not.toMatch(/House/);
  });
});
