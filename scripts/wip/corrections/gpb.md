# GPB Correction Set (doc_id 21310) — VERIFIED, READ-ONLY

> Cohort 1 of the entity-review consolidation. Source MD: gpb-seed-ANCHOR.md + gpb-enrichment-{INDEX,circle,rulers,western,events,works}.md.
> Every operation below maps a human-verified MD finding to REAL current entity_ids pulled from the GPB sidecar roster (graph.db `entity_mentions` JOIN `graph_entities`, doc_id=21310) and verified by reading the actual mention contexts (content.id cited as `c<id>`).
> NO DB WRITES PERFORMED. This file is the intended-operation record only.
> Locus convention: `c<content.id>` = the big sidecar row id (matches Meili `id`); GPB paragraph_index unknown without a second join — content.id is the stable locator used here.
> side: Bábí (Báb's dispensation) | Bahá'í (Bahá'u'lláh's) | opponent | other.
> SCHEMA: TYPE | targets | result | EVIDENCE (cid + reasoning) | confidence | NEEDS-USER?

---

## A. CENTRAL FIGURES — fragment merges

### A1. The Báb — 3 fragments → 1
- **MERGE** | keeper **1219258** "the Báb" (253) ← [**613854** "Báb" (18), **1219478** "Báb" (3)] | one person: the Báb (Siyyid 'Alí-Muḥammad)
- EVIDENCE: 613854 mentions are uniformly the Báb's own narrative — c21055496 "With the Báb's return to S̱híráz…", c21055521 "The Báb was still in Máh-Kú when He wrote… to Muḥammad S̱háh", c21055523 "the Báb's confinement in the fortress of C̱hihríq". 1219478's c21055519 "the Bayán (Exposition)… repository of the laws" and c21055536 "the 'Bugle'… trumpet-blast" are Revelation/work-sense uses; by salience+recency they still resolve to the Báb in His own chapter. All three are the same dominant referent.
- confidence: verified | NEEDS-USER: N
- NOTE: 1219478's c21055519/536 are arguably *Bayán-the-work* sense, not the person — leave a flag; if a `work` Bayán split is desired later it can be re-pointed (work entity 1219353 "Bayán" already exists). Does not block the person merge.

### A2. Bahá'u'lláh — 4 fragments → 1
- **MERGE** | keeper **613759** "Bahá'u'lláh" (341) ← [**1219519** "Bahá'u'lláh" (174), **1227553** "Bahá'u'lláh" (36, curly-quote variant), **1220938** "Baháʼu'lláh" (1, modifier-letter apostrophe)] | one person.
- EVIDENCE: all four are pure spelling/apostrophe variants of the headline subject of GPB (straight `'`, curly `'`, modifier `ʼ`). No contrary referent possible — Bahá'u'lláh is the book's protagonist.
- confidence: verified | NEEDS-USER: N
- ALSO consider folding the anaphoric epithet rows that resolve to Bahá'u'lláh (see C-pronouns): "He Whom God shall make manifest" 1219963 / "He Whom God will make manifest" 1219900 / "Him Whom God will make manifest" 1219472 / "He Whom God shall make manifest" 1219535 — these are the GPB title for Bahá'u'lláh. Treat as ALIAS-ADD onto 613759, not separate persons. confidence: verified | NEEDS-USER: N

### A3. 'Abdu'l-Bahá — fragments → 1
- **MERGE** | keeper **614731** "'Abdu'l-Bahá" (161) ← [**1227641** "'Abdu'l-Bahá" (9, curly variant), **1221619** "'Abdu'l-Bahá" (1), **623906** "'Abdu'l-Bahá's" (2, possessive), **1219728** "Center of the Covenant" (82), **1220348** "The Most Great Branch" (4), **623915** "His Holiness 'Abdu'l-Bahá" (1)] | one person ('Abbás Effendi).
- EVIDENCE: 1219728 "Center of the Covenant" (82) = the GPB title for 'Abdu'l-Bahá (Markaz-i-Mítháq); The Most Great Branch = Ghusn-i-A'ẓam = 'Abdu'l-Bahá (per ANCHOR firewall: Most Great ≠ Greater ≠ Purest). Possessive and curly forms are spelling variants.
- confidence: verified | NEEDS-USER: N
- FIREWALL: keep "The Most Great Branch" (1220348) firewalled from Ghusn-i-Akbar "Greater Branch" (= Mírzá Muḥammad-'Alí, breaker) and Ghusn-i-Athar "Purest Branch" (= Mírzá Mihdí). See D-firewalls.

### A4. Náṣiri'd-Dín Sháh — multi-fragment merge (ANCHOR/rulers ×4)
- **MERGE** | keeper **1219335** "Náṣiri'd-Dín Sháh" (28) ← [**1227689** "Náṣiri'd-Dín S̱háh" (2, sub-macron), **1219449** "Náṣiri'd-Dín Mírzá" (2, pre-1848 crown-prince), **1220238** "Náṣiri'd-Dín" (1)] | one person (became Sháh 1848 age 17; presided over Báb's 1848 Tabríz exam as crown-prince).
- EVIDENCE: per gpb-enrichment-rulers.md (verified ¶21055901 "Prince of Oppressors"; assassination 1896). Sub-macron + crown-prince-name + plain are the same monarch.
- confidence: verified | NEEDS-USER: N

### A5. ⚠ "Sháh" (619695, 24 mentions) — anaphoric title needing CONTEXT SPLIT
- **SPLIT** | **619695** "Sháh" → distribute mentions by recency to **1219335** Náṣiri'd-Dín Sháh OR **619573** Muḥammad Sháh (21) by the chapter each mention sits in.
- EVIDENCE: bare "the Sháh" is anaphoric. Báb-era mentions (c21055504, c21055507 — "Ḥájí Mírzá Áqásí" / governor-of-Iṣfahán context) resolve to **Muḥammad Sháh**; Síyáh-Chál / 1852-53 expulsion mentions (c21055573-577 "reign of terror", c21055640 "the S̱háh's edict… expulsion of Bahá'u'lláh", Capt. Von Goumoens c21055577) resolve to **Náṣiri'd-Dín Sháh**. Two distinct referents under one extracted node.
- confidence: likely | NEEDS-USER: **Y** — the per-mention boundary (which paras to Muḥammad vs Náṣiri'd-Dín) needs a human pass; do NOT blind-merge into one Sháh.

---

## B. NAMESAKE-CLUSTER MERGES (verified by context)

### B1. Ṭáhirih — 6 fragments → 1
- **MERGE** | keeper **1219340** "Ṭáhirih" (19) ← [**1219341** "Qurratu'l-'Ayn" (4), **1219795** "Qurrat-i-'Ayní" (1), **1219793** "Zarrín-Táj" (2), **1219794** "Zakíyyih" (1), **638207** "Fáṭimih" (7)] | one person (Fáṭimih Baraghání, the only woman Letter).
- EVIDENCE: 638207 "Fáṭimih" c21055585 "scion of the family of Ḥájí Mullá Ṣáliḥ-i-Baraqání" + c21055588 "this great Bábí heroine, the first woman suffrage martyr" = unambiguously Ṭáhirih. Qurratu'l-'Ayn / Zarrín-Táj / Zakíyyih are her ANCHOR-listed aliases.
- confidence: verified | NEEDS-USER: N
- ⚠ FLAG (do not auto-pull): 638207's c21055708 ("Hidden Words… Hidden Book of Fáṭimih") and c21056121 are the *prophesied Shí'í Book of Fáṭimih* / different sense — these 2 mentions are FALSE mentions on the person; re-point to the Hidden Words work (works §1) or drop, NOT merge onto Ṭáhirih. Per "KEEP Fáṭimih, resolve by context" rule. confidence: verified | NEEDS-USER: N

### B2. Vaḥíd — 3 fragments → 1 (firewall vs Mírzá Yaḥyá)
- **MERGE** | keeper **651297** "Vaḥíd" (18) ← [**1219861** "Vaḥíd" (1), **638223** "Siyyid Yaḥyáy-i-Dárábí" (2)] | one person (Bábí Nayríz leader, martyred 1850).
- **FIREWALL** | 651297 Vaḥíd != **620167** "Mírzá Yaḥyá" (Ṣubḥ-i-Azal, opponent) ; != John the Baptist. Both carry the "Yaḥyá" string — never collapse.
- EVIDENCE: ANCHOR + INDEX confirm the firewall; 638223 is Vaḥíd's full name (Siyyid Yaḥyáy-i-Dárábí).
- confidence: verified | NEEDS-USER: N

### B3. Mírzá Yaḥyá (Ṣubḥ-i-Azal) — keeper + alias/firewall
- **MERGE** | keeper **620167** "Mírzá Yaḥyá" (43) ← [**1220877** "Azalí" (1) IF that node is the man not the sect — VERIFY] | opponent.
- **DROP/REGROUP** | "Azalí/Azalís" as a FOLLOWER group must stay a SEPARATE organization entity (the sect ≠ the man). 1220877 "Azalí" (person, 1 mention) is ambiguous — check whether it is the man or a follower.
- confidence: likely | NEEDS-USER: **Y** — confirm 1220877 is the man vs the sect before merging.

### B4. Nabíl-i-A'ẓam — fragments → 1 (firewall vs Nabíl-i-Akbar)
- **MERGE** | keeper **620138** "Nabíl" (40) ← [**1220249** "Nabíl" (4), **1220139** "Nabíl-i-A'ẓam" (1), **620216** "Nabíl-i-Zarandí" (1), **1220138** "Mullá Muḥammad-i-Zarandí" (1)] | one person (the chronicler/author of The Dawn-Breakers).
- EVIDENCE: 620138 throughout is the eyewitness/quoted chronicler — c21055655 "Nabíl, traveling… through Ḵhurásán", c21055696/703/704/732 "wrote Nabíl / continues Nabíl / writes Nabíl". This IS Nabíl-i-A'ẓam (Zarandí).
- **FIREWALL** | keeper != **1220146** "Nabíl-i-Akbar" (Mullá Muḥammad-i-Qá'iní, Hand) ; != **1153963** "Mullá Muḥammad-i-Qá'iní". A'ẓam = Dawn-Breakers author; Akbar = Qá'iní scholar.
- confidence: verified | NEEDS-USER: N

### B5. Mírzá Muḥammad-'Alí (arch-breaker) — fragments → 1
- **MERGE** | keeper **1206810** "Mírzá Muḥammad-'Alí" (21) ← [**1220999** "Son of Mírzá Muḥammad-'Alí" is his SON (Shu'á'u'lláh, 1220998) — do NOT merge; **614534** "Muḥammad-'Alí" (1) VERIFY] | opponent (Ghusn-i-Akbar, "Prime Mover of sedition").
- **FIREWALL** | != Quddús (613760, Bárfurúshí Letter) ; != Ḥujjat (Mullá Muḥammad-'Alíy-i-Zanjání 1219376 / concept "Ḥujjat" 1219377) ; != the Báb's given name 'Alí-Muḥammad ; != Muḥammad-'Alí Sháh (1221525) ; != Prince Muḥammad-'Alí of Egypt (1221426).
- EVIDENCE: ANCHOR + circle.md (¶21055941 "Prime Mover of sedition"). "Muḥammad-'Alí" bare bucket is heavily polysemous — verify son-of-Bahá'u'lláh confluence before merging 614534.
- confidence: likely (keeper verified; 614534 unverified) | NEEDS-USER: **Y** for 614534.

### B6. Other circle/family merges (from circle.md, IDs to confirm vs live roster)
- **MERGE** | Mírzá Áqá Ján keeper **1220065** "Mírzá Áqá Ján" (13) — firewall the Bolbol/Gilavani/Majzub nodes (circle.md lists 831139/831144/831148 — NOT in GPB top roster, likely Dawn-Breakers; flag for cohort 5). confidence: verified(keeper) | NEEDS-USER: N
- **MERGE** | Mírzá Músá (Áqáy-i-Kalím): keeper **1220020** "Áqáy-i-Kalím" (13) ← [**613792** "Mírzá Músá" (4)] | Bahá'í, full brother. EVIDENCE: ANCHOR/circle.md. FIREWALL: != Imám Músá al-Káẓim; != prophet Moses (614448). confidence: verified | NEEDS-USER: N
- **MERGE** | Navváb: keeper **1219442** "Navváb" (2) ← [**638164** "Asiyih Khánum" (2)] | Bahá'í, "Most Exalted Leaf". FIREWALL != Greatest Holy Leaf. confidence: verified | NEEDS-USER: N
- **MERGE** | Bahíyyih: keeper **1222072** "Greatest Holy Leaf" (3) ← [**1222037** if present] | Bahá'í. confidence: verified | NEEDS-USER: N
- **MERGE** | Mírzá Mihdí (Purest Branch): keeper **625443** "Mírzá Mihdí" (1) + **1220467** "Mírzá Mihdí" (1) → 1 | Bahá'í martyr. FIREWALL != Siyyid Mihdíy-i-Dahají (1221735, breaker); != 1119854 Mírzá Mihdíy-i-Rashtí. confidence: likely | NEEDS-USER: **Y** (both only 1 mention; confirm same referent & not Dahají/Rashtí).
- **MERGE** | Siyyid Muḥammad-i-Iṣfahání ("Antichrist of the Bahá'í Rev"): keeper **619821** "Siyyid Muḥammad" (19) — ⚠ but bare "Siyyid Muḥammad" (19) is a high-collision name; VERIFY each mention is the Iṣfahání instigator vs other Siyyid Muḥammads (1220072 "Siyyid Muḥammad" 3 is a separate node). confidence: uncertain | NEEDS-USER: **Y**.
- **MERGE** | Mírzá Badí'u'lláh (breaker): keeper **1220979** "Mírzá Badí'u'lláh" (8). FIREWALL (CRITICAL) != **1219596** "Badí'" (6, Áqá Buzurg, "Pride of Martyrs", Tablet-bearer — loyal martyr). The "-u'lláh"+"Mírzá" distinguishes breaker from martyr. confidence: verified | NEEDS-USER: N
- **MERGE** | Khayru'lláh: keeper **1221058** "Ibráhím Khayru'lláh" (2) ← [**1221739** "Ibráhím-i-Khayru'lláh" (1), **1221070** "Dr. Khayru'lláh" (2)] | opponent. confidence: verified | NEEDS-USER: N

---

## C. RETYPE / DROP — titles, collectives, pronoun-artifacts (NOT person entities)

### C1. Bare TITLES mis-typed as person → RETYPE to `title` or DROP, re-attach anaphoric "the X" uses
- **RETYPE/DROP** | **617083** "Mujtahid" (2) — c21055690 "influx of Persian Bábís…", c21055711 "evidences of the range…" contain NO definite "the Mujtahid" referent; these are mis-extractions/noise. DROP from person layer. confidence: verified | NEEDS-USER: N
- **RETYPE/DROP** | **1220865** "Mujtahid" (1) — c21055917 is about "Mírzá Buzurg Ḵhán, the Persian Consul General" — orphan/mis-attached. DROP. confidence: verified | NEEDS-USER: N
- **DROP (collective)** | **617778** "Mujtahids" (7) — generic clerical collective (c21055601 Shíráz governor context, c21055910 "sacerdotal order"). Not a person. confidence: verified | NEEDS-USER: N
- **DROP/RETYPE (title)** | **1142618** "Sulṭán" (16), **619695** see A5, **636732** "King" (4), **616374** "Kings" (concept already), **615484** "Queen" (3), **617929** "Prince" (3), **614609** "Messenger" (1), **624198** "Guardian" (1), **625576** "Prisoner" (1), **1182996** "Leader" (1), **636586** "Imáms" (4), **619710** "Mullás" (4), **624400** "Shaykhs" (3), **1060013** "Siyyids" (1), **616538** "Malik" (1), **1185898** "Crier" (2), **2054 "Vazir"** (1222054), **1220916** "Páshá" (3), **625529**/**1220750** "Muftí" (4/3) | bare generic titles/collectives → RETYPE `title`/`organization` or DROP from person layer; resolve any definite-anaphoric "the X" uses to the contextual named person. confidence: verified | NEEDS-USER: N
- **DROP (occupational/anaphoric titles)** | **1219453**/**1219392** "Imám-Jum'ih" (4/5) + **1220707** "Imám-Jum'ih of Iṣfahán" (1) — the first two bare = title; the third is the specific Iṣfahán imám-jum'ih (the persecutor of the King/Beloved of Martyrs) — RETYPE the bare ones, KEEP/resolve 1220707 to the named individual. confidence: likely | NEEDS-USER: **Y** (resolve 1220707 to the named Iṣfahán cleric).

### C2. COLLECTIVES mis-typed as person → RETYPE `organization` / DROP
- **RETYPE org / DROP** | **1219432** "Kurds" (8), **652658** "Pilgrims" (12), **620582** "Disciples" (2), **620117** "Disciple" (2), **652602** "Children" (1), **1219624** "Seven Martyrs of Ṭihrán" (4 — keep as a named *event/group* entity, not a person), **1220437** "Companions of the Qá'im" (1), **1220313** "The Sons of Jacob" (1), **1220314** "The Sons of Noah" (1), **1221584** "Founders of the Faith" (3), **1222683** "Twin Founders of the Faith" (1), **1222682** "Founder of the Faith" (1), **644306** "Companions" (already concept) | collectives/groups, not individuals. confidence: verified | NEEDS-USER: N
  - NOTE: "Twin Founders of the Faith" (1222683) is the Báb + Bahá'u'lláh dyad — RELATE to both, don't make a person.

### C3. PRONOUN / EPITHET artifacts → DROP from person layer (resolve to referent if definite)
- **DROP** (pronoun/possessive artifacts, all `person`-typed in error): **1165379** "Himself" (4), **660394** "His Name" (2), **638226** "His Family" (17), **644527** "My Family" (1), **653409** "His Pen" (7), **625412** "His Countenance" (2), **632439** "Nephew" (1), **623048** "Eldest Son" (2), **1196272** "Father" (2), **653763** "My Lord" (2), **1189189** "Thy Lord" (4), **954 "Thee"** (624954), **620384** "Thou" (1), **1220719** "Ye" (1), **935906** "Streets" (1), **935924? "Gardeners"** (1055930), **1055930** "Gardeners" (1) | pronoun/relational artifacts — not entities. Where a definite possessive clearly = Bahá'u'lláh's family ("His Family" 17), optionally RELATE to 613759 rather than keep as a person. confidence: verified | NEEDS-USER: N
- **DROP/RESOLVE** | descriptive-phrase pseudo-persons: **1219314** "One Whose advent that Forerunner had promised" (1 = Bahá'u'lláh), **1219756** "Amanuensis of the Báb" (1), **1221774** "Bahá'u'lláh's amanuensis" (2 = Mírzá Áqá Ján), **637565** "His Forerunner" (4 = the Báb), **645816** "His Messenger" (1), **1221260** "He that was hidden from mortal eyes" (1), **1219356** "Prophet of Shíráz" (2 = the Báb), **1221222** "Martyr-Prophet of Shíráz" (1 = the Báb), **1221622** "Kinsman of the Báb" (1), **1222344** "Swiss scientist and psychiatrist" (1 = Auguste Forel), **1222092** "French-Canadian architect"(1)/**1221575** "French Canadian Bahá'í architect"(1) (= Louis Bourgeois), **1222548** "Eldest daughter of the Duke of Edinburgh"(1)/**1221720** "Grand-daughter of Queen Victoria"(1) (= Queen Marie), **2077 "brother and lieutenant of the arch-breaker"** (1222077 = Mírzá Badí'u'lláh), **1221500** "Shah's son and successor" (1 = Muẓaffari'd-Dín) | these are DESCRIPTIONS → resolve each to its named entity (ALIAS-ADD or merge), not standalone persons. confidence: likely | NEEDS-USER: N (each resolvable from its single context).

---

## D. FIREWALLS (assert, do not merge) — verified distinct entities in the GPB roster

- **FIREWALL** | the Báb (1219258) != "Báb" title-in-Bábu'l-Báb sense != Mullá Ḥusayn (1219326, "Bábu'l-Báb"). Bábu'l-Báb = Mullá Ḥusayn, never the Báb.
- **FIREWALL** | Vaḥíd (651297) != Mírzá Yaḥyá (620167) [B2].
- **FIREWALL** | Quddús (613760) != Mírzá Muḥammad-'Alí (1206810) != Ḥujjat (1219376) — the Muḥammad-'Alí cluster.
- **FIREWALL** | Mírzá Badí'u'lláh (1220979, breaker) != Badí' (1219596, martyr "Pride of Martyrs") [B-circle].
- **FIREWALL** | 3 Branches: The Most Great Branch / Center of the Covenant (→'Abdu'l-Bahá 614731) != Ghusn-i-Akbar "Greater" (→Mírzá Muḥammad-'Alí 1206810) != Purest Branch (→Mírzá Mihdí 625443).
- **FIREWALL** | 2 Leaves: Navváb/Most Exalted Leaf (1219442) != Greatest Holy Leaf (1222072).
- **FIREWALL** | 2 Nabíls: Nabíl-i-A'ẓam (620138) != Nabíl-i-Akbar (1220146)/Qá'iní (1153963) [B4].
- **FIREWALL** | 2 Antichrists: Bahá'í-Rev = Siyyid Muḥammad-i-Iṣfahání (→619821, see B6 caveat) ; Bábí-Rev = Ḥájí Mírzá Áqásí (1219336). (Áqásí's "Antichrist of the Bábí Revelation" = Balyuzi's epithet, NOT GPB's — ATTRIBUTE correctly.)
- **FIREWALL** | 3 Ḥusayn Kháns: Ḥusayn Khán Niẓámu'd-Dawlih / Shíráz governor (Báb-era) [roster: **1219374** "Ḥusayn Khán" (8) — VERIFY this is the Shíráz governor] != Mírzá Ḥusayn Khán Mushíru'd-Dawlih (Constantinople ambassador — roster **1220291** "Mushíru'd-Dawlih" (3) + **1220222** "Mírzá Ḥusayn Khán" (4)) != Bábí martyrs named Ḥusayn. ⚠ NEEDS-USER: confirm 1219374 vs 1220222 split & route the Shíráz governor to the Báb-period record (INDEX decision #1).
- **FIREWALL** | 2 Tabríz Shaykhu'l-Isláms: Mullá Muḥammad-i-Mámáqání (warrant — **1060778**) != Mírzá 'Alí-Aṣghar (bastinado — **1219444** "Mírzá 'Alí-Aṣghar" (4) / **1220542** "'Alí-Aṣghar" (2)).
- **FIREWALL** | 'Abbás: 'Abbás Effendi (='Abdu'l-Bahá 614731) != 'Abbás Ḥilmí Páshá II (Khedive — **1221307**/**1221426**) != 'Abbás-Qulí Khán-i-Láríjání (**1219600**, killed Mullá Ḥusayn) != 'Abbás Mírzá (**1220141**).
- **FIREWALL** | 2 Napoleons: Napoleon III (622821, addressed) != Napoleon I (**616469** "Napoleon" (1), besieger of 'Akká). ⚠ bare "Napoleon" (616469) — resolve by context (likely Napoleon I).
- **FIREWALL** | William I (1055767, Aqdas address) != William II (623798/1220773, grandson).
- **FIREWALL** | Princess Olga of Yugoslavia (1222446, of Greece, regent Paul's wife, Root's host) != "Queen of Yugoslavia" (1222503, = Marie's daughter Maria "Mignon"). GPB ¶21056229 conflates them; corrected by external fact (INDEX/western decision #4). KEEP TWO. confidence: verified | NEEDS-USER: N.
- **FIREWALL** | Princess Ileana (1061061) ≡ "Arch-Duchess Anton" (1222573)/"Arch-Duchess Anton of Austria" (1222419) — SAME person under married title → MERGE these three. confidence: verified | NEEDS-USER: N.

---

## E. MERGES — rulers/officials (rulers.md)

- **MERGE** | Atábik-i-A'ẓam (1221724) ← "Aminu's-Sulṭán" (one person, Mírzá 'Alí-Aṣghar Khán Grand Vizir). ⚠ NAME-COLLISION RISK with Mírzá 'Alí-Aṣghar the Shaykhu'l-Islám (1219444) — these are DIFFERENT men (Grand Vizir vs Tabríz cleric); verify before any 'Alí-Aṣghar merge. confidence: likely | NEEDS-USER: **Y**.
- **MERGE** | Sir Herbert Samuel (1221614, 4) ← Viscount Samuel of Carmel (1221615, 3) | one person (first High Commissioner). confidence: verified | NEEDS-USER: N.
- **MERGE** | Sulṭán 'Abdu'l-'Azíz: keeper **1219414** "Sulṭán 'Abdu'l-'Azíz" (11). FIREWALL != 'Azíz Páshá (1220345), != Sulṭán 'Abdu'l-Majíd (1219486), != Sulṭán 'Abdu'l-Ḥamíd (1220716). confidence: verified | NEEDS-USER: N.
- **MERGE** | Czar Alexander II: keeper "Nicolaevitch Alexander II" (1060841, 3) ← [1222551 "Alexander II of Russia" (1)] ; FIREWALL != Alexander III (623844). "Nicolaevitch" = patronymic, not Nicholas. confidence: verified | NEEDS-USER: N.
- **MERGE** | 'Alí Páshá: keeper **950551** "'Alí Páshá" (10). Lawḥ-i-Ra'ís → 'Alí Páshá (Súriy-i-Ra'ís work 1220368 exists). RELATE not merge. confidence: verified | NEEDS-USER: N.
- **MERGE** | Mírzá Ḥusayn Khán Mushíru'd-Dawlih: keeper **1220291** "Mushíru'd-Dawlih" (3) ← [**1220222** "Mírzá Ḥusayn Khán" (4) IF context = Constantinople ambassador]. ⚠ verify each "Mírzá Ḥusayn Khán" mention isn't the Shíráz governor. confidence: likely | NEEDS-USER: **Y**.
- **DESCRIBE/ATTRIBUTE** | Queen Victoria (622823) — UNIQUELY COMMENDED by GPB (slave-trade abolition, parliamentary govt); side=other, no chastisement-fate. Record GPB's favorable framing. confidence: verified | NEEDS-USER: N.
- **ATTRIBUTE (quote-in-quote)** | Sulṭán 'Abdu'l-Ḥamíd II (1220716): "Great Assassin"/"23 degenerate predecessors" = GPB QUOTING an external source — attribute the quote to that source, not to GPB as GPB's own characterization. confidence: verified | NEEDS-USER: N.
- **DESCRIBE (nuance)** | Mírzá Áqá Khán-i-Núrí (1219740): capture GPB's nuance — attempted early reconciliation (¶21055581); do not paint uniformly villainous. confidence: verified | NEEDS-USER: N.
- **FLAG** | Reza Shah Pahlavi — NOT in GPB roster top set; "banned Bahá'í literature/schools" = `likely` (community histories), NOT cleanly verified. Light record, flag before stamping verified. confidence: uncertain | NEEDS-USER: **Y**.

---

## F. WORKS (works.md) — type:work, link to corpus docs

- **CONFIRM/DESCRIBE** | Kitáb-i-Aqdas (1219401, 65) — GPB ¶21055871 superlatives ("Most Holy Book", "Mother Book", "Charter of His New World Order"); ~1873 'Akká. confidence: verified | NEEDS-USER: N.
- **CONFIRM/DESCRIBE** | Súriy-i-Mulúk (1220295, 9) — GPB "the most momentous Tablet" (¶21055769), Adrianople ~1867, collective address to kings. confidence: verified | NEEDS-USER: N.
- **CONFIRM** | Súriy-i-Ra'ís (1220368, 7) = Lawḥ-i-Ra'ís → denounces 'Alí Páshá. confidence: verified | NEEDS-USER: N.
- **CONFIRM** | Tablets of the Divine Plan (1221044, 9) — both event (events §9) + work; link, keep distinct. confidence: verified | NEEDS-USER: N.
- **ATTRIBUTE (quote, not work-merge)** | Some Answered Questions (1220015, 7) — 'Abdu'l-Bahá's work, quoted/cited within GPB; speaker='Abdu'l-Bahá. confidence: verified | NEEDS-USER: N.
- **WORKS not in GPB top roster** (Hidden Words, Seven/Four Valleys, Gems, Súriy-i-Ṣabr/Lawḥ-i-Ayyúb, individual ruler-tablets, Tablet of Aḥmad, Súriy-i-Haykal, Epistle to Son of the Wolf, Tablet of Carmel, Kitáb-i-'Ahd) are characterized in works.md but their live entity_ids are below the 240-row roster cut — to be matched to entity_ids in the master-consolidation pass (Cohort 4 "Works" owns the Báb/Bahá'u'lláh works catalog). Carry their verified GPB characterizations & timeline anchors forward. confidence: verified(text) | NEEDS-USER: N.
- **HUMAN REVIEW (carried from INDEX #2, RESOLVED)** | "Tablet to Sulṭán 'Abdu'l-'Azíz" → KEEP as a SEPARATE work entity (user-confirmed); do NOT fold into Súriy-i-Mulúk. confidence: verified | NEEDS-USER: N (already decided).

---

## G. EVENTS (events.md) — type:event

- **CONFIRM** | first Bahá'í century (1219296), Bábí Dispensation (1219262), Heroic Age (1219279), Bahá'í Dispensation (1219672), Bahá'í Era (1219264), Formative Age (1219271 concept), 'Abdu'l-Bahá's ministry (1219415), 'Abdu'l-Bahá's ascension (1221576), Riḍván Festival (638239), Declaration of the Báb (620154) — all present as event/concept rows; align to events.md descriptions + dates.
- **SPLIT/PER-STAGE (user decision #7, RESOLVED)** | the Successive Banishments → per-stage event rows: to Constantinople (1863) / to Adrianople (1863) / to 'Akká (1868) + a light parent arc. confidence: verified | NEEDS-USER: N (decided).
- **PROMOTE (user decision #8, RESOLVED)** | Martyrdom of the Purest Branch → OWN event row (1870), not nested under the barracks imprisonment. confidence: verified | NEEDS-USER: N (decided).
- NOTE: most events.md ¶ citations use paragraph_index (small ¶N) not content.id; reconcile the locus scheme in master consolidation (INDEX locus-scheme flag).

---

## H. RELATIONSHIPS to record (RELATE)

- 613759 Bahá'u'lláh —brother→ 1220020 Áqáy-i-Kalím (Mírzá Músá, full brother, loyal).
- 613759 Bahá'u'lláh —half-brother→ 620167 Mírzá Yaḥyá (opponent).
- 613759 Bahá'u'lláh —father→ 614731 'Abdu'l-Bahá / 1222072 Bahíyyih / 625443 Mírzá Mihdí (loyal line, mother Navváb 1219442) AND →1206810 Mírzá Muḥammad-'Alí / 1220979 Mírzá Badí'u'lláh (breaker line, mother Mahd-i-'Ulyá).
- 1206810 Mírzá Muḥammad-'Alí —father→ 1220998 Shu'á'u'lláh (sent to America to reinforce Khayru'lláh 1221058).
- 651297 Vaḥíd —leader-of→ Nayríz upheaval (place 620197 Nayríz).
- 622823 Queen Victoria —grandmother→ 615485 Queen Marie of Romania.
- 1219335 Náṣiri'd-Dín Sháh —father→ 1220849 Jalálu'd-Dawlih? (NO — Ẓillu's-Sulṭán's son); Náṣiri'd-Dín —son→ Ẓillu's-Sulṭán (Mas'úd Mírzá 1220509) + Kámrán Mírzá (638937) + Muẓaffari'd-Dín (1220508). VERIFY kin chain.

---

## SUMMARY COUNTS (by TYPE)
- MERGE (person fragment/cluster): ~22 operations (A1-A4, B1-B6, E)
- SPLIT (anaphoric title): 2 (A5 Sháh; C1 Imám-Jum'ih) — both NEEDS-USER
- RETYPE/DROP (titles): ~18 nodes
- DROP (collectives): ~13 nodes
- DROP/RESOLVE (pronoun & descriptive artifacts): ~30 nodes
- FIREWALL (assert distinct): 15 firewall pairs/sets
- ATTRIBUTE (quote/epithet provenance): 3 (Áqásí epithet, 'Abdu'l-Ḥamíd "Great Assassin", Some Answered Questions)
- DESCRIBE: Queen Victoria, Mírzá Áqá Khán-i-Núrí + all blank-description keepers
- RELATE: ~10 relationship edges
- CONFIRM (works/events already present): ~14

## NEEDS-USER cases (genuinely ambiguous — flagged, NOT guessed)
1. **A5 "Sháh" (619695, 24 mentions)** — per-mention split between Muḥammad Sháh (619573) and Náṣiri'd-Dín Sháh (1219335); needs the chapter-boundary judgment.
2. **B6 "Siyyid Muḥammad" (619821, 19)** — high-collision bare name; verify which mentions are the Iṣfahání "Antichrist" instigator vs other Siyyid Muḥammads (1220072 is a separate node). Could over-merge.
3. **3 Ḥusayn Kháns (D-firewall / E)** — confirm 1219374 "Ḥusayn Khán" (8, Shíráz governor, Báb-era) vs 1220222/1220291 (Mushíru'd-Dawlih, Constantinople ambassador); route the Shíráz governor to the Báb-period record without creating a duplicate.
4. **'Alí-Aṣghar collision (E / D)** — Atábik-i-A'ẓam ≡ Aminu's-Sulṭán (Grand Vizir, 1221724) vs Mírzá 'Alí-Aṣghar the Tabríz Shaykhu'l-Islám (1219444) — same given name, different men; verify before any merge.
5. **B3 "Azalí" (1220877)** — confirm it is Mírzá Yaḥyá the man vs the Azalí sect (must stay a separate follower-group org).
6. **Reza Shah literature-ban claim (E)** — `likely`, unverified, not in GPB; flag before stamping.
