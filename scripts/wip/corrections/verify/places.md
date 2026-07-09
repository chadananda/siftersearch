# PLACES — Core Bahá'í Who's-Who Verification (GPB/DB high-mention toponyms)

READ-ONLY verification. Mention counts from g.entity_mentions (column `mention_count` on graph_entities is STALE — counts below are live JOIN counts). All keepers confirmed `entity_type=place`. Merges = same-referent spelling/diacritic variants of the place ONLY. FIREWALL strictly separates the city/region (place) from `-i-…í` nisba persons, upheaval/period events, and named buildings/orgs.

---

## Shíráz — keeper 1056154 (place) — 318
- Merge: none (no spelling-variant duplicate found; "Shiraz" appears only in person fragments).
- type=place — confidence HIGH.
- FIREWALL (place vs person): KEEP SEPARATE — Mírzá Báqir-i-Shírází (950443), Mírzá Hádí Shírází (1066771), Ḥájí Abu'l-Qásim-i-Shírází (1220397), Ḥájí Abu'l-Ḥasan-i-Shírází (1227578), Mírzá Ḥusayn-i-Shírázíy-i-Khurṭúmí (1221737) = nisba persons. "Prophet of Shíráz"/"Martyr-Prophet of Shíráz" (1219356, 1221222, 1219683, 1219362) = epithets for the Báb (PERSON), NOT the city. "House of the Báb in Shíráz" (1227825) = building (place but distinct entity, not merged).

## Baghdád — keeper 619164 (place) — 141
- Merge ← 1220236 "Baghdád" (25, dup), 1220037 "Old Baghdád" (1, variant of the city).
- type=place — confidence HIGH.
- FIREWALL: KEEP SEPARATE — Ḥájí Níyáz-i-Baghdádí (1219355) nisba person; "Bahá'u'lláh's sojourn in Baghdád" (1220325) event; "Baghdad Court of Appeals"/"Council of Ministers"/"civil court"/"Shí'ah Ja'faríyyih Court" orgs; "Bahá'u'lláh's house in Baghdád"/"Holy House"/"Pilgrim House"/"pachalik" distinct buildings/admin units (not merged). "His House in Baghdád" (1222016 work-tagged) leave as-is.

## Ṭihrán — keeper 1219288 (place) — 609
- Merge ← 1239079 "Tehran" (5), 614915 "Tehran" (3), 615103 "Teheran" (3) = anglicized spelling variants of the city.
- type=place — confidence HIGH.
- FIREWALL: KEEP SEPARATE — Ḥájí 'Abdu'l-Karím-i-Ṭihrání (1221062) nisba person; "Ṭihránís" (1219747) demonym/people; "Seven Martyrs of Ṭihrán" (1219624 person / 1219629 event); "massacre of Ṭihrán" (1219754) event; "foulest dungeon of Ṭihrán"/"palaces of Ṭihrán" distinct sub-places (not merged); "the Liar of Ṭihrán" (1220860) epithet/work; "Imám-Jum‘ih of Ṭihrán" title-person.

## ‘Akká — keeper 1219290 '‘Akká' style; STRONGEST count is 1219291 "Akká" (228)
- Recommended keeper: **1219291 "Akká"** (228, highest) ← merge 1234210 "‘Akká" (165), 1219290 "'Akká" (92, the task-listed id), 615458 "Akka" (10), 612782 "Acre" (4), 1231874 "Akka" (2). (Alt: keep the diacritically-correct 1234210 "‘Akká" as keeper and absorb the rest — diacritic-correct preferred for canonical_name; pick one and merge all five variants in.)
- type=place — confidence HIGH on the merge set; MEDIUM only on which id to crown (highest-count vs diacritic-correct).
- FIREWALL: KEEP SEPARATE — "Green Acre" (622358) = the Maine, USA Bahá'í school, NOT ‘Akká (false friend on "Acre"); "the Sacred Threshold"/"Sacred Shrines"/"Sacred Precincts" = shrine sub-places; "prison of ‘Akká"/"penal colony of 'Akká" distinct sub-places (not merged into city); "Mufti of 'Akka" (1220486) person; "Prisoner of 'Akká" (1220457) epithet/work for Bahá'u'lláh; "Period of Bahá'u'lláh's banishment to 'Akká" event.
- FLAG: "Sacred Text/Sacred Writings/Sacred…" entities surfaced only by LIKE noise — irrelevant, ignore.

