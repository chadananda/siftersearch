# OVERNIGHT AUTONOMOUS PLAN — 2026-06-16 → morning

> User went to sleep. Mandate: **(A)** finish content import → **(B)** extract entities from new content → **(C)** research+verify EVERY entity in GPB (21310) + Dawn-Breakers (21308) to a solid foundation. Proceed without the user until morning. Compact freely; THIS FILE + REVIEW-LEDGER.md are the state.

## ☀️ GOOD MORNING — SUMMARY OF OVERNIGHT WORK
**A. CONTENT IMPORT — ✅ DONE + VERIFIED.** Final dry-run: **0 missing paragraphs**, all 138 partial OceanLibrary docs fully backfilled — footnotes, list items, and the previously-dropped martyr rolls (incl. the 18 Sang-Sar martyrs that started all this). OL content grew ~237K → ~298K (+~61K paras). Fixes deployed: adapter (keeps lists/footnotes/all content) + single-writer Buffer-bind fix. The 289 EMPTY docs + ~553 oversized (>6000-char) paragraphs are DEFERRED (need segmentation first — your Phase-2 point).

**B. ENTITY EXTRACTION — ⛔ STALLED, needs your hand.** The graph-extractor is online but IDLE (0.3% CPU); its log: *"Tier boundary — waiting for resolver/promoter to catch up… No work — sleeping."* Backlog `graph_enriched=0` = 4.5M, NOT draining (only 36K ever extracted). Root cause: the **graph-promoter is stuck** (PM2 status `waiting restart`, 8 restarts, empty error log) → the priority-tier gate never releases → extractor sleeps. So the NEW content (incl. Dawn-Breakers' 871 new paras: 1211/2082 extracted, the new footnotes/martyrs NOT yet) is not being extracted. DeepSeek key IS set, budget $420. **ACTION FOR YOU: get the graph-promoter healthy (boss-vLLM? restart? debug) — then the extractor drains and the new content extracts.** Also extract-v2 (task #9) still needed to CREATE entities for figures the v1 NER missed. Embeddings ARE backfilling (writer fix worked).

**C. ENTITY RESEARCH — ~40 entity-clusters deeply verified** (read-only; full records in `verify/*.md`, NO DB writes). Covered: central figures (Báb 1219258, Bahá'u'lláh 1227553, ‘Abdu'l-Bahá 614731, Mullá Ḥusayn 1219326, Quddús 1219859, Ṭáhirih 1219340, Vaḥíd 651297, Ḥujjat 1219480, Mírzá Yaḥyá/Azal 620167, Nabíl 1220249); works (Aqdas/Íqán/Bayán/Qur'án/Revelation); events (Ṭabarsí/Badasht/Naw-Rúz/Nayríz/Zanján — split place/event); cross-tradition Manifestations + Imáms; rulers + places; the 18 Letters of the Living; the Báb's family; the Seven Martyrs of Ṭihrán; Preface informants; the Sang-Sar + Mázindarán martyr rolls; Ṭabarsí/Nayríz/Zanján antagonists. Confirmed your hunch: Ṭabarsí Mullá-Ḥusayn-killer (‘Abbás-Qulí Khán 1219600) ≠ Nayríz Vaḥíd-killer (Mihr-‘Alí Khán 1219848).

**⚠ DECISIONS I NEED FROM YOU (nothing applied — all read-only pending these):**
1. **The entity write-path (D-G)** — approve HOW to apply the ~40 clusters' merge/split/create/firewall ops to graph.db + graph_entities (via single-writer). Until then it's all proposals in `verify/*.md`.
2. **extract-v2 (task #9)** — many figures (Sang-Sar 18, Mázindarán rolls, half the Letters of the Living, the Seven Martyrs) have NO graph entity; they need extraction to be CREATED, not just merged.
3. **Concept-modeling policy** — "Revelation" & "Bayán" (concept vs work; split by dispensation?). Place-vs-event for Ṭabarsí/Nayríz/Zanján. followers-of-the-Báb (org vs drop).
4. **Phase 2 (deferred):** 289 empty docs + ~553 oversized paragraphs need segmentation before they ingest/embed.

**🔧 STRUCTURAL FINDINGS (important):** (a) `graph_entities.mention_count` column is STALE/wrong corpus-wide — always count `entity_mentions`. (b) Massive fragmentation — major figures have thousands of glyph/diacritic/spelling fragments (straight-vs-curly apostrophe a root cause); needs an AI-assisted consolidation sweep. (c) Auto-NER mis-binds (Pahlavi/SAVAK mentions under "Sháh"; "the Prophet" mixing Bahá'u'lláh + a Native-American prophet; Jesus tagged Baha'i) — verify before any bulk merge.

## ▶▶ RESUME HERE (read after any compaction)
1. Read this file (phase statuses + NEXT ACTION below).
2. Read `.claude/skills/entity-research/SKILL.md` (the method) + `REVIEW-LEDGER.md` (entity-march state) for Phase C.
3. Continue from **◀ NEXT ACTION**.

**◀ NEXT ACTION:** **Phase A DONE+verified (0 missing). Phase C FOUNDATION COMPLETE (~58 entity-clusters / 9 batches; records in verify/*.md).** Phase B STALLED (promoter stuck → extractor tier-gated; see top — USER must fix). MODE = LIGHT MONITORING: on each wake, (1) check if the promoter recovered → extraction draining graph_enriched=0; (2) check embedding backlog draining; (3) optionally pick a few deep-long-tail figures IF they have live entities (most don't — need extract-v2 first). DO NOT keep burning heavy 6-agent batches — the foundation is done and remaining blockers are USER decisions (write-path D-G / promoter / extract-v2 / concept+place modeling). When the user returns: walk them through the morning summary (top) + the 4 decisions.

## HARD CONSTRAINTS (unchanged)
- tower-nas writes ONLY via the approved patch (`scripts/patch-ol-missing-paragraphs.mjs`, routed through single-writer :7849 with `SIFTER_WRITER_URL`). Everything else READ-ONLY.
- NO entity-correction DB writes (write-path D-G NOT approved) — Phase C produces worked records/correction files ONLY.
- Deploy via git push (`--no-verify`, backend-only) → updater pulls ~5min. Bump version (minor) per code change.
- Single-writer = NO lock contention; 100% CPU = ONE of 80 cores (normal). Don't fight the architecture; let it drain its queue.
- Killing my OWN runaway script on tower-nas is OK (user authorized + sudo); never touch prod processes otherwise.

## PHASE A — finish content import  [IN PROGRESS]
- The OceanLibrary list/footnote drop fix is deployed (adapter + writer Buffer-revive). Patch backfills the 138 PARTIAL docs (have live content, missing list/footnote siblings) via insert-only (NULL embeddings → embedding-worker backfills; sync-worker → Meili). ~62,861 paras target.
- Done so far: all Bahá'í docs (Dawn-Breakers 18 martyrs + Aqdas 209 footnotes etc.) verified in run 1; resume run `bin7c046w` ~80% (OL content ~287,299 / start 237,010).
- TODO: finish run → re-run to mop up (Book of Mormon `fetch failed`) → confirm dry-run shows 0 missing for partial docs.
- The 289 EMPTY docs + ~553 oversized (>6000ch) paras are DEFERRED Phase-2 (unsegmented mega-paragraphs; need segmentation before embed). Do NOT patch empty docs.

## PHASE B — entity extraction on new content  [AUTOMATED — monitor]
- graph-extractor (PM2) processes `content WHERE graph_enriched=0`; new inserted rows qualify → auto-extracted → resolver writes entity_mentions (graph.db sidecar). extractor/resolver/validator online; promoter waiting-restart (watch; may be boss-vLLM-down per memory).
- TODO: periodically confirm graph_enriched=0 backlog drains; flag if extractor stalls/crashes. No manual writes needed.

## PHASE C — research & verify EVERY entity (GPB + DB)  [the long pole]
- Resume the REVIEW-LEDGER.md march. Method = entity-research SKILL (cross-corpus cumulative; SPLIT bears burden of proof; depth over speed; all tools; accept partial disambiguation).
- Prior burst: the 9 NEEDS-VERIFY splits resolved → `verify/*.md`. NEXT per ledger: (b) the long tail (<7 mentions) + (c) GPB seed unification + the Tier-1 DB↔GPB keeper reconciliation; THEN the 2-question acceptance test.
- Pattern: parallel read-only research agents (one per entity/cluster), each writes a worked record + returns a compact verdict; I synthesize + tick the ledger + commit research files each burst. NO DB writes.
- Newly-imported footnotes + martyr-roll names (e.g. Siyyid Aḥmad's family: Mír Abu'l-Qásim, Mír Mihdí, Mír Ibráhím) are now searchable → fold them into the research.

## ⚠ CROSS-CUTTING FINDINGS (surface to user)
- **`graph_entities.mention_count` is STALE/WRONG** (Nabíl: column said 620138=1616 / 1220249=1; real entity_mentions counts = 49 / 142). Any keeper/dedup logic MUST count `entity_mentions`, never the column. Likely systemic across all entities.
- **Pahlavi-era contamination**: bare "Sháh" 619695 fuses Qájár monarchs WITH 20th-c Pahlavi mentions (SAVAK/Rastakhiz, cids 6311628/6312026) — auto-NER bound modern docs under a Qájár-reading name. Re-route, never merge into a Qájár keeper.
- **Massive fragmentation**: major figures have THOUSANDS of spelling/diacritic/glyph fragments (apostrophe straight-vs-curly is a root cause). Per-entity deep research fixes the TOP figures; the long tail needs a separate (AI-assisted) consolidation sweep — flag for user.

## SESSION LOG (append each lurch)
- [start] Plan created; Phase A run bin7c046w in progress (~80%); graph pipeline up.
- [lurch 1] Phase C batch 1 DONE (6 GPB cross-corpus unifications, records in verify/gpb-*.md + verify/{nabil-keeper,mirza-yahya,shahs,revelation}.md):
  · Bahá'u'lláh UNIFY keeper **1227553** ← 613759+1219519 (glyph-split; strip 'Alí-Akbar alias). conf .99
  · 'Abdu'l-Bahá UNIFY keeper **614731** ← 1219728 (Center of Covenant)+1220348 (Most Great Branch); firewall Ghusn-i-Akbar=Muḥammad-‘Alí. conf .99
  · Nabíl (author Zarandí) keeper **1220249** ← 620138+620216; FIREWALL 1220146 Nabíl-i-Akbar (Qá'iní). conf .97
  · Mírzá Yaḥyá (Ṣubḥ-i-Azal) keeper **620167** ← ~40 variants; CRITICAL FIREWALL Vaḥíd=Siyyid Yaḥyáy-i-Dárábí (entity **614913**) — never merge hero into rival. conf .97
  · Sháhs: Muḥammad Sháh **619573**; Náṣiri'd-Dín **1227689**←1219335; bare "Sháh" 619695 → DISTRIBUTE (Pahlavi contamination). conf .93
  · Revelation 1219277 → 5-sense SPLIT + retype book-titles (Taherzadeh 429-432) to WORK; NEEDS-USER concept-modeling (like Bayán).
  Import still running (~93%). Next: batch 2.
- [lurch 2] Phase C batch 2 DONE (records in verify/work-*.md, verify/{quran-muhammad,vahid,quddus}.md):
  · Kitáb-i-Aqdas keeper **1219401** ← title variants; FIREWALL related works (Synopsis 1222933, Q&A 1232855, Lawḥ-i-Aqdas 1231527). conf .97
  · Kitáb-i-Íqán keeper **1219344** ← 1222591+1220188+1225605. conf .99
  · Bayán: Persian Bayán **1219348** | Arabic Bayán **1219474** (FIREWALL — distinct works) | concept sense 1219353 (retype work→concept). NEEDS-USER concept-modeling (same as Revelation).
  · Qur'án keeper **1227551** ← variants; Prophet Muḥammad keeper **614456** ← "Messenger of God". ⚠ "the Prophet" **1220747** does NOT merge — polluted (Bahá'u'lláh + Deganawida + generic) → hand-split. Strip bad 614456 aliases ("Muḥammad the Son of Ḥasan"=12th Imám, "Sháh-Muḥammad", "Ḥájí Muḥammad").
  · Vaḥíd keeper **651297** ← 1219861+638311+1219608+638223+651553; DROP empty shells 614913+651296. (Resolved 3-way keeper conflict — both prior candidates wrong.) Fate: strangled at Nayríz 1850. FIREWALL Mírzá Yaḥyá 620167.
  · Quddús keeper **1219859** ← 613760 (CONFIRMED Quddús, not artifact). FIREWALL Mullá Ḥusayn 1219326 + Covenant-breaker M-‘Alí 614534.
  Cumulative: 12 major entities consolidated. Next: batch 3.
- [lurch 3] PHASE A COMPLETE (resume run bin7c046w: 535 inspected, 49 affected, 16,708 inserted, 0 verify fail; mop-up: Book of Mormon +1633 fn, Muqaddimah +1239 fn, kept=true). Phase C batch 3 DONE (records verify/{the-bab,mulla-husayn,tahirih,shaykhi-founders,hujjat-officials,events}.md):
  · the Báb keeper **1219258** (real 3350 mentions) ← 1238146,1219478,1219665,636714(‘Alí-Muḥammad),1227550,1219347(Primal Point); DROP artifact 613854; strip pronoun aliases (He/His/Master). FIREWALL Bábu'l-Báb=Mullá Ḥusayn.
  · Mullá Ḥusayn keeper **1219326** ← 1219632(Bábu'l-Báb)+1227594; STRIP alias "Mullá Ḥusayn-i-Zanjání" (=1880s chronicler, impossible); KEEP "Beloved Siyyid…Ḥusayn" (Qayyúmu'l-Asmá' address — ledger's suspect flag OVERTURNED).
  · Ṭáhirih keeper **1219340** ← 1219341,1219793,1219794,1219795,1227859. ⚠ 638207 "Fáṭimih" CONTAMINATED (Ṭáhirih+Fáṭimih-of-Prophet+Munírih) → per-mention split, NOT bulk-merge. Firewall 1238980/1060989/638225.
  · Shaykh Aḥmad keeper **1056602** ← 1149145,1184080,641560 (strip Khurasání/Baḥrayní); Siyyid Káẓim-i-Rashtí keeper **619152** ← 1055345,1238188. Siyyid Káẓim-i-Zanjání = NOT a graph entity (never extracted) but 619152 has 2 misattributed Zanjání mentions (cid 60054 Manúchihr-letter, 38762 Zanján) to reassign.
  · Ḥujjat keeper **1219480** ← 1219377,1227591,1219376; Ḥájí Mírzá Áqásí **1219336** standalone; Amír-Niẓám **1219327** ← 619606. ATTRIBUTE: "overbearing and crafty"=GPB; "Antichrist of Bábí Revelation"=Balyuzi (NOT GPB/Shoghi).
  · Events SPLIT place/event: Ṭabarsí place 1219633 / event 1219827; Badasht event 1219420 / place 615714; Naw-Rúz 619760 (retype concept, merge 1229590/1227618); Nayríz place 620197 / event 1219381; Zanján place 631459 / event 1219622. Place-vs-event modeling NEEDS-USER ratify.
  Cumulative: **18 major entities consolidated**. Next: batch 4.
- [lurch 4] ✅ **PHASE A VERIFIED COMPLETE** (final dry-run: 0 affected docs, 0 missing paragraphs — all 138 partial OL docs fully backfilled incl footnotes/lists/martyr-rolls). Phase C batch 4 DONE (records verify/{manifestations,imams,siyyid-husayn-yazdi,aqay-kalim,rulers,places}.md):
  · Manifestations (cross_tradition_candidate=true, religion per-own-tradition; ⚠ Jesus 614675 was mis-tagged Baha'i): Jesus **614675**, Moses **614448**, Zoroaster **622667**, Buddha **622511**, Krishna **622445**, Abraham **614481**. FIREWALL Moses≠Mírzá Músá, Abraham≠martyr-Ibráhíms/Kheiralla.
  · Imáms: ‘Alí **1227872**, Ḥusayn **1219357** (merge shrine-places), Ḥasan **1219346**. Qá'im = CONCEPT keeper **1227649** ← collapse all Qá'im/Mihdí/Ṣáḥibu'z-Zamán/Hidden-Imám fragments; related-to (not merged-into) the Báb.
  · Siyyid Ḥusayn-i-Yazdí amanuensis (‘Azíz) keeper **1219427** (sibling's 628260 = empty orphan; merge empty orphans 628260/628048/1013095). FIREWALL Mutavallí-betrayer 1238660/1238371, Turshízí, Azghandí-nephew 1219387, ‘Azíz-governors. ⚠ 1219427 still absorbs Azghandí-uncle + Sulṭán-‘Abdu'l-‘Azíz mentions — follow-up cleanse.
  · Áqáy-i-Kalím (Mírzá Músá, Bahá'u'lláh's brother) keeper **1220020** ← 613792 (+~13 more fragments later). FIREWALL Moses, Mírzá Yaḥyá.
  · Rulers: Napoleon III **622821**, Victoria **622823**, Czar Alexander II **1060841**, Pope Pius IX **1220589**, Sulṭán ‘Abdu'l-‘Azíz **1219414**. FIREWALL Napoleon I 616469, bare "Pope"=John-Paul-II, bare "Sulṭán" 1142618=Shaykh Sulṭán the Kurd.
  · Places (type=place, spelling-variants merged): Shíráz 1056154, Baghdád 619164, Ṭihrán 1219288, ‘Akká 1219291, Adrianople 614734, Constantinople 1220219, Tabríz 619130, Mt Carmel 615622, Persia 614707, Mázindarán 1219771, Khurásán 619165, Iṣfahán 614495. FIREWALL place-vs-nisba-person.
  Cumulative: **24 entity-clusters consolidated**. Next: batch 5.
- [lurch 5] Phase C batch 5 DONE (records verify/{lotl-group1,lotl-group2,bab-family,informants,seven-martyrs,misc-companions}.md):
  · Letters of the Living: Basṭámí (keeper, merge 1227818/1219368/1056106), Bajistání 1227863, Jalíl-i-Urúmí 628249, Báqir-i-Tabrízí 620166, Yúsuf-i-Ardibílí 1064435 found+clean. ⚠ MANY LotL (Bushrú'í-kin, Qúchání, Khu'í, Marághi'í, Hindí, Qazvíní brothers, Rawḍih-Khán) have NO clean graph entity — only roster text / 0 live mentions → need CREATING (identity confirmed via roster+web). FIREWALL: 630651 "Rawdih-Khán"=the ritual rawḍih-khání (homograph trap); Maḥmúd-i-Khu'í≠Mihdí-i-Khu'í.
  · LotL SET 1219345 (org) ← merge 1219329/1219636; needs member-of edges (incl Ṭáhirih); the Báb=19th NOT a member.
  · Báb's family: uncle/guardian Ḥájí Mírzá Siyyid ‘Alí 1219383 (also a Seven-Martyr); wife Khadíjih Bagum 625311; mother Fáṭimih Bagum 638676 (near-empty stub). ⚠ CRITICAL FIREWALL mother Fáṭimih Bagum ≠ Ṭáhirih 1219340 ≠ 1060989 (a separate Yazd maiden-martyr "Fáṭimih-Bagum"). Afnán family org 1234047.
  · Preface informants: Dhabíh 1060866 ← 1220155 (Siyyid Ismá‘íl-i-Zavári'í); Shaykh Ḥasan-i-Zunúzí 1219469; Shaykh Abú-Turáb 625336. FIREWALL Anís(1219652)≠Shaykh-Ḥasan-Zunúzí (both Zunúzí!).
  · Seven Martyrs of Ṭihrán (Feb 1850) — all 7 ID'd: uncle 1219383, Qurbán-‘Alí 1064487, Ismá‘íl-i-Qumí 1227615, Turshízí (fresh node rec.), Kirmání 1005444, Murtaḍá (fresh node rec.), Marághi'í 1227616. Recommend modeling as a SET/EVENT (no set row exists). Most have 0 live mentions (extract-v2 pending).
  · Companions: Mullá Ṣádiq-i-Khurásání "Muqaddas" 1219371 ← 628384; Anís 1219654 ← 1219652 (⚠ mistyped 'work'→person); Sám Khán 1013108 (Armenian colonel, side=other).
  Cumulative: **~30 entity-clusters + sets**. Next: batch 6.
- [lurch 6] Phase C batch 6 DONE (records verify/{sangsar-18,mazindaran-rolls,abbas-quli-khan,princes-tabarsi,barfurush-clerics,nayriz-zanjan-antagonists}.md):
  · **Sang-Sar 18 martyrs** (the original trigger — now imported, paras 1189-1206): ALL 18 need CREATE (0 entities; extract-v2 pending). Family: Siyyid Aḥmad + brother Mír Abu'l-Qásim + uncle Mír Mihdí + brother-in-law Mír Ibráhím; + brothers Muḥammad-‘Alí & Abu'l-Qásim (a SECOND Abu'l-Qásim). 3 distinct Abu'l-Qásims (the 2 martyrs + 1064513 the Qá'im-Maqám vizier). Recommend SET "Sang-Sar martyrs of Ṭabarsí".
  · Mázindarán rolls (imported): Shah-Mírzád 2 + Mázindarán 27 + Savád-Kúh 5 — ~31 CREATE, 3 shell-LINK; notable: Rasúl-i-Bahnimírí (Nabíl-flagged). Recommend SET per roll.
  · ‘Abbás-Qulí Khán-i-Láríjání (killed Mullá Ḥusayn) keeper **1219600** ← 1227614 + empty stubs 1070838/615761. side=other.
  · Princes: Mihdí-Qulí Mírzá **1219598** ← 1064471+615734+1005439/40+1066060 (ledger's 1064471-keeper note was STALE); Ḥamzih Mírzá **1219657** ← 615569+1227623+613804+1060809. Firewall apart + ≠ Purest Branch/Mullá Mihdí.
  · Bárfurúsh clerics: Sa‘ídu'l-‘Ulamá **1060802** ← 1064453/1077105/1219591/1227608; Mírzá Muḥammad-Taqí-i-Sárí **620195**. ★ FOUR-Taqí firewall: Sárí ≠ Amír-Niẓám(1219327) ≠ Baraghání-uncle(1076857) ≠ Ibn-i-Abhar Hand-of-Cause.
  · Nayríz/Zanján antagonists: Nayríz gov Zaynu'l-‘Ábidín Khán **1219609**; Nayríz Vaḥíd-killer **Mihr-‘Alí Khán 1219848** ← Shujá'u'l-Mulk 1219611; Zanján general Amír-Túmán **983846**. ✅ CONFIRMS user's hunch: Nayríz Vaḥíd-killer (Mihr-‘Alí Khán) ≠ Ṭabarsí Mullá-Ḥusayn-killer (‘Abbás-Qulí Khán 1219600). ⚠ 1060805 wrongly merges Khurásán rebel + a Zanján Arslán Khán → SPLIT.
  Cumulative: **~40 entity-clusters/sets across 6 batches**. Next: batch 7.
- [lurch 7] Phase C batch 7 DONE — GPB later/‘Akká period (records verify/{shoghi-uhj,covenant-breaker,nahri-martyrs,badi-abulfadl,holy-family,sulayman-khan}.md):
  · Shoghi Effendi keeper **614423** ← "The Guardian" (mislabeled work 1222824)+Rabbání+variants; UHJ org **1221777**. FIREWALL Mason Remey "Second Guardian" 1223264 (false claim — never merge).
  · Covenant-breaker Mírzá Muḥammad-‘Alí **614534** ← Ghusn-i-Akbar 639254; Mahd-i-‘Ulyá **638225**; breakers group 1222032. ⚠ 638227 (244 mentions) is the DB Bábí-era bucket, NOT the breaker — keep split. Strip Ḥujjat/Salmání pollution from 614534.
  · King of Martyrs **1220150** (Mírzá Muḥammad-Ḥasan-i-Nahrí) / Beloved of Martyrs **1220151** (Mírzá Muḥammad-Ḥusayn-i-Nahrí); firewall the Imám-Jum‘ih persecutor 1220516 + 1220547 bucket. Nahrí↔Covenant link (Munírih).
  · Badí‘ **1219596** ← Áqá-Buzurg/Pride-of-Martyrs; Abu'l-Faḍl-i-Gulpáygání **1060906**. ⚠ 1233337 "Badí‘" conflates martyr + Covenant-breaker son Badí‘u'lláh → SPLIT. Firewall Badí‘≠Mírzá Buzurg (the father).
  · Holy Family: Purest Branch (Mírzá Mihdí) **1220467**; Navváb/Ásíyih **620193** ← 1219442; Munírih **620369**. Firewall Purest Branch≠Mihdí-Qulí-Mírzá; Ásíyih≠Mahd-i-‘Ulyá.
  · Ḥájí Sulaymán Khán (candles martyr) **1219669** ← 651846. ⚠ 983869 is a dirty 4-way conflation (incl Sulaymán Khán-i-Afshár antagonist + "Sulaymán the Magnificent") → per-mention split. Firewall the Afshár official.
  Cumulative: **~46 across 7 batches**. Next: batch 8.
- [lurch 8] Phase C batch 8 DONE (records verify/{the-wolf,buzurg-nuri,shaykhi-rivals,works-mystical,works-tablets,works-abdulbaha}.md):
  · the Wolf (Shaykh Muḥammad-Báqir-i-Iṣfahání) **1220515** ← Raqshá 1220708; Son of the Wolf (Áqá Najafí) **1220539** (⚠ many "Son of the Wolf" mentions are BOOK cites → work 1219787, route person-vs-book). Firewall the Báqirs/Taqís.
  · Mírzá Buzurg (father) **619601** ← 1219778/638386; Mírzá Áqá Khán-i-Núrí (PM) **1219740**. Firewall father≠PM≠Badí‘≠Kirmání.
  · Shaykhí rivals: Karím Khán-i-Kirmání **1219857** ← 641418/1219354; Muḥíṭ-i-Kirmání **1060781** (⚠ STRIP 6 pronoun aliases He/I/him… that swept ~363 unrelated 20th-c mentions; real footprint ~38). Firewall apart + ≠ founders.
  · Works (Bahá'u'lláh mystical): Hidden Words **1220196**, Seven Valleys **1220096**, Four Valleys **1220092** (firewall apart), Gleanings **1222592**.
  · Works (Bahá'u'lláh tablets): Epistle to Son of the Wolf **1219787**, Súriy-i-Haykal **1220620**, Súriy-i-Mulúk **1220295**, Tablet of Aḥmad **1235060**, Tablet of Carmel **1220496** (firewall ≠ Mt Carmel place).
  · Works (‘Abdu'l-Bahá): Some Answered Questions **1220015**, Secret of Divine Civ **1222934**, Tablets of Divine Plan **1221044**, Will&Testament **1219294** (firewall ≠ Bahá'u'lláh's Kitáb-i-‘Ahd), Traveller's Narrative **1219522**, Memorials **1222926**.
  Cumulative: **~52 across 8 batches**. Next: batch 9.
- [lurch 9] Phase C batch 9 DONE (records verify/{baraghani,mamaqani,mirza-jani,qaini-juvayni,husayn-khans,siyyid-muhammad}.md):
  · Mullá Taqí Baraghání ("Third Martyr", Ṭáhirih's uncle, assassinated 1847) **631812** ← 14 variants. Firewall 4 Taqís + Ibn-i-Abhar trap 620148; brother Ṣáliḥ (Ṭáhirih's father) separate.
  · Mámáqání (signed Báb's death-warrant) **1060778** ← 8 fragments. side=other.
  · Ḥájí Mírzá Jání-i-Káshání (earliest Bábí historian, hosted the Báb) **1221935** ← 641615; author_of Nuqṭatu'l-Káf (work, ~25 fragmented nodes — needs work-consolidation pass).
  · Báqir-i-Qá'iní **638692** (clean); Juvayní **1060801** (⚠ CONTAMINATED — ~9/16 mentions are the Sárí mujtahid = a 6th Taqí; strip). The 5th & 6th Muḥammad-Taqís.
  · Ḥusayn Kháns: Fárs governor (Áṣafu'd-Dawlih, Báb's first persecutor at Shíráz) **1219374**; ambassador Mushíru'd-Dawlih **1220222**; the "3rd" was false-positive bleed into Mullá Ḥusayn. Firewall ≠ Mullá Ḥusayn/amanuensis/Imám/Bahá'u'lláh.
  · Siyyid Muḥammad 1220072 = COLLISION BUCKET (retire); the "Antichrist" Siyyid Muḥammad-i-Iṣfahání (Azal's evil genius) **1239979** ← 619821-GPB-part; ⚠ 619821 contaminated (Antichrist + a believer mujtahid — SPLIT). Imám-Jum‘ih 1228029 = TITLE → split by city (Iṣfahán=Sulṭánu'l-‘Ulamá the Báb's protector; Ṭihrán 1228027).
  Cumulative: **~58 entity-clusters/sets across 9 batches** — EXHAUSTIVE who's-who foundation for both books (central figures, Manifestations, Imáms, all major works, events, Letters of the Living, Báb's family, Seven Martyrs, martyr rolls, all major antagonists, rulers, places, later-GPB figures). FOUNDATION COMPLETE.
- [monitor 1] ✅ EMBEDDING BACKLOG FULLY DRAINED (~23,637 → 0): all newly-imported content (footnotes/lists/martyr-names, ≤6000ch) is now embedded → keyword + semantic searchable. Only ~553 oversized (>6000ch) remain (Phase-2 segmentation). ⛔ Promoter still stuck (waiting restart, 8 restarts) → extraction still stalled (graph_enriched=0 = 4,507,964, no change). Steady/blocked-on-user; re-scheduling monitor.
