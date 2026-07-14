# Correction Set — WORKS Cohort (Tablets/Writings of the Báb & Bahá'u'lláh)

> READ-ONLY verification output. NO DB writes performed. Operations below are the
> correction SCRIPT for a later single-writer apply pass (user approval first).
>
> **Scope:** work-entities (type='work') for the Báb's and Bahá'u'lláh's writings, drawn from
> `bab-works-{catalog,curiosities-verified,flagK-incipit}.md`, `bahaullah-works-doclinks.md`,
> `dawnbreakers-bab-works{,-DEEP}.md`, and the work-references in `bab-seed-{founders,letters,heroes-antagonists}.md`.
>
> **Verification performed (tower-nas, read-only):**
> - `graph_entities` has **3,559** type='work' entities — heavily fragmented (every cluster split
>   across translit/diacritic/translation/German-title variants). **All sampled work entities have
>   EMPTY `description`** → raw NER layer, no enrichment yet. Merges below collapse the fragments;
>   DESCRIBE ops carry the verified characterization.
> - Roster of works actually MENTIONED in Dawn-Breakers (21308) + GPB (21310) pulled via the sidecar
>   `g.entity_mentions` join (the in-text cohort, with mention counts — cited per op as `m=N`).
> - Every work→doc link below was CONFIRMED: each `doc_id` resolves in `docs` to the expected title
>   AND the expected author (`The Báb` / `Bahá'u'lláh`). The 10 flag-K Basmala-titled docs
>   (3914/3923/4642/5808/5838/5852/5863/5876/5911/8559) all confirmed `author='The Báb'`.
> - Ṣád-of-Ṣamad mentions (1219592/1219595) verified to sit in **Quddús / Ṭabarsí-fort** paragraphs
>   → confirms Quddús authorship, not the Báb (FIREWALL below).
>
> **entity_ids are REAL** (live `graph_entities.id`). `doc_id`s are REAL (live `docs.id`, deleted_at IS NULL).
> Ambiguous / unfindable items flagged **NEEDS-USER=Y**.

---

## OP SCHEMA
`TYPE | targets | result | EVIDENCE (cid/doc + reasoning) | confidence | NEEDS-USER?`
TYPEs used: MERGE · SPLIT · RETYPE · DESCRIBE · FIREWALL · RELATE · ATTRIBUTE(-strip) · LINK-DOC

---

# PART 1 — THE BÁB'S MAJOR WORKS (merge fragments → keeper, attach doc + GPB/Saiedi characterization)

