// Battery round 3 (11-10): the same words in several sources → the best published one.
//  · justice: Bahá'u'lláh quoting his own Hidden Words inside Fountain of Wisdom → the Hidden Words passage takes the slot
//  · bab-born: a slug-titled scrape of The Dawn-Breakers ("Shoghi Effendi", #:~:text= link) → the published copy (Nabíl, paraId)
// preferOwnWork with a fake search; no network.
import { describe, it, expect } from 'vitest';
import { preferOwnWork, quotedOnly, slugTitle } from '../../api/lib/assistant/own-source.js';
import { toPassage } from '../../api/lib/assistant/tool-kit.js';

const BH = 'Bahá’u’lláh', B = "Baha'i";
const HW = 'O SON OF SPIRIT! The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me.';
const fow = toPassage({ id: 106, document_id: 500, paragraph_index: 106, title: 'Fountain of Wisdom : Tablets of Bahá’u’lláh', author: BH, book_author: BH, religion: B,
  source_url: 'https://oceanlibrary.com/fountain-of-wisdom_bahaullah/?paraId=para_106', text: `We have said: “The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me.” By its aid thou shalt see with thine own eyes.` });
const hw = { id: 2, document_id: 600, paragraph_index: 2, title: 'The Hidden Words', author: BH, book_author: BH, religion: B, collection: 'Writings of Bahá’u’lláh', book_authority: 10,
  source_url: 'https://oceanlibrary.com/hidden-words/?paraId=para_2', text: HW };

const NARR = 'The Báb was born in Shíráz on the first day of Muḥarram, in the year 1235 A.H., the twentieth of October, 1819.';
const scrape = toPassage({ id: 7, document_id: 614092, paragraph_index: 7, title: 'shoghi-effendi-trans-011-the-dawn-breakers_en', author: 'Shoghi Effendi', book_author: 'Shoghi Effendi',
  religion: B, source_url: 'https://oceanoflights.org/shoghi-effendi-trans-011-the-dawn-breakers_en#:~:text=born', text: NARR });
const dawn = { id: 72, document_id: 21308, paragraph_index: 72, title: 'The Dawn-Breakers', author: 'Nabil Zarandi', book_author: 'Nabil Zarandi', religion: B,
  source_url: 'https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_72', text: `${NARR} He was a descendant of the Prophet.` };

describe('own source: a writer quoting his own other work, and a poor copy (battery round 3)', () => {
  it('quotedOnly / slugTitle', () => {
    expect(quotedOnly(fow.text)[0]).toMatch(/^The best beloved/);
    expect(quotedOnly(HW)).toEqual([]);
    expect(slugTitle(scrape.title)).toBe(true); expect(slugTitle('The Dawn-Breakers')).toBe(false);
  });
  it('justice: Fountain of Wisdom quoting the Hidden Words → the Hidden Words lead, Fountain of Wisdom kept as context', async () => {
    const asked = [];
    const r = await preferOwnWork([fow], { search: async (span, f) => { asked.push(f); return [fow, hw]; }, shape: toPassage });
    expect(r.passages.map((p) => p.id)).toEqual([2, 106]);
    expect(r.swapped).toEqual([{ from: 106, to: 2, writer: BH, kind: 'self' }]);
    expect(asked[0].author).toBe(BH);
  });
  it('a writer quoting his own words that only another QUOTING place holds is not swapped', async () => {
    const other = { ...fow, id: 9, document_id: 700 };
    const r = await preferOwnWork([fow], { search: async () => [other], shape: toPassage });
    expect(r.swapped).toEqual([]);
  });
  it('bab-born: the scrape → the published Dawn-Breakers (author and paraId link from the copy), searched with no author filter', async () => {
    const asked = [];
    const r = await preferOwnWork([scrape], { search: async (span, f) => { asked.push(f); return [scrape, dawn]; }, shape: toPassage });
    expect(r.passages[0]).toMatchObject({ id: 72, title: 'The Dawn-Breakers', author: 'Nabil Zarandi', source_url: expect.stringMatching(/oceanlibrary\.com.*paraId=/) });
    expect(r.swapped[0]).toMatchObject({ from: 7, to: 72, kind: 'copy' });
    expect(asked[0].author).toBeNull();
  });
  it('a scrape whose words only a book QUOTING them holds stays', async () => {
    const quoting = { ...dawn, id: 99, document_id: 9, title: 'A Study', text: `As Nabíl writes, “${NARR}”` };
    const r = await preferOwnWork([scrape], { search: async () => [quoting], shape: toPassage });
    expect(r.swapped).toEqual([]);
  });
});

