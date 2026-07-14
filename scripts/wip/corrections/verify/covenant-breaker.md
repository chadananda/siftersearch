# Verify: Mírzá Muḥammad-‘Alí (Arch-Covenant-breaker), Mahd-i-‘Ulyá, Covenant-breakers

Date: 2026-06-16 · Source: read-only sifter.db / graph.db on tower-nas · No DB writes.

## VERDICT

### 1. Mírzá Muḥammad-‘Alí — Arch-Covenant-breaker, Ghusn-i-Akbar
- **KEEPER = 614534** ("Muḥammad-‘Alí", canonical_name "Muḥammad-‘Alí", person).
- Confidence: **HIGH** that 614534 is the arch-breaker; the keeper id matches the task premise.
- **Direct corpus proof** (mention on 614534): *The Child of the Covenant* — "The Arch-breaker of the Covenant of Bahá'u'lláh was **Mírzá Muḥammad-‘Alí, the eldest son of Bahá'u'lláh's second wife, Mahd-i-'Ulya**... He was born in Bag_hdád in the first year after Bahá'u'lláh's arrival there."
- 614534's mentions cluster exactly in the Covenant corpus: *The Child of the Covenant* (22), *The Revelation of Bahá'u'lláh* vols 1–4 (Taherzadeh, esp. vol.2 = 22), *The Covenant of Bahá'u'lláh* (3), *God Passes By* (4). Co-occurrence graph = the breaker's constellation: ‘Abdu'l-Bahá / Center of the Covenant, Shoghi Effendi, Will and Testament, Covenant of Bahá'u'lláh, Bahjí, the Holy Tomb, "Peter" (faithful-vs-breaker analogy).

### 2. Mahd-i-‘Ulyá — Fáṭimih Khánum, 638225
- **KEEPER = 638225** ("Fáṭimih Khánum", person). Confidence **HIGH**.
- Corpus (The Child of the Covenant, on a 614534 co-mention): "The second wife of Bahá'u'lláh, whom He married in Ṭihrán in 1849, was **Fáṭimih Khánum, usually referred to as Mahd-i-'Ulya**... gave birth to six children, of whom four survived... three sons" — eldest = Mírzá Muḥammad-‘Alí. So 638225 = M-‘Alí's mother = Bahá'u'lláh's second wife.
- 638225 itself has only 2 entity_mentions (STALE/under-mentioned). The "Mahd-i-‘Ulyá" surface is fragmented across un-merged concept rows: 616112, 629304, 1240886, 1189044/45 ("O Mahd-i-'Ulya"), 1191468 — all currently entity_type=concept with 0 resolved mentions (orphan/title rows), NOT linked to 638225.

### 3. Covenant-breakers (Náqiḍín) — group/concept
- Multiple un-consolidated rows, all entity_type concept: **1222032 (117 mentions), 1019697 (90), 1221726 (28), 1222672 (15), plus 945264/1060093/1230929/1234413**. The "arch-breaker of the covenant" epithet rows (1221093=19, 1221738=8, 1220872=6, 1221476=6, 1221128, 1221730, 1220568, 1221677, 1222077 "brother and lieutenant of the arch-breaker" = Mírzá Muḥammad-Javád/Badí'u'lláh) are epithets that should resolve TO the person 614534, not be left as standalone concepts.
- Confidence the group concept is real and consolidatable: **HIGH**. Confidence on a single canonical keeper id: **MEDIUM** — recommend 1222032 (highest mentions, plural "Covenant-breakers") as group keeper, merging the other plural-form rows.

## MERGE PLAN (proposed; NOT executed — read-only task)
- Into **614534** (person, arch-breaker): the epithet rows 1221093, 1221738, 1220872, 1221476, 1221128, 1221730, 1220568, 1221677, 1234413 ("Arch Covenant-breaker"), and the title rows 639254 (Ghusn-i-Akbar), 620341/622841/1235091/1233906/1169464 (Greater Branch — but SEE FIREWALL; verify each surface in context before merging, since "Greater Branch" appears in honorific pre-rebellion Tablets too).
- Into **638225** (Fáṭimih Khánum / Mahd-i-‘Ulyá): 616112, 629304, 1240886, 1189044, 1189045, 1191468, 1031217 ("Mahd-i '").
- Group concept keeper **1222032**: merge 1019697, 1221726, 1222672, 945264, 1060093, 1230929.