### W1. Qayyúmu'l-Asmá' (His first revealed work) ★
- **MERGE** | keeper **1219333** "Qayyúmu'l-Asmá'" ← [1238756 "Qayyumu'l-Asma'", 1233398 "Qayyum-i-Asmá'", 1219337 "Commentary on the Súrih of Joseph", 1219464 "the celebrated commentary on the súrih of Joseph", 1239002 "Ahsanu'l-Qisas", 1227785 "Aḥsanu'l-Qiṣaṣ"] | one work, six title-fragments | EVIDENCE: GPB ¶21055515 "entitled the Qayyúmu'l-Asmá'… commentary on the súrih of Joseph"; Saiedi 7165 equates Aḥsanu'l-Qaṣaṣ = Qayyúmu'l-Asmá'. m=17 (1219333), m=3 (1219337). | **verified** | N
- **FIREWALL** | 1219333 (the WORK) ≠ **1219338 "Súrih of Joseph"** (the QUR'ÁNIC súrih, Q.12, that the work comments on) | do NOT merge the commentary into its subject-text | confidence verified | N
- **RELATE** | 1234019 "First Chapter of the Qayyúmu'l-Asmá'" → `part-of` → 1219333 | the opening chapter revealed Declaration night; keep as sub-work, not merged | likely | N
- **LINK-DOC** | 1219333 → source_doc_ids [20170 (full text, The Báb), 16718 "Qayyum al-Asmá' Sura 93", 335081 (excerpts)] · text_in_corpus: yes | doc 20170 confirmed author=The Báb | verified | N
- **DESCRIBE** | 1219333 ← "Qayyúmu'l-Asmá' (Commentary on the Súrih of Joseph; Aḥsanu'l-Qiṣaṣ). The Báb's FIRST revealed work — Declaration night, 22–23 May 1844, Shíráz, to Mullá Ḥusayn. GPB/Bahá'u'lláh: 'the first, the greatest, and mightiest of all books in the Bábí Dispensation'; 111 chapters, >9,300 verses; the 'true Joseph' = Bahá'u'lláh. catalog: phelps BB00003 (slot — see flag J), oceanlibrary 095-Qayyumul-Asma." | GPB ¶¶21055488/21055515 verbatim | verified | N

### W2. The Persian Bayán (flagship) ★
- **MERGE** | keeper **1219348** "Persian Bayán" ← [1238757 "Persian Bayan", 1238754 "The Persian Bayan", 1238792 "Le Bayan Persan", 1239024 "Bayan Persan", 1238968 "Nuqity-i-Bayan"(? see note)] | translit/French-title fragments of the one work | EVIDENCE: GPB ¶21055519 "Bayán (Exposition)… peerless among the doctrinal works". m=18. | verified (1238968 likely) | N
- **LINK-DOC** | 1219348 → [20173 "Bayán-i-Fársí" (The Báb), 16724/1356/16726 partial tr., 12396 Nicolas/Fr] · text_in_corpus: yes | doc 20173 confirmed | verified | N
- **DESCRIBE** | 1219348 ← "The Persian Bayán (Bayán-i-Fársí). Máh-Kú 1847–48 (Stage 3). GPB: 'Peerless among the doctrinal works of the Founder of the Bábí Dispensation'; the Mother-Book of the Bábí Dispensation; nine Váḥids, ~8,000 verses; chief vessel of the Báb's tributes to 'Him Whom God shall make manifest' (Bahá'u'lláh). catalog: phelps BB00001, oceanlibrary 031-Bayan-i-Farsi." | GPB ¶21055519 | verified | N

### W3. "Bayán" five-way polysemy — SPLIT (the single highest-value disambiguation)
- **SPLIT** | **1219353 "Bayán"** (m=25 in 21308/21310; bucket conflates 5 senses) → resolve by SENSE per Shoghi Effendi's translation: (a) WORK = Persian Bayán → MERGE into 1219348; (b) WORK = Arabic Bayán → 1219474; (c) CONCEPT "the whole Revelation of the Báb"; (d) CONCEPT/community "people of the Bayán" = the Bábís; (e) generic "utterance/exposition" → NOT an entity (drop). EVIDENCE: cid in doc 2474 "In the Bayán, the Holy Book of the Báb" = sense (a)=WORK; GPB ¶21055527 "O people of the Bayán!" = sense (d); "Suffer not the Bayán… to withhold you…" = sense (c). | confidence verified (split needed); **modeling of work-vs-concept needs a ruling** | **Y** (how the dictionary models work/concept split + which mentions go where)
- **MERGE (within split)** | 1244758 "The Bayán" → likely the WORK sense → 1219348 unless its mentions prove the Revelation-concept sense; read mentions before merging | likely | Y
- **RETYPE / FIREWALL** | **1219534 "the Point of the Bayán"** is MIS-TYPED as work — it is a **TITLE OF THE BÁB HIMSELF** (Nuqṭiy-i-Bayán, "the Primal Point"), a person-title, NOT a work. EVIDENCE: doc 21310 cid "'The Bayán,' the Báb in that Book…"; doc 7165 "the Point of the Bayán… hath likened the Manifestations…". Re-route to the Báb person-entity (person cohort) or type `title`; remove from work cohort. | verified | N
- **NOTE** | 1237917 "Point of the Bayán" + 1238968 "Nuqity-i-Bayan" share this title-of-the-Báb sense — verify mentions; do NOT leave as works. | likely | Y

### W4. The Arabic Bayán
- **MERGE** | keeper **1219474** "Arabic Bayán" ← [1238755 "The Arabic Bayan", 1238806 "Arabic Bayan", 1238759-NO(that is Dala'il)] | translit fragments | EVIDENCE GPB ¶21055519 "smaller and less weighty Arabic Bayán". | verified | N
- **FIREWALL** | 1219474 ≠ 1219348 (Persian Bayán) — GPB: "not to be confounded with the smaller and less weighty Arabic Bayán" | verified | N
- **LINK-DOC** | 1219474 → [15349 "The Arabic Bayán" (The Báb), 16725 Nicolas/Fr] · text_in_corpus: yes | doc 15349 confirmed | verified | N
- **DESCRIBE** | 1219474 ← "The Arabic Bayán (al-Bayán al-‘Arabí). Máh-Kú 1847–48, same period as the Persian Bayán. GPB: 'smaller and less weighty' — a compressed Arabic recension of the Bayán's structure/laws. catalog: phelps BB00020." | GPB ¶21055519 | verified | N

### W5. Dalá'il-i-Sab‘ih (the Seven PROOFS)
- **MERGE** | keeper **1219509** "Dalá'il-i-Sab'ih" ← [1238759 "Dala'il-i-Sab'ih", 1238619 "Dalá'il-i-Sab‘ih", 1237446 "The Seven Proofs", 1238856 "The Book of Seven Proofs", 1238895 "The Book of the Seven Proofs"] | translit/English-title fragments | EVIDENCE GPB ¶21055522 "Dalá'il-i-Sab‘ih (Seven Proofs), the most important of the polemical works". m=3. | verified | N
- **FIREWALL** | 1219509 (Seven PROOFS, apologetic, Stage 3, BB00015) **≠** the Khaṣá'il-i-Sab‘ih cluster (Seven QUALIFICATIONS/Directives, ordinances, Stage 1) — see W6. The single most likely merge-error in this cohort; both are "Sab‘ih". | verified | N
- **LINK-DOC** | 1219509 → [11432 "The Seven Proofs (Dalá'il-i-Sab'ih)" (The Báb)] · text_in_corpus: yes | doc 11432 confirmed | verified | N
- **DESCRIBE** | 1219509 ← "Dalá'il-i-Sab‘ih (the Seven Proofs). Máh-Kú/Chihríq ~1847–48 (Stage 3). GPB: 'the most important of the polemical works of the Báb'; indicts the seven sovereigns + the Christian divines. Persian + Arabic versions. catalog: phelps BB00015." | GPB ¶21055522 | verified | N

### W6. Khaṣá'il-i-Sab‘ih (the Seven QUALIFICATIONS / Directives)
- **MERGE** | keeper **1219372** "Khaṣa'il-i-Sab'ih" ← [1238789 "Khasa'il-i-Sab'ih", 1228006 "Ḵhaṣá'il-i-Sab‘ih"] | translit fragments | m=2. | verified | N
- **LINK-DOC** | 1219372 → [5783 "Khaṣá'il-i-Sab'ih" (The Báb), 16142 "Laws Preceding the Bayán, The Seven Qualifications"] · text_in_corpus: yes | doc 5783 confirmed | verified | N
- **DESCRIBE** | 1219372 ← "Khaṣá'il-i-Sab‘ih (Treatise of the Seven Directives / Qualifications). First Stage (to Jan 1846). Seven ordinances for the believers (verified opening: #1 carry the blessed protective circle, #2 abstain from the water-pipe). catalog: phelps BB00562 (flag — DEEP cited BB00562; catalog.md could not re-confirm it in its 88-row extract — see flag M), oceanlibrary 224-Khasail-i-Sabih." | Phelps BB00562 opening (in-corpus) | verified (Phelps code: likely) | N
- **FLAG (adhán)** | the widely-cited claim that one ordinance modified the call to prayer is NOT in any verified in-corpus locus — capture seven-directives core as verified; adhán specific = likely, pending primary citation | likely | Y

### W7. Commentary on the Súrih of Kawthar (won Vaḥíd) ★
- **MERGE** | keeper **1219384** "Commentary on the Súrih of Kawthar" ← [1238760 "Commentary on the Surih of Kawthar"] | translit fragment | m=3. | verified | N
- **FIREWALL** | 1219384 (the WORK) ≠ **1219385 "Súrih of Kawthar"** + 1240131 "Súrah of Kawthar" + 1239102 "Súratu'l-Kawthar" (the QUR'ÁNIC súrih, Q.108) | do not merge commentary into subject-text; the three Súrih-of-Kawthar fragments are the súrih (concept/scripture), distinct from the Báb's commentary | verified | N
- **LINK-DOC** | 1219384 → [20171 "Tafsír-i-Súriy-i-Kawthar" (The Báb), 15102 McCants tr.] · text_in_corpus: yes | doc 20171 confirmed | verified | N
- **RELATE** | 1219384 → `recipient/occasion` → person Vaḥíd (Siyyid Yaḥyáy-i-Dárábí) | the commentary that won Vaḥíd | verified | N
- **DESCRIBE** | 1219384 ← "Tafsír-i-Súriy-i-Kawthar (Commentary on the Súrih of Abundance, Q.108). ~May 1846, Shíráz (Stage 2). The work that won over Vaḥíd, the most eminent of the Báb's learned converts. catalog: phelps BB00007." | Saiedi 8632 ¶7770463 | verified | N

### W8. Commentary on the Súrih of Va'l-‘Aṣr
- **MERGE** | keeper **1219399** "Commentary on the Súrih of Va'l-‘Aṣr" ← [1238761 "Commentary on the Surih of Va'l-'Asr", 1239603 "A Commentary on the Súrah of V'al-'Asr", 1239453 "Súriy-i-V'al-'Asr'"] | translit fragments | m=2. | verified (1239453 likely) | N
- **FIREWALL** | 1219399 (the WORK) ≠ **1219400 "Súrih of Va'l-'Aṣr"** + 1239604 "Surah Al-Asr" + 1227587 "Sūrah of al-ʿAsr" (the Qur'ánic súrih, Q.103) | commentary ≠ subject-text | verified | N
- **LINK-DOC** | 1219399 → [20375 "Tafsír-i-Súriy-i-'Aṣr" (The Báb)] · text_in_corpus: yes | doc 20375 confirmed | verified | N
- **DESCRIBE** | 1219399 ← "Tafsír-i-Súriy-i-Va'l-‘Aṣr (Commentary on Q.103). Oct–Nov 1846, Iṣfahán — written in a single night for the Imám-Jum‘ih of Iṣfahán (Mír Siyyid Muḥammad). oceanlibrary 098." | Saiedi 8632 ¶7770466 | verified | N

### W9. Ṣaḥífiy-i-‘Adlíyyih ≡ Risáliy-i-‘Adlíyyih (Epistle of Justice — ROOT principles)
- **MERGE** | keeper **1238419** "Risáliy-i-‘Adlíyyih" ← [1238769 "Risaliy-i-'Adliyyih"] | ALSO merge any "Ṣaḥífiy-i-‘Adlíyyih" fragment if present | EVIDENCE: Phelps BB00017 literally equates "Sahifiy-i-'Adliyya = Risaliy-i-'Adliyyih". | verified | N
- **FIREWALL** | keeper(‘Adlíyyih root) **≠** Risáliy-i-Furú‘-i-‘Adlíyyih (BRANCHES) — see W10 | verified | N
- **LINK-DOC** | keeper → [20169 "Risáliy-i-'Adlíyyih" (The Báb)] · text_in_corpus: yes | doc 20169 confirmed | verified | N
- **DESCRIBE** | keeper ← "Ṣaḥífiy-i-‘Adlíyyih (= Risáliy-i-‘Adlíyyih; also Ṣaḥífiy-i-Uṣúl-i-‘Adlíyyih). Late Jan 1846, Shíráz. Opens Stage 2; the Báb's FIRST major work in Persian; on the root principles (uṣúl) of religion. catalog: phelps BB00017." | Saiedi 8632 ¶7770461 | verified | N

### W10. Risáliy-i-Furú‘-i-‘Adlíyyih (Epistle of Justice — BRANCHES)
- **MERGE** | keeper **1219490** "Risáliy-i-Furú'-i-'Adlíyyih" ← [1238776 "Risaliy-i-Furu'-i-'Adliyyih"] | translit fragment | verified | N
- **DESCRIBE** | 1219490 ← "Risáliy-i-Furú‘-i-‘Adlíyyih (Epistle of Justice: Branches). Early 1846 (Stage 2). On the branches (furú‘) of religion — DISTINCT from the root-principles ‘Adlíyyih (W9). catalog: phelps BB00039. text_in_corpus: mentioned-only (no isolated full-text doc found — flag I)." | Saiedi 8632 ¶7770462 | verified (doc: mentioned-only) | Y (doc link)

### W11. Kitáb-i-Panj-Sha'n (His LAST major work) ★
- **MERGE** | keeper **1219527** "Kitáb-i-Panj-Sha'n" ← [1238767 "Kitab-i-Panj-Sha'n", 1239203 "Mir-panj"(? verify), 1239355 "Hurufat-i-'Allin"(NO — distinct, see W12)] | translit fragments only; do NOT pull Hurufát forms in | m=2. | verified (1239203 needs mention check) | Y (1239203 "Mir-panj" identity)
- **RELATE** | 1219512 "Lawḥ-i-Ḥurúfát" → `part-of` (chapter of) → 1219527 | Saiedi 8632 ¶7770475: "Tablet of Hurúfát… is one of these chapters" | verified | N
- **LINK-DOC** | 1219527 → [16719 "Kitáb-i-Panj Sha'n" (The Báb)] · text_in_corpus: yes | doc 16719 confirmed | verified | N
- **DESCRIBE** | 1219527 ← "Kitáb-i-Panj-Sha'n (Book of the Five Modes). Naw-Rúz 1850, Chihríq — His final year, ~3–4 months before His martyrdom. GPB ¶21055555: 'one of His last works'; contains His veiled prophecy of His imminent martyrdom. 19 chapters; encloses the Lawḥ-i-Ḥurúfát. catalog: phelps BB00005." | GPB ¶21055555 + Saiedi ¶7770475 | verified | N

### W12. Lawḥ-i-Ḥurúfát (Tablet of the Letters / Nineteen Temples)
- **MERGE** | keeper **1219512** "Lawḥ-i-Ḥurúfát" ← [1238774 "Lawh-i-Hurufat", 1219513 "Tablet of the Letters"] | translit/English fragments | m=2. | verified | N
- **LINK-DOC** | 1219512 → [20168 "Lawḥ-i-Ḥurúfát" (The Báb)] · text_in_corpus: yes | doc 20168 confirmed | verified | N
- **DESCRIBE** | 1219512 ← "Lawḥ-i-Ḥurúfát (Tablet of the Letters / Nineteen Temples). Spring 1850. A chapter of the Kitáb-i-Panj-Sha'n (part-of W11), also nameable as a standalone tablet. oceanlibrary 160." | Saiedi 8632 ¶7770475 | verified | N
- **NOTE** | distinguish from related but distinct Ḥurúfát-titled entities: 1220209 "Muṣíbát-i-Ḥurúfát-i-'Álíyát", 1239355 "Hurufat-i-'Allin", 1239649 "Tafsir-i-Hurufat-i-Muqatta'ih" (doc 5879, OL 002) — separate works; do NOT merge into W12 | likely | Y

### W13. Ṣaḥífiy-i-Bayni'l-Ḥaramayn (Epistle Between the Two Shrines)
- **MERGE** | keeper **1219487** "Ṣaḥífiy-i-Baynu'l-Ḥaramayn" ← [1238697 "Sahifatu'l-Haramayn", 1238951 "Kitabu'l-Haramayn", 1239039 "Kitab-i-Baynu'l-Haramayn", 1239051 "Kitáb-i-Baynu'l-Haramayn", 1238758 "the sahifatu'l-haramayn"] | translit/variant fragments of one work | verified | N
- **LINK-DOC** | 1219487 → [20356 "Ṣaḥífiy‑i‑Bayni'l‑Ḥaramayn" (The Báb)] · text_in_corpus: yes | doc 20356 confirmed | verified | N
- **RELATE** | 1219487 → `recipient` → Mírzá Muḥíṭ-i-Kirmání (questions answered on the Ḥajj) | Saiedi 8632 ¶7770648 | verified | N
- **DESCRIBE** | 1219487 ← "Ṣaḥífiy-i-Bayni'l-Ḥaramayn (Epistle Between the Two Shrines). Pilgrimage, late 1844/early 1845 — literally written on the road between Mecca and Medina. catalog: phelps BB00019, oceanlibrary 001. NB the white-tea recipe (doc 15100) is drawn from this work's manuscript family." | Saiedi 8632 ¶7770648 | verified | N

### W14. Tafsír-i-Nubuvvat-i-Kháṣṣih (RETYPE concept→work)
- **MERGE** | keeper **1238699** "Tafsir-i-Nubuvvat-i-Khassih" ← [1238775 "Tafsir-i-Nubuwat-i-Khassih"] | translit fragments | verified | N
- **RETYPE / FIREWALL** | the WORK 1238699 ≠ **1219493 "The Specific Mission of Muḥammad"** (the DOCTRINE/concept). Keep the concept as a separate `concept` entity; relate work→expounds→concept. | Balyuzi 466 "asked the Báb for a treatise on Nubuvvat-i-Kháṣṣih… wrote instantly" | verified | N
- **LINK-DOC** | 1238699 → [20172 "Risálih fí Ithbát-i-Nubuvvat-i-Kháṣṣih" (The Báb)] · text_in_corpus: yes | doc 20172 confirmed | verified | N
- **DESCRIBE** | 1238699 ← "Tafsír-i-Nubuvvat-i-Kháṣṣih (Commentary on Muḥammad's Specific Mission). Iṣfahán, late 1846 — written instantly at the request of Manúchihr Khán the Mu‘tamidu'd-Dawlih. catalog: phelps BB00014, oceanlibrary 033." | Balyuzi 466 | verified | N

---

# PART 2 — FIREWALL: Quddús's work mis-filed under the Báb

### W15. Commentary on the Ṣád of Ṣamad — IS QUDDÚS's, NOT the Báb's
- **FIREWALL / ATTRIBUTE-strip** | **1219595 "Commentary on the Ṣád of Ṣamad"** + **1219592 "Ṣád of Ṣamad"** + **1219767 "Masterly Interpretation of the Ṣád of Ṣamad"** are works of **QUDDÚS** (composed during the siege of Shaykh Ṭabarsí), NOT the Báb. EVIDENCE: live mentions of 1219592 sit in Quddús/Ṭabarsí-fort paragraphs (doc 21308: "the knowledge and sagacity which Quddús displayed…"; doc 21310). | confidence **verified** | N
- **MERGE (within the Quddús work)** | likely keeper 1219595 ← [1219592, 1219767] — three fragments of Quddús's one commentary | verified | N
- **FIREWALL** | Quddús's Ṣád-of-Ṣamad (commentary on letter Ṣád of "Ṣamad", Q.112) **≠** the Báb's own **Súriy-i-Tawḥíd** (1219372? no — 1238773 "Suriy-i-Tawhid", doc 20363) — SAME súrih (Q.112), DIFFERENT author. Do not let a `%Tawḥíd%`/`%Ṣamad%` match merge them. | verified | N
- **NOTE** | route the Ṣád-of-Ṣamad entities to the WORKS-BY-OTHER-BÁBÍS cohort with author=Quddús; OUT of the Báb's work cohort. | verified | N (author-cohort routing is mechanical)

### W16. Súriy-i-Tawḥíd (the Báb's — Commentary on the Súrih of Monotheism)
- **MERGE** | keeper **1238773** "Suriy-i-Tawhid" ← (any other Tawḥíd-commentary fragment of the Báb) | NB distinguish 1220206 "Lawḥ-i-Madínatu't-Tawḥíd" + 1239625/1239616 "Tablet of Madinatu't-Tawhid" + 1239353 "madinatu't-tawhid" = a DIFFERENT work (City of Unity) — do NOT merge | verified | N
- **LINK-DOC** | 1238773 → [20363 "Tafsír-i-Súriy-i-Tawḥíd" (The Báb)] · text_in_corpus: yes | doc 20363 confirmed | verified | N
- **DESCRIBE** | 1238773 ← "Súriy-i-Tawḥíd (Commentary on the Súrih of Unity, Q.112), by the Báb. catalog: phelps BB00075, oceanlibrary 026. ⚠ distinct from Quddús's Ṣád-of-Ṣamad commentary on the same súrih (W15)." | catalog.md B4 | verified | N

### W17. Kitáb-i-Aqdas — NOT the Báb's (verify no mis-attribution)
- **VERIFIED-CLEAN** | the live Kitáb-i-Aqdas entities (1219401 "Kitáb-i-Aqdas" m=71 in 21308/21310, 1228889, 1225587, 1228063, etc.) are **Bahá'u'lláh's** — no Aqdas entity is mis-typed under the Báb in the live data. The dawnbreakers flag G ("Kitáb-i-Aqdas under the Báb") does NOT manifest as a wrong entity; it was a passing-reference / NER concern only. No op needed beyond the Bahá'u'lláh consolidation (Part 3). | verified | N
- **FIREWALL** | 1219401 "Kitáb-i-Aqdas" (the Book, BH00001) ≠ 1220660/1231527 "Lawḥ-i-Aqdas" (Tablet to the Christians, BH00505) ≠ 1220520 "Tablets… Revealed After the Kitáb-i-Aqdas" (doc 8270 compilation) | three distinct things on the "Aqdas" string | verified | N

---

# PART 3 — BAHÁ'U'LLÁH'S WORKS (in-text in GPB/DB; consolidate + link doc + Phelps script)

> All 13 target works verified `text_in_corpus: yes` (docs confirmed author=Bahá'u'lláh).
> Light ops here (these are not the primary Báb-works cohort but appear in the same books and the
> bahaullah-works-doclinks source). Each carries its Phelps BH-code + verified script.

### B1. The Hidden Words (Kalimát-i-Maknúnih)
- **MERGE** | keeper 1220095/1220906 "Hidden Words" / "the Hidden Words" (m=5/3) — collapse the bare + capitalized fragments to ONE | EVIDENCE: ONE work, two Phelps entries BH00386(Ar)+BH00113(Per) | verified | N
- **LINK-DOC** | → [20809, 8230; 15171 parallel-study] · text_in_corpus: yes | doc 20809 confirmed | verified | N
- **DESCRIBE** | ← "Kalimát-i-Maknúnih. Baghdád ~1858. Partly Persian, partly Arabic. script کلمات مكنونه (verified, Phelps). phelps BH00386+BH00113." | Phelps 8746 | verified | N

### B2/B3. Seven Valleys (1220096, m=3) + Four Valleys
- **LINK-DOC** | Seven Valleys → [20811, 8241]; Four Valleys → [12403, 20811, 8241] · text_in_corpus: yes | docs confirmed | verified | N
- **DESCRIBE** | Seven Valleys ← "Haft-Vádí, phelps BH00047, script هفت وادی"; Four Valleys ← "Chahár-Vádí, phelps BH00306, script چهار وادی" | Phelps 8746 | verified | N

### B4. Tablet of Patience (Súriy-i-Ṣabr / Lawḥ-i-Ayyúb)
- **MERGE** | keeper "Súriy-i-Ṣabr"/"Tablet of Patience" fragments to ONE | EVIDENCE Phelps BH00034 explicitly equates Súriy-i-Ṣabr = Lawḥ-i-Ayyúb (`=`) | verified | N
- **LINK-DOC** | → [16631, 15743, 16287, 11463] · text_in_corpus: yes | doc 16631 confirmed | verified | N
- **RELATE** | → `dedicatee` → Ḥájí Muḥammad-Taqí of Nayríz ("‘abdahu Ayyúb"/His servant Job) | Phelps opening | verified | N

### B5. Súriy-i-Mulúk (1220295, m=9)
- **LINK-DOC** | → [20806, 8299 (within Summons of the Lord of Hosts)] · text_in_corpus: yes | doc 20806 confirmed | verified | N
- **DESCRIBE** | ← "Súriy-i-Mulúk (Tablet of the Kings). Adrianople. phelps BH00021, script سورة الملوك. ‘Abdu'l-‘Azíz is addressed WITHIN this tablet (no standalone tablet to him)." | Phelps 8746 | verified | N
- **FIREWALL** | Súriy-i-Mulúk (BH00021) ≠ Súriy-i-Sulṭán (BH00061, distinct Adrianople súrih) ≠ Lawḥ-i-Sulṭán (BH00038, to Náṣiri'd-Dín Sháh) | verified | N

### B6. Ruler tablets (Proclamation) — all within Summons (20806)
- **DESCRIBE+LINK** each: Lawḥ-i-Napulyún I (BH01120), Lawḥ-i-Napulyún II (BH00259, fall-prophecy), Lawḥ-i-Malikih/Victoria (BH00662, docs 16695/15282), Lawḥ-i-Malik-i-Rús/Czar (BH01042), Lawḥ-i-Páp/Pope (BH00347), Lawḥ-i-Sulṭán/Sháh (1219501, m=5; BH00038, docs 16700/11468) | docs 20806/16700 confirmed | verified | N
- **RELATE** | each ruler tablet → `contained_by` → Súriy-i-Haykal (1219994 "Súrih of the Temple", m=3) AND `published_in` → Summons (20806) | Phelps + bahaullah-works-doclinks §B | verified | N
- **NO-WORK** | **No standalone "Tablet to ‘Abdu'l-‘Azíz"** — absent from Phelps inventory; model ‘Abdu'l-‘Azíz as a recipient WITHIN Súriy-i-Mulúk. The earlier GPB flag is RESOLVED. | verified | N

### B7. Tablet of Aḥmad (Arabic) — Lawḥ-i-Aḥmad
- **LINK-DOC** | → [1616, 16618] · text_in_corpus: yes | doc 1616 confirmed | verified | N
- **FIREWALL** | Lawḥ-i-Aḥmad Arabic (BH02022, Yazd, recited) ≠ Lawḥ-i-Aḥmad Persian (BH00249, Káshán) — two tablets, do not merge | verified | N

### B8. Súriy-i-Haykal (1219994 "Súrih of the Temple", m=3)
- **LINK-DOC** | → [16658, 15169, 20806, 8299] · text_in_corpus: yes | doc 16658 confirmed | verified | N
- **DESCRIBE** | ← "Súriy-i-Haykal (Tablet of the Temple). phelps BH00007 (largest proclamation work, 20,670 words); written in pentacle form enclosing the five ruler tablets. script سورة الهيكل." | Phelps 8746 | verified | N

### B9. Kitáb-i-Aqdas (1219401, m=71)
- **MERGE** | keeper 1219401 "Kitáb-i-Aqdas" ← [1228889, 1225587, 1226847 "Ki&i-Aqdas"(garbled), 1231027/1241932 "The Most Holy Book" variants where they are the Book itself] | many translit/edition fragments; verify edition-vs-work before merging study editions | verified (study editions: likely) | Y (which "Most Holy Book"/annotated-edition entities are the WORK vs separate study docs)
- **LINK-DOC** | → [8274, 21307, 16712] · text_in_corpus: yes | doc 8274 confirmed | verified | N
- **FIREWALL** | see W17 (≠ Lawḥ-i-Aqdas BH00505; ≠ Tablets After the Aqdas doc 8270) | verified | N

### B10. Epistle to the Son of the Wolf (1219787, m=4)
- **MERGE** | keeper 1219787 ← [1220540 "Son of the Wolf"] | EVIDENCE both name the same late work | likely | N
- **LINK-DOC** | → [20780, 8273] · text_in_corpus: yes | doc 20780 confirmed | verified | N

### B11/B12. Tablet of Carmel (1220496, m=3) + Kitáb-i-‘Ahd
- **LINK-DOC** | Tablet of Carmel → [8270 §1]; Kitáb-i-‘Ahd → [8270] · text_in_corpus: yes | doc 8270 confirmed | verified | N
- **DESCRIBE** | Carmel ← "Lawḥ-i-Karmil, phelps BH02324"; ‘Ahd ← "Kitáb-i-‘Ahd (Book of My Covenant), phelps BH00003, the 'Crimson Book'" | Phelps 8746 | verified | N
- **FIREWALL** | Lawḥ-i-Karmil (BH02324) ≠ Commentary on its revelation (BH05706); Tablet of Carmel ≠ doc 5666 "Book of Names… in the Tablet of Carmel" (a note, mentioned-only) | verified | N

### B-Gleanings/Javáhir
- **LINK-DOC** | Gems of Divine Mysteries (1220211 "Javáhiru'l-Asrár"; also 1239714 "Tablet of Javahiru'l-Asrar" → merge) → [20782, 8253, 15039]; phelps BH00012, script جواهر الاسرار | doc 20782 confirmed | verified | N

---

# PART 4 — LONG-TAIL BÁB WORKS (light: merge fragments + link doc)

> Each is a genuine work, verified author=The Báb, doc confirmed. Light DESCRIBE (canonical + stage + catalog_ids).

| Work | keeper entity (if found) | LINK-DOC | catalog | conf |
|---|---|---|---|---|
| Kitábu'r-Rúḥ (Book of the Spirit) | 1219489 "Kitábu'r-Rúḥ" | 6344 ✓ | phelps BB00009, OL 187 | verified |
| Ṣaḥífiy-i-Ja‘faríyyih | (search) | 20368 ✓ | phelps BB00012, OL 063 | verified |
| Ṣaḥífiy-i-Raḍavíyyih | (search) | 20362 ✓ | phelps BB00137, OL 022 | verified |
| Ṣaḥífiy-i-Makhzúmíyyih | (search) | 20389 ✓ | phelps BB00018, OL 182 | verified |
| Zíyárat-i-Sháh-‘Abdu'l-‘Aẓím | (search) | 6345 ✓ | OL 232 | verified |
| Risáliy-i-Dhahabíyyih (Golden Epistle) | (search) | 20376 ✓; excerpts 11752/16720 | OL 111 | verified |
| Súratu'l-Mulk | (search) | 16306 ✓ | OL 025 | verified |
| Kitáb-i-Jafr | (search) | 6305 | OL 005 | likely |
| Tafsír-i-Súriy-i-Baqarah (= Kitáb al-Aḥmadiyya) | (search) | 5831 (intro only) ✓ | phelps BB00008, OL 150 | verified (full text partial) |
| Kullu'ṭ-Ṭa‘ám (Tablet of) | 1220066 "Kullu'ṭ-Ṭa'ám" ← [1239350 "Lawh-i-Kullu't-Ta'am", 1219644 "Tablet of Kullu'ṭ-Ṭa'ám" m=3] MERGE | 3903 (OL 180) | — | verified |
| Kitáb-i-Asmá' (Book of Divine Names) | 1238763 "Kitab-i-Asma'" | 6341/5908 (fragments) | phelps BB00016 (Summary) | verified (full text: partial — flag I) |

- **MERGE** | Kullu'ṭ-Ṭa‘ám: keeper **1220066** ← [1239350, 1219644] | one tablet, three title fragments. NB referenced in founders file: it conferred "Nuqṭiy-i-Ukhrá" on Quddús (GPB ¶82). | verified | N

### Curiosity works — GENUINE, never auto-flag (per user ruling + Saiedi 8632)
- **KEEP / DESCRIBE** | doc 15099 "A Reply to a Question about the Alchemical Elixir" (The Báb ✓), 15100 "Recipe for White Tea" (The Báb ✓; from Ṣaḥífa bayna'l-Ḥaramayn family), 16071 "Sun salutation" (The Báb+Bahá'u'lláh ✓; Arabic Bayán 7:17 + Bahá'u'lláh commentary), 57333 "Risāla fī al-naḥw wa al-ṣarf / A Grammar of the Divine" (The Báb ✓), 5801 "Bayán fí 'Ilm'il-Jawámid wa'l-Mushtaqqát" (The Báb ✓), 5819 "Answer to Ḥájí Mullá Mihdí-i-Rashtí, on grammar" (The Báb ✓), 3926 "Treatise on the Science of Letters and Divine Knowledge" (The Báb ✓, INBA-086) | ALL verified author=The Báb in live docs; Saiedi 8632 documents the alchemy/grammar/letter-science genres as genuine and central. **Operating rule: unusual topic ≠ mis-attribution.** | verified | N
- **NOTE** | 57333 full McCants translation is "pending re-ingestion" — bibliographic record + description present; re-ingest TODO, not an authenticity problem | verified | N

### Flag-K — 10 untitled/Arabic-script Báb tablets, resolved by incipit+file_path
- **LINK-DOC** (all verified author=The Báb, Basmala titles confirmed):
  151-INBA-098→5852 ✓ · 152-INBA-098→4642 ✓ · 156-INBA-098→5876 ✓ · 158-JAPA-042→8559 ✓ ·
  164-MISC-002→5863 ✓ · 176-PRIN-14→5808 ✓ · 181-PRV-02→3923 ✓ · 188-PRV-10→5838 ✓ ·
  191-PRV-13→5911 ✓ · 192-PRV-6007→3914 ✓ | all 10 docs confirmed (titled by their transliterated Basmala) | verified | N

### Duplicate OL files = ONE work-entity (collapse, multi-doc source refs) — from catalog flag O
- Petition to the Almighty (017/021), Ḥadíth on the Land of Paradise (019/020), Letter to Mírzá Ḥasan Vaqay'-Nigar (016/069), Prayer for the hajj (085/189), Du'á' li'l-Ithbát (106/107), Khuṭba al-Safra (121/122), Khuṭbiy-i-Shajaríyyih (123/142), Prayer for Laylatu'l-Qadr (064/149), Ḥamd-i-Iláhí (153/177), Fímá Faraḍa'lláh (186/190), Kitabu'l-‘Ulamá II (236/244) | each = one work, 2 doc refs | likely | N (mechanical)

---

# PART 5 — NEEDS-USER (open questions / works not findable as clean entities)

1. **Y — "Bayán" work/concept modeling (W3).** The 5-way split needs a ruling on HOW the dictionary models the work-vs-concept boundary, and how to route 1219353's 25 mentions across the 5 senses. The work senses are clear; senses (c)/(d) need concept entities created; sense (e) discarded.
2. **Y — Khaṣá'il-i-Sab‘ih Phelps code (W6).** DEEP cited BB00562; catalog.md could not re-surface it. Work itself solid (doc 5783). Confirm the BB code.
3. **Y — Khaṣá'il adhán claim (W6).** Seven-directives core verified; the "modified the call to prayer" detail unverified in-corpus — needs a primary citation.
4. **Y — Risáliy-i-Furú‘-i-‘Adlíyyih (W10), Kitáb-i-Asmá'/Summary, Risáliy-i-Fiqhíyyih:** `text_in_corpus: mentioned-only` / partial — no clean isolated full-text doc matched. Re-search by consonant-skeleton if a doc link is required. Risáliy-i-Fiqhíyyih (OoL best-known #15) has NO doc and NO clean entity found.
5. **Y — the Báb's Will and Testament (Lawḥ-i-Vaṣáyá).** NOT findable as a Báb work-entity — all "Will and Testament" entities in graph_entities are ‘Abdu'l-Bahá's (1219294, 1221110, 1232558…) or Bahá'u'lláh's (1239549). The Báb's testament (docs 15357/16925/12301 per catalog B14) has NO work-entity. Needs creation. (It nominally names Mírzá Yaḥyá → person link.)
6. **Y — fragment-identity checks before merging:** 1244758 "The Bayán" (work vs concept), 1237917/1238968 "Point of the Bayán"/"Nuqity-i-Bayan" (title-of-Báb vs work), 1239203 "Mir-panj" (Panj-Sha'n? verify), 1239355 "Hurufat-i-'Allin" (distinct Ḥurúfát work?), and which Kitáb-i-Aqdas "Most Holy Book"/annotated-edition entities are the WORK vs separate study/translation docs (B9).
7. **N→route — Ṣád-of-Ṣamad (W15)** is verified Quddús's; route to the by-other-Bábís author-cohort, out of the Báb's works. Mechanical once the cohort exists.

---

# SUMMARY — OP COUNTS BY TYPE

| TYPE | count | notes |
|---|---|---|
| MERGE | 23 | fragment-collapses (Qayyúm×6, Persian Bayán×5, Arabic Bayán×2, Dalá'il×5, Khaṣá'il×2, Va'l-‘Aṣr×3, Ḥaramayn×5, Ḥurúfát×2, Ṣád-of-Ṣamad×3, Kullu'ṭ-Ṭa‘ám×3, Hidden Words, Aqdas, Son of the Wolf, +Báb long-tail) |
| FIREWALL | 11 | commentary≠súrih (Joseph/Kawthar/Va'l-‘Aṣr); Dalá'il≠Khaṣá'il; ‘Adlíyyih root≠branches; Súriy-i-Tawḥíd≠Ṣád-of-Ṣamad; Aqdas/Lawḥ-i-Aqdas/Tablets-After; Mulúk≠Sulṭán≠Súriy-i-Sulṭán; Aḥmad Ar≠Per; Persian≠Arabic Bayán; Madínatu't-Tawḥíd≠Súriy-i-Tawḥíd |
| LINK-DOC | ~45 | every major + long-tail work tied to its confirmed corpus doc(s); all 10 flag-K; all curiosities |
| DESCRIBE | ~22 | GPB-verbatim (top tier) / Saiedi (rest) characterization + catalog_ids |
| RELATE | ~10 | part-of (Panj-Sha'n←Ḥurúfát; Qayyúm←first chapter), recipient (Vaḥíd, Kirmání, Imám-Jum‘ih), contained_by (Haykal←ruler tablets), published_in (Summons) |
| RETYPE | 2 | "Point of the Bayán" (1219534) work→title-of-the-Báb; Nubuvvat-i-Kháṣṣih concept→work (+ keep concept) |
| ATTRIBUTE-strip | 1 | Ṣád-of-Ṣamad: strip from Báb → Quddús |
| KEEP (anti-flag) | 7 | curiosity works (alchemy/tea/sun/grammar×3/letter-science) — GENUINE, never auto-flag |
| NEEDS-USER | 7 | listed Part 5 |

## KEY MERGES / SPLITS / STRIPS (headline)
- **Qayyúmu'l-Asmá'** = Commentary on the Súrih of Joseph = Aḥsanu'l-Qiṣaṣ → ONE entity (keeper 1219333); but ≠ the Qur'ánic "Súrih of Joseph" (1219338).
- **"Bayán" SPLIT** (1219353, 25 mentions): Persian Bayán [work 1219348] · Arabic Bayán [work 1219474] · Revelation-of-the-Báb [concept] · people-of-the-Bayán/Bábís [concept] · generic utterance [drop]. **"Point of the Bayán" (1219534) is the BÁB Himself, not a work — RETYPE.**
- **Dalá'il-i-Sab‘ih (Seven PROOFS) ≠ Khaṣá'il-i-Sab‘ih (Seven QUALIFICATIONS)** — firewall held; opposite ends of the timeline (Stage 3 vs Stage 1).
- **Ṣád-of-Ṣamad commentary STRIPPED from the Báb → QUDDÚS** (verified via Quddús/Ṭabarsí mention contexts); ≠ the Báb's own Súriy-i-Tawḥíd (same súrih Q.112).
- **Kitáb-i-Aqdas** confirmed NOT mis-attributed to the Báb in live data (Bahá'u'lláh's; flag G is a non-issue at the entity level).
- **Curiosity works KEPT** (alchemy elixir, white tea, sun salutation, grammar×3, letter-science) — all verified author=The Báb; genre is genuine per Saiedi 8632.

## WORKS NOT FINDABLE AS ENTITIES (NEEDS-USER)
- **The Báb's Will and Testament (Lawḥ-i-Vaṣáyá)** — no work-entity exists (only ‘Abdu'l-Bahá's/Bahá'u'lláh's). Needs creation (docs 15357/16925/12301).
- **Risáliy-i-Fiqhíyyih** (OoL best-known #15) — no doc, no clean entity.
- **Risáliy-i-Furú‘-i-‘Adlíyyih**, **Kitáb-i-Asmá'/Summary** — entities exist but full-text doc is mentioned-only/partial.
