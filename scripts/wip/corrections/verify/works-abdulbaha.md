# Works of ‘Abdu'l-Bahá — Entity Verification

READ-ONLY verification. All mention counts are entity_mentions on graph.db (STALE — orphan-mention
miscount known; treat counts as relative weight, not absolute). content_id is TEXT → CAST to INTEGER.

Corpus probe (entity_type='work' unless noted):

| id | name | type | mentions |
|----|------|------|----------|
| 1219294 | Will and Testament of 'Abdu'l-Bahá | work | 170 |
| 1220015 | Some Answered Questions | work | 52 |
| 1219522 | A Traveller's Narrative | work | 48 |
| 1221044 | Tablets of the Divine Plan | work | 42 |
| 1222926 | Memorials of the Faithful | work | 21 |
| 1222934 | The Secret of Divine Civilization | work | 18 |
| 1221110 | 'Abdu'l-Bahá's Will and Testament | work | 10 |
| 1223448 | Master's Will and Testament | work | 3 |
| 1229144 | ’Abdu’l-Bahá's Will and Testament | work | 1 |
| 1226726 | Historical Consciousness and the Divine Plan | work | 1 (NOT a primary work — leave) |
| 1222076 / 1223004 / 1191451 | Divine Plan | concept | 25/7/6 (concept, NOT the book — leave) |

---

## 1. Some Answered Questions

**VERDICT:** KEEP 1220015 `Some Answered Questions` (type=work). No title-variants found to merge.
**Confidence:** HIGH.
**FIREWALL:** Distinct from all other works. Original = *Mufávaḍát* (al-Núrayn al-Nayyirayn /
"table talks"), Laura Clifford Barney's compiled answers, Akka 1904–06, pub. 1908. Not a tablet, not
a will, not a narrative.
**DESCRIBE:** ‘Abdu'l-Bahá's recorded table-talk answers on theological/philosophical questions,
compiled by Laura Barney. Persian/English title *Some Answered Questions* (Mufávaḍát).
**FLAGS:** Clean singleton — no Persian-title variant entity in corpus to merge.

## 2. The Secret of Divine Civilization

