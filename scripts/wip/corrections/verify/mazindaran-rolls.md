# Mázindarán Martyr Rolls — Cross-Corpus Entity Verification

Source: Dawn-Breakers, Ṭabarsí episode, doc 21308. These three name-lists were previously dropped on import and are now imported (paras 1207–1243). Verified READ-ONLY against `graph_entities` (sifter.db) + `entity_mentions` (graph.db) + Momen (doc 11559).

## Staleness confirmation
- Only **3 entity_mentions** exist across all 37 roll paragraphs (1207–1243), and all 3 are on the Mázindarán *header* para_1210 — generic terms: `Mázindarán` (place 1219771), `martyrs` (1220742), `the Faith of God` (1223203). **Zero** individual martyrs are linked. Extractor v2 has not run on the freshly-imported lists.
- A name-harvest batch (entity ids in the 12384xx range, same batch that seeded the Ṭabarsí defenders) pre-created a handful of descriptionless *shell* entities matching some surface strings. These have **0 mentions** and **no description** — they need linking + enrichment, not re-creation. Most roll names have no shell at all.
- Momen (doc 11559) has **no hits** for any distinctive roll term (Bahnimír, Savád-Kúh, Shah-Mírzád, Zirih-Kinár). These martyrs are not in the Momen corpus and are almost certainly not online. Accept partial disambiguation; corpus-only.

---

## ROLL 1 — Shah-Mírzád defenders (2). Header: para_1207
"From the village of S̱hah-Mírzád, two fell in defending the fort."

| # | Name | para_ | Entity status |
|---|------|-------|---------------|
| 1 | Mullá Abú-Raḥím | para_1208 | CREATE — no entity |
| 2 | Karbilá'í Káẓim | para_1209 | CREATE — no dedicated entity. ("Káẓim" matches many unrelated entities incl. Siyyid Káẓim-i-Rashtí; none is this Shah-Mírzád martyr.) |

Recommend SET: `Shah-Mírzád Fort Defenders (Ṭabarsí)` — 2 members, both CREATE.

---

## ROLL 2 — Mázindarán martyrs (27). Header: para_1210
"As to the adherents of the Faith in Mázindarán, twenty-seven martyrs have thus far been recorded."

| # | Name | para_ | Entity status |
|---|------|-------|---------------|
| 1 | Mullá Riḍáy-i-S̱háh | para_1211 | LINK shell 1238401 (0 mentions, no desc) → enrich |
| 2 | ‘Aẓím | para_1212 | CREATE (shell 1238527 "S̱hayḵh ‘Aẓím" is a different titled person — do NOT merge) |
| 3 | Karbilá'í Muḥammad-Ja‘far | para_1213 | LINK shell 1238423 "Muḥammad-Ja‘far" (0 mentions) → enrich; or CREATE if keeping Karbilá'í prefix distinct |
| 4 | Siyyid Ḥusayn | para_1214 | CREATE — bare name, no specific entity |
| 5 | Muḥammad-Báqir | para_1215 | CREATE |
| 6 | Siyyid Razzáq | para_1216 | CREATE (Abd al-Razzáq entities are unrelated) |
| 7 | Ustád Ibráhím | para_1217 | CREATE |
| 8 | Mullá Sa‘íd-i-Zirih-Kinárí | para_1218 | CREATE — distinctive nisba, no entity |
| 9 | Riḍáy-i-‘Arab | para_1219 | CREATE |
| 10 | Rasúl-i-Bahnimírí | para_1220 | LINK shell 1238348 (0 mentions, no desc) → enrich. **Notable**: Nabíl names him + his brother explicitly (kinship), and the Bahnimírí family is repeatedly flagged in Ṭabarsí narrative |
| 11 | Muḥammad-Ḥusayn (brother of Rasúl-i-Bahnimírí) | para_1221 | CREATE — kinship: brother of #10 |
| 12 | Ṭáhir | para_1222 | CREATE |
| 13 | S̱hafí‘ | para_1223 | CREATE |
| 14 | Qásim | para_1224 | CREATE |
| 15 | Mullá Muḥammad-Ján | para_1225 | CREATE |
| 16 | Masíḥ (brother of Mullá Muḥammad-Ján) | para_1226 | CREATE — kinship: brother of #15. (shell 1238306 "Mírzá Masíḥ-i-Núrí" is a different person — do NOT merge) |
| 17 | Iṭá-Bábá | para_1227 | CREATE |
| 18 | Yúsuf | para_1228 | CREATE |
| 19 | Faḍlu'lláh | para_1229 | CREATE (shell 1238495 "Mírzá Faḍlu'lláh" is titled/different — do NOT merge) |
| 20 | Bábá | para_1230 | CREATE |
| 21 | Ṣafí-Qulí | para_1231 | CREATE |
| 22 | Niẓám | para_1232 | CREATE |
| 23 | Rúḥu'lláh | para_1233 | CREATE (existing "Rúḥu'lláh" 1240657 w/ 4 mentions is a different figure — bare-name collision, do NOT merge) |
| 24 | ‘Alí-Qulí | para_1234 | CREATE |
| 25 | Sulṭán | para_1235 | CREATE |
| 26 | Ja‘far | para_1236 | CREATE |
| 27 | Ḵhalíl | para_1237 | CREATE |

