// entities/verify-link — the conflict veto. Facts are PRODUCTION-shaped ("<subject> — <relation> <object>", relation
// key from the controlled vocabulary, when = year, basis pin|estimate). The previous suite used a shape production never
// produced ("son of X" under 'related-to'), so it passed while the live gate vetoed correct links and missed real
// conflicts — the cases below marked MEASURED are those live failures (2026-09-27).
import { describe, it, expect } from 'vitest';
import { verifyLink, nisbas, objectOf } from '../../api/lib/rag/entities/verify-link.js';

// proof defaults to a span that carries the object and year (a provable claim); pass proof to test an unprovable one.
const f = (subject, relation, object, when = null, basis = 'pin', proof = `${relation} ${object} ${when ?? ''}`) => ({ statement: `${subject} — ${relation} ${object}`, relation, when, basis, proof });
const ok = (r) => expect(r.ok).toBe(true);
const veto = (r, axis) => { expect(r.ok).toBe(false); expect(r.axis).toBe(axis); };

describe('nisba — only a real nisba counts', () => {
  it('MEASURED: a given name or honorific ending in -í is not a nisba', () => {
    ok(verifyLink({ name: 'Ḥájí Mírzá Ḥasan', facts: [] }, { name: 'Mírzá Ḥasan-i-Yazdí', facts: [] }));
    ok(verifyLink({ name: 'Mullá ‘Alí', facts: [] }, { name: 'Mullá ‘Alíy-i-Basṭámí', facts: [] }));
    ok(verifyLink({ name: 'Siyyid Mihdí', facts: [] }, { name: 'Siyyid Mihdíy-i-Dahají', facts: [] }));
    expect([...nisbas('Ḥájí Mírzá Ḥasan')]).toEqual([]);
  });
  it('different nisbas veto', () => veto(verifyLink({ name: 'Mullá Ḥusayn-i-Bushrú’í', facts: [] }, { name: 'Mullá Ḥusayn-i-Yazdí', facts: [] }), 'nisba'));
  it('one shared nisba of several is the same (Qazvíní-Baraghání)', () => ok(verifyLink({ name: 'Ṭáhirih-i-Qazvíní', facts: [] }, { name: 'Fáṭimih-i-Baraghání-i-Qazvíní', facts: [] })));
  it('transliteration variants are the same nisba', () => ok(verifyLink({ name: 'Mullá Muḥammad-i-Turshízí', facts: [] }, { name: 'Mullá Muḥammad-i-Torshizi', facts: [] })));
});

describe('offices are flags, never vetoes', () => {
  it('MEASURED: the same office under two spellings of the name is not a conflict', () => {
    const r = verifyLink({ name: 'Mullá Ḥusayn', facts: [f('Mullá Ḥusayn', 'held-office', 'leader')] },
      { name: 'Mullá Ḥusayn-i-Bushrú’í', facts: [f('Mullá Ḥusayn-i-Bushrú’í', 'held-office', 'leader')] });
    expect(r).toMatchObject({ ok: true, axis: null });
  });
  it('a man who governed Zanján and later Shíráz is flagged, not split', () => {
    const r = verifyLink({ name: 'Mírzá ‘Alí-Aṣghar', facts: [f('Mírzá ‘Alí-Aṣghar', 'held-office', 'governor of Zanján')] },
      { name: 'Mírzá ‘Alí-Aṣghar', facts: [f('Mírzá ‘Alí-Aṣghar', 'held-office', 'governor of Shíráz')] });
    expect(r).toMatchObject({ ok: true, axis: 'role' });
  });
});

