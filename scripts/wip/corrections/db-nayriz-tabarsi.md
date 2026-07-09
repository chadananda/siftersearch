# Correction Set — Dawn-Breakers Nayríz + Shaykh Ṭabarsí Cohorts

> READ-ONLY verification. NO DB writes performed. Verified against LIVE corpus on tower-nas:
> sidecar `graph.db` (entity_mentions/entity_aliases) + sifter.db `graph_entities`, Meili `paragraphs`, and `content` paragraph text for doc_id **21308** (The Dawn-Breakers).
> Source MD: `scripts/wip/dawnbreakers-nayriz.md`, `scripts/wip/dawnbreakers-tabarsi.md`.
> Citation form: `https://oceanlibrary.com/dawn-breakers_nabil?paraId=<external_para_id>`.

## ⚠ OVERARCHING FINDING (read first — reframes the whole set)

The **live graph.db sidecar for doc 21308 contains almost NONE of the Nayríz/Ṭabarsí cast** as person entities. The MD "dump" rows (e.g. dump 513/653/1119/1236/1334/1389) are **legacy** sifter.db NER rows the state file says to RETIRE — they are NOT in the current sidecar, so they cannot be "merged/split/retyped." The current sidecar holds only a sparse handful of these figures, several of them **conflated or fragmented**.

Consequence for the correction set:
- The bulk of the Nayríz/Ṭabarsí casts are **CREATE** operations (the figure was never extracted into the live sidecar at all). These are listed compactly in §6.
- The genuinely actionable MERGE/SPLIT/RETYPE/DROP/ALIAS ops against EXISTING live entity_ids are in §1–§5 with full evidence.
- The MD's per-figure `side`/role/relationship findings remain valid as the CONTENT of the eventual CREATE records; they are not re-litigated here.
- All ops are PROPOSED. No writes were made. The sidecar write-path question (how to apply via single-writer) stays OPEN for user.

**Op counts (against existing live entities):** MERGE 5 · SPLIT 3 · RETYPE/DROP 1 · ALIAS-REMOVE 3 · FIREWALL 6 · CREATE batches 2 (Nayríz + Ṭabarsí, ~60 figures) · NEEDS-USER 7.

Live entity_ids referenced (all VERIFIED present this session):
| id | canonical_name | mentions/21308 | verified as |
|----|----------------|----|----|
| 1219861 | Vaḥíd | 66 | Vaḥíd (anchor) |
| 1219608 | Siyyid Yaḥyáy-i-Dárábí | 4 | = Vaḥíd (fragment) |
| 638311 | Siyyid Yaḥyá | 5 | = Vaḏíd (fragment) |
| 638692 | Mírzá Muḥammad-Báqir | 16 | Báqir-i-Qá'iní (Ṭabarsí lieutenant) |
| 628263 | Mullá Báqir | 9 | CONFLATION: Báqir-i-Tabrízí (LotL) + Nayríz Mullá Báqir |
| 620166 | Mullá Báqir-i-Tabrízí | 2 | Letter of the Living |
| 632382 | Mullá Mihdí | 10 | CONFLATION: ≥5 distinct Mihdís |
| 1059069 | Mírzá ‘Alí | 1 | Nayríz "‘Alíy-i-Sardár" bridging figure |
| 633192 | Sardár | 1 | bare-title artifact (NOT a person) |
| 1055802 | Siyyid Aḥmad | 6 | Siyyid Aḥmad-i-Sang-Sarí (martyr) |
| 1064476 | Mír Muḥammad-‘Alí | 2 | Sang-Sar family father (Shaykhí) |
| 1219859 | Quddús | 137 | Quddús (anchor) |
| 613760 | Quddús | 3 | = Quddús (fragment) |
| 1219598 | Prince Mihdí-Qulí Mírzá | 14 | Qájár commander (Ṭabarsí) |
| 1064471 | Mihdí-Qulí Mírzá | 1 | = Prince Mihdí-Qulí Mírzá (fragment) |
| 1219657 | Prince Ḥamzih Mírzá | 33 | DISTINCT prince (firewall) |
| 1219638 | Mírzá Aḥmad | 41 | Mírzá Aḥmad-i-Qazvíní (informant), NOT Nayríz fort-officer |

---

## §1 — MERGE (existing live entities)

