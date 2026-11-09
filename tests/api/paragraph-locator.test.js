// Citable locator per paragraph (digest #156): traditional number first, else the nearest real section heading.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { paragraphLocator } from '../../api/lib/refs/locator.js';
import { paragraphDoc } from '../../api/lib/paragraphs-repo.js';
import { toPassage } from '../../api/lib/assistant/tools.js';
import { passageHeader } from '../../api/lib/assistant/prompt.js';

describe('paragraphLocator', () => {
  it('traditional numbers: Gleanings section (continuations keep the section), Hidden Words, Íqán / Aqdas paragraph, Q&A', () => {
    expect(paragraphLocator({ pn: 'CXVII' })).toBe('#117.1');
    expect(paragraphLocator({ pn: 'CXVII.2', heading: 'CXVII' })).toBe('#117.2');   // Roman → Arabic, section.paragraph
    expect(paragraphLocator({ pn: 'IV.3' })).toBe('#4.3');
    expect(paragraphLocator({ pn: 'Arabic 5' })).toBe('Arabic #5');
    expect(paragraphLocator({ pn: 12 })).toBe('#12');
    expect(paragraphLocator({ pn: 'Q&A 3' })).toBe('Q&A #3');
  });
  it('no number → the nearest section heading, cleaned; never noise, the book title, or runaway text', () => {
    expect(paragraphLocator({ heading: '11 -<br><br>Lawḥ-i-Maqṣúd', title: 'Tablets of Bahá’u’lláh' })).toBe('Lawḥ-i-Maqṣúd');
    expect(paragraphLocator({ heading: 'The Valley of Search', title: 'The Seven Valleys' })).toBe('The Valley of Search');
    expect(paragraphLocator({ heading: 'The Seven Valleys', title: 'The Seven Valleys' })).toBeNull();
    expect(paragraphLocator({ heading: 'Page 12' })).toBeNull();
    expect(paragraphLocator({ heading: '* * *' })).toBeNull();
    expect(paragraphLocator({ heading: 'x'.repeat(90) })).toBeNull();
    expect(paragraphLocator({})).toBeNull();
  });
});

describe('the locator reaches search hits and Anís passages', () => {
  it('paragraphDoc carries it (from the row pn + heading), toPassage passes it to the writer', () => {
    const d = paragraphDoc({ id: 1, doc_id: 2, paragraph_index: 3, text: 't', heading: 'CXVII', pn: 'CXVII.2', para_ord: 2 },
      { title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', religion: 'Bahá’í' }, 10);
    expect(d.locator).toBe('#117.2'); expect(d.para_no).toBe(2);
    expect(toPassage(d).locator).toBe('#117.2');
    expect(toPassage({ id: 1, text: 't' })).not.toHaveProperty('locator');
  });
  it('the writer sees it in the passage header', () => {
    expect(passageHeader({ source_title: 'Gleanings from the Writings of Bahá’u’lláh', locator: '#117.2', text: 't' }, 0)).toMatch(/^\[1\] Gleanings from the Writings of Bahá’u’lláh · at #117\.2/);
    expect(passageHeader({ source_title: 'X', text: 't' }, 0)).not.toMatch(/ · at /);
  });
  it('paragraphsByIds reads the pn in the same one batched query (no extra read)', () => {
    const src = readFileSync(new URL('../../api/lib/paragraphs-repo.js', import.meta.url), 'utf8');
    expect(src).toMatch(/json_extract\(c\.block_attrs, '\$\.pn'\) AS pn,[\s\S]*'search:hydrate'/);
  });
});
