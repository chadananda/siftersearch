// The keystone gate asks "is this major figure split across several entities?" — a question about IDENTITY,
// which is a judgment on evidence, not a string comparison. People carry many titles and epithets (the Báb:
// Primal Point, the Remembrance, Siyyid ‘Alí-Muḥammad), so no rule can decide it.
//
// The division of labour these tests pin:
//   strings  → RECALL. Cast a wide net over a figure's known forms. Broad on purpose; a tighter rule loses
//              real fragments and still never catches a title it was not told about.
//   rules    → drop only what is structurally NOT an identity claim (relational descriptors, "X of Y").
//   the LLM  → DECIDES, via the same IDENTITY_DOCTRINE prompt the merge stage uses.
//
// A boundary-matching rule was briefly added here (2026-08-13) to suppress one false positive and then
// reverted: 'Badí‘' vs 'Mírzá Badí‘u’lláh' is precisely a job for the adjudicator, which knows one is a
// martyred youth and the other a Covenant-breaker son.
import { describe, it, expect } from 'vitest';
import { SYSTEM, buildUser, parseMerge } from '../../api/lib/rag/entities/merge.js';

const fold = (s) => s.toLowerCase().replace(/[‘’'`ʻʼ]/g, '');
const recalls = (entityName, rosterForm) => fold(entityName).includes(fold(rosterForm));

// The gate's structural filters (scripts/entity-read/keystone-gate.mjs).
const RELATIONAL = /\b(sons?|daughters?|father|mother|brothers?|sisters?|wife|servants?|attendants?|companions?|followers?|amanuensis|scribe)\b/i;
const REL_OF = /\bof\b/i;
const isName = (n) => !(RELATIONAL.test(n) || REL_OF.test(n));

describe('strings do RECALL — deliberately broad', () => {
  it('recalls a variant spelling of the same figure', () => {
    expect(recalls("Badí'", 'Badí‘')).toBe(true);
    expect(recalls('Mullá Ḥusayn-i-Bushrú’í', 'Mullá Ḥusayn')).toBe(true);
  });

  it('recalls a DIFFERENT person as a candidate — and that is correct, not a bug', () => {
    // The adjudicator, not the matcher, is what keeps Bahá'u'lláh's son out of the martyr's identity.
    expect(recalls('Mírzá Badí‘u’lláh', 'Badí‘')).toBe(true);
  });

  it('cannot reach a title it was not given — the reason recall alone is insufficient', () => {
    expect(recalls('The Primal Point', 'Siyyid ‘Alí-Muḥammad')).toBe(false);
  });
});

describe('rules drop only what is structurally not an identity claim', () => {
  it('drops relational descriptors — a different person defined by their relation', () => {
    expect(isName('Ḥasan, attendant of Mullá Ḥusayn')).toBe(false);
    expect(isName("the father of the Báb")).toBe(false);
  });
  it('keeps plain names for the adjudicator to judge', () => {
    expect(isName('Mírzá Badí‘u’lláh')).toBe(true);
    expect(isName("Badí'")).toBe(true);
  });
});

describe('the LLM decides, with the evidence it needs', () => {
  const group = {
    key: 'Badí‘',
    entities: [
      { id: 1, canonical: "Badí'", mentions: 40, summary: 'the youth who bore the Tablet to the Sháh; martyred 1869' },
      { id: 2, canonical: 'Mírzá Badí‘u’lláh', mentions: 12, summary: "son of Bahá'u'lláh; later a Covenant-breaker" },
    ],
  };

  it('puts the distinguishing evidence in the prompt, not just the names', () => {
    const user = buildUser(group);
    expect(user).toContain('Covenant-breaker');           // the fact that splits them
    expect(user).toContain('martyred 1869');
    expect(user).toContain('40 mentions');                // richness, for choosing canonical
  });

  it('carries the doctrine that governs the split', () => {
    expect(SYSTEM).toMatch(/EVIDENCE CONSISTENCY/);
    expect(SYSTEM).toMatch(/KEEP APART/);
    expect(SYSTEM).toMatch(/nisba/i);                     // Yazdí vs Turshízí is near-decisive
  });

  it('reads a verdict that keeps the son distinct from the martyr', () => {
    const v = parseMerge('{"canonical":1,"same":[],"distinct":[2],"reason":"son and Covenant-breaker, not the martyr"}');
    expect(v.same).toEqual([]);
    expect(v.distinct).toEqual([2]);
  });

  it('returns null on an unparseable verdict so the gate reports UNJUDGED rather than guessing', () => {
    expect(parseMerge('the model rambled without JSON')).toBeNull();
  });
});