## FIREWALL (critical — do NOT merge these)
- **≠ ‘Abdu'l-Bahá = 614731 = Ghusn-i-A‘ẓam = "Most Great / Most Mighty / Greatest Branch."** Corpus is explicit (*The Covenant of Bahá'u'lláh*): "Verily God hath ordained the station of the **Greater Branch [Muḥammad-‘Alí]** to be beneath that of the **Most Great Branch [‘Abdu'l-Bahá]**." Greater/Mightier Branch (Ghusn-i-Akbar) = M-‘Alí; Most Great/Greatest Branch (Ghusn-i-A‘ẓam) = ‘Abdu'l-Bahá. The single-word adjective ("greater" vs "most great/greatest") is the ONLY discriminator — high collision risk on "Branch" surfaces. Hand-check each "Greater Branch" row's context before merging; some early Tablets address M-‘Alí with this title honorifically before his rebellion.
- **638227 ("Mírzá Muḥammad-‘Alí", 244 mentions) is NOT the breaker.** It is a Dawn-Breakers Bábí-era namesake bucket — its sampled mentions are Mírzá Muḥammad-‘Alíy-i-Nahrí, Mírzá Muḥammad-‘Alíy-i-Qazvíní (a Letter of the Living, Quddús's martyred companion), Mírzá Muḥammad-‘Alíy-i-Zunúzí (=Anís, martyred WITH the Báb). The Dawn-Breakers (1844–53) predates the Covenant schism (post-1892). Its 244-count must NOT lure a merge into 614534. The "prior 638227 split" was correct; keep separated. (638227 is itself a dirty multi-person bucket needing its own split — FLAG.)
- **614534 is itself contaminated** — aliases conflate: Muḥammad-‘Alí S̱háh (Qájár king), Mírzá Muḥammad-‘Alíy-i-Nahrí, **Mullá Muḥammad-‘Alíy-i-Zanjání (=Ḥujjat, Bábí hero of Zanján)**, Ustád Muḥammad-‘Alíy-i-Salmání (Bahá'u'lláh's barber). These are WRONG aliases on the keeper. Before treating 614534 as clean arch-breaker, strip/split these heroic+royal namesakes. ⚠ The keeper holds the right *referent* (arch-breaker per the explicit passage + Covenant co-occurrence graph) but carries cross-person alias pollution.
- ≠ Quddús (Mullá Muḥammad-‘Alíy-i-Bárfurúshí) — not found merged into 614534, but on the same watchlist given the alias pollution above.

## DESCRIBE (proposed graph_entities.description — none currently stored)
- **614534**: "Mírzá Muḥammad-‘Alí (c.1853 Baghdád – 1937), Ghusn-i-Akbar (the Greater/Mightier Branch); eldest surviving son of Bahá'u'lláh by His second wife Mahd-i-‘Ulyá. Named in the Kitáb-i-‘Ahd as ranking beneath ‘Abdu'l-Bahá (the Most Great Branch), he rebelled against ‘Abdu'l-Bahá after Bahá'u'lláh's 1892 ascension and became the Arch-Covenant-breaker (Náqiḍ-i-A‘ẓam), excommunicated by Shoghi Effendi's Will-and-Testament lineage."
- **638225**: "Fáṭimih Khánum, titled Mahd-i-‘Ulyá (the Most Exalted Cradle); cousin and second wife of Bahá'u'lláh (m. Ṭihrán 1849); mother of the arch-Covenant-breaker Mírzá Muḥammad-‘Alí. NOT Navváb/Ásíyih Khánum (first wife, mother of ‘Abdu'l-Bahá), NOT Ṭáhirih."
- **Covenant-breakers (1222032)**: "Náqiḍín — those who broke Bahá'u'lláh's Covenant by opposing ‘Abdu'l-Bahá's appointed authority; led by Mírzá Muḥammad-‘Alí and his circle (Mírzá Áqá Ján, Badí'u'lláh/Mírzá Muḥammad-Javád, Jamál-i-Burújirdí)."

## FLAGS
1. STALE mention counts: keeper 614534 (77) < contaminated namesake 638227 (244); never use raw counts to pick keepers here.
2. Mahd-i-‘Ulyá keeper 638225 critically under-mentioned (2) with the bulk of "Mahd-i-‘Ulyá" surfaces orphaned on 0-mention concept rows — merge will materially change its profile.
3. Title/epithet entities (Ghusn-i-Akbar 639254, all Greater-Branch rows) have 0 resolved entity_mentions — orphan rows; merging them adds aliases but no mention volume.
4. 614534 alias pollution (Zanjání/Ḥujjat, Salmání, M-‘Alí Sháh, Nahrí) — needs alias cleanup/split before the keeper is trustworthy.
5. 638227 is a separate dirty Bábí-era multi-person bucket (Nahrí + Qazvíní Letter-of-the-Living + Zunúzí/Anís) — out of scope here but needs its own splitting pass.
6. Possible duplicate ‘Abdu'l-Bahá entity 1219697 (716 mentions) alongside 614731 (659/720) — out of scope; flag for the ‘Abdu'l-Bahá consolidation task.
