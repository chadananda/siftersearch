# Mystical / Baghdád-Period Works of Bahá'u'lláh — Entity Verification (WORKS)

Read-only verification against `graph.db` (`entity_mentions` counts are STALE — directional only) + WebSearch. Four distinct works; merge title/spelling variants within each, never across.

---

## WORK 1 — The Hidden Words (Kalimát-i-Maknúnih)

**VERDICT:** KEEP `id=1220196` "The Hidden Words" (type=work) ← merge [1220906 "the Hidden Words" (41m), 1220095 "Hidden Words" (33m)]
**Confidence:** HIGH — pure case/article-prefix variants of one title; 50+41+33 = 124 mentions consolidated.

**FIREWALL:** Distinct from the Valleys works and from "Gleanings." Original title was *The Book of Fáṭimih* (Kitáb-i-Fáṭimih) — a same-work alias, not a separate entity, if it surfaces later.

**DESCRIBE:** Collection of ~153 gem-like ethical/mystical aphorisms revealed by Bahá'u'lláh in Baghdád (c. 1857–1858), partly in Arabic, partly in Persian. Original title *Kalimát-i-Maknúnih* ("Hidden Words") / *Kitáb-i-Fáṭimih* ("Book of Fáṭimih"). Cornerstone devotional text.

**FLAGS (language splits):**
- `id=1241973` "Persian Hidden Words" (5m) — this is the **Persian section** (82 Persian utterances) of the single work. The Hidden Words is conventionally a SINGLE work with two language halves (71 Arabic + 82 Persian).
- **Recommendation: DO NOT merge "Persian Hidden Words" into the main keeper blindly.** Decide a policy: either (a) treat the whole Hidden Words as ONE work and fold the Persian/Arabic halves in as same-work sections, or (b) keep "Arabic Hidden Words" / "Persian Hidden Words" as sub-parts. The corpus currently has only a Persian fragment and NO "Arabic Hidden Words" entity — asymmetric, so safest is to leave 1241973 as a flagged sub-part pending the policy call. Left UNMERGED here.

---

## WORK 2 — The Seven Valleys (Haft-Vádí)

**VERDICT:** KEEP `id=1220096` "Seven Valleys" (type=work) ← merge [1225430 "The Seven Valleys" (22m)]
**Confidence:** HIGH — article-prefix variant only; 34+22 = 56 mentions.

**FIREWALL:** **Seven Valleys ≠ Four Valleys.** They are two separate, distinct works, commonly published/paired together but never to be merged. Also distinct from Hidden Words and Gleanings.

**DESCRIBE:** *Haft-Vádí* — Bahá'u'lláh's mystical treatise describing the soul's seven-stage journey (Search, Love, Knowledge, Unity, Contentment, Wonderment, True Poverty & Absolute Nothingness) toward God; written in Baghdád, addressed to Shaykh Muḥyi'd-Dín. Sufi-inflected, modeled in dialogue with 'Aṭṭár's *Conference of the Birds*.

**FLAGS:** None. No language split (single Persian work).

---

## WORK 3 — The Four Valleys (Chahár-Vádí)

**VERDICT:** KEEP `id=1220092` "Four Valleys" (type=work) — no variants to merge (sole entity, 39m).
**Confidence:** HIGH.

**FIREWALL:** **Four Valleys ≠ Seven Valleys** — distinct work, kept fully separate despite the customary joint publication. Distinct from Hidden Words and Gleanings.

**DESCRIBE:** *Chahár-Vádí* — Bahá'u'lláh's mystical treatise addressed to Shaykh 'Abdu'r-Raḥmán-i-Karkútí, describing four "valleys" / paths of approach to God. Baghdád-period. Companion piece to the Seven Valleys but independent in addressee, structure, and content.

**FLAGS:** None.

---

## WORK 4 — Gleanings from the Writings of Bahá'u'lláh

**VERDICT:** KEEP `id=1222592` "Gleanings from the Writings of Bahá'u'lláh" (type=work) ← merge [1225631 "Gleanings" (90m)]
**Confidence:** HIGH on the merge (bare "Gleanings" is the ubiquitous short form of the full title; 90+35 = 125 mentions). Prefer the FULL title as keeper for disambiguation, even though the bare form has the higher stale count.

**FIREWALL:** **Gleanings is a 1935 COMPILATION by Shoghi Effendi** — selections/translations he excerpted from many separate Bahá'u'lláh tablets. It is a distinct bibliographic entity and must NOT be merged into any of its source tablets, nor into the Hidden Words or Valleys.

**DESCRIBE:** *Gleanings from the Writings of Bahá'u'lláh* (1935) — Shoghi Effendi's curated anthology and English translation of passages drawn from Bahá'u'lláh's tablets and books. Author/attribution nuance: works are Bahá'u'lláh's; the compilation+translation is Shoghi Effendi's.

**FLAGS:** Caution on the keeper choice — bare "Gleanings" (90m) outranks the full title (35m) by mention count, but "Gleanings" is ambiguous (could match other contexts); full title chosen as keeper deliberately. Counts are STALE regardless.

---

## SUMMARY OF MERGES

| Work | Keeper id | Merged ids | Type | Conf |
|------|-----------|-----------|------|------|
| The Hidden Words | 1220196 | 1220906, 1220095 | work | HIGH |
| Seven Valleys | 1220096 | 1225430 | work | HIGH |
| Four Valleys | 1220092 | (none) | work | HIGH |
| Gleanings (full title) | 1222592 | 1225631 | work | HIGH |
| Persian Hidden Words | 1241973 | LEFT UNMERGED — language-split policy call | work | flag |

**Out of scope / not touched:** 1224476 "Kalimát Press" (organization, false match), 1231526 "Kalimát-i-FirdawsIyyih" (Words of Paradise — a separate Tablet, NOT Hidden Words), 1228349 "Kalimát" (3m, ambiguous bare fragment).
