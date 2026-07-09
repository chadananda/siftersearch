# WORKS verification — Bahá'u'lláh's later tablets/works

Method: per-work keeper chosen by `entity_mentions` count (STALE — relative-rank only, not absolute). Title-variants merged into keeper. All entities confirmed `entity_type=work`. READ-ONLY; no DB writes performed. Counts are recommendations for a later merge pass, not executed here.

Mention counts (graph.db entity_mentions, stale):
```
1219787  Epistle to the Son of the Wolf   work  83
1220295  Súriy-i-Mulúk                     work  30
1220496  Tablet of Carmel                  work  12
1220620  Súriy-i-Haykal                    work   8
1220540  Son of the Wolf                   work   7   (work-typed variant)
1239244  The Son of the Wolf               work   2   (work-typed variant)
1219993  Súratu'l-Haykal                   work   1
1220709  Lawḥ-i-Karmil                     work   1
1235060  Tablet of Ahmad                   work   1
```
King sub-works (distinct works, NOT merged): 1220366 First Tablet to Napoleon III (3), 1220577 Tablet to Queen Victoria (5).
NOT a work — leave alone: 1220620's namesake person 1219787 is the Epistle (work); 1219787 Ibn-i-Dhi'b appears once as `person` (id 1220712) = the actual recipient Shaykh Muḥammad-Taqí — that is the PERSON, not this WORK.

---

## 1. Epistle to the Son of the Wolf (Lawḥ-i-Ibn-i-Dhi'b)
VERDICT: KEEPER **1219787 "Epistle to the Son of the Wolf"** (type=work) ← merge variants **1220540 "Son of the Wolf"** (work), **1239244 "The Son of the Wolf"** (work).
CONFIDENCE: HIGH (keeper); MEDIUM on the two variant merges (see FLAGS).
FIREWALL: The WORK (the Epistle, Bahá'u'lláh's last major work, 1891) ≠ the PERSON "Son of the Wolf" = Shaykh Muḥammad-Taqí-i-Najafí (the "Wolf" was his father Shaykh Muḥammad-Báqir). A real person entity exists separately (1220712 "Ibn-i-Dhi'b", person, 1 mention) and MUST NOT be folded into this work.
DESCRIBE: Bahá'u'lláh's final major tablet, revealed ~1891 in 'Akká, addressed to Shaykh Muḥammad-Taqí ("son of the wolf"). A retrospective work quoting extensively from His own earlier Writings; regarded as the capstone of His revelation.
FLAGS: 1220540 / 1239244 are bare-name forms typed `work`. Some mentions of "Son of the Wolf" / "The Son of the Wolf" almost certainly refer to the PERSON (recipient), not the Epistle — they were mis-typed as `work`. Before merging, sample mentions: route person-referent mentions to person 1220712, only true work-title mentions to 1219787. Do not blind-merge.

## 2. Súriy-i-Haykal (Tablet of the Temple)
VERDICT: KEEPER **1220620 "Súriy-i-Haykal"** (type=work) ← merge **1219993 "Súratu'l-Haykal"** (work).
CONFIDENCE: HIGH.
FIREWALL: This work ≠ Súriy-i-Mulúk (separate work #3). Distinct tablets — keep apart.
DESCRIBE: "Surih of the Temple," major Adrianople-period proclamation tablet (~1868), structured around the figure of the Temple (Haykal). In the published "Summons of the Lord of Hosts," the Súriy-i-Haykal INCORPORATES the five individual messages to the kings (Pope Pius IX, Napoleon III, Czar Alexander II, Queen Victoria, Náṣiri'd-Dín Sháh) embedded within its text.
FLAGS: RELATIONSHIP — the individual king tablets (#below) are embedded as sub-sections of Súriy-i-Haykal in its final 'Akká-period compilation. Two such king sub-works exist as separate entities (1220366 Napoleon III, 1220577 Queen Victoria) — these are legitimately distinct works; note `part_of` Súriy-i-Haykal rather than merging.

## 3. Súriy-i-Mulúk (Tablet to the Kings)
VERDICT: KEEPER **1220295 "Súriy-i-Mulúk"** (type=work). No merge candidates surfaced (no "Tablets to the Kings" title-variant entity found).
CONFIDENCE: HIGH.
FIREWALL: ≠ Súriy-i-Haykal (#2). These are two DIFFERENT tablets despite both being "kings" proclamation works. Súriy-i-Mulúk = "Surih of the Kings," addresses the monarchs COLLECTIVELY; Shoghi Effendi: "the most momentous Tablet revealed by Bahá'u'lláh." Súriy-i-Haykal embeds the INDIVIDUAL king messages.
DESCRIBE: Revealed Adrianople ~late 1867–1868. First tablet directing words collectively to the entire company of monarchs of East and West.
FLAGS: SUB-WORK RELATIONSHIP — the individual "Tablets to the Kings" (to Napoleon, Czar, Pope, Queen Victoria, the Sháh) are commonly grouped under the "Tablets to the Kings" proclamation umbrella. In the corpus they surface as separate works (1220366 First Tablet to Napoleon III, 1220577 Tablet to Queen Victoria); the canonical embedding of those individual messages is in the Súriy-i-Haykal (#2), NOT the Súriy-i-Mulúk. Recommend modeling individual king tablets as distinct works with a `proclamation`/`part_of` link, primarily to Súriy-i-Haykal. Keep all three (this, #2, and the individual tablets) distinct.

## 4. Tablet of Aḥmad (Lawḥ-i-Aḥmad)
VERDICT: KEEPER **1235060 "Tablet of Ahmad"** (type=work). No other variant surfaced.
CONFIDENCE: MEDIUM-HIGH (single keeper, no merge needed; low corpus presence at 1 mention).
FIREWALL: This is the Arabic Tablet of Aḥmad (addressed to Aḥmad of Yazd), the famous prayer-tablet ≠ the Persian Tablet of Aḥmad (to Aḥmad of Káshán). Only one entity present; if a Persian-Tablet-of-Aḥmad entity appears later, keep distinct. Also ≠ the person "Aḥmad" (recipient).
DESCRIBE: Arabic Tablet of Aḥmad, revealed Adrianople period, one of the most frequently recited tablets in the Bahá'í community.
FLAGS: Only 1 mention — likely under-extracted vs. its real-world prominence. No transliteration variant (Aḥmad with ḥ) found as a separate work entity; watch for one on future scans.

## 5. Tablet of Carmel (Lawḥ-i-Karmil)
VERDICT: KEEPER **1220496 "Tablet of Carmel"** (type=work, 12) ← merge **1220709 "Lawḥ-i-Karmil"** (work, 1).
CONFIDENCE: HIGH.
FIREWALL (CRITICAL): The WORK "Tablet of Carmel" ≠ the PLACE Mount Carmel. Numerous place entities exist and MUST stay separate: 615622 Mount Carmel (47), 1219681 Mount Carmel (44), 622809 Mt. Carmel (40), 618891 Carmel (18), 1232735 Carmel (10), plus 620662, 629838 Arc on Mount Carmel, 1241xxx shrine/Archives variants. NONE of these places merge into the work; the work merges ONLY its own title-variant Lawḥ-i-Karmil.
DESCRIBE: "Tablet of Carmel," revealed by Bahá'u'lláh on Mount Carmel (~1890s, 'Akká period). Charter for the World Centre / administrative order; the tablet apostrophizes the mountain (Carmel) — hence the place-name collision risk.
FLAGS: High homonym collision with the place. Do not let any `place`-typed Carmel/Mount Carmel entity be swept into this work during merge. The person 1221615 "Viscount Samuel of Carmel" is also unrelated.
