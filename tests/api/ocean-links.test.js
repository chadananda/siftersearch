// OceanLibrary paragraph links → range links at the output boundary (api/lib/ocean-links.js).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async (_sql, params) => {
    const rows = [];
    for (let i = 0; i < params.length; i += 3) {
      const [url, , pid] = params.slice(i, i + 3);
      if (url.endsWith('/dawn-breakers_nabil') && pid === 'para_19') rows.push({ source_url: 'https://oceanlibrary.com/dawn-breakers_nabil', external_id: 'dawn-breakers-prod-version_en', pid, text: 'xx the empires of the S̱háh and the Sulṭán, and it did not occur to them', block_attrs: '{"ilm_id":"3a"}' });
      if (url.endsWith('/peace_bahaullah') && pid === 'para_9') rows.push({ source_url: 'https://oceanlibrary.com/peace_bahaullah', external_id: 'peace_compilation_bahai_ocean_en', pid, text: 'old', block_attrs: null });
    }
    return rows;
  }),
}));
const { upgradeOceanLinks, oceanQuoteMarker, rangeLinkSender } = await import('../../api/lib/ocean-links.js');

describe('ocean range links', () => {
  it('turns a paragraph link inside text or JSON into a whole-paragraph range', async () => {
    const out = await upgradeOceanLinks('{"url":"https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_19"}');
    expect(decodeURIComponent(out)).toMatch(/"https:\/\/oceanlibrary\.com\/dawn-breakers_nabil\/\?paraId=para_19&selectionString=dawn-breakers-prod-version_en_3a\.0~dawn-breakers-prod-version_en_3a\.\d+"/);
  });
  it('narrows to the quote when the producer marked it, and strips the marker when anchors are missing', async () => {
    const q = await upgradeOceanLinks(oceanQuoteMarker('https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_19', 'empires of the S̱háh'));
    expect(decodeURIComponent(q)).toMatch(/selectionString=dawn-breakers-prod-version_en_3a\.5~/);
    const none = await upgradeOceanLinks(oceanQuoteMarker('https://oceanlibrary.com/peace_bahaullah/?paraId=para_9', 'x'));
    expect(none).toBe('https://oceanlibrary.com/peace_bahaullah/?paraId=para_9');
  });
  it('leaves range links and other sites alone', async () => {
    const r = 'https://oceanlibrary.com/x/?paraId=para_1&selectionString=a.0~a.5 and https://bahai-library.com/x';
    expect(await upgradeOceanLinks(r)).toBe(r);
  });
  it('sends SSE events in order, upgraded, and flushes', async () => {
    const out = [];
    const send = rangeLinkSender((j) => out.push(j));
    send({ type: 'a' }); send({ type: 'sources', url: 'https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_19' }); send({ type: 'done' });
    await send.flush();
    expect(out.map((j) => JSON.parse(j).type)).toEqual(['a', 'sources', 'done']);
    expect(out[1]).toMatch(/selectionString=/);
  });
});

describe('Ocean of Lights quote markers', () => {
  const rows = [{ text: '– II –' }, { text: 'The beginning of all things is the knowledge of God, and the end' }];
  it('become the shortest #(start)(end) range from OUR stored copy of the page (no request to the site)', async () => {
    const { upgradeOceanLinks } = await import('../../api/lib/ocean-links.js');
    const loadParagraphs = vi.fn(async () => rows);
    const s = JSON.stringify({ url: `https://oceanoflights.org/bahaullah-pub02-02-en/#~d=42~q=${encodeURIComponent('The beginning of all things is the knowledge')}` });
    expect(JSON.parse(await upgradeOceanLinks(s, { loadParagraphs })).url).toBe('https://oceanoflights.org/bahaullah-pub02-02-en/#(The)(knowledge)');
    expect(loadParagraphs).toHaveBeenCalledWith(42, { proseOnly: false });
  });
  it('fall back to a text fragment without a document', async () => {
    const { upgradeOceanLinks } = await import('../../api/lib/ocean-links.js');
    const out = await upgradeOceanLinks(`https://oceanoflights.org/some-page/#~q=${encodeURIComponent('of God')}`, { loadParagraphs: async () => [] });
    expect(out).toBe('https://oceanoflights.org/some-page/#:~:text=of%20God');
  });
});

describe('OceanLibrary book-level link + quote', () => {
  it('finds the quoted paragraph in our copy of the OceanLibrary book and range-links it', async () => {
    const { upgradeOceanLinks } = await import('../../api/lib/ocean-links.js');
    const repo = {
      listDocs: vi.fn(async () => ({ docs: [{ id: 8312, external_id: null }, { id: 9, external_id: 'gleanings_en' }] })),
      getParagraphs: vi.fn(async () => [
        { external_para_id: 'para_1', text: 'Praise be to God', block_attrs: '{"ilm_id":"bl1"}' },
        { external_para_id: 'para_2', text: 'The beginning of all things is the knowledge of God', block_attrs: '{"ilm_id":"bl2"}' },
      ]) };
    const out = await upgradeOceanLinks(`https://oceanlibrary.com/gleanings-from-the-writings-of-bahaullah#~q=${encodeURIComponent('the knowledge of God')}`, { repo });
    expect(out).toMatch(/^https:\/\/oceanlibrary\.com\/gleanings-from-the-writings-of-bahaullah\/?\?paraId=para_2&selectionString=gleanings_en-bl2\.\d+~gleanings_en-bl2\.\d+$/);
    expect(repo.getParagraphs).toHaveBeenCalledWith(9, { proseOnly: false });   // the site copy, not Core Publications' twin
  });
  it('leaves the plain book link when the quote is not in the book', async () => {
    const { upgradeOceanLinks } = await import('../../api/lib/ocean-links.js');
    const repo = { listDocs: async () => ({ docs: [{ id: 10, external_id: 'x_en' }] }), getParagraphs: async () => [{ external_para_id: 'para_1', text: 'other words' }] };
    expect(await upgradeOceanLinks(`https://oceanlibrary.com/some-other-book#~q=${encodeURIComponent('not here')}`, { repo })).toBe('https://oceanlibrary.com/some-other-book');
  });
});
