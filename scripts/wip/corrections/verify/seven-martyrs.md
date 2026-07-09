# Seven Martyrs of Ṭihrán — Entity Verification

**Set:** Seven prominent Bábís arrested early 1850 in Ṭihrán (charged falsely with plotting to assassinate the Grand Vizír Mírzá Taqí Khán), who refused to recant and were beheaded publicly in the Sabzih-Maydán, February 1850. `side=Bábí`, `fate=martyred Ṭihrán 1850` for all seven.

**Canonical roster + ordering** (cross-confirmed from three sources):
- **Dawn-Breakers ch. 21** (doc 8645, numbered 1–7: `[21.40]`–`[21.48]`) — execution order, full biographies.
- **Balyuzi, *The Báb*** (doc 466, p.183–185, content 6716269–6716279) — names all seven, roles, sibling fact.
- **Roster doc 13433** — clean one-line role list (uncle/merchant, divine, darvish, mujtahid, merchant, merchant-of-Zanjan, government official).
- Web (Wikipedia / bahaihistoricalfacts / Momen) corroborates composition: 3 merchants, 2 clerics, 1 dervish, 1 government official.

**Note on graph state:** `graph_entities.mention_count` is STALE (verified — live `COUNT(entity_mentions)` differs). Most martyr entities have 0 live mentions; the set is heavily fragmented across an old religion='Baha'i' extraction batch and a newer un-tagged (religion=NULL) batch (id ranges 1219xxx / 1227xxx) whose canonical names match the martyrs precisely. No existing `entity_sets` row for "Seven Martyrs". Read-only run — no consolidation writes performed; keepers/merges below are RECOMMENDATIONS.

---

