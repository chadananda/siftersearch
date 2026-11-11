// Star of the West range links: issue parse, hl words, page choice, linkFor marker, output pass (map + block_attrs).
import { describe, it, expect, beforeEach } from 'vitest';
import { sowCoverUrl, sowIssue, sowHl, sowPage, sowMarkerUrl, upgradeSowLinks, resetSowPageMap, sowPageMap } from '../../api/lib/sow-links.js';
import { linkFor } from '../../api/lib/source-links.js';
import { coverAt } from '../../api/lib/quote-blocks.js';
import { upgradeOceanLinks, needsUpgrade } from '../../api/lib/ocean-links.js';

const MAP = { version: 1, issues: { '11.12': { pages: 16, paras: { 1: 1, 2: 1, 11: [1, 2], 13: 3, 14: 3 } } } };
const fetchImpl = async () => ({ ok: true, json: async () => MAP });
const doc = { document_id: 15897, title: 'Star of the West, v11, i12 Núr, July 13 1920', religion: "Baha'i", collection: 'News', slug: 'sow-v11-i12' };
const rows = [
  { paragraph_index: 0, text: 'In the Interest of the BAHAI MOVEMENT', block_attrs: '{"id":"para_1","pn":"1"}' },
  { paragraph_index: 9, text: 'The plans chosen provide for an edifice of nine sides, its dome one hundred and fifty feet in diameter.', block_attrs: '{"id":"para_11","pn":"11"}' },
  { paragraph_index: 10, text: 'A heading', block_attrs: '{"id":"para_12","pn":"12"}' },
];

describe('sow-links', () => {
  beforeEach(() => resetSowPageMap());

  it('reads volume and issue from the title or the file name', () => {
    expect(sowIssue(doc)).toEqual({ vol: 11, issue: 12 });
    expect(sowIssue({ title: 'x', filename: "Baha'i/News/Star of the West/v24/SOW, v24, i3 June, 1933, (32 pages).md" })).toEqual({ vol: 24, issue: 3 });
    expect(sowIssue({ title: 'Star of the West' })).toBeNull();   // the Tablet Translations compilation is not an issue
  });

  it('builds hl as the spec does', () => {
    expect(sowHl("Bahá'u'lláh and ‘Abdu’l-Bahá, 1920.")).toBe('bahaullah-and-abdul-baha-1920');
    expect(sowHl('one two three four five six seven eight nine ten eleven twelve thirteen')).toBe('one-two-three-four-five-six..eight-nine-ten-eleven-twelve-thirteen');
  });

  it('picks the page: mapped, spanning by position, unmapped → nearest earlier end page', () => {
    const m = MAP.issues['11.12'];
    expect(sowPage(m, 13)).toBe(3);
    expect(sowPage(m, 11, 0)).toBe(1);
    expect(sowPage(m, 11, 0.9)).toBe(2);
    expect(sowPage(m, 12)).toBe(2);
    expect(sowPage({ paras: {} }, 5)).toBe(1);
  });

  it('linkFor gives a SoW paragraph the bahai-education marker link', () => {
    const l = linkFor(doc, 9, { quote: 'an edifice of nine sides' });
    expect(l.url).toBe(sowMarkerUrl(doc, 9, 'an edifice of nine sides'));
    expect(l.url).toMatch(/^https:\/\/bahai-education\.org\/sifter-star-of-the-west\/v11\.12#~d=15897~i=9~q=/);
    expect(l.paragraph_level).toBe(true);
    expect(linkFor({ ...doc, title: 'Gleanings', slug: 'g' }, 9).url).toMatch(/siftersearch\.com/);
  });

  it('bahai-education.org outranks every other copy of a SoW issue (OceanLibrary, bahai-library) — the only complete text', () => {
    for (const source_url of ['https://bahai-library.com/sow_v11_i12', 'https://oceanlibrary.com/star-of-the-west_v11']) {
      const l = linkFor({ ...doc, source_url }, 9, { quote: 'an edifice of nine sides' });
      expect(l.url).toMatch(/^https:\/\/bahai-education\.org\/sifter-star-of-the-west\/v11\.12#/);
      expect(l.tier).toBe(0);
    }
  });

  it('output pass resolves page + hl from the paragraph file id and the page map', async () => {
    const loadRows = async () => rows;
    const out = await upgradeSowLinks(`see ${sowMarkerUrl(doc, 9, 'one hundred and fifty feet in diameter')} and ${sowMarkerUrl(doc, 0)}`, { loadRows, fetchImpl });
    expect(out).toContain('https://bahai-education.org/sifter-star-of-the-west/v11.12-p2?hl=one-hundred-and-fifty-feet-in-diameter');
    expect(out).toContain('https://bahai-education.org/sifter-star-of-the-west/v11.12-p1?hl=in-the-interest-of-the-bahai-movement');
  });

  it('no map (or unknown paragraph) → the issue page, never a private marker', async () => {
    const none = await upgradeSowLinks(sowMarkerUrl(doc, 9), { loadRows: async () => rows, fetchImpl: async () => ({ ok: false }) });
    expect(none).toBe('https://bahai-education.org/sifter-star-of-the-west/v11.12');
    resetSowPageMap();
    const missing = await upgradeSowLinks(sowMarkerUrl(doc, 77), { loadRows: async () => rows, fetchImpl });
    expect(missing).toBe('https://bahai-education.org/sifter-star-of-the-west/v11.12');
  });

  it('the shared output pass (every JSON response, Anís replies) runs the SoW upgrade', async () => {
    await sowPageMap({ fetchImpl });   // warm the per-process map
    const out = await upgradeOceanLinks(JSON.stringify({ url: sowMarkerUrl(doc, 9) }), { loadRows: async () => rows });
    expect(out).toContain('v11.12-p1?hl=the-plans-chosen-provide-for-an..hundred-and-fifty-feet-in-diameter');
    expect(needsUpgrade(sowMarkerUrl(doc, 9))).toBe(true);
  });
});

describe('Star of the West issue thumbnails (in place on bahai-education.org)', () => {
  it('an issue doc → its page 1 on the bahai-education image worker; anything else → null', () => {
    expect(sowCoverUrl({ title: 'Star of the West, v11, i9 (August 20, 1920)' })).toMatch(/^https:\/\/bahai-education\.org\/ix\/x\/sow\/v11i9\/page-001\.webp\?/);
    expect(sowCoverUrl({ title: 'Star of the West' })).toBe(null);
    expect(sowCoverUrl(null)).toBe(null);
  });
  it('coverAt sizes their worker by w= and ours by tr=', () => {
    expect(coverAt(sowCoverUrl({ title: 'Star of the West, v1, i1' }), 240)).toMatch(/descreen=1&w=240$/);
    expect(coverAt('https://siftersearch.com/img/covers/5?v=ab', 96)).toBe('https://siftersearch.com/img/covers/5?v=ab&tr=w-96,q-80,e-sharpen');
  });
});
