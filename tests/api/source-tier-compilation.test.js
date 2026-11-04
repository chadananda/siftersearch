// 11-04 improve digest (#242 #227 #118 #136): a passage of a compilation of the Writings with no writer attributed was
// labelled and weighed as commentary ('secondary'); a hit whose document has no religion had no tier at all, silently.
// Class cases (made-up books, not the evidence titles): the compilation tier, its doctrinal place, the House exclusion,
// the tier-gap code in a trace, and ASCII/diacritic folding of names in the keyword index.
import { describe, it, expect } from 'vitest';
import { sourceTier, byTier, tierLabel, tierGap, hasAuthoritative } from '../../api/lib/assistant/source-tier.js';
import { doctrinalFactor, writingsCompilation, COMPILATION, PILGRIM as PILGRIM_FACTOR } from '../../api/lib/search/doctrinal-rank.js';
import { compactHit, expandHits, GAP_CODE, tierGapStats } from '../../api/lib/search-trace.js';
import { copyClass } from '../../api/lib/audit/forensics.js';
import { tokens } from '../../api/lib/keyword-tokens.js';

const B = "Baha'i";
// unattributed passages: the paragraph's author fell back to the book's (paragraphs-repo paragraphAuthor)
const unattributed = (book, extra = {}) => ({ author: book, book_author: book, religion: B, ...extra });
const COMPILED_BY_FIGURES = unattributed('Bahá’u’lláh, the Báb and ‘Abdu’l-Bahá (compiled)', { title: 'Prayers for Every Occasion', collection: "Baha'i Books" });
const COMPILATION_LABEL = unattributed('Compilation (Bahá’í Writings)', { title: 'Sacred Texts on Justice', collection: 'Bahá’u’lláh' });
const SHELVED = unattributed('Various', { title: 'A Compilation on Prayer', collection: '‘Abdu’l-Bahá' });
const RD = unattributed('Research Department of the Universal House of Justice (compiler)', { title: 'Consultation', collection: 'Research Department Compilations' });
const SCHOLAR_ANTHOLOGY = unattributed('Jane Doe (compiler)', { title: 'Selected Essays on Service', collection: "Baha'i Books" });
const ATTRIBUTED_IN_COMPILATION = { author: 'Bahá’u’lláh', book_author: 'Compilation (Bahá’í Writings)', religion: B, title: 'Sacred Texts on Justice', collection: 'Bahá’u’lláh' };
const INTRO_BY_EDITOR = { author: 'John Smith', book_author: 'Bahá’u’lláh and ‘Abdu’l-Bahá (compiled)', religion: B, title: 'Prayers for Every Occasion', collection: "Baha'i Books" };
const PILGRIM_NOTE = { author: 'A Pilgrim', religion: B, title: 'Notes of a Visit', collection: 'Pilgrim Notes' };
const SE = { author: 'Shoghi Effendi', book_author: 'Shoghi Effendi', religion: B, title: 'Letters', collection: 'Core Publications' };
const COMMENTARY = { author: 'A Scholar', book_author: 'A Scholar', religion: B, title: 'A Study', collection: "Baha'i Books" };

