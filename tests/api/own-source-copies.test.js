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
