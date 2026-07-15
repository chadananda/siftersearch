// entities/verify-link — deterministic contradiction check (the EEWA fabrication guardrail). Pure fn,
// no ports, no async. Tests use real Bahá'í cast so the cases are legible and domain-grounded.
import { describe, it, expect } from 'vitest';
import { verifyLink } from '../../api/lib/rag/entities/verify-link.js';

// ── helpers ──────────────────────────────────────────────────────────────────
const fact = (statement, relation = null, when = null) => ({ statement, relation, when });
const ok = (r) => expect(r).toMatchObject({ ok: true });
const reject = (r, axis) => { expect(r.ok).toBe(false); expect(r.axis).toBe(axis); };

// ── nisba axis ───────────────────────────────────────────────────────────────
describe('nisba — disjoint nisbas = different person', () => {
  it("rejects when cluster nisba (Bushrú'í) != candidate nisba (Yazdí)", () => {
    const cluster   = { name: "Mullá Ḥusayn-i-Bushrú'í", facts: [] };
    const candidate = { name: "Mullá Ḥusayn-i-Yazdí",   facts: [] };
    reject(verifyLink(cluster, candidate), 'nisba');
  });

  it("does NOT reject when one name has no nisba (absence is not conflict)", () => {
    const cluster   = { name: "Mullá Ḥusayn", facts: [] };
    const candidate = { name: "Mullá Ḥusayn-i-Bushrú'í", facts: [] };
    ok(verifyLink(cluster, candidate));
  });

  it("does NOT reject when a person has TWO nisbas and shares one (big-city + village exception)", () => {
    // Qazvíní-Baraghání: one person with both nisbas, shares Qazvíní
    const cluster   = { name: "Ṭáhirih-i-Qazvíníyyih", facts: [] };
    const candidate = { name: "Ṭáhirih-i-Baraghání-Qazvíní", facts: [] };
    ok(verifyLink(cluster, candidate));
  });

  it("treats transliteration variants of the same nisba as the SAME (Turshízí vs Torshizi)", () => {
    const cluster   = { name: "Mullá Muḥammad-i-Turshízí", facts: [] };
    const candidate = { name: "Mulla Muhammad Torshizi",   facts: [] };
    ok(verifyLink(cluster, candidate));
  });
});

// ── era axis ─────────────────────────────────────────────────────────────────
describe("era — only reject when BOTH have anchors proving impossible lifespan", () => {
  it("does NOT reject when a dead figure is merely CITED in a later scene (Shaykh Ahmad-i-Ahsa'i case)", () => {
    // Shaykh Ahmad died 1826; cluster mentions him in an 1852 scene — citation, not a lifespan clash
    const cluster   = { name: "Shaykh Aḥmad-i-Aḥsá'í", facts: [fact('led a school', null, '1852')] };
    const candidate = { name: "Shaykh Aḥmad-i-Aḥsá'í", facts: [fact('died at Medina', 'died', '1826')] };
    ok(verifyLink(cluster, candidate));
  });

  it("rejects when death year of one precedes birth year of the other (impossible lifespan)", () => {
    const cluster   = { name: "Mírzá Salmán", facts: [fact('born in Iṣfahán', 'born', '1860')] };
    const candidate = { name: "Mírzá Salmán", facts: [fact('died at Baghdád', 'died', '1850')] };
    reject(verifyLink(cluster, candidate), 'era');
  });
});

// ── death axis ───────────────────────────────────────────────────────────────
describe("death — conflicting death anchors = reject", () => {
  it("rejects when both have death years that differ", () => {
    const cluster   = { name: "Mírzá Ḥusayn-Khán", facts: [fact('died in Ṭihrán', 'died', '1849')] };
    const candidate = { name: "Mírzá Ḥusayn-Khán", facts: [fact('died in Shíráz', 'died', '1892')] };
    reject(verifyLink(cluster, candidate), 'death');
  });

  it("does NOT reject when only one side has a death year", () => {
    const cluster   = { name: "Siyyid Yaḥyá-i-Dárábí", facts: [] };
    const candidate = { name: "Siyyid Yaḥyá-i-Dárábí", facts: [fact('martyred at Nayríz', 'died', '1850')] };
    ok(verifyLink(cluster, candidate));
  });
});