describe('a compilation of the Writings, passage writer unattributed (#242 #118)', () => {
  it("is 'compilation' — not commentary, not a confirmed Writing", () => {
    for (const p of [COMPILED_BY_FIGURES, COMPILATION_LABEL, SHELVED]) expect(sourceTier(p), p.title).toBe('compilation');
    expect(hasAuthoritative([COMPILATION_LABEL])).toBe(false);
    expect(tierLabel(COMPILATION_LABEL)).toMatch(/COMPILATION OF THE WRITINGS/);
    expect(copyClass({ ...COMPILATION_LABEL, tier: 'compilation' })).toBe('compilation');
  });
  it("an attributed passage keeps its writer's tier; an editor's own words stay commentary", () => {
    expect(sourceTier(ATTRIBUTED_IN_COMPILATION)).toBe('writings');
    expect(sourceTier(INTRO_BY_EDITOR)).toBe('secondary');
    expect(writingsCompilation(INTRO_BY_EDITOR)).toBe(false);
  });
  it('a House / Research Department compilation is not lifted (doctrine: commentary, below pilgrim notes)', () => {
    expect(sourceTier(RD)).toBe('house');
    expect(writingsCompilation(RD)).toBe(false);
    expect(doctrinalFactor(RD, 7)).toBeLessThan(PILGRIM_FACTOR);
  });
  it("a scholar's anthology is not a compilation of the Writings", () => {
    expect(sourceTier(SCHOLAR_ANTHOLOGY)).toBe('secondary');
  });
  it('doctrine: below Shoghi Effendi, above pilgrim notes and commentary; cross-tradition weighing (author null) unchanged', () => {
    const f = (p) => doctrinalFactor(p, 8);
    expect(f(COMPILATION_LABEL)).toBe(COMPILATION);
    expect(f(SE)).toBeGreaterThan(f(COMPILATION_LABEL));
    expect(f(COMPILATION_LABEL)).toBeGreaterThan(f(PILGRIM_NOTE));
    expect(f(COMPILATION_LABEL)).toBeGreaterThan(doctrinalFactor(COMMENTARY, 5));
    expect(doctrinalFactor({ ...COMPILATION_LABEL, author: null }, 8)).toBe(2.2);   // numberFactor(8), as before
    expect(doctrinalFactor({ ...COMPILATION_LABEL, author: null }, 6)).toBe(1.0);
  });
  it('orders after the Guardian and before reported speech', () => {
    expect(byTier([COMMENTARY, PILGRIM_NOTE, COMPILATION_LABEL, SE]).map((p) => p.title)).toEqual(['Letters', 'Sacred Texts on Justice', 'Notes of a Visit', 'A Study']);
  });
});

describe('a hit with no readable tier is flagged, never guessed (#227)', () => {
  const NO_RELIGION = { id: 9, doc_id: 77001, author: '1234', religion: null, title: 'An Untagged Book', collection: '' };
  it('tierGap: a hydrated document with no religion; not a raw layer hit, not another tradition', () => {
    expect(tierGap(NO_RELIGION)).toBe('no-religion');
    expect(tierGap({ paragraph_id: 1, doc_id: 2 })).toBe(null);
    expect(tierGap({ religion: 'Buddhism', doc_id: 3 })).toBe(null);
  });
  it('the trace stores the gap code, counts it, and reads it back as tier_gap', () => {
    const before = tierGapStats().hits;
    const row = compactHit(NO_RELIGION);
    expect(row[4]).toBe(GAP_CODE);
    expect(tierGapStats().hits).toBe(before + 1);
    expect(tierGapStats().sample).toContain(77001);
    const [h] = expandHits([row]);
    expect(h.tier).toBe(null);
    expect(h.tier_gap).toBe('no-religion');
    expect(compactHit({ ...COMPILATION_LABEL, doc_id: 5 })[4]).toBe('C');
    expect(expandHits([compactHit({ ...COMPILATION_LABEL, doc_id: 5 })])[0].tier).toBe('compilation');
  });
  it('a document read on expand (no stored code) with no religion is flagged too', () => {
    const [h] = expandHits([[1, 88, 0.1, 'phrase', null]], new Map([[88, { title: 'X', author: '99', religion: null, collection: '' }]]));
    expect(h.tier_gap).toBe('no-religion');
  });
});

describe('names fold alike in the keyword index (#136)', () => {
  it('ASCII, curly-apostrophe, hyphen and diacritic spellings give the same tokens', () => {
    const want = tokens('‘Abdu’l-Bahá');
    for (const s of ["Abdu'l-Baha", "Abdu'l Baha", 'Abdu`l-Baha']) expect(tokens(s), s).toEqual(want);
    expect(tokens('Baha’u’llah')).toEqual(tokens('Bahá’u’lláh'));
  });
});