describe('parent — named parents that share no name veto', () => {
  it('MEASURED: production kinship claims ("X — son-of Y") are read', () =>
    veto(verifyLink({ name: 'Mírzá Músá', facts: [f('Mírzá Músá', 'son-of', 'Mírzá Buzurg')] }, { name: 'Mírzá Músá', facts: [f('Mírzá Músá', 'son-of', 'Mírzá Hádí')] }), 'kinship'));
  it('honorifics are not shared names; the same father under a longer form is compatible', () => {
    ok(verifyLink({ name: 'Mírzá Músá', facts: [f('Mírzá Músá', 'son-of', 'Mírzá Buzurg')] }, { name: 'Mírzá Músá', facts: [f('Mírzá Músá', 'son-of', 'Mírzá Buzurg-i-Núrí')] }));
  });
  it('one side without a parent claim is neutral', () => ok(verifyLink({ name: 'X', facts: [] }, { name: 'X', facts: [f('X', 'son-of', 'Y')] })));
  it('objectOf strips subject and relation', () => expect(objectOf(f('Mírzá Músá', 'son-of', 'Mírzá Buzurg'))).toBe('Mírzá Buzurg'));
});

describe('death and lifespan — stated years only', () => {
  it('stated death years that differ veto', () => veto(verifyLink({ name: 'X', facts: [f('X', 'died', 'Ṭihrán', 1849)] }, { name: 'X', facts: [f('X', 'died', 'Shíráz', 1892)] }), 'death'));
  it('MEASURED class: a year copied from the scene era (estimate) is no anchor', () =>
    ok(verifyLink({ name: 'X', facts: [f('X', 'martyred', 'Ṭabarsí', 1844, 'estimate')] }, { name: 'X', facts: [f('X', 'martyred', 'Ṭabarsí', 1849)] })));
  it('±1 year is a calendar conversion, not a conflict', () => ok(verifyLink({ name: 'X', facts: [f('X', 'died', 'Baghdád', 1848)] }, { name: 'X', facts: [f('X', 'died', 'Baghdád', 1849)] })));
  it('a dead figure cited in a later scene is not a lifespan clash', () =>
    ok(verifyLink({ name: 'Shaykh Aḥmad-i-Aḥsá’í', facts: [f('Shaykh Aḥmad-i-Aḥsá’í', 'mentioned-in', 'a sermon', 1852, 'estimate')] },
      { name: 'Shaykh Aḥmad-i-Aḥsá’í', facts: [f('Shaykh Aḥmad-i-Aḥsá’í', 'died', 'Medina', 1826)] })));
  it('born after the other died vetoes', () => veto(verifyLink({ name: 'X', facts: [f('X', 'born', 'Iṣfahán', 1860)] }, { name: 'X', facts: [f('X', 'died', 'Baghdád', 1850)] }), 'era'));
});

describe('side is a flag', () => {
  it('believer vs opponent is flagged, not vetoed', () =>
    expect(verifyLink({ name: 'Mírzá Yaḥyá', facts: [f('Mírzá Yaḥyá', 'believer', 'the Báb')] }, { name: 'Mírzá Yaḥyá', facts: [f('Mírzá Yaḥyá', 'covenant-breaker', '')] })).toMatchObject({ ok: true, axis: 'side' }));
  it('no facts on either side: nothing to contradict', () => expect(verifyLink({ name: 'Ṭáhirih', facts: [] }, { name: 'Ṭáhirih', facts: [] })).toMatchObject({ ok: true, axis: null }));
});

describe('a veto must be provable from the claim\'s own proof (MEASURED misextractions)', () => {
  it('a death year the proof does not contain does not veto', () =>
    ok(verifyLink({ name: 'Ṣubḥ-i-Azal', facts: [f('Ṣubḥ-i-Azal', 'died', 'Famagusta', 1853, 'pin', 'he was banished to Cyprus')] },
      { name: 'Mírzá Yaḥyá', facts: [f('Mírzá Yaḥyá', 'died', 'Famagusta', 1830, 'pin', 'the half-brother of Bahá’u’lláh')] })));
  it('a parent the proof does not name does not veto', () =>
    ok(verifyLink({ name: 'Laura Barney', facts: [f('Laura Barney', 'son-of', 'Lady Blomfield', null, 'stated', 'Laura Barney met Lady Blomfield in Paris')] },
      { name: 'Laura Clifford Barney', facts: [f('Laura Clifford Barney', 'daughter-of', 'Albert Clifford Barney', null, 'stated', 'daughter of Albert Clifford Barney')] })));
});
