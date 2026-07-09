## ▶▶ RESUME HERE — READ THIS FIRST (after any compaction) ▶▶

**WHAT THIS IS:** building a manually-verified, **cross-corpus** entity dictionary (people, works, events) for the SifterSearch Bahá'í corpus, seeded from **GPB** (authoritative attributes — Shoghi Effendi's characterizations) + **Dawn-Breakers** (broad early-history cast). Goal: ONE clean entity per real person/work, deeply researched to **beat general knowledge**, so questions resolve by entity lookup. Multi-lurch march; **THIS FILE is the state.** Compact freely between bursts.

**READ IN THIS ORDER before doing anything:**
1. `.claude/skills/entity-research/SKILL.md` ← **THE METHOD (all guards), non-negotiable.** Core rules: (a) **cross-corpus & cumulative** — one entity per person, merge per-doc duplicate ids; (b) **SPLIT bears the burden of proof** — default MERGE for name-variants; a "better known as / surnamed / later called" *linking clause* = name-change = MERGE; split ONLY with ≥2-source proof of distinct persons AND flag `NEEDS-VERIFY` (the ‘Abdu'l-Karím failure: an agent split a name-change because it skipped the cross-check); (c) **DEPTH over speed** — synthesize ALL sources (corpus-wide mentions + Momen/Balyuzi/Taherzadeh/Mázandarání/Saiedi + WebSearch/Wikipedia), cross-checked — NEVER shallow name-string comparison; (d) research **every person incl. martyr-lists**; (e) follow Nabíl's **cross-text hints** ("whom Bahá'u'lláh mentioned in the Íqán"…); (f) accept partial disambiguation — flag, don't force.
2. This ledger (status, worklist, source doc-ids, scorecard — below).
3. `scripts/wip/corrections/worked-entities.md` — the worked-record **FORMAT** + the locked records + the ‘Abdu'l-Karím-vs-Siyyid-Ḥusayn lesson. **Emulate this depth.**
4. Prior findings to REUSE (don't re-derive): `MASTER-corrections.md`, `gpb.md`, `db-{nayriz-tabarsi,zanjan-babarc,roster-attribution}.md`, `works.md`, `worked-tier1-*.md`, `worked-tier2-*.md`.

**THE RESUME LOOP:** pick next undone entity from the worklist (DB-21308 mention-rank = entry ORDER only; records are cross-corpus) → research DEEPLY per the skill → write/append its record to a `worked-*.md` file (every SPLIT = `NEEDS-VERIFY`) → tick it in the worklist + add a one-line scorecard entry → update the **NEXT ACTION** line below → compact.

**◀ NEXT ACTION (update every burst):** ✅ DONE — all 9 NEEDS-VERIFY splits researched (records in `verify/*.md`). RESULT: **all 9 came back SPLIT** (see BURST FINDINGS — plausible because these are bare-given-name catch-all buckets, the classic over-merge magnet, UNLIKE the ‘Abdu'l-Karím name-change case; but 9/9-SPLIT itself warrants a skeptical QA pass before any apply). **NEXT:** (b) the long tail (DB persons <7 mentions) + place/concept artifacts; (c) GPB seed unification (the Tier-1 DB-keeper ↔ GPB-keeper reconciliation, e.g. the Báb/Bahá'u'lláh/Vaḥíd/Quddús per-doc id pairs); THEN the 2-question acceptance test. NB: every verdict here is a PROPOSAL pending the write-path (D-G) — no DB writes yet.

⚠ **BURST FINDINGS — the 9 NEEDS-VERIFY splits (records in `verify/<id>-*.md`; ALL proposals, write-path pending):**
- **1064513 Abu'l-Qásim → SPLIT 5-way (H).** A=Qá'im-Maqám grand vizier (strangled 1835) | B=Shíráz brother/the Báb's in-law | C=Nayríz martyr 1850 | D=Imám-Jum‘ih of Ṭihrán (refused ‘Aẓím's execution 1852; Balyuzi 462/3887) | E="greedy mujtahid" of Zanján. All NEW (1064513 anchors A). ⚠ corrupt aliases (Qá'im-Maqám + "greedy mujtahid" on one row); strip spurious cids para_359/364/454/1473 (≥2 contain no Abu'l-Qásim; belong to Mullá Muḥammad of Núr).
- **1220547 Muḥammad-Ḥasan → SPLIT 6-way (H).** A=Shaykh M-Ḥ-i-Najafí (Ṣáḥib-i-Jawáhir, d.1849) | B=Sabzivárí "Tyrant of Yazd" 1891 →existing **638951** | C=Qazvíní/Fatá (Ṭáhirih's messenger) | D=brother of Mullá Ḥusayn | E=Pilgrim-House caretaker | F=Qajar-court (firewall). Strip cids 21054517, 21053927 (image caption).
- **632382 Mullá Mihdí → SPLIT 5-way (H).** keep 632382=Khu'í (Bahá'u'lláh's tutor, Ṭabarsí martyr); A=Naraqí (NEW) | C=Kandí →1219769/1238181 | D=‘Aṭrí (father of Varqá) →1191652 | E=Astirábádí (NEW) + a separate Yazd-1891 martyr. ⚠ **do NOT chase the Letter-of-the-Living hint — that LotL is Mullá MAḤMÚD-i-Khu'í, a name-collision, not this Mihdí.** Drop cids 21054202, 21054902.
- **619151 Mullá Muḥammad → SPLIT 5-way, ALL MERGE-OUT (retire the bucket).** A=Núrí →1227576 | B=Baraghání (Ṭáhirih's husband/cousin, persecutor) →**641802 [the SON, not the assassinated father Mullá Taqí]** | C=Manshádí (1903 Yazd martyr) →1240389 | D=Furúghí (Ṭabarsí) →1220379 | E=Tabríz examiner UNRESOLVED/NEEDS-SOURCE (maybe the FIREWALLED Mámáqání 1060778 — do not auto-absorb).
- **1227795 ‘Abbás → SPLIT 6-way (H), mostly MERGE-OUT.** A=‘Abdu'l-Bahá →**614731** | B=Mírzá Buzurg →619601 | C=‘Abbás-Qulí Khán-i-Láríjání (Ṭabarsí general who shot Mullá Ḥusayn) →consolidate 1070838+615761 or NEW | D=‘Abbás servant/spy →NEW | E=Mírzá ‘Abbás "Qábil" of Abádih →1216694 | F=Sháh ‘Abbás Safavid →636313 | G=‘Abbás Big (Adrianople) →NEW. ⚠ verify C's mentions individually before merging so the Láríjání general stays firewalled from Nayríz namesakes.
- **1219442 Navváb → TITLE; SPLIT 4-way then retire 1219442 (H).** "Navváb"=nobility honorific. A=Ásíyih Khánum (Bahá'u'lláh's wife) →620193 (+625041) | B=Navváb-i-Raḍaví (Yazd) →1227619 | C=Navváb Ḥamzih Mírzá (Áẕarbáyján gov.) →1227623 | D=Qahru'lláh dervish (needs id).
- **1227760 ‘Abdu'l-Vahháb → SPLIT 2-way (H).** keep 1227760=Shírází (son of Ḥájí ‘Abdu'l-Majíd; Síyáh-Chál; martyred Ṭihrán 1852; the shoes/farewell narrative); B=‘Abdu'l-Vahháb of Núr (martyred Mázandarán w/ Muḥammad-Taqí Khán) =NEW. Reassign para_801→1227868, para_878→orphan; scrub `-i-Turshízí` + 20th-c `Káẓimí-Manshádí` aliases. Firewalls: 1227756, 1227868, 1239314.
- **1219659 Mírzá Ḥasan Khán → SPLIT 4-way, all NEW (H).** A=Vazír-Niẓám, brother of the Amír-Niẓám (executed the Báb — Qájár, FIREWALL) | B=half-brother of Bahá'u'lláh (Tákur/Núr) | C=Mírzá Ḥasan-i-Vazír, Bábí son-in-law of the Majdu'l-Ashráf (sheltered the Báb's remains) | D=Mírzá Ḥasan-i-Núrí the Platonist (Iṣfahán). Strip cids 21054633, 21055601 (Ḥusayn Khán of Shíráz), 21656497. "Vazír" shared by A & C is coincidental — do not re-merge.
- **1055802 Siyyid Aḥmad → SPLIT 4-way (H).** A=Sang-Sarí (Ṭabarsí martyr, son of Mír Muḥammad-‘Alí) keeps 1055802 | B=son of Vaḥíd at Nayríz =NEW | C=father of Siyyid Ḥusayn "the beloved" at Ṭabarsí =NEW (single-row, NEEDS-SOURCE) | D=Siyyid Aḥmad-i-Afnán (‘Akká) →existing **1154734**. ⚠ cid 6441643 double-attributed to 1055802 AND 1154734 (bug — detach).
- **OBSERVATION (skeptical QA needed):** 9-for-9 SPLIT. Most are bare-given-name buckets (genuine magnets), and many resolve by MERGE-OUT to *existing* keepers (good sign — not inventing people). But before any apply, a second pass should re-confirm the cids that have only single-row support (Abu'l-Qásim B/E, Siyyid Aḥmad C, Mullá Muḥammad E) and the keeper-consolidation pairs (‘Abbás C: 1070838+615761).

⚠ **PRIOR BURST FINDINGS to surface to user (still open):**
- **The numbered "18 Sang-Sar martyrs §20.102 (#46–63)" roster is NOT in the indexed corpus** — it traces to an *ephemeral oceanlibrary /link/ copy-range*, not Nabíl's text. Only ~4 are corpus-resolvable (Mír Muḥammad-‘Alí 1064476, Siyyid Aḥmad 1055802, Mír Abu'l-Qásim, the two sons of Karbilá'í Abú-Muḥammad + the two awakener-precursors). The other 14 (Ṣafar-‘Alí, Karbilá'í Ismá‘íl, ‘Abdu'l-‘Aẓím, ‘Alí Khán, …) have ZERO corpus support → flagged NEEDS-SOURCE (Malik-Khusraví / *Bahá'í Studies Review* 14 Sangsar chronicle?). NOT fabricated. **Ask user for the source of the 18-list.**
- Overlooked-important: the Sang-Sar (Sháhmírzádí) house was BOTH martyr-house AND **record-house** — 2 surviving brothers are mss historians of Ṭabarsí (Momen 11559), Nabíl's direct source (para_1326).
- **Nabíl keeper-id conflict:** mention-mass is on **1220249** (141) vs 620216 (2) → keeper should likely be 1220249, not 620216 (db-roster-attribution proposed 620216). USER/QA call. (Firewall ≠ Nabíl-i-Akbar 1220146 = Mullá Muḥammad-i-Qá'iní, d.1892 Bukhárá — held.)
- Type-fixes: Qá'im 1227649 + Ṣáḥibu'z-Zamán 1227889 → `concept`/title (RELATE→the Báb); Most Great Branch 1220348 → MERGE ‘Abdu'l-Bahá 614731; Letters of the Living 1219345 = org (keep); followers-of-the-Báb 1219655 → DROP-or-org (USER policy call, like ‘ulamás).

**HARD CONSTRAINTS:** READ-ONLY on tower-nas — `sqlite3 data/sifter.db` SELECT, may `ATTACH 'data/graph.db'` read-only, Meili curl, WebSearch/WebFetch. **NO INSERT/UPDATE/DELETE, NO files on tower-nas, NO pkill/kill/pm2** (shared prod box). **NO DB writes at all** until the user approves the apply (write-path = D-G in `MASTER-corrections.md`). Reference: doc **21308**=Dawn-Breakers, **21310**=GPB; roster query + Meili-key recipe + deep-source doc-ids are in the sections below.

**ACCEPTANCE TEST (run only AFTER the roster is done — validation, NOT a target):** re-check the 2 user questions — (Q1) ‘Abdu'l-Khaliq-i-Iṣfahání at Badasht + his later fate; (Q2) the Ṭabarsí betrayer **Mírzá Ḥusayn-i-Mutavallíy-i-Qumí** across Bárfurúsh/Ṭihrán — each should be immediately answerable from its entity record alone.

────────────────────────────────────────

# Top-Down Entity Review — Ledger (CROSS-CORPUS; DB-21308 mention-rank = ENTRY ORDER only)

> The systematic per-entity march. **Every record is CROSS-CORPUS: one entity per real person, unifying its GPB + DB (+ all-book) keeper ids into ONE entity** — GPB attributes authoritative (Shoghi Effendi's characterizations), DB/Momen/Balyuzi for history + kinship. The DB-21308 mention ranking below is ONLY the entry order (which entity to work next), NOT a book scope. Each entity → a worked record in `worked-entities.md` (or a batch file), at-or-better-than-general-knowledge, mined across the FULL corpus.
> ⚠ Tier-1 worked records (worked-tier1-*) are DB-scoped DRAFTS — each must be UNIFIED with its GPB-cohort counterpart in gpb.md (e.g. the Báb DB-keeper 1219258 + GPB-keeper cluster → ONE; Bahá'u'lláh 1227553+613759; Vaḥíd 1219861+651297; Náṣiri'd-Dín 1219335; Áqáy-i-Kalím; etc.).
> Status: TODO · DRAFT (agent record written, needs QA) · DONE (QA'd) · USER (needs the user's knowledge).
> Method per entity: (1) pull its mentions corpus-wide (not just 21308); (2) read the copyrighted sources
> (Balyuzi 462/466/467, Taherzadeh 429–432, Mázandarání, Saiedi 8632, Ahdieh/Rabbani 11375/11344/16552, Phelps 8746);
> (3) ferret out implicit connections (nisba→kinship, positional refs, oblique motive); (4) decide merge/split/firewall;
> (5) record canonical + aliases + role-arc + relationships + dates + side + a beat-general-knowledge DESCRIBE + EVIDENCE.
> READ-ONLY; proposals pending write-path (D-G). All entity_ids verified live this session.

## Tier 1 — pillars (top ~25; much already in cohort files — consolidate + DESCRIBE to beat gen-knowledge)
- [ ] 1219258 the Báb (506) — merge 1219478/1219665; drop image-artifact 613854
- [ ] 1227553 Bahá'u'lláh (220)
- [ ] 1219326 Mullá Ḥusayn (196) — strip bad aliases (Zanjání, "the Beloved Siyyid")
- [ ] 1219859 Quddús (137) — merge 613760
- [ ] 1219480 Ḥujjat (83) — merge 1227591
- [ ] 619152 Siyyid Káẓim (67) → Siyyid Káẓim-i-Rashtí; FIREWALL ≠ Zanjání (new)
- [ ] 1219861 Vaḥíd (66) — merge 1219608/638311
- [ ] 1219277 Revelation (59, work/concept) — Bayán-split context
- [ ] 1219340 Ṭáhirih (57) — merge Qurratu'l-'Ayn/Zarrín-Táj/Zakíyyih/Fáṭimih frags
- [ ] 1227551 Qur'án (53, work)
- [ ] 1227890 ‘ulamás (52) — DROP (collective)
- [ ] 1056602 Shaykh Aḥmad (52) — Shaykh Aḥmad-i-Aḥsá'í
- [ ] 1219336 Ḥájí Mírzá Áqásí (50)
- [ ] 1219327 Amír-Niẓám (50) — Mírzá Taqí Khán
- [ ] 619573 Muḥammad Sháh (43)
- [ ] 1219638 Mírzá Aḥmad (41) — = Mírzá Aḥmad-i-Qazvíní (informant); ≠ Nayríz fort-officer
- [ ] 1219427 Siyyid Ḥusayn (40) — the Báb's amanuensis (Siyyid Ḥusayn-i-Yazdí)
- [ ] 619695 Sháh (36) — SPLIT anaphora (Muḥammad vs Náṣiri'd-Dín) [USER]
- [ ] 1227689 Náṣiri'd-Dín S̱háh (35) — merge into the Náṣiri'd-Dín keeper
- [ ] 1219657 Prince Ḥamzih Mírzá (33) — FIREWALL ≠ Mihdí-Qulí Mírzá
- [ ] 614456 Muḥammad (31) — the Prophet Muḥammad
- [ ] 1219665 Siyyid-i-Báb (29) — merge → the Báb
- [ ] 619760 Naw-Rúz (25, event)
- [ ] 1220020 Áqáy-i-Kalím (24) — merge 613792 (Mírzá Músá)
- [ ] 638227 Mírzá Muḥammad-‘Alí (24)

## Tier 2 — (26–70)
- [ ] 1227649 Qá'im (23) · 617083 Mujtahid (21, RETYPE title) · 1220747 the Prophet (20, RETYPE→Muḥammad) ·
  1219371 Mullá Ṣádiq-i-Khurásání (20) · 1228029 Imám-Jum‘ih (19, RETYPE) · 1219383 Ḥájí Mírzá Siyyid ‘Alí (19, the Báb's uncle) ·
  1219740 Mírzá Áqá Khán-i-Núrí (18) · 1219357 Imám Ḥusayn (18) · 1228051 Mullá ‘Abdu'l-Karím (17) · 1220072 Siyyid Muḥammad (17) [USER collision] ·
  1219618 Amír-Túmán (16) merge 983846 · 638692 Mírzá Muḥammad-Báqir (16, Báqir-i-Qá'iní) · 1219374 Ḥusayn Khán (15) [USER 3-Ḥusayn-Khán] ·
  1060801 Mírzá Muḥammad-Taqíy-i-Juvayní (15) · 619151 Mullá Muḥammad (15) · 1227889 Ṣáḥibu'z-Zamán (14, title/Qá'im) · 1221935 Ḥájí Mírzá Jání (14) ·
  1219598 Prince Mihdí-Qulí Mírzá (14) merge 1064471 · 1219857 Ḥájí Mírzá Karím Khán (12) · 1219469 Shaykh Ḥasan-i-Zunúzí (12) ·
  1064513 Mírzá Abu'l-Qásim (12) · 1060781 Mírzá Muḥíṭ-i-Kirmání (12) · 1219655 followers-of-the-Báb (11, org) · 1013108 Sám Khán (11) ·
  625336 Shaykh Abu-Turab (11, informant) · 614534 Muḥammad-‘Alí (11) · 1219442 Navváb (10) · 632382 Mullá Mihdí (10, SPLIT ≥5) ·
  631812 Mullá Taqí (10, Baraghání) · 620167 Mírzá Yaḥyá (10) · 613792 Mírzá Músá (10, merge→Áqáy-i-Kalím) · 1227760 ‘Abdu'l-Vahháb (9) ·
  1220547 Muḥammad-Ḥasan (9) · 1219827 Ṭabarsí (9, event) · 1219669 Ḥájí Sulaymán Khán (9) merge 651846 · 1219659 Mírzá Ḥasan Khán (9) ·
  1055345 Siyyid Káẓim-i-Rashtí (9) · 628263 Mullá Báqir (9, MERGE→620166) · 1220348 Most Great Branch (8→'Abdu'l-Bahá) · 1220249 Nabíl (8) ·
  1219345 Letters of the Living (8, org) · 1060778 Mullá Muḥammad-i-Mámáqání (8) · 1227795 ‘Abbás (7)

## DONE this session
- [x] 983896 Mullá Javád-i-Vilyání (worked-entities.md) — believer→opponent; Ṭáhirih's maternal cousin; full record + firewalls.
- [x] 1219638 Mírzá Aḥmad-i-Qazvíní (worked-entities.md) — =‘Abdu'l-Karím=Mírzá Aḥmad-i-Kátib (name-change, MERGE 1228051; USER-CONFIRMED); the Báb's amanuensis, close friend of Nabíl; split out the Yazd Azghandí-nephew.
- [x] 1219427 Siyyid Ḥusayn-i-Yazdí "‘Azíz" (worked-entities.md) — RE-VERIFIED deeply (corpus+web): GENUINE over-merge → SPLIT confirmed. Keeper = the Báb's amanuensis (martyred Ṭihrán 1852). Split out Azghandí-mujtahid, Turshízí-martyr, Mutavallí-BETRAYER(firewall!), Káshání, Zavárí'í, Milan. (Agent's split was right here — verified, not trusted.)
- [x] 638227 Mírzá Muḥammad-‘Alí (worked-entities.md) — RE-VERIFIED: GENUINE 6-way over-merge → SPLIT. Ghusn-i-Akbar breaker→keeper 614534 (bulk in doc 426/Taherzadeh); +Nahrí (‘Abdu'l-Bahá's father-in-law); +Qazvíní-Letter (Ṭáhirih's brother-in-law); +Anís-Zunúzí→1219654; +Ṭabíb-i-Zanjání. Agent right; verified.

### Re-verification scorecard (the 3 suspect Tier-1 splits)
- ‘Abdu'l-Karím/Mírzá Aḥmad = **wrongful split → MERGE** (agent missed the "better known as" linking clause).
- Siyyid Ḥusayn-i-Yazdí = **genuine SPLIT** (distinct nisbas/roles, incl. the betrayer fused in).
- 638227 Mírzá Muḥammad-‘Alí = **genuine SPLIT** (6 distinct men; breaker's bulk in Taherzadeh, not DB).
→ Agents over-split ~1-in-3; ONLY deep corpus+web verification tells a name-change (merge) from a namesake-pile-up (split). All agent split/over-merge claims stay UNVERIFIED until re-checked this way.

- [x] **CROSS-CORPUS PILLAR UNIFICATIONS** (worked-entities.md) — verified by DB/GPB mention spread: Bahá'u'lláh (613759→1227553), Quddús (613760→1219859 — resolves the cohort merge-vs-drop: 613760 is the GPB Quddús, not an image artifact), Vaḥíd (1219861+651297), Ṭáhirih (638207+1227859→1219340), Siyyid Káẓim-i-Rashtí (1055345→619152). The Báb 1219258 is already the cross-corpus keeper. Same dedup must run for every multi-book figure.

- [x] **TIER 2 (20 figures) — DRAFT** in worked-tier2-{circle,officials,babis}.md. Splits all flagged NEEDS-VERIFY (Abu'l-Qásim 3-way · Muḥammad-Ḥasan ≥4 · Mullá Mihdí ≥5 · Navváb · ‘Abdu'l-Vahháb · Ámul-Mírzá-Ḥasan). Verified merges: Mullá Báqir 628263→620166 (Letter; + split a Nayríz Báqir) · Sulaymán Khán 651846→1219669 · Mihdí-Qulí Mírzá 1064471→**keeper 1219598** (NOT 1064471 — officials agent inverted; QA fix). Firewalls held: Karím-Khán≠Muḥíṭ-i-Kirmání (both Kirmání Shaykhís), Sám Khán=`other` (sympathetic), Mámáqání=death-warrant signer. ⚠ data-quality: Muḥíṭ 1060781 has pronoun aliases (He/him/I) that swept ~120 unrelated 20th-c docs in — alias-strip + prune.

### REMAINING (the full roster — "every person", per user)
- Tier-1 GPB-unification finish + the rest of Tier 2 (entities 47–70) + the long tail (~900) + GPB seed.
- **Every martyr-list name** incl. the **18 Sang-Sar martyrs §20.102** (often-overlooked, important) — see db-nayriz-tabarsi §6.
- Follow Nabíl's cross-text hints ("whom Bahá'u'lláh mentioned in the Íqán", etc.) to disambiguate across books.

### STILL OPEN for the 2-question acceptance test (AFTER the roster, as validation — not a target)
- ‘Abdu'l-Khaliq-i-Iṣfahání (Badasht / forsook the Faith) — SPLIT 641532 from Yazdí + son-of-Qani (test Q1).
- The Ṭabarsí betrayer **Mírzá Ḥusayn-i-Mutavallíy-i-Qumí** — CREATE + bind fort/desertion/Bárfurúsh mentions; FIREWALL off Siyyid Ḥusayn-i-Yazdí the amanuensis (test Q2).
- [x] **TIER 1 (all 25) — DRAFT** in worked-tier1-{central,clerics,royals}.md (2026-06-16; QA + user calls pending).

### ★ Batch-1 cross-cutting findings (new — beyond the cohort pass)
1. **CROSS-CORPUS KEEPER MISMATCH (structural).** The 21308 (DB) and 21310 (GPB) sidecars carry DIFFERENT keeper ids for the SAME figure — Bahá'u'lláh 1227553(DB)/613759(GPB); Vaḥíd 1219861/651297; Quddús 1219859/613760-frag. A global apply must reconcile per-doc keepers into ONE cross-corpus entity each. → affects D-A/D-C/D-G; argues for reviewing entities CROSS-CORPUS, not per-doc.
2. **Name-change vs over-merge — USER-CORRECTED:** 1219638 Mírzá Aḥmad-i-Qazvíní = **Mírzá Aḥmad-i-Kátib = Mullá ‘Abdu'l-Karím** — ONE man, a NAME-CHANGE (‘Abdu'l-Karím his earlier name; cid 21054086 "Mírzá Aḥmad-i-Kátib, better known in those days as Mullá ‘Abdu'l-Karím"; user-confirmed). → **MERGE 1228051 ‘Abdu'l-Karím INTO 1219638** (the agent's "over-merge" call was WRONG here — same person). The separate *Yazd Azghandí-nephew* mentions in 1219638 ARE a real over-merge → split those out. Re-examine 1219427 Siyyid Ḥusayn the same way (Yazdí amanuensis = name-change/aliases vs Azghandí mujtahid = true namesake). **LESSON: a name-change reads exactly like two entities — only the literature/user distinguishes merge from split.**
3. **638227 Mírzá Muḥammad-‘Alí = worst node:** fuses 6+ people — arch-breaker son of Bahá'u'lláh (keeper 614534), Nahrí, Qazvíní (a Letter), Anís-Zunúzí (1219654), Ṭabíb-i-Zanjání, Hamadán physician. Big SPLIT.
4. **1219277 "Revelation" = polluted concept bucket** (85 aliases: Bahá'í/Bábí/Qur'ánic Revelation + biblical Apocalypse + book-titles like Taherzadeh's *Revelation of Bahá'u'lláh*). 5-way split; same D-D modeling ruling as Bayán.
5. **ATTRIBUTE fix:** Ḥájí Mírzá Áqásí's "Antichrist of the Bábí Revelation" = Balyuzi's epithet, NOT GPB's (GPB: "overbearing and crafty"). 
6. Quddús 613760 = merge-vs-drop conflict between cohorts (image-artifact vs fragment) — resolve.
7. Alias-strips: Bahá'u'lláh (false "‘Alí-Akbar"/amanuensis), Shaykh Aḥmad (suspect Khurasání/Baḥrayní), Muḥammad/Prophet (Sháh-Muḥammad/Ḥájí-Muḥammad/Hidden-Imám).

NEXT BATCH: Tier 2 (26–70), CROSS-CORPUS (one entity per person, merge per-doc dup ids), ALL TOOLS.

### Deep biographical sources in corpus — MINE per entity (+ WebSearch/Wikipedia as hints, cross-checked)
- **Momen** topical/province articles: 11361 Family&Early-Life-of-Ṭáhirih · 11523 Badasht · 11528 Zanján(Khamsih) · 11559 Mázandarán&Gurgán(Ṭabarsí) · 11558 Qazvín · 11497 Zuhur-al-Haqq · 11516 Afnán-genealogy · 11177 Babi&Bahá'í-Religions-1844-1944 · + bios (11501 ‘Alí-Akbar Sháhmírzádí, 11514 Badí‘, 11541 Ḥaydar-‘Alí…).
- **Balyuzi** 466 (The Báb), 462 (King of Glory), 467 (Khadíjih Bagum), 12427 (Wives of the Báb & Bahá'u'lláh), 3789 (‘Abdu'l-Bahá), 3887 (Eminent Bahá'ís).
- **Taherzadeh** 429–432 (Revelation v1–4), 11584, 12384. **Mázandarání** 420/16564 (Life of the Báb), 11322 (Life of Bahá'u'lláh), 15227 (Zuhúru'l-Ḥaqq gems). **Saiedi** 8632 (Gate of the Heart), 7165 (Logos & Civilization).
- Method: corpus = authoritative; web/Wiki/general-knowledge = HINTS to confirm in corpus + fill gaps; tag basis (corpus-verified/sourced/web/unconfirmed).

## Long tail
~900 more entities in 21308 (down to 1 mention) + GPB's roster — lighter records, after the seed tiers. Place/concept artifacts handled in db-roster-attribution.md.