// PRODUCTION FOLLOW-UP (11-04, replays on tower after f46c28d7): the shapes below are the REAL documents of the digest traces
// (docs table: author, collection, religion; authority from authority.js getAuthority on that row). Two defects:
//  1. the ops replay printed '·' for every 'compilation' and every tier gap (trace-format.mjs knew neither code), so the
//     fix looked absent — the JSON carried tier 'compilation' (doc 967528) and tier_gap 'no-religion' (209071, 329706, 22751…);
//  2. the unscoped (cross-tradition) rerank withholds the writer (author: null → authority NUMBER), so the compilation rule
//     never ran there: "Bahá’í World Faith" read authority 5 → 0.85, under a scholar's book filed in Pilgrim Notes (1.6).
describe('production shapes: the cross-tradition weighing and the replay printout', () => {
  const BWF = { author: 'Bahá’u’lláh and ‘Abdu’l-Bahá (compiled)', book_author: 'Bahá’u’lláh and ‘Abdu’l-Bahá (compiled)', religion: 'Bahá’í', collection: null, title: 'Bahá’í World Faith: Selected Writings of Bahá’u’lláh and ‘Abdu’l-Bahá' };
  const SACRED = { author: "Compilation (Bahá'í Writings)", book_author: "Compilation (Bahá'í Writings)", religion: 'Bahá’í', collection: 'Bahá’u’lláh', title: 'Bahá’í Sacred Writings' };
  const PATTERN = { author: '4461', book_author: '4461', religion: null, collection: '', title: "The Pattern of Baha'i life" };
  const NOTES_SHELVED = { author: 'Jack McLean', book_author: 'Jack McLean', religion: 'Bahá’í', collection: 'Pilgrim Notes', title: 'A Memoir' };
  const cross = (p) => ({ ...p, author: null, writings_compilation: writingsCompilation(p) });   // what search.js passes unscoped

  it('across traditions a Writings compilation weighs at its place (2.2), not by a low authority number', () => {
    expect(doctrinalFactor({ ...BWF, author: null }, 5)).toBe(0.85);                // before: the writer withheld, number 5
    expect(doctrinalFactor(cross(BWF), 5)).toBe(COMPILATION);
    expect(doctrinalFactor(cross(BWF), 5)).toBeGreaterThan(doctrinalFactor(cross(NOTES_SHELVED), 5));
    expect(doctrinalFactor(cross(SACRED), 8)).toBe(COMPILATION);                   // already 2.2 by its number: unchanged
    expect(doctrinalFactor(cross(SACRED), 10)).toBe(2.8);                          // a higher number is never lowered
  });
  it('nothing else moves across traditions: other scripture, House compilations, untagged books keep their number', () => {
    expect(doctrinalFactor(cross({ author: 'Various', religion: 'Zoroastrianism', collection: 'Zoroastrian', title: 'Khordeh Avesta' }), 5)).toBe(0.85);
    expect(doctrinalFactor(cross(RD), 7)).toBe(1.3);
    expect(doctrinalFactor(cross(PATTERN), 5)).toBe(0.85);   // no religion, numeric author: a metadata gap, not guessed
    expect(writingsCompilation(PATTERN)).toBe(false);
  });
  it('the replay printout marks C for a compilation and X for a tier gap (was · for both)', async () => {
    const { tierMark, hitLines } = await import('../../scripts/ops/trace-format.mjs');
    expect(tierMark({ tier: 'compilation' })).toBe('C');
    expect(tierMark({ tier: null, tier_gap: 'no-religion' })).toBe('X');
    expect(tierMark({ tier: null })).toBe('·');
    const [h] = expandHits([compactHit({ ...BWF, doc_id: 967528, id: 1 })], new Map([[967528, BWF]]));
    expect(h).toMatchObject({ tier: 'compilation', collection: null, religion: 'Bahá’í' });
    expect(hitLines([h])[0]).toMatch(/^\s+1 C /);
    const [g] = expandHits([[2, 22751, 0.1, 'phrase', null]], new Map([[22751, PATTERN]]));
    expect(hitLines([g])[0]).toMatch(/^\s+1 X /);
  });
});
