// OceanLibrary range links — rules verified against the live site 2026-10-08 (see api/lib/ocean-range.js).
import { describe, it, expect } from 'vitest';
import { siteOffset, ilmid, findSpan, rangeUrl, quoteUrl, countedMask } from '../../api/lib/ocean-range.js';

const visible = (t) => [...t].filter((_, i) => countedMask(t)[i]).join('');

describe('ocean-range', () => {
  it('counts non-whitespace characters (start 10 lands on "of" in "O ye peoples of")', () => {
    const t = 'O ye peoples of the world!';
    expect(siteOffset(t, t.indexOf('of'))).toBe(10);
    expect(siteOffset('Say: From My laws the sweet', 'Say: From My laws the swe'.length)).toBe(20);
  });

  it('skips markup the site does not display', () => {
    expect(visible('Justice’_,_ p. 30')).toBe('Justice’,p.30');
    expect(visible('enclosed by “\\[\\],”[^1] while')).toBe('enclosedby“[],”while');
    expect(visible('TO [pg xix] you')).toBe('TOyou');
    expect(visible('![The Inmost Shrine](img/x.jpg) of')).toBe('TheInmostShrineof');
    expect(visible('the S̱háh')).toBe('theSháh');
  });

  it('builds data-ilmid with "-" for bl… ids and "_" otherwise', () => {
    expect(ilmid('a_chaste_and_holy_life_bahai_ocean_en', 'bl30')).toBe('a_chaste_and_holy_life_bahai_ocean_en-bl30');
    expect(ilmid('dawn-breakers-prod-version_en', '3a')).toBe('dawn-breakers-prod-version_en_3a');
  });

  it('finds a quote despite curly quotes, case and spacing', () => {
    const t = 'He said: “Observe  My commandments, for the love of My beauty.”';
    const s = findSpan(t, '"observe my commandments');
    expect(t.slice(s.start, s.end)).toBe('“Observe  My commandments');
    expect(findSpan(t, 'not there')).toBeNull();
  });

  it('makes the link that highlighted exactly the quote on the live Dawn-Breakers page', () => {
    const text = 'xx the empires of the S̱háh and the Sulṭán, and it did not occur to them';
    const url = quoteUrl('https://oceanlibrary.com/dawn-breakers_nabil', 'dawn-breakers-prod-version_en',
      { para_id: 'para_19', ilm_id: '3a', text }, 'empires of the S̱háh and the Sulṭán, and it did not occur to');
    const from = siteOffset(text, text.indexOf('empires'));
    expect(url).toBe(`https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_19&selectionString=${encodeURIComponent(`dawn-breakers-prod-version_en_3a.${from}~dawn-breakers-prod-version_en_3a.${from + 47}`)}`);
  });

  it('spans paragraphs and refuses without the anchors', () => {
    const a = { para_id: 'para_16', ilm_id: 'bl37', text: 'O ye peoples of the world!', from: 13 };
    const b = { para_id: 'para_17', ilm_id: 'bl38', text: 'Say: From My laws the sweet', to: 25 };
    expect(decodeURIComponent(rangeUrl('https://oceanlibrary.com/chaste-and-holy-life_bahaullah', 'b', a, b)))
      .toBe('https://oceanlibrary.com/chaste-and-holy-life_bahaullah/?paraId=para_16&selectionString=b-bl37.10~b-bl38.20');
    expect(rangeUrl('https://x', 'b', { ...a, ilm_id: null })).toBeNull();
  });
});

describe('linkFor gives OceanLibrary range links', () => {
  it('highlights the quote, else the whole paragraph, and falls back to paraId without the anchors', async () => {
    const { linkFor } = await import('../../api/lib/source-links.js');
    const doc = { id: 1, source_url: 'https://oceanlibrary.com/dawn-breakers_nabil', external_para_id: 'para_19', external_id: 'dawn-breakers-prod-version_en',
      block_attrs: JSON.stringify({ ilm_id: '3a' }), text: 'xx the empires of the S̱háh and the Sulṭán, and it did not occur to them' };
    const q = decodeURIComponent(linkFor(doc, 5, { quote: 'empires of the S̱háh' }).url);
    expect(q).toMatch(/^https:\/\/oceanlibrary\.com\/dawn-breakers_nabil\/\?paraId=para_19&selectionString=dawn-breakers-prod-version_en_3a\.5~dawn-breakers-prod-version_en_3a\.\d+$/);
    expect(decodeURIComponent(linkFor(doc, 5).url)).toMatch(/selectionString=dawn-breakers-prod-version_en_3a\.0~/);
    expect(linkFor({ ...doc, block_attrs: null }, 5).url).toBe('https://oceanlibrary.com/dawn-breakers_nabil?paraId=para_19');
  });
});
