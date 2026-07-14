# ‘Abdu'l-Vahháb (entity_id 1227760)

VERDICT: SPLIT(2-way primary, with 2 stray-mention reassignments + FIREWALL of name-coincidences) — confidence H — NEEDS-VERIFY? N (primary split is corpus-internal & unambiguous)

## Summary of the problem
Entity 1227760 is a badly over-merged shell. Its `graph_entities` row shows `mention_count=1`, yet `entity_mentions` actually points it at 8 content rows (all in The Dawn-Breakers, doc 21308 / its twin doc 8645), and `entity_aliases` has bolted on five mutually-incompatible surfaces belonging to **at least four different real people across three centuries**:
- `‘Abdu’l-Vahháb` (bare)
- `Mírzá ‘Abdu’l-Vahháb` / `Mírzá ‘Abdu’l-Vahháb-i-S̱hírází` → the 1852 Shírází martyr
- `Mírzá ‘Abdu’l-Vahháb-i-Turs̱hízí` → a Khurásání nisba (no supporting mention found on this entity; spurious)
- `‘ABDU’L-VAHHAB KÁẒIMI-MANSHÁDÍ` → a **20th-century** Iranian Bahá'í executed under the Islamic Republic (modern martyr list, doc 8746/era-2; pure name-coincidence)

The bare-name mentions in The Dawn-Breakers resolve to two distinct Bábí-era men, plus two stray/footnote-anchor mentions that belong to other (already-firewalled) entities.

## Clusters (SPLIT)