## Adrianople — keeper 614734 (place) — 210
- Merge ← 1233818 "Adrianople" (64, dup), 649227 "Edirne" (22, Turkish name of same city).
- type=place — confidence HIGH.
- FIREWALL: KEEP SEPARATE — "Governor of Adrianople" (1220915) title; "Adrianople period" (1220387) / "Banishment to Adrianople" (1220603) / "Exile in Adrianople" (1220880) = events.

## Constantinople — keeper 615326 (place) — 54; STRONGEST is 1220219 (147)
- Recommended keeper: **1220219 "Constantinople"** (147, highest) ← merge 615326 "Constantinople" (54, task-listed), 614820 "Istanbul" (35, modern name), 1060891 "the City of Constantinople" (1). (Or crown 615326 per task list and absorb 1220219 — either works; pick highest-count.)
- type=place — confidence HIGH.
- FIREWALL: KEEP SEPARATE — "Port of Constantinople" (1220280) sub-place; "Spiritual Assembly of the Bahá'ís of Istanbul" (1224115) org.

## Tabríz — keeper 619130 (place) — 120
- Merge ← 1238532 "Tabríz" (12, dup).
- type=place — confidence HIGH.
- FIREWALL: KEEP SEPARATE — Ṣádiq-i-Tabrízí (1219731), Mullá Muḥammad-i-Tabrízí (1060885), Mullá Báqir-i-Tabrízí (620166), Ḥájí Ja'far-i-Tabrízí (1220412), Jalíl-i-Tabrízí (1220986), Ḥájí Muḥammad-i-Tabrízí (1221495) = nisba persons; "barrack-square of Tabríz" (1219390) = the Báb's-martyrdom sub-place (distinct, not merged).

## Mt. Carmel — keeper 622809 (place) — 40; STRONGEST is 615622 "Mount Carmel" (47)
- Recommended keeper: **615622 "Mount Carmel"** (47, highest, full proper form) ← merge 1219681 "Mount Carmel" (44), 622809 "Mt. Carmel" (40, task-listed), 618891 "Carmel" (18), 1232735 "Carmel" (10), 620662 "Mt Carmel" (1). canonical_name = "Mount Carmel".
- type=place — confidence HIGH on merge set; MEDIUM on keeper-id choice.
- FIREWALL: KEEP SEPARATE — "Tablet of Carmel" (1220496) = work; "Viscount Samuel of Carmel" (1221615) = person (Herbert Samuel); "the Arc on Mount Carmel"/"Archives on Mount Carmel"/"exalted shrine on mt. carmel" = distinct edifices on the mountain (sub-places, not merged into the mountain itself).

## Persia — keeper 614707 (place) — 319
- Merge ← 1232380 "Persia" (178, dup), 614736 "Iran" (161), 1221696 "Iran" (45), 1232591 "Írán" (31). (Iran/Írán = modern name of the same country; consolidate to Persia keeper, or set canonical_name "Iran (Persia)".)
- type=place — confidence HIGH (toponym merge); MEDIUM editorial note: corpus uses "Persia" historically; Iran/Írán are the same polity — safe to merge as country.
- FIREWALL: KEEP SEPARATE — "Persian Bayán" (1219348) & "Persian Hidden Words" (1241973) = WORKS; "Persian"/"Persians"/"Persian language"/"People of Persia"/"Old Persian" = adjective/demonym/language CONCEPTS; "Shah of Persia" title; all "…of Persia/Bahá'ís of Persia/NSA…" = ORGS; "Persian Gulf" (615808) = distinct geographic feature; "Persia and the Persian Question" (1227698) = Curzon's BOOK.

