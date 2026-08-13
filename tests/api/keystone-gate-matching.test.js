// The keystone gate answers "is this major figure split across several entities?". Its matcher used plain
// substring containment, so a keystone whose name is a PROPER PREFIX of a different person's name invented
// fragments: 'Badí‘' matched 'Mírzá Badí‘u’lláh' — Bahá'u'lláh's son and a Covenant-breaker, a different
// man — reporting Badí‘ as SPLIT across 27 fragments (2026-08-13). The relational filter cannot catch those:
// they carry no relational word and no " of ". These lock both directions: real continuations of the SAME
// name (Persian izafe) must still match, and different people must not.
import { describe, it, expect } from 'vitest';

// Mirrors the gate's matcher (scripts/entity-read/keystone-gate.mjs). Kept in the test because the gate is a
// script, not a module the API imports — see the note at the end.
const fold = (s) => s.toLowerCase().replace(/[‘’'`ʻʼ]/g, '');
const IZAFE_OR_BOUNDARY = /^(y?[-‑]i[-‑]|[^a-zà-ÿ]|$)/i;
const matchesForm = (name, key) => {
  let at = name.indexOf(key);
  while (at !== -1) {
    const before = at === 0 ? '' : name[at - 1];
    const after = name.slice(at + key.length);
    if ((!before || !/[a-zà-ÿ]/i.test(before)) && IZAFE_OR_BOUNDARY.test(after)) return true;
    at = name.indexOf(key, at + 1);
  }
  return false;
};
const matches = (entityName, rosterForm) => matchesForm(fold(entityName), fold(rosterForm));

describe('a different person is not a fragment', () => {
  it("Badí‘ does NOT match Mírzá Badí‘u'lláh — the martyr vs Bahá'u'lláh's son", () => {
    expect(matches('Mírzá Badí‘u’lláh', 'Badí‘')).toBe(false);
  });
  it('still matches the figure himself, however the apostrophes are written', () => {
    expect(matches("Badí'", 'Badí‘')).toBe(true);
    expect(matches('Badí‘', 'Badí‘')).toBe(true);
  });
  it('does not match a key buried inside an unrelated name', () => {
    expect(matches('Ghazálí', '‘Alí')).toBe(false);          // left edge must be a boundary too
    expect(matches('Ḥusayn-‘Alíy-i-Ghazálí', 'Ghazálí')).toBe(true);
  });
});

describe('the same name continuing (Persian izafe) IS a fragment', () => {
  it("Mírzá Ḥusayn-‘Alí matches Mírzá Ḥusayn-‘Alíy-i-Núrí — both Bahá'u'lláh", () => {
    expect(matches('Mírzá Ḥusayn-‘Alíy-i-Núrí', 'Mírzá Ḥusayn-‘Alí')).toBe(true);
  });
  it('matches a plain izafe continuation', () => {
    expect(matches('Vaḥíd-i-Dárábí', 'Vaḥíd')).toBe(true);
  });
  it('matches name + separate title', () => {
    expect(matches('Quddús the Last Letter', 'Quddús')).toBe(true);
  });
});

describe('the figures the gate flagged on 2026-08-13', () => {
  // Each pair is (entity in the corpus, roster form). Expected = is it really the same person?
  const cases = [
    ["Badí'", 'Badí‘', true],
    ['Mírzá Badí‘u’lláh', 'Badí‘', false],
    ['Mullá Ḥusayn', 'Mullá Ḥusayn', true],
    ['Mullá Ḥusayn-i-Bushrú’í', 'Mullá Ḥusayn', true],
    ["Bahá'u'lláh", "Bahá'u'lláh", true],
  ];
  it.each(cases)('%s vs form %s → same person: %s', (entity, form, expected) => {
    expect(matches(entity, form)).toBe(expected);
  });
});

// NOTE: the gate lives in scripts/ and reads the live DB, so this test pins the MATCHING RULE rather than
// importing it. If the rule changes in the gate, change it here — the duplication is deliberate and small,
// and the alternative (importing a script that opens a DB connection at module scope) is worse.