### Cluster A — ‘Abdu'l-Vahháb-i-Shírází (the 1852 martyr)  [KEEPER for 1227760]
- keeper id: **1227760** (retain; this is the dominant, best-documented referent — keep the canonical here)
- canonical name: **Mírzá ‘Abdu'l-Vahháb-i-Shírází**
- nisba/lineage: of Shíráz; **son of Ḥájí ‘Abdu'l-Majíd**, who owned a shop in Karbilá; youth/shopkeeper
- role-arc: As a youth in Shíráz pursued Mullá ‘Alíy-i-Basṭámí begging to follow him (his father ‘Abdu'l-Majíd dragged him back and beat Mullá ‘Alí); later moved Shíráz→Baghdád→Káẓimayn where he established a business; on Bahá'u'lláh's 1267 A.H. visit to ‘Iráq he attached himself to Him; followed Him to Ṭihrán, arrested, imprisoned in the Síyáh-Chál chained to Bahá'u'lláh.
- dates: martyred **Ṭihrán, 1852** (among the bloodbath following the attempt on Náṣiri'd-Dín Sháh)
- side: **Bábí** (Báb's dispensation; a devoted disciple of the Báb who recognized Bahá'u'lláh)
- fate: **martyrdom** — the famous farewell narrative: woke Bahá'u'lláh before dawn to recount his dream of soaring; called out by the gaoler, threw off his chains, embraced his fellow-prisoners and Bahá'u'lláh; had no shoes, so Bahá'u'lláh gave him His own; executioner later praised his spirit.
- content_ids (entity_mentions to retain on 1227760): **21054872 (para_1803), 21054930 (para_1878), 21054931 (para_1879)**
- DISCRIMINATOR: explicit nisba "i-S̱hírází" + named father "Ḥájí ‘Abdu'l-Majíd" + Karbilá shop + Káẓimayn business + Ṭihrán 1852 martyrdom. No linking clause ties him to the Núr companion.

### Cluster B — ‘Abdu'l-Vahháb of Núr (the Mázindarán martyr)  [NEW entity]
- keeper id: **NEW** (or MERGE into an existing Núr-Vahháb shell if one is found; none located among siblings)
- canonical name: **‘Abdu'l-Vahháb-i-Núrí**
- nisba/lineage: **resident of Núr** (Bahá'u'lláh's home district in Mázindarán)
- role-arc: "one of Our companions" — Bahá'u'lláh intended to send him **ahead to the besieged fort of Shaykh Ṭabarsí** to announce His approach (the plan was foiled when Bahá'u'lláh was intercepted near Ámul). Listed among "two of the Báb's devoted disciples, Muḥammad-Taqí Khán and ‘Abdu'l-Vahháb, both residents of Núr."
- dates: martyred **1852**, in the Mázindarán violence that followed the Ṭihrán turmoil
- side: **Bábí**
- fate: **martyrdom in Mázindarán** (distinct event & geography from the Ṭihrán execution of Cluster A)
- content_ids (reassign FROM 1227760 TO this new entity): **21054853 (para_1779), 21054941 (para_1891)**
- DISCRIMINATOR: nisba/locus "of Núr" + martyred in Mázindarán + paired with Muḥammad-Taqí Khán. Geography (Núr/Mázindarán) and fate differ from Cluster A (Shíráz/Káẓimayn → Ṭihrán); **no linking clause** in the text equates the two. Two independent passages (Ṭabarsí-companion narrative + the Mázindarán martyr-list) establish him as a separate man.

## Stray / mis-attributed mentions to REMOVE from 1227760
- **21054286 (para_801)** — Ṭáhirih's removal from Qazvín. The only Vahháb here is the **Qazvíní mujtahid family** (Ḥájí Mullá ‘Abdu'l-Vahháb-i-Qazvíní, father of Letter of the Living Mírzá Muḥammad-‘Alí). Reassign to entity **1227868 (Mullá ‘Abdu'l-Vahháb-i-Qazvíní)**, already firewalled. → REMOVE from 1227760.
- **21054334 (para_878)** — the Báb's transfer to Tabríz; **no ‘Abdu'l-Vahháb in the text** (footnote-anchor/extraction artifact). → REMOVE from 1227760 (orphan).

## FIREWALL (separate real people — do NOT merge onto 1227760; scrub stray aliases)
- **1227756 Ḥájí ‘Abdu'l-Vahháb (of Yazd)** — Shaykhí of Yazd, pious, visited Shaykh Aḥmad; **died a natural death** before the Báb's declaration; confided his secret to Ḥájí Ḥasan-i-Náyíní. Distinct (no martyrdom; pre-1844 death). [DB 1.5]
- **1227868 Mullá ‘Abdu'l-Vahháb-i-Qazvíní** — distinguished **mujtahid of Qazvín**, father of LotL Mírzá Muḥammad-‘Alí; also "Ṭáhirih's brother ‘Abdu'l-Vahháb-i-Qazvíní who inherited his father's learning" appears in this family orbit (possibly same person or the son — keep within Qazvíní family entity, NEEDS-SOURCE to split brother vs. father). [DB 15.29 fn, 20.205, fn 237]
- **1239314 Siyyid ‘Abdu'l-Vahháb-i-Sha‘rání** — **medieval** Sunní author of *Kitábu'l-Yaváqít wa'l-Javáhir*, cited in Abu'l-Faḍl's *Fará'id*. Centuries earlier; pure name-share. [DB fn 650]
- **Kázimí-Manshádí (alias on 1227760)** — 20th-century Bahá'í executed by the Islamic Republic (modern martyr roster). REMOVE this alias from 1227760; it is a name-coincidence three centuries removed.
- **`-i-Turs̱hízí` alias on 1227760** — Khurásání nisba with no supporting mention on this entity; spurious alias, REMOVE.
- Other graph namesakes already on separate ids (1196079, 1203510, 1211505, 1216150/1, 1238711, 1239298 "Hasan son of Abdu'l-Vahhab", 1166336 Haji ‘Abd al-Wahhab, 1123772 Muḥammad ibn ‘Abd al-Wahhab, 619794 Wahhabis, etc.) — leave firewalled; not part of this entity.

## DESCRIBE (for the keeper, Cluster A — Shírází martyr)
Mírzá ‘Abdu'l-Vahháb-i-Shírází (d. Ṭihrán, 1852) was the son of the Shíráz/Karbilá merchant Ḥájí ‘Abdu'l-Majíd; as a youth he had begged to follow the Letter of the Living Mullá ‘Alíy-i-Basṭámí, and later established a business at Káẓimayn where he embraced Bahá'u'lláh during the latter's 1267 A.H. (1851) sojourn in ‘Iráq. Imprisoned with Bahá'u'lláh in the Síyáh-Chál, he is remembered for the luminous farewell on the morning of his execution — recounting a dream of soaring flight, embracing his fellow prisoners, and going barefoot to martyrdom in the shoes Bahá'u'lláh gave him. He is distinct from the namesake ‘Abdu'l-Vahháb of Núr martyred in Mázindarán, from the Yazdí Shaykhí Ḥájí ‘Abdu'l-Vahháb who died before 1844, and from the Qazvíní mujtahid family of Ṭáhirih. [TAG: Bábí; martyr-1852; Síyáh-Chál; Káẓimayn]

## EVIDENCE (cid + external_para_id)
- Shírází martyr — father Ḥájí ‘Abdu'l-Majíd, Karbilá shop, martyrdom: **21054872 / para_1803** ("Mírzá ‘Abdu'l-Vahháb-i-S̱hírází, son of Ḥájí ‘Abdu'l-Majíd, who owned a shop in Karbilá").
- Shírází martyr — Síyáh-Chál dream, "had left Káẓimayn and followed Us to Ṭihrán": **21054930 / para_1878**.
- Shírází martyr — execution / shoes / executioner's praise: **21054931 / para_1879**.
- (corroborating, doc 8645 [3.43–45]) youth ‘Abdu'l-Vahháb pursuing Mullá ‘Alí, father ‘Abdu'l-Majíd, Shíráz→Baghdád→Káẓimayn business — same man.
- Núr companion — Ṭabarsí advance-messenger plan: **21054853 / para_1779** ("send ‘Abdu'l-Vahháb, one of Our companions, in advance… besieged [Ṭabarsí]").
- Núr martyr — Mázindarán: **21054941 / para_1891** ("Muḥammad-Taqí Khán and ‘Abdu'l-Vahháb, both residents of Núr, suffered martyrdom").
- Qazvíní mujtahid family (reassign para_801): doc 8645 [20.205] "Ḥájí Mullá ‘Abdu'l-Vahháb… most distinguished mujtahids in Qazvín"; [15.29 fn].
- Yazdí Shaykhí (firewall): doc 8645 [1.5] "Ḥájí ’Abdu’l-Vahháb, a man of great piety… When ’Abdu’l-Vahháb died…".
- Sha‘rání medieval author (firewall): doc 8645 fn 650.
- Web corroboration: Shírází youth/Mullá ‘Alí episode and the 1852 Ṭihrán bloodbath martyrdom; separate ‘Abdu'l-Vahháb associated with Núr/Mázindarán/Tabarsí context (bahaipedia/utteranceproject/bahaullah.org search hits).

## FLAGS
- DATA-QUALITY: `graph_entities.mention_count=1` for 1227760 is wrong — it actually owns 8 entity_mentions rows (count desync; same class as the orphan-mention miscount task #1).
- DATA-QUALITY: 1227760 carries spurious aliases (`-i-Turs̱hízí`, `KÁẒIMI-MANSHÁDÍ` 20th-c) with no matching mention → scrub on cleanup.
- ORPHAN: cid 21054334 (para_878) has no Vahháb in text — extraction/footnote-anchor artifact; remove.
- NEEDS-SOURCE: within the Qazvíní family, whether "Ṭáhirih's brother ‘Abdu'l-Vahháb-i-Qazvíní" is the mujtahid father, his son, or a third family member is not resolvable from corpus alone — keep under 1227868 pending Mázandarání/Samandar manuscript check.
- Cluster B (Núr) has no pre-existing dedicated entity among the scanned siblings → create NEW (or confirm none of 1196079/1203510/1211505 already represents him before creating).
