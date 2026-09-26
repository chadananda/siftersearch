// Raw search returns each quote from its IDEAL source and drops duplicates from secondary sources (Chad, 2026-09-25:
// "tweak document weighting or re-ranking, preferably with JEV"; "OceanLibrary is the primary source, all others are
// supplementary"). Live defects this pins:
//  - Gleanings LXXXVIII served from a pilgrim-notes book (authority 7); canonical Gleanings outside the top 12;
//  - "The best beloved of all things in My sight is Justice" linked to a 1903 BahaiLibrary "Parallel Hidden Words"
//    instead of OceanLibrary's Hidden Words.
import { describe, it, expect } from 'vitest';
import { resolveSources, collapseCopies, needsCheck, deterministicPick } from '../../api/lib/source-resolve.js';

const OL = 'https://oceanlibrary.com/x/?paraId=p1';
const GLEANINGS = { id: 900, doc_id: 8312, paragraph_index: 88, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', authority: 10, source_url: OL,
  text: 'Know verily that the essence of justice and the source thereof are both embodied in the ordinances prescribed by Him Who is the Manifestation of the Self of God.' };
const SACRED = { ...GLEANINGS, id: 901, doc_id: 20777, title: 'Bahá’í Sacred Writings', authority: 8 };
const BAYAT = { ...GLEANINGS, id: 902, doc_id: 919098, title: 'Gleanings study guide', author: 'bayat', authority: null, source_url: null };
const PILGRIM = { id: 10, doc_id: 12618, paragraph_index: 6, title: 'Shoghi Effendi on Laws, Administration and Prophecy', author: 'J. Ruh-Angiz Bolles', authority: 7, source_url: null,
  text: '"Gleanings", p. 175. "Know verily that the essence of justice and the source thereof are both embodied in the ordinances prescribed by Him."' };
const HW_OL = { id: 30, doc_id: 20809, paragraph_index: 2, title: 'The Hidden Words of Bahá’u’lláh', author: 'Bahá’u’lláh', authority: 9, source_url: OL,
  text: 'O Son of Spirit! The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me.' };
const HW_1903 = { ...HW_OL, id: 31, doc_id: 15171, title: 'Parallel Hidden Words in English (Early Translations)', authority: 9, source_url: null };
const ORIGINAL = { id: 20, doc_id: 11465, title: 'Tablet of the Riḍván of Justice', author: 'Bahá’u’lláh', authority: 10, source_url: OL, text: 'O people! Justice is the light of the world.' };

// Link metadata: BahaiLibrary for the 1903 translation, nothing recorded for the uploader copy.
const linkMeta = async (ids) => new Map(ids.map((id) => [id, id === 15171 ? { metadata: '{"sourceUrl":"https://bahai-library.com/hw1903"}' } : {}]));
// judge stub: verdicts per passage in order; choices per group key → chosen option id (null = abstain).
const judge = (verdicts = [], pickFn = () => null) => async ({ passages, groups }) => ({
  verdicts: passages.map((_, i) => verdicts[i] || { kind: 'original', speaker: 'author' }),
  choices: Object.fromEntries(groups.map((g) => [g.key, pickFn(g)])),
});
const deps = (over = {}) => ({ linkMeta, judge: judge(), phraseSearch: async () => [], ...over });

describe('needsCheck', () => {
  it('checks a central figure’s passage that is NOT on OceanLibrary (a primary copy may exist)', () => {
    expect(needsCheck(HW_1903, 2)).toBe(true);
  });
  it('skips a central figure’s own passage already on OceanLibrary with no quotation', () => {
    expect(needsCheck(ORIGINAL, 1)).toBe(false);
  });
  it('checks any passage that quotes', () => {
    expect(needsCheck(PILGRIM, 5)).toBe(true);
  });
});