## Mázindarán — keeper 613799 (place) — 46; STRONGEST is 1219771 (86)
- Recommended keeper: **1219771 "Mázindarán"** (86, highest) ← merge 613799 "Mázindarán" (46), 1229946 "Fáḍil-i-Mázandarání" — NO, that's a person. Merge only the dup place id 613799.
- type=place — confidence HIGH.
- FIREWALL: KEEP SEPARATE — Fáḍil-i-Mázandarání / Fadil Mazandarani (1229946, 624253), Mírzá Muḥammad-i-Mázindarání (1055378), Ḥasan-i-Mázindarání (1239498), "Mazandarani" (621997) = nisba persons; "Mázindarán upheaval"/"Tragedy of Mázindarán"/"Bloody episodes…"/"Heroes of Mázindarán and Nayríz" = EVENTS (Shaykh Ṭabarsí); "Army of Mázindarán" org; "Mázindarán forest/mountains/Mountains of Mázindarán" = sub-geography (distinct, not merged).

## Khurásán — keeper 619165 (place) — 89
- Merge: none (no spelling-variant duplicate of the region found).
- type=place — confidence HIGH.
- FIREWALL: KEEP SEPARATE — Mullá Ṣádiq-i-Khurásání (1219371, 44 — high count!), Ḥájí Mírzá Ḥasan-i-Khurásání (1221109), Ḥájí Mírzá Muḥammad-i-Khurásání (1227575), Abu'l-Qásim-i-Khurásání (1222165), Áqá Buzurg of Khurásán (1220521) = nisba persons; "voice of the heroes of Khurásán" (1220643) concept.

## Iṣfahán — keeper 614495 (place) — 132  [NOTE: id not in task list; this is the correct keeper]
- Merge ← 1237930 "Iṣfahán" (24, dup).
- type=place — confidence HIGH.
- FIREWALL: KEEP SEPARATE — Siyyid Muḥammad-i-Iṣfahání (1239979, the "Antichrist of the Bahá'í Revelation"), Ṣadru'd-Dawliy-i-Iṣfahání (1219617), Ḥájí Muḥammad-Riḍáy-i-Iṣfahání (1220554), Mirza Asadu'llah Isfahani (639160), 'Abdu'l-Khaliq-i-Isfahani (1219541), Ḥusayn-'Alíy-i-Iṣfahání (1221215), Muḥammad-i-Iṣfahání (1239371), "Siyyid of Iṣfahán" (1233423), "Imám-Jum'ih of Iṣfahán" (1220707) = nisba/title persons; "'ulamás of Iṣfahán" org; "House of Ḥusayn-'Alíy-i-Iṣfahání" (1221214) building.

---

## FLAGS / NOTES
- mention_count column is STALE everywhere; use live JOIN counts (done above).
- For Akká, Constantinople, Mt. Carmel, Mázindarán the task-listed id is NOT the highest-count fragment — recommend crowning the highest-count (or diacritic-correct) id and merging the listed id in. Decision is editorial; merge SET is unambiguous either way.
- Zanján fully firewalled: city would be a place, but "Zanjan upheaval" (1219622) = EVENT keeper (per task) and "-i-Zanjání" = persons. Not a place keeper in this batch.
- Sub-places (prison of 'Akká, barrack-square of Tabríz, dungeon of Ṭihrán, shrines/Arc on Carmel, Persian Gulf, Mázindarán forest/mountains) deliberately NOT merged into the parent city/region — they are distinct locations.
- WORKS not merged: Persian Bayán, Persian Hidden Words, Tablet of Carmel, Persia and the Persian Question.
- WebSearch not required: every referent is a well-attested toponym confirmable from corpus context.
