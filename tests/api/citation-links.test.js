// Citation links go to the best PUBLISHER of the words, whatever copy search found (Chad 10-12).
import { describe, it, expect } from 'vitest';
import { betterCopyLinks } from '../../api/lib/citation-links.js';
import { linkFor } from '../../api/lib/source-links.js';

const blo = linkFor({ id: 5, religion: "Baha'i", collection: 'x', slug: 's', source_url: 'https://bahai-library.com/some_compilation' }, 3);
const ol = { title: 'Gleanings from the Writings of Bahá’u’lláh', doc_id: 20783, paragraph_index: 93, text: 'Know thou that every created thing is a sign of the revelation of God.', external_para_id: 'para_93',
  block_attrs: '{"ilm_id":"bl93"}', external_id: 'gleanings_en', source_url: 'https://oceanlibrary.com/gleanings-from-the-writings-of-bahaullah', religion: "Baha'i" };
const ool = { title: 'Gleanings from the Writings of Bahá’u’lláh — original', doc_id: 700, paragraph_index: 1, text: 'x', metadata: '{"bookid":"BH_PUB02_93_FA"}', religion: "Baha'i" };

describe('betterCopyLinks', () => {
  it('an identical OceanLibrary copy beats the bahai-library copy search found (range link)', async () => {
    const m = await betterCopyLinks([{ id: 1, link: blo }], { copies: async () => new Map([[1, [ool, ol]]]) });
    expect(m.get(1)).toMatchObject({ site: 'oceanlibrary.com', tier: 1 });
    expect(m.get(1).url).toMatch(/paraId=para_93&selectionString=gleanings_en-bl93\./);
  });
  it('only a copy of the SAME work: a compilation quoting the words keeps its own link', async () => {
    const m = await betterCopyLinks([{ id: 1, title: "Bahá'í World Faith", link: blo }], { copies: async () => new Map([[1, [ol]]]) });
    expect(m.size).toBe(0);
    const g = await betterCopyLinks([{ id: 1, title: 'Gleanings From the Writings of Bahá’u’lláh, page 5', link: blo }], { copies: async () => new Map([[1, [ol]]]) });
    expect(g.get(1)).toMatchObject({ site: 'oceanlibrary.com' });
  });
  it('else Ocean of Lights (page by its id), never a worse copy; a top-tier link is left alone', async () => {
    expect((await betterCopyLinks([{ id: 1, link: blo }], { copies: async () => new Map([[1, [ool]]]) })).get(1)).toMatchObject({ site: 'oceanoflights.org', tier: 2 });
    const top = linkFor({ ...ol, id: ol.doc_id }, 93);
    expect((await betterCopyLinks([{ id: 2, link: top }], { copies: async () => { throw new Error('not asked'); } })).size).toBe(0);
  });
});

describe('same work on OceanLibrary under another title (no identical copy)', () => {
  it("Core Publications 'Tablets of Bahá’u’lláh' → OceanLibrary's 'Fountain of Wisdom' (its book id names the work) + the words", async () => {
    const own = linkFor({ id: 8270, religion: "Baha'i", collection: 'Core Publications', slug: 'tablets' }, 491);
    const olWorks = async () => [{ id: 20790, title: 'Fountain of Wisdom', external_id: 'tablets_of_baha_u_llah_revealed_after_the_kitab_i_73dc612de775bf9a04f878e400a2ce69',
      source_url: 'https://oceanlibrary.com/fountain-of-wisdom_bahaullah' }];
    const m = await betterCopyLinks([{ id: 9, title: 'Tablets of Bahá’u’lláh Revealed After the Kitáb-i-Aqdas', text: '[11.12] The earth is but one country', link: own }],
      { copies: async () => new Map(), olWorks });
    expect(m.get(9)).toMatchObject({ site: 'oceanlibrary.com', tier: 1 });
    expect(m.get(9).url).toMatch(/^https:\/\/oceanlibrary\.com\/fountain-of-wisdom_bahaullah#~q=/);
  });
});
