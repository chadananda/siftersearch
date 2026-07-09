# Entity Review — Consolidation & Verification State

last_tick: 2026-06-16 (autonomous run while user away ~2h)
status: BLOCKED (consolidation + verification COMPLETE; awaiting user decisions D-A..D-G before any write)
current_task: DONE — 5 cohorts verified, master synthesized at scripts/wip/corrections/MASTER-corrections.md. No DB writes.
project_dir: /Users/chad/Dropbox/Public/JS/Projects/siftersearch.com

## RESULT (autonomous run complete)
- 5 cohort correction files written to scripts/wip/corrections/ (gpb, db-nayriz-tabarsi, db-zanjan-babarc, works, db-roster-attribution) + MASTER-corrections.md (executive synthesis + decision agenda). ~370 ops, all entity_ids verified live.
- KEY FINDINGS:
  1. SCOPE SHIFT — sidecar is MISSING ~60+ seed-cast figures (never extracted); MD "dump NNN" ids are legacy, not live. Big CREATE component, not just cleanup.
  2. TWO primary-text REVERSALS of the error catalogue: Siyyid Káẓim-i-Zanjání is NOT an artifact (para_568, do NOT drop); "Amír Arslán Khán son of the Sálár" (1060805) is the Khurásán rebel, FIREWALL from Majdu'd-Dawlih (do NOT merge). Both NEEDS-USER.
  3. Test Qs answered: Ṭabarsí betrayer = Mírzá Ḥusayn-i-Mutavallíy-i-Qumí (fort→desert→Bárfurúsh, CREATE); ‘Abdu'l-Khaliq = split 641532 into Iṣfahání/Yazdí/son-of-Qani.
  4. Pervasive: all keepers have empty descriptions; image alt-text pseudo-persons (613854/613760) DROP; titles/collectives/pronouns as persons; section author misattribution (Townshend 621842 has 0 links in 21308; Nabíl fragmented ≥7 ids).
- BLOCKED on user decisions D-A (CREATE scope) · D-B (2 reversals) · D-C (Nabíl keeper-merge) · D-D (Bayán modeling) · D-E (Sang-Sar survivor contradiction) · D-F (per-cohort ambiguous) · D-G (sidecar WRITE-PATH — blocks all application). See MASTER-corrections.md.

## HARD CONSTRAINTS (never violate, esp. subagents)
- READ-ONLY against prod tower-nas: `sqlite3 data/sifter.db` SELECT only; may `ATTACH 'data/graph.db'` read-only; Meili via curl search. **NO INSERT/UPDATE/DELETE, NO file creation on tower-nas, NO pkill/kill/pm2 (shared prod box).**
- **NO DB writes anywhere** until user returns and approves. Produce the correction set ONLY.
- Methodology = `.claude/skills/entity-research/SKILL.md` (read it). Key rules: per-section attribution read from signatures (backward-resolved in verification); 4 roles/para (narrator/speaker/source/citation); quote provenance; bare-name salience+recency (merge-by-default, split only on contrary context); titles/collectives/pronouns are NOT person entities; grounded text is fallible.

## DATA TOPOLOGY (the de-confusion)
- ONE canonical entity table: `graph_entities` (+`graph_relations`) lives in **sifter.db** (632K, noisy). KEEP & CLEAN.
- Canonical mention/role layer = **graph.db sidecar**: `entity_mentions`(101K), `entity_aliases`(40K), `paragraph_roles`(40K), `paragraph_extractions`, quote tables. Points at sifter.db `graph_entities.id`. CORRECT it.
- LEGACY (retire, do not salvage): OLD `entity_mentions`(112K)/`entity_aliases`(17K)/`graph_relations` in sifter.db — pre-pipeline auto-NER, superseded by sidecar.
- MD files = the human-verified CORRECTION SCRIPT (not data to import). Each finding -> an operation.

## REFERENCE FACTS
- doc_id 21308 = The Dawn-Breakers (canonical, source_url oceanlibrary.com/dawn-breakers_nabil); 21310 = God Passes By.
- entity roster (sidecar mentions) query pattern:
  `sqlite3 data/sifter.db 'ATTACH "data/graph.db" AS g; SELECT ge.id, ge.entity_type, ge.canonical_name, COUNT(*) m FROM g.entity_mentions em JOIN content c ON c.id=CAST(em.content_id AS INTEGER) JOIN graph_entities ge ON ge.id=em.entity_id WHERE c.doc_id=21308 GROUP BY ge.id ORDER BY m DESC;'`
- Meili: KEY=$(grep -hE "^(MEILISEARCH_KEY|MEILI_MASTER_KEY)=" .env .env-secrets | head -1 | cut -d= -f2- | tr -d '"'); POST localhost:7700/indexes/paragraphs/search ; hit `id` == content.id ; filter `"doc_id IN [21308]"`. external_para_id only in SQLite (citation).
- content_id in entity tables is TEXT (CAST to INTEGER to join content.id).