describe('own source: the last-resort source gives way (battery round 4 timeline)', () => {
  const SE = 'Shoghi Effendi';
  const W = 'On 23 May 1844 the Báb proclaimed His twofold mission as an independent Manifestation of God and Herald of One greater than Himself.';
  const upl = toPassage({ id: 4601, document_id: 800, paragraph_index: 4601, title: 'Uncompiled Published Letters', author: SE, book_author: SE, religion: B,
    source_url: 'https://oceanlibrary.com/uncompiled-published-letters_shoghi-effendi/?paraId=para_4601', text: W });
  const wob = { id: 31, document_id: 900, paragraph_index: 31, title: 'The World Order of Bahá’u’lláh', author: SE, book_author: SE, religion: B,
    source_url: 'https://oceanlibrary.com/world-order-of-bahaullah/?paraId=para_31', text: `${W} His Dispensation opened.` };
  it('an Uncompiled Published Letters passage → the same words in a published work of the writer; the letters kept as context', async () => {
    const asked = [];
    const r = await preferOwnWork([upl], { search: async (span, f) => { asked.push(f); return [upl, wob]; }, shape: toPassage });
    expect(r.passages.map((p) => p.id)).toEqual([31, 4601]);
    expect(r.swapped[0]).toMatchObject({ kind: 'published', writer: SE });
    expect(asked[0].author).toBe(SE);
  });
  it('no published work holds the words → the letters stay', async () => {
    const r = await preferOwnWork([upl], { search: async () => [upl], shape: toPassage });
    expect(r.passages.map((p) => p.id)).toEqual([4601]);
  });
  it('"Uncompiled Letters" → a published compilation carrying his words (the compiler is the book author; 11-12 decentralization)', async () => {
    const C = 'Consultation, frank and unfettered, is the bedrock of this unique Order, and the institutions must follow it in every matter.';
    const ul = toPassage({ ...upl, id: 4700, title: 'Shoghi Effendi: Uncompiled Letters', text: C });
    const comp = { id: 12, document_id: 945906, paragraph_index: 12, title: 'Consultation', author: SE, book_author: 'Universal House of Justice', religion: B,
      source_url: 'https://oceanlibrary.com/consultation/?paraId=para_12', text: C };
    const r = await preferOwnWork([ul], { search: async () => [ul, comp], shape: toPassage });
    expect(r.passages.map((p) => p.id)).toEqual([12, 4700]);
  });
  it('a compilation holding a mid-paragraph sentence of the letter (not its opening) → the compilation (Lights of Guidance)', async () => {
    const T = 'It is in view of this constant expansion that the work grows. The Guardian has re-emphasized the necessity of avoiding over-centralization in the affairs of the national body at this time. Short end.';
    const ul = toPassage({ ...upl, id: 4800, title: 'Shoghi Effendi: Uncompiled Letters', text: T });
    const log = { id: 8680, document_id: 77, paragraph_index: 8680, title: 'Lights of Guidance', author: SE, book_author: 'Helen Hornby', religion: B,
      source_url: 'https://oceanlibrary.com/lights-of-guidance/?paraId=para_8680', text: '...the Guardian has re-emphasized the necessity of avoiding over centralization in the affairs of the national body at this time.' };
    const asked = [];
    const r = await preferOwnWork([ul], { search: async (span) => { asked.push(span); return /Guardian/.test(span) ? [log] : []; }, shape: toPassage });
    expect(r.passages.map((p) => p.id)).toEqual([8680, 4800]);
    expect(asked.length).toBe(2);
  });
});

