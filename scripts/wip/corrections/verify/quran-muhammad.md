# Entity Verification: Qur'án (work) + Prophet Muḥammad (person)

Date: 2026-06-16. READ-ONLY corpus verification (no DB writes).
Counts from `entity_mentions` (NOT stale `mention_count`).

---

## VERDICT

### Qur'án — KEEPER = 1227551 (`Qur'án`, type=work) ✅
Confidence: **HIGH** for the title-variant merges; type and religion confirmed.

Merge INTO 1227551 (all are work-fragments of the same Islamic scripture):
| id | name | type | live mentions | note |
|----|------|------|---------------|------|
| **1227551** | Qur'án | work | 355 | KEEPER |
| 1219446 | Qur'an | work | 61 | ASCII apostrophe variant |
| 1219370 | the Qur'án | work | 18 | article variant |
| 1235665 | Qur'ánic | work | 36 | adjectival form, same referent |
| 1228033 | the Disconnected Letters of the Qur'án | work | 2 | the muqaṭṭa'át — part of the Qur'án |
| 1237052 | Koran | work | 0 | orphan (no live mentions), title variant |
| 1237063 | the law of the Koran | work | — | title variant |

DESCRIBE: *The Qur'án — the holy scripture of Islám, revealed through the Prophet Muḥammad. Religion: Islam. Type: work.*

Existing keeper aliases already cover: "the Qur'án", "Koran"(as alias), "The Holy Qur'án", "holy Qur'án", "the Book", "This Book of God", "Qur'ánic", "Qur'ánic verses/letters/story". Keep these.

### Prophet Muḥammad — KEEPER = 614456 (`Muḥammad`, type=person) ✅
Confidence: **HIGH** that 614456's core referent is the Prophet of Islam (majority of 338 mentions: "Muḥammad the prophet of Arabia", "the days of Muḥammad", Christ/Muḥammad/Bahá'u'lláh Manifestation series, "Proofs of the Prophethood of Muḥammad").

Merge INTO 614456 (clean):
| id | name | type | mentions | note |
|----|------|------|----------|------|
| **614456** | Muḥammad | person | 338 | KEEPER |
| 1239837 | Messenger of God | concept→person | 6 | context = "in the days of Muḥammad the Messenger…" — retype to person, merge |
| 1220013 | traditions attributed to the Apostle of God | work | 1 | a *work*, NOT the person — see FLAGS; do NOT merge into person |

Keeper aliases to KEEP: "Muḥammad, the Apostle of God", "the Apostle of God", "Muḥammad the Messenger of God", "the Prophet of Islam".

---

## ⚠️ 1220747 "the Prophet" — DOES **NOT** MERGE INTO 614456 ⚠️
Confidence: **HIGH** — this entity is a POLLUTED multi-referent bucket and must NOT be absorbed wholesale.

130 mentions span at least THREE distinct referents:
- **Bahá'u'lláh** — alias list literally contains "Bahá'u'lláh", "His Holiness Bahá'u'lláh"; mentions: "the prophet for the Age", "the Logos/Bahá'u'lláh brings a new teaching", "the Prophet returns at intervals of ~1000 years", "the canonical books of the Prophet Bahá'u'lláh".
- **Deganawida / Dagonnorida** — "the prophet that appeared here in North America" (Great Law of Peace, Six Nations). NOT Islamic.
- **Generic "the Prophet" = Manifestation of God** — manifestation-theology passages (Revelation of Bahá'u'lláh vols, Ocean of His Word) where "the Prophet" = the archetypal Manifestation, not specifically Muḥammad.
- **The Prophet of Islam (Muḥammad)** — a subset only: "vicar of the Prophet of Islám" (Sulṭán), "the Prophet's death / 'Alí's succession" (Origins of Shi'ism doc 6375), "successor to the Prophet" (Shí'ah succession passages).

RECOMMENDATION: Do NOT merge 1220747 into 614456. It needs **mention-level re-adjudication / splitting**, not a merge. Strip its cross-tradition aliases ("Bahá'u'lláh", "the prophet that appeared here in North America"). The Islamic-prophetic subset of its mentions should be re-pointed to 614456; the Bahá'u'lláh subset to the Bahá'u'lláh entity; Deganawida to its own entity. Flagged for follow-up, NOT auto-merged.

(The task asked "does 1220747 merge incl into Muḥammad?" — Answer: **NO, not as an entity merge.** Only a re-adjudicated *subset* of its mentions belongs to Muḥammad.)

---

## FIREWALL — other Muḥammads / Qur-prefix collisions (do NOT absorb)

Muḥammad is the corpus's most common given name. Keep these SEPARATE from 614456:
- **619573 Muḥammad Sháh** — Qájár monarch (d. 1848), not the Prophet.
- **Muḥammad-‘Alí the Covenant-breaker** ('Abdu'l-Bahá's half-brother).
- **Quddús = Mullá Muḥammad-‘Alíy-i-Bárfurúshí** (Letter of the Living).
- **The Báb = Siyyid ‘Alí-Muḥammad** — NER substring-matches "Muḥammad" inside His name (doc 21308 Dawn-Breakers, doc 8632 Gate of the Heart). Many 614456 mentions in those docs are noise from "‘Alí-Muḥammad"; the *entity* still = Prophet, but flag the Báb-name mentions.
- **"Muḥammad the Son of Ḥasan"** — this is the **Twelfth Imám / Hidden Imám (the Mahdí/Qá'im)**, NOT the Prophet. ⚠️ Currently sits as a 614456 ALIAS — should be REMOVED from 614456.
- **"Sháh-Muḥammad", "Ḥájí Muḥammad"** — generic/other persons currently mis-aliased onto 614456; should be removed.
- Mullá Muḥammad-X, Mírzá Muḥammad-X, Mírzá Muḥammad-Taqí, Mírzá Muḥíṭ, Muḥsin, Muḥammad-Riḍá, Prince Muḥammad-‘Alí Mírzá — all distinct persons appearing near 614456 mentions; firewall.

Qur-prefix firewall (NOT the Qur'án work):
- **1219341 Qurratu'l-'Ayn / 1227859 Qurratu'l-'Ayn / 1219795 Qurrat-i-'Ayní** — Ṭáhirih (person), NOT the Qur'án.
- **1064487 / 1219627 Mírzá Qurbán-‘Alí**, **1152738 Qurban** — persons.
- 1219978/1219979/1219323 "Qur'ánic Dispensation", 1219550/1219530 "Qur'anic law / People of the Qur'an" — concepts/events, NOT the work itself; leave as-is.
- 1233406 "Qur'an 43:3" — a citation; could optionally link to 1227551 but is a reference, not the work entity.

---

## FLAGS (need human/AI re-adjudication)
1. **1220747 "the Prophet"** — polluted multi-referent; split, do not merge. (Highest priority.)
2. **614456 contaminated aliases** — remove "Muḥammad the Son of Ḥasan" (=12th Imám), "Sháh-Muḥammad", "Ḥájí Muḥammad", and the bare "the Prophet" alias (it's the ambiguous bucket).
3. **1220013 "traditions attributed to the Apostle of God"** — type=work (a ḥadíth collection), NOT the person. Do not merge into 614456; keep as a work, optionally relate-to.
4. **Báb-name NER noise** — 614456 mentions inside docs 21308/8632 that are actually "‘Alí-Muḥammad" (the Báb) should be re-pointed at the Báb entity.
5. **1239837 "Messenger of God"** typed as `concept` — should be `person` if merged into 614456.