// ── role axis ─────────────────────────────────────────────────────────────────
describe("role — incompatible specific offices = reject", () => {
  it("rejects when offices are incompatible (governor of Zanján vs governor of Shíráz)", () => {
    const cluster   = { name: "Mírzá 'Alí-Aṣghar", facts: [fact('served as governor of Zanján', 'held-office')] };
    const candidate = { name: "Mírzá 'Alí-Aṣghar", facts: [fact('served as governor of Shíráz', 'held-office')] };
    reject(verifyLink(cluster, candidate), 'role');
  });

  it("does NOT reject on generic or overlapping titles (both called teacher)", () => {
    const cluster   = { name: "Shaykh Muḥammad", facts: [fact('a devoted teacher', 'has-title')] };
    const candidate = { name: "Shaykh Muḥammad", facts: [fact('teacher of Islamic studies', 'has-title')] };
    ok(verifyLink(cluster, candidate));
  });

  it("rejects when specific role names are clearly distinct (amanuensis vs traditions-scholar)", () => {
    const cluster   = { name: "Siyyid Ḥusayn", facts: [fact("the Báb's amanuensis", 'held-office')] };
    const candidate = { name: "Siyyid Ḥusayn", facts: [fact('traditions-scholar of Iṣfahán', 'held-office')] };
    reject(verifyLink(cluster, candidate), 'role');
  });
});

// ── kinship axis ──────────────────────────────────────────────────────────────
describe("kinship — same relation type pointing to different people = reject", () => {
  it("rejects when both are son-of different fathers", () => {
    const cluster   = { name: "Mullá Ḥusayn", facts: [fact('son of Mírzá Buzurg', 'related-to')] };
    const candidate = { name: "Mullá Ḥusayn", facts: [fact('son of Áqá Muḥammad', 'related-to')] };
    reject(verifyLink(cluster, candidate), 'kinship');
  });

  it("does NOT reject when only one side has a kinship fact", () => {
    const cluster   = { name: "Siyyid Muḥammad", facts: [] };
    const candidate = { name: "Siyyid Muḥammad", facts: [fact('son of Siyyid Kázim', 'related-to')] };
    ok(verifyLink(cluster, candidate));
  });
});

// ── side axis (soft flag, not reject) ────────────────────────────────────────
describe("side — Bábí/Bahá'í are non-conflicting; opponent-vs-believer is a soft flag", () => {
  it("does NOT reject Bábí vs Bahá'í (final-allegiance shift is normal)", () => {
    const cluster   = { name: "Nabíl-i-A'ẓam", facts: [fact("a devoted Bábí", 'side')] };
    const candidate = { name: "Nabíl-i-A'ẓam", facts: [fact("a Bahá'í", 'side')], side: 'bahai' };
    const r = verifyLink(cluster, candidate);
    expect(r.ok).toBe(true);
  });

  it("flags ok:true axis:side when believer vs opponent", () => {
    const cluster   = { name: "Mírzá Yaḥyá", facts: [fact("a Bábí believer", 'side')] };
    const candidate = { name: "Mírzá Yaḥyá", facts: [fact("an opponent of the Faith", 'side')], side: 'opponent' };
    const r = verifyLink(cluster, candidate);
    expect(r.ok).toBe(true);
    expect(r.axis).toBe('side');
    expect(r.reason).toMatch(/flag/i);
  });
});

// ── clean + degenerate cases ──────────────────────────────────────────────────
describe("clean match and degenerate inputs", () => {
  it("returns ok:true axis:null when facts are fully compatible (same person)", () => {
    const cluster   = { name: "Quddús", facts: [fact('martyred at Bárfurúsh', 'died', '1849'), fact('last Letter of the Living', 'has-title')] };
    const candidate = { name: "Quddús", facts: [fact('died at Bárfurúsh', 'died', '1849'), fact('eighteenth Letter of the Living', 'has-title')] };
    const r = verifyLink(cluster, candidate);
    expect(r).toMatchObject({ ok: true, axis: null });
  });

  it("returns ok:true when both fact arrays are empty (nothing to contradict)", () => {
    const r = verifyLink({ name: "Ṭáhirih", facts: [] }, { name: "Ṭáhirih", facts: [] });
    expect(r).toMatchObject({ ok: true, axis: null });
  });

  it("returns ok:true when cluster has no facts but candidate has many", () => {
    const candidate = { name: "Bahá'u'lláh", facts: [
      fact('born in Ṭihrán', 'born', '1817'),
      fact('died at Bahjí', 'died', '1892'),
      fact("Founder of the Bahá'í Faith", 'has-title'),
    ]};
    const r = verifyLink({ name: "Bahá'u'lláh", facts: [] }, candidate);
    expect(r).toMatchObject({ ok: true, axis: null });
  });
});
