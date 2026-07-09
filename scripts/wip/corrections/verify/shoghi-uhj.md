# Verification: Shoghi Effendi & the Universal House of Justice

Cross-corpus entity consolidation. READ-ONLY analysis (no DB writes performed).
graph_entities lives in `sifter.db`; entity_mentions lives in `graph.db` (mention counts are STALE per task note, used only for relative ranking).

---

## VERDICT 1 — Shoghi Effendi (PERSON, keeper)

**Keeper: `614423` "Shoghi Effendi" (person)** — clean canonical name, highest count (1005).

Merge into 614423:
| id | fragment | type | m | note |
|----|----------|------|---|------|
| 1223010 | Shoghi Effendi | person | 152 | exact dup |
| 1222824 | The Guardian | **work (MISLABEL)** | 214 | VERIFIED person — see below |
| 1223473 | the Guardian | person | 107 | anaphora → Shoghi |
| 1222859 | Guardian of the Cause of God | title | 30 | his official title |
| 1224861 | Guardian of the Cause | concept | 7 | title variant |
| 623984 | Guardian Shoghi Effendi | person | 1 | |
| 626521 | Shoghi Effendi Rabbání | person | 1 | full surname form |
| 640236 | Shoghi Rabbani | person | 1 | |
| 615724 | Shoghi | person | 6 | given name, context-gated |
| 1012221 | Shoghi Effend | person | 1 | truncation typo |
| 1222954 | Resting-place of Shoghi Effendi | place | 2 | KEEP separate (place, not person) |
| 1232319 | Passing of Shoghi Effendi | event | 1 | KEEP separate (event) |
| 1246161 | the Guardianship | concept | 1 | KEEP separate (the institution/office, not the man) |
| 2834... | Writings of Shoghi Effendi (1222834) | work | 5 | KEEP separate (his corpus, not him) |

**Confidence: HIGH (0.97)** for the core merge (1223010, 1222824, 1223473, 1222859, 1224861, 623984, 626521, 640236, 1012221). MEDIUM for 615724 "Shoghi" (bare given name — adjudicate per-mention; almost certainly him in this corpus).

**Key finding — "The Guardian" (1222824) is mislabeled as a WORK.** It is Shoghi Effendi the person. Evidence: grammatical roles are person-like (subject 124, possessive 38, object 40, appositive 5 — a publication is not "the subject/possessive" of sentences), and sampled mention contexts are UHJ letters discussing "the infallibility of the Guardian," "the sphere of the Guardian's authority," "letters written on behalf of the Guardian." This is the single largest merge gain (214 mentions recovered from a wrong type).

WEB CONFIRMED: Shoghi Effendi Rabbání, b. 1 Mar 1897 ʻAkká – d. 4 Nov 1957 London; Guardian of the Cause of God 1921–1957; eldest grandson and appointed successor of ‘Abdu'l-Bahá; author/compiler/translator of *God Passes By* (doc 21310, author = "Shoghi Effendi").

---

## VERDICT 2 — Universal House of Justice (ORGANIZATION, keeper)

**Keeper: `1221777` "Universal House of Justice" (organization)** — full canonical name, highest count (1094).

Merge into 1221777:
| id | fragment | type | m | note |
|----|----------|------|---|------|
| 1220624 | House of Justice | organization | 432 | short form |
| 1226746 | UHJ | organization | 10 | acronym |
| 1223295 | God's Universal House of Justice | organization | 1 | |
| 1228879 | God's House of Justice | organization | 1 | |
| 1226732 | the men of God's House of Justice | organization | 2 | |
| 1229603 | Supreme Body | organization | (low) | epithet (context-gate, see FLAGS) |

KEEP SEPARATE (distinct entities, NOT the institution itself):
- 1224415 Research Department of the Universal House of Justice (org) — sub-body, distinct (103)
- 1222889 Seat of the UHJ / 1224326 Permanent Seat / 1228284 Seat of the House of Justice / 1224569 Council Chamber — PLACES
- 1221795 International House of Justice (12) / 1220689 Trustees / 1222861 Ministers — distinct sub/variant orgs, adjudicate separately
- All `...message of...` / `Constitution of...` / `Messages 1963-1986` (1222864, 1226753, 1226761, 1226810, 1224118, 1222921) — WORKS, keep separate
- 1232696 Election of the UHJ (event), 1223794 infallibility / 1224858 Head / 1223074 Pillars (concepts) — keep separate

**Confidence: HIGH (0.96)** for org-name merge (1220624, 1226746, 1223295, 1228879, 1226732).

---

## FIREWALL

- **"the Guardian" → Shoghi Effendi ONLY.** In this corpus "the Guardian" / "Guardian of the Cause" is never generic and never ‘Abdu'l-Bahá. The office began 1921 with Shoghi Effendi and ended at his death 1957; there is exactly one Guardian.
- **Shoghi Effendi (614423) ≠ ‘Abdu'l-Bahá (614731) ≠ Bahá'u'lláh.** Predecessor/grandfather and great-grandfather respectively. Do not cross-link mentions.
- **Shoghi Effendi (person) ≠ the Universal House of Justice (org).** Two different keepers. The Guardianship (office) succeeded by the elected UHJ (1963); "the Guardianship" (1246161) as office/institution is distinct from the man.
- **GPB / Dawn-Breakers narrator voice:** Shoghi Effendi is the author/translator/compiler of *God Passes By* (doc 21310) and the translator + Introduction/footnote voice of *The Dawn-Breakers* (Nabíl's Narrative). Editorial/narrator "I" in those works = Shoghi Effendi the person → resolves to 614423.

---

## FLAGS — anaphora & traps requiring per-mention adjudication

1. **"the Guardian" anaphora (1223473, 107m):** safe to bulk-resolve to Shoghi in this corpus, but spot-check any mention inside quoted scripture where "guardian" could be a common noun (lowercase, generic guardianship of children, etc.). The named-institution mentions are safe.
2. **"Second Guardian of the Cause" (1223264) — DO NOT MERGE into Shoghi.** Sampled context is Charles Mason Remey (appointed President of the International Bahá'í Council 1951, later a Covenant-breaker who falsely claimed to be the second Guardian). There was no second Guardian. Keep separate / flag as Remey-claim, not Shoghi.
3. **"Supreme Body" / "Supreme Tribunal" cluster (621204, 624713, 639501, 1229603, 1228078, 656148, 1155053, …):** ambiguous. "Supreme Body / Supreme Institution" can be an epithet for the UHJ, BUT "Supreme Tribunal" is a DISTINCT concept (the international court envisioned by Bahá'u'lláh/'Abdu'l-Bahá), NOT the UHJ. Adjudicate per-mention; do NOT blanket-merge the Tribunal terms into UHJ.
4. **"Shoghi" bare given name (615724):** context-gate before merge (near-certain in this corpus, but verify no other Shoghi).
5. **Mention counts are STALE** (per task): used only for relative ranking of keeper, not as ground truth.