**VERDICT:** KEEP 1222934 `The Secret of Divine Civilization` (type=work). No variants to merge.
**Confidence:** HIGH.
**FIREWALL:** Distinct. Original = *Risáliy-i-Madaníyyih* (also "The Mysterious Forces of
Civilization" in 1910 Johanna Dawud trans.), written 1875. Not Some Answered Questions, not a tablet.
**DESCRIBE:** ‘Abdu'l-Bahá's 1875 treatise on the regeneration of Persia / material & spiritual
civilization. Original title *Risáliy-i-Madaníyyih*.
**FLAGS:** No *Risáliy-i-Madaníyyih* / "Mysterious Forces of Civilization" variant entity present to
merge. Clean singleton.

## 3. Tablets of the Divine Plan

**VERDICT:** KEEP 1221044 `Tablets of the Divine Plan` (type=work). No work-variants to merge.
**Confidence:** HIGH.
**FIREWALL:** This is the WORK (14 tablets, 1916–17, to North American Bahá'ís). It is NOT the
*concept* "Divine Plan" — entities 1222076 / 1223004 / 1191451 are `concept`-typed "Divine Plan" /
"the Divine Plan" and must stay separate (the plan vs. the book of tablets). 1226726 "Historical
Consciousness and the Divine Plan" is a secondary/derivative work — leave separate. 1223069 "Second
Epoch of ‘Abdu'l-Bahá's Divine Plan" is an event — leave.
**DESCRIBE:** Collection of fourteen tablets revealed by ‘Abdu'l-Bahá 1916–1917 charting the
worldwide teaching plan, addressed to the Bahá'ís of the United States and Canada.
**FLAGS:** Watch the concept↔work boundary; do NOT roll the "Divine Plan" concept entities into the
book.

## 4. The Will and Testament of ‘Abdu'l-Bahá

**VERDICT:** KEEP 1219294 `Will and Testament of 'Abdu'l-Bahá` (type=work, 170 mentions) ←
MERGE title-variants: 1221110 `'Abdu'l-Bahá's Will and Testament` (10), 1223448 `Master's Will and
Testament` (3), 1229144 `’Abdu’l-Bahá's Will and Testament` (1, curly-apostrophe dup).
**Confidence:** HIGH for keeper + the three variants (all confirmed same work).
**FIREWALL (CRITICAL):** ‘Abdu'l-Bahá's Will and Testament ≠ Bahá'u'lláh's **Kitáb-i-‘Ahd** (the
Book of the Covenant). Separate entities EXIST and must stay separate:
  - 1220902 `Book of the Covenant` (49 mentions) — context confirms Bahá'u'lláh's (Mírzá Yaḥyá,
    Sirru'lláh, naming the Master) → do NOT merge.
  - 1226506 `Kitáb-i-'Ahd` (1) and 1240872 `Kitáb-i-‘Ahd` (1) — Bahá'u'lláh's will → do NOT merge
    (these two are curly/straight-apostrophe dups of EACH OTHER and could merge together, but that's
    a SEPARATE Bahá'u'lláh-work consolidation, out of scope here).
  Keeper context (1219294) confirms ‘Abdu'l-Bahá's: "the Will of the Master was read… three parts."
**DESCRIBE:** ‘Abdu'l-Bahá's three-part testamentary document (written ~1901–08) appointing Shoghi
Effendi as Guardian and establishing the Administrative Order / Universal House of Justice. A
distinct will from Bahá'u'lláh's Kitáb-i-‘Ahd.
**FLAGS:** Highest merge-risk work in the set. The "Master's Will and Testament" variant (1223448)
is unambiguous ("Master" = ‘Abdu'l-Bahá) — safe. Verify ge.name string equality only after the
curly/straight apostrophe normalization; 1229144 is purely a Unicode-apostrophe duplicate of keeper.

## 5. A Traveller's Narrative

**VERDICT:** KEEP 1219522 `A Traveller's Narrative` (type=work). No variants to merge.
**Confidence:** HIGH.
**FIREWALL:** ‘Abdu'l-Bahá's narrative (original *Maqálih-'i-Shakhṣí-Sayyáh*, "Narrative of a
Traveller", composed ~1886, ed./trans. E.G. Browne 1891) ≠ any other narrative or travelogue. Full
title "A Traveller's Narrative Written to Illustrate the Episode of the Báb." Distinct from Nabíl's
narrative (Dawn-Breakers) and from Memorials of the Faithful.
**DESCRIBE:** ‘Abdu'l-Bahá's anonymous historical account of the Báb's ministry, written ~1886,
translated by E.G. Browne (1891). Original *Maqálih-'i-Shakhṣí-Sayyáh*.
**FLAGS:** Spelling variant "Traveler's Narrative" (single-l) queried — none present. No
*Maqálih-i-Shakhṣí-Sayyáh* original-title entity to merge. Clean singleton.

## 6. Memorials of the Faithful

**VERDICT:** KEEP 1222926 `Memorials of the Faithful` (type=work). No variants to merge.
**Confidence:** HIGH.
**FIREWALL:** Distinct. Original *Tadhkiratu'l-Vafá*, Marzieh Gail trans. 1971. ‘Abdu'l-Bahá's
biographical memorials of early believers — NOT A Traveller's Narrative, NOT Nabíl's Dawn-Breakers.
**DESCRIBE:** ‘Abdu'l-Bahá's collection of ~69 short biographical tributes to deceased early Bahá'ís
and Bábís, delivered in Haifa ~1915, pub. as *Tadhkiratu'l-Vafá*.
**FLAGS:** No *Tadhkiratu'l-Vafá* original-title entity present to merge. Clean singleton.

---

## SUMMARY OF MERGES (proposed, NOT executed — read-only run)

| Keeper | Merge in | Notes |
|--------|----------|-------|
| 1219294 Will and Testament of 'Abdu'l-Bahá | 1221110, 1223448, 1229144 | Will&T cluster only |

All other five works are clean singletons (no work-typed title-variants in corpus).

## DO-NOT-MERGE (firewalls held)
- 1220902 Book of the Covenant / 1226506 + 1240872 Kitáb-i-‘Ahd → Bahá'u'lláh's will, separate work.
- 1222076 / 1223004 / 1191451 "Divine Plan" (concept) → the plan, not Tablets of the Divine Plan (book).
- 1226726 Historical Consciousness and the Divine Plan → derivative work, not a primary ‘Abdu'l-Bahá work.
- 1223069 Second Epoch of ‘Abdu'l-Bahá's Divine Plan → event type.
