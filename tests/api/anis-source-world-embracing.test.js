// Round 6 (11-14): "Let your vision be world-embracing" — the live tower rows. The source card is a core passage that HOLDS the words
// (Lawḥ-i-Dunyá in Tablets of Bahá'u'lláh / its Gleanings copy), never Buck's study, never a passage without the phrase.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceHunt } from '../../api/lib/source-hunt.js';
import { sourceAnswer, holdsWords } from '../../api/lib/assistant/tool-runner.js';
import { cleanHeading } from '../../api/lib/sections.js';
import { placeOf } from '../../api/lib/refs/place.js';

const FX = JSON.parse(readFileSync(new URL('../fixtures/anis/source-world-embracing.json', import.meta.url), 'utf8'));
const Q = FX.quotation;
const [PP, BSW, FOW, OOL, NEAR] = FX.sourceOf;
const [FOWW, GL] = [FX.writings.find((p) => p.id === 23044930), FX.writings.find((p) => p.id === 29600940)];

describe('round 6: the quote card holds the quoted words', () => {
  it('every live holder really holds the phrase at the END of a long paragraph; the near passage does not', () => {
    for (const p of [PP, BSW, FOW, OOL, FOWW, GL]) expect(holdsWords(p.text, Q)).toBe(true);
    expect(holdsWords(NEAR.text, Q)).toBe(false);
    expect(FOW.text.indexOf('world-embracing')).toBeGreaterThan(400);   // the 300–400-char citation excerpt never shows it: the card must be whole
  });
  it('the live sourceOf list: Buck\'s study set aside, the compilation skipped, Fountain of Wisdom (Lawḥ-i-Dunyá) stands — holding the words', () => {
    const out = sourceAnswer(FX.sourceOf, Q);
    expect(out).toHaveLength(1);
    expect(out[0].document_id).toBe(20781);
    expect(out[0].text).toContain('Let your vision be world-embracing');
  });
  it('a "source" that does not hold the words is dropped and the next core holder taken; none → no source card', () => {
    const cut = { ...FOW, role: 'source', text: FOW.text.slice(0, 300) };      // the Fountain paragraph without its last sentences
    const out = sourceAnswer([cut, OOL, NEAR], Q);
    expect(out[0].source_url).toBe(OOL.source_url);
    expect(out[0].text).toContain('world-embracing');
    const none = sourceAnswer([cut, NEAR], Q);
    expect(none.every((p) => !/^SOURCE/.test(p.note || ''))).toBe(true);
  });
  it('the place reads "Lawḥ-i-Dunyá (Tablet of the World)", not the stored "7 -Lawḥ-i-Dunyá(Tablet of the World)"', () => {
    expect(cleanHeading(FOWW.locator)).toBe('Lawḥ-i-Dunyá (Tablet of the World)');
    expect(cleanHeading('11 -<br><br>Lawḥ-i-Maqṣúd<br>**(Tablet of Maqṣúd)')).toBe('Lawḥ-i-Maqṣúd (Tablet of Maqṣúd)');
    expect(cleanHeading('1.5 Beginnings')).toBe('1.5 Beginnings');
    expect(placeOf({ locator: cleanHeading(FOWW.locator) })).toBe('Lawḥ-i-Dunyá (Tablet of the World)');
  });
});

describe('round 6: sourceHunt (current code) on the live rows never names Buck\'s study', () => {
  const ROW = (p, extra = {}) => ({ id: p.id, doc_id: p.document_id, text: p.text, title: p.title, religion: p.religion, collection: p.collection ?? null,
    authors: null, book_author: p.book_author || p.author, source_site: p.link_site || null, url: p.source_url, ...extra });
  const study = { ...PP, id: 33334551 };
  const variants = [
    { book_author: 'Bahá’u’lláh' },                                                     // as the live row came out (author field = the quoted voice)
    { book_author: 'Christopher George Buck', authors: '[{"name":"Christopher George Buck","role":"author"},{"name":"Bahá’u’lláh","role":"quoted"}]' },
  ];
  for (const v of variants) it(`study as ${v.book_author}`, async () => {
    const rows = [ROW(study, v), ROW({ ...BSW, id: 23042889 }, { book_author: "Compilation (Bahá'í Writings)" }), ROW(FOWW), ROW(GL)];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const deps = {
      phrases: async () => ({ hits: rows.map((r) => ({ paragraph_id: r.id })) }),
      keyword: async () => ({ hits: [] }),
      rows: async (ids) => ids.map((i) => byId.get(i)).filter(Boolean),
      links: async (ids, { quotedBy }) => new Map(ids.map((id) => [id, { sources: [], original: null, quotedBy: quotedBy ? { count: 0, passages: [] } : undefined }])),
      passages: async () => new Map(),
      meta: async () => null,
    };
    const r = await sourceHunt(Q, deps, { coreOnly: true });
    expect([23044930, 29600940]).toContain(r.origin?.id);
    expect(r.origin.text).toContain('Let your vision be world-embracing');
  });
});