describe('deterministicPick (fallback when Jev abstains)', () => {
  it('OceanLibrary first — the OceanLibrary Hidden Words beats the 1903 supplementary copy', () => {
    expect(deterministicPick([HW_1903, HW_OL], 'Bahá’u’lláh', new Map([[30, 1], [31, 2]])).id).toBe(30);
  });
  it('any OceanLibrary copy beats a supplementary one, even the speaker’s own work elsewhere', () => {
    const blPrimary = { ...GLEANINGS, id: 903, doc_id: 5, authority: 10 };
    expect(deterministicPick([blPrimary, SACRED], 'Bahá’u’lláh', new Map([[903, 2], [901, 1]])).id).toBe(901);
  });
  // Chad: "the source book comes before books quoting it. So the Iqan comes before Gleanings for the same quote and both
  // come before compilations" — Gleanings is a SELECTION of Bahá'u'lláh's writings; the Íqán is the original work.
  it('the original work (Kitáb-i-Íqán) beats the anthology (Gleanings) beats a compilation, for the same words', () => {
    const IQAN = { ...GLEANINGS, id: 905, doc_id: 20810, title: 'The Kitáb-i-Íqán', authority: 10 };
    const COMP = { ...GLEANINGS, id: 906, doc_id: 20778, title: 'Compilation on Knowledge', author: 'Universal House of Justice', authority: 10 };
    const tiers = new Map([[900, 1], [905, 1], [906, 1]]);
    expect(deterministicPick([GLEANINGS, COMP, IQAN], 'Bahá’u’lláh', tiers).id).toBe(905);
    expect(deterministicPick([COMP, GLEANINGS], 'Bahá’u’lláh', tiers).id).toBe(900);
  });

  it('within OceanLibrary: the speaker’s own work, then authority', () => {
    expect(deterministicPick([SACRED, GLEANINGS], 'Bahá’u’lláh', new Map([[900, 1], [901, 1]])).id).toBe(900);
  });
  it('never picks an uploader copy over an attributed one', () => {
    expect(deterministicPick([BAYAT, SACRED], 'Bahá’u’lláh', new Map([[902, 5], [901, 1]])).id).toBe(901);
  });
});

describe('resolveSources', () => {
  it('replaces a secondary quotation with the ideal original chosen by Jev, listing where else it appears', async () => {
    const r = await resolveSources([PILGRIM, ORIGINAL], deps({
      judge: judge([{ kind: 'quotation', speaker: 'Bahá’u’lláh' }], (g) => g.options.find((o) => o.doc_id === 8312)?.id),
      phraseSearch: async () => [PILGRIM, BAYAT, SACRED, GLEANINGS],
    }));
    expect(r.hits[0].doc_id).toBe(8312);
    expect(r.hits[0]._source).toMatchObject({ kind: 'quotation', speaker: 'Bahá’u’lláh', resolved: true });
    expect(r.hits[0]._source.quoted_in).toMatchObject({ doc_id: 12618 });
    expect(r.hits[0]._source.also_in.map((x) => x.doc_id).sort()).toEqual([20777, 919098]);
    expect(r.hits[1].doc_id).toBe(11465);
  });

  it('never lets Jev pick a supplementary copy when an OceanLibrary copy exists', async () => {
    const r = await resolveSources([HW_1903], deps({
      judge: judge([{ kind: 'original', speaker: 'Bahá’u’lláh' }], () => 31),   // Jev (wrongly) picks the 1903 copy
      phraseSearch: async () => [HW_1903, HW_OL],
    }));
    expect(r.hits[0].doc_id).toBe(20809);
  });

  it('swaps a central figure’s passage from a supplementary copy to the OceanLibrary copy of the same words', async () => {
    const r = await resolveSources([HW_1903], deps({ phraseSearch: async () => [HW_1903, HW_OL] }));   // Jev abstains
    expect(r.hits[0].doc_id).toBe(20809);
    expect(r.hits[0]._source.also_in.map((x) => x.doc_id)).toEqual([15171]);
  });

  // Live 2026-09-25: two Paris Talks documents — 8320 (Core Publications, links to the OceanLibrary book page but has
  // NO OceanLibrary paragraph ids) outranked 20908 (the OceanLibrary site copy, id="para_N" on every paragraph).
  // Chad: "oceanlibrary.com is always the core canonical". The same book's paragraph-level copy must be served.
  it('serves the OceanLibrary site copy (with paragraph id) over a copy of the same book without one', async () => {
    const PT_CORE = { id: 50, doc_id: 8320, paragraph_index: 400, title: 'Paris Talks', author: '’Abdu’l-Bahá', authority: 10,
      source_url: 'https://oceanlibrary.com/paris-talks_abdul-baha', text: 'Religion and science are the two wings upon which man’s intelligence can soar into the heights.' };
    const PT_OL = { ...PT_CORE, id: 51, doc_id: 20908, paragraph_index: 160, authority: 9, external_para_id: 'para_160' };
    const r = await resolveSources([PT_CORE], deps({ phraseSearch: async () => [PT_CORE, PT_OL] }));
    expect(r.hits[0].doc_id).toBe(20908);
    expect(r.hits[0]._source.also_in.map((x) => x.doc_id)).toEqual([8320]);
  });

  it('does NOT prefer an anthology merely because it has paragraph ids (the Íqán still beats Gleanings)', () => {
    const IQAN = { ...GLEANINGS, id: 905, doc_id: 20810, title: 'The Kitáb-i-Íqán', source_url: 'https://oceanlibrary.com/kitab-i-iqan' };
    const GL = { ...GLEANINGS, source_url: 'https://oceanlibrary.com/gleanings', external_para_id: 'para_88' };
    const paraLevel = new Map([[900, true], [905, false]]);
    expect(deterministicPick([GL, IQAN], 'Bahá’u’lláh', new Map([[900, 1], [905, 1]]), paraLevel).id).toBe(905);
  });

  it('asks Jev to choose only among copies that actually CONTAIN the words', async () => {
    const lookalike = { ...GLEANINGS, id: 950, text: 'Justice is a theme of this book.' };
    let seen = null;
    await resolveSources([PILGRIM], deps({
      judge: async (a) => { seen = a; return judge([{ kind: 'quotation', speaker: 'Bahá’u’lláh' }])(a); },
      phraseSearch: async () => [lookalike, SACRED, GLEANINGS],
    }));
    expect(seen.groups[0].options.map((o) => o.id)).not.toContain(950);
  });

  it('keeps a commentary passage and references each embedded quote to its ideal source', async () => {
    const GPB = { id: 40, doc_id: 21310, paragraph_index: 509, title: 'God Passes By', author: 'Shoghi Effendi', authority: 7, source_url: OL,
      text: 'Justice He extols as "Know verily that the essence of justice and the source thereof are both embodied in the ordinances prescribed by Him".' };
    const r = await resolveSources([GPB], deps({ judge: judge([{ kind: 'commentary', speaker: 'Bahá’u’lláh' }]), phraseSearch: async () => [SACRED, GLEANINGS] }));
    expect(r.hits[0].doc_id).toBe(21310);
    expect(r.hits[0]._source.quote_sources[0]).toMatchObject({ doc_id: 8312 });
  });

  it('labels a recollection it cannot trace, rather than presenting it as scripture', async () => {
    const note = { ...PILGRIM, id: 11, text: 'He said that we must be as one soul in many bodies, and that unity was everything to Him.' };
    const r = await resolveSources([note], deps({ judge: judge([{ kind: 'recollection', speaker: '‘Abdu’l-Bahá' }]) }));
    expect(r.hits[0]._source).toMatchObject({ kind: 'recollection', speaker: '‘Abdu’l-Bahá', resolved: false });
  });

  it('does not duplicate a paragraph that was already in the results', async () => {
    const r = await resolveSources([PILGRIM, GLEANINGS], deps({
      judge: judge([{ kind: 'quotation', speaker: 'Bahá’u’lláh' }]), phraseSearch: async () => [GLEANINGS],
    }));
    expect(r.hits.map((h) => h.id)).toEqual([900]);
  });

  it('makes ONE judge call for all passages and groups', async () => {
    let calls = 0;
    await resolveSources([PILGRIM, HW_1903], deps({
      judge: async (a) => { calls++; return judge([{ kind: 'quotation', speaker: 'Bahá’u’lláh' }, { kind: 'original', speaker: 'Bahá’u’lláh' }])(a); },
      phraseSearch: async (span) => (/beloved|spirit/i.test(span) ? [HW_OL, HW_1903] : [GLEANINGS]),
    }));
    expect(calls).toBe(1);
  });

  it('fails open: a judge error falls back to the deterministic choice, never to nothing', async () => {
    const r = await resolveSources([HW_1903], deps({ judge: async () => { throw new Error('jev down'); }, phraseSearch: async () => [HW_1903, HW_OL] }));
    expect(r.hits[0].doc_id).toBe(20809);
    expect(r.error).toMatch(/jev down/);
  });
});

