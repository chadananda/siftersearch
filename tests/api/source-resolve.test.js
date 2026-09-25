// Raw search must return the ORIGINAL source for quoted words — correct metadata, quote and reference. Live 2026-09-25:
// "the essence of Justice and the source thereof…" (Gleanings LXXXVIII) was served from a pilgrim-notes book (Bolles,
// authority 7) while canonical Gleanings sat outside the top 12. The chat layer only has what search gives it.
import { describe, it, expect } from 'vitest';
import { resolveSources, pickOriginal, needsResolution } from '../../api/lib/source-resolve.js';

const GLEANINGS = { id: 900, doc_id: 8312, paragraph_index: 88, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', authority: 10, source_site: 'oceanlibrary.com',
  text: 'Know verily that the essence of justice and the source thereof are both embodied in the ordinances prescribed by Him Who is the Manifestation of the Self of God.' };
const SACRED = { ...GLEANINGS, id: 901, doc_id: 20777, title: 'Bahá’í Sacred Writings', authority: 8 };
const BAYAT = { ...GLEANINGS, id: 902, doc_id: 919098, title: "Gleanings from the Writings of Baha'u'llah", author: 'bayat', authority: null, source_site: null };
const PILGRIM = { id: 10, doc_id: 12618, paragraph_index: 6, title: 'Shoghi Effendi on Laws, Administration and Prophecy', author: 'J. Ruh-Angiz Bolles', authority: 7,
  text: '"Gleanings", p. 175. "Know verily that the essence of justice and the source thereof are both embodied in the ordinances prescribed by Him."' };
const ORIGINAL = { id: 20, doc_id: 11465, title: 'Tablet of the Riḍván of Justice', author: 'Bahá’u’lláh', authority: 10, text: 'O people! Justice is the light of the world.' };

const jevAll = (verdicts) => async () => verdicts;   // [{ kind, speaker }] per candidate, in order

describe('needsResolution', () => {
  it('skips a passage that is already the speaker’s own text with no quotation', () => {
    expect(needsResolution(ORIGINAL)).toBe(false);
  });
  it('checks a secondary author’s passage that contains a quotation', () => {
    expect(needsResolution(PILGRIM)).toBe(true);
  });
});

describe('pickOriginal', () => {
  it('prefers the speaker’s own work, then authority, over compilations and uploader copies', () => {
    expect(pickOriginal([BAYAT, SACRED, GLEANINGS], 'Bahá’u’lláh').doc_id).toBe(8312);
  });
  it('never picks a copy with no authority over an attributed one', () => {
    expect(pickOriginal([BAYAT, SACRED], 'Bahá’u’lláh').doc_id).toBe(20777);
  });
});

describe('resolveSources', () => {
  it('replaces a secondary copy with the original work and records where it was quoted', async () => {
    const r = await resolveSources([PILGRIM, ORIGINAL], {
      classify: jevAll([{ kind: 'quotation', speaker: 'Bahá’u’lláh' }]),
      phraseSearch: async () => [PILGRIM, BAYAT, SACRED, GLEANINGS],
    });
    expect(r.hits[0].doc_id).toBe(8312);
    expect(r.hits[0]._source).toMatchObject({ kind: 'quotation', speaker: 'Bahá’u’lláh', resolved: true });
    expect(r.hits[0]._source.quoted_in).toMatchObject({ doc_id: 12618, title: PILGRIM.title });
    expect(r.hits[1].doc_id).toBe(11465);            // an original passage passes through untouched
    expect(r.resolved).toBe(1);
  });

  // God Passes By is Shoghi Effendi's history (commentary) quoting Bahá'u'lláh: keep the passage, and reference each
  // quote to its original paragraph so the answer can cite the Tablet itself.
  it('keeps a commentary passage and references each embedded quote to its original', async () => {
    const GPB = { id: 30, doc_id: 21310, paragraph_index: 509, title: 'God Passes By', author: 'Shoghi Effendi', authority: 7,
      text: 'Justice He extols as "Know verily that the essence of justice and the source thereof are both embodied in the ordinances prescribed by Him".' };
    const r = await resolveSources([GPB], { classify: jevAll([{ kind: 'commentary', speaker: 'Bahá’u’lláh' }]), phraseSearch: async () => [SACRED, GLEANINGS] });
    expect(r.hits[0].doc_id).toBe(21310);
    expect(r.hits[0]._source.kind).toBe('commentary');
    expect(r.hits[0]._source.quote_sources).toHaveLength(1);
    expect(r.hits[0]._source.quote_sources[0]).toMatchObject({ doc_id: 8312, paragraph_index: 88, title: GLEANINGS.title, author: 'Bahá’u’lláh' });
  });

  it('only accepts a candidate that actually CONTAINS the quoted words', async () => {
    const lookalike = { ...GLEANINGS, id: 950, text: 'Justice is a theme of this book.' };
    const r = await resolveSources([PILGRIM], {
      classify: jevAll([{ kind: 'quotation', speaker: 'Bahá’u’lláh' }]),
      phraseSearch: async () => [lookalike],
    });
    expect(r.hits[0].doc_id).toBe(12618);            // no verified copy → keep, but labelled
    expect(r.hits[0]._source).toMatchObject({ kind: 'quotation', speaker: 'Bahá’u’lláh', resolved: false });
  });

  it('labels a recollection it cannot trace to a written text, rather than presenting it as scripture', async () => {
    const note = { ...PILGRIM, id: 11, text: 'He said that we must be as one soul in many bodies, and that unity was everything to Him.' };
    const r = await resolveSources([note], { classify: jevAll([{ kind: 'recollection', speaker: '‘Abdu’l-Bahá' }]), phraseSearch: async () => [] });
    expect(r.hits[0]._source).toMatchObject({ kind: 'recollection', speaker: '‘Abdu’l-Bahá', resolved: false });
  });

  it('does not duplicate a paragraph that was already in the results', async () => {
    const r = await resolveSources([PILGRIM, GLEANINGS], {
      classify: jevAll([{ kind: 'quotation', speaker: 'Bahá’u’lláh' }]),
      phraseSearch: async () => [GLEANINGS],
    });
    expect(r.hits.map((h) => h.id)).toEqual([900]);
  });

  it('fails open: a classifier error returns the hits unchanged', async () => {
    const r = await resolveSources([PILGRIM, ORIGINAL], { classify: async () => { throw new Error('jev down'); }, phraseSearch: async () => [] });
    expect(r.hits.map((h) => h.id)).toEqual([10, 20]);
    expect(r.error).toMatch(/jev down/);
  });
});

// Live: canonical Gleanings at #2 and uploader copies of the SAME paragraph ("michot", "bayat") at #6–8.
import { collapseCopies } from '../../api/lib/source-resolve.js';
describe('collapseCopies', () => {
  it('keeps the best copy of the same text and lists the others as also_in', () => {
    const out = collapseCopies([BAYAT, GLEANINGS, ORIGINAL, SACRED]);
    expect(out.map((h) => h.doc_id)).toEqual([8312, 11465]);
    expect(out[0]._source.also_in.map((x) => x.doc_id).sort()).toEqual([20777, 919098]);
  });

  it('treats a paragraph contained in a longer copy as the same text', () => {
    const longer = { ...SACRED, text: `Heading. ${GLEANINGS.text} More words after.` };
    expect(collapseCopies([GLEANINGS, longer])).toHaveLength(1);
  });

  it('leaves different passages alone', () => {
    expect(collapseCopies([GLEANINGS, ORIGINAL])).toHaveLength(2);
  });
});