## LOCKED Dawn-Breakers section->author map (read from signatures)
- pi 5 dedication -> Shoghi Effendi
- pi 6-65 Introduction + Persia survey (A-D, Conclusion) -> George Townshend (grounding wrongly said Shoghi Effendi — FIX)
- pi 66-72 Extracts from Kitab-i-Iqan -> quoted Baha'u'llah
- pi 73-84 reference notes -> editorial/Shoghi Effendi
- pi 85-87 Acknowledgment -> Shoghi Effendi (signed "— The Translator")
- pi 88-92 Preface -> Nabil (signed "Muhammad-i-Zarandi, Akka 1305 A.H.")
- pi 93-1207 body -> Nabil
- pi 1208-1223 Epilogue -> Shoghi Effendi (3rd-person retrospective on Nabil)
- Preface names Nabil's informants (informed-by rels): Mirza Ahmad-i-Qazvini, Siyyid Isma'il-i-Dhabih, Shaykh Hasan-i-Zunuzi, Shaykh Abu-Turab-i-Qazvini, Mirza Musa (Aqay-i-Kalim).

## ERROR CATALOGUE (verified this session — must be fixed)
- 3 distinct Abdu'l-Khaliqs conflated: Abdu'l-Khaliq-i-Isfahani (Badasht, cut his throat, forsook Faith) != Mulla Abdu'l-Khaliq-i-Yazdi (Shaykhi scholar) != Abdu'l-Khaliq son of Mulla Abdu'l-Qani. Current blurry entity 641532 "Abd al-Khaliq" (no description).
- the Bab fragmented: 1219258 "the Bab"(506) + 1219478 "Bab"(9) + 613854 "Bab"(4).
- Mujtahid x2 (617083/21, 1220865/6) = title, not person. Imam-Jum'ih/Mufti/farrash-bashi/King/Leader/Amir(bare) = titles. Mullas/Mujtahids/Imams/Kurds/Apostles of Old = collectives. Himself/His Name/Brother/Family = pronoun artifacts.
- Bad alias: "Mulla Husayn-i-Zanjani" wrongly on Mulla Husayn-i-Bushru'i (1219326); "the Beloved Siyyid, the exalted Husayn" suspect.
- Mulla Baqir (628263/9) — MERGE-candidate into Mulla Baqir-i-Tabrizi (620166) by default; split only if context shows Qa'ini/Bushru'i/etc.

## CORRECTION-SET OUTPUT SCHEMA (one row per operation)
Each op: TYPE | targets (entity_ids/canonical) | result | EVIDENCE (verifying paragraph cid/citation + reasoning) | confidence | NEEDS-USER? (Y/N)
TYPEs: MERGE(keeper<-[ids]) · SPLIT(id->[new by nisba/context]) · RETYPE(id person->title/concept) · DROP(id collective/pronoun) · ALIAS-ADD(entity<-surface) · ALIAS-REMOVE(entity-/-surface) · DESCRIBE(entity<-bio) · FIREWALL(idA!=idB, why) · ATTRIBUTE(section/para-range->author; or quote->speaker) · RELATE(A->rel->B)

## COHORT ASSIGNMENTS (parallel verification subagents -> write to scripts/wip/corrections/<cohort>.md)
1. GPB: gpb-seed-ANCHOR.md + gpb-enrichment-{INDEX,circle,rulers,western,events,works}.md -> corrections/gpb.md
2. DB-Nayriz+Tabarsi: dawnbreakers-nayriz.md + dawnbreakers-tabarsi.md -> corrections/db-nayriz-tabarsi.md
3. DB-Zanjan+BabArc+HardCases: dawnbreakers-zanjan.md + dawnbreakers-bab-arc.md + dawnbreakers-HARD-CASES.md + dawnbreakers-hardcase-research.md -> corrections/db-zanjan-babarc.md
4. Works: bab-works-{catalog,curiosities-verified,flagK-incipit}.md + bahaullah-works-doclinks.md + dawnbreakers-bab-works{,-DEEP}.md + bab-seed-{founders,letters,heroes-antagonists}.md -> corrections/works.md
5. DB live-roster cleanup + section attribution: the 964-entity DB roster (titles/collectives/pronouns/dup-fragments) + section->author map above -> corrections/db-roster-attribution.md

## NEXT STEPS
1. [doing] Spawn 5 read-only verification subagents (above) -> per-cohort correction files.
2. Synthesize into master scripts/wip/corrections/MASTER-corrections.md (deduped, ordered, NEEDS-USER flagged).
3. Sidecar write-path question stays OPEN for user (how to apply ops to graph.db + graph_entities via single-writer) — do NOT resolve by writing.
4. On user return: present MASTER set for approval BEFORE any writes.

## COMPLETED THIS SESSION (context)
- Methodology fully captured in entity-research SKILL.md.
- search.js first-party gate coded (undeployed). graph.js /entity/:id/dossier endpoint coded (undeployed).
- New memory: feedback_research_api_over_raw_sql.md.