**M1 · MERGE(1219861 <- [1219608, 638311])** — Vaḥíd fragments
- result: single Vaḥíd = Siyyid Yaḥyáy-i-Dárábí.
- EVIDENCE: 1219608 mentions are the Vaḥíd narrative (para_499 "He delegated Siyyid Yaḥyáy-i-Dárábí, the most learned…"; para_1445 "To destroy the life of Vaḥíd…"); 638311 is the same man's Ṭihrán/Shíráz stay + interviews with the Báb (para_500–508). All one person. The name string "Siyyid Yaḥyá" / "Siyyid Yaḥyáy-i-Dárábí" / "Vaḥíd" = identical referent.
- confidence: HIGH · NEEDS-USER: N (but Vaḥíd is the gpb-seed ANCHOR — coordinate keeper-id with that cohort).

**M2 · MERGE(1219859 <- [613760])** — Quddús fragment
- result: single Quddús (Muḥammad-‘Alíy-i-Bárfurúshí).
- EVIDENCE: 613760 "Quddús" (3 mentions, religion=Baha'i) is a stray fragment of the 137-mention 1219859 "Quddús"; identical referent, no contrary context.
- confidence: HIGH · NEEDS-USER: N.

**M3 · MERGE(1219598 <- [1064471])** — Prince Mihdí-Qulí Mírzá fragment
- result: single Prince Mihdí-Qulí Mírzá (Qájár commander at Ṭabarsí).
- EVIDENCE: 1064471 "Mihdí-Qulí Mírzá" (1) is the bare-name form of 1219598 "Prince Mihdí-Qulí Mírzá" (14); same commander, same Ṭabarsí campaign context.
- confidence: HIGH · NEEDS-USER: N.
- ⚠ FIREWALL F-MQ (below): keep DISTINCT from 1219657 Prince Ḥamzih Mírzá.

**M4 · MERGE(new "Mírzá Ḥusayn-i-Mutavallíy-i-Qumí" <- ["Siyyid-i-Qumí" surface])** — the Ṭabarsí BETRAYER (special-care figure)
- result: ONE opponent entity spanning fort → Bárfurúsh; aliases: Mírzá Ḥusayn-i-Mutavallí · Siyyid Mírzá Ḥusayn-i-Mutavallí · Siyyid-i-Qumí · "a siyyid from Qum".
- ⚠ NOTE: NEITHER surface exists as a live sidecar entity — the betrayer was never extracted. So this is functionally **CREATE + bind-all-mentions**, not a merge of two existing ids. Recorded here because the MD framed it as a merge.
- EVIDENCE (full cross-location chain, all doc 21308, READ verbatim):
  - para_1075 (`?paraId=para_1075`, content 21054481): *"The very night Quddús had given this warning, a siyyid from Qum, Mírzá Ḥusayn-i-Mutavallí, was moved to betray his companions. 'Why is it,' he wrote to ‘Abbás-Qulí Ḵhán-i-Láríjání, 'that you have left unfinished the work…'"* → instigates the renewed attack after Mullá Ḥusayn's death.
  - para_1107 (`?paraId=para_1107`, 21054501): *"Siyyid Mírzá Ḥusayn-i-Mutavallí, accompanied by his servant, left the fort and went directly to join the prince in his camp."* → desertion.
  - para_1140 (`?paraId=para_1140`, 21054528): *"In his hour of agony, the Siyyid-i-Qumí, who had so treacherously deserted the fort, was seen passing by his side. Observing his helplessness, he smote him in the face."* → reappears at Bárfurúsh during Quddús's martyrdom.
- reasoning: "Siyyid-i-Qumí" in para_1140 is back-referenced explicitly to the deserter — same man. The three loci (fort betrayal → desertion to prince's camp → Bárfurúsh face-smiting) are ONE person's role-arc. The MD's MERGE is CONFIRMED CORRECT.
- side: **opponent** (a Bábí who lost faith / turned betrayer — final-allegiance rule).
- confidence: HIGH · NEEDS-USER: N (identity certain). The "loses faith and reappears" framing in the task = exactly this chain.

**M5 · MERGE(1219638 keep, but DO NOT absorb the Nayríz fort-officer "Mírzá Aḥmad")** — anti-merge guard
- result: 1219638 "Mírzá Aḥmad" (41) = **Mírzá Aḥmad-i-Qazvíní** (Nabíl's informant/martyr, para_233 "Mírzá Aḥmad-i-Qazvíní, the martyr, who on several occasions had heard Mullá Ḥusayn…"). The Nayríz fort-officer "Mírzá Aḥmad" (Chinár mill-tower, Sardár's uncle, DB 21054656) is a DIFFERENT man and must NOT be folded into 1219638.
- EVIDENCE: 1219638's mentions cluster on the Qazvíní informant + general narrative; no Nayríz-fort context. The Nayríz fort-officer is not separately extracted (→ CREATE, §6).
- confidence: HIGH · NEEDS-USER: N. (recorded as FIREWALL F-AH too.)

---

## §2 — SPLIT (existing conflated live entities)

**S1 · SPLIT(628263 "Mullá Báqir" -> [merge LotL mentions into 620166 ; CREATE "Mullá Báqir-i-Nayrízí (Imám of Chinár-Súkhtih)"])**
- result: 628263's 9 mentions are TWO people. (a) Letter-of-the-Living mentions → MERGE into existing **620166 Mullá Báqir-i-Tabrízí**. (b) Nayríz local-Imám mentions → new Nayríz entity.
- EVIDENCE (READ verbatim, doc 21308):
  - LotL set: para_808 (`?paraId=para_808`) *"I despatched Mullá Báqir, one of the Letters of the Living…"*; para_1045 *"I am only a groom of Bahá'u'lláh…on my way to Mas̱hhad…"*; para_1549/1550 — carries the Báb's documents from Chihríq → Qazvín → Qum. = **Mullá Báqir-i-Tabrízí, Letter of the Living** (620166).
  - Nayríz set: para_1473 (`?paraId=para_1473`) Vaḥíd at Rúníz/Fasá, Chinár-Súkhtih population pours out; para_1497/1499 *"Mullá Báqir dismounted near one of these tents… Ḥájí Siyyid Ismá‘íl, the S̱hayḵhu'l-Islám of Bavánát, arrived"*; para_1526 the Nayríz fort fighting. = the **Nayríz Mullá Báqir** (Imám of Chinár-Súkhtih, MD's local figure).
- reasoning: salience/recency firewall — the bare "Mullá Báqir" resolves to TWO distinct referents by surrounding context (LotL-document-courier vs Nayríz-fort Imám). Confirmed by reading the mentions. Matches both source MDs.
- confidence: HIGH · NEEDS-USER: Y (the per-mention re-assignment of 628263's 9 rows is a content edit; user should confirm the split boundary before any write).
- ⚠ FIREWALL: neither = 638692 Báqir-i-Qá'iní (Ṭabarsí) nor Báqir-i-Bushrú'í.

**S2 · SPLIT(632382 "Mullá Mihdí" -> [≥5 by nisba])**
- result: 632382 (10 mentions, alias-set spanning ≥5 people) must be split. The aliases on this single entity: *Mullá Mihdíy-i-Ḵhu'í · Mullá Mihdíy-i-Kandí · Mulla Mihdiy-i-Astirabadi · Ḥájí Mullá Mihdíy-i-'Atri (‘Aṭṭár) · Ḥájí Mullá Mihdí · Mullá Mihdí*.
- EVIDENCE: distinct mention contexts — para_653/708 are the Báb's Kinár-Gird/Máh-Kú journey (a different Mihdí); para_988–1107 are the **Ṭabarsí Mullá Mihdíy-i-Kandí** (the Kand messenger who conveyed the prince's message — para_1107 "Mullá Mihdí conveyed the prince's message"); other paras carry other contexts. The Khu'í alias points to the Letter of the Living **Mullá Mihdíy-i-Khu'í** (a 19th distinct figure entirely).
- reasoning: a bare given name "Mihdí" pulled multiple nisbas into one node. Needs per-mention nisba resolution. The Ṭabarsí cohort needs ONLY the Kandí messenger separated out (MD's "Mullá Mihdíy-i-Kandí + infant son Mullá Báqir-i-Kandí").
- confidence: MEDIUM (split is certain; exact per-mention boundaries need a read pass) · NEEDS-USER: Y.

**S3 · SPLIT/anti-conflation note(1059069 "Mírzá ‘Alí")** — the Nayríz Sardár vs the alias "Mírzá ‘Alíy-i-Tabrízí"
- result: 1059069's sole 21308 mention (para_1907) IS the Nayríz bridging figure ‘Alíy-i-Sardár — but it carries a suspect alias **"Mírzá ‘Alíy-i-Tabrízí"** which is a DIFFERENT man. Keep 1059069 = Nayríz ‘Alíy-i-Sardár; strip the Tabrízí alias (see A2).
- EVIDENCE: para_1907 (`?paraId=para_1907`, content 21054955): *"a young man named Mírzá ‘Alí, whose exceptional courage had earned for him the surname of ‘Alíy-i-Sardár, distinguished himself by the extreme solicitude he extended to the survivors of the struggle which ended with the death of Vaḥíd…"* — Nayríz aftermath, post-1850. The 1853-upheaval-leader carry-forward (Ahdieh) makes this the bridging figure = ONE entity 1850→1853.
- confidence: HIGH (identity) · NEEDS-USER: N for the identity; alias strip is A2.

---

## §3 — RETYPE / DROP

**D1 · DROP/RETYPE(633192 "Sardár")** — bare-title artifact, NOT a person
- result: 633192 "Sardár" (1 mention) is NOT a person entity — it is a stray military-title extraction. RETYPE to `title` or DROP from the person layer.
- EVIDENCE: its sole mention para_1779 (`?paraId=para_1779`, content 21054853) is a Bahá'u'lláh→Ṭabarsí passage (*"At a time when the forces of Prince Mihdí-Qulí Mírzá had besieged the fort of Ṭabarsí, We resolved to depart from Núr…"*) where "Sardár" appears only as a generic rank — not a named individual. NOT the Nayríz ‘Alíy-i-Sardár (that is 1059069), NOT Riḍá Khán-i-Sardár.
- reasoning: SKILL "generic title ≠ person" rule. confidence: HIGH · NEEDS-USER: N.

---

## §4 — ALIAS-REMOVE (bad aliases on existing entities)

**A1 · ALIAS-REMOVE(638692 -/- "Mírzá Muḥammad-Báqir-i-Afnán")**
- result: strip the "…-i-Afnán" alias from 638692 (Báqir-i-Qá'iní, Ṭabarsí lieutenant). The Afnán are the Báb's maternal kin — a different family entirely; not the Qá'in→Mashhad builder of the Bábíyyih.
- EVIDENCE: 638692's mentions (para_978 "who had built the Bábíyyih"; para_1068/1080/1094/1100/1118 fort sorties) are uniformly the Ṭabarsí Qá'iní lieutenant; nothing Afnán. confidence: HIGH · NEEDS-USER: N.
- (KEEP aliases "Mírzá Muḥammad-Báqir-i-Qá'iní", "…Khurásániy-i-Qá'iní" — correct.)

**A2 · ALIAS-REMOVE(1059069 -/- "Mírzá ‘Alíy-i-Tabrízí")**
- result: strip "Mírzá ‘Alíy-i-Tabrízí" from the Nayríz ‘Alíy-i-Sardár entity (1059069). A Tabrízí ‘Alí is a different man; the single live mention is purely Nayríz.
- EVIDENCE: para_1907 is Nayríz-only; no Tabríz context. confidence: MEDIUM · NEEDS-USER: Y (confirm no Tabrízí-‘Alí mention was meant to land here).

**A3 · ALIAS-REVIEW(632382)** — bundled with S2: the Khu'í/Astirabadi/‘Aṭṭár/Kandí aliases must follow their split-out entities, not stay on a single node. (No standalone op; resolved by S2.)

---

## §5 — FIREWALLS (keep-distinct, verified)

**F-MQ · 1219598 Prince Mihdí-Qulí Mírzá ≠ 1219657 Prince Ḥamzih Mírzá** — two distinct Qájár princes both heavily mentioned (14 vs 33). Mihdí-Qulí = the Ṭabarsí commander (Qur'án-oath truce-betrayal); Ḥamzih Mírzá = separate. Also ≠ Fírúz Mírzá (1219612, Nayríz/Shíráz gov.) and ≠ Muḥammad-‘Alí Mírzá. confidence: HIGH.

**F-BAQIR · The three+ Báqirs stay distinct:** 638692 Báqir-i-Qá'iní (Ṭabarsí lieutenant) ≠ 620166 Báqir-i-Tabrízí (Letter of the Living) ≠ the Nayríz Mullá Báqir (S1 new) ≠ Báqir-i-Bushrú'í (Mullá Ḥusayn's nephew, →CREATE) ≠ 872491 "Muḥammad-Báqir" / 620314 "Mírzá Báqir" / 1056112 "Haji Siyyid Muhammad-Baqir" (separate nodes, out-of-cohort). VERIFIED by reading 638692 + 628263 mention contexts. confidence: HIGH.

**F-LARIJANI · ‘Abbás-Qulí Khán-i-Láríjání (opponent, killed Mullá Ḥusayn) ≠ the Nayríz ‘Abbás-Qulí Khán** (suggested dragging Vaḥíd by his turban, DB 21054677). Two namesakes; pin by Láríjání + the killing-bullet vs Nayríz-local. ⚠ NEITHER is currently a live sidecar entity (→CREATE). Para_1075 names "‘Abbás-Qulí Ḵhán-i-Láríjání" verbatim. confidence: HIGH.

**F-AH · 1219638 Mírzá Aḥmad-i-Qazvíní (informant/martyr) ≠ Nayríz fort-officer "Mírzá Aḥmad" (Sardár's uncle, Chinár mill-tower)** — see M5. confidence: HIGH.

**F-SANGSAR · Siyyid Aḥmad-i-Sang-Sarí (1055802, MARTYRED) ≠ his survivor brothers** Siyyid Abú-Ṭálib & Siyyid Muḥammad-Riḍá, AND ≠ Shaykh Aḥmad-i-Aḥsá'í (the namesake hero his father foretold). 1055802 para_1126–1130 confirms Siyyid Aḥmad was the martyr cut to pieces by Mírzá Muḥammad-Taqí + 7 ‘ulamás of Sárí (MD's "corrected: martyred, not survived" — CONFIRMED). The Sang-Sar Abú-Ṭálib (martyr-roster #) ≠ the historian Siyyid Abú-Ṭálib-i-Shahmírzádí. confidence: HIGH for Siyyid Aḥmad; the Abú-Ṭálib tangle = NEEDS-USER (see below).

**F-SARDAR · "Sardár" is a TITLE, recurring across distinct men:** Nayríz Mírzá ‘Alí "‘Alíy-i-Sardár" (1059069) ≠ Riḍá Khán-i-Sardár (Ṭabarsí Qájár officer who crossed sides) ≠ ‘Azíz Khán-i-Sardár ≠ Mír Riḍáy-i-Sardár ≠ the bare-title node 633192. confidence: HIGH.

---

## §6 — CREATE (figures absent from the live 21308 sidecar)

These cohort figures were NOT extracted into graph.db for 21308 at all (verified: no entity_id with 21308 mentions). They exist in the source MDs as verified findings and must be CREATED. Light records unless GPB-characterized. All citations are doc 21308 unless noted. (`para_NNNN` forms from the MD source; spot-verified where load-bearing.)

### Nayríz cohort (1850 first upheaval — pin to 1850, never 1853/1909 namesakes)
- **Zaynu'l-‘Ábidín Khán** · opponent · gov. of Nayríz, GPB "base and fanatical" (GPB 21310 ¶ "storm-center" passage); 1850 persecutor; killed 1853. [GPB descriptor authoritative]
- **‘Abdu'lláh Khán, Shujá‘u'l-Mulk** · opponent · commander (DB para_660). GPB-named.
- **Prince Fírúz Mírzá** (Nuṣratu'd-Dawlih) — NOTE: 1219612 "Prince Fírúz Mírzá" (2 mentions) EXISTS; this is a CONFIRM not a CREATE. opponent, gov. of Shíráz, ordered fort extermination.
- **Mírzá ‘Alí "‘Alíy-i-Sardár"** — = existing 1059069 (do NOT create; see S3/A2). bridging 1850→1853.
- Zaynu'l-‘Ábidín cluster (CREATE, all distinct — F-cluster): ‘Alí-Aṣghar Khán (elder brother, opponent) · Áqá Khán (nephew, opponent) · **Mírzá Muḥammad-Ja‘far** (Bábí, the governor's cousin & fort chronicler — DB para_656 "cousin of Zaynu'l-‘Ábidín Ḵhán, the chronicler") · Mullá Zaynu'l-‘Ábidín-i-Shahmírzádí (opponent, govt counsellor — NB also appears in Ṭabarsí para_1128) · Mullá Zaynu'l-‘Ábidín-i-Yazdí (Bábí martyr, Yazd) · Ḥájí Zaynu'l-‘Ábidín (Bábí, Kinár-Gird — OUT-OF-COHORT, see NEEDS-USER).
- **Mírzá Na‘ím** · opponent · the 1853 avenger ("residing in Shíráz", DB para_956). [NEEDS-USER #N1]
- Vaḥíd's circle (Bábí, CREATE): Ḥájí Shaykh ‘Abdu'l-‘Alí (father-in-law, DB para_683) · wife of Vaḥíd · sons Siyyid Ismá‘íl, Siyyid ‘Alí-Muḥammad, Siyyid Mihdí · Vaḥíd's brother · Shaykh Hádí b. Shaykh Muḥsin (DB para_649) · Mullá Muḥammad-Riḍáy-i-Manshádí "Raḍa'r-Rúḥ" (DB para_848).
- Fort officers (Bábí, DB para_656): Karbilá'í Mírzá Muḥammad (gatekeeper) · Shaykh Yúsuf (funds — NB 1220488 "Shaykh Yúsuf" 1 mention may be this man, CONFIRM) · Karbilá'í Muḥammad b. Shamsu'd-Dín · **Mírzá Aḥmad** (Chinár mill-tower, Sardár's uncle — F-AH, distinct from 1219638) · Shaykháy-i-Shívih-Kash · Mírzá Faḍlu'lláh · Mashhadí Taqí-Baqqál · Ḥájí Muḥammad-Taqí (registrar).
- Others (Bábí): Mírzá Ḥusayn-i-Quṭb · Mírzá Nawrá/Mírzá ‘Alí-Riḍá · Ghulám-Riḍá & Ghulám-Riḍáy-i-Kúchik · Ḥasan (servant) · Mullá ‘Alíy-i-Mudhahhib · Ḥájí Siyyid ‘Ábid · Mullá Ḥusayn (Nayríz companion, ⚠ NOT Bushrú'í).
- Opponent pair at the Masjid: Mullá Ḥasan (opponent, officer) + Mullá Muḥammad-‘Alí (opponent, his father). ⚠ NOT Ḥujjat/Quddús/the betrayer.
- Opponents/officers (1850): Muḥammad-‘Alí Khán (commander) · **‘Abbás-Qulí Khán** (Nayríz-local, suggested dragging Vaḥíd by turban — F-LARIJANI, distinct from the Ṭabarsí Láríjání) · Vísbaklaríyyih tribe (opponent collective).
- **Mullá Báqir-i-Nayrízí** (Imám of Chinár-Súkhtih) — see S1 (split-out of 628263).
- **Ḥájí Siyyid Ismá‘íl-i-Bavánátí**, Shaykhu'l-Islám of Bavánát · Bábí (DB para_658; CONFIRMED in para_1499 context). One Bábí entity (MD's dump "opponent" dup is a legacy NER mislabel, not a live entity).
- Martyrs (Bábí, Khájih 1850, light): Táju'd-Dín · Zayníl b. Iskandar · Mírzá Abu'l-Qásim (DB para_653 — the THREE who fell in the sortie). Aftermath/tortured (DB para_683): Ḥájí Muḥammad-Taqí · Siyyid Ja‘far · Siyyid Ḥusayn. Venerable: Mullá ‘Abdu'l-Ḥusayn ("man of eighty"). [extended 9-name list = NEEDS-USER #N5]
- Sources (Bábí record-keepers): Mullá Shafí‘ / Mírzá Shafí‘-i-Nayrízí (DB para_848/957) · Mírzá Muḥammad-Ja‘far (cluster).

### Shaykh Ṭabarsí cohort
- **Mullá Ḥusayn-i-Bushrú'í** (Bábu'l-Báb) — = existing **1219326** (196). CONFIRM, not create. Black Standard, 202 disciples, killed 9 Rabí‘u'l-Avval 1265 by ‘Abbás-Qulí Khán-i-Láríjání's bullet.
- **Quddús** — = existing 1219859 (after M2 merge). CONFIRM.
- **Mírzá Muḥammad-Báqir-i-Qá'iní** — = existing **638692** (16). CONFIRM. "Chief lieutenant" not "leader" (Quddús led) — para_978 "who had built the Bábíyyih"; led the sorties (para_1080/1094/1100) under Quddús's authority (para_1118 "with the consent of Quddús"). [post-death organizing role = NEEDS-USER #N4]
- CREATE (Bábí Ṭabarsí martyrs/cast): Muḥammad-Báqir-i-Bushrú'í (Mullá Ḥusayn's nephew, aka "Mullá Báqir") · Muḥammad-Ḥasan-i-Bushrú'í (Mullá Ḥusayn's brother) · **Siyyid Aḥmad-i-Sang-Sarí** = existing **1055802** (CONFIRM, MARTYR — F-SANGSAR) · Siyyid Abú-Ṭálib-i-Sang-Sarí (survivor/chronicler) · Siyyid Muḥammad-Riḍá (survivor) · **Mír Muḥammad-‘Alí** = existing **1064476** (Sang-Sar father, Shaykhí — CONFIRM).
- THE 18 SANG-SAR MARTYRS (DB §20.102, #46–63; oceanlibrary /link/SJcVd ephemeral — cite by paraId): Siyyid Aḥmad (#46=1055802) · Mír Abu'l-Qásim (#47, brother, "died the night Mullá Ḥusayn fell") · Mír Mihdí (#48, uncle) · Mír Ibráhím (#49, brother-in-law) · Ṣafar-‘Alí (#50) · Muḥammad-‘Alí (#51) · Abu'l-Qásim (#52, ≠#47) · Karbilá'í Ibráhím (#53) · ‘Alí-Aḥmad (#54, ≠#46) · Mullá ‘Alí-Akbar (#55) · Mullá Ḥusayn-‘Alí (#56) · ‘Abbás-‘Alí (#57) · Ḥusayn-‘Alí (#58) · Mullá ‘Alí-Aṣghar (#59) · Karbilá'í Ismá‘íl (#60) · ‘Alí Khán (#61, Sang-Sar martyr ≠ any opponent Khan) · Muḥammad-Ibráhím (#62) · ‘Abdu'l-‘Aẓím (#63). [all Bábí, light; #46–63 verified present at 1055802's para_1126–1130 cluster] [Abú-Ṭálib tangle = NEEDS-USER #N3]
- More Bábí Ṭabarsí: Ḥájí Náṣir-i-Qazvíní (Ḥájí Naṣíru'd-Dín; eyewitness of Rabbani 11561; appears as "Ḥájí Naṣíru'd-Dín-i-Qazvíní" in para_1086) · Siyyid Riḍáy-i-Khurásání (Quddús's envoy) · Rasúl-i-Bahnimírí (truce-victim; para_1107 verbatim) · **Mullá Mihdíy-i-Kandí** + infant son Mullá Báqir-i-Kandí (split-out of 632382, see S2) · Qambar-‘Alí · Ḥasan (servant) · Qulí (wounded rider, ⚠ NOT the Khán; NB 1064469 "Qulí" 2 mentions may be this — CONFIRM) · Mullá ‘Ísá of Míyámay · Mullá Riḍáy-i-Sháh · **Riḍá Khán-i-Sardár** (Qájár officer who crossed sides → martyr; F-SARDAR) · Mírzá Muḥammad-i-Mázindarání (survivor; NB 1055378 exists, 1 mention — CONFIRM) · Muḥammad-Riḍá (survivor; NB 978802 exists).
- Letters of the Living confirmed in Ṭabarsí roster: Mullá Yúsuf-i-Ardibílí (NB 1227583 "Mulla Yusuf-i-Ardibili" 6, 1062171 "Mullá Yúsuf" 2 — likely SAME, MERGE-candidate, CONFIRM) · Mullá Maḥmúd-i-Khu'í (NB 1219450 "Ḥájí Mullá Maḥmúd" 2 — CONFIRM) · Mullá Jalíl-i-Urúmí (NB 628249 "Mullá Jalíl-i-Urúmí" 2) · Mullá Aḥmad-i-Ibdál-i-Marághi'í · Mírzá Muḥammad-‘Alíy-i-Qazvíní.
- OPPONENTS (CREATE): **‘Abbás-Qulí Khán-i-Láríjání** (opponent — GPB-fix from {other}; "whose bullet was responsible for the death of Mullá Ḥusayn" GPB 21310; preserve GPB awed-testimony nuance in descriptor; F-LARIJANI) · **Sa‘ídu'l-‘Ulamá'** (opponent, Bárfurúsh divine — NOT extracted; ≠ 1227865 "Sa‘íd-i-Hindí") · Khusraw-i-Qádí-Kalá'í · Zakaríyyáy-i-Qádí-Kalá'í · ‘Abdu'lláh Khán-i-Turkamán (other/govt) · Ḥájí Muṣṭafá Khán-i-Turkamán (other) · Karbilá'í ‘Alí-Ján (other, kad-khudá) · Mullá Muḥammad-i-Ḥamzih (other, anti-violence moderate — NEEDS-USER #N6).
- Mírzá Ḥusayn-i-Mutavallíy-i-Qumí (BETRAYER) — see M4 (CREATE + bind all 3 mentions).
- Ámul cast (tag to Ámul incident, adjacent locus): Governor of Ámul (opponent) · Acting governor (other) · mujtahid/Siyyids of Ámul (opponents/titles — apply title rule).
- Shaykh Ṭabarsí (the medieval traditionist) · place-namesake, NOT a participant — note as `person` (historical) distinct from the place 1219633 "Ṭabarsí" (43) and event nodes 1219827/1219835/1219847.
- Historians (Bábí, non-combatant): Siyyid Abú-Ṭálib-i-Shahmírzádí (account of the struggle; ≠ Sang-Sar Abú-Ṭálibs) · Mírzá Ḥaydar-‘Alíy-i-Ardistání.

---

## §7 — ATTRIBUTE / RELATE (carry into CREATE records)
- ATTRIBUTE: GPB 21310 fixes opponent descriptors — Zaynu'l-‘Ábidín Khán "base and fanatical"; ‘Abbás-Qulí Khán-i-Láríjání = the bullet that killed Mullá Ḥusayn. These GPB characterizations are PRIMARY (SKILL: GPB outranks Nabíl).
- RELATE (Nayríz): Vaḥíd —father-in-law→ Ḥájí Shaykh ‘Abdu'l-‘Alí; Vaḥíd —sons→ Siyyid Ismá‘íl/‘Alí-Muḥammad/Mihdí; Zaynu'l-‘Ábidín Khán —cousin→ Mírzá Muḥammad-Ja‘far (Bábí, kinship-across-divide); Mírzá ‘Alí "Sardár" —uncle→ Mírzá Aḥmad (mill-tower officer).
- RELATE (Ṭabarsí): Mullá Ḥusayn —nephew→ Muḥammad-Báqir-i-Bushrú'í; —brother→ Muḥammad-Ḥasan-i-Bushrú'í; Quddús —chief lieutenant→ Báqir-i-Qá'iní (638692); Mír Muḥammad-‘Alí (1064476) —son→ Siyyid Aḥmad (1055802, martyr) + Mír Abu'l-Qásim + survivors Abú-Ṭálib & Muḥammad-Riḍá; —uncle→ Mír Mihdí; —brother-in-law→ Mír Ibráhím.

---

## §8 — NEEDS-USER (ambiguous, decision required)
- **#N1 Mírzá Na‘ím — one entity or two?** DB = 1853 avenger ("residing in Shíráz", para_956). Rabbani 16552 = "Mírzá Na‘ím Lashkar-Nivís, gov. of Nayríz" in 1909-era material AND the official who passed the governorship TO Zaynu'l-‘Ábidín Khán (predates the governor). One long-career man across ~1850s–1900s, or two namesakes ~50 yrs apart? DB cohort needs only the 1853 avenger. **MERGE with the 1909 Na‘ím, or keep separate?**
- **#N2 "Mírzá Abu'l-Qásim" (Khájih martyr, para_653)** — no nisba; many Abu'l-Qásims in corpus (note live nodes 1064513, 1142657, 1015616 "Abu'l-Qásim"). Confirm he stays his own light Nayríz-martyr entity, not folded into a famous bearer (e.g. Imám-Jum‘ih of Ṭihrán 1228027).
- **#N3 Sang-Sar Abú-Ṭálib tangle** — overlapping: Siyyid Abú-Ṭálib-i-Sang-Sarí (survivor/chronicler, para_1326) vs Mír Abu'l-Qásim (#47, brother, martyred "the night Mullá Ḥusayn fell") vs bare "Siyyid Abú-Ṭálib" vs the historian Siyyid Abú-Ṭálib-i-Shahmírzádí vs the Nayríz dump "Mírzá Abú-Ṭálib." Also note 1219816 "Mírzá Abú-Ṭálib Khán" (3) — distinct. Which bare-names collapse into which nisba'd figure? User knows the Sang-Sar roster.
- **#N4 Báqir-i-Qá'iní (638692) role** — I set "chief lieutenant" (Quddús led; para_1118 "with the consent of Quddús"). After Mullá Ḥusayn's death, is his sortie-leadership worth a "co-leadership"/field-commander note, or leave as lieutenant?
- **#N5 Extended Khájih martyr list (9 bare names: Mullá Ismá‘íl-i-Muḥallatí, Áqá ‘Abdu'l-‘Alí, Mullá Rajab-‘Alí, Karbilá'í Ṣádiq-i-Shírází, Mírzá ‘Alí-Akbar, Mullá Muḥammad-Báqir, Mullá Ḥusayn-i-Sabzih-Mahdání, Mullá Ja‘far, Mullá Riḍá)** — DB main says only THREE died in the Khájih sortie (para_653). Keep these 9 as Khájih-sortie martyrs, reassign to the general Nayríz massacre, or treat as footnote (doc 40108) provenance / a different phase?
- **#N6 Mullá Muḥammad-i-Ḥamzih** (other, anti-violence Bárfurúsh ‘ulamá) vs the MD dump's "Ḥájí Mullá Muḥammad-i-Ḥamzih" {Bábí} — same man mis-tagged, or two? (Neither is a live sidecar entity; resolve before CREATE.) ⚠ ALSO firewall from 1219657 Prince Ḥamzih Mírzá and event nodes — "Ḥamzih" is reused.
- **#N7 628263 split boundary (S1)** — per-mention re-assignment of the 9 mentions between 620166 (LotL) and the new Nayríz Mullá Báqir is a content edit; confirm the boundary (LotL: para_808/1045/1549/1550; Nayríz: para_1473/1497/1499/1526) before any write.

## FYI (no action, firewalled out of this cohort)
- "Mihdí, son of Ḥujjat" = Zanján cohort (other agent).
- Mullá Báqir-i-Tabrízí / Báqir-i-Bushrú'í split detail also touches the Zanján/Báb-arc cohort — coordinate keeper-ids on merge.

---
*Verification method: doc 21308 sidecar roster (graph.db entity_mentions JOIN content) + Meili `paragraphs` discovery + sqlite SELECT of paragraph text (read-only). NO INSERT/UPDATE/DELETE. NO files on tower-nas. All entity_ids above were observed live this session.*