## 1. Ḥájí Mírzá Siyyid ‘Alí (the Báb's maternal uncle, *Khál-i-A‘ẓam*)
- **VERDICT: keeper ← 1219383** (`Ḥájí Mírzá Siyyid 'Alí`, person, religion=NULL). Merge candidates: any "Khál-i-A‘ẓam" / "maternal uncle of the Báb" nodes.
- **Confidence: HIGH** (named #1/first martyr in Nabíl & Balyuzi; doc 5584030, 5588390, 6716272, 6955817).
- **FIREWALL:** ⚠ Also owned by the **bab-family agent** — DEFER final keeper/merge to that agent; do not consolidate here. Distinct from Siyyid Káẓim-i-Zanjání (Ṭabarsí martyr) who was arrested in the same house raid.
- Role: maternal uncle who reared the orphaned Báb; first in Shíráz after the Letters of the Living to believe; a merchant.

## 2. Mírzá Qurbán-‘Alí (the renowned darvísh)
- **VERDICT: keeper ← 1064487, merge ← 1219627, 1238443, 1240398, 1152738, 639651, 1069127, 1174631**
- **Confidence: HIGH.** 1064487 is explicitly tagged "one of the Seven M[artyrs of Ṭihrán]" in content 6003551 (doc 430). 1219627 carries the rich dervish narrative (met the Báb at Khánlíq; "famous amongst mystics and dervishes…known to the nobles", content 21656379/21656382, Balyuzi-Mu‘ínu's-Salṭanih material). Same person.
- **FIREWALL:** "Qurbán" alone (1152738) and place "Maraghih" are weak/ambiguous; fold the person nodes only. Balyuzi gives "of Barfurúsh"; do not confuse with Mázindarán/Barfurúsh place entities.
- Role: celebrated darvísh with many disciples in Ṭihrán; told Amír Kabír his name ("sacrifice to ‘Alí") destined him for martyrdom.

## 3. Ḥájí Mullá Ismá‘íl-i-Qumí (a learned divine)
- **VERDICT: keeper ← 1227615** (`Ḥájí Mullá Ismá'íl-i-Qumí`, person, religion=NULL — clean exact-match node).
- **Confidence: HIGH** for identity; **0 live mentions** on the node, but corpus text is rich: Dawn-Breakers `[21.41]` #3 (content 11684374 — "a native of Faráhán…departed for Karbilá"), Balyuzi list (doc 466), roster doc 13433. Extraction just hasn't linked mentions to this node.
- **FIREWALL:** ⚠ Not the same as any other Mullá Ismá‘íl (e.g. Ismá‘íl-i-Dhabíḥ / the Zarándí-circle Siyyid Ismá‘íl who sent Nabíl, doc 491 content 7070432). Disambiguate by nisba "Qumí" + Faráhán origin.
- Role: cleric (a learned divine); 3rd to be executed.

## 4. Siyyid Ḥusayn-i-Turshízí (the mujtahid)
- **VERDICT: keeper ← 901814 (`Turshízí`) or 1005445 (`Husayn Turshizi`); merge the Turshízí *person* nodes** (616072, 618085, 1005445, 901814). RECOMMEND creating a clean canonical "Áqá Siyyid Ḥusayn-i-Turshízí".
- **Confidence: MEDIUM-HIGH** on the set membership (Dawn-Breakers `[21.43]` #4, content 11684378/11684380 — "the mujtahid…native of Turshíz, a village in Khurásán"; also a Ṭabarsí-bound companion, doc 462 content 5583973). MEDIUM on which fragment to elect keeper (Turshízí person nodes are scattered, all 0 live mentions).
- **FIREWALL:** ⚠⚠ **CRITICAL — Turshízí (martyr/mujtahid) ≠ Siyyid Ḥusayn-i-Yazdí, the Báb's amanuensis (firewall id 1219427).** Confirmed: 1219427 ("Siyyid Ḥusayn", religion=NULL) is anchored to Máh-Kú/Chihriq amanuensis context (doc 21308/21310), NOT to the 1850 Ṭihrán execution. Keep separate. Also exclude place-nodes (615791, 901821, 1183602) and unrelated "Azim Turshizi" (646627, = ‘Aẓím, the Shah-attempt conspirator) and "Mullá Shaykh ‘Alíy-i-Turshízí" (1220003).
- Role: a mujtahid of Turshíz (Khurásán), renowned for piety; 4th executed.

## 5. Ḥájí Muḥammad-Taqíy-i-Kirmání (a merchant)
- **VERDICT: keeper ← 1005444** (`Haji Muhammad-Taqi Kirmani`, person). Merge any "Muḥammad-Taqí Kirmání" variants.
- **Confidence: HIGH** for identity (Dawn-Breakers `[21.45]` #5, content 11684382; Balyuzi doc 466; roster doc 13433; web confirms "fifth of the seven"). 0 live mentions on node.
- **FIREWALL:** ⚠ Not Ḥájí Muḥammad-Taqíy-i-Nayrízí, nor the Grand Vizír Mírzá Taqí Khán (Amír-Niẓám) who *ordered* the executions. Disambiguate by nisba "Kirmání" + merchant role.
- Role: merchant of note; 5th executed.

## 6. Siyyid Murtaḍá (merchant of Zanján)
- **VERDICT: keeper ← 1064437 (`Siyyid Murtaḍá`) or 619820 (`Siyyid Murtada`); merge ← 1005448 (`Murtada Zanjani`)**
- **Confidence: MEDIUM-HIGH.** Strong corroborating fact: brother of Siyyid Káẓim-i-Zanjání (the Ṭabarsí martyr) — stated in Balyuzi (content 6716278) AND Dawn-Breakers `[20.219]` (content 11684307) AND `[21.46]` #6 (content 11684383, "one of the noted merchants of Zanján"). MEDIUM on keeper election because "Murtaḍá/Murtada" is an extremely common name with ~20 fragment nodes.
- **FIREWALL:** ⚠⚠ **CRITICAL — exclude Shaykh Murtaḍáy-i-Anṣárí (1220214 / 619628 / 619800 / 658298) — the famous Najaf jurist, a different person entirely.** Also exclude Mullá Murtaḍá-Qulí (1219662), Áqá Murtidá (1062006), and bare/place "Murtada" nodes. Only fold the *Zanjání-merchant / brother-of-Siyyid-Káẓim* sense.
- Role: merchant of Zanján; brother of Siyyid Káẓim-i-Zanjání; 6th executed.

## 7. Muḥammad-Ḥusayn-i-Marághi’í (a government official)
- **VERDICT: keeper ← 1227616** (`Muhammad-Husayn-i-Maraghi'i`, person, religion=NULL — clean exact-match node).
- **Confidence: HIGH** for identity (Dawn-Breakers `[21.47]` #7, content 11684384 — rushed forward to be martyred first; doc 491 content 7070446/7070447 "Muḥammad-Ḥusayn…the seventh…beheaded at the same moment with the fifth and sixth"; Balyuzi doc 466 "tortured to betray his companions"; roster doc 13433 "a government official"). 0 live mentions on node.
- **FIREWALL:** ⚠ Not Mírzá ‘Alíy-i-Marághi’í ("Sayyáh", id 1239068) — a later (Istanbul-era) figure. Not the place "Maraghih/Marághih" (614496/628618). Disambiguate by given name Muḥammad-Ḥusayn + the 1850 execution narrative.
- Role: government official; 7th/last executed (with #5 and #6 simultaneously).

---

## Set entity recommendation
**YES — model "Seven Martyrs of Ṭihrán" as a SET/EVENT entity.** It is a named, bounded, historically-fixed group (`entity_sets.set_type='martyr-group'` or an EVENT node "Martyrdom of the Seven Martyrs of Ṭihrán, Feb 1850, Sabzih-Maydán"). The phrase "Seven Martyrs of Ṭihrán" recurs as a fixed designation across the corpus (docs 426, 429, 430, 462, 466, 491, 8645, 13433). Link the seven person-keepers as `set_members`. No such set row currently exists. This also gives the obscure 0-mention members (Ismá‘íl-i-Qumí, Turshízí, Kirmání, Marághi’í) a durable anchor independent of fragile per-name mention linkage.

## Caveats / NEEDS-SOURCE flags
- None are fully NEEDS-SOURCE — all seven are extractable and corpus-confirmed by name. However **identity is solid for all 7; keeper-node election is only MEDIUM for #4 (Turshízí) and #6 (Murtaḍá)** due to name fragmentation + common-name collisions. RECOMMEND minting fresh clean canonical nodes for #4 and #6 rather than electing a messy fragment.
- All seven nodes (except the two fragments with stray mentions) have **0 live entity_mentions** — the v2 extraction has not linked them. The `extract-v2` re-run on the canonical books (pending Task #9) should populate these; re-verify mention linkage afterward.
- #1 (the uncle) is co-owned by the bab-family agent — do NOT consolidate here.
