// Which canonical works are translations, and where each original can be got.
//
// Chad, 2026-08-25: "move through the canonical documents and try to fetch the source for each paragraph…
// very useful for concept extraction to have the original text for all translated documents, whether
// Shoghi Effendi or not." So the population is every English canonical by an author who wrote in Arabic or
// Persian — NOT just the works Shoghi Effendi translated, which is a much smaller set (CTAI holds 11).
//
// The survey is RECALL, not identification: title matching across languages and transliteration systems
// proposes candidates for the alignment pass to confirm by real text overlap. Same doctrine as person names
// — recall widely, bind on evidence.
import { describe, it, expect, vi } from 'vitest';
import { titleKey, titleSimilarity, surveyTranslatedCanonicals } from '../../api/lib/rag/concepts/source-survey.js';

describe('titleKey', () => {
  it('folds diacritics, articles and apostrophe style so variants of one title agree', () => {
    expect(titleKey('The Kitáb-i-Íqán')).toBe(titleKey('Kitab-i-Iqan'));
    expect(titleKey('The Hidden Words')).toBe('hidden words');
  });
});

describe('titleSimilarity', () => {
  it('scores a transliteration variant of the same work highly', () => {
    expect(titleSimilarity('The Kitáb-i-Íqán', 'Kitab-i-Iqan')).toBeGreaterThan(0.9);
  });

  it('does not confuse two different works that share a word', () => {
    expect(titleSimilarity('The Hidden Words', 'The Seven Valleys')).toBeLessThan(0.34);
  });
});

// A fake query router: the survey issues exactly two reads, distinguished by their tag.
const fakeQuery = ({ canonicals = [], originals = [] }) => vi.fn(async (_sql, _args, tag) =>
  (tag === 'survey:originals' ? originals : canonicals));

const enDoc = (o) => ({ language: 'en', source_site: 'oceanlibrary.com', collection: null,
  paras: 100, aligned: 0, duplicate_of: null, ...o });

describe('surveyTranslatedCanonicals', () => {
  it('counts an English work by an Arabic/Persian author as a translation, whoever rendered it', async () => {
    // The Kitáb-i-Aqdas was rendered by a committee, not Shoghi Effendi, and is absent from CTAI — but it is
    // still a translation whose original we want. Restricting to his works would drop exactly this case.
    const query = fakeQuery({
      canonicals: [enDoc({ id: 21307, title: 'The Kitáb-i-Aqdas', author: "Bahá'u'lláh", paras: 304 })],
      originals: [{ id: 900, title: 'Kitab-i-Aqdas', author: "Bahá'u'lláh", language: 'ar',
        source_site: null, paras: 300 }],
    });
    const r = await surveyTranslatedCanonicals({ query });
    expect(r.translations).toBe(1);
    expect(r.rows[0].route).toBe('in-corpus');
    expect(r.rows[0].candidates[0].id).toBe(900);
  });

  it('prefers the CTAI route for a work CTAI actually holds', async () => {
    const query = fakeQuery({
      canonicals: [enDoc({ id: 20810, title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", paras: 292 })],
      originals: [],
    });
    const r = await surveyTranslatedCanonicals({ query });
    expect(r.rows[0].route).toBe('ctai');
    expect(r.rows[0].ctaiWork).toBe('kitab-i-iqan');
  });

  it('REPORTS an unsourceable work instead of silently dropping it', async () => {
    // A work with no original anywhere is a fact the extraction plan must account for. Omitting it would
    // make the survey read as full coverage.
    const query = fakeQuery({
      canonicals: [enDoc({ id: 555, title: 'Some Untraceable Tablet', author: "Bahá'u'lláh", paras: 42 })],
      originals: [{ id: 901, title: 'Entirely Unrelated Persian Work', author: 'Someone', language: 'fa', paras: 10 }],
    });
    const r = await surveyTranslatedCanonicals({ query });
    expect(r.routes.none).toBe(1);
    expect(r.paragraphs.unreachable).toBe(42);
    expect(r.rows[0].route).toBe('none');
  });

  it('excludes works whose author wrote in English — they have no original to fetch', async () => {
    const query = fakeQuery({
      canonicals: [enDoc({ id: 1, title: 'A Modern Study Guide', author: 'Some Scholar', paras: 200 })],
      originals: [],
    });
    expect((await surveyTranslatedCanonicals({ query })).translations).toBe(0);
  });

  it('skips a gutted doc — zero live paragraphs is invariant 12\'s problem, not a sourcing gap', async () => {
    const query = fakeQuery({
      canonicals: [enDoc({ id: 8273, title: 'Epistle to the Son of the Wolf', author: "Bahá'u'lláh", paras: 0 })],
      originals: [],
    });
    const r = await surveyTranslatedCanonicals({ query });
    expect(r.translations).toBe(0);
    expect(r.routes.none).toBe(0);
  });

  it('ignores original-language docs that hold no content', async () => {
    const query = fakeQuery({
      canonicals: [enDoc({ id: 20809, title: 'The Hidden Words', author: "Bahá'u'lláh", paras: 314 })],
      originals: [{ id: 902, title: 'The Hidden Words', language: 'ar', paras: 0 }],
    });
    const r = await surveyTranslatedCanonicals({ query });
    expect(r.rows[0].candidates).toHaveLength(0);
    expect(r.originalLanguageDocs).toBe(0);
  });

  it('totals reachable vs unreachable paragraphs so the plan can be costed', async () => {
    const query = fakeQuery({
      canonicals: [
        enDoc({ id: 20810, title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", paras: 292 }),
        enDoc({ id: 555, title: 'Some Untraceable Tablet', author: "Bahá'u'lláh", paras: 42 }),
      ],
      originals: [],
    });
    const r = await surveyTranslatedCanonicals({ query });
    expect(r.paragraphs).toMatchObject({ total: 334, reachable: 292, unreachable: 42 });
  });
});
