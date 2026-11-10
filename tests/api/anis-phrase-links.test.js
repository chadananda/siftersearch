// Quote links highlight the quoted phrase, not the whole paragraph (Chad 11-10, God Passes By ¶868 "private property").
import { describe, it, expect } from 'vitest';
import { narrowQuoteLinks, narrowOceanLink } from '../../api/lib/assistant/quotes.js';
import { upgradeOceanLinks } from '../../api/lib/ocean-links.js';

const URL = 'https://oceanlibrary.com/god-passes-by_shoghi-effendi/?paraId=para_868&selectionString=god_passes_by_ocean_en_qv.0~god_passes_by_ocean_en_qv.701';

describe('narrowQuoteLinks', () => {
  it('a link whose text is a quotation selects those words', () => {
    const out = narrowQuoteLinks(`[*"the institution of private property"*](${URL}) — *God Passes By*.`);
    expect(out).not.toContain('selectionString');
    expect(out).toContain('?paraId=para_868#~q=the%20institution%20of%20private%20property)');
  });
  it('a citation right after a quotation selects the quotation', () => {
    const out = narrowQuoteLinks(`He writes *"on the institution of private property"* ([God Passes By, ¶868](${URL})).`);
    expect(out).toContain('#~q=on%20the%20institution%20of%20private%20property');
  });
  it('a link with no quotation near it keeps the paragraph', () => {
    const s = `See [God Passes By](${URL}) for the Russian crisis.`;
    expect(narrowQuoteLinks(s)).toBe(s);
  });
  it('an elided quotation selects its longest piece; one word is not narrowed', () => {
    expect(narrowOceanLink(URL, 'the sanctity of family life … private property')).toContain('#~q=the%20sanctity%20of%20family%20life');
    expect(narrowOceanLink(URL, 'property')).toBe(URL);
  });
  it('the output pass turns the marker into a range over just the phrase', async () => {
    const text = 'the growing realization of the implications of its principles, with their emphasis on religion, on the sanctity of family life, on the institution of private property, and their repudiation';
    const repo = { oceanParagraphs: async () => [{ slug: 'god-passes-by_shoghi-effendi', pid: 'para_868', block_attrs: JSON.stringify({ ilm_id: 'qv' }), external_id: 'god_passes_by_ocean_en', text }] };
    const out = await upgradeOceanLinks(narrowQuoteLinks(`[*"the institution of private property"*](${URL})`), { repo });
    const sel = decodeURIComponent(out.match(/selectionString=([^)]+)/)[1]);
    const [a, b] = sel.split('~').map((x) => Number(x.split('.').pop()));
    expect(b - a).toBe('theinstitutionofprivateproperty'.length);
  });
});