describe('own source: a scrape-host edition gives way to the published book holding the same words (r17 Shaykh Aḥmad)', () => {
  const N = 'there appeared above the horizon of the East that luminous Star of Divine guidance, Shaykh Aḥmad-i-Aḥsá’í, who set out to prepare the way.';
  const proofs = toPassage({ id: 610, document_id: 4100, paragraph_index: 610, title: "The Seven Proofs (Dalá'il-i-Sab'ih)", author: 'The Báb', book_author: 'The Báb', religion: B,
    source_url: 'https://bahai-library.com/bab_nicolas_terry_proofs', text: N });
  const dawn = { id: 132, document_id: 21308, paragraph_index: 132, title: 'The Dawn-Breakers', author: 'Nabil Zarandi', book_author: 'Nabil Zarandi', religion: B,
    source_url: 'https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_132', text: `The light of the Faith had been obscured; ${N}` };
  it('the bahai-library edition → The Dawn-Breakers, searched with no author filter', async () => {
    const asked = [];
    const r = await preferOwnWork([proofs], { search: async (span, f) => { asked.push(f); return [proofs, dawn]; }, shape: toPassage });
    expect(r.passages[0]).toMatchObject({ id: 132, title: 'The Dawn-Breakers', author: 'Nabil Zarandi' });
    expect(r.swapped[0]).toMatchObject({ from: 610, to: 132, kind: 'host' });
    expect(asked[0].author).toBeNull();
  });
  it('another scrape, a study, or no holder → kept', async () => {
    for (const q of [{ ...dawn, source_url: 'https://oceanoflights.org/x' }, { ...dawn, authority: 'scholarship' }, { ...dawn, text: 'unrelated words entirely here' }]) {
      const r = await preferOwnWork([proofs], { search: async () => [q], shape: (h) => h });
      expect(r.swapped).toEqual([]);
    }
  });
  it('an oceanlibrary passage is never a host job', async () => {
    let n = 0;
    await preferOwnWork([{ ...proofs, source_url: 'https://oceanlibrary.com/seven-proofs/?paraId=para_1' }], { search: async () => { n++; return []; } });
    expect(n).toBe(0);
  });
});

describe('own source: a swap that lands on a scrape goes on to the published copy (11-11 grandmother turn)', () => {
  const AB = '‘Abdu’l-Bahá';
  const MEN = 'Men who suffer not, attain no perfection. The plant most pruned by the gardeners is that one which, when the summer comes, will have the most beautiful blossoms and the most abundant fruit.';
  const sow = toPassage({ id: 16413529, document_id: 15839, paragraph_index: 40, title: 'Star of the West, v20', author: AB, book_author: AB, religion: B,
    source_url: 'https://bahai-library.com/sow_v20', text: `He said: “Men who suffer not, attain no perfection. The plant most pruned by the gardeners is that one which, when the summer comes, will have the most beautiful blossoms” — so he taught.` });
  const scrapePT = { document_id: 563763, paragraph_id: 38963437, title: 'abdul-baha-paris-talks-014_en', author: AB, book_author: AB, religion: B, collection: 'Writings of ‘Abdu’l-Bahá', book_authority: 10,
    source_url: 'https://oceanoflights.org/abdul-baha-paris-talks-014-en/#(Men)(fruit)', text: MEN };
  const paris = { id: 1050, document_id: 21395419, paragraph_index: 1050, title: 'Paris Talks', author: AB, book_author: AB, religion: B, collection: 'Writings of ‘Abdu’l-Bahá', book_authority: 10,
    source_url: 'https://oceanlibrary.com/paris-talks_abdul-baha/?paraId=para_1050', text: MEN };
  it('Star of the West → the scrape → Paris Talks (oceanlibrary paraId)', async () => {
    const r = await preferOwnWork([sow], { search: async (span, f) => (f.author ? [scrapePT] : [scrapePT, paris]), shape: toPassage });
    expect(r.passages[0]).toMatchObject({ title: 'Paris Talks', source_url: expect.stringMatching(/oceanlibrary\.com.*paraId=/) });
    expect(r.swapped.map((x) => x.kind)).toEqual(['self', 'copy']);
    expect(r.passages.some((p) => /oceanoflights/.test(p.source_url || ''))).toBe(false);
  });
});