Recommend SET: `Mázindarán Martyrs (Ṭabarsí, 27)` — 27 members. 3 LINK-to-shell, 24 CREATE. Two kinship pairs (#10/#11 Bahnimírí brothers; #15/#16 Muḥammad-Ján & Masíḥ brothers).

---

## ROLL 3 — Savád-Kúh believers (5). Header: para_1238
"Of the believers of Savád-Kúh, the five following names have thus far been ascertained."

| # | Name | para_ | Entity status |
|---|------|-------|---------------|
| 1 | Karbilá'í Qambar-Kális̱h | para_1239 | CREATE — distinctive, no entity (existing "Qambar-‘Alí" 1238208 is a different person) |
| 2 | Mullá Nád-‘Alíy-i-Mutavallí | para_1240 | CREATE — distinctive. NOTE: existing "Ḥájí Nád-‘Alí" (1238437) and the "Mutavallí" entities (Mírzá Ḥusayn-i-Mutavallíy-i-Qumí 1238660 / Siyyid Mírzá Ḥusayn-i-Mutavallí 1238371) are DIFFERENT people — do NOT merge |
| 3 | ‘Abdu'l-Ḥaqq | para_1241 | CREATE |
| 4 | Íṭábakí-C̱húpán | para_1242 | CREATE — distinctive (Íṭábakí the shepherd) |
| 5 | Son of Íṭábakí-C̱húpán | para_1243 | CREATE — unnamed; kinship: son of #4. Treat as an entity-by-relation (anonymous martyr) |

Recommend SET: `Savád-Kúh Believers (Ṭabarsí, 5)` — 5 members, all CREATE. One kinship pair (#4/#5 father/son).

---

## Cross-text-significant figures
- **Rasúl-i-Bahnimírí** (#10, Roll 2): the only roll name with narrative weight — Nabíl names him with his brother and the Bahnimírí family recurs in the Ṭabarsí account. Worth enriching beyond a stub.
- All other names are bare given-names / obscure villagers; no cross-text significance, none in Momen, none expected online.

## Caveats
- **Bare-name collisions are the main hazard.** Many roll names (Káẓim, Rúḥu'lláh, ‘Aẓím, Faḍlu'lláh, Masíḥ, Ja‘far, Qásim) collide with well-known unrelated entities. Every "LINK" above is to a descriptionless 12384xx shell only; every common bare name must be CREATE-as-new, NOT merged into a famous namesake.
- `graph_entities` lives in **sifter.db**, not graph.db; `entity_mentions`/`entity_aliases` live in **graph.db**. (Query recipe's `graph_entities` join works only with both attached.)