describe('collapseCopies', () => {
  it('keeps the best copy of the same text (OceanLibrary first) and lists the others as also_in', () => {
    const tiers = new Map([[902, 5], [900, 1], [901, 1], [20, 1]]);
    const out = collapseCopies([BAYAT, GLEANINGS, ORIGINAL, SACRED], tiers);
    expect(out.map((h) => h.doc_id)).toEqual([8312, 11465]);
    expect(out[0]._source.also_in.map((x) => x.doc_id).sort()).toEqual([20777, 919098]);
  });
  it('leaves different passages alone', () => {
    expect(collapseCopies([GLEANINGS, ORIGINAL], new Map())).toHaveLength(2);
  });
});

describe('resolveSources deadline (1s search budget)', () => {
  it('hands the judge only the time left, and still resolves deterministically when the judge times out', async () => {
    const { resolveSources: rs } = await import('../../api/lib/source-resolve.js');
    let got = null;
    const judge = async (_input, opts) => { got = opts; throw new Error('The operation was aborted due to timeout'); };
    const hit = { id: 1, doc_id: 9, author: 'Bahá’u’lláh', title: 'Pilgrim notes', religion: "Baha'i", text: 'He said: “O Son of Being! Love Me, that I may love thee.”', paragraph_index: 3 };
    const res = await rs([hit], { judge, phraseSearch: async () => [], linkMeta: async () => new Map(), deadline: Date.now() + 400 });
    expect(got.timeoutMs).toBeGreaterThanOrEqual(150);
    expect(got.timeoutMs).toBeLessThanOrEqual(400);
    expect(res.hits).toHaveLength(1);
  });
});
